import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { s3Client, S3_BUCKET, docClient, DYNAMODB_TABLE } from "@/lib/aws";
import { GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { GetCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  MAX_EVIDENCE_SIZE_BYTES,
  MIN_EVIDENCE_SIZE_BYTES,
  validateImageMagicBytes,
  validateS3Key,
} from "@/lib/validation";
import { EvidenceRecord, AllowedEvidenceMimeType } from "@/types/evidence";


/**
 * POST /api/upload/complete
 * Verifies S3 direct upload integrity, validates magic bytes via range read,
 * and atomically persists evidence metadata and incident attachment in DynamoDB.
 *
 * Security:
 * - Requires verified server-side session authentication.
 * - Validates CSRF origin header via authenticateRequest().
 * - Verifies that the upload authorization exists, belongs to caller, and matches campus PK.
 * - Prevents reuse and duplicate execution via conditional transaction check (#st = :authorized).
 * - Safe & idempotent: Retried completions for already-completed uploads return existing evidence data.
 * - Downloads only 64 bytes via S3 byte-range request to verify real image magic bytes.
 * - Immediately purges invalid, corrupted, or oversized S3 objects (DeleteObjectCommand).
 * - Preserves existing DynamoDB EvidenceRecord schema and atomic INCIDENT update.
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

  const { authId, s3Key } = body as Record<string, unknown>;

  if (!authId || typeof authId !== "string" || !authId.trim()) {
    return NextResponse.json(
      { success: false, error: "authId is required to complete upload." },
      { status: 400 }
    );
  }
  const cleanAuthId = authId.trim();

  if (!s3Key || typeof s3Key !== "string" || !s3Key.trim()) {
    return NextResponse.json(
      { success: false, error: "s3Key is required to complete upload." },
      { status: 400 }
    );
  }
  const cleanS3Key = s3Key.trim();

  // 1. Validate S3 key format
  if (!validateS3Key(cleanS3Key)) {
    return NextResponse.json(
      { success: false, error: "Invalid S3 storage key format." },
      { status: 400 }
    );
  }

  // 2. Fetch and verify short-lived upload authorization from DynamoDB
  let authItem: Record<string, unknown> | undefined;
  try {
    const authRes = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          pk: auth.user.campusId,
          sk: `UPLOAD_AUTH#${cleanAuthId}`,
        },
      })
    );
    authItem = authRes.Item;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to query upload authorization";
    return NextResponse.json(
      {
        success: false,
        error: "Failed to verify upload authorization.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }

  if (!authItem) {
    return NextResponse.json(
      { success: false, error: "Upload authorization not found or belongs to another campus." },
      { status: 404 }
    );
  }

  // 3. Security checks on authorization
  if (authItem.s3Key !== cleanS3Key) {
    return NextResponse.json(
      { success: false, error: "Storage key does not match authorization record." },
      { status: 400 }
    );
  }

  if (authItem.uploadedBy !== auth.user.email) {
    return NextResponse.json(
      { success: false, error: "Forbidden. Upload authorization was issued to a different user." },
      { status: 403 }
    );
  }

  // 4. Check for idempotency: already completed upload retry
  if (authItem.status === "COMPLETED") {
    try {
      const existingEv = await docClient.send(
        new GetCommand({
          TableName: DYNAMODB_TABLE,
          Key: {
            pk: auth.user.campusId,
            sk: `EVIDENCE#${authItem.evidenceId}`,
          },
        })
      );
      if (existingEv.Item) {
        const ev = existingEv.Item as EvidenceRecord;
        return NextResponse.json(
          {
            success: true,
            data: {
              id: ev.id,
              incidentId: ev.incidentId,
              url: ev.url,
              mimeType: ev.mimeType,
              fileSizeBytes: ev.fileSizeBytes,
              originalFilename: ev.originalFilename,
              uploadedAt: ev.uploadedAt,
            },
          },
          { status: 200 }
        );
      }
    } catch {
      // Fall through to standard error if lookup fails
    }
    return NextResponse.json(
      { success: false, error: "Upload authorization has already been completed." },
      { status: 409 }
    );
  }

  if (authItem.status === "REJECTED") {
    return NextResponse.json(
      { success: false, error: "Upload authorization was previously rejected due to validation failure." },
      { status: 400 }
    );
  }

  if (authItem.status !== "AUTHORIZED") {
    return NextResponse.json(
      { success: false, error: `Invalid upload authorization status "${authItem.status}".` },
      { status: 400 }
    );
  }

  // 5. Expiration check
  if (new Date(authItem.expiresAt as string).getTime() <= Date.now()) {
    // Purge expired S3 object if present
    try {
      await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: cleanS3Key }));
    } catch {
      // Ignore S3 delete failure on expired item
    }
    return NextResponse.json(
      { success: false, error: "Upload authorization has expired. Please initiate a new upload." },
      { status: 410 }
    );
  }

  // 6. Inspect uploaded S3 object metadata
  let headRes: { ContentLength?: number; ContentType?: string };
  try {
    headRes = await s3Client.send(
      new HeadObjectCommand({
        Bucket: S3_BUCKET,
        Key: cleanS3Key,
      })
    );
  } catch (err: unknown) {
    const errName = err instanceof Error ? err.name : "";
    if (errName === "NotFound" || errName === "NoSuchKey") {
      return NextResponse.json(
        {
          success: false,
          error: "Uploaded evidence file was not found in storage. Direct upload may have failed or timed out.",
        },
        { status: 404 }
      );
    }
    const msg = err instanceof Error ? err.message : "Failed to inspect S3 object";
    return NextResponse.json(
      {
        success: false,
        error: "Failed to verify storage object.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }

  const actualSize = headRes.ContentLength || 0;
  if (actualSize < MIN_EVIDENCE_SIZE_BYTES) {
    await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: cleanS3Key }));
    return NextResponse.json(
      {
        success: false,
        error: `Uploaded file is too small (${actualSize} bytes). Minimum allowed size is ${MIN_EVIDENCE_SIZE_BYTES} bytes.`,
      },
      { status: 400 }
    );
  }
  if (actualSize > MAX_EVIDENCE_SIZE_BYTES) {
    await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: cleanS3Key }));
    return NextResponse.json(
      {
        success: false,
        error: `Uploaded file exceeds maximum allowed size of 10 MB (received ${actualSize} bytes).`,
      },
      { status: 413 }
    );
  }

  // 7. Verify real image magic bytes via 64-byte range read
  let headerBuffer: Buffer;
  try {
    const rangeRes = await s3Client.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: cleanS3Key,
        Range: "bytes=0-63",
      })
    );

    if (!rangeRes.Body) {
      throw new Error("Empty range response body");
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of rangeRes.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    headerBuffer = Buffer.concat(chunks);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to read file signature";
    return NextResponse.json(
      {
        success: false,
        error: "Failed to read file signature from storage.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }

  const magicValidation = validateImageMagicBytes(headerBuffer, authItem.mimeType as string);
  if (!magicValidation.valid || !magicValidation.detectedFormat) {
    // Purge corrupted / disguised file immediately
    try {
      await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: cleanS3Key }));
      await docClient.send(
        new UpdateCommand({
          TableName: DYNAMODB_TABLE,
          Key: {
            pk: auth.user.campusId,
            sk: `UPLOAD_AUTH#${cleanAuthId}`,
          },
          UpdateExpression: "SET #st = :rejected, rejectedReason = :reason",
          ExpressionAttributeNames: { "#st": "status" },
          ExpressionAttributeValues: {
            ":rejected": "REJECTED",
            ":reason": "Magic-byte content signature validation failed.",
          },
        })
      );
    } catch {
      // Best-effort cleanup
    }

    return NextResponse.json(
      {
        success: false,
        error: "File content signature does not match declared image type or image is corrupted.",
      },
      { status: 400 }
    );
  }

  // 8. Commit Evidence Record & Update Incident in DynamoDB (Atomic Transaction)
  const evidenceId = (authItem.evidenceId as string) || `ev-${Date.now()}`;
  const incidentId = authItem.incidentId as string;
  const now = new Date().toISOString();

  const evidenceRecord: EvidenceRecord = {
    id: evidenceId,
    incidentId,
    s3Key: cleanS3Key,
    s3Bucket: S3_BUCKET,
    originalFilename: (authItem.originalFilename as string) || "evidence.bin",
    mimeType: authItem.mimeType as AllowedEvidenceMimeType,
    fileSizeBytes: actualSize,
    uploadedBy: auth.user.email,
    uploadedByName: (authItem.uploadedByName as string) || auth.user.name || auth.user.email,
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
          // A. Mark Authorization as COMPLETED (enforcing single-use via ConditionExpression)
          {
            Update: {
              TableName: DYNAMODB_TABLE,
              Key: {
                pk: auth.user.campusId,
                sk: `UPLOAD_AUTH#${cleanAuthId}`,
              },
              UpdateExpression: "SET #st = :completed, completedAt = :now, finalEvidenceId = :evId",
              ConditionExpression: "attribute_exists(pk) AND #st = :authorized",
              ExpressionAttributeNames: {
                "#st": "status",
              },
              ExpressionAttributeValues: {
                ":completed": "COMPLETED",
                ":now": now,
                ":evId": evidenceId,
                ":authorized": "AUTHORIZED",
              },
            },
          },
          // B. Insert Permanent Evidence Record
          {
            Put: {
              TableName: DYNAMODB_TABLE,
              Item: {
                pk: auth.user.campusId,
                sk: `EVIDENCE#${evidenceId}`,
                ...evidenceRecord,
              },
              ConditionExpression: "attribute_not_exists(sk)",
            },
          },
          // C. Update Incident Photo Metadata
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
    // -------------------------------------------------------------------------
    // Concurrency Protection & Strong Consistency Re-Read:
    // A concurrent completion request may have won the race and committed this
    // authorization. NEVER delete an S3 object merely because a conditional
    // transaction failed.
    // -------------------------------------------------------------------------
    try {
      const recheckAuth = await docClient.send(
        new GetCommand({
          TableName: DYNAMODB_TABLE,
          Key: {
            pk: auth.user.campusId,
            sk: `UPLOAD_AUTH#${cleanAuthId}`,
          },
          ConsistentRead: true, // Strongly consistent read to observe the winning commit
        })
      );

      const latestAuth = recheckAuth.Item;
      if (latestAuth && latestAuth.status === "COMPLETED") {
        const targetEvidenceId =
          (latestAuth.finalEvidenceId as string) ||
          (latestAuth.evidenceId as string) ||
          evidenceId;

        const existingEv = await docClient.send(
          new GetCommand({
            TableName: DYNAMODB_TABLE,
            Key: {
              pk: auth.user.campusId,
              sk: `EVIDENCE#${targetEvidenceId}`,
            },
            ConsistentRead: true,
          })
        );

        if (existingEv.Item) {
          const ev = existingEv.Item as EvidenceRecord;
          // CRITICAL: DO NOT DELETE THE S3 OBJECT!
          // The winning transaction successfully committed it and linked it to the incident.
          return NextResponse.json(
            {
              success: true,
              data: {
                id: ev.id,
                incidentId: ev.incidentId,
                url: ev.url,
                mimeType: ev.mimeType,
                fileSizeBytes: ev.fileSizeBytes,
                originalFilename: ev.originalFilename,
                uploadedAt: ev.uploadedAt,
              },
            },
            { status: 200 }
          );
        }
      }
    } catch (recheckErr) {
      console.warn("VIGILORA: Failed to recheck authorization state after transaction failure:", recheckErr);
    }

    // Distinguish Transaction Cancellation from genuine Infrastructure Errors
    const errName = dbErr instanceof Error ? dbErr.name : "";
    const errMsg = dbErr instanceof Error ? dbErr.message : "";
    const isCancellation =
      errName === "TransactionCanceledException" ||
      errMsg.includes("ConditionalCheckFailed") ||
      errMsg.includes("Transaction cancelled");

    if (isCancellation) {
      // Transaction was cancelled by DynamoDB condition check without a winning commit.
      console.warn(`Transaction cancelled for evidence ${evidenceId} without winning commit. Purging uncommitted S3 object ${cleanS3Key}...`);
      try {
        await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: cleanS3Key }));
      } catch (cleanupErr) {
        console.error(`Failed to clean up uncommitted S3 object ${cleanS3Key}:`, cleanupErr);
      }

      return NextResponse.json(
        {
          success: false,
          error: "Upload completion could not be committed. Target incident status may have changed or authorization was revoked.",
          details: process.env.NODE_ENV !== "production" ? errMsg : undefined,
        },
        { status: 409 }
      );
    }

    // Genuine Infrastructure / Network Error (e.g. 500, Throttling)
    // DO NOT DELETE THE S3 OBJECT! The uploaded file is valid in S3 and the client can retry /complete.
    console.error(`Infrastructure failure persisting evidence transaction for ${evidenceId}:`, dbErr);
    return NextResponse.json(
      {
        success: false,
        error: "Database service temporarily unavailable. The storage upload is intact; please retry completion.",
        details: process.env.NODE_ENV !== "production" ? errMsg : undefined,
      },
      { status: 500 }
    );
  }

  // 9. Return Safe Client Response
  return NextResponse.json(
    {
      success: true,
      data: {
        id: evidenceId,
        incidentId,
        url: `/api/evidence/${evidenceId}`,
        mimeType: evidenceRecord.mimeType,
        fileSizeBytes: actualSize,
        originalFilename: evidenceRecord.originalFilename,
        uploadedAt: now,
      },
    },
    { status: 201 }
  );
}
