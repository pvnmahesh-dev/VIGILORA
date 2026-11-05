import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { s3Client, S3_BUCKET, docClient, DYNAMODB_TABLE } from "@/lib/aws";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { validateS3Key, sanitizeFilename } from "@/lib/validation";
import { EvidenceRecord } from "@/types/evidence";
import { Readable } from "node:stream";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/evidence/[id]
 * Securely streams private incident evidence images from S3 to authenticated operators.
 *
 * Security:
 * - Requires verified server-side session authentication.
 * - Bounded strictly to caller's campus partition key (cross-campus requests return 404).
 * - Verifies that the associated incident exists in caller's campus.
 * - Validates S3 key format and prevents path traversal.
 * - Never exposes S3 bucket name, AWS ARN, or raw object keys.
 * - Returns 404 for missing or unauthorized evidence without leaking internal storage details.
 * - Sets strict security headers (nosniff, sandbox CSP, DENY frame options).
 */
export async function GET(request: Request, context: RouteParams) {
  const auth = await authenticateRequest(request, [
    "Supervisor",
    "Dispatcher",
    "Responder",
    "Reporter",
  ]);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { id } = await context.params;
  if (!id || typeof id !== "string" || !id.trim()) {
    return NextResponse.json({ success: false, error: "Evidence ID is required." }, { status: 400 });
  }

  const evidenceId = id.trim();

  // 1. Fetch evidence metadata from DynamoDB strictly within authenticated user's campus
  let evidence: EvidenceRecord | null = null;
  try {
    const metaRes = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          pk: auth.user.campusId,
          sk: `EVIDENCE#${evidenceId}`,
        },
      })
    );

    if (metaRes.Item) {
      evidence = metaRes.Item as EvidenceRecord;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to query evidence";
    return NextResponse.json(
      {
        success: false,
        error: "Failed to query evidence metadata.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }

  // 2. Return 404 if not found (or belonging to another campus)
  if (!evidence) {
    return NextResponse.json(
      { success: false, error: "Evidence record not found." },
      { status: 404 }
    );
  }

  // 3. Verify associated incident exists in caller's campus
  try {
    const incRes = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          pk: auth.user.campusId,
          sk: `INCIDENT#${evidence.incidentId}`,
        },
      })
    );

    if (!incRes.Item) {
      return NextResponse.json(
        { success: false, error: "Incident associated with evidence is inaccessible." },
        { status: 404 }
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to verify incident";
    return NextResponse.json(
      {
        success: false,
        error: "Failed to verify associated incident.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }

  // 4. Check for metadata request (returns JSON metadata without streaming from S3)
  const url = new URL(request.url);
  const wantsMetadata =
    url.searchParams.get("metadata") === "true" ||
    request.headers.get("accept")?.includes("application/json");

  if (wantsMetadata) {
    const safeName = sanitizeFilename(evidence.originalFilename || "evidence.bin");
    return NextResponse.json({
      success: true,
      data: {
        id: evidence.id,
        incidentId: evidence.incidentId,
        originalFilename: safeName,
        mimeType: evidence.mimeType,
        fileSizeBytes: evidence.fileSizeBytes,
        uploadedAt: evidence.uploadedAt,
        uploadedBy: evidence.uploadedBy,
        uploadedByName: evidence.uploadedByName,
        uploadedByRole: evidence.uploadedByRole,
        url: `/api/evidence/${evidence.id}`,
      },
    });
  }

  // 5. Validate S3 object key format (path traversal guard)
  if (!validateS3Key(evidence.s3Key)) {
    return NextResponse.json(
      { success: false, error: "Invalid storage key reference." },
      { status: 400 }
    );
  }

  // 6. Stream evidence object from private S3 bucket
  try {
    const s3Res = await s3Client.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: evidence.s3Key,
      })
    );

    if (!s3Res.Body) {
      return NextResponse.json(
        { success: false, error: "Evidence object content is empty." },
        { status: 404 }
      );
    }

    // Convert S3 stream to Web ReadableStream
    let webStream: ReadableStream;
    if (typeof s3Res.Body.transformToWebStream === "function") {
      webStream = s3Res.Body.transformToWebStream();
    } else {
      // Fallback for Node Readable streams
      webStream = Readable.toWeb(s3Res.Body as Readable) as ReadableStream;
    }

    const safeName = sanitizeFilename(evidence.originalFilename || "evidence.bin");
    const contentLength = evidence.fileSizeBytes
      ? String(evidence.fileSizeBytes)
      : s3Res.ContentLength
        ? String(s3Res.ContentLength)
        : undefined;

    const headers = new Headers();
    headers.set("Content-Type", evidence.mimeType);
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }
    headers.set("Content-Disposition", `inline; filename="${safeName}"`);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
    headers.set("Cache-Control", "private, max-age=3600, no-transform");
    headers.set("X-Frame-Options", "DENY");
    headers.set("X-Evidence-Filename", safeName);
    headers.set("X-Evidence-Uploaded-At", evidence.uploadedAt);
    headers.set("X-Evidence-Content-Type", evidence.mimeType);
    headers.set("X-Evidence-Incident-Id", evidence.incidentId);
    if (evidence.fileSizeBytes) {
      headers.set("X-Evidence-Size-Bytes", String(evidence.fileSizeBytes));
    }

    if (s3Res.ETag) {
      headers.set("ETag", s3Res.ETag);
    }

    return new Response(webStream, {
      status: 200,
      headers,
    });
  } catch (err: unknown) {
    const errName = err instanceof Error ? err.name : "";
    if (errName === "NoSuchKey" || errName === "NotFound") {
      return NextResponse.json(
        { success: false, error: "Evidence object not found in storage." },
        { status: 404 }
      );
    }

    const msg = err instanceof Error ? err.message : "Failed to retrieve evidence";
    return NextResponse.json(
      {
        success: false,
        error: "Failed to retrieve evidence file from storage.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }
}

