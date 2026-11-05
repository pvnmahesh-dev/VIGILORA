/**
 * VIGILORA — INCIDENT ASSIGNMENT INTEGRITY REGRESSION TEST SUITE
 *
 * Verifies all requirements:
 * 1. Assigned incident with valid team:
 *    - Assigning a valid available team transitions incident to "Assigned" and sets assignedTeamId.
 *    - Updates team status to "En Route" and records dispatch activity.
 * 2. Assigned incident without a team:
 *    - Direct transition to "Assigned" via PATCH without a team is strictly rejected (HTTP 422).
 *    - Transition to "Responding" without a team is strictly rejected (HTTP 422).
 *    - Incident retains its original status and assignedTeamId remains undefined.
 * 3. Invalid team ID:
 *    - Assigning non-existent team ID is strictly rejected (HTTP 404).
 *    - Assigning missing/empty team ID is rejected (HTTP 400).
 *    - Previous incident state preserved intact.
 * 4. Failed assignment preserves previous state:
 *    - Assigning to already resolved incident is rejected (HTTP 409).
 *    - Assigning a committed/busy unit is rejected (HTTP 409).
 *    - Unassigning an incident with no team is rejected (HTTP 400).
 *    - DynamoDB state remains completely untouched on failure.
 * 5. Responder visibility after assignment:
 *    - Responder only sees incidents assigned to their unit (MED-01).
 *    - Unassigned incidents (VIG-2026-172, VIG-2026-173) are hidden from Responder.
 *    - Dynamically assigned incident becomes visible to Responder.
 *    - Unassigning unit immediately revokes Responder visibility.
 *    - Responder is forbidden (HTTP 403) from executing team assignments.
 */

import { POST as demoLoginHandler } from "../src/app/api/auth/demo-login/route";
import { GET as getIncidentsHandler, POST as createIncidentHandler } from "../src/app/api/incidents/route";
import { GET as getIncidentHandler, PATCH as patchIncidentHandler } from "../src/app/api/incidents/[id]/route";
import { POST as assignTeamHandler } from "../src/app/api/incidents/[id]/assign/route";
import { GET as getTeamsHandler } from "../src/app/api/teams/route";
import { validateIncidentStatusTransition } from "../src/lib/validation";
import { SESSION_COOKIE_NAME } from "../src/lib/auth";
import { docClient, DYNAMODB_TABLE, getCampusPartitionKey } from "../src/lib/aws";
import { DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

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
  "x-vigilora-test-client": "assignment-integrity-suite",
};

const TEST_INCIDENTS_TO_CLEANUP: string[] = [];

async function deleteTestIncident(incidentId: string) {
  const pk = getCampusPartitionKey();
  try {
    await docClient.send(
      new DeleteCommand({
        TableName: DYNAMODB_TABLE,
        Key: { pk, sk: `INCIDENT#${incidentId}` },
      })
    );
  } catch (e) {
    console.warn(`Failed to cleanup test incident ${incidentId}:`, e);
  }
}

async function runAssignmentIntegritySuite() {
  console.log("================================================================================");
  console.log("     VIGILORA — INCIDENT ASSIGNMENT INTEGRITY REGRESSION TEST SUITE");
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // STEP 1: Authenticate Sessions (Supervisor, Dispatcher, Responder)
  // ---------------------------------------------------------------------------
  console.log("[SETUP: Authenticating Test Sessions]");

  const adminLoginRes = await demoLoginHandler(
    new Request("http://localhost:3000/api/auth/demo-login", {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "Supervisor" }),
    })
  );
  const adminCookie = extractCookie(adminLoginRes);
  assert(Boolean(adminCookie), "Supervisor/Admin session authenticated");

  const dispLoginRes = await demoLoginHandler(
    new Request("http://localhost:3000/api/auth/demo-login", {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "Dispatcher" }),
    })
  );
  const dispCookie = extractCookie(dispLoginRes);
  assert(Boolean(dispCookie), "Dispatcher session authenticated");

  const respLoginRes = await demoLoginHandler(
    new Request("http://localhost:3000/api/auth/demo-login", {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "Responder" }),
    })
  );
  const respCookie = extractCookie(respLoginRes);
  assert(Boolean(respCookie), "Field Responder session authenticated (Officer Vance, MED-01)");

  const dispHeaders = {
    ...BASE_HEADERS,
    "Content-Type": "application/json",
    Cookie: `${SESSION_COOKIE_NAME}=${dispCookie}`,
  };

  const respHeaders = {
    ...BASE_HEADERS,
    "Content-Type": "application/json",
    Cookie: `${SESSION_COOKIE_NAME}=${respCookie}`,
  };

  const adminHeaders = {
    ...BASE_HEADERS,
    "Content-Type": "application/json",
    Cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
  };

  // Helper to create a test incident
  async function createTestIncident(title: string): Promise<string> {
    const res = await createIncidentHandler(
      new Request("http://localhost:3000/api/incidents", {
        method: "POST",
        headers: dispHeaders,
        body: JSON.stringify({
          title,
          description: "Regression test incident created for assignment integrity verification.",
          severity: "Medium",
          category: "Security",
          zone: "West Campus",
          building: "Test Research Annex",
        }),
      })
    );
    const data = await res.json();
    assert(res.status === 201 && data.success, `Created test incident ${data.data?.id}`);
    TEST_INCIDENTS_TO_CLEANUP.push(data.data.id);
    return data.data.id;
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 1: Assigned Incident with Valid Team
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 1: Assigned Incident with Valid Team]");
  const inc1Id = await createTestIncident("Scenario 1 - Valid Assignment Test");

  // Verify initial state is "Reported" with no assigned team
  const inc1InitRes = await getIncidentHandler(
    new Request(`http://localhost:3000/api/incidents/${inc1Id}`, {
      method: "GET",
      headers: dispHeaders,
    }),
    { params: Promise.resolve({ id: inc1Id }) }
  );
  const inc1InitData = await inc1InitRes.json();
  assert(inc1InitData.data?.incident?.status === "Reported", "Initial status is 'Reported'");
  assert(!inc1InitData.data?.incident?.assignedTeamId, "Initial assignedTeamId is undefined");

  // Dispatch valid team SEC-01
  const assignSecRes = await assignTeamHandler(
    new Request(`http://localhost:3000/api/incidents/${inc1Id}/assign`, {
      method: "POST",
      headers: dispHeaders,
      body: JSON.stringify({ teamId: "SEC-01", action: "assign" }),
    }),
    { params: Promise.resolve({ id: inc1Id }) }
  );

  assert(assignSecRes.status === 200, "POST /assign returns HTTP 200 for valid team SEC-01");
  const assignSecData = await assignSecRes.json();
  assert(assignSecData.success === true, "Assignment reports success = true");
  assert(assignSecData.data?.status === "Assigned", "Incident status transitioned to 'Assigned'");
  assert(assignSecData.data?.assignedTeamId === "SEC-01", "assignedTeamId is 'SEC-01'");
  assert(assignSecData.data?.assignedResponder === "Campus Security Unit", "assignedResponder is 'Campus Security Unit'");
  assert(assignSecData.activity?.type === "dispatch", "Activity event of type 'dispatch' created");

  // Verify persistent state in DynamoDB
  const inc1PersistRes = await getIncidentHandler(
    new Request(`http://localhost:3000/api/incidents/${inc1Id}`, {
      method: "GET",
      headers: dispHeaders,
    }),
    { params: Promise.resolve({ id: inc1Id }) }
  );
  const inc1PersistData = await inc1PersistRes.json();
  assert(inc1PersistData.data?.incident?.status === "Assigned", "Persistent status in DynamoDB is 'Assigned'");
  assert(inc1PersistData.data?.incident?.assignedTeamId === "SEC-01", "Persistent assignedTeamId in DynamoDB is 'SEC-01'");

  // Verify team SEC-01 status updated to 'En Route'
  const teamsRes1 = await getTeamsHandler(
    new Request("http://localhost:3000/api/teams", { method: "GET", headers: dispHeaders })
  );
  const teamsData1 = await teamsRes1.json();
  const sec01Team = teamsData1.data?.find((t: { id: string }) => t.id === "SEC-01");
  assert(sec01Team?.status === "En Route", "SEC-01 status transitioned to 'En Route'");
  assert(sec01Team?.activeIncidentId === inc1Id, `SEC-01 activeIncidentId is ${inc1Id}`);

  // Clean up assignment: unassign SEC-01
  const unassignSecRes = await assignTeamHandler(
    new Request(`http://localhost:3000/api/incidents/${inc1Id}/assign`, {
      method: "POST",
      headers: dispHeaders,
      body: JSON.stringify({ action: "unassign" }),
    }),
    { params: Promise.resolve({ id: inc1Id }) }
  );
  assert(unassignSecRes.status === 200, "Unassigned SEC-01 successfully (HTTP 200)");
  const unassignSecData = await unassignSecRes.json();
  assert(unassignSecData.data?.status === "Under review", "Unassign reverts incident status to 'Under review'");
  assert(unassignSecData.data?.assignedTeamId === null, "assignedTeamId cleared after unassign");

  // ---------------------------------------------------------------------------
  // SCENARIO 2: Assigned Incident Without a Team (Strict Rejection)
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 2: Assigned Incident Without a Team — Invariant Rejection]");
  const inc2Id = await createTestIncident("Scenario 2 - Unassigned State Invariant Test");

  // Unit-level validation test
  const unitCheckWithoutTeam = validateIncidentStatusTransition("Reported", "Assigned", "Dispatcher", false);
  assert(unitCheckWithoutTeam.valid === false, "validateIncidentStatusTransition rejects 'Assigned' when hasAssignedTeam=false");
  assert(
    Boolean(unitCheckWithoutTeam.error?.includes("tactical response unit")),
    "Validation error mentions tactical response unit requirement"
  );

  const unitCheckWithTeam = validateIncidentStatusTransition("Reported", "Assigned", "Dispatcher", true);
  assert(unitCheckWithTeam.valid === true, "validateIncidentStatusTransition permits 'Assigned' when hasAssignedTeam=true");

  const respondingCheckWithoutTeam = validateIncidentStatusTransition("Reported", "Responding", "Dispatcher", false);
  assert(respondingCheckWithoutTeam.valid === false, "validateIncidentStatusTransition rejects 'Responding' when hasAssignedTeam=false");

  // API-level PATCH test: attempt to transition unassigned incident to "Assigned"
  const patchWithoutTeamRes = await patchIncidentHandler(
    new Request(`http://localhost:3000/api/incidents/${inc2Id}`, {
      method: "PATCH",
      headers: dispHeaders,
      body: JSON.stringify({ status: "Assigned" }),
    }),
    { params: Promise.resolve({ id: inc2Id }) }
  );

  assert(patchWithoutTeamRes.status === 422, "PATCH /api/incidents/[id] with status='Assigned' on unassigned incident returns HTTP 422");
  const patchWithoutTeamData = await patchWithoutTeamRes.json();
  assert(patchWithoutTeamData.success === false, "Response reports success = false");
  assert(
    Boolean(patchWithoutTeamData.error?.includes("tactical")),
    `Clear structured error returned: "${patchWithoutTeamData.error}"`
  );

  // API-level PATCH test: attempt to transition unassigned incident to "Responding"
  const patchRespondingWithoutTeamRes = await patchIncidentHandler(
    new Request(`http://localhost:3000/api/incidents/${inc2Id}`, {
      method: "PATCH",
      headers: dispHeaders,
      body: JSON.stringify({ status: "Responding" }),
    }),
    { params: Promise.resolve({ id: inc2Id }) }
  );
  assert(patchRespondingWithoutTeamRes.status === 422, "PATCH /api/incidents/[id] with status='Responding' on unassigned incident returns HTTP 422");

  // Verify in DynamoDB that incident status is STILL "Reported" and assignedTeamId is STILL undefined
  const inc2VerifyRes = await getIncidentHandler(
    new Request(`http://localhost:3000/api/incidents/${inc2Id}`, {
      method: "GET",
      headers: dispHeaders,
    }),
    { params: Promise.resolve({ id: inc2Id }) }
  );
  const inc2VerifyData = await inc2VerifyRes.json();
  assert(inc2VerifyData.data?.incident?.status === "Reported", "Incident in DynamoDB remains 'Reported'");
  assert(!inc2VerifyData.data?.incident?.assignedTeamId, "Incident in DynamoDB assignedTeamId remains undefined");

  // ---------------------------------------------------------------------------
  // SCENARIO 3: Invalid Team ID Rejection
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 3: Invalid Team ID Rejection]");
  const inc3Id = await createTestIncident("Scenario 3 - Invalid Team ID Test");

  // Attempt assignment with non-existent team ID
  const invalidTeamRes = await assignTeamHandler(
    new Request(`http://localhost:3000/api/incidents/${inc3Id}/assign`, {
      method: "POST",
      headers: dispHeaders,
      body: JSON.stringify({ teamId: "PHANTOM-UNIT-999", action: "assign" }),
    }),
    { params: Promise.resolve({ id: inc3Id }) }
  );

  assert(invalidTeamRes.status === 404, "POST /assign with non-existent team returns HTTP 404");
  const invalidTeamData = await invalidTeamRes.json();
  assert(invalidTeamData.success === false, "Response reports success = false");
  assert(
    invalidTeamData.error?.includes("PHANTOM-UNIT-999"),
    `Clear 404 error returned: "${invalidTeamData.error}"`
  );

  // Attempt assignment with empty teamId
  const emptyTeamRes = await assignTeamHandler(
    new Request(`http://localhost:3000/api/incidents/${inc3Id}/assign`, {
      method: "POST",
      headers: dispHeaders,
      body: JSON.stringify({ teamId: "   ", action: "assign" }),
    }),
    { params: Promise.resolve({ id: inc3Id }) }
  );
  assert(emptyTeamRes.status === 400, "POST /assign with empty teamId returns HTTP 400");

  // Verify incident in DynamoDB was NOT modified
  const inc3VerifyRes = await getIncidentHandler(
    new Request(`http://localhost:3000/api/incidents/${inc3Id}`, {
      method: "GET",
      headers: dispHeaders,
    }),
    { params: Promise.resolve({ id: inc3Id }) }
  );
  const inc3VerifyData = await inc3VerifyRes.json();
  assert(inc3VerifyData.data?.incident?.status === "Reported", "Incident status remains 'Reported' after invalid assignment");
  assert(!inc3VerifyData.data?.incident?.assignedTeamId, "Incident assignedTeamId remains undefined");

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Failed Assignment Preserves Previous Incident State
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 4: Failed Assignment Preserves Previous Incident State]");

  // 4A: Attempt assignment to an already RESOLVED incident (VIG-2026-171)
  const resolvedAssignRes = await assignTeamHandler(
    new Request("http://localhost:3000/api/incidents/VIG-2026-171/assign", {
      method: "POST",
      headers: dispHeaders,
      body: JSON.stringify({ teamId: "FIRE-01", action: "assign" }),
    }),
    { params: Promise.resolve({ id: "VIG-2026-171" }) }
  );
  assert(resolvedAssignRes.status === 409, "POST /assign to already resolved incident returns HTTP 409 Conflict");
  const resolvedAssignData = await resolvedAssignRes.json();
  assert(
    resolvedAssignData.error?.includes("already resolved"),
    `Clear 409 error: "${resolvedAssignData.error}"`
  );

  // Verify VIG-2026-171 state preserved in DynamoDB
  const vig171Res = await getIncidentHandler(
    new Request("http://localhost:3000/api/incidents/VIG-2026-171", {
      method: "GET",
      headers: dispHeaders,
    }),
    { params: Promise.resolve({ id: "VIG-2026-171" }) }
  );
  const vig171Data = await vig171Res.json();
  assert(vig171Data.data?.incident?.status === "Resolved", "VIG-2026-171 remains 'Resolved'");

  // 4B: Attempt assignment of a team already committed to another incident
  const inc4AId = await createTestIncident("Scenario 4A - Primary Committed Incident");
  const inc4BId = await createTestIncident("Scenario 4B - Competing Assignment Target");

  // Commit FIRE-01 to inc4AId
  const commitFireRes = await assignTeamHandler(
    new Request(`http://localhost:3000/api/incidents/${inc4AId}/assign`, {
      method: "POST",
      headers: dispHeaders,
      body: JSON.stringify({ teamId: "FIRE-01", action: "assign" }),
    }),
    { params: Promise.resolve({ id: inc4AId }) }
  );
  assert(commitFireRes.status === 200, `FIRE-01 assigned to ${inc4AId}`);

  // Now attempt to assign busy FIRE-01 to inc4BId
  const busyAssignRes = await assignTeamHandler(
    new Request(`http://localhost:3000/api/incidents/${inc4BId}/assign`, {
      method: "POST",
      headers: dispHeaders,
      body: JSON.stringify({ teamId: "FIRE-01", action: "assign" }),
    }),
    { params: Promise.resolve({ id: inc4BId }) }
  );
  assert(busyAssignRes.status === 409, "Assigning committed unit returns HTTP 409 Conflict");
  const busyAssignData = await busyAssignRes.json();
  assert(
    busyAssignData.error?.includes("committed"),
    `Clear 409 error: "${busyAssignData.error}"`
  );

  // Verify inc4BId preserved in original state
  const inc4BVerifyRes = await getIncidentHandler(
    new Request(`http://localhost:3000/api/incidents/${inc4BId}`, {
      method: "GET",
      headers: dispHeaders,
    }),
    { params: Promise.resolve({ id: inc4BId }) }
  );
  const inc4BVerifyData = await inc4BVerifyRes.json();
  assert(inc4BVerifyData.data?.incident?.status === "Reported", "Target incident status remains 'Reported'");
  assert(!inc4BVerifyData.data?.incident?.assignedTeamId, "Target incident assignedTeamId remains undefined");

  // Release FIRE-01
  await assignTeamHandler(
    new Request(`http://localhost:3000/api/incidents/${inc4AId}/assign`, {
      method: "POST",
      headers: dispHeaders,
      body: JSON.stringify({ action: "unassign" }),
    }),
    { params: Promise.resolve({ id: inc4AId }) }
  );

  // 4C: Attempt to unassign an unassigned incident
  const unassignUnassignedRes = await assignTeamHandler(
    new Request(`http://localhost:3000/api/incidents/${inc4BId}/assign`, {
      method: "POST",
      headers: dispHeaders,
      body: JSON.stringify({ action: "unassign" }),
    }),
    { params: Promise.resolve({ id: inc4BId }) }
  );
  assert(unassignUnassignedRes.status === 400, "Unassigning an unassigned incident returns HTTP 400");
  const unassignUnassignedData = await unassignUnassignedRes.json();
  assert(
    unassignUnassignedData.error?.includes("not have a tactical unit currently assigned"),
    `Clear error message: "${unassignUnassignedData.error}"`
  );

  // ---------------------------------------------------------------------------
  // SCENARIO 5: Responder Visibility After Assignment
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 5: Responder Visibility After Assignment]");
  const inc5Id = await createTestIncident("Scenario 5 - Responder RBAC Visibility Test");

  // Step 5A: Query incidents as Responder before MED-01 is assigned
  const respListBefore = await getIncidentsHandler(
    new Request("http://localhost:3000/api/incidents", { method: "GET", headers: respHeaders })
  );
  assert(respListBefore.status === 200, "GET /api/incidents as Responder returns HTTP 200");
  const respDataBefore = await respListBefore.json();
  const foundBefore = respDataBefore.data?.find((i: { id: string }) => i.id === inc5Id);
  assert(!foundBefore, "Unassigned incident is NOT visible to Responder");

  // Verify VIG-2026-172 (unassigned) is NOT visible to Responder
  const found172 = respDataBefore.data?.find((i: { id: string }) => i.id === "VIG-2026-172");
  assert(!found172, "VIG-2026-172 (unassigned) is NOT visible to Responder");

  // Verify VIG-2026-173 (unassigned) is NOT visible to Responder
  const found173 = respDataBefore.data?.find((i: { id: string }) => i.id === "VIG-2026-173");
  assert(!found173, "VIG-2026-173 (unassigned) is NOT visible to Responder");

  // Step 5B: Dispatcher assigns MED-01 (Officer Vance's unit) to inc5Id
  const assignMedRes = await assignTeamHandler(
    new Request(`http://localhost:3000/api/incidents/${inc5Id}/assign`, {
      method: "POST",
      headers: dispHeaders,
      body: JSON.stringify({ teamId: "MED-01", action: "assign" }),
    }),
    { params: Promise.resolve({ id: inc5Id }) }
  );
  assert(assignMedRes.status === 200, `MED-01 assigned to incident ${inc5Id}`);

  // Step 5C: Query incidents as Responder after MED-01 is assigned
  const respListAfter = await getIncidentsHandler(
    new Request("http://localhost:3000/api/incidents", { method: "GET", headers: respHeaders })
  );
  const respDataAfter = await respListAfter.json();
  const foundAfter = respDataAfter.data?.find((i: { id: string }) => i.id === inc5Id);
  assert(Boolean(foundAfter), "Assigned incident is NOW visible to Responder (MED-01)");
  assert(foundAfter?.assignedTeamId === "MED-01", "Returned incident has assignedTeamId='MED-01'");

  // Step 5D: Dispatcher unassigns MED-01
  const unassignMedRes = await assignTeamHandler(
    new Request(`http://localhost:3000/api/incidents/${inc5Id}/assign`, {
      method: "POST",
      headers: dispHeaders,
      body: JSON.stringify({ action: "unassign" }),
    }),
    { params: Promise.resolve({ id: inc5Id }) }
  );
  assert(unassignMedRes.status === 200, `MED-01 unassigned from ${inc5Id}`);

  // Step 5E: Query incidents as Responder after unassign
  const respListAfterUnassign = await getIncidentsHandler(
    new Request("http://localhost:3000/api/incidents", { method: "GET", headers: respHeaders })
  );
  const respDataAfterUnassign = await respListAfterUnassign.json();
  const foundAfterUnassign = respDataAfterUnassign.data?.find((i: { id: string }) => i.id === inc5Id);
  assert(!foundAfterUnassign, "Unassigned incident is immediately NO LONGER visible to Responder");

  // Step 5F: Responder is forbidden from assigning teams
  const responderForbiddenAssign = await assignTeamHandler(
    new Request(`http://localhost:3000/api/incidents/${inc5Id}/assign`, {
      method: "POST",
      headers: respHeaders,
      body: JSON.stringify({ teamId: "MED-01", action: "assign" }),
    }),
    { params: Promise.resolve({ id: inc5Id }) }
  );
  assert(
    responderForbiddenAssign.status === 403,
    "Field Responder is FORBIDDEN from assigning teams (HTTP 403 Forbidden)"
  );

  // ---------------------------------------------------------------------------
  // CLEANUP & SANITY CHECK
  // ---------------------------------------------------------------------------
  console.log("\n[CLEANUP: Removing Temporary Test Incidents]");
  for (const testId of TEST_INCIDENTS_TO_CLEANUP) {
    await deleteTestIncident(testId);
  }
  console.log(`  Cleaned up ${TEST_INCIDENTS_TO_CLEANUP.length} temporary test records.`);

  // Verify campus teams are all Available
  const teamsFinalRes = await getTeamsHandler(
    new Request("http://localhost:3000/api/teams", { method: "GET", headers: adminHeaders })
  );
  const teamsFinalData = await teamsFinalRes.json();
  for (const t of teamsFinalData.data || []) {
    assert(
      t.status === "Available" || t.id === "MED-01",
      `Team ${t.id} returned to safe status (${t.status})`
    );
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`  ASSIGNMENT INTEGRITY REGRESSION SUITE: ${passed} PASSED | ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runAssignmentIntegritySuite().catch((err) => {
  console.error("Unhandled error in assignment integrity suite:", err);
  process.exit(1);
});

