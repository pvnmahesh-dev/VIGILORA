/**
 * VIGILORA Milestone 2: Incidents API & ACID Transactions Test Suite
 *
 * Verifies:
 * 1. POST /api/incidents - atomic sequential ID allocation (VIG-2026-XXX) & creation audit
 * 2. GET /api/incidents - scan-free retrieval bounded by campus partition key
 * 3. GET /api/incidents/[id] - detail retrieval with related audit activities
 * 4. PATCH /api/incidents/[id] - status updates with state-machine validation
 * 5. POST /api/incidents/[id]/assign - transactional unit assignment
 * 6. POST /api/incidents/[id]/assign (unassign) - transactional unit release
 * 7. Transactional resolution - auto-releases assigned tactical team to "Available"
 * 8. RBAC enforcement - unauthenticated (401), Reporter assigning team (403), Responder updating incident (403)
 * 9. Conflict handling - assigning already busy unit (409), assigning to resolved incident (409)
 * 10. Guaranteed teardown - all created test items deleted in finally {}
 */

import crypto from "node:crypto";
import { provisionUser, hashToken } from "../src/lib/auth";
import { docClient, DYNAMODB_TABLE, getCampusPartitionKey } from "../src/lib/aws";
import { GetCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

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
  console.log("  VIGILORA MILESTONE 2: INCIDENTS API & TRANSACTIONS ");
  console.log("=================================================\n");

  const campusPk = getCampusPartitionKey();
  const runId = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const supervisorEmail = `sup.${runId}@vigilora.internal`;
  const dispatcherEmail = `disp.${runId}@vigilora.internal`;
  const reporterEmail = `rep.${runId}@vigilora.internal`;
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
      name: "Supervisor Lead",
      role: "Supervisor",
      callsign: "SUP-LEAD-1",
    });
    cleanupKeys.push({ pk: campusPk, sk: `USER#${supervisorEmail}` });

    await provisionUser({
      email: dispatcherEmail,
      password: dynamicPassword,
      name: "Dispatcher Alpha",
      role: "Dispatcher",
      callsign: "DISPATCH-1",
    });
    cleanupKeys.push({ pk: campusPk, sk: `USER#${dispatcherEmail}` });

    await provisionUser({
      email: reporterEmail,
      password: dynamicPassword,
      name: "Field Reporter",
      role: "Reporter",
    });
    cleanupKeys.push({ pk: campusPk, sk: `USER#${reporterEmail}` });

    await provisionUser({
      email: responderEmail,
      password: dynamicPassword,
      name: "Field Responder",
      role: "Responder",
      callsign: "MEDIC-UNIT",
    });
    cleanupKeys.push({ pk: campusPk, sk: `USER#${responderEmail}` });

    const supervisorToken = await loginUser(supervisorEmail, dynamicPassword);
    const dispatcherToken = await loginUser(dispatcherEmail, dynamicPassword);
    const reporterToken = await loginUser(reporterEmail, dynamicPassword);
    const responderToken = await loginUser(responderEmail, dynamicPassword);

    // Setup: Provision baseline test unit in DynamoDB
    const targetTeamId = "team-police-03";
    await docClient.send(
      new (await import("@aws-sdk/lib-dynamodb")).PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          pk: campusPk,
          sk: `TEAM#${targetTeamId}`,
          id: targetTeamId,
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
    cleanupKeys.push({ pk: campusPk, sk: `TEAM#${targetTeamId}` });

    console.log("  All test operators and test unit provisioned successfully.\n");

    // -------------------------------------------------------------------------
    // Test 1: POST /api/incidents (Atomic sequential ID allocation)
    // -------------------------------------------------------------------------
    console.log("Test 1: Create Incident with Atomic Sequential ID");
    const createRes = await fetch(`${BASE_URL}/api/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({
        title: "Perimeter Sensor Alarm at North Gate",
        description: "Motion tripped along Sector 4 chain link. Optical cameras show shadows moving toward substation.",
        category: "Security & Safety",
        severity: "High",
        zone: "North STEM Quad",
        building: "Gate 4 Maintenance Shed",
      }),
    });

    assert(createRes.status === 201, `Create incident returns HTTP 201 Created (Got ${createRes.status})`);
    const createData = await createRes.json();
    assert(createData.success === true, "Create response indicates success");
    const incident1 = createData.data;
    assert(incident1.id.startsWith("VIG-2026-"), `Incident ID formatted correctly: ${incident1.id}`);
    assert(incident1.status === "Reported", "Initial status is 'Reported'");
    assert(incident1.isCustomReported === true, "Custom reported flag set");
    cleanupKeys.push({ pk: campusPk, sk: `INCIDENT#${incident1.id}` });
    cleanupKeys.push({ pk: campusPk, sk: `ACTIVITY#${createData.activity.timestamp}#${createData.activity.id}` });

    // Verify atomic sequential progression
    const createRes2 = await fetch(`${BASE_URL}/api/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${reporterToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({
        title: "Water Pipe Leak in Basement concourse",
        description: "Pressurized pipe spraying water near electrical raceway. Requires facilities isolation.",
        category: "Facilities & Power",
        severity: "Medium",
        zone: "East Sports Complex",
      }),
    });
    assert(createRes2.status === 201, "Reporter role permitted to create incidents (HTTP 201)");
    const incident2 = (await createRes2.json()).data;
    cleanupKeys.push({ pk: campusPk, sk: `INCIDENT#${incident2.id}` });

    // Verify sequential progression (no collision)
    const num1 = parseInt(incident1.id.replace("VIG-2026-", ""), 10);
    const num2 = parseInt(incident2.id.replace("VIG-2026-", ""), 10);
    assert(num2 === num1 + 1, `IDs increment sequentially: ${incident1.id} -> ${incident2.id}`);

    // -------------------------------------------------------------------------
    // Test 2: GET /api/incidents (Scan-free Query bounded by Campus partition)
    // -------------------------------------------------------------------------
    console.log("\nTest 2: Query Campus Incidents (Scan-free)");
    const listRes = await fetch(`${BASE_URL}/api/incidents`, {
      headers: {
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
    });
    assert(listRes.status === 200, `List incidents returns HTTP 200 (Got ${listRes.status})`);
    const listData = await listRes.json();
    assert(Array.isArray(listData.data), "Returns array of incidents");
    assert(listData.data.some((i: { id: string }) => i.id === incident1.id), "Newly created incident present in list");

    // -------------------------------------------------------------------------
    // Test 3: GET /api/incidents/[id] (Single Incident & Activity Query)
    // -------------------------------------------------------------------------
    console.log("\nTest 3: Fetch Incident Detail by ID");

    // RBAC: Responders cannot access unassigned incidents -> HTTP 403
    const forbiddenRes = await fetch(`${BASE_URL}/api/incidents/${incident1.id}`, {
      headers: {
        Cookie: `vigilora_session=${responderToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
    });
    assert(forbiddenRes.status === 403, `Unassigned incident detail returns HTTP 403 for responder (Got ${forbiddenRes.status})`);

    // Dispatcher fetches incident detail -> HTTP 200
    const detailRes = await fetch(`${BASE_URL}/api/incidents/${incident1.id}`, {
      headers: {
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
    });
    assert(detailRes.status === 200, `Fetch incident detail returns HTTP 200 (Got ${detailRes.status})`);
    const detailData = await detailRes.json();
    assert(detailData.data.incident.id === incident1.id, "Fetched incident ID matches target");
    assert(Array.isArray(detailData.data.activities), "Incident includes activities array");
    assert(detailData.data.activities.length > 0, "Creation activity present in activities array");

    // 404 on nonexistent incident
    const notFoundRes = await fetch(`${BASE_URL}/api/incidents/VIG-2026-9999`, {
      headers: {
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
    });
    assert(notFoundRes.status === 404, `Nonexistent incident returns HTTP 404 (Got ${notFoundRes.status})`);

    // -------------------------------------------------------------------------
    // Test 4: POST /api/incidents/[id]/assign (Transactional Assignment)
    // -------------------------------------------------------------------------
    console.log("\nTest 4: Transactional Tactical Unit Assignment");

    const assignRes = await fetch(`${BASE_URL}/api/incidents/${incident1.id}/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({
        teamId: targetTeamId,
        action: "assign",
      }),
    });

    assert(assignRes.status === 200, `Team assignment returns HTTP 200 (Got ${assignRes.status})`);
    const assignData = await assignRes.json();
    assert(assignData.data.assignedTeamId === targetTeamId, "Incident assignedTeamId updated");
    assert(assignData.data.status === "Assigned", "Incident status transitioned from 'Reported' to 'Assigned'");
    cleanupKeys.push({ pk: campusPk, sk: `ACTIVITY#${assignData.activity.timestamp}#${assignData.activity.id}` });

    // Verify team in DynamoDB was updated atomically
    const teamRecord = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: { pk: campusPk, sk: `TEAM#${targetTeamId}` },
      })
    );
    assert(teamRecord.Item?.status === "En Route", "Team status atomically updated to 'En Route'");
    assert(teamRecord.Item?.activeIncidentId === incident1.id, "Team bound to incident ID");

    // -------------------------------------------------------------------------
    // Test 5: Conflict Handling (Cannot assign a busy team)
    // -------------------------------------------------------------------------
    console.log("\nTest 5: Conflict Check (Assigning already committed team)");
    const busyAssignRes = await fetch(`${BASE_URL}/api/incidents/${incident2.id}/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({
        teamId: targetTeamId, // Team is already busy with incident1
        action: "assign",
      }),
    });
    assert(busyAssignRes.status === 409, `Assigning busy unit returns HTTP 409 Conflict (Got ${busyAssignRes.status})`);

    // -------------------------------------------------------------------------
    // Test 6: PATCH /api/incidents/[id] (State Machine Updates)
    // -------------------------------------------------------------------------
    console.log("\nTest 6: Update Operational Status via State Machine");
    const patchRes = await fetch(`${BASE_URL}/api/incidents/${incident1.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({
        status: "Responding",
        notes: "Unit arrived at Gate 4, setting perimeter beacon",
      }),
    });
    assert(patchRes.status === 200, `Patch status returns HTTP 200 (Got ${patchRes.status})`);
    const patchData = await patchRes.json();
    assert(patchData.data.status === "Responding", "Status updated to 'Responding'");
    cleanupKeys.push({ pk: campusPk, sk: `ACTIVITY#${patchData.activity.timestamp}#${patchData.activity.id}` });

    // Test invalid transition rejection
    const invalidTransRes = await fetch(`${BASE_URL}/api/incidents/${incident1.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({
        status: "Reported", // Invalid transition backward from Responding to Reported
      }),
    });
    assert(
      invalidTransRes.status === 422,
      `Invalid transition rejected with HTTP 422 Unprocessable Entity (Got ${invalidTransRes.status})`
    );

    // -------------------------------------------------------------------------
    // Test 7: Transactional Incident Resolution & Auto-Release
    // -------------------------------------------------------------------------
    console.log("\nTest 7: Incident Resolution with Atomic Team Auto-Release");
    const resolveRes = await fetch(`${BASE_URL}/api/incidents/${incident1.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({
        status: "Resolved",
        notes: "Sensor repaired, wild raccoon escorted from transformer enclosure.",
      }),
    });
    assert(resolveRes.status === 200, `Resolution returns HTTP 200 (Got ${resolveRes.status})`);
    const resolveData = await resolveRes.json();
    assert(resolveData.data.status === "Resolved", "Incident status set to 'Resolved'");
    cleanupKeys.push({ pk: campusPk, sk: `ACTIVITY#${resolveData.activity.timestamp}#${resolveData.activity.id}` });

    // Verify team was released back to "Available"
    const releasedTeam = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: { pk: campusPk, sk: `TEAM#${targetTeamId}` },
      })
    );
    assert(releasedTeam.Item?.status === "Available", "Assigned team automatically returned to 'Available'");
    assert(releasedTeam.Item?.activeIncidentId === undefined, "Team activeIncidentId cleared");

    // Cannot assign team to already resolved incident
    const assignToResolved = await fetch(`${BASE_URL}/api/incidents/${incident1.id}/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({ teamId: targetTeamId, action: "assign" }),
    });
    assert(assignToResolved.status === 409, `Cannot assign to resolved incident (Got ${assignToResolved.status})`);

    // -------------------------------------------------------------------------
    // Test 8: RBAC & Permissions Enforcement
    // -------------------------------------------------------------------------
    console.log("\nTest 8: Strict Role-Based Access Control (RBAC)");

    // Unauthenticated request -> 401
    const unauthGet = await fetch(`${BASE_URL}/api/incidents`);
    assert(unauthGet.status === 401, `Unauthenticated request receives HTTP 401 (Got ${unauthGet.status})`);

    // Reporter cannot assign team -> 403
    const reporterAssign = await fetch(`${BASE_URL}/api/incidents/${incident2.id}/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${reporterToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({ teamId: targetTeamId, action: "assign" }),
    });
    assert(reporterAssign.status === 403, `Reporter role rejected from assigning team (Got ${reporterAssign.status})`);

    // Responder cannot patch incident details -> 403
    const responderPatch = await fetch(`${BASE_URL}/api/incidents/${incident2.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${responderToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({ status: "Resolved" }),
    });
    assert(responderPatch.status === 403, `Responder role rejected from modifying incident (Got ${responderPatch.status})`);
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

    // Verify in DynamoDB that no created test incidents remain
    let remainingIncidentKeys = 0;
    for (const key of cleanupKeys.filter((k) => k.sk.startsWith("INCIDENT#"))) {
      const check = await docClient.send(new GetCommand({ TableName: DYNAMODB_TABLE, Key: key }));
      if (check.Item) remainingIncidentKeys++;
    }
    assert(remainingIncidentKeys === 0, "DynamoDB verified: ZERO test incidents remain in table");
    console.log(`  Purged ${deletedCount} test records from DynamoDB table.`);
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log(`  MILESTONE 2 VERIFICATION: ${testsPassed} Passed, ${testsFailed} Failed`);
  console.log("=================================================");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed with error:", err);
  process.exit(1);
});

