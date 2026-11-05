/**
 * VIGILORA Hackathon: Field Responder Assigned Incident E2E Test Suite
 *
 * Verifies the complete responder-to-team-to-incident lifecycle:
 * 1. Dispatcher assigns incident VIG-2026-171 to MED-01
 * 2. Officer Vance logs in and receives teamId: "MED-01" association
 * 3. Officer Vance sees VIG-2026-171 on /api/incidents
 * 4. Officer Vance opens VIG-2026-171 (HTTP 200)
 * 5. Officer Vance updates permitted operational status (Responding)
 * 6. Officer Vance cannot modify title, severity, or core classification (HTTP 403)
 * 7. Unauthorized assignment attempts by Responder remain strictly HTTP 403
 * 8. Other campus incidents remain strictly inaccessible to Officer Vance (HTTP 403 / filtered)
 * 9. Dispatcher and Supervisor retain full campus-wide visibility and administrative authority
 */

import fs from "node:fs";
import path from "node:path";
import { authenticateUser, createSession, SESSION_COOKIE_NAME } from "../src/lib/auth";
import { GET as getIncidentsHandler } from "../src/app/api/incidents/route";
import { GET as getIncidentHandler, PATCH as patchIncidentHandler } from "../src/app/api/incidents/[id]/route";
import { POST as assignTeamHandler } from "../src/app/api/incidents/[id]/assign/route";
import { PATCH as patchSettingsHandler } from "../src/app/api/settings/route";
import { GET as getTeamsHandler } from "../src/app/api/teams/route";

const CREDENTIALS_FILE = path.join(process.cwd(), ".demo-credentials.json");

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function runResponderE2ESuite() {
  console.log("================================================================================");
  console.log("   VIGILORA HACKATHON: FIELD RESPONDER ASSIGNED INCIDENT E2E TEST SUITE");
  console.log("================================================================================\n");

  if (!fs.existsSync(CREDENTIALS_FILE)) {
    console.error("[FATAL] .demo-credentials.json not found.");
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf-8"));

  // ---------------------------------------------------------------------------
  // SETUP: Authenticate All 3 Demo Roles
  // ---------------------------------------------------------------------------
  console.log("[SETUP: Authenticating Dispatcher, Responder & Supervisor Sessions]");

  const dispCred = credentials["Dispatcher"];
  const respCred = credentials["Responder"];
  const supCred = credentials["Supervisor"];

  const dispAuth = await authenticateUser(dispCred.email, dispCred.password, "127.0.0.1");
  assert(!("error" in dispAuth), "Dispatcher authenticated successfully");
  const dispUser = "user" in dispAuth ? dispAuth.user : null;
  const dispSession = dispUser ? await createSession(dispUser) : null;

  const respAuth = await authenticateUser(respCred.email, respCred.password, "127.0.0.1");
  assert(!("error" in respAuth), "Field Responder (Officer Vance) authenticated successfully");
  const respUser = "user" in respAuth ? respAuth.user : null;
  assert(respUser?.teamId === "MED-01", "Officer Vance is explicitly associated with tactical unit MED-01");
  const respSession = respUser ? await createSession(respUser) : null;

  const supAuth = await authenticateUser(supCred.email, supCred.password, "127.0.0.1");
  assert(!("error" in supAuth), "Campus Administrator authenticated successfully");
  const supUser = "user" in supAuth ? supAuth.user : null;
  const supSession = supUser ? await createSession(supUser) : null;

  const dispHeaders = {
    cookie: `${SESSION_COOKIE_NAME}=${dispSession?.plainToken}`,
    host: "localhost:3000",
    "x-vigilora-test-client": "active-test-suite",
  };

  const respHeaders = {
    cookie: `${SESSION_COOKIE_NAME}=${respSession?.plainToken}`,
    host: "localhost:3000",
    "x-vigilora-test-client": "active-test-suite",
  };

  const supHeaders = {
    cookie: `${SESSION_COOKIE_NAME}=${supSession?.plainToken}`,
    host: "localhost:3000",
    "x-vigilora-test-client": "active-test-suite",
  };

  // ---------------------------------------------------------------------------
  // SCENARIO 1: Dispatcher Assigns VIG-2026-171 to MED-01
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 1: Dispatcher Assigns VIG-2026-171 to MED-01]");
  const assignRes = await assignTeamHandler(
    new Request("http://localhost:3000/api/incidents/VIG-2026-171/assign", {
      method: "POST",
      headers: dispHeaders,
      body: JSON.stringify({ teamId: "MED-01", action: "assign" }),
    }),
    { params: Promise.resolve({ id: "VIG-2026-171" }) }
  );

  assert(assignRes.status === 200, "Dispatcher assignment returns HTTP 200");
  const assignBody = await assignRes.json();
  assert(assignBody.success === true, "Assignment reports success = true");
  assert(assignBody.data?.assignedTeamId === "MED-01", "Assigned team is MED-01");
  assert(assignBody.data?.status === "Assigned", "Incident status transitioned to 'Assigned'");

  // ---------------------------------------------------------------------------
  // SCENARIO 2: Officer Vance Logs In & Queries /api/incidents
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 2: Officer Vance Incident Visibility & Boundary Isolation]");
  const respIncListRes = await getIncidentsHandler(
    new Request("http://localhost:3000/api/incidents", {
      method: "GET",
      headers: respHeaders,
    })
  );

  assert(respIncListRes.status === 200, "GET /api/incidents returns HTTP 200 for Field Responder");
  const respIncListData = await respIncListRes.json();
  assert(Array.isArray(respIncListData.data), "Incidents payload is an array");

  const vanceIncidents = respIncListData.data as Array<{ id: string; assignedTeamId?: string }>;
  const has171 = vanceIncidents.some((i) => i.id === "VIG-2026-171");
  assert(has171, "Officer Vance SEES assigned incident VIG-2026-171");

  // Verify other campus incidents are NOT visible to Officer Vance
  const has172 = vanceIncidents.some((i) => i.id === "VIG-2026-172");
  const has173 = vanceIncidents.some((i) => i.id === "VIG-2026-173");
  assert(!has172, "Unassigned incident VIG-2026-172 is HIDDEN from Officer Vance");
  assert(!has173, "Unassigned incident VIG-2026-173 is HIDDEN from Officer Vance");
  assert(
    vanceIncidents.every((i) => i.assignedTeamId === "MED-01"),
    "All incidents visible to Officer Vance are strictly assigned to MED-01"
  );

  // ---------------------------------------------------------------------------
  // SCENARIO 3: Officer Vance Opens VIG-2026-171 & Inaccessible Probing
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 3: Direct Incident Inspection & Access Control]");
  const openAssigned = await getIncidentHandler(
    new Request("http://localhost:3000/api/incidents/VIG-2026-171", {
      method: "GET",
      headers: respHeaders,
    }),
    { params: Promise.resolve({ id: "VIG-2026-171" }) }
  );
  assert(openAssigned.status === 200, "Officer Vance opens assigned incident VIG-2026-171 (HTTP 200)");
  const openAssignedData = await openAssigned.json();
  assert(openAssignedData.data?.incident?.id === "VIG-2026-171", "Incident details retrieved correctly");
  assert(openAssignedData.data?.incident?.assignedTeamId === "MED-01", "Assigned team confirmed as MED-01");

  // Attempting to open another campus incident not assigned to MED-01
  const openOther = await getIncidentHandler(
    new Request("http://localhost:3000/api/incidents/VIG-2026-172", {
      method: "GET",
      headers: respHeaders,
    }),
    { params: Promise.resolve({ id: "VIG-2026-172" }) }
  );
  assert(openOther.status === 403, "Other campus incident VIG-2026-172 is FORBIDDEN to Officer Vance (HTTP 403)");
  const openOtherData = await openOther.json();
  assert(openOtherData.success === false, "Access denied reported cleanly");

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Officer Vance Updates Permitted Operational Status
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 4: Field Responder Permitted Status Transitions]");
  // Transition Assigned -> Responding (On Scene)
  const updateStatusRes = await patchIncidentHandler(
    new Request("http://localhost:3000/api/incidents/VIG-2026-171", {
      method: "PATCH",
      headers: respHeaders,
      body: JSON.stringify({
        status: "Responding",
        notes: "Officer Vance & MED-01 arrived on scene at sports complex. Commencing medical triage.",
      }),
    }),
    { params: Promise.resolve({ id: "VIG-2026-171" }) }
  );

  assert(updateStatusRes.status === 200, "Officer Vance successfully updates status to 'Responding' (HTTP 200)");
  const updateStatusBody = await updateStatusRes.json();
  assert(updateStatusBody.success === true, "Status update reports success = true");
  assert(updateStatusBody.data?.status === "Responding", "Incident status transitioned to 'Responding'");

  // Verify persistence in DynamoDB
  const verifyPersisted = await getIncidentHandler(
    new Request("http://localhost:3000/api/incidents/VIG-2026-171", {
      method: "GET",
      headers: respHeaders,
    }),
    { params: Promise.resolve({ id: "VIG-2026-171" }) }
  );
  const verifyData = await verifyPersisted.json();
  assert(verifyData.data?.incident?.status === "Responding", "Persistent status in DynamoDB is 'Responding'");

  // Reset status back to Assigned for demo stability
  const resetToAssigned = await patchIncidentHandler(
    new Request("http://localhost:3000/api/incidents/VIG-2026-171", {
      method: "PATCH",
      headers: respHeaders,
      body: JSON.stringify({
        status: "Assigned",
        notes: "Unit standing by for ongoing demonstration.",
      }),
    }),
    { params: Promise.resolve({ id: "VIG-2026-171" }) }
  );
  assert(resetToAssigned.status === 200, "Officer Vance resets status to 'Assigned' (HTTP 200)");

  // ---------------------------------------------------------------------------
  // SCENARIO 5: Prohibited Mutations by Field Responder
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 5: Guardrails - Prohibited Modifications by Field Responder]");
  // Field Responder cannot modify title or core incident classification
  const forbiddenFieldUpdate = await patchIncidentHandler(
    new Request("http://localhost:3000/api/incidents/VIG-2026-171", {
      method: "PATCH",
      headers: respHeaders,
      body: JSON.stringify({
        title: "Malicious title rewrite by field responder",
      }),
    }),
    { params: Promise.resolve({ id: "VIG-2026-171" }) }
  );
  assert(
    forbiddenFieldUpdate.status === 403,
    "Officer Vance is FORBIDDEN from modifying incident title/classification (HTTP 403)"
  );

  // Field Responder cannot assign or reassign tactical units
  const forbiddenAssignAttempt = await assignTeamHandler(
    new Request("http://localhost:3000/api/incidents/VIG-2026-171/assign", {
      method: "POST",
      headers: respHeaders,
      body: JSON.stringify({ teamId: "SEC-01", action: "assign" }),
    }),
    { params: Promise.resolve({ id: "VIG-2026-171" }) }
  );
  assert(
    forbiddenAssignAttempt.status === 403,
    "Officer Vance is FORBIDDEN from assigning teams (HTTP 403)"
  );

  // Field Responder cannot mutate campus emergency settings
  const forbiddenSettings = await patchSettingsHandler(
    new Request("http://localhost:3000/api/settings", {
      method: "PATCH",
      headers: respHeaders,
      body: JSON.stringify({ campusName: "Hacked Campus" }),
    })
  );
  assert(
    forbiddenSettings.status === 403,
    "Officer Vance is FORBIDDEN from changing administrator settings (HTTP 403)"
  );

  // ---------------------------------------------------------------------------
  // SCENARIO 6: Preservation of Dispatcher & Administrator Full Access
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 6: Full Campus Access Preserved for Dispatcher & Administrator]");
  // Dispatcher sees ALL campus incidents
  const dispAllInc = await getIncidentsHandler(
    new Request("http://localhost:3000/api/incidents", {
      method: "GET",
      headers: dispHeaders,
    })
  );
  const dispAllData = await dispAllInc.json();
  assert(dispAllInc.status === 200, "Dispatcher queries all incidents (HTTP 200)");
  assert(dispAllData.data.length >= 3, `Dispatcher sees all campus incidents (found ${dispAllData.data.length})`);
  const dispHas171 = dispAllData.data.some((i: { id: string }) => i.id === "VIG-2026-171");
  const dispHas172 = dispAllData.data.some((i: { id: string }) => i.id === "VIG-2026-172");
  assert(dispHas171 && dispHas172, "Dispatcher retains full campus-wide visibility across all incidents");

  // Administrator can modify settings
  const supSettingsRes = await patchSettingsHandler(
    new Request("http://localhost:3000/api/settings", {
      method: "PATCH",
      headers: supHeaders,
      body: JSON.stringify({ dispatchHotline: "+1 (555) 991-1111" }),
    })
  );
  assert(supSettingsRes.status === 200, "Campus Administrator is AUTHORIZED to update settings (HTTP 200)");

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`  FIELD RESPONDER E2E SUITE: ${passed} PASSED | ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runResponderE2ESuite().catch((err) => {
  console.error("Unhandled error in responder E2E suite:", err);
  process.exit(1);
});

