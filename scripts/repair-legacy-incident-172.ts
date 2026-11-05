/**
 * VIGILORA — APPROVED LEGACY INCIDENT DATA REPAIR SCRIPT
 *
 * Repairs legacy inconsistent record VIG-2026-172:
 * - Target: VIG-2026-172
 * - Current Status: Assigned (without assignedTeamId)
 * - Target Status: Under review
 * - Preserves existing incident details and activity history
 * - Assigns no tactical team
 * - Appends audit status change entry
 * - Verifies RBAC visibility: Admin/Dispatcher visible, Responder hidden (HTTP 403)
 * - Verifies zero collateral impact on other incidents or teams
 */

import { docClient, DYNAMODB_TABLE, getCampusPartitionKey } from "../src/lib/aws";
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { POST as demoLoginHandler } from "../src/app/api/auth/demo-login/route";
import { PATCH as patchIncidentHandler, GET as getIncidentHandler } from "../src/app/api/incidents/[id]/route";
import { GET as getIncidentsHandler } from "../src/app/api/incidents/route";
import { SESSION_COOKIE_NAME } from "../src/lib/auth";
import { Incident } from "../src/types/incident";
import { ResponseTeam } from "../src/types/team";

function extractCookie(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  const match = setCookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

const BASE_HEADERS = {
  host: "localhost:3000",
  origin: "http://localhost:3000",
  "x-vigilora-repair-client": "legacy-repair-172",
};

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

async function runRepair() {
  console.log("================================================================================");
  console.log("       VIGILORA — APPROVED LEGACY INCIDENT DATA REPAIR (VIG-2026-172)");
  console.log("================================================================================\n");

  const pk = getCampusPartitionKey();
  console.log(`[TARGET DYNAMODB TABLE]: ${DYNAMODB_TABLE}`);
  console.log(`[TARGET PARTITION KEY]: ${pk}\n`);

  // ---------------------------------------------------------------------------
  // STEP 1: Inspect Pre-Repair State
  // ---------------------------------------------------------------------------
  console.log("[PHASE 1: Inspect Pre-Repair DynamoDB State]");

  const preRes = await docClient.send(
    new GetCommand({
      TableName: DYNAMODB_TABLE,
      Key: { pk, sk: "INCIDENT#VIG-2026-172" },
    })
  );

  assert(Boolean(preRes.Item), "VIG-2026-172 exists in DynamoDB");
  const preIncident = preRes.Item as Incident;
  console.log(`  Current Status: ${preIncident.status}`);
  console.log(`  Current assignedTeamId: ${preIncident.assignedTeamId ?? "undefined"}`);
  console.log(`  Current Title: "${preIncident.title}"`);
  console.log(`  Current Severity: ${preIncident.severity}`);
  console.log(`  Current Location: ${preIncident.location.building} (${preIncident.location.zone})`);

  // Count existing activities
  const preActRes = await docClient.send(
    new QueryCommand({
      TableName: DYNAMODB_TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      FilterExpression: "incidentId = :incId",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":prefix": "ACTIVITY#",
        ":incId": "VIG-2026-172",
      },
      ScanIndexForward: true,
    })
  );
  const preActCount = preActRes.Items?.length || 0;
  console.log(`  Pre-repair activity count: ${preActCount}\n`);

  // Snapshot other incidents and teams before repair
  const otherIncResBefore = await docClient.send(
    new QueryCommand({
      TableName: DYNAMODB_TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": pk, ":prefix": "INCIDENT#" },
    })
  );
  const otherIncidentsBefore = (otherIncResBefore.Items || []).filter(
    (i) => i.id !== "VIG-2026-172"
  );

  const teamsResBefore = await docClient.send(
    new QueryCommand({
      TableName: DYNAMODB_TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": pk, ":prefix": "TEAM#" },
    })
  );
  const teamsBefore = teamsResBefore.Items || [];

  // ---------------------------------------------------------------------------
  // STEP 2: Authenticate Authorized Session
  // ---------------------------------------------------------------------------
  console.log("[PHASE 2: Authenticate Supervisor Session]");
  const loginRes = await demoLoginHandler(
    new Request("http://localhost:3000/api/auth/demo-login", {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "Supervisor" }),
    })
  );
  const adminCookie = extractCookie(loginRes);
  assert(Boolean(adminCookie), "Supervisor/Admin authenticated successfully");
  const adminHeaders = {
    ...BASE_HEADERS,
    Cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
    "Content-Type": "application/json",
  };

  // ---------------------------------------------------------------------------
  // STEP 3: Execute Authorized Repair Workflow
  // ---------------------------------------------------------------------------
  console.log("\n[PHASE 3: Execute Authorized Incident Update Workflow (PATCH /api/incidents/VIG-2026-172)]");

  const repairPayload = {
    status: "Under review",
    notes: "Approved legacy incident data repair: Reverted inconsistent Assigned status to Under review (no tactical team assigned).",
  };

  const patchRes = await patchIncidentHandler(
    new Request("http://localhost:3000/api/incidents/VIG-2026-172", {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify(repairPayload),
    }),
    { params: Promise.resolve({ id: "VIG-2026-172" }) }
  );

  assert(patchRes.status === 200, `PATCH returns HTTP 200 (got ${patchRes.status})`);
  const patchData = await patchRes.json();
  assert(patchData.success === true, "Response reports success: true");
  assert(patchData.data?.status === "Under review", "Updated status in response is 'Under review'");
  assert(patchData.data?.assignedTeamId === undefined || patchData.data?.assignedTeamId === null, "No tactical team assigned in response");
  assert(Boolean(patchData.activity), "Status correction activity returned in response");

  // ---------------------------------------------------------------------------
  // STEP 4: Direct DynamoDB Record Verification
  // ---------------------------------------------------------------------------
  console.log("\n[PHASE 4: Direct DynamoDB Record Verification]");

  const postRes = await docClient.send(
    new GetCommand({
      TableName: DYNAMODB_TABLE,
      Key: { pk, sk: "INCIDENT#VIG-2026-172" },
    })
  );

  const postIncident = postRes.Item as Incident;
  assert(Boolean(postIncident), "VIG-2026-172 fetched from DynamoDB");
  assert(postIncident.status === "Under review", "Persistent status in DynamoDB is 'Under review'");
  assert(!postIncident.assignedTeamId, "Persistent assignedTeamId remains undefined/null (no team assigned)");
  assert(postIncident.title === preIncident.title, "Incident title preserved ('" + preIncident.title + "')");
  assert(postIncident.description === preIncident.description, "Incident description preserved");
  assert(postIncident.category === preIncident.category, "Incident category preserved ('" + preIncident.category + "')");
  assert(postIncident.severity === preIncident.severity, "Incident severity preserved ('" + preIncident.severity + "')");
  assert(postIncident.reportedAt === preIncident.reportedAt, "Incident reportedAt timestamp preserved ('" + preIncident.reportedAt + "')");
  assert(postIncident.location.building === preIncident.location.building, "Location building preserved ('" + preIncident.location.building + "')");
  assert(postIncident.location.zone === preIncident.location.zone, "Location zone preserved ('" + preIncident.location.zone + "')");
  assert(Boolean(postIncident.updatedAt), "updatedAt timestamp refreshed");

  // Verify Activity Audit Log
  const postActRes = await docClient.send(
    new QueryCommand({
      TableName: DYNAMODB_TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      FilterExpression: "incidentId = :incId",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":prefix": "ACTIVITY#",
        ":incId": "VIG-2026-172",
      },
      ScanIndexForward: true,
    })
  );

  const postActs = postActRes.Items || [];
  assert(postActs.length === preActCount + 1, `Activity log grew from ${preActCount} to ${postActs.length} (exactly 1 audit record appended)`);

  const latestAct = postActs[postActs.length - 1];
  assert(latestAct.type === "status_change", "Latest activity type is 'status_change'");
  assert(latestAct.action.includes("Approved legacy incident data repair"), "Latest activity records exact repair note");
  assert(latestAct.actorRole === "Supervisor", "Latest activity records actorRole 'Supervisor'");
  assert(latestAct.incidentId === "VIG-2026-172", "Latest activity is linked to incidentId 'VIG-2026-172'");

  // ---------------------------------------------------------------------------
  // STEP 5: Verify Role-Based Visibility (Admin, Dispatcher, Responder)
  // ---------------------------------------------------------------------------
  console.log("\n[PHASE 5: Verify Role-Based Visibility]");

  // 5a. Admin visibility
  const adminIncRes = await getIncidentsHandler(
    new Request("http://localhost:3000/api/incidents", { method: "GET", headers: adminHeaders })
  );
  assert(adminIncRes.status === 200, "GET /api/incidents as Admin returns HTTP 200");
  const adminData = await adminIncRes.json();
  const adminHas172 = adminData.data?.some((i: { id: string }) => i.id === "VIG-2026-172");
  assert(adminHas172, "VIG-2026-172 remains visible to Admin (Supervisor)");

  // 5b. Dispatcher visibility
  const dispLoginRes = await demoLoginHandler(
    new Request("http://localhost:3000/api/auth/demo-login", {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "Dispatcher" }),
    })
  );
  const dispCookie = extractCookie(dispLoginRes);
  assert(Boolean(dispCookie), "Dispatcher authenticated successfully");
  const dispHeaders = {
    ...BASE_HEADERS,
    Cookie: `${SESSION_COOKIE_NAME}=${dispCookie}`,
  };

  const dispIncRes = await getIncidentsHandler(
    new Request("http://localhost:3000/api/incidents", { method: "GET", headers: dispHeaders })
  );
  assert(dispIncRes.status === 200, "GET /api/incidents as Dispatcher returns HTTP 200");
  const dispData = await dispIncRes.json();
  const dispHas172 = dispData.data?.some((i: { id: string }) => i.id === "VIG-2026-172");
  assert(dispHas172, "VIG-2026-172 remains visible to Dispatcher");

  // 5c. Responder visibility (Officer Vance - Team MED-01)
  const respLoginRes = await demoLoginHandler(
    new Request("http://localhost:3000/api/auth/demo-login", {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "Responder" }),
    })
  );
  const respCookie = extractCookie(respLoginRes);
  assert(Boolean(respCookie), "Field Responder authenticated successfully");
  const respHeaders = {
    ...BASE_HEADERS,
    Cookie: `${SESSION_COOKIE_NAME}=${respCookie}`,
  };

  const respIncRes = await getIncidentsHandler(
    new Request("http://localhost:3000/api/incidents", { method: "GET", headers: respHeaders })
  );
  assert(respIncRes.status === 200, "GET /api/incidents as Responder returns HTTP 200");
  const respData = await respIncRes.json();
  const respHas172 = respData.data?.some((i: { id: string }) => i.id === "VIG-2026-172");
  assert(!respHas172, "VIG-2026-172 remains strictly HIDDEN from Responder incident list");

  // Direct access to /api/incidents/VIG-2026-172 by Responder must be 403 Forbidden
  const respDirectRes = await getIncidentHandler(
    new Request("http://localhost:3000/api/incidents/VIG-2026-172", { method: "GET", headers: respHeaders }),
    { params: Promise.resolve({ id: "VIG-2026-172" }) }
  );
  assert(respDirectRes.status === 403, `Direct access to VIG-2026-172 by Responder returns HTTP 403 Forbidden (got ${respDirectRes.status})`);

  // ---------------------------------------------------------------------------
  // STEP 6: Collateral Integrity Check (Other Incidents and Teams)
  // ---------------------------------------------------------------------------
  console.log("\n[PHASE 6: Verify Zero Collateral Impact]");

  // Verify other incidents untouched
  const otherIncResAfter = await docClient.send(
    new QueryCommand({
      TableName: DYNAMODB_TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": pk, ":prefix": "INCIDENT#" },
    })
  );
  const otherIncidentsAfter = (otherIncResAfter.Items || []).filter(
    (i) => i.id !== "VIG-2026-172"
  );

  assert(otherIncidentsAfter.length === otherIncidentsBefore.length, `Other incidents count unchanged (${otherIncidentsAfter.length})`);
  for (const beforeInc of otherIncidentsBefore) {
    const afterInc = otherIncidentsAfter.find((i) => i.id === beforeInc.id);
    assert(Boolean(afterInc), `Incident ${beforeInc.id} exists`);
    assert(afterInc?.status === beforeInc.status, `Incident ${beforeInc.id} status unchanged ('${afterInc?.status}')`);
    assert(afterInc?.assignedTeamId === beforeInc.assignedTeamId, `Incident ${beforeInc.id} assignedTeamId unchanged`);
  }

  // Verify teams untouched
  const teamsResAfter = await docClient.send(
    new QueryCommand({
      TableName: DYNAMODB_TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": pk, ":prefix": "TEAM#" },
    })
  );
  const teamsAfter = teamsResAfter.Items || [];
  assert(teamsAfter.length === teamsBefore.length, `Teams count unchanged (${teamsAfter.length})`);
  for (const beforeTeam of teamsBefore) {
    const afterTeam = teamsAfter.find((t) => t.id === beforeTeam.id);
    assert(Boolean(afterTeam), `Team ${beforeTeam.id} exists`);
    assert(afterTeam?.status === beforeTeam.status, `Team ${beforeTeam.id} status unchanged ('${afterTeam?.status}')`);
    assert(afterTeam?.activeIncidentId === beforeTeam.activeIncidentId, `Team ${beforeTeam.id} activeIncidentId unchanged`);
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`  REPAIR & VERIFICATION SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runRepair().catch((err) => {
  console.error("FATAL ERROR during repair:", err);
  process.exit(1);
});

