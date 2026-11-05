/**
 * VIGILORA Server-Side Authentication & Session Verification
 *
 * Implements genuine server-side authentication using DynamoDB and Node.js native crypto:
 * - Passwords hashed via scrypt with unique salts
 * - Only SHA-256 hashed session tokens stored in DynamoDB
 * - HttpOnly, SameSite=Lax, Secure session cookies
 * - Real server-side session expiration, revocation
 * - DynamoDB-backed persistent rate limiting (IP & account levels)
 * - Atomic conditional user provisioning (no overwrites)
 * - RBAC permission matrix for Supervisor, Dispatcher, Responder, and Reporter
 * - CSRF / Origin protection for state-changing requests
 */

if (typeof window !== "undefined") {
  throw new Error("VIGILORA auth module can only be executed in a server-side environment.");
}

import { NextResponse } from "next/server";
import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient, DYNAMODB_TABLE, getCampusPartitionKey } from "./aws";
import { isAwsAuthExpiredError, AWS_SESSION_EXPIRED_MESSAGE } from "./aws-preflight";
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashToken,
} from "./auth-crypto";

export { hashPassword, verifyPassword, generateSessionToken, hashToken };

export type UserRole = "Supervisor" | "Dispatcher" | "Responder" | "Reporter";

export function toActorRole(
  role: UserRole
): "System AI" | "Dispatcher" | "Field Responder" | "Reporter" | "Supervisor" {
  if (role === "Responder") return "Field Responder";
  return role;
}

export interface AuthenticatedUser {
  email: string;
  name: string;
  role: UserRole;
  callsign?: string;
  teamId?: string;
  campusId: string;
}

export interface UserRecord extends AuthenticatedUser {
  passwordHash: string;
  failedLoginAttempts: number;
  lockoutUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  tokenHash: string;
  email: string;
  name: string;
  role: UserRole;
  callsign?: string;
  teamId?: string;
  campusId: string;
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
  revokedAt?: string;
}

// Session Cookie Configuration
export const SESSION_COOKIE_NAME = "vigilora_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export function getSessionCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

// ---------------------------------------------------------------------------
// DynamoDB-Backed Persistent Rate Limiting
// Survives server restarts and distributes across multiple instances.
// Protects both client IP and user account to prevent denial-of-service lockouts.
// ---------------------------------------------------------------------------
const MAX_FAILED_PER_USER = 5;
const MAX_FAILED_PER_IP = 10;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function checkRateLimit(
  email: string,
  clientIp: string,
  campusId?: string
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const now = Date.now();
  const campusPk = getCampusPartitionKey(campusId);
  const ipHash = hashToken(clientIp).slice(0, 16);

  // 1. Check IP rate limit
  try {
    const ipRes = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: { pk: campusPk, sk: `RATELIMIT#IP#${ipHash}` },
      })
    );
    const ipItem = ipRes.Item;
    if (ipItem?.lockedUntil && ipItem.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil((ipItem.lockedUntil - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }
  } catch {
    // If rate limit check fails, proceed to next check
  }

  // 2. Check User rate limit
  try {
    const userRes = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: { pk: campusPk, sk: `RATELIMIT#USER#${email}` },
      })
    );
    const userItem = userRes.Item;
    if (userItem?.lockedUntil && userItem.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil((userItem.lockedUntil - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }
  } catch {
    // Fail open if DynamoDB read encounters a transient issue
  }

  return { allowed: true };
}

export async function recordFailedLogin(
  email: string,
  clientIp: string,
  campusId?: string
): Promise<void> {
  const now = Date.now();
  const campusPk = getCampusPartitionKey(campusId);
  const ipHash = hashToken(clientIp).slice(0, 16);

  async function recordForSk(sk: string, maxAttempts: number) {
    try {
      const existing = await docClient.send(
        new GetCommand({
          TableName: DYNAMODB_TABLE,
          Key: { pk: campusPk, sk },
        })
      );

      const item = existing.Item;
      const isWindowExpired = !item || now - (item.firstAttempt || 0) > LOCKOUT_WINDOW_MS;
      const isLockoutExpired = item?.lockedUntil && now > item.lockedUntil;

      if (isWindowExpired || isLockoutExpired) {
        await docClient.send(
          new PutCommand({
            TableName: DYNAMODB_TABLE,
            Item: {
              pk: campusPk,
              sk,
              attempts: 1,
              firstAttempt: now,
              lockedUntil: null,
              entityType: "RATELIMIT",
            },
          })
        );
      } else {
        const newAttempts = (item.attempts || 0) + 1;
        const shouldLock = newAttempts >= maxAttempts;
        const lockedUntil = shouldLock ? now + LOCKOUT_WINDOW_MS : null;

        await docClient.send(
          new UpdateCommand({
            TableName: DYNAMODB_TABLE,
            Key: { pk: campusPk, sk },
            UpdateExpression: "SET attempts = :att, lockedUntil = :lock, updatedAt = :now",
            ExpressionAttributeValues: {
              ":att": newAttempts,
              ":lock": lockedUntil,
              ":now": now,
            },
          })
        );
      }
    } catch {
      // Non-blocking rate limit update error
    }
  }

  await Promise.allSettled([
    recordForSk(`RATELIMIT#USER#${email}`, MAX_FAILED_PER_USER),
    recordForSk(`RATELIMIT#IP#${ipHash}`, MAX_FAILED_PER_IP),
  ]);
}

export async function resetRateLimits(
  email: string,
  clientIp: string,
  campusId?: string
): Promise<void> {
  const campusPk = getCampusPartitionKey(campusId);
  const ipHash = hashToken(clientIp).slice(0, 16);

  await Promise.allSettled([
    docClient.send(
      new DeleteCommand({
        TableName: DYNAMODB_TABLE,
        Key: { pk: campusPk, sk: `RATELIMIT#USER#${email}` },
      })
    ),
    docClient.send(
      new DeleteCommand({
        TableName: DYNAMODB_TABLE,
        Key: { pk: campusPk, sk: `RATELIMIT#IP#${ipHash}` },
      })
    ),
  ]);
}

// ---------------------------------------------------------------------------
// CSRF & Origin Verification
// ---------------------------------------------------------------------------
export function verifyCsrf(request: Request): boolean {
  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return true;
  }

  const host = request.headers.get("host") || "";
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  // Validate Origin header
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === host) return true;
    } catch {
      return false;
    }
  }

  // Validate Referer header
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.host === host) return true;
    } catch {
      return false;
    }
  }

  // Allow explicit programmatic testing client header in non-production
  if (
    process.env.NODE_ENV !== "production" &&
    request.headers.get("x-vigilora-test-client") === "active-test-suite"
  ) {
    return true;
  }

  // Allow direct localhost development calls if host is localhost
  if (!origin && !referer && host.startsWith("localhost")) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Role-Based Permissions Matrix
// ---------------------------------------------------------------------------
export const ROLE_PERMISSIONS: Record<UserRole, readonly string[]> = {
  Supervisor: [
    "health:view",
    "incidents:read",
    "incidents:create",
    "incidents:update",
    "incidents:resolve",
    "incidents:assign",
    "teams:read",
    "teams:update",
    "teams:manage",
    "activities:read",
    "settings:read",
    "settings:update",
    "evidence:upload",
    "evidence:read",
    "users:manage",
  ],
  Dispatcher: [
    "incidents:read",
    "incidents:create",
    "incidents:update",
    "incidents:resolve",
    "incidents:assign",
    "teams:read",
    "teams:update",
    "activities:read",
    "settings:read",
    "evidence:upload",
    "evidence:read",
  ],
  Responder: [
    "incidents:read",
    "incidents:update",
    "teams:read",
    "teams:update_telemetry",
    "evidence:upload",
    "evidence:read",
  ],
  Reporter: [
    "incidents:create",
    "evidence:upload",
  ],
} as const;

export function hasPermission(role: UserRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

// ---------------------------------------------------------------------------
// User Provisioning (Atomic Conditional Writes, No Silent Overwriting)
// ---------------------------------------------------------------------------
export async function provisionUser(params: {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  callsign?: string;
  teamId?: string;
  campusId?: string;
}): Promise<{ user: AuthenticatedUser; created: boolean; message: string }> {
  const email = params.email.trim().toLowerCase();
  const campusPk = getCampusPartitionKey(params.campusId);
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(params.password);

  const userRecord: UserRecord = {
    email,
    name: params.name.trim(),
    role: params.role,
    callsign: params.callsign?.trim() || undefined,
    teamId: params.teamId?.trim() || undefined,
    campusId: campusPk,
    passwordHash,
    failedLoginAttempts: 0,
    lockoutUntil: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    // Atomic conditional write: will FAIL if user already exists
    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          pk: campusPk,
          sk: `USER#${email}`,
          ...userRecord,
          entityType: "USER",
        },
        ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
      })
    );

    return {
      user: {
        email: userRecord.email,
        name: userRecord.name,
        role: userRecord.role,
        callsign: userRecord.callsign,
        teamId: userRecord.teamId,
        campusId: userRecord.campusId,
      },
      created: true,
      message: `User account for [${email}] successfully provisioned with role [${params.role}].`,
    };
  } catch (err: unknown) {
    const errorName = (err as { name?: string })?.name;
    if (errorName === "ConditionalCheckFailedException") {
      // Existing account detected - fetch existing record to report safely without overwriting
      const existing = await docClient.send(
        new GetCommand({
          TableName: DYNAMODB_TABLE,
          Key: { pk: campusPk, sk: `USER#${email}` },
        })
      );

      const existingRole = (existing.Item?.role as UserRole) || "Unknown";
      return {
        user: {
          email,
          name: (existing.Item?.name as string) || params.name,
          role: existingRole,
          callsign: existing.Item?.callsign as string | undefined,
          teamId: (existing.Item?.teamId as string | undefined) || params.teamId,
          campusId: campusPk,
        },
        created: false,
        message: `Account [${email}] already exists with role [${existingRole}]. Existing credentials were preserved and not modified.`,
      };
    }

    throw err;
  }
}

export async function authenticateUser(
  emailInput: string,
  passwordInput: string,
  clientIp = "unknown"
): Promise<{ user: AuthenticatedUser } | { error: string; statusCode: number }> {
  const email = emailInput.trim().toLowerCase();

  // Persistent DynamoDB rate limit check
  const rateCheck = await checkRateLimit(email, clientIp);
  if (!rateCheck.allowed) {
    return {
      error: `Too many failed login attempts. Please try again in ${rateCheck.retryAfterSeconds} seconds.`,
      statusCode: 429,
    };
  }

  const campusPk = getCampusPartitionKey();

  let userItem: Record<string, unknown> | undefined;
  try {
    const res = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          pk: campusPk,
          sk: `USER#${email}`,
        },
      })
    );
    userItem = res.Item;
  } catch (err: unknown) {
    if (isAwsAuthExpiredError(err)) {
      return {
        error: AWS_SESSION_EXPIRED_MESSAGE,
        statusCode: 503,
      };
    }
    return {
      error: "Authentication service temporarily unavailable. Please try again.",
      statusCode: 503,
    };
  }

  // Generic failure if user not found (no user enumeration)
  if (!userItem || !userItem.passwordHash) {
    await recordFailedLogin(email, clientIp);
    return {
      error: "Invalid credentials. Please verify your email and passkey.",
      statusCode: 401,
    };
  }

  // Verify password using scrypt and constant-time comparison
  const isValid = await verifyPassword(passwordInput, userItem.passwordHash as string);
  if (!isValid) {
    await recordFailedLogin(email, clientIp);
    return {
      error: "Invalid credentials. Please verify your email and passkey.",
      statusCode: 401,
    };
  }

  // Success: reset rate limit tracking in DynamoDB
  await resetRateLimits(email, clientIp);

  const teamId =
    (userItem.teamId as string | undefined) ||
    (userItem.email === "responder@demo.vigilora.internal" ? "MED-01" : undefined);

  return {
    user: {
      email: userItem.email as string,
      name: userItem.name as string,
      role: userItem.role as UserRole,
      callsign: userItem.callsign as string | undefined,
      teamId,
      campusId: campusPk,
    },
  };
}

// ---------------------------------------------------------------------------
// Session Management (Hashed Token Storage)
// ---------------------------------------------------------------------------
export async function createSession(
  user: AuthenticatedUser
): Promise<{ plainToken: string; expiresAt: string }> {
  const { plainToken, tokenHash } = generateSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
  const teamId =
    user.teamId ||
    (user.email === "responder@demo.vigilora.internal" ? "MED-01" : undefined);

  const sessionRecord: SessionRecord = {
    tokenHash,
    email: user.email,
    name: user.name,
    role: user.role,
    callsign: user.callsign,
    teamId,
    campusId: user.campusId,
    createdAt: now.toISOString(),
    expiresAt,
    revoked: false,
  };

  await docClient.send(
    new PutCommand({
      TableName: DYNAMODB_TABLE,
      Item: {
        pk: user.campusId,
        sk: `SESSION#${tokenHash}`,
        ...sessionRecord,
        entityType: "SESSION",
      },
    })
  );

  return { plainToken, expiresAt };
}

export async function revokeSession(plainToken: string, campusId?: string): Promise<boolean> {
  if (!plainToken) return false;
  const tokenHash = hashToken(plainToken);
  const campusPk = getCampusPartitionKey(campusId);

  try {
    await docClient.send(
      new UpdateCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          pk: campusPk,
          sk: `SESSION#${tokenHash}`,
        },
        UpdateExpression: "SET revoked = :true, revokedAt = :now",
        ExpressionAttributeValues: {
          ":true": true,
          ":now": new Date().toISOString(),
        },
      })
    );
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Request Session Extraction & Verification
// ---------------------------------------------------------------------------
export function extractTokenFromRequest(request: Request): string | null {
  // 1. Try Cookie header
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    const sessionCookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    if (sessionCookie) {
      const val = sessionCookie.split("=")[1];
      if (val) return decodeURIComponent(val);
    }
  }

  // 2. Try Authorization: Bearer <plainToken>
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const val = authHeader.substring(7).trim();
    if (val) return val;
  }

  return null;
}

export async function verifySessionFromRequest(
  request: Request
): Promise<{ user: AuthenticatedUser; plainToken: string } | null> {
  const plainToken = extractTokenFromRequest(request);
  if (!plainToken) return null;

  const tokenHash = hashToken(plainToken);
  const campusPk = getCampusPartitionKey();

  try {
    const res = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          pk: campusPk,
          sk: `SESSION#${tokenHash}`,
        },
      })
    );

    const session = res.Item as SessionRecord | undefined;
    if (!session) return null;

    // Check if explicitly revoked
    if (session.revoked) return null;

    // Check expiration timestamp
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      return null;
    }

    const teamId =
      session.teamId ||
      (session.email === "responder@demo.vigilora.internal" ? "MED-01" : undefined);

    return {
      user: {
        email: session.email,
        name: session.name,
        role: session.role,
        callsign: session.callsign,
        teamId,
        campusId: session.campusId,
      },
      plainToken,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Protected Route Authentication Guard
// ---------------------------------------------------------------------------
export async function authenticateRequest(
  request: Request,
  allowedRoles?: UserRole[]
): Promise<{ user: AuthenticatedUser; plainToken: string } | { errorResponse: NextResponse }> {
  // CSRF validation on non-safe methods
  if (!verifyCsrf(request)) {
    return {
      errorResponse: NextResponse.json(
        {
          success: false,
          error: "Forbidden. Invalid request origin.",
        },
        { status: 403 }
      ),
    };
  }

  const auth = await verifySessionFromRequest(request);
  if (!auth) {
    return {
      errorResponse: NextResponse.json(
        {
          success: false,
          error: "Authentication required. Active session credentials not found.",
        },
        { status: 401 }
      ),
    };
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(auth.user.role)) {
    return {
      errorResponse: NextResponse.json(
        {
          success: false,
          error: `Forbidden. Your role (${auth.user.role}) does not have permission to access this resource.`,
        },
        { status: 403 }
      ),
    };
  }

  return auth;
}
