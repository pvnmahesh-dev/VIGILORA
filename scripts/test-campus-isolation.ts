/**
 * VIGILORA Campus Multi-Tenant Partition Isolation Regression Suite
 *
 * Verifies that the VIGILORA platform strictly bounds every database query,
 * update, assignment, upload, and evidence streaming operation to the
 * authenticated caller's campus partition key.
 *
 * Test Scenarios:
 * 1. Cross-Campus Incident Read (GET /api/incidents/[id]) -> 404 Not Found
 * 2. Cross-Campus Incident Mutation (PATCH /api/incidents/[id]) -> 404 Not Found
 * 3. Cross-Campus Responder Assignment (POST /api/incidents/[id]/assign) -> 404 Not Found
 * 4. Cross-Campus Presigned Upload Authorize (POST /api/upload/authorize) -> 404 Not Found
 * 5. Cross-Campus Evidence Retrieval (GET /api/evidence/[id]) -> 404 Not Found / 403 Forbidden
 * 6. Cross-Campus Team Query Isolation (GET /api/teams) -> Zero cross-partition leakage
 * 7. Cross-Campus Activity Log Isolation (GET /api/activities) -> Zero cross-partition leakage
 */

import { docClient, DYNAMODB_TABLE } from "../src/lib/aws";
import { PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { createSession, SESSION_COOKIE_NAME, hashToken } from "../src/lib/auth";

// Route Handlers
import {
  GET as incidentGetHandler,
  PATCH as incidentPatchHandler,
} from "../src/app/api/incidents/[id]/route";
import { POST as assignHandler } from "../src/app/api/incidents/[id]/assign/route";
import { POST as uploadAuthorizeHandler } from "../src/app/api/upload/authorize/route";
import { GET as evidenceHandler } from "../src/app/api/evidence/[id]/route";
import { GET as teamsHandler } from "../src/app/api/teams/route";
import { GET as activitiesHandler } from "../src/app/api/activities/route";

const CAMPUS_ALPHA = "CAMPUS#TEST-ALPHA-ENCLAVE";
const CAMPUS_BETA = "CAMPUS#TEST-BETA-ENCLAVE";

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

async function runIsolationSuite() {
  console.log("================================================================================");
  console.log("       VIGILORA: CAMPUS PARTITION ISOLATION REGRESSION TEST SUITE               ");
  console.log("================================================================================\n");

  const cleanupKeys: Array<{ pk: string; sk: string }> = [];

  try {
    // 1. Seed Alpha Enclave Data
    console.log("[SETUP: Seeding Multi-Tenant Test Enclaves...]");

    // Incident in Alpha
    const testIncidentId = "VIG-ISO-ALPHA-001";
    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          pk: CAMPUS_ALPHA,
          sk: `INCIDENT#${testIncidentId}`,
          id: testIncidentId,
          title: "Classified Enclave Event - Alpha Sector",
          description: "Proprietary Alpha Sector incident details.",
          status: "Open",
          severity: "High",
          location: "Sector 7 Gate",
          campusId: CAMPUS_ALPHA,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          entityType: "INCIDENT",
        },
      })
    );
    cleanupKeys.push({ pk: CAMPUS_ALPHA, sk: `INCIDENT#${testIncidentId}` });

    // Team in Alpha
    const testTeamId = "TEAM-ALPHA-TACTICAL";
    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          pk: CAMPUS_ALPHA,
          sk: `TEAM#${testTeamId}`,
          id: testTeamId,
          name: "Alpha Tactical Unit",
          callsign: "ALPHA-1",
          status: "AVAILABLE",
          campusId: CAMPUS_ALPHA,
          entityType: "TEAM",
        },
      })
    );
    cleanupKeys.push({ pk: CAMPUS_ALPHA, sk: `TEAM#${testTeamId}` });

    // Evidence in Alpha
    const testEvidenceId = "EVI-ISO-ALPHA-001";
    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          pk: CAMPUS_ALPHA,
          sk: `EVIDENCE#${testEvidenceId}`,
          id: testEvidenceId,
          incidentId: testIncidentId,
          s3Key: `evidence/${CAMPUS_ALPHA}/${testIncidentId}/test-photo.jpg`,
          originalFilename: "surveillance.jpg",
          mimeType: "image/jpeg",
          fileSizeBytes: 2048,
          uploadedAt: new Date().toISOString(),
          uploadedBy: "alpha-operator@vigilora.internal",
          campusId: CAMPUS_ALPHA,
          entityType: "EVIDENCE",
        },
      })
    );
    cleanupKeys.push({ pk: CAMPUS_ALPHA, sk: `EVIDENCE#${testEvidenceId}` });

    // Activity in Alpha
    const testActivitySk = `ACTIVITY#${new Date().toISOString()}#act-iso-alpha-001`;
    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          pk: CAMPUS_ALPHA,
          sk: testActivitySk,
          id: "act-iso-alpha-001",
          type: "STATUS_CHANGE",
          incidentId: testIncidentId,
          actor: "Alpha Watch Commander",
          actorRole: "Dispatcher",
          campusId: CAMPUS_ALPHA,
          timestamp: new Date().toISOString(),
          entityType: "ACTIVITY",
        },
      })
    );
    cleanupKeys.push({ pk: CAMPUS_ALPHA, sk: testActivitySk });

    // 2. Create User Sessions
    // User Alpha (Dispatcher in CAMPUS_ALPHA)
    const { plainToken: alphaToken } = await createSession({
      email: "alpha-dispatcher@vigilora.internal",
      name: "Alpha Dispatcher",
      role: "Dispatcher",
      campusId: CAMPUS_ALPHA,
    });
    cleanupKeys.push({ pk: CAMPUS_ALPHA, sk: `SESSION#${hashToken(alphaToken)}` });

    // User Beta (Dispatcher in CAMPUS_BETA)
    const { plainToken: betaToken } = await createSession({
      email: "beta-dispatcher@vigilora.internal",
      name: "Beta Dispatcher",
      role: "Dispatcher",
      campusId: CAMPUS_BETA,
    });
    cleanupKeys.push({ pk: CAMPUS_BETA, sk: `SESSION#${hashToken(betaToken)}` });

    console.log("  -> Alpha Enclave initialized with incident, team, evidence, activity.");
    console.log("  -> Authenticated sessions generated for User Alpha and User Beta.\n");

    const betaHeaders = {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "x-vigilora-campus-id": CAMPUS_BETA,
      Cookie: `${SESSION_COOKIE_NAME}=${betaToken}`,
    };

    const alphaHeaders = {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "x-vigilora-campus-id": CAMPUS_ALPHA,
      Cookie: `${SESSION_COOKIE_NAME}=${alphaToken}`,
    };

    // SCENARIO 1: Cross-Campus Incident Read
    console.log("[SCENARIO 1: Cross-Campus Incident Read]");
    {
      // User Alpha reads own incident -> Expected: 200 OK
      const alphaReq = new Request(
        `http://localhost:3000/api/incidents/${testIncidentId}`,
        { method: "GET", headers: alphaHeaders }
      );
      const alphaRes = await incidentGetHandler(alphaReq, {
        params: Promise.resolve({ id: testIncidentId }),
      });
      assert(alphaRes.status === 200, "Same-campus incident read allowed (HTTP 200)");

      // User Beta attempts to read Alpha incident -> Expected: 404 Not Found
      const betaReq = new Request(
        `http://localhost:3000/api/incidents/${testIncidentId}`,
        { method: "GET", headers: betaHeaders }
      );
      const betaRes = await incidentGetHandler(betaReq, {
        params: Promise.resolve({ id: testIncidentId }),
      });
      assert(
        betaRes.status === 404,
        "Cross-campus incident read rejected with HTTP 404",
        `Got HTTP ${betaRes.status}`
      );
    }

    // SCENARIO 2: Cross-Campus Incident Mutation
    console.log("\n[SCENARIO 2: Cross-Campus Incident Mutation]");
    {
      const betaReq = new Request(
        `http://localhost:3000/api/incidents/${testIncidentId}`,
        {
          method: "PATCH",
          headers: { ...betaHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "Under review" }),
        }
      );
      const betaRes = await incidentPatchHandler(betaReq, {
        params: Promise.resolve({ id: testIncidentId }),
      });
      assert(
        betaRes.status === 404,
        "Cross-campus incident PATCH mutation rejected with HTTP 404",
        `Got HTTP ${betaRes.status}`
      );
    }

    // SCENARIO 3: Cross-Campus Responder Assignment
    console.log("\n[SCENARIO 3: Cross-Campus Responder Assignment]");
    {
      const betaReq = new Request(
        `http://localhost:3000/api/incidents/${testIncidentId}/assign`,
        {
          method: "POST",
          headers: { ...betaHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ teamId: testTeamId }),
        }
      );
      const betaRes = await assignHandler(betaReq, {
        params: Promise.resolve({ id: testIncidentId }),
      });
      assert(
        betaRes.status === 404,
        "Cross-campus responder assignment rejected with HTTP 404",
        `Got HTTP ${betaRes.status}`
      );
    }

    // SCENARIO 4: Cross-Campus Upload Authorize
    console.log("\n[SCENARIO 4: Cross-Campus Upload Authorize]");
    {
      const betaReq = new Request("http://localhost:3000/api/upload/authorize", {
        method: "POST",
        headers: { ...betaHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: testIncidentId,
          filename: "surveillance.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 1024,
        }),
      });
      const betaRes = await uploadAuthorizeHandler(betaReq);
      assert(
        betaRes.status === 404,
        "Cross-campus upload authorize rejected with HTTP 404",
        `Got HTTP ${betaRes.status}`
      );
    }

    // SCENARIO 5: Cross-Campus Evidence Retrieval
    console.log("\n[SCENARIO 5: Cross-Campus Evidence Retrieval]");
    {
      const betaReq = new Request(
        `http://localhost:3000/api/evidence/${testEvidenceId}`,
        { method: "GET", headers: betaHeaders }
      );
      const betaRes = await evidenceHandler(betaReq, {
        params: Promise.resolve({ id: testEvidenceId }),
      });
      assert(
        betaRes.status === 404 || betaRes.status === 403,
        "Cross-campus evidence access rejected with HTTP 404/403",
        `Got HTTP ${betaRes.status}`
      );
    }

    // SCENARIO 6: Cross-Campus Team Query Isolation
    console.log("\n[SCENARIO 6: Cross-Campus Team Query Isolation]");
    {
      const betaReq = new Request("http://localhost:3000/api/teams", {
        method: "GET",
        headers: betaHeaders,
      });
      const betaRes = await teamsHandler(betaReq);
      const body = await betaRes.json();
      const leakedTeams = (body.teams || []).filter(
        (t: { id: string }) => t.id === testTeamId
      );
      assert(
        betaRes.status === 200 && leakedTeams.length === 0,
        "Zero Alpha teams leaked to Beta campus query",
        `Leaked count: ${leakedTeams.length}`
      );
    }

    // SCENARIO 7: Cross-Campus Activity Log Isolation
    console.log("\n[SCENARIO 7: Cross-Campus Activity Log Isolation]");
    {
      const betaReq = new Request("http://localhost:3000/api/activities", {
        method: "GET",
        headers: betaHeaders,
      });
      const betaRes = await activitiesHandler(betaReq);
      const body = await betaRes.json();
      const leakedEvents = (body.activities || []).filter(
        (e: { incidentId: string }) => e.incidentId === testIncidentId
      );
      assert(
        betaRes.status === 200 && leakedEvents.length === 0,
        "Zero Alpha activities leaked to Beta campus query",
        `Leaked count: ${leakedEvents.length}`
      );
    }
  } finally {
    // Teardown seeded test records
    console.log("\n[CLEANUP: Removing Multi-Tenant Isolation Test Records...]");
    for (const key of cleanupKeys) {
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: DYNAMODB_TABLE,
            Key: key,
          })
        );
      } catch {
        // Non-blocking cleanup
      }
    }
    console.log("  -> Cleanup completed successfully.\n");
  }

  console.log("================================================================================");
  console.log(`ISOLATION TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runIsolationSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
