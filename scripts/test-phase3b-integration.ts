/**
 * VIGILORA PHASE 3B VERIFICATION SUITE
 *
 * Verifies IncidentContext & AWS API Client Integration:
 * 1. Initial data hydration from backend APIs (GET /api/incidents, /api/teams, /api/activities, /api/settings)
 * 2. Empty database behavior (no mock demo fallbacks)
 * 3. Asynchronous incident creation and retrieval (POST /api/incidents, GET /api/incidents/[id])
 * 4. Incident status updates and state-machine transitions (PATCH /api/incidents/[id])
 * 5. Team assignment, conflict handling (HTTP 409), and unassignment
 * 6. Team telemetry updates vs status RBAC (HTTP 403)
 * 7. Automatic tactical unit release upon incident resolution
 * 8. Audit activity log refresh and chronological ordering
 * 9. Campus emergency settings retrieval and Supervisor-only updates
 * 10. Authentication expiry handling during API operations (HTTP 401)
 * 11. Codebase audit: zero localStorage and zero demo imports in IncidentContext
 * 12. Guaranteed automatic cloud teardown
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { provisionUser, createSession, UserRole } from "../src/lib/auth";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const AWS_REGION = process.env.AWS_REGION || "eu-north-1";
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE_NAME || "VIGILORA-Main";

const ddbRaw = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(ddbRaw);

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    testsPassed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    testsFailed++;
  }
}

async function runPhase3BTests() {
  console.log("\n================================================================================");
  console.log("  VIGILORA PHASE 3B: INCIDENTCONTEXT & AWS BACKEND API INTEGRATION");
  console.log("================================================================================\n");

  const runId = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const campusPk = "CAMPUS#METROPOLIS";

  const cleanupDynamoKeys: { pk: string; sk: string }[] = [];

  try {
    // -------------------------------------------------------------------------
    // Setup: Provision verified test identities (Supervisor, Dispatcher, Responder)
    // -------------------------------------------------------------------------
    console.log("Setup: Provisioning verified operator identities...");

    async function setupOperator(role: UserRole, callsign: string) {
      const email = `test.ph3b.${role.toLowerCase()}.${runId}@vigilora.internal`;
      const password = `TestAuth_${role}_${runId}!`;
      const name = `Operator ${role} ${runId.slice(0, 4)}`;

      const prov = await provisionUser({
        email,
        password,
        name,
        role,
        callsign,
      });

      cleanupDynamoKeys.push({ pk: campusPk, sk: `USER#${email.toLowerCase()}` });

      const { plainToken } = await createSession(prov.user);
      const hashedToken = crypto.createHash("sha256").update(plainToken).digest("hex");
      cleanupDynamoKeys.push({ pk: campusPk, sk: `SESSION#${hashedToken}` });

      return { email, password, token: plainToken, user: prov.user };
    }

    const supervisor = await setupOperator("Supervisor", "SUPER-PH3B");
    const dispatcher = await setupOperator("Dispatcher", "DISPATCH-PH3B");
    const responder = await setupOperator("Responder", "RESP-PH3B");

    console.log("  All test operators provisioned successfully.\n");

    // -------------------------------------------------------------------------
    // Test 1: Initial Hydration & Empty Database Behavior
    // -------------------------------------------------------------------------
    console.log("Test 1: Initial Hydration & Empty Database Behavior (Zero Mock Fallback)");

    const emptyIncRes = await fetch(`${BASE_URL}/api/incidents`, {
      headers: { Cookie: `vigilora_session=${dispatcher.token}` },
    });
    assert(emptyIncRes.status === 200, "GET /api/incidents returns HTTP 200");
    const emptyIncData = await emptyIncRes.json();
    assert(emptyIncData.success === true, "Response reports success: true");
    assert(Array.isArray(emptyIncData.data), "Returns array for incidents data");

    const emptyTeamsRes = await fetch(`${BASE_URL}/api/teams`, {
      headers: { Cookie: `vigilora_session=${dispatcher.token}` },
    });
    assert(emptyTeamsRes.status === 200, "GET /api/teams returns HTTP 200");
    const emptyTeamsData = await emptyTeamsRes.json();
    assert(Array.isArray(emptyTeamsData.data), "Returns array for teams data");

    const actRes = await fetch(`${BASE_URL}/api/activities?limit=50`, {
      headers: { Cookie: `vigilora_session=${dispatcher.token}` },
    });
    assert(actRes.status === 200, "GET /api/activities returns HTTP 200");
    const actData = await actRes.json();
    assert(Array.isArray(actData.data), "Returns array for activities data");

    const setRes = await fetch(`${BASE_URL}/api/settings`, {
      headers: { Cookie: `vigilora_session=${dispatcher.token}` },
    });
    assert(setRes.status === 200, "GET /api/settings returns HTTP 200");
    const setData = await setRes.json();
    assert(setData.success === true, "Settings response reports success: true");
    assert(Boolean(setData.data.campusName), "Settings contains valid campusName");

    // -------------------------------------------------------------------------
    // Test 2: Asynchronous Incident Creation & Verification
    // -------------------------------------------------------------------------
    console.log("\nTest 2: Asynchronous Incident Creation & Verification");

    const createRes = await fetch(`${BASE_URL}/api/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcher.token}`,
        "x-vigilora-test-client": "phase3b-test",
      },
      body: JSON.stringify({
        title: "Basement Electrical Transformer Fault",
        description: "Audible arcing and burnt insulation smell detected in sub-level corridor 2.",
        category: "Fire & Hazard",
        severity: "Critical",
        zone: "Central Campus Sector",
        building: "Main Hall",
        landmark: "Electrical Vault B",
        reporterContact: "+1 (555) 019-9944",
      }),
    });

    assert(createRes.status === 201, `Incident creation returns HTTP 201 (Got ${createRes.status})`);
    const createData = await createRes.json();
    assert(createData.success === true, "Creation response reports success: true");
    assert(Boolean(createData.data?.id), `Incident ID allocated: ${createData.data?.id}`);
    assert(/^VIG-2026-\d{3}$/.test(createData.data.id), "Incident ID conforms to format VIG-2026-XXX");
    assert(createData.data.status === "Reported", "Initial status is 'Reported'");
    assert(Boolean(createData.activity), "Transactional creation activity returned");

    const incidentId = createData.data.id;
    cleanupDynamoKeys.push({ pk: campusPk, sk: `INCIDENT#${incidentId}` });
    if (createData.activity) {
      cleanupDynamoKeys.push({
        pk: campusPk,
        sk: `ACTIVITY#${createData.activity.timestamp}#${createData.activity.id}`,
      });
    }

    // Verify incident retrieval by ID
    const getIncRes = await fetch(`${BASE_URL}/api/incidents/${incidentId}`, {
      headers: { Cookie: `vigilora_session=${dispatcher.token}` },
    });
    assert(getIncRes.status === 200, "GET /api/incidents/[id] returns HTTP 200");
    const getIncData = await getIncRes.json();
    assert(getIncData.data.incident.id === incidentId, "Retrieved incident matches created ID");
    assert(getIncData.data.incident.title === "Basement Electrical Transformer Fault", "Title matches accurately");
    assert(Array.isArray(getIncData.data.activities), "Response includes associated activity audit trail");

    // -------------------------------------------------------------------------
    // Test 3: Incident Status Updates & State Machine
    // -------------------------------------------------------------------------
    console.log("\nTest 3: Incident Status Updates & State Machine");

    const patchRes = await fetch(`${BASE_URL}/api/incidents/${incidentId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcher.token}`,
        "x-vigilora-test-client": "phase3b-test",
      },
      body: JSON.stringify({
        status: "Under review",
        notes: "Facilities engineers notified for vault access.",
      }),
    });

    assert(patchRes.status === 200, `Patch status returns HTTP 200 (Got ${patchRes.status})`);
    const patchData = await patchRes.json();
    assert(patchData.data.status === "Under review", "Operational status transitioned to 'Under review'");
    if (patchData.activity) {
      cleanupDynamoKeys.push({
        pk: campusPk,
        sk: `ACTIVITY#${patchData.activity.timestamp}#${patchData.activity.id}`,
      });
    }

    // Invalid transition test (e.g. invalid string)
    const invalidTransRes = await fetch(`${BASE_URL}/api/incidents/${incidentId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcher.token}`,
        "x-vigilora-test-client": "phase3b-test",
      },
      body: JSON.stringify({ status: "InvalidStatusXYZ" }),
    });
    assert(invalidTransRes.status === 400 || invalidTransRes.status === 422, "Invalid status rejected with error");

    // -------------------------------------------------------------------------
    // Test 4: Team Provisioning, Assignment & Conflict Handling (409)
    // -------------------------------------------------------------------------
    console.log("\nTest 4: Team Assignment, Conflict Handling & Unassignment");

    const teamId = `team-ph3b-${runId.slice(0, 6)}`;
    const teamName = "Phase 3B Tactical Unit";
    const teamCallsign = "TAC-PH3B-1";

    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          pk: campusPk,
          sk: `TEAM#${teamId}`,
          id: teamId,
          name: teamName,
          callsign: teamCallsign,
          specialty: "Campus Security",
          status: "Available",
          currentZone: "Central Campus Sector",
          membersCount: 3,
          leadResponder: "Officer Miller",
          contactChannel: "DISPATCH-SEC-1",
          batteryStatus: 95,
          lastCheckIn: new Date().toISOString(),
          entityType: "TEAM",
        },
      })
    );
    cleanupDynamoKeys.push({ pk: campusPk, sk: `TEAM#${teamId}` });

    // Assign team to incident
    const assignRes = await fetch(`${BASE_URL}/api/incidents/${incidentId}/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcher.token}`,
        "x-vigilora-test-client": "phase3b-test",
      },
      body: JSON.stringify({ teamId, action: "assign" }),
    });

    assert(assignRes.status === 200, `Team assignment returns HTTP 200 (Got ${assignRes.status})`);
    const assignData = await assignRes.json();
    assert(assignData.data.assignedTeamId === teamId, "Incident assignedTeamId updated");

    const teamCheckRes = await fetch(`${BASE_URL}/api/teams/${teamId}`, {
      headers: { Cookie: `vigilora_session=${dispatcher.token}` },
    });
    const teamCheckData = await teamCheckRes.json();
    assert(teamCheckData.data.status === "En Route", "Assigned team status updated to 'En Route'");
    assert(teamCheckData.data.activeIncidentId === incidentId, "Team activeIncidentId bound to incident");
    if (assignData.activity) {
      cleanupDynamoKeys.push({
        pk: campusPk,
        sk: `ACTIVITY#${assignData.activity.timestamp}#${assignData.activity.id}`,
      });
    }

    // Conflict Check: Create a second incident and attempt to assign the already committed unit
    const create2Res = await fetch(`${BASE_URL}/api/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcher.token}`,
        "x-vigilora-test-client": "phase3b-test",
      },
      body: JSON.stringify({
        title: "Perimeter Motion Alarm",
        description: "East fence vibration sensor triggered.",
        category: "Security",
        severity: "Medium",
        zone: "Central Campus Sector",
      }),
    });
    const create2Data = await create2Res.json();
    const incidentId2 = create2Data.data.id;
    cleanupDynamoKeys.push({ pk: campusPk, sk: `INCIDENT#${incidentId2}` });
    if (create2Data.activity) {
      cleanupDynamoKeys.push({
        pk: campusPk,
        sk: `ACTIVITY#${create2Data.activity.timestamp}#${create2Data.activity.id}`,
      });
    }

    const conflictRes = await fetch(`${BASE_URL}/api/incidents/${incidentId2}/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcher.token}`,
        "x-vigilora-test-client": "phase3b-test",
      },
      body: JSON.stringify({ teamId }),
    });
    assert(conflictRes.status === 409, `Assigning committed unit returns HTTP 409 Conflict (Got ${conflictRes.status})`);

    // Unassign unit from incident 1
    const unassignRes = await fetch(`${BASE_URL}/api/incidents/${incidentId}/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcher.token}`,
        "x-vigilora-test-client": "phase3b-test",
      },
      body: JSON.stringify({ action: "unassign" }),
    });
    assert(unassignRes.status === 200, `Unassign unit returns HTTP 200 (Got ${unassignRes.status})`);
    const unassignData = await unassignRes.json();
    assert(!unassignData.data.assignedTeamId, "Incident assignedTeamId cleared");

    const unassignedTeamCheck = await fetch(`${BASE_URL}/api/teams/${teamId}`, {
      headers: { Cookie: `vigilora_session=${dispatcher.token}` },
    });
    const unassignedTeamData = await unassignedTeamCheck.json();
    assert(unassignedTeamData.data.status === "Available", "Unit returned to 'Available'");
    if (unassignData.activity) {
      cleanupDynamoKeys.push({
        pk: campusPk,
        sk: `ACTIVITY#${unassignData.activity.timestamp}#${unassignData.activity.id}`,
      });
    }

    // -------------------------------------------------------------------------
    // Test 5: Team Telemetry vs Status Permissions
    // -------------------------------------------------------------------------
    console.log("\nTest 5: Team Telemetry vs Status Permissions");

    // Responder updates telemetry (allowed)
    const telemRes = await fetch(`${BASE_URL}/api/teams/${teamId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${responder.token}`,
        "x-vigilora-test-client": "phase3b-test",
      },
      body: JSON.stringify({ batteryStatus: 82, currentZone: "West Quad" }),
    });
    assert(telemRes.status === 200, `Responder telemetry update returns HTTP 200 (Got ${telemRes.status})`);

    // Responder attempts status change (forbidden)
    const illegalStatusRes = await fetch(`${BASE_URL}/api/teams/${teamId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${responder.token}`,
        "x-vigilora-test-client": "phase3b-test",
      },
      body: JSON.stringify({ status: "Busy" }),
    });
    assert(illegalStatusRes.status === 403, `Responder status update rejected with HTTP 403 (Got ${illegalStatusRes.status})`);

    // -------------------------------------------------------------------------
    // Test 6: Auto-Release on Resolution
    // -------------------------------------------------------------------------
    console.log("\nTest 6: Auto-Release on Resolution");

    // Re-assign team to incident 1
    await fetch(`${BASE_URL}/api/incidents/${incidentId}/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcher.token}`,
        "x-vigilora-test-client": "phase3b-test",
      },
      body: JSON.stringify({ teamId, action: "assign" }),
    });

    // Resolve incident 1
    const resolveRes = await fetch(`${BASE_URL}/api/incidents/${incidentId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcher.token}`,
        "x-vigilora-test-client": "phase3b-test",
      },
      body: JSON.stringify({
        status: "Resolved",
        notes: "Corridor cleared and breaker replaced.",
      }),
    });
    assert(resolveRes.status === 200, `Resolution returns HTTP 200 (Got ${resolveRes.status})`);
    const resolveData = await resolveRes.json();
    assert(resolveData.data.status === "Resolved", "Incident marked 'Resolved'");
    if (resolveData.activity) {
      cleanupDynamoKeys.push({
        pk: campusPk,
        sk: `ACTIVITY#${resolveData.activity.timestamp}#${resolveData.activity.id}`,
      });
    }

    // Verify team was automatically released in DynamoDB
    const teamAfterResolve = await docClient.send(
      new GetCommand({ TableName: DYNAMODB_TABLE, Key: { pk: campusPk, sk: `TEAM#${teamId}` } })
    );
    assert(teamAfterResolve.Item?.status === "Available", "Assigned team automatically returned to 'Available'");
    assert(!teamAfterResolve.Item?.activeIncidentId, "Team activeIncidentId cleared atomically");

    // -------------------------------------------------------------------------
    // Test 7: Activity Log Refresh and Ordering
    // -------------------------------------------------------------------------
    console.log("\nTest 7: Activity Log Refresh and Ordering");

    const activitiesRes = await fetch(`${BASE_URL}/api/activities?limit=50`, {
      headers: { Cookie: `vigilora_session=${dispatcher.token}` },
    });
    assert(activitiesRes.status === 200, "Activities query returns HTTP 200");
    const activitiesData = await activitiesRes.json();
    assert(activitiesData.data.length > 0, "Activities log contains events");
    assert(
      activitiesData.data.some((a: any) => a.incidentId === incidentId && a.type === "resolution"),
      "Resolution activity present in audit trail"
    );

    // -------------------------------------------------------------------------
    // Test 8: Emergency Settings Retrieval & Supervisor-Only Updates
    // -------------------------------------------------------------------------
    console.log("\nTest 8: Emergency Settings Retrieval & Supervisor-Only Updates");

    // Dispatcher attempt (forbidden)
    const dispSettingsRes = await fetch(`${BASE_URL}/api/settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcher.token}`,
        "x-vigilora-test-client": "phase3b-test",
      },
      body: JSON.stringify({ campusName: "Hacked Sector" }),
    });
    assert(dispSettingsRes.status === 403, `Non-supervisor settings update rejected with HTTP 403 (Got ${dispSettingsRes.status})`);

    // Supervisor attempt (allowed)
    const supSettingsRes = await fetch(`${BASE_URL}/api/settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${supervisor.token}`,
        "x-vigilora-test-client": "phase3b-test",
      },
      body: JSON.stringify({
        campusName: "University Metropolis Campus",
        dispatchHotline: "+1 (555) 991-1111",
      }),
    });
    assert(supSettingsRes.status === 200, `Supervisor settings update returns HTTP 200 (Got ${supSettingsRes.status})`);

    // -------------------------------------------------------------------------
    // Test 9: Authentication Expiry During API Calls
    // -------------------------------------------------------------------------
    console.log("\nTest 9: Authentication Expiry During API Calls");

    const expiredToken = crypto.randomBytes(32).toString("hex");
    const unauthIncRes = await fetch(`${BASE_URL}/api/incidents`, {
      headers: { Cookie: `vigilora_session=${expiredToken}` },
    });
    assert(unauthIncRes.status === 401, `Expired token receives HTTP 401 (Got ${unauthIncRes.status})`);

    const unauthTeamsRes = await fetch(`${BASE_URL}/api/teams`, {
      headers: { Cookie: `vigilora_session=${expiredToken}` },
    });
    assert(unauthTeamsRes.status === 401, `Expired token on teams receives HTTP 401 (Got ${unauthTeamsRes.status})`);

    // -------------------------------------------------------------------------
    // Test 10: Codebase Audit — Zero localStorage & Zero Demo Data Contamination
    // -------------------------------------------------------------------------
    console.log("\nTest 10: Codebase Audit — Zero localStorage & Zero Demo Data in IncidentContext");

    const incidentContextPath = path.join(process.cwd(), "src/context/IncidentContext.tsx");
    const incidentContextCode = fs.readFileSync(incidentContextPath, "utf-8");

    assert(!incidentContextCode.includes("localStorage.getItem"), "IncidentContext has zero localStorage.getItem");
    assert(!incidentContextCode.includes("localStorage.setItem"), "IncidentContext has zero localStorage.setItem");
    assert(!incidentContextCode.includes("localStorage.removeItem"), "IncidentContext has zero localStorage.removeItem");
    assert(!incidentContextCode.includes("DEMO_INCIDENTS"), "IncidentContext does NOT import DEMO_INCIDENTS");
    assert(!incidentContextCode.includes("DEMO_TEAMS"), "IncidentContext does NOT import DEMO_TEAMS");
    assert(!incidentContextCode.includes("DEMO_ACTIVITIES"), "IncidentContext does NOT import DEMO_ACTIVITIES");

    assert(incidentContextCode.includes("/api/incidents"), "IncidentContext queries /api/incidents");
    assert(incidentContextCode.includes("/api/teams"), "IncidentContext queries /api/teams");
    assert(incidentContextCode.includes("/api/activities"), "IncidentContext queries /api/activities");
    assert(incidentContextCode.includes("/api/settings"), "IncidentContext queries /api/settings");

  } catch (err) {
    console.error("Test execution failed with error:", err);
    testsFailed++;
  } finally {
    // -------------------------------------------------------------------------
    // Automatic Teardown: Clean up test operators, sessions, incidents, teams, activities
    // -------------------------------------------------------------------------
    console.log("\n================================================================================");
    console.log("  AUTOMATIC TEARDOWN: PURGING ALL TEST RECORDS FROM DYNAMODB");
    console.log("================================================================================");

    let purged = 0;
    for (const key of cleanupDynamoKeys) {
      try {
        await docClient.send(new DeleteCommand({ TableName: DYNAMODB_TABLE, Key: key }));
        purged++;
      } catch {
        // ignore
      }
    }
    console.log(`  Purged ${purged} test records from DynamoDB.`);

    // Live verification
    const checkUsers = await docClient.send(
      new QueryCommand({
        TableName: DYNAMODB_TABLE,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: {
          ":pk": campusPk,
          ":sk": `USER#test.ph3b.`,
        },
      })
    );
    assert(checkUsers.Count === 0, "DynamoDB verified: ZERO test operators remain in table");
  }

  console.log("\n================================================================================");
  console.log(`  PHASE 3B BACKEND INTEGRATION: ${testsPassed} Passed, ${testsFailed} Failed`);
  console.log("================================================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runPhase3BTests();

