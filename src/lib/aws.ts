/**
 * VIGILORA Server-Side AWS SDK Configuration
 *
 * This module initializes and exports singleton clients for DynamoDB DocumentClient
 * and S3Client, configured with eu-north-1 and AWS CLI console login credentials.
 *
 * NOTE: This module must ONLY be imported in server-side contexts (API Route Handlers,
 * Server Actions, or server utilities). Never import this file into React client components.
 */

if (typeof window !== "undefined") {
  throw new Error("VIGILORA AWS SDK module can only be executed in a server-side environment.");
}

import { DynamoDBClient, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { fromLoginCredentials, fromNodeProviderChain } from "@aws-sdk/credential-providers";

// 1. Environment & Configuration Constants
export const AWS_REGION = process.env.AWS_REGION || "eu-north-1";
export const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE || "VIGILORA-Main";
export const S3_BUCKET = process.env.S3_BUCKET || "vigilora-evidence-399527676157-eu-north-1-an";
export const DEFAULT_CAMPUS_ID = process.env.VIGILORA_CAMPUS_ID || "CAMPUS#METROPOLIS";

// 2. Credential Resolution Strategy
// Prioritizes AWS CLI login credentials (aws login) with fallback to standard Node credential chain (env vars, IAM roles)
const getCredentialsProvider = () => {
  const loginProvider = fromLoginCredentials();
  const defaultChain = fromNodeProviderChain();

  return async () => {
    try {
      return await loginProvider();
    } catch {
      return await defaultChain();
    }
  };
};

export const credentialsProvider = getCredentialsProvider();

// 3. Low-level DynamoDB Client
export const dynamoDbClient = new DynamoDBClient({
  region: AWS_REGION,
  credentials: credentialsProvider,
});

// 4. Document Client with Marshalling Options
export const docClient = DynamoDBDocumentClient.from(dynamoDbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

// 5. S3 Client
export const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: credentialsProvider,
});

// 5.5. STS Client for Identity Verification
export const stsClient = new STSClient({
  region: AWS_REGION,
  credentials: credentialsProvider,
});

// 6. Partition Key Helpers
export function getCampusPartitionKey(campusId?: string): string {
  if (!campusId) return DEFAULT_CAMPUS_ID;
  return campusId.startsWith("CAMPUS#") ? campusId : `CAMPUS#${campusId}`;
}

// 7. Health Check Verification Utility
export interface AwsHealthCheckResult {
  status: "healthy" | "unhealthy";
  region: string;
  dynamoDb: {
    table: string;
    status?: string;
    accessible: boolean;
    error?: string;
  };
  s3: {
    bucket: string;
    accessible: boolean;
    error?: string;
  };
  timestamp: string;
}

export async function checkAwsHealth(): Promise<AwsHealthCheckResult> {
  let dynamoAccessible = false;
  let dynamoStatus: string | undefined = undefined;
  let dynamoError: string | undefined = undefined;

  let s3Accessible = false;
  let s3Error: string | undefined = undefined;

  // Test DynamoDB connectivity
  try {
    const tableInfo = await dynamoDbClient.send(
      new DescribeTableCommand({ TableName: DYNAMODB_TABLE })
    );
    dynamoStatus = tableInfo.Table?.TableStatus;
    dynamoAccessible = dynamoStatus === "ACTIVE";
  } catch (err: unknown) {
    dynamoError = err instanceof Error ? err.message : "Failed to describe DynamoDB table";
  }

  // Test S3 connectivity
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
    s3Accessible = true;
  } catch (err: unknown) {
    s3Error = err instanceof Error ? err.message : "Failed to access S3 bucket";
  }

  const isHealthy = dynamoAccessible && s3Accessible;

  return {
    status: isHealthy ? "healthy" : "unhealthy",
    region: AWS_REGION,
    dynamoDb: {
      table: DYNAMODB_TABLE,
      status: dynamoStatus,
      accessible: dynamoAccessible,
      ...(dynamoError ? { error: dynamoError } : {}),
    },
    s3: {
      bucket: S3_BUCKET,
      accessible: s3Accessible,
      ...(s3Error ? { error: s3Error } : {}),
    },
    timestamp: new Date().toISOString(),
  };
}

