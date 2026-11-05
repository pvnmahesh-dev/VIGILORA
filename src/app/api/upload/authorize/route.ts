import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { authenticateRequest } from "@/lib/auth";
import { s3Client, S3_BUCKET, docClient, DYNAMODB_TABLE } from "@/lib/aws";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  ALLOWED_EVIDENCE_MIME_TYPES,
  MAX_EVIDENCE_SIZE_BYTES,
  MIN_EVIDENCE_SIZE_BYTES,
  validateS3Key,
  sanitizeFilename,
} from "@/lib/validation";
import { AllowedEvidenceMimeType } from "@/types/evidence";


/**
 * POST /api/upload/authorize
 * Generates an S3 Presigned POST policy for direct browser-to-S3 evidence upload.
 *
 * Security:
 * - Requires verified server-side session authentication (Supervisor, Dispatcher, Responder, Reporter).
 * - Enforces CSRF / origin validation via authenticateRequest().
 * - Strictly validates that target incident exists within caller's campus partition.
 * - Enforces allowed image types (JPEG, PNG, WebP) and size limits (100 B to 10 MB).
 * - Generates unpredictable, collision-safe S3 object key on the server:
 *   evidence/<cleanCampus>/<cleanInc>/<timestamp>-<uuid>.<ext>
 * - Configures S3 policy conditions (content-length-range, Content-Type) enforced at S3 edge.
 * - Records short-lived authorization in DynamoDB to verify identity, ownership, and key at completion.
 */
export async function POST(request: Request) {
  const auth = await authenticateRequest(request, [
    "Supervisor",
    "Dispatcher",
    "Responder",
    "Reporter",
  ]);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request payload." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { success: false, error: "Request body must be a JSON object." },
      { status: 400 }
    );
  }

  const { incidentId, filename, mimeType, sizeBytes } = body as Record<string, unknown>;

  // 1. Validate incidentId
  if (!incidentId || typeof incidentId !== "string" || !incidentId.trim()) {
    return NextResponse.json(
      { success: false, error: "incidentId is required to associate evidence with an incident." },
      { status: 400 }
    );
  }
  const cleanIncidentId = incidentId.trim();

  // 2. Validate MIME type
  if (
    !mimeType ||
    typeof mimeType !== "string" ||
    !ALLOWED_EVIDENCE_MIME_TYPES.includes(mimeType as AllowedEvidenceMimeType)
  ) {
    return NextResponse.json(
      {
        success: false,
        error: `Unsupported media type "${mimeType}". Allowed formats: image/jpeg, image/png, image/webp.`,
      },
      { status: 415 }
    );
  }
  const validMime = mimeType as AllowedEvidenceMimeType;

  // 3. Validate size bounds (100 B to 10 MB)
  if (typeof sizeBytes !== "number" || sizeBytes < MIN_EVIDENCE_SIZE_BYTES) {
    return NextResponse.json(
      {
        success: false,
        error: `File is too small (${sizeBytes} bytes). Minimum allowed size is ${MIN_EVIDENCE_SIZE_BYTES} bytes.`,
      },
      { status: 400 }
    );
  }
  if (sizeBytes > MAX_EVIDENCE_SIZE_BYTES) {
    return NextResponse.json(
      {
        success: false,
        error: `File exceeds maximum allowed size of 10 MB (declared ${sizeBytes} bytes).`,
      },
      { status: 413 }
    );
  }

  // 4. Verify target incident exists in caller's campus
  try {
    const incRes = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          pk: auth.user.campusId,
          sk: `INCIDENT#${cleanIncidentId}`,
        },
      })
    );

    if (!incRes.Item) {
      return NextResponse.json(
        {
          success: false,
          error: `Incident "${cleanIncidentId}" was not found in campus. Evidence cannot be attached.`,
        },
        { status: 404 }
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to verify incident";
    return NextResponse.json(
      {
        success: false,
        error: "Failed to verify incident ownership.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }

  // 5. Generate safe S3 object key with timestamp prefix
  const cleanCampus = auth.user.campusId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const cleanInc = cleanIncidentId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const ext = validMime === "image/jpeg" ? "jpg" : validMime === "image/png" ? "png" : "webp";
  const uniqueSegment = `${Date.now()}-${crypto.randomUUID()}`;
  const s3Key = `evidence/${cleanCampus}/${cleanInc}/${uniqueSegment}.${ext}`;

  if (!validateS3Key(s3Key)) {
    return NextResponse.json(
      { success: false, error: "Failed to generate safe storage path." },
      { status: 500 }
    );
  }

  const safeFilename = sanitizeFilename(
    typeof filename === "string" ? filename : `evidence.${ext}`
  );
  const authId = `auth-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
  const evidenceId = `ev-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString(); // 5 minutes validity
  const ttlEpochSeconds = Math.floor(now.getTime() / 1000) + 15 * 60; // 15-minute DynamoDB TTL

  // 6. Generate S3 Presigned POST data
  let presignedPost: { url: string; fields: Record<string, string> };
  try {
    presignedPost = await createPresignedPost(s3Client, {
      Bucket: S3_BUCKET,
      Key: s3Key,
      Conditions: [
        ["content-length-range", MIN_EVIDENCE_SIZE_BYTES, MAX_EVIDENCE_SIZE_BYTES],
        ["eq", "$Content-Type", validMime],
      ],
      Fields: {
        "Content-Type": validMime,
      },
      Expires: 300, // 5 minutes
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create presigned post";
    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate storage upload authorization.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }

  // 7. Record short-lived authorization in DynamoDB
  try {
    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          pk: auth.user.campusId,
          sk: `UPLOAD_AUTH#${authId}`,
          authId,
          evidenceId,
          s3Key,
          s3Bucket: S3_BUCKET,
          incidentId: cleanIncidentId,
          uploadedBy: auth.user.email,
          uploadedByName: auth.user.name || auth.user.email,
          uploadedByRole: auth.user.role,
          originalFilename: safeFilename,
          mimeType: validMime,
          declaredSizeBytes: sizeBytes,
          campusId: auth.user.campusId,
          status: "AUTHORIZED",
          createdAt: now.toISOString(),
          expiresAt,
          ttl: ttlEpochSeconds,
          entityType: "UPLOAD_AUTHORIZATION",
        },
      })
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to persist authorization";
    return NextResponse.json(
      {
        success: false,
        error: "Failed to record upload authorization.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        authId,
        uploadUrl: presignedPost.url,
        fields: presignedPost.fields,
        s3Key,
        evidenceId,
        expiresAt,
      },
    },
    { status: 200 }
  );
}
