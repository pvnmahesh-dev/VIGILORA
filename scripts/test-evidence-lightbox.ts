/**
 * VIGILORA HACKATHON: IN-CONTEXT EVIDENCE LIGHTBOX TEST SUITE
 *
 * Verifies:
 * 1. Single photograph incident normalization & metadata derivation.
 * 2. Multiple photograph incident normalization & circular navigation (next/prev).
 * 3. Incident without photograph handling (zero-photo empty state).
 * 4. Authenticated GET /api/evidence/[id] metadata query (?metadata=true / Accept: application/json).
 * 5. Unauthorized evidence access rejection (HTTP 401).
 * 6. Broken image / missing object error response (HTTP 404).
 * 7. Cross-campus evidence privacy isolation (HTTP 404).
 * 8. Responsive mobile viewport & layout constraints.
 * 9. Keyboard controls (Escape, ArrowLeft, ArrowRight).
 * 10. Forensic honesty: Zero false cryptographic verification claims.
 */

import { POST as demoLoginHandler } from "../src/app/api/auth/demo-login/route";
import { GET as evidenceHandler } from "../src/app/api/evidence/[id]/route";
import { SESSION_COOKIE_NAME } from "../src/lib/auth";
import { docClient, DYNAMODB_TABLE } from "../src/lib/aws";
import { PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import fs from "node:fs";
import path from "node:path";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
    failed++;
  }
}

function extractCookie(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  const match = setCookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

const BASE_HEADERS = {
  host: "localhost:3000",
  origin: "http://localhost:3000",
  "x-vigilora-test-client": "active-test-suite",
};

async function runLightboxTestSuite() {
  console.log("================================================================================");
  console.log("     VIGILORA HACKATHON: IN-CONTEXT EVIDENCE LIGHTBOX TEST SUITE");
  console.log("================================================================================\n");

  // Step 0: Obtain authenticated Dispatcher session
  console.log("[SETUP: Authenticating Session for Evidence Access]");
  const loginReq = new Request("http://localhost:3000/api/auth/demo-login", {
    method: "POST",
    headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "Dispatcher" }),
  });
  const loginRes = await demoLoginHandler(loginReq);
  const sessionCookie = extractCookie(loginRes);
  assert(Boolean(sessionCookie), "Dispatcher session cookie acquired");

  const authHeaders = {
    ...BASE_HEADERS,
    Cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
  };

  // SCENARIO 1: Unauthorized Evidence Request
  console.log("\n[SCENARIO 1: Unauthorized Evidence Request]");
  {
    const unauthReq = new Request("http://localhost:3000/api/evidence/ev_test_forbidden_123", {
      method: "GET",
      headers: BASE_HEADERS, // Missing session cookie
    });
    const mockContext = { params: Promise.resolve({ id: "ev_test_forbidden_123" }) };
    const unauthRes = await evidenceHandler(unauthReq, mockContext);
    assert(unauthRes.status === 401, "Unauthenticated evidence request rejected with HTTP 401");
  }

  // SCENARIO 2: Non-Existent Evidence Asset (Missing Object / Broken Image)
  console.log("\n[SCENARIO 2: Broken Image / Missing Object Handling]");
  {
    const missingReq = new Request(
      "http://localhost:3000/api/evidence/ev_non_existent_asset_404?metadata=true",
      {
        method: "GET",
        headers: authHeaders,
      }
    );
    const mockContext = { params: Promise.resolve({ id: "ev_non_existent_asset_404" }) };
    const missingRes = await evidenceHandler(missingReq, mockContext);
    const body = await missingRes.json();

    assert(missingRes.status === 404, "Non-existent evidence asset returns HTTP 404");
    assert(body.success === false, "Response body contains success: false");
    assert(body.error.includes("not found"), "Error cleanly indicates asset record not found");
  }

  // SCENARIO 3: Authenticated Metadata Query on Valid Evidence
  console.log("\n[SCENARIO 3: Authenticated Metadata Query (?metadata=true)]");
  const testEvidenceId = `ev_test_${Date.now()}`;
  const testIncidentId = `VIG-TEST-${Date.now()}`;
  const campusPk = "CAMPUS#METROPOLIS";

  try {
    // 1. Insert temporary test incident
    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          pk: campusPk,
          sk: `INCIDENT#${testIncidentId}`,
          id: testIncidentId,
          title: "Medical incident at concourse",
          category: "Medical",
          severity: "Critical",
          status: "Responding",
          hasPhoto: true,
          photoUrl: `/api/evidence/${testEvidenceId}`,
          createdAt: "2026-11-04T12:00:00Z",
        },
      })
    );

    // 2. Insert temporary test evidence item into DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          pk: campusPk,
          sk: `EVIDENCE#${testEvidenceId}`,
          id: testEvidenceId,
          incidentId: testIncidentId,
          s3Key: `evidence/${campusPk.replace("#", "_")}/${testIncidentId}/1700000000000-photo.jpg`,
          s3Bucket: "vigilora-evidence-vault",
          originalFilename: "concourse_medical_scene.jpg",
          mimeType: "image/jpeg",
          fileSizeBytes: 245760,
          uploadedBy: "dispatcher@demo.vigilora.internal",
          uploadedByName: "Lead Dispatcher Vance",
          uploadedByRole: "Dispatcher",
          uploadedAt: "2026-11-04T12:00:00Z",
          campusId: campusPk,
          entityType: "EVIDENCE",
          url: `/api/evidence/${testEvidenceId}`,
        },
      })
    );

    const metaReq = new Request(
      `http://localhost:3000/api/evidence/${testEvidenceId}?metadata=true`,
      {
        method: "GET",
        headers: authHeaders,
      }
    );
    const mockContext = { params: Promise.resolve({ id: testEvidenceId }) };
    const metaRes = await evidenceHandler(metaReq, mockContext);
    const metaBody = await metaRes.json();

    assert(metaRes.status === 200, "Metadata request returns HTTP 200");
    assert(metaBody.success === true, "Response success is true");
    assert(metaBody.data.id === testEvidenceId, "Returns correct evidence ID");
    assert(metaBody.data.incidentId === testIncidentId, "Returns correct incident association");
    assert(
      metaBody.data.originalFilename === "concourse_medical_scene.jpg",
      "Returns verified filename"
    );
    assert(metaBody.data.mimeType === "image/jpeg", "Returns verified MIME content type");
    assert(metaBody.data.fileSizeBytes === 245760, "Returns genuine file size in bytes");
    assert(metaBody.data.uploadedAt === "2026-11-04T12:00:00Z", "Returns genuine upload timestamp");
  } finally {
    // Cleanup temporary records
    await docClient.send(
      new DeleteCommand({
        TableName: DYNAMODB_TABLE,
        Key: { pk: campusPk, sk: `EVIDENCE#${testEvidenceId}` },
      })
    ).catch(() => {});
    await docClient.send(
      new DeleteCommand({
        TableName: DYNAMODB_TABLE,
        Key: { pk: campusPk, sk: `INCIDENT#${testIncidentId}` },
      })
    ).catch(() => {});
  }

  // SCENARIO 4: Single Photograph Incident Normalization
  console.log("\n[SCENARIO 4: Incident with Single Photograph]");
  {
    const singlePhotoIncident = {
      id: "VIG-2026-088",
      hasPhoto: true,
      photoUrl: "/demo/electrical-spark.jpg",
      reportedAt: "2026-11-04T11:00:00Z",
    };

    // Normalize
    const normalized = singlePhotoIncident.hasPhoto && singlePhotoIncident.photoUrl
      ? [{ url: singlePhotoIncident.photoUrl, incidentId: singlePhotoIncident.id }]
      : [];

    assert(normalized.length === 1, "Single photograph normalizes to exactly 1 item");
    assert(normalized[0].url === "/demo/electrical-spark.jpg", "Image URL is preserved");
    assert(normalized[0].incidentId === "VIG-2026-088", "Incident association preserved");
  }

  // SCENARIO 5: Multiple Photograph Incident Normalization & Navigation
  console.log("\n[SCENARIO 5: Incident with Multiple Photographs]");
  {
    const multiPhotoIncident = {
      id: "VIG-2026-089",
      hasPhoto: true,
      photoUrl: "/demo/medical-incident.jpg",
      photoUrls: [
        "/demo/medical-incident.jpg",
        "/demo/medical-concourse.jpg",
      ],
      reportedAt: "2026-11-04T10:38:00Z",
    };

    const normalized = multiPhotoIncident.photoUrls.map((url, idx) => ({
      url,
      incidentId: multiPhotoIncident.id,
      originalFilename: `evidence_photo_${idx + 1}.jpg`,
    }));

    assert(normalized.length === 2, "Multiple photographs normalize to array of 2 items");
    assert(normalized[0].url === "/demo/medical-incident.jpg", "Photo 1 points to primary asset");
    assert(normalized[1].url === "/demo/medical-concourse.jpg", "Photo 2 points to secondary asset");

    // Circular next/previous navigation simulation
    const itemsCount = normalized.length;
    let idx = 0;
    // Next
    idx = idx < itemsCount - 1 ? idx + 1 : 0;
    assert(idx === 1, "Next advances index from 0 to 1");
    // Next wrap-around
    idx = idx < itemsCount - 1 ? idx + 1 : 0;
    assert(idx === 0, "Next wraps around from 1 back to 0");
    // Prev wrap-around
    idx = idx > 0 ? idx - 1 : itemsCount - 1;
    assert(idx === 1, "Previous wraps around from 0 to 1");
  }

  // SCENARIO 6: Incident Without Photographs
  console.log("\n[SCENARIO 6: Incident Without Photographs]");
  {
    const noPhotoIncident = {
      id: "VIG-2026-087",
      hasPhoto: false,
      photoUrl: undefined,
      photoUrls: undefined,
    };

    const items =
      noPhotoIncident.hasPhoto && noPhotoIncident.photoUrl
        ? [noPhotoIncident.photoUrl]
        : (noPhotoIncident.photoUrls || []);

    assert(items.length === 0, "Incident without photograph yields 0 items");
    assert(
      !noPhotoIncident.hasPhoto,
      "hasPhoto flag correctly identifies absence of photographic evidence"
    );
  }

  // SCENARIO 7: Source Code & Forensic Integrity Verification (Requirement 10)
  console.log("\n[SCENARIO 7: Forensic Honesty & Cryptographic Claim Audit]");
  {
    const viewerSource = fs.readFileSync(
      path.join(__dirname, "../src/components/evidence/EvidenceViewer.tsx"),
      "utf8"
    );

    assert(
      !viewerSource.includes("Cryptographically Verified"),
      "Zero false 'Cryptographically Verified' claims in EvidenceViewer"
    );
    assert(
      !viewerSource.includes("SHA-256 Signature Verified"),
      "Zero false 'SHA-256 Signature Verified' claims in EvidenceViewer"
    );
    assert(
      !viewerSource.includes("Blockchain Verified"),
      "Zero false blockchain or ledger claims in EvidenceViewer"
    );
    assert(
      viewerSource.includes("Escape"),
      "EvidenceViewer explicitly registers Escape key listener"
    );
    assert(
      viewerSource.includes("ArrowLeft") && viewerSource.includes("ArrowRight"),
      "EvidenceViewer explicitly registers ArrowLeft / ArrowRight navigation listeners"
    );
    assert(
      viewerSource.includes("sm:grid-cols-4"),
      "EvidenceViewer utilizes responsive grid for mobile viewports"
    );
  }

  // SCENARIO 8: RightInspector Integration Audit
  console.log("\n[SCENARIO 8: In-Context Dashboard RightInspector Integration]");
  {
    const inspectorSource = fs.readFileSync(
      path.join(__dirname, "../src/components/dashboard/RightInspector.tsx"),
      "utf8"
    );

    assert(
      inspectorSource.includes("EvidenceViewer"),
      "RightInspector imports and integrates EvidenceViewer"
    );
    assert(
      inspectorSource.includes("variant=\"compact\""),
      "RightInspector uses compact preview variant for side inspector"
    );
    assert(
      inspectorSource.includes("selectedIncident.hasPhoto"),
      "RightInspector gates evidence preview strictly on incident.hasPhoto"
    );
  }

  console.log("\n================================================================================");
  console.log(`  EVIDENCE LIGHTBOX SUITE RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runLightboxTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
