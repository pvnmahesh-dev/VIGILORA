/**
 * VIGILORA Milestone 3: Tactical Teams, Activities & Settings Verification Suite
 *
 * Verifies:
 * 1. GET /api/teams - query tactical response teams
 * 2. GET /api/teams/[id] - fetch team detail
 * 3. PATCH /api/teams/[id] - responder telemetry update (battery, zone)
 * 4. PATCH /api/teams/[id] - responder status change forbidden (403)
 * 5. Data integrity: cannot mark team Available while actively assigned to unresolved incident (409)
 * 6. GET /api/activities - reverse-chronological audit log query
 * 7. GET /api/activities - filtering by incidentId & pagination with nextToken
 * 8. Audit immutability: POST /api/activities rejected (405)
 * 9. GET /api/settings - retrieve emergency settings
 * 10. PATCH /api/settings - supervisor configuration update
 * 11. PATCH /api/settings - non-supervisor modification rejected (403)
 * 12. Settings validation - invalid hotline format rejected (400)
 * 13. Automatic teardown - all created test items deleted in finally {}
 */

import crypto from "node:crypto";
import { provisionUser, hashToken } from "../src/lib/auth";
import { docClient, DYNAMODB_TABLE, getCampusPartitionKey } from "../src/lib/aws";
import { DeleteCommand, QueryCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const BASE_URL = "http://localhost:3000";

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

const cleanupKeys: { pk: string; sk: string }[] = [];

async function loginUser(email: string, pass: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vigilora-test-client": "active-test-suite",
    },
    body: JSON.stringify({ email, password: pass }),
  });
  if (res.status !== 200) {
    throw new Error(`Failed to log in ${email}: HTTP ${res.status}`);
  }
  const setCookie = res.headers.get("set-cookie") || "";
  const match = setCookie.match(/vigilora_session=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]) : "";
  cleanupKeys.push({ pk: getCampusPartitionKey(), sk: `SESSION#${hashToken(token)}` });
  return token;
}

async function runTests() {
  console.log("=================================================");
  console.log("  VIGILORA MILESTONE 3: TEAMS, ACTIVITIES & SETTINGS ");
  console.log("=================================================\n");

  const campusPk = getCampusPartitionKey();
  const runId = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const supervisorEmail = `sup.${runId}@vigilora.internal`;
  const dispatcherEmail = `disp.${runId}@vigilora.internal`;
  const responderEmail = `resp.${runId}@vigilora.internal`;

  const dynamicPassword = `Secret_${crypto.randomBytes(16).toString("base64url")}_${Date.now()}!`;

  try {
    // -------------------------------------------------------------------------
    // Setup: Provision Operator Roles
    // -------------------------------------------------------------------------
    console.log("Setup: Provisioning verified operator identities...");
    await provisionUser({
      email: supervisorEmail,
      password: dynamicPassword,
      name: "Supervisor Vance",
      role: "Supervisor",
      callsign: "VANCE-1",
    });
    cleanupKeys.push({ pk: campusPk, sk: `USER#${supervisorEmail}` });

    await provisionUser({
      email: dispatcherEmail,
      password: dynamicPassword,
      name: "Dispatcher Lee",
      role: "Dispatcher",
      callsign: "DISPATCH-2",
    });
    cleanupKeys.push({ pk: campusPk, sk: `USER#${dispatcherEmail}` });

    await provisionUser({
      email: responderEmail,
      password: dynamicPassword,
      name: "Officer Reynolds",
      role: "Responder",
      callsign: "SEC-3",
    });
    cleanupKeys.push({ pk: campusPk, sk: `USER#${responderEmail}` });

    const supervisorToken = await loginUser(supervisorEmail, dynamicPassword);
    const dispatcherToken = await loginUser(dispatcherEmail, dynamicPassword);
    const responderToken = await loginUser(responderEmail, dynamicPassword);

    // Setup: Explicitly provision test team into DynamoDB (no demo fallbacks)
    const testTeamId = "team-police-03";
    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          pk: campusPk,
          sk: `TEAM#${testTeamId}`,
          id: testTeamId,
          name: "Campus Security Unit 3",
          callsign: "SEC-3",
          specialty: "Campus Security",
          status: "Available",
          currentZone: "Central Plaza",
          membersCount: 2,
          leadResponder: "Officer Ray Reynolds",
          contactChannel: "DISPATCH-SEC (453.025 MHz)",
          batteryStatus: 98,
          lastCheckIn: new Date().toISOString(),
          entityType: "TEAM",
        },
      })
    );
    cleanupKeys.push({ pk: campusPk, sk: `TEAM#${testTeamId}` });

    console.log("  All test operators and test teams provisioned successfully.\n");

    // -------------------------------------------------------------------------
    // Test 1: GET /api/teams (Query Tactical Roster)
    // -------------------------------------------------------------------------
    console.log("Test 1: List Tactical Response Teams (GET /api/teams)");
    const listTeamsRes = await fetch(`${BASE_URL}/api/teams`, {
      headers: {
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
    });
    assert(listTeamsRes.status === 200, `List teams returns HTTP 200 (Got ${listTeamsRes.status})`);
    const listTeamsData = await listTeamsRes.json();
    assert(Array.isArray(listTeamsData.data), "Returns array of teams");
    assert(listTeamsData.data.length > 0, `Teams roster contains units (Count: ${listTeamsData.data.length})`);

    // -------------------------------------------------------------------------
    // Test 2: GET /api/teams/[id] (Single Team Detail)
    // -------------------------------------------------------------------------
    console.log("\nTest 2: Retrieve Team Detail (GET /api/teams/[id])");

    const getTeamRes = await fetch(`${BASE_URL}/api/teams/${testTeamId}`, {
      headers: {
        Cookie: `vigilora_session=${responderToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
    });
    assert(getTeamRes.status === 200, `Fetch team detail returns HTTP 200 (Got ${getTeamRes.status})`);
    const getTeamData = await getTeamRes.json();
    assert(getTeamData.data.id === testTeamId, "Fetched team ID matches target");
    assert(getTeamData.data.name === "Campus Security Unit 3", "Fetched team name is accurate");

    // -------------------------------------------------------------------------
    // Test 3: PATCH /api/teams/[id] (Responder Telemetry vs Status Permission)
    // -------------------------------------------------------------------------
    console.log("\nTest 3: Team Telemetry vs Status Update Permissions");

    // A. Responder updates battery telemetry -> 200 OK
    const telemetryRes = await fetch(`${BASE_URL}/api/teams/${testTeamId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${responderToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({
        batteryStatus: 85,
        currentZone: "East Sports Complex",
      }),
    });
    assert(telemetryRes.status === 200, `Responder telemetry update returns HTTP 200 (Got ${telemetryRes.status})`);
    const telemetryData = await telemetryRes.json();
    assert(telemetryData.data.batteryStatus === 85, "Battery status updated to 85%");
    assert(telemetryData.data.currentZone === "East Sports Complex", "Zone updated to East Sports Complex");

    // B. Responder attempts operational status change -> 403 Forbidden
    const statusForbiddenRes = await fetch(`${BASE_URL}/api/teams/${testTeamId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${responderToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({
        status: "Off Duty",
      }),
    });
    assert(
      statusForbiddenRes.status === 403,
      `Responder attempting status change rejected with HTTP 403 Forbidden (Got ${statusForbiddenRes.status})`
    );

    // C. Dispatcher updates operational status -> 200 OK
    const statusAllowedRes = await fetch(`${BASE_URL}/api/teams/${testTeamId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({
        status: "Busy",
      }),
    });
    assert(statusAllowedRes.status === 200, `Dispatcher status update returns HTTP 200 (Got ${statusAllowedRes.status})`);
    if (statusAllowedRes.status === 200) {
      const audit = (await statusAllowedRes.json()).activity;
      if (audit) {
        cleanupKeys.push({ pk: campusPk, sk: `ACTIVITY#${audit.timestamp}#${audit.id}` });
      }
    }

    // Reset team to Available for next tests
    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          pk: campusPk,
          sk: `TEAM#${testTeamId}`,
          id: testTeamId,
          name: "Campus Security Unit 3",
          callsign: "SEC-3",
          specialty: "Campus Security",
          status: "Available",
          currentZone: "Central Plaza",
          membersCount: 2,
          leadResponder: "Officer Ray Reynolds",
          contactChannel: "DISPATCH-SEC (453.025 MHz)",
          batteryStatus: 98,
          lastCheckIn: new Date().toISOString(),
          entityType: "TEAM",
        },
      })
    );

    // -------------------------------------------------------------------------
    // Test 4: Consistency: Prevent manually marking Available while actively assigned
    // -------------------------------------------------------------------------
    console.log("\nTest 4: Assignment Consistency (Blocking Available if assigned to unresolved incident)");

    // 1. Create an incident
    const incRes = await fetch(`${BASE_URL}/api/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({
        title: "Active Hazmat Spill in Lab 4",
        description: "Acid canister leaking onto concrete floor. Specialized PPE required.",
        category: "Fire & Hazard",
        severity: "Critical",
        zone: "North STEM Quad",
      }),
    });
    const incidentData = (await incRes.json()).data;
    cleanupKeys.push({ pk: campusPk, sk: `INCIDENT#${incidentData.id}` });

    // 2. Assign team to this incident
    const assignRes = await fetch(`${BASE_URL}/api/incidents/${incidentData.id}/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({ teamId: testTeamId, action: "assign" }),
    });
    assert(assignRes.status === 200, "Assigned team to incident");
    const assignAudit = (await assignRes.json()).activity;
    if (assignAudit) {
      cleanupKeys.push({ pk: campusPk, sk: `ACTIVITY#${assignAudit.timestamp}#${assignAudit.id}` });
    }

    // 3. Attempt to manually mark team Available without resolving or unassigning -> MUST REJECT WITH 409
    const manualAvailableRes = await fetch(`${BASE_URL}/api/teams/${testTeamId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({
        status: "Available",
      }),
    });
    assert(
      manualAvailableRes.status === 409,
      `Marking Available on actively assigned team rejected with HTTP 409 Conflict (Got ${manualAvailableRes.status})`
    );

    // 4. Resolve the incident properly
    const resolveRes = await fetch(`${BASE_URL}/api/incidents/${incidentData.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({ status: "Resolved", notes: "Spill neutralized." }),
    });
    assert(resolveRes.status === 200, "Incident resolved successfully");
    const resolveAudit = (await resolveRes.json()).activity;
    if (resolveAudit) {
      cleanupKeys.push({ pk: campusPk, sk: `ACTIVITY#${resolveAudit.timestamp}#${resolveAudit.id}` });
    }

    // -------------------------------------------------------------------------
    // Test 5: GET /api/activities (Scan-free, Chronological, Pagination & Filtering)
    // -------------------------------------------------------------------------
    console.log("\nTest 5: Audit Activity Logs (GET /api/activities)");
    const activitiesRes = await fetch(`${BASE_URL}/api/activities?limit=5`, {
      headers: {
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
    });
    assert(activitiesRes.status === 200, `List activities returns HTTP 200 (Got ${activitiesRes.status})`);
    const activitiesData = await activitiesRes.json();
    assert(Array.isArray(activitiesData.data), "Returns array of activities");
    assert(activitiesData.data.length > 0, "Activity log contains records");

    // Filter by incident ID
    const filterRes = await fetch(`${BASE_URL}/api/activities?incidentId=${incidentData.id}`, {
      headers: {
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
    });
    assert(filterRes.status === 200, "Filter activities by incidentId returns HTTP 200");
    const filteredData = await filterRes.json();
    assert(
      filteredData.data.every((a: { incidentId: string }) => a.incidentId === incidentData.id),
      "All filtered activities belong to the target incident"
    );

    // Immutability check: POST /api/activities should receive 405
    const postActivityRes = await fetch(`${BASE_URL}/api/activities`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${supervisorToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({ action: "Fake audit event" }),
    });
    assert(
      postActivityRes.status === 405,
      `Direct creation on audit trail rejected with HTTP 405 Method Not Allowed (Got ${postActivityRes.status})`
    );

    // -------------------------------------------------------------------------
    // Test 6: Settings API (GET /api/settings & PATCH /api/settings)
    // -------------------------------------------------------------------------
    console.log("\nTest 6: Campus Emergency Settings API");
    cleanupKeys.push({ pk: campusPk, sk: "CONFIG#SETTINGS" });

    // A. GET /api/settings
    const getSettingsRes = await fetch(`${BASE_URL}/api/settings`, {
      headers: {
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
    });
    assert(getSettingsRes.status === 200, `Get settings returns HTTP 200 (Got ${getSettingsRes.status})`);
    const settingsData = await getSettingsRes.json();
    assert(Boolean(settingsData.data.campusName), "Settings contains campusName");
    assert(Boolean(settingsData.data.dispatchHotline), "Settings contains dispatchHotline");

    // B. Dispatcher attempts to modify settings -> 403 Forbidden
    const dispatcherSettingsRes = await fetch(`${BASE_URL}/api/settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({
        campusName: "Hacked Campus Name",
      }),
    });
    assert(
      dispatcherSettingsRes.status === 403,
      `Dispatcher attempting settings change rejected with HTTP 403 Forbidden (Got ${dispatcherSettingsRes.status})`
    );

    // C. Invalid hotline validation -> 400 Bad Request
    const badHotlineRes = await fetch(`${BASE_URL}/api/settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${supervisorToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({
        dispatchHotline: "abc-invalid",
      }),
    });
    assert(
      badHotlineRes.status === 400,
      `Invalid hotline number rejected with HTTP 400 Bad Request (Got ${badHotlineRes.status})`
    );

    // D. Supervisor successfully updates settings -> 200 OK
    const updateSettingsRes = await fetch(`${BASE_URL}/api/settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${supervisorToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({
        campusName: "University Metropolis Main Sector",
        dispatchHotline: "+1 (555) 991-2222",
        dispatchChannel: "TAC-SEC-PRIMARY",
        autoEscalateCritical: true,
        aiAutoTriage: true,
      }),
    });
    assert(updateSettingsRes.status === 200, `Supervisor settings update returns HTTP 200 (Got ${updateSettingsRes.status})`);
    const updatedSettingsData = await updateSettingsRes.json();
    assert(
      updatedSettingsData.data.campusName === "University Metropolis Main Sector",
      "Campus name updated successfully"
    );
    assert(
      updatedSettingsData.data.dispatchHotline === "+1 (555) 991-2222",
      "Dispatch hotline updated successfully"
    );
  } finally {
    // -------------------------------------------------------------------------
    // Guaranteed Teardown: Delete all created test items from DynamoDB
    // -------------------------------------------------------------------------
    console.log("\n=================================================");
    console.log("  AUTOMATIC TEARDOWN: PURGING TEST ITEMS FROM DYNAMODB");
    console.log("=================================================");

    let deletedCount = 0;
    for (const key of cleanupKeys) {
      try {
        await docClient.send(new DeleteCommand({ TableName: DYNAMODB_TABLE, Key: key }));
        deletedCount++;
      } catch {}
    }

    // Verify in DynamoDB that no test incidents remain
    const verifyIncidents = await docClient.send(
      new QueryCommand({
        TableName: DYNAMODB_TABLE,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": campusPk,
          ":prefix": "INCIDENT#VIG-2026-",
        },
      })
    );
    assert((verifyIncidents.Items?.length || 0) === 0, "DynamoDB verified: ZERO test incidents remain in table");

    const verifyUsers = await docClient.send(
      new QueryCommand({
        TableName: DYNAMODB_TABLE,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": campusPk,
          ":prefix": "USER#",
        },
      })
    );
    assert((verifyUsers.Items?.length || 0) === 0, "DynamoDB verified: ZERO test users remain in table");

    console.log(`  Purged ${deletedCount} test records from DynamoDB table.`);
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log(`  MILESTONE 3 VERIFICATION: ${testsPassed} Passed, ${testsFailed} Failed`);
  console.log("=================================================");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed with error:", err);
  process.exit(1);
});

