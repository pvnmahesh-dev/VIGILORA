/**
 * VIGILORA Cryptographic Authentication Primitives
 *
 * Implements password hashing via node:crypto scrypt with random salts,
 * constant-time verification to prevent timing attacks, and 256-bit
 * cryptographically random session tokens with SHA-256 storage hashing.
 */

if (typeof window !== "undefined") {
  throw new Error("VIGILORA auth-crypto module can only be executed in a server-side environment.");
}

import crypto from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(crypto.scrypt);

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

/**
 * Hashes a plaintext password using scrypt with a unique random 16-byte salt.
 * Returns format: "<salt_hex>:<derived_key_hex>"
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || typeof password !== "string" || password.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }

  const salt = crypto.randomBytes(SALT_BYTES).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, SCRYPT_KEYLEN)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verifies a plaintext password against a stored salt:hash string using constant-time comparison.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash || typeof password !== "string" || typeof storedHash !== "string") {
    return false;
  }

  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;

  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;

  try {
    const keyBuffer = Buffer.from(keyHex, "hex");
    const derivedKey = (await scryptAsync(password, salt, keyBuffer.length)) as Buffer;

    if (keyBuffer.length !== derivedKey.length) {
      return false;
    }

    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

/**
 * Generates a 256-bit cryptographically random session token for the client,
 * and a SHA-256 hash of that token for persistent storage in DynamoDB.
 */
export function generateSessionToken(): { plainToken: string; tokenHash: string } {
  const plainToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(plainToken);
  return { plainToken, tokenHash };
}

/**
 * Returns the SHA-256 hex digest of a session token.
 * Only this hash is persisted to the database; the plain token is held exclusively by the client.
 */
export function hashToken(plainToken: string): string {
  return crypto.createHash("sha256").update(plainToken, "utf8").digest("hex");
}

