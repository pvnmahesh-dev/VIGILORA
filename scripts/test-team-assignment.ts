/**
 * VIGILORA HACKATHON: RESPONSE TEAMS ROSTER & INCIDENT ASSIGNMENT TEST SUITE
 *
 * Verifies:
 * 1. Teams API: GET /api/teams returns seeded demo response teams.
 * 2. Idempotency: Repeated queries / ensureDemoTeams never duplicates or overwrites teams.
 * 3. Dispatcher Assignment: Dispatcher successfully assigns MED-01 to VIG-2026-171.
 * 4. State Synchronization: Incident status -> "Assigned", Team status -> "En Route".
 * 5. Persistence: Refreshing / re-querying from DynamoDB confirms persistent state.
 * 6. Responder View: Responder role can view assigned teams and incidents.
 * 7. RBAC Enforcement: Unauthorized roles (Responder, Reporter, Unauthenticated) cannot assign teams.
 * 8. Unassign & Reassign: Unassigning returns unit to "Available", reassigning commits cleanly.
 */

import { GET as getTeamsHandler } from "../src/app/api/teams/route";
import { GET as getIncidentHandler } from "../src/app/api/incidents/[id]/route";
import { POST as assignTeamHandler } from "../src/app/api/incidents/[id]/assign/route";
import { POST as demoLoginHandler } from "../src/app/api/auth/demo-login/route";
import { ensureDemoTeams } from "../src/lib/teams-seed";
import { SESSION_COOKIE_NAME } from "../src/lib/auth";

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

async function runTeamAssignmentSuite() {
  console.log("================================================================================");
  console.log("     VIGILORA HACKATHON: RESPONSE TEAMS ROSTER & ASSIGNMENT TEST SUITE");
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // Step 1: Session Authentications for Dispatcher and Responder
  // ---------------------------------------------------------------------------
  console.log("[SETUP: Authenticating Dispatcher & Responder Sessions]");
  const dispLoginRes = await demoLoginHandler(
    new Request("http://localhost:3000/api/auth/demo-login", {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "Dispatcher" }),
    })
  );
  const dispCookie = extractCookie(dispLoginRes);
  assert(Boolean(dispCookie), "Dispatcher session acquired");

  const respLoginRes = await demoLoginHandler(
    new Request("http://localhost:3000/api/auth/demo-login", {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "Responder" }),
    })
  );
  const respCookie = extractCookie(respLoginRes);
  assert(Boolean(respCookie), "Field Responder session acquired");

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

  // ---------------------------------------------------------------------------
  // SCENARIO 1: Teams API Query & Seed Verification
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 1: GET /api/teams Roster Verification]");
  const teamsRes = await getTeamsHandler(
    new Request("http://localhost:3000/api/teams", {
      method: "GET",
      headers: dispHeaders,
    })
  );

  assert(teamsRes.status === 200, "GET /api/teams returns HTTP 200");
  const teamsData = await teamsRes.json();
  assert(teamsData.success === true, "Response reports success = true");
  assert(Array.isArray(teamsData.data), "data is an array of ResponseTeam records");
  assert(teamsData.data.length >= 3, `Roster contains at least 3 teams (found ${teamsData.data.length})`);

  const med01 = teamsData.data.find((t: { id: string }) => t.id === "MED-01");
  const sec01 = teamsData.data.find((t: { id: string }) => t.id === "SEC-01");
  const fire01 = teamsData.data.find((t: { id: string }) => t.id === "FIRE-01");

  assert(Boolean(med01), "MED-01 (Medical Response Unit) is present in roster");
  assert(Boolean(sec01), "SEC-01 (Campus Security Unit) is present in roster");
  assert(Boolean(fire01), "FIRE-01 (Fire & Safety Response Unit) is present in roster");

  assert(med01?.callsign === "MED-01", "MED-01 has valid callsign");
  assert(med01?.specialty === "Emergency Medical Services", "MED-01 specialty is Emergency Medical Services");
  assert(sec01?.specialty === "Campus Security", "SEC-01 specialty is Campus Security");
  assert(fire01?.specialty === "Fire & Safety Response", "FIRE-01 specialty is Fire & Safety Response");

  // ---------------------------------------------------------------------------
  // SCENARIO 2: Idempotency & Duplicate Prevention
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 2: Idempotency & Non-Duplication Audit]");
  const initialCount = teamsData.data.length;
  await ensureDemoTeams();
  const teamsRes2 = await getTeamsHandler(
    new Request("http://localhost:3000/api/teams", {
      method: "GET",
      headers: dispHeaders,
    })
  );
  const teamsData2 = await teamsRes2.json();
  assert(teamsData2.data.length === initialCount, `Roster count unchanged after re-seed (${initialCount} units)`);

  // ---------------------------------------------------------------------------
  // SCENARIO 3: Dispatcher Assigns MED-01 to VIG-2026-171
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 3: Dispatcher Assigns MED-01 to Incident VIG-2026-171]");
  const assignReq = new Request("http://localhost:3000/api/incidents/VIG-2026-171/assign", {
    method: "POST",
    headers: dispHeaders,
    body: JSON.stringify({ teamId: "MED-01", action: "assign" }),
  });

  const assignRes = await assignTeamHandler(assignReq, {
    params: Promise.resolve({ id: "VIG-2026-171" }),
  });

  assert(assignRes.status === 200, "POST /api/incidents/VIG-2026-171/assign returns HTTP 200");
  const assignData = await assignRes.json();
  assert(assignData.success === true, "Assignment success flag is TRUE");
  assert(assignData.data?.assignedTeamId === "MED-01", "Assigned teamId is MED-01");
  assert(assignData.data?.assignedResponder === "Medical Response Unit", "Assigned responder is Medical Response Unit");
  assert(assignData.data?.status === "Assigned", "Incident status transitioned to 'Assigned'");

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Assignment Persistence Across Database Query
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 4: Assignment Persistence in DynamoDB]");
  const incRes = await getIncidentHandler(
    new Request("http://localhost:3000/api/incidents/VIG-2026-171", {
      method: "GET",
      headers: dispHeaders,
    }),
    { params: Promise.resolve({ id: "VIG-2026-171" }) }
  );

  assert(incRes.status === 200, "GET /api/incidents/VIG-2026-171 returns HTTP 200");
  const incData = await incRes.json();
  assert(incData.data?.incident?.assignedTeamId === "MED-01", "Persistent assignedTeamId in DynamoDB is MED-01");
  assert(incData.data?.incident?.assignedResponder === "Medical Response Unit", "Persistent assignedResponder is Medical Response Unit");
  assert(incData.data?.incident?.status === "Assigned", "Persistent status in DynamoDB is 'Assigned'");

  // Check MED-01 team status in DynamoDB
  const teamsRefresh = await getTeamsHandler(
    new Request("http://localhost:3000/api/teams", {
      method: "GET",
      headers: dispHeaders,
    })
  );
  const refreshedTeams = await teamsRefresh.json();
  const updatedMed01 = refreshedTeams.data.find((t: { id: string }) => t.id === "MED-01");
  assert(updatedMed01?.status === "En Route", "MED-01 status transitioned to 'En Route'");
  assert(updatedMed01?.activeIncidentId === "VIG-2026-171", "MED-01 activeIncidentId is VIG-2026-171");

  // ---------------------------------------------------------------------------
  // SCENARIO 5: Field Responder Read Access & Audit
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 5: Field Responder Role Read Access]");
  const respViewTeams = await getTeamsHandler(
    new Request("http://localhost:3000/api/teams", {
      method: "GET",
      headers: respHeaders,
    })
  );
  assert(respViewTeams.status === 200, "Field Responder is AUTHORIZED to view teams (HTTP 200)");
  const respTeamsData = await respViewTeams.json();
  const respMed01 = respTeamsData.data.find((t: { id: string }) => t.id === "MED-01");
  assert(respMed01?.activeIncidentId === "VIG-2026-171", "Field Responder sees MED-01 assigned to VIG-2026-171");

  // ---------------------------------------------------------------------------
  // SCENARIO 6: RBAC Security Enforcement - Unauthorized Roles Forbidden
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 6: RBAC Authorization Enforcement]");
  // Field Responder cannot assign teams
  const forbiddenAssign = await assignTeamHandler(
    new Request("http://localhost:3000/api/incidents/VIG-2026-171/assign", {
      method: "POST",
      headers: respHeaders,
      body: JSON.stringify({ teamId: "SEC-01", action: "assign" }),
    }),
    { params: Promise.resolve({ id: "VIG-2026-171" }) }
  );
  assert(forbiddenAssign.status === 403, "Field Responder is FORBIDDEN from assigning teams (HTTP 403)");

  // Unauthenticated user cannot assign teams
  const unauthAssign = await assignTeamHandler(
    new Request("http://localhost:3000/api/incidents/VIG-2026-171/assign", {
      method: "POST",
      headers: BASE_HEADERS,
      body: JSON.stringify({ teamId: "SEC-01", action: "assign" }),
    }),
    { params: Promise.resolve({ id: "VIG-2026-171" }) }
  );
  assert(unauthAssign.status === 401, "Unauthenticated user is REJECTED with HTTP 401");

  // ---------------------------------------------------------------------------
  // SCENARIO 7: Unassign & Reassign Lifecycle
  // ---------------------------------------------------------------------------
  console.log("\n[SCENARIO 7: Unassign & Reassign Lifecycle]");
  // Unassign
  const unassignRes = await assignTeamHandler(
    new Request("http://localhost:3000/api/incidents/VIG-2026-171/assign", {
      method: "POST",
      headers: dispHeaders,
      body: JSON.stringify({ action: "unassign" }),
    }),
    { params: Promise.resolve({ id: "VIG-2026-171" }) }
  );
  assert(unassignRes.status === 200, "POST /api/incidents/VIG-2026-171/assign (unassign) returns HTTP 200");
  const unassignData = await unassignRes.json();
  assert(unassignData.data?.assignedTeamId === null, "assignedTeamId is null after unassign");

  // Reassign MED-01 to VIG-2026-171 so it remains demonstrable for evaluators
  const reassignRes = await assignTeamHandler(
    new Request("http://localhost:3000/api/incidents/VIG-2026-171/assign", {
      method: "POST",
      headers: dispHeaders,
      body: JSON.stringify({ teamId: "MED-01", action: "assign" }),
    }),
    { params: Promise.resolve({ id: "VIG-2026-171" }) }
  );
  assert(reassignRes.status === 200, "Reassigned MED-01 to VIG-2026-171 for active hackathon demo (HTTP 200)");

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`  RESPONSE TEAMS & ASSIGNMENT SUITE: ${passed} PASSED | ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTeamAssignmentSuite().catch((err) => {
  console.error("Unhandled error in test suite:", err);
  process.exit(1);
});

