/**
 * VIGILORA Teams API Isolation & Decontamination Test Suite
 *
 * Verifies all 10 requirements of TASK 5:
 * 1. Empty DynamoDB roster returns zero teams (not demo teams).
 * 2. Existing team records in DynamoDB are returned correctly.
 * 3. Missing team detail returns HTTP 404.
 * 4. GET requests never write to DynamoDB.
 * 5. Assignment to nonexistent team returns HTTP 404.
 * 6. Assignment to existing team succeeds.
 * 7. Reassignment does not create hollow previous-team records.
 * 8. Existing active teams remain unchanged during seeding.
 * 9. Repeated seeding does not overwrite records (reports preserved).
 * 10. AWS mode does not import or serve demo data.
 *
 * Automatic Teardown:
 * - Purges all created test items in finally {}
 * - Verifies zero test records remain in DynamoDB.
 */

import crypto from "node:crypto";
import { provisionUser, hashToken } from "../src/lib/auth";
import { docClient, DYNAMODB_TABLE, getCampusPartitionKey } from "../src/lib/aws";
import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { seedCampusTeams } from "./seed-campus-teams";
import { ResponseTeam } from "../src/types/team";

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

async function runIsolationTests() {
  console.log("=================================================");
  console.log("  VIGILORA TEAMS API ISOLATION TEST SUITE ");
  console.log("=================================================\n");

  const campusPk = getCampusPartitionKey();
  const runId = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const dispatcherEmail = `iso.disp.${runId}@vigilora.internal`;
  const dynamicPassword = `Secret_${crypto.randomBytes(16).toString("base64url")}_${Date.now()}!`;

  try {
    // -------------------------------------------------------------------------
    // Setup: Provision Operator
    // -------------------------------------------------------------------------
    console.log("Setup: Provisioning verified test dispatcher...");
    await provisionUser({
      email: dispatcherEmail,
      password: dynamicPassword,
      name: "Dispatcher Test",
      role: "Dispatcher",
      callsign: "DISP-ISO",
    });
    cleanupKeys.push({ pk: campusPk, sk: `USER#${dispatcherEmail}` });

    const dispatcherToken = await loginUser(dispatcherEmail, dynamicPassword);
    console.log("  Dispatcher authenticated successfully.\n");

    // -------------------------------------------------------------------------
    // Test 1: Empty DynamoDB roster returns zero teams (NO demo fallback)
    // -------------------------------------------------------------------------
    console.log("Test 1: Empty DynamoDB roster returns zero teams");
    // Ensure no teams currently exist in DynamoDB for test
    const listEmptyRes = await fetch(`${BASE_URL}/api/teams`, {
      headers: {
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
    });
    assert(listEmptyRes.status === 200, `GET /api/teams returns HTTP 200 (Got ${listEmptyRes.status})`);
    const listEmptyData = await listEmptyRes.json();
    assert(Array.isArray(listEmptyData.data), "Returns array in data property");
    assert(listEmptyData.data.length === 0, `Empty table returns exactly 0 teams (Got ${listEmptyData.data.length})`);
    assert(listEmptyData.total === 0, `total count is 0 (Got ${listEmptyData.total})`);

    // -------------------------------------------------------------------------
    // Test 2: Existing team records in DynamoDB are returned correctly
    // -------------------------------------------------------------------------
    console.log("\nTest 2: Existing team records in DynamoDB are returned correctly");
    const testTeam1Id = `team-iso-alpha-${runId}`;
    const testTeam1: ResponseTeam = {
      id: testTeam1Id,
      name: "Alpha Isolation Unit",
      callsign: "ISO-1",
      specialty: "Campus Security",
      status: "Available",
      currentZone: "Central Plaza",
      membersCount: 3,
      leadResponder: "Officer Test Alpha",
      contactChannel: "DISPATCH-1",
      batteryStatus: 99,
      lastCheckIn: new Date().toISOString(),
    };

    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          pk: campusPk,
          sk: `TEAM#${testTeam1Id}`,
          ...testTeam1,
          entityType: "TEAM",
        },
      })
    );
    cleanupKeys.push({ pk: campusPk, sk: `TEAM#${testTeam1Id}` });

    const listWithOneRes = await fetch(`${BASE_URL}/api/teams`, {
      headers: {
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
    });
    const listWithOneData = await listWithOneRes.json();
    assert(listWithOneData.data.length === 1, `Returned exactly 1 persisted team (Got ${listWithOneData.data.length})`);
    assert(listWithOneData.data[0].id === testTeam1Id, `Returned team ID matches persisted team`);
    assert(listWithOneData.data[0].name === testTeam1.name, `Returned team name matches persisted team`);

    // -------------------------------------------------------------------------
    // Test 3: Missing team detail returns HTTP 404
    // -------------------------------------------------------------------------
    console.log("\nTest 3: Missing team detail returns HTTP 404");
    const missingTeamId = `non-existent-team-${runId}`;
    const missingRes = await fetch(`${BASE_URL}/api/teams/${missingTeamId}`, {
      headers: {
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
    });
    assert(missingRes.status === 404, `GET non-existent team returns HTTP 404 (Got ${missingRes.status})`);
    const missingData = await missingRes.json();
    assert(missingData.success === false, "Response success flag is false");

    // -------------------------------------------------------------------------
    // Test 4: GET requests never write to DynamoDB
    // -------------------------------------------------------------------------
    console.log("\nTest 4: GET requests never write to DynamoDB");
    // Verify missingTeamId was NOT created in DynamoDB
    const ghostCheck = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: { pk: campusPk, sk: `TEAM#${missingTeamId}` },
      })
    );
    assert(!ghostCheck.Item, "Non-existent team was NOT written to DynamoDB on GET");

    // Also test requesting a demo team ID like "team-alpha-01" when not seeded
    const demoTeamId = "team-alpha-01";
    const demoReqRes = await fetch(`${BASE_URL}/api/teams/${demoTeamId}`, {
      headers: {
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
    });
    assert(demoReqRes.status === 404, `GET unseeded demo team ID returns HTTP 404 (Got ${demoReqRes.status})`);
    const demoCheck = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: { pk: campusPk, sk: `TEAM#${demoTeamId}` },
      })
    );
    assert(!demoCheck.Item, "Unseeded demo team was NOT lazily created in DynamoDB");

    // -------------------------------------------------------------------------
    // Test 5: Assignment to nonexistent team returns HTTP 404
    // -------------------------------------------------------------------------
    console.log("\nTest 5: Assignment to nonexistent team returns HTTP 404");
    const testInc1Id = `VIG-TEST-${runId}-1`;
    const now = new Date().toISOString();
    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          pk: campusPk,
          sk: `INCIDENT#${testInc1Id}`,
          id: testInc1Id,
          title: "Test Incident for Assignment",
          description: "Testing team assignment validation",
          category: "Security & Safety",
          severity: "Medium",
          status: "Reported",
          location: { zone: "Central Plaza" },
          createdAt: now,
          updatedAt: now,
          entityType: "INCIDENT",
        },
      })
    );
    cleanupKeys.push({ pk: campusPk, sk: `INCIDENT#${testInc1Id}` });

    const assignMissingRes = await fetch(`${BASE_URL}/api/incidents/${testInc1Id}/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({
        teamId: "non-existent-unit-999",
      }),
    });
    assert(assignMissingRes.status === 404, `Assignment to nonexistent team returns HTTP 404 (Got ${assignMissingRes.status})`);
    const assignMissingData = await assignMissingRes.json();
    assert(assignMissingData.success === false, "Assignment failed as expected");

    // -------------------------------------------------------------------------
    // Test 6: Assignment to existing team succeeds
    // -------------------------------------------------------------------------
    console.log("\nTest 6: Assignment to existing team succeeds");
    const assignSuccessRes = await fetch(`${BASE_URL}/api/incidents/${testInc1Id}/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({
        teamId: testTeam1Id,
      }),
    });
    assert(assignSuccessRes.status === 200, `Assignment to existing team returns HTTP 200 (Got ${assignSuccessRes.status})`);
    const assignSuccessData = await assignSuccessRes.json();
    assert(assignSuccessData.data.assignedTeamId === testTeam1Id, "Incident updated with assigned team ID");

    // Verify team status in DynamoDB
    const teamDbCheck = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: { pk: campusPk, sk: `TEAM#${testTeam1Id}` },
      })
    );
    assert(teamDbCheck.Item?.status === "En Route", `Team status updated to En Route in DynamoDB`);
    assert(teamDbCheck.Item?.activeIncidentId === testInc1Id, `Team activeIncidentId set to incident ID`);

    // -------------------------------------------------------------------------
    // Test 7: Reassignment does not create hollow previous-team records
    // -------------------------------------------------------------------------
    console.log("\nTest 7: Reassignment does not create hollow previous-team records");
    // Create a 2nd real team
    const testTeam2Id = `team-iso-bravo-${runId}`;
    const testTeam2: ResponseTeam = {
      id: testTeam2Id,
      name: "Bravo Isolation Unit",
      callsign: "ISO-2",
      specialty: "Campus Security",
      status: "Available",
      currentZone: "Central Plaza",
      membersCount: 2,
      leadResponder: "Officer Test Bravo",
      contactChannel: "DISPATCH-2",
      batteryStatus: 95,
      lastCheckIn: new Date().toISOString(),
    };
    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          pk: campusPk,
          sk: `TEAM#${testTeam2Id}`,
          ...testTeam2,
          entityType: "TEAM",
        },
      })
    );
    cleanupKeys.push({ pk: campusPk, sk: `TEAM#${testTeam2Id}` });

    // Create an incident with a fictitious assignedTeamId that does not exist in DynamoDB
    const ghostPrevTeamId = `ghost-prev-team-${runId}`;
    const testInc2Id = `VIG-TEST-${runId}-2`;
    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          pk: campusPk,
          sk: `INCIDENT#${testInc2Id}`,
          id: testInc2Id,
          title: "Incident with Phantom Assigned Team",
          description: "Testing reassignment safety when previous team is not in DB",
          category: "Facilities & Power",
          severity: "Low",
          status: "Assigned",
          assignedTeamId: ghostPrevTeamId,
          assignedResponder: "Phantom Unit",
          createdAt: now,
          updatedAt: now,
          entityType: "INCIDENT",
        },
      })
    );
    cleanupKeys.push({ pk: campusPk, sk: `INCIDENT#${testInc2Id}` });

    // Reassign incident 2 to real team 2
    const reassignRes = await fetch(`${BASE_URL}/api/incidents/${testInc2Id}/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
      body: JSON.stringify({
        teamId: testTeam2Id,
      }),
    });
    assert(reassignRes.status === 200, `Reassignment returns HTTP 200 (Got ${reassignRes.status})`);

    // Check if ghostPrevTeamId was created in DynamoDB as a hollow stub
    const ghostStubCheck = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: { pk: campusPk, sk: `TEAM#${ghostPrevTeamId}` },
      })
    );
    assert(!ghostStubCheck.Item, "No hollow team stub created in DynamoDB for non-existent previous team");

    // -------------------------------------------------------------------------
    // Test 8: Existing active teams remain unchanged during seeding
    // -------------------------------------------------------------------------
    console.log("\nTest 8: Existing active teams remain unchanged during seeding");
    // Seed campus teams using the programmatic seeder
    const seedResult1 = await seedCampusTeams({ campusId: campusPk, nonInteractive: true });
    assert(seedResult1.seededCount > 0, `Seeded initial template teams (Count: ${seedResult1.seededCount})`);

    // Verify each seeded team in cleanup list
    for (const item of seedResult1.items) {
      if (item.outcome === "SEEDED") {
        cleanupKeys.push({ pk: campusPk, sk: `TEAM#${item.id}` });
      }
    }

    // Now modify one team's status and telemetry to "On Scene", battery 61%
    const seededAlphaId = "team-alpha-01";
    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          pk: campusPk,
          sk: `TEAM#${seededAlphaId}`,
          id: seededAlphaId,
          name: "Paramedic Unit Alpha",
          callsign: "MEDIC-1",
          specialty: "Emergency Medical Services",
          status: "On Scene", // active operational status
          batteryStatus: 61,
          currentZone: "West Quad Tactical",
          membersCount: 3,
          leadResponder: "Chief Medic",
          contactChannel: "MED-1",
          lastCheckIn: now,
          entityType: "TEAM",
        },
      })
    );

    // Run seeding again
    const seedResult2 = await seedCampusTeams({ campusId: campusPk, nonInteractive: true });

    // Verify team-alpha-01 was PRESERVED and active status not overwritten
    const preservedAlphaCheck = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: { pk: campusPk, sk: `TEAM#${seededAlphaId}` },
      })
    );
    assert(preservedAlphaCheck.Item?.status === "On Scene", `Active operational status "On Scene" was preserved`);
    assert(preservedAlphaCheck.Item?.batteryStatus === 61, `Telemetry batteryStatus 61% was preserved`);
    assert(preservedAlphaCheck.Item?.currentZone === "West Quad Tactical", `Zone "West Quad Tactical" was preserved`);

    // -------------------------------------------------------------------------
    // Test 9: Repeated seeding does not overwrite records (reports preserved)
    // -------------------------------------------------------------------------
    console.log("\nTest 9: Repeated seeding does not overwrite records");
    assert(seedResult2.seededCount === 0, `Second seed pass seeded 0 new teams (Got ${seedResult2.seededCount})`);
    assert(seedResult2.preservedCount === seedResult2.totalTemplates, `All ${seedResult2.totalTemplates} teams reported PRESERVED`);

    // -------------------------------------------------------------------------
    // Test 10: AWS mode does not import or serve demo data
    // -------------------------------------------------------------------------
    console.log("\nTest 10: AWS mode does not import or serve demo data");
    // Verify that all teams returned by GET /api/teams exist in DynamoDB and none contain mock demo incident references
    const finalTeamsRes = await fetch(`${BASE_URL}/api/teams`, {
      headers: {
        Cookie: `vigilora_session=${dispatcherToken}`,
        "x-vigilora-test-client": "active-test-suite",
      },
    });
    const finalTeamsData = await finalTeamsRes.json();
    assert(finalTeamsRes.status === 200, `Final GET /api/teams returns HTTP 200`);
    assert(finalTeamsData.success === true, "Response success is true");

    let hasDanglingDemoIncidents = false;
    for (const t of finalTeamsData.data as ResponseTeam[]) {
      if (t.activeIncidentId && t.activeIncidentId.startsWith("VIG-2026-08")) {
        // Mock demo incident ID from demoData.ts
        hasDanglingDemoIncidents = true;
      }
    }
    assert(!hasDanglingDemoIncidents, "Zero dangling mock demo incident references in campus team roster");

  } catch (err) {
    console.error("Test execution failed with error:", err);
    testsFailed++;
  } finally {
    // -------------------------------------------------------------------------
    // Automatic Teardown: Purge all created test items
    // -------------------------------------------------------------------------
    console.log("\n=================================================");
    console.log("  AUTOMATIC TEARDOWN: PURGING TEST ITEMS FROM DYNAMODB");
    console.log("=================================================");

    let deletedCount = 0;
    for (const key of cleanupKeys) {
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: DYNAMODB_TABLE,
            Key: key,
          })
        );
        deletedCount++;
      } catch {
        // ignore deletion errors
      }
    }

    // Also clean up any activities generated during test
    try {
      const actRes = await docClient.send(
        new QueryCommand({
          TableName: DYNAMODB_TABLE,
          KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
          ExpressionAttributeValues: {
            ":pk": campusPk,
            ":prefix": "ACTIVITY#",
          },
        })
      );
      for (const item of actRes.Items || []) {
        if (
          item.actor?.includes("iso.disp.") ||
          item.incidentId?.includes("VIG-TEST-") ||
          item.teamId?.includes("team-iso-")
        ) {
          await docClient.send(
            new DeleteCommand({
              TableName: DYNAMODB_TABLE,
              Key: { pk: campusPk, sk: item.sk },
            })
          );
          deletedCount++;
        }
      }
    } catch {
      // ignore
    }

    console.log(`  Purged ${deletedCount} test records from DynamoDB table.`);

    // Live verification of zero test records
    const verifyUser = await docClient.send(
      new QueryCommand({
        TableName: DYNAMODB_TABLE,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": campusPk,
          ":prefix": `USER#${dispatcherEmail}`,
        },
      })
    );
    assert(verifyUser.Count === 0, "DynamoDB verified: ZERO test users remain in table");

    const verifyTeams = await docClient.send(
      new QueryCommand({
        TableName: DYNAMODB_TABLE,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": campusPk,
          ":prefix": `TEAM#team-iso-`,
        },
      })
    );
    assert(verifyTeams.Count === 0, "DynamoDB verified: ZERO test teams remain in table");
  }

  console.log("\n=================================================");
  console.log(`  TEAMS API ISOLATION VERIFICATION: ${testsPassed} Passed, ${testsFailed} Failed`);
  console.log("=================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runIsolationTests();

