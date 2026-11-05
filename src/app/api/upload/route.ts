import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { authenticateRequest } from "@/lib/auth";
import { s3Client, S3_BUCKET, docClient, DYNAMODB_TABLE } from "@/lib/aws";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import {
  ALLOWED_EVIDENCE_MIME_TYPES,
  MAX_EVIDENCE_SIZE_BYTES,
  MIN_EVIDENCE_SIZE_BYTES,
  validateImageMagicBytes,
  validateS3Key,
  sanitizeFilename,
} from "@/lib/validation";
import { AllowedEvidenceMimeType, EvidenceRecord } from "@/types/evidence";

/**
 * POST /api/upload
 * Securely uploads incident evidence images directly to private S3 and records metadata in DynamoDB.
 *
 * Security:
 * - Requires verified server-side authentication (Supervisor, Dispatcher, Responder, Reporter).
 * - Accepts JPEG, PNG, and WebP images only.
 * - Enforces 10 MB maximum and 100 bytes minimum size limits.
 * - Verifies real content signatures using magic bytes.
 * - Generates unpredictable, collision-safe S3 object keys.
 * - Prevents path traversal and directory escape.
 * - Strictly validates that target incident exists in caller's campus.
 * - Implements automated S3 rollback if DynamoDB metadata persistence fails.
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

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid Content-Type. Request must be multipart/form-data.",
      },
      { status: 400 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to parse multipart form data." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || typeof file === "string" || !(file instanceof Blob)) {
    return NextResponse.json(
      { success: false, error: "Evidence image file is required in 'file' form field." },
      { status: 400 }
    );
  }

  const rawIncidentId = formData.get("incidentId");
  if (!rawIncidentId || typeof rawIncidentId !== "string" || !rawIncidentId.trim()) {
    return NextResponse.json(
      { success: false, error: "incidentId is required to associate evidence with an incident." },
      { status: 400 }
    );
  }
  const incidentId = rawIncidentId.trim();

  // 1. Validate that the target incident exists within the authenticated user's campus
  try {
    const incRes = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          pk: auth.user.campusId,
          sk: `INCIDENT#${incidentId}`,
        },
      })
    );

    if (!incRes.Item) {
      return NextResponse.json(
        {
          success: false,
          error: `Incident "${incidentId}" was not found in campus. Evidence cannot be attached.`,
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

  // 2. Validate reported MIME type before parsing large buffers
  const reportedMime = file.type;
  if (!ALLOWED_EVIDENCE_MIME_TYPES.includes(reportedMime as AllowedEvidenceMimeType)) {
    return NextResponse.json(
      {
        success: false,
        error: `Unsupported media type "${reportedMime}". Allowed formats: image/jpeg, image/png, image/webp.`,
      },
      { status: 415 }
    );
  }

  // 3. Validate file size constraints (100 B to 10 MB)
  if (file.size < MIN_EVIDENCE_SIZE_BYTES) {
    return NextResponse.json(
      {
        success: false,
        error: `File is too small (${file.size} bytes). Minimum allowed size is ${MIN_EVIDENCE_SIZE_BYTES} bytes.`,
      },
      { status: 400 }
    );
  }

  if (file.size > MAX_EVIDENCE_SIZE_BYTES) {
    return NextResponse.json(
      {
        success: false,
        error: `File exceeds maximum allowed size of 10 MB (received ${file.size} bytes).`,
      },
      { status: 413 }
    );
  }

  // 4. Read file buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 5. Verify actual content signatures via magic bytes
  const magicValidation = validateImageMagicBytes(buffer, reportedMime);
  if (!magicValidation.valid || !magicValidation.detectedFormat) {
    return NextResponse.json(
      {
        success: false,
        error: "File content signature does not match claimed MIME type or image is corrupted.",
      },
      { status: 400 }
    );
  }

  const detectedFormat = magicValidation.detectedFormat as AllowedEvidenceMimeType;
  const ext = detectedFormat === "image/jpeg" ? "jpg" : detectedFormat === "image/png" ? "png" : "webp";

  // 6. Generate unpredictable, unique S3 object key with path-traversal prevention
  const cleanCampus = auth.user.campusId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const cleanInc = incidentId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const uniqueSegment = `${Date.now()}-${crypto.randomUUID()}`;
  const s3Key = `evidence/${cleanCampus}/${cleanInc}/${uniqueSegment}.${ext}`;

  if (!validateS3Key(s3Key)) {
    return NextResponse.json(
      { success: false, error: "Failed to generate safe storage path." },
      { status: 500 }
    );
  }

  const evidenceId = `ev-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const now = new Date().toISOString();
  const safeName = sanitizeFilename(file instanceof File ? file.name : `evidence.${ext}`);

  // 7. Upload to Private S3 Bucket
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        Body: buffer,
        ContentType: detectedFormat,
        ServerSideEncryption: "AES256",
      })
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "S3 upload failed";
    return NextResponse.json(
      {
        success: false,
        error: "Storage upload failed. Could not store evidence file.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }

  // 8. Persist Evidence Metadata & Update Incident in DynamoDB (Atomic Transaction)
  const evidenceRecord: EvidenceRecord = {
    id: evidenceId,
    incidentId,
    s3Key,
    s3Bucket: S3_BUCKET,
    originalFilename: safeName,
    mimeType: detectedFormat,
    fileSizeBytes: buffer.length,
    uploadedBy: auth.user.email,
    uploadedByName: auth.user.name || auth.user.email,
    uploadedByRole: auth.user.role,
    uploadedAt: now,
    campusId: auth.user.campusId,
    entityType: "EVIDENCE",
    url: `/api/evidence/${evidenceId}`,
  };

  try {
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          // A. Insert Evidence Record
          {
            Put: {
              TableName: DYNAMODB_TABLE,
              Item: {
                pk: auth.user.campusId,
                sk: `EVIDENCE#${evidenceId}`,
                ...evidenceRecord,
              },
            },
          },
          // B. Update Incident's photo metadata
          {
            Update: {
              TableName: DYNAMODB_TABLE,
              Key: {
                pk: auth.user.campusId,
                sk: `INCIDENT#${incidentId}`,
              },
              UpdateExpression: "SET hasPhoto = :hp, photoUrl = :pu, updatedAt = :now",
              ExpressionAttributeValues: {
                ":hp": true,
                ":pu": `/api/evidence/${evidenceId}`,
                ":now": now,
              },
            },
          },
        ],
      })
    );
  } catch (dbErr: unknown) {
    // 9. Automated S3 Rollback: Delete orphaned S3 object if DynamoDB write fails
    console.warn(`DynamoDB metadata write failed for ${evidenceId}. Initiating S3 rollback for ${s3Key}...`);
    try {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: S3_BUCKET,
          Key: s3Key,
        })
      );
      console.log(`Successfully purged orphaned S3 object: ${s3Key}`);
    } catch (cleanupErr) {
      console.error(`CRITICAL: Failed to clean up orphaned S3 object ${s3Key}:`, cleanupErr);
    }

    const msg = dbErr instanceof Error ? dbErr.message : "DynamoDB metadata write failed";
    return NextResponse.json(
      {
        success: false,
        error: "Database transaction failed while recording evidence metadata.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }

  // 10. Return Safe Client Response (never expose internal S3 bucket or raw key)
  return NextResponse.json(
    {
      success: true,
      data: {
        id: evidenceId,
        incidentId,
        url: `/api/evidence/${evidenceId}`,
        mimeType: detectedFormat,
        fileSizeBytes: buffer.length,
        originalFilename: safeName,
        uploadedAt: now,
      },
    },
    { status: 201 }
  );
}
