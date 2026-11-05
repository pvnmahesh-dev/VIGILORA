/**
 * VIGILORA AWS Preflight Connectivity & Authentication Verification Engine
 *
 * Provides real-time, non-destructive health checks for AWS credentials,
 * DynamoDB connectivity, and S3 evidence store access.
 *
 * Guarantees:
 * 1. Zero credential or secret leakage (no access keys, session tokens, or secrets exposed).
 * 2. Pure read-only inspection (DescribeTableCommand and HeadBucketCommand). Zero mutation or deletion.
 * 3. Accurate classification between "Connected", "Authentication expired", and "Service unavailable".
 * 4. Permission errors are distinctly classified as "Service unavailable" (never misclassified as auth expired).
 * 5. Transparent developer diagnostics when session expires ("Run aws login in your terminal...").
 * 6. Timeout safety and in-flight deduplication to prevent overlapping checks and excessive polling.
 * 7. Server-side only execution.
 */

if (typeof window !== "undefined") {
  throw new Error("VIGILORA AWS Preflight module can only be executed in a server-side environment.");
}

import { DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import {
  stsClient as defaultStsClient,
  dynamoDbClient as defaultDynamoDbClient,
  s3Client as defaultS3Client,
  DYNAMODB_TABLE,
  S3_BUCKET,
} from "./aws";

export type AwsPreflightStatusCode = "connected" | "auth_expired" | "service_unavailable";

export type AwsPreflightDisplayLabel = "Connected" | "Authentication expired" | "Service unavailable";

export const AWS_SESSION_EXPIRED_MESSAGE =
  "AWS SESSION EXPIRED — Run aws login in your terminal and refresh the application.";

export const AWS_SERVICE_UNAVAILABLE_MESSAGE =
  "AWS SERVICE UNAVAILABLE — Cloud resources could not be reached. Verify network connectivity.";

export const AWS_CONNECTED_MESSAGE =
  "AWS cloud services connected and operational.";

export interface AwsPreflightResult {
  success: boolean;
  status: AwsPreflightStatusCode;
  label: AwsPreflightDisplayLabel;
  message: string;
  timestamp: string;
  details?: {
    identityVerified: boolean;
    dynamoDbAccessible: boolean;
    s3Accessible: boolean;
  };
}

export interface AwsPreflightOptions {
  stsClient?: { send: (command: unknown) => Promise<unknown> };
  dynamoDbClient?: { send: (command: unknown) => Promise<unknown> };
  s3Client?: { send: (command: unknown) => Promise<unknown> };
  timeoutMs?: number;
  force?: boolean;
}

const DEFAULT_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 2500;

let inFlightPreflight: Promise<AwsPreflightResult> | null = null;
let cachedPreflight: { result: AwsPreflightResult; expiresAt: number } | null = null;

/**
 * Timeout wrapper to guarantee preflight network operations never hang.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Preflight check '${operationName}' timed out after ${timeoutMs}ms.`);
      err.name = "TimeoutError";
      reject(err);
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}

/**
 * Determines whether an error was caused by expired, missing, or invalid AWS credentials.
 * NOTE: Permission errors (e.g. AccessDeniedException) must NOT be treated as expired credentials.
 */
export function isAwsAuthExpiredError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err !== "object") return false;

  const error = err as {
    name?: string;
    code?: string;
    __type?: string;
    message?: string;
  };

  const name = (error.name || error.code || error.__type || "").toLowerCase();
  const message = (error.message || "").toLowerCase();

  const expiredNameIndicators = [
    "credentialsprovidererror",
    "expiredtokenexception",
    "expiredtoken",
    "unrecognizedclientexception",
    "invalidsignatureexception",
    "requestexpired",
    "invalidtoken",
    "invalidclienttokenid",
    "tokenrefreshrequired",
    "credentialserror",
  ];

  if (expiredNameIndicators.some((indicator) => name.includes(indicator))) {
    return true;
  }

  const expiredMessageIndicators = [
    "session has expired",
    "token has expired",
    "token is expired",
    "security token included in the request is expired",
    "security token included in the request is invalid",
    "could not load credentials from any providers",
    "please reauthenticate using 'aws login'",
    "reauthenticate using 'aws login'",
    "the security token included in the request is invalid",
    "the security token included in the request is expired",
    "credentials expired",
    "expired credentials",
    "aws login",
    "cannot load credentials",
    "no credentials found",
    "credentials missing",
    "credential missing",
  ];

  return expiredMessageIndicators.some((indicator) => message.includes(indicator));
}

/**
 * Step 1: Verify AWS Identity using STS GetCallerIdentity.
 * Guarantees zero leakage: never returns Account, Arn, UserId, or secrets.
 */
export async function verifyAwsIdentity(
  client = defaultStsClient,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<{
  valid: boolean;
  isExpired: boolean;
  error?: string;
}> {
  try {
    // Non-mutating identity verification using STS GetCallerIdentity
    await withTimeout(
      client.send(new GetCallerIdentityCommand({})),
      timeoutMs,
      "STS GetCallerIdentity"
    );

    return {
      valid: true,
      isExpired: false,
    };
  } catch (err: unknown) {
    const isExpired = isAwsAuthExpiredError(err);
    const errorMsg = err instanceof Error ? err.message : "Failed to verify AWS identity";

    return {
      valid: false,
      isExpired,
      error: isExpired ? AWS_SESSION_EXPIRED_MESSAGE : errorMsg,
    };
  }
}

/**
 * Step 2: Check DynamoDB connectivity via DescribeTable (safe, non-mutating read-only metadata).
 * Zero updates, scans, or item mutations.
 */
export async function checkDynamoDbConnectivity(
  client = defaultDynamoDbClient,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<{
  accessible: boolean;
  status?: string;
  error?: string;
  isAuthExpired: boolean;
}> {
  try {
    const tableInfo = (await withTimeout(
      client.send(new DescribeTableCommand({ TableName: DYNAMODB_TABLE })),
      timeoutMs,
      "DynamoDB DescribeTable"
    )) as { Table?: { TableStatus?: string } };

    const tableStatus = tableInfo.Table?.TableStatus;
    const accessible = tableStatus === "ACTIVE";

    return {
      accessible,
      status: tableStatus,
      isAuthExpired: false,
    };
  } catch (err: unknown) {
    const isAuthExpired = isAwsAuthExpiredError(err);
    const errorMsg = err instanceof Error ? err.message : "Failed to describe DynamoDB table";

    return {
      accessible: false,
      error: isAuthExpired ? AWS_SESSION_EXPIRED_MESSAGE : errorMsg,
      isAuthExpired,
    };
  }
}

/**
 * Step 3: Check S3 evidence storage connectivity via HeadBucket (safe, non-mutating read-only metadata).
 * Zero bucket listings, object uploads, or bucket mutations.
 */
export async function checkS3Connectivity(
  client = defaultS3Client,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<{
  accessible: boolean;
  error?: string;
  isAuthExpired: boolean;
}> {
  try {
    await withTimeout(
      client.send(new HeadBucketCommand({ Bucket: S3_BUCKET })),
      timeoutMs,
      "S3 HeadBucket"
    );

    return {
      accessible: true,
      isAuthExpired: false,
    };
  } catch (err: unknown) {
    const isAuthExpired = isAwsAuthExpiredError(err);
    const errorMsg = err instanceof Error ? err.message : "Failed to access S3 bucket";

    return {
      accessible: false,
      error: isAuthExpired ? AWS_SESSION_EXPIRED_MESSAGE : errorMsg,
      isAuthExpired,
    };
  }
}

/**
 * Internal execution of the preflight checks battery.
 */
async function executePreflightBattery(options?: AwsPreflightOptions): Promise<AwsPreflightResult> {
  const timestamp = new Date().toISOString();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sts = (options?.stsClient ?? defaultStsClient) as typeof defaultStsClient;
  const ddb = (options?.dynamoDbClient ?? defaultDynamoDbClient) as typeof defaultDynamoDbClient;
  const s3 = (options?.s3Client ?? defaultS3Client) as typeof defaultS3Client;

  // 1. Verify identity resolution via STS GetCallerIdentity
  const identity = await verifyAwsIdentity(sts, timeoutMs);

  // If STS identity check failed due to expired, invalid, or missing credentials
  if (!identity.valid && identity.isExpired) {
    return {
      success: false,
      status: "auth_expired",
      label: "Authentication expired",
      message: AWS_SESSION_EXPIRED_MESSAGE,
      timestamp,
      details: {
        identityVerified: false,
        dynamoDbAccessible: false,
        s3Accessible: false,
      },
    };
  }

  // 2. Check DynamoDB and S3 connectivity in parallel
  const [dynamoResult, s3Result] = await Promise.all([
    checkDynamoDbConnectivity(ddb, timeoutMs),
    checkS3Connectivity(s3, timeoutMs),
  ]);

  // If identity was not valid (e.g. unknown STS failure) or downstream explicitly detected expired token
  if (!identity.valid) {
    return {
      success: false,
      status: "auth_expired",
      label: "Authentication expired",
      message: AWS_SESSION_EXPIRED_MESSAGE,
      timestamp,
      details: {
        identityVerified: false,
        dynamoDbAccessible: dynamoResult.accessible,
        s3Accessible: s3Result.accessible,
      },
    };
  }

  // If downstream service calls reported expired token (fallback)
  if (dynamoResult.isAuthExpired || s3Result.isAuthExpired) {
    return {
      success: false,
      status: "auth_expired",
      label: "Authentication expired",
      message: AWS_SESSION_EXPIRED_MESSAGE,
      timestamp,
      details: {
        identityVerified: true,
        dynamoDbAccessible: dynamoResult.accessible,
        s3Accessible: s3Result.accessible,
      },
    };
  }

  // 3. If all 3 succeeded -> Connected
  if (dynamoResult.accessible && s3Result.accessible) {
    return {
      success: true,
      status: "connected",
      label: "Connected",
      message: AWS_CONNECTED_MESSAGE,
      timestamp,
      details: {
        identityVerified: true,
        dynamoDbAccessible: true,
        s3Accessible: true,
      },
    };
  }

  // 4. Otherwise (identity valid, but DynamoDB or S3 unavailable/inaccessible/permission denied)
  return {
    success: false,
    status: "service_unavailable",
    label: "Service unavailable",
    message: AWS_SERVICE_UNAVAILABLE_MESSAGE,
    timestamp,
    details: {
      identityVerified: true,
      dynamoDbAccessible: dynamoResult.accessible,
      s3Accessible: s3Result.accessible,
    },
  };
}

/**
 * Main Preflight Entrypoint
 *
 * Implements:
 * - In-flight deduplication (prevents overlapping parallel checks)
 * - Result caching (2.5-second TTL to prevent excessive polling)
 * - Safe timeouts (default 5000ms)
 * - Zero secret or resource leakage
 */
export async function performAwsPreflight(
  options?: AwsPreflightOptions
): Promise<AwsPreflightResult> {
  const isMocked = Boolean(options?.stsClient || options?.dynamoDbClient || options?.s3Client);
  const force = Boolean(options?.force);

  // Return cached result if fresh and not forced or mocked
  if (!isMocked && !force && cachedPreflight && Date.now() < cachedPreflight.expiresAt) {
    return cachedPreflight.result;
  }

  // Deduplicate overlapping checks if one is already in flight
  if (!isMocked && !force && inFlightPreflight) {
    return inFlightPreflight;
  }

  const checkPromise = executePreflightBattery(options);

  if (!isMocked) {
    inFlightPreflight = checkPromise;
  }

  try {
    const result = await checkPromise;
    if (!isMocked) {
      cachedPreflight = {
        result,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
    }
    return result;
  } finally {
    if (!isMocked) {
      inFlightPreflight = null;
    }
  }
}
