/**
 * VIGILORA PHASE 3C: PRIVATE S3 EVIDENCE UPLOAD & STREAMING VIEWER TEST SUITE
 *
 * Verifies:
 * 1. Incident creation without photo (hasPhoto: false).
 * 2. Incident creation with valid JPEG evidence (magic bytes \xFF\xD8\xFF).
 * 3. Incident creation with valid PNG evidence (magic bytes \x89PNG\r\n\x1a\n).
 * 4. Incident creation with valid WebP evidence (magic bytes RIFF....WEBP).
 * 5. Streaming proxy (GET /api/evidence/[id]): binary byte-for-byte fidelity and security headers (nosniff, DENY).
 * 6. File validation boundary: rejection of oversized (>10 MB) and unsupported files.
 * 7. Backend security validation: rejection of disguised HTML masquerading as JPEG.
 * 8. Two-stage incident creation and partial-failure handling:
 *    - Incident created successfully in DynamoDB.
 *    - Upload failure simulated.
 *    - Retry upload with same incident ID without duplicate creation.
 * 9. Security isolation: cross-campus access rejection (404) & unauthenticated access rejection (401).
 * 10. Missing evidence handling (404).
 * 11. Rapid / concurrent submissions handled safely.
 * 12. State persistence & reload integrity (GET /api/incidents/[id] returns hasPhoto: true).
 * 13. UI code inspection: File object retention, zero base64 in DB, zero localStorage, EvidenceViewer integration.
 * 14. Guaranteed automatic teardown: 100% of test S3 objects and DynamoDB records purged.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { provisionUser, createSession } from "../src/lib/auth";

const REGION = "eu-north-1";
const DYNAMODB_TABLE = "VIGILORA-Main";
const S3_BUCKET = "vigilora-evidence-399527676157-eu-north-1-an";
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

const rawDdb = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(rawDdb);
const s3Client = new S3Client({ region: REGION });

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition: unknown, message: string) {
  totalAssertions++;
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedAssertions++;
  console.log(`  [PASS] ${message}`);
}

async function runPhase3CTests() {
  const runId = `${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const campusPk = "CAMPUS#METROPOLIS";
  const crossCampusPk = "CAMPUS#NORTH_SATELLITE";

  const cleanupDynamoKeys: { pk: string; sk: string }[] = [];
  const cleanupS3Keys: string[] = [];

  console.log("================================================================================");
  console.log("  VIGILORA PHASE 3C: PRIVATE S3 EVIDENCE UPLOAD & STREAMING VIEWER VERIFICATION");
  console.log("================================================================================");

  try {
    // -------------------------------------------------------------------------
    // Setup: Provision Authenticated Operators
    // -------------------------------------------------------------------------
    console.log("\nSetup: Provisioning verified operator identities...");

    async function setupOperator(role: any, callsign: string, overrideCampus?: string) {
      const email = `test.ph3c.${role.toLowerCase()}.${runId}@vigilora.internal`;
      const password = `TestAuth_${role}_${runId}!Safe`;
      const name = `Operator ${role} ${runId.slice(0, 4)}`;
      const campus = overrideCampus || campusPk;

      const prov = await provisionUser({
        email,
        password,
        name,
        role,
        callsign,
        campusId: campus,
      });

      cleanupDynamoKeys.push({ pk: campus, sk: `USER#${email.toLowerCase()}` });

      const { plainToken } = await createSession(prov.user);
      const hashedToken = crypto.createHash("sha256").update(plainToken).digest("hex");
      cleanupDynamoKeys.push({ pk: campus, sk: `SESSION#${hashedToken}` });

      return { email, password, token: plainToken, user: prov.user };
    }

    const reporter = await setupOperator("Reporter", "CADET-1");
    const supervisor = await setupOperator("Supervisor", "SUP-COMMAND-1");
    const crossCampusOp = await setupOperator("Dispatcher", "OUTPOST-1", crossCampusPk);

    console.log("  Verified operators provisioned successfully.");

    // Helper to upload via multipart/form-data
    async function uploadEvidenceApi(token: string, incidentId: string, fileBuffer: Buffer, filename: string, mimeType: string) {
      const boundary = `----VigiloraBoundary${Date.now()}`;
      const headerPart = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="incidentId"\r\n\r\n${incidentId}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
      );
      const footerPart = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([headerPart, fileBuffer, footerPart]);

      const res = await fetch(`${BASE_URL}/api/upload`, {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          Cookie: `vigilora_session=${token}`,
          "x-vigilora-test-client": "phase3c-test",
        },
        body,
      });

      return res;
    }

    // -------------------------------------------------------------------------
    // Test 1: Incident Creation Without a Photo
    // -------------------------------------------------------------------------
    console.log("\nTest 1: Incident Creation Without a Photo");

    const noPhotoRes = await fetch(`${BASE_URL}/api/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${reporter.token}`,
        "x-vigilora-test-client": "phase3c-test",
      },
      body: JSON.stringify({
        title: "Perimeter Gate Minor Latch Noise",
        description: "Routine check indicated gate latch rattled in high wind.",
        category: "Infrastructure",
        severity: "Low",
        zone: "Central Campus Sector",
        building: "South Gate Lodge",
        hasPhoto: false,
      }),
    });

    assert(noPhotoRes.status === 201, `Creation without photo returns HTTP 201 (Got ${noPhotoRes.status})`);
    const noPhotoData = await noPhotoRes.json();
    const noPhotoId = noPhotoData.data.id;
    cleanupDynamoKeys.push({ pk: campusPk, sk: `INCIDENT#${noPhotoId}` });
    if (noPhotoData.activity) {
      cleanupDynamoKeys.push({
        pk: campusPk,
        sk: `ACTIVITY#${noPhotoData.activity.timestamp}#${noPhotoData.activity.id}`,
      });
    }

    assert(noPhotoData.data.hasPhoto === false, "Incident hasPhoto is explicitly false");
    assert(!noPhotoData.data.photoUrl, "Incident photoUrl is undefined/null");

    // -------------------------------------------------------------------------
    // Test 2: Two-Stage Creation with Valid JPEG Evidence
    // -------------------------------------------------------------------------
    console.log("\nTest 2: Two-Stage Creation with Valid JPEG Evidence");

    // Stage 1: Create incident
    const jpegIncRes = await fetch(`${BASE_URL}/api/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${reporter.token}`,
        "x-vigilora-test-client": "phase3c-test",
      },
      body: JSON.stringify({
        title: "Electrical Transformer Arc Smoke",
        description: "Visible blue spark arc witnessed in transformer vault.",
        category: "Fire and Hazard",
        severity: "High",
        zone: "North STEM Quad",
        building: "Substation Alpha",
        hasPhoto: false,
      }),
    });
    assert(jpegIncRes.status === 201, "Stage 1: Incident created successfully (HTTP 201)");
    const jpegIncData = await jpegIncRes.json();
    const jpegIncidentId = jpegIncData.data.id;
    cleanupDynamoKeys.push({ pk: campusPk, sk: `INCIDENT#${jpegIncidentId}` });
    if (jpegIncData.activity) {
      cleanupDynamoKeys.push({
        pk: campusPk,
        sk: `ACTIVITY#${jpegIncData.activity.timestamp}#${jpegIncData.activity.id}`,
      });
    }

    // Stage 2: Upload valid JPEG
    const jpegBuffer = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00]),
      Buffer.from("VIGILORA_TEST_JPEG_PAYLOAD_" + runId),
      Buffer.alloc(200, 0xaa),
      Buffer.from([0xff, 0xd9]),
    ]);

    const jpegUploadRes = await uploadEvidenceApi(
      reporter.token,
      jpegIncidentId,
      jpegBuffer,
      "transformer-smoke.jpg",
      "image/jpeg"
    );
    assert(jpegUploadRes.status === 201, `Stage 2: JPEG evidence upload returns HTTP 201 (Got ${jpegUploadRes.status})`);
    const jpegUploadData = await jpegUploadRes.json();
    assert(jpegUploadData.success === true, "Upload response indicates success: true");
    assert(jpegUploadData.data.mimeType === "image/jpeg", "Detected mimeType is 'image/jpeg'");
    assert(jpegUploadData.data.url.startsWith("/api/evidence/"), "Returned url points to secure proxy /api/evidence/[id]");

    const jpegEvidenceId = jpegUploadData.data.id;
    cleanupDynamoKeys.push({ pk: campusPk, sk: `EVIDENCE#${jpegEvidenceId}` });

    // Verify metadata record in DynamoDB
    const jpegMetaDb = await docClient.send(
      new GetCommand({ TableName: DYNAMODB_TABLE, Key: { pk: campusPk, sk: `EVIDENCE#${jpegEvidenceId}` } })
    );
    assert(jpegMetaDb.Item?.id === jpegEvidenceId, "Evidence metadata record persisted in DynamoDB");
    assert(jpegMetaDb.Item?.s3Key.startsWith("evidence/"), "S3 object key placed in isolated evidence/ folder");
    cleanupS3Keys.push(jpegMetaDb.Item?.s3Key);

    // Verify incident record in DynamoDB updated with hasPhoto: true
    const jpegIncDb = await docClient.send(
      new GetCommand({ TableName: DYNAMODB_TABLE, Key: { pk: campusPk, sk: `INCIDENT#${jpegIncidentId}` } })
    );
    assert(jpegIncDb.Item?.hasPhoto === true, "Incident record updated to hasPhoto: true");
    assert(jpegIncDb.Item?.photoUrl === `/api/evidence/${jpegEvidenceId}`, "Incident record photoUrl points to evidence proxy");

    // -------------------------------------------------------------------------
    // Test 3: Two-Stage Creation with Valid PNG Evidence
    // -------------------------------------------------------------------------
    console.log("\nTest 3: Two-Stage Creation with Valid PNG Evidence");

    const pngIncRes = await fetch(`${BASE_URL}/api/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${reporter.token}`,
        "x-vigilora-test-client": "phase3c-test",
      },
      body: JSON.stringify({
        title: "Perimeter Security Camera Vandalism",
        description: "Surveillance camera dome spray-painted at West Gate.",
        category: "Security",
        severity: "Medium",
        zone: "West Arts District",
        building: "West Gate Tower",
      }),
    });
    const pngIncData = await pngIncRes.json();
    const pngIncidentId = pngIncData.data.id;
    cleanupDynamoKeys.push({ pk: campusPk, sk: `INCIDENT#${pngIncidentId}` });
    if (pngIncData.activity) {
      cleanupDynamoKeys.push({
        pk: campusPk,
        sk: `ACTIVITY#${pngIncData.activity.timestamp}#${pngIncData.activity.id}`,
      });
    }

    const pngBuffer = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]),
      Buffer.from("VIGILORA_TEST_PNG_PAYLOAD_" + runId),
      Buffer.alloc(200, 0xbb),
      Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]),
    ]);

    const pngUploadRes = await uploadEvidenceApi(
      reporter.token,
      pngIncidentId,
      pngBuffer,
      "camera-lens.png",
      "image/png"
    );
    assert(pngUploadRes.status === 201, `PNG upload returns HTTP 201 (Got ${pngUploadRes.status})`);
    const pngUploadData = await pngUploadRes.json();
    assert(pngUploadData.data.mimeType === "image/png", "PNG magic bytes identified accurately");
    const pngEvidenceId = pngUploadData.data.id;
    cleanupDynamoKeys.push({ pk: campusPk, sk: `EVIDENCE#${pngEvidenceId}` });

    const pngMetaDb = await docClient.send(
      new GetCommand({ TableName: DYNAMODB_TABLE, Key: { pk: campusPk, sk: `EVIDENCE#${pngEvidenceId}` } })
    );
    cleanupS3Keys.push(pngMetaDb.Item?.s3Key);

    // -------------------------------------------------------------------------
    // Test 4: Two-Stage Creation with Valid WebP Evidence
    // -------------------------------------------------------------------------
    console.log("\nTest 4: Two-Stage Creation with Valid WebP Evidence");

    const webpIncRes = await fetch(`${BASE_URL}/api/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${reporter.token}`,
        "x-vigilora-test-client": "phase3c-test",
      },
      body: JSON.stringify({
        title: "Medical Trauma Outside Arena",
        description: "Subject slipped on icy ramp steps requiring evaluation.",
        category: "Medical",
        severity: "Critical",
        zone: "Memorial Arena Concourse",
        building: "Main Ramp B",
      }),
    });
    const webpIncData = await webpIncRes.json();
    const webpIncidentId = webpIncData.data.id;
    cleanupDynamoKeys.push({ pk: campusPk, sk: `INCIDENT#${webpIncidentId}` });
    if (webpIncData.activity) {
      cleanupDynamoKeys.push({
        pk: campusPk,
        sk: `ACTIVITY#${webpIncData.activity.timestamp}#${webpIncData.activity.id}`,
      });
    }

    const webpBuffer = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.from([0x20, 0x01, 0x00, 0x00]),
      Buffer.from("WEBPVP8 "),
      Buffer.from("VIGILORA_TEST_WEBP_PAYLOAD_" + runId),
      Buffer.alloc(250, 0xcc),
    ]);

    const webpUploadRes = await uploadEvidenceApi(
      reporter.token,
      webpIncidentId,
      webpBuffer,
      "arena-ramp.webp",
      "image/webp"
    );
    assert(webpUploadRes.status === 201, `WebP upload returns HTTP 201 (Got ${webpUploadRes.status})`);
    const webpUploadData = await webpUploadRes.json();
    assert(webpUploadData.data.mimeType === "image/webp", "WebP magic bytes identified accurately");
    const webpEvidenceId = webpUploadData.data.id;
    cleanupDynamoKeys.push({ pk: campusPk, sk: `EVIDENCE#${webpEvidenceId}` });

    const webpMetaDb = await docClient.send(
      new GetCommand({ TableName: DYNAMODB_TABLE, Key: { pk: campusPk, sk: `EVIDENCE#${webpEvidenceId}` } })
    );
    cleanupS3Keys.push(webpMetaDb.Item?.s3Key);

    // -------------------------------------------------------------------------
    // Test 5: Streaming Evidence Proxy & Security Headers
    // -------------------------------------------------------------------------
    console.log("\nTest 5: Streaming Evidence Proxy & Security Headers");

    const streamRes = await fetch(`${BASE_URL}/api/evidence/${jpegEvidenceId}`, {
      headers: {
        Cookie: `vigilora_session=${reporter.token}`,
        "x-vigilora-test-client": "phase3c-test",
      },
    });

    assert(streamRes.status === 200, `Streaming proxy returns HTTP 200 (Got ${streamRes.status})`);
    assert(streamRes.headers.get("content-type") === "image/jpeg", "Content-Type matches image/jpeg");
    assert(streamRes.headers.get("x-content-type-options") === "nosniff", "nosniff security header present");
    assert(streamRes.headers.get("x-frame-options") === "DENY", "X-Frame-Options: DENY present");
    assert(streamRes.headers.get("cache-control")?.includes("private"), "Cache-Control is marked private");

    const streamedArrayBuffer = await streamRes.arrayBuffer();
    const streamedBuffer = Buffer.from(streamedArrayBuffer);
    assert(streamedBuffer.equals(jpegBuffer), "Streamed payload matches uploaded binary byte-for-byte");

    // -------------------------------------------------------------------------
    // Test 6: File Validation Boundary (Oversized, Tiny, Unsupported)
    // -------------------------------------------------------------------------
    console.log("\nTest 6: File Validation Boundary (Oversized, Tiny, Unsupported)");

    // A. Oversized file (> 10 MB)
    const oversizedBuffer = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(10 * 1024 * 1024 + 1024, 0x00),
      Buffer.from([0xff, 0xd9]),
    ]);
    const oversizeRes = await uploadEvidenceApi(
      reporter.token,
      jpegIncidentId,
      oversizedBuffer,
      "huge.jpg",
      "image/jpeg"
    );
    assert(oversizeRes.status === 413, `File > 10 MB rejected with HTTP 413 Payload Too Large (Got ${oversizeRes.status})`);

    // B. Tiny file (< 100 bytes)
    const tinyBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const tinyRes = await uploadEvidenceApi(
      reporter.token,
      jpegIncidentId,
      tinyBuffer,
      "tiny.jpg",
      "image/jpeg"
    );
    assert(tinyRes.status === 400, `File < 100 bytes rejected with HTTP 400 (Got ${tinyRes.status})`);

    // C. Unsupported format (PDF)
    const pdfBuffer = Buffer.from("%PDF-1.4\n%...\n%%EOF");
    const pdfRes = await uploadEvidenceApi(
      reporter.token,
      jpegIncidentId,
      pdfBuffer,
      "document.pdf",
      "application/pdf"
    );
    assert(pdfRes.status === 415, `Non-image MIME type rejected with HTTP 415 Unsupported Media Type (Got ${pdfRes.status})`);

    // -------------------------------------------------------------------------
    // Test 7: Backend Rejection of Disguised HTML / Executable
    // -------------------------------------------------------------------------
    console.log("\nTest 7: Backend Rejection of Disguised HTML / Executable");

    const disguisedBuffer = Buffer.from(
      "<!DOCTYPE html><html><head><script>alert('malicious')</script></head><body><h1>Exploit</h1></body></html>"
    );
    const disguisedRes = await uploadEvidenceApi(
      reporter.token,
      jpegIncidentId,
      disguisedBuffer,
      "innocent-picture.jpg",
      "image/jpeg" // claiming to be jpeg
    );
    assert(disguisedRes.status === 400, `Disguised HTML masquerading as JPEG rejected with HTTP 400 (Got ${disguisedRes.status})`);
    const disguisedJson = await disguisedRes.json();
    assert(disguisedJson.error.includes("signature") || disguisedJson.error.includes("magic"), "Error explicitly mentions file signature / magic bytes mismatch");

    // -------------------------------------------------------------------------
    // Test 8: Partial Failure Handling & Retry Simulation (No Duplicate Incident)
    // -------------------------------------------------------------------------
    console.log("\nTest 8: Partial Failure Handling & Retry Simulation");

    const partialTitle = `Hazardous Gas Odor Test ${runId}`;

    // Stage 1: Create incident (Step A succeeds)
    const partIncRes = await fetch(`${BASE_URL}/api/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${reporter.token}`,
        "x-vigilora-test-client": "phase3c-test",
      },
      body: JSON.stringify({
        title: partialTitle,
        description: "Sulfur odor reported in chemistry lab basement corridor.",
        category: "Fire and Hazard",
        severity: "Critical",
        zone: "North STEM Quad",
        building: "Science Hall C",
      }),
    });
    assert(partIncRes.status === 201, "Stage 1: Incident created successfully (Got 201)");
    const partIncData = await partIncRes.json();
    const partialIncidentId = partIncData.data.id;
    cleanupDynamoKeys.push({ pk: campusPk, sk: `INCIDENT#${partialIncidentId}` });
    if (partIncData.activity) {
      cleanupDynamoKeys.push({
        pk: campusPk,
        sk: `ACTIVITY#${partIncData.activity.timestamp}#${partIncData.activity.id}`,
      });
    }

    // Stage 2: Intentional upload failure (Step B fails)
    const failUploadRes = await uploadEvidenceApi(
      reporter.token,
      partialIncidentId,
      Buffer.from("CORRUPT_NOT_AN_IMAGE_DATA_1234567890"),
      "corrupted.jpg",
      "image/jpeg"
    );
    assert(failUploadRes.status === 400, "Stage 2: Intentional upload failure rejected by backend (HTTP 400)");

    // Verify incident is still in database with hasPhoto: false
    const partialDbAfterFail = await docClient.send(
      new GetCommand({ TableName: DYNAMODB_TABLE, Key: { pk: campusPk, sk: `INCIDENT#${partialIncidentId}` } })
    );
    assert(partialDbAfterFail.Item?.hasPhoto === false, "Incident exists with hasPhoto: false after failed upload");

    // Stage 3: Operator clicks 'Retry Evidence Upload' (Re-uploads to SAME incident ID)
    const retryJpegBuffer = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00]),
      Buffer.from("RETRY_EVIDENCE_SUCCESS_" + runId),
      Buffer.alloc(200, 0xdd),
      Buffer.from([0xff, 0xd9]),
    ]);

    const retryUploadRes = await uploadEvidenceApi(
      reporter.token,
      partialIncidentId,
      retryJpegBuffer,
      "chemistry-corridor.jpg",
      "image/jpeg"
    );
    assert(retryUploadRes.status === 201, "Stage 3: Retry evidence upload returns HTTP 201 (Got 201)");
    const retryUploadData = await retryUploadRes.json();
    const retryEvidenceId = retryUploadData.data.id;
    cleanupDynamoKeys.push({ pk: campusPk, sk: `EVIDENCE#${retryEvidenceId}` });

    const retryMetaDb = await docClient.send(
      new GetCommand({ TableName: DYNAMODB_TABLE, Key: { pk: campusPk, sk: `EVIDENCE#${retryEvidenceId}` } })
    );
    cleanupS3Keys.push(retryMetaDb.Item?.s3Key);

    // Verify that incident record was updated to hasPhoto: true
    const partialDbAfterRetry = await docClient.send(
      new GetCommand({ TableName: DYNAMODB_TABLE, Key: { pk: campusPk, sk: `INCIDENT#${partialIncidentId}` } })
    );
    assert(partialDbAfterRetry.Item?.hasPhoto === true, "Incident record now marked hasPhoto: true after retry");
    assert(partialDbAfterRetry.Item?.photoUrl === `/api/evidence/${retryEvidenceId}`, "photoUrl bound to new evidence proxy URL");

    // Verify NO DUPLICATE incidents were created
    const queryIncidents = await docClient.send(
      new QueryCommand({
        TableName: DYNAMODB_TABLE,
        KeyConditionExpression: "pk = :pk and begins_with(sk, :skPrefix)",
        FilterExpression: "title = :title",
        ExpressionAttributeValues: {
          ":pk": campusPk,
          ":skPrefix": "INCIDENT#",
          ":title": partialTitle,
        },
      })
    );
    assert(queryIncidents.Items?.length === 1, `Zero duplicates: Exactly 1 incident exists with title "${partialTitle}"`);

    // -------------------------------------------------------------------------
    // Test 9: Unauthorized & Cross-Campus Retrieval Restrictions
    // -------------------------------------------------------------------------
    console.log("\nTest 9: Unauthorized & Cross-Campus Retrieval Restrictions");

    // A. Unauthenticated access
    const unauthRes = await fetch(`${BASE_URL}/api/evidence/${jpegEvidenceId}`, {
      headers: { "x-vigilora-test-client": "phase3c-test" },
    });
    assert(unauthRes.status === 401, `Unauthenticated evidence fetch returns HTTP 401 (Got ${unauthRes.status})`);

    // B. Cross-campus access
    const crossRes = await fetch(`${BASE_URL}/api/evidence/${jpegEvidenceId}`, {
      headers: {
        Cookie: `vigilora_session=${crossCampusOp.token}`,
        "x-vigilora-test-client": "phase3c-test",
      },
    });
    assert(
      crossRes.status === 404 || crossRes.status === 401 || crossRes.status === 403,
      `Cross-campus evidence retrieval strictly denied (Got HTTP ${crossRes.status})`
    );

    // -------------------------------------------------------------------------
    // Test 10: Missing Evidence Handling
    // -------------------------------------------------------------------------
    console.log("\nTest 10: Missing Evidence Handling");

    const missingRes = await fetch(`${BASE_URL}/api/evidence/nonexistent-evi-id-12345`, {
      headers: {
        Cookie: `vigilora_session=${reporter.token}`,
        "x-vigilora-test-client": "phase3c-test",
      },
    });
    assert(missingRes.status === 404, `Nonexistent evidence returns HTTP 404 (Got ${missingRes.status})`);
    const missingJson = await missingRes.json();
    assert(missingJson.success === false, "Missing evidence returns success: false");

    // -------------------------------------------------------------------------
    // Test 11: Rapid / Concurrent Upload Safety
    // -------------------------------------------------------------------------
    console.log("\nTest 11: Rapid / Concurrent Upload Safety");

    const [rapid1, rapid2] = await Promise.all([
      uploadEvidenceApi(reporter.token, jpegIncidentId, jpegBuffer, "rapid-1.jpg", "image/jpeg"),
      uploadEvidenceApi(reporter.token, jpegIncidentId, jpegBuffer, "rapid-2.jpg", "image/jpeg"),
    ]);

    assert(rapid1.status === 201, `Concurrent upload 1 returns HTTP 201 (Got ${rapid1.status})`);
    assert(rapid2.status === 201, `Concurrent upload 2 returns HTTP 201 (Got ${rapid2.status})`);

    const rapid1Data = await rapid1.json();
    const rapid2Data = await rapid2.json();
    cleanupDynamoKeys.push({ pk: campusPk, sk: `EVIDENCE#${rapid1Data.data.id}` });
    cleanupDynamoKeys.push({ pk: campusPk, sk: `EVIDENCE#${rapid2Data.data.id}` });

    const meta1 = await docClient.send(new GetCommand({ TableName: DYNAMODB_TABLE, Key: { pk: campusPk, sk: `EVIDENCE#${rapid1Data.data.id}` } }));
    const meta2 = await docClient.send(new GetCommand({ TableName: DYNAMODB_TABLE, Key: { pk: campusPk, sk: `EVIDENCE#${rapid2Data.data.id}` } }));
    if (meta1.Item?.s3Key) cleanupS3Keys.push(meta1.Item.s3Key);
    if (meta2.Item?.s3Key) cleanupS3Keys.push(meta2.Item.s3Key);

    // -------------------------------------------------------------------------
    // Test 12: Evidence Display Persistence After Query / Page Refresh
    // -------------------------------------------------------------------------
    console.log("\nTest 12: Evidence Display Persistence After Query / Page Refresh");

    const getIncRes = await fetch(`${BASE_URL}/api/incidents/${jpegIncidentId}`, {
      headers: {
        Cookie: `vigilora_session=${supervisor.token}`,
        "x-vigilora-test-client": "phase3c-test",
      },
    });
    assert(getIncRes.status === 200, "GET /api/incidents/[id] returns HTTP 200");
    const getIncData = await getIncRes.json();
    assert(getIncData.data.incident.hasPhoto === true, "Retrieved incident confirms hasPhoto: true");
    assert(getIncData.data.incident.photoUrl.startsWith("/api/evidence/"), "photoUrl persists and references evidence endpoint");

    // -------------------------------------------------------------------------
    // Test 13: Codebase Audit — EvidenceViewer & File Object Handling
    // -------------------------------------------------------------------------
    console.log("\nTest 13: Codebase Audit — EvidenceViewer & File Object Handling");

    const reportPageSrc = fs.readFileSync(path.join(process.cwd(), "src/app/report/page.tsx"), "utf-8");
    const contextSrc = fs.readFileSync(path.join(process.cwd(), "src/context/IncidentContext.tsx"), "utf-8");
    const incidentsPageSrc = fs.readFileSync(path.join(process.cwd(), "src/app/incidents/page.tsx"), "utf-8");
    const evidenceViewerExists = fs.existsSync(path.join(process.cwd(), "src/components/evidence/EvidenceViewer.tsx"));

    assert(evidenceViewerExists, "EvidenceViewer component exists in src/components/evidence/");
    assert(reportPageSrc.includes("selectedFile"), "ReportIncidentPage stores File object in selectedFile state");
    assert(reportPageSrc.includes("uploadEvidence"), "ReportIncidentPage invokes uploadEvidence action");
    assert(reportPageSrc.includes("handleRetryUpload"), "ReportIncidentPage provides handleRetryUpload mechanism");
    assert(!reportPageSrc.includes("readAsDataURL"), "ReportIncidentPage eliminated permanent base64 data URL persistence");
    assert(contextSrc.includes("uploadEvidence:"), "IncidentContext exports uploadEvidence function");
    assert(incidentsPageSrc.includes("<EvidenceViewer"), "LiveIncidentsPage embeds EvidenceViewer for attached photos");
    assert(!incidentsPageSrc.includes("Centralized Local Storage Synced"), "Obsolete Local Storage text removed from Incidents modal");

  } finally {
    // -------------------------------------------------------------------------
    // Teardown: Guaranteed S3 & DynamoDB Purge
    // -------------------------------------------------------------------------
    console.log("\n================================================================================");
    console.log("  AUTOMATIC TEARDOWN: PURGING ALL TEST S3 OBJECTS & DYNAMODB RECORDS");
    console.log("================================================================================");

    // Purge S3 Objects
    let s3Purged = 0;
    for (const key of cleanupS3Keys) {
      if (!key) continue;
      try {
        await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
        s3Purged++;
      } catch (e) {
        console.warn(`  Warning: failed to delete S3 key ${key}:`, e);
      }
    }
    console.log(`  Purged ${s3Purged} test objects from private S3 bucket.`);

    // Purge DynamoDB Records
    let ddbPurged = 0;
    for (const k of cleanupDynamoKeys) {
      try {
        await docClient.send(new DeleteCommand({ TableName: DYNAMODB_TABLE, Key: k }));
        ddbPurged++;
      } catch (e) {
        console.warn(`  Warning: failed to delete DynamoDB key:`, k, e);
      }
    }
    console.log(`  Purged ${ddbPurged} test records from DynamoDB table.`);

    // Verify Zero Lingering Items
    const remainingS3 = await s3Client.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: `evidence/` }));
    const lingeringS3 = (remainingS3.Contents || []).filter((o) => cleanupS3Keys.includes(o.Key || ""));
    assert(lingeringS3.length === 0, `Live S3 Verification: ZERO test objects remain in bucket (Remaining: ${lingeringS3.length})`);

    const remainingDdb = await docClient.send(
      new QueryCommand({
        TableName: DYNAMODB_TABLE,
        KeyConditionExpression: "pk = :pk and begins_with(sk, :skPrefix)",
        FilterExpression: "contains(email, :runId) or contains(title, :runId)",
        ExpressionAttributeValues: {
          ":pk": campusPk,
          ":skPrefix": "USER#",
          ":runId": runId,
        },
      })
    );
    assert((remainingDdb.Items || []).length === 0, `Live DynamoDB Verification: ZERO test operators remain in table`);
  }

  console.log("\n================================================================================");
  console.log(`  PHASE 3C EVIDENCE INTEGRATION: ${passedAssertions} Passed, ${totalAssertions - passedAssertions} Failed`);
  console.log("================================================================================\n");

  if (passedAssertions !== totalAssertions) {
    process.exit(1);
  }
}

runPhase3CTests().catch((err) => {
  console.error("Test execution failed with error:", err);
  process.exit(1);
});

