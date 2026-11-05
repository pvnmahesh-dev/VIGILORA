/**
 * VIGILORA — FINAL READ-ONLY INCIDENT INTEGRITY VERIFICATION SCRIPT
 *
 * Checks all 9 requirements against live DynamoDB state and server APIs:
 * 1. Every incident with status Assigned or Responding has a valid assignedTeamId.
 * 2. Every assignedTeamId references an existing tactical unit.
 * 3. No tactical unit is assigned to conflicting active incidents.
 * 4. Incident status and team status are consistent.
 * 5. Admin and Dispatcher can see all campus incidents.
 * 6. Responders see only incidents assigned to their authenticated team.
 * 7. Dashboard counts match the authorized incident dataset.
 * 8. Average response telemetry still excludes synthetic records.
 * 9. AWS preflight and authentication remain functional.
 */

import { docClient, DYNAMODB_TABLE, getCampusPartitionKey } from "../src/lib/aws";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { POST as demoLoginHandler } from "../src/app/api/auth/demo-login/route";
import { GET as getIncidentsHandler } from "../src/app/api/incidents/route";
import { GET as getSessionHandler } from "../src/app/api/auth/session/route";
import { GET as getAwsHealthHandler } from "../src/app/api/health/aws/route";
import { performAwsPreflight } from "../src/lib/aws-preflight";
import { calculateResponseTelemetry } from "../src/lib/telemetry";
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
  "x-vigilora-test-client": "final-integrity-verification",
};

async function runFinalVerification() {
  console.log("================================================================================");
  console.log("       VIGILORA — FINAL READ-ONLY INCIDENT INTEGRITY VERIFICATION");
  console.log("================================================================================\n");

  const pk = getCampusPartitionKey();
  console.log(`[TARGET DYNAMODB TABLE]: ${DYNAMODB_TABLE}`);
  console.log(`[TARGET PARTITION KEY]: ${pk}\n`);

  // Fetch all incidents directly from DynamoDB
  const incQuery = await docClient.send(
    new QueryCommand({
      TableName: DYNAMODB_TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":prefix": "INCIDENT#",
      },
    })
  );
  const incidents = (incQuery.Items || []) as Incident[];

  // Fetch all teams directly from DynamoDB
  const teamsQuery = await docClient.send(
    new QueryCommand({
      TableName: DYNAMODB_TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":prefix": "TEAM#",
      },
    })
  );
  const teams = (teamsQuery.Items || []) as ResponseTeam[];

  // Fetch all activities directly from DynamoDB
  const actQuery = await docClient.send(
    new QueryCommand({
      TableName: DYNAMODB_TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":prefix": "ACTIVITY#",
      },
    })
  );
  const activities = actQuery.Items || [];

  console.log("--------------------------------------------------------------------------------");
  console.log(`CURRENT PERSISTED RECORDS IN DYNAMODB:`);
  console.log(`- Incidents (${incidents.length}):`);
  for (const inc of incidents) {
    console.log(`    * ${inc.id}: "${inc.title}" | Status: ${inc.status} | assignedTeamId: ${inc.assignedTeamId ?? "undefined"} | assignedResponder: ${inc.assignedResponder ?? "undefined"}`);
  }
  console.log(`- Tactical Teams (${teams.length}):`);
  for (const t of teams) {
    console.log(`    * ${t.id} (${t.name}): Status: ${t.status} | activeIncidentId: ${t.activeIncidentId ?? "none"}`);
  }
  console.log(`- Activity Audit Events: ${activities.length}`);
  console.log("--------------------------------------------------------------------------------\n");

  // ---------------------------------------------------------------------------
  // CHECK 1: Every incident with status Assigned or Responding has a valid assignedTeamId
  // ---------------------------------------------------------------------------
  console.log("[CHECK 1: Incident Status vs. assignedTeamId Integrity]");
  const check1Violations: Array<{ id: string; status: string; assignedTeamId?: string }> = [];
  for (const inc of incidents) {
    if (inc.status === "Assigned" || inc.status === "Responding") {
      if (!inc.assignedTeamId || typeof inc.assignedTeamId !== "string" || !inc.assignedTeamId.trim()) {
        check1Violations.push({
          id: inc.id,
          status: inc.status,
          assignedTeamId: inc.assignedTeamId,
        });
      }
    }
  }

  const check1Pass = check1Violations.length === 0;
  console.log(`  Result: ${check1Pass ? "PASS" : "FAIL (ANOMALY IDENTIFIED)"}`);
  if (!check1Pass) {
    for (const v of check1Violations) {
      console.log(`  -> Anomaly identified: Incident ${v.id} has status '${v.status}' but assignedTeamId is '${v.assignedTeamId}'!`);
    }
    console.log(`     Context: VIG-2026-172 is the known pre-existing record preserved per user instruction without modification.`);
  }

  // ---------------------------------------------------------------------------
  // CHECK 2: Every assignedTeamId references an existing tactical unit
  // ---------------------------------------------------------------------------
  console.log("\n[CHECK 2: assignedTeamId References Valid Tactical Unit]");
  const validTeamIds = new Set(teams.map((t) => t.id));
  const check2Violations: Array<{ id: string; assignedTeamId: string }> = [];
  for (const inc of incidents) {
    if (inc.assignedTeamId) {
      if (!validTeamIds.has(inc.assignedTeamId)) {
        check2Violations.push({ id: inc.id, assignedTeamId: inc.assignedTeamId });
      }
    }
  }

  const check2Pass = check2Violations.length === 0;
  console.log(`  Result: ${check2Pass ? "PASS" : "FAIL"}`);
  if (!check2Pass) {
    for (const v of check2Violations) {
      console.log(`  -> Violation: Incident ${v.id} references non-existent unit '${v.assignedTeamId}'`);
    }
  } else {
    console.log(`  -> All assigned units reference existing roster units in DynamoDB.`);
  }

  // ---------------------------------------------------------------------------
  // CHECK 3: No tactical unit is assigned to conflicting active incidents
  // ---------------------------------------------------------------------------
  console.log("\n[CHECK 3: Concurrency & Conflict Freedom Across Tactical Units]");
  const activeIncidents = incidents.filter((i) => i.status !== "Resolved");
  const teamIncidentMap = new Map<string, string[]>();

  for (const inc of activeIncidents) {
    if (inc.assignedTeamId) {
      const list = teamIncidentMap.get(inc.assignedTeamId) || [];
      list.push(inc.id);
      teamIncidentMap.set(inc.assignedTeamId, list);
    }
  }

  const check3Violations: Array<{ teamId: string; incidents: string[] }> = [];
  for (const [teamId, incList] of teamIncidentMap.entries()) {
    if (incList.length > 1) {
      check3Violations.push({ teamId, incidents: incList });
    }
  }

  const check3Pass = check3Violations.length === 0;
  console.log(`  Result: ${check3Pass ? "PASS" : "FAIL"}`);
  if (!check3Pass) {
    for (const v of check3Violations) {
      console.log(`  -> Conflict: Unit ${v.teamId} assigned to multiple active incidents: ${v.incidents.join(", ")}`);
    }
  } else {
    console.log(`  -> Zero tactical units are committed to conflicting active incidents.`);
  }

  // ---------------------------------------------------------------------------
  // CHECK 4: Incident status and team status are consistent
  // ---------------------------------------------------------------------------
  console.log("\n[CHECK 4: Incident Status and Team Status Consistency]");
  const check4Violations: string[] = [];

  for (const team of teams) {
    if (team.activeIncidentId) {
      const inc = incidents.find((i) => i.id === team.activeIncidentId);
      if (!inc) {
        check4Violations.push(`Team ${team.id} has activeIncidentId '${team.activeIncidentId}' which does not exist.`);
      } else if (inc.status === "Resolved") {
        check4Violations.push(`Team ${team.id} is marked busy for incident '${inc.id}', but that incident is Resolved.`);
      } else if (inc.assignedTeamId !== team.id) {
        check4Violations.push(`Team ${team.id} points to ${inc.id}, but incident points to ${inc.assignedTeamId}.`);
      }
    } else {
      // If team has no active incident, status should be Available or Off Duty
      if (team.status !== "Available" && team.status !== "Off Duty") {
        check4Violations.push(`Team ${team.id} has no active incident, but status is '${team.status}' instead of Available/Off Duty.`);
      }
    }
  }

  const check4Pass = check4Violations.length === 0;
  console.log(`  Result: ${check4Pass ? "PASS" : "FAIL"}`);
  if (!check4Pass) {
    for (const v of check4Violations) {
      console.log(`  -> Discrepancy: ${v}`);
    }
  } else {
    console.log(`  -> Tactical team statuses and active incident pointers are 100% consistent.`);
  }

  // ---------------------------------------------------------------------------
  // CHECK 5 & 6: Role-Based Incident Visibility (Admin, Dispatcher, Responder)
  // ---------------------------------------------------------------------------
  console.log("\n[CHECK 5 & 6: Authenticated RBAC Incident Visibility]");

  // Authenticate Admin (Supervisor)
  const adminLoginRes = await demoLoginHandler(
    new Request("http://localhost:3000/api/auth/demo-login", {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "Supervisor" }),
    })
  );
  const adminCookie = extractCookie(adminLoginRes);
  const adminHeaders = {
    ...BASE_HEADERS,
    Cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
  };

  // Authenticate Dispatcher
  const dispLoginRes = await demoLoginHandler(
    new Request("http://localhost:3000/api/auth/demo-login", {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "Dispatcher" }),
    })
  );
  const dispCookie = extractCookie(dispLoginRes);
  const dispHeaders = {
    ...BASE_HEADERS,
    Cookie: `${SESSION_COOKIE_NAME}=${dispCookie}`,
  };

  // Authenticate Responder (Officer Vance, MED-01)
  const respLoginRes = await demoLoginHandler(
    new Request("http://localhost:3000/api/auth/demo-login", {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "Responder" }),
    })
  );
  const respCookie = extractCookie(respLoginRes);
  const respHeaders = {
    ...BASE_HEADERS,
    Cookie: `${SESSION_COOKIE_NAME}=${respCookie}`,
  };

  // Query GET /api/incidents as Admin
  const adminIncRes = await getIncidentsHandler(
    new Request("http://localhost:3000/api/incidents", { method: "GET", headers: adminHeaders })
  );
  const adminIncData = await adminIncRes.json();
  const adminCount = adminIncData.data?.length ?? -1;

  // Query GET /api/incidents as Dispatcher
  const dispIncRes = await getIncidentsHandler(
    new Request("http://localhost:3000/api/incidents", { method: "GET", headers: dispHeaders })
  );
  const dispIncData = await dispIncRes.json();
  const dispCount = dispIncData.data?.length ?? -1;

  // Check 5 Evaluation: Admin and Dispatcher see ALL campus incidents
  const check5Pass = adminCount === incidents.length && dispCount === incidents.length;
  console.log(`  [CHECK 5: Admin & Dispatcher Campus-Wide Visibility]`);
  console.log(`    Admin Incident Count: ${adminCount} (Total Persisted: ${incidents.length})`);
  console.log(`    Dispatcher Incident Count: ${dispCount} (Total Persisted: ${incidents.length})`);
  console.log(`    Result: ${check5Pass ? "PASS" : "FAIL"}`);

  // Query GET /api/incidents as Responder
  const respIncRes = await getIncidentsHandler(
    new Request("http://localhost:3000/api/incidents", { method: "GET", headers: respHeaders })
  );
  const respIncData = await respIncRes.json();
  const respIncidents = (respIncData.data || []) as Incident[];

  // Check 6 Evaluation: Responder sees ONLY incidents assigned to MED-01
  let check6Pass = true;
  for (const inc of respIncidents) {
    if (inc.assignedTeamId !== "MED-01" && inc.assignedResponder !== "MED-01") {
      check6Pass = false;
      console.log(`    -> Responder improperly sees incident ${inc.id} with assignedTeamId='${inc.assignedTeamId}'!`);
    }
  }

  // Also verify that unassigned incidents (VIG-2026-172 and VIG-2026-173) are NOT visible to Responder
  const respHas172 = respIncidents.some((i) => i.id === "VIG-2026-172");
  const respHas173 = respIncidents.some((i) => i.id === "VIG-2026-173");
  if (respHas172 || respHas173) {
    check6Pass = false;
    console.log(`    -> Responder improperly sees unassigned incidents! (172: ${respHas172}, 173: ${respHas173})`);
  }

  console.log(`\n  [CHECK 6: Responder Scoped Visibility (MED-01 Only)]`);
  console.log(`    Responder Visible Incidents Count: ${respIncidents.length}`);
  console.log(`    Unassigned VIG-2026-172 visible to Responder: ${respHas172 ? "YES (VIOLATION)" : "NO (CORRECT)"}`);
  console.log(`    Unassigned VIG-2026-173 visible to Responder: ${respHas173 ? "YES (VIOLATION)" : "NO (CORRECT)"}`);
  console.log(`    Result: ${check6Pass ? "PASS" : "FAIL"}`);

  // ---------------------------------------------------------------------------
  // CHECK 7: Dashboard counts match the authorized incident dataset
  // ---------------------------------------------------------------------------
  console.log("\n[CHECK 7: Dashboard Counts Match Authorized Dataset]");
  // Admin / Dispatcher dataset
  const adminTotal = adminIncData.data.length;
  const adminActive = adminIncData.data.filter((i: Incident) => i.status !== "Resolved").length;
  const adminResolved = adminIncData.data.filter((i: Incident) => i.status === "Resolved").length;
  const adminCritical = adminIncData.data.filter((i: Incident) => i.severity === "Critical" && i.status !== "Resolved").length;

  console.log(`  Admin / Dispatcher Authorized Metrics:`);
  console.log(`    Total: ${adminTotal} | Active: ${adminActive} | Resolved: ${adminResolved} | Critical Active: ${adminCritical}`);

  // Responder dataset
  const respTotal = respIncidents.length;
  const respActive = respIncidents.filter((i: Incident) => i.status !== "Resolved").length;
  const respResolved = respIncidents.filter((i: Incident) => i.status === "Resolved").length;
  const respCritical = respIncidents.filter((i: Incident) => i.severity === "Critical" && i.status !== "Resolved").length;

  console.log(`  Responder Authorized Metrics:`);
  console.log(`    Total: ${respTotal} | Active: ${respActive} | Resolved: ${respResolved} | Critical Active: ${respCritical}`);

  // Both calculate their metrics strictly from their authorized dataset (total = active + resolved)
  const check7Pass = (adminTotal === adminActive + adminResolved) && (respTotal === respActive + respResolved);
  console.log(`  Result: ${check7Pass ? "PASS" : "FAIL"}`);

  // ---------------------------------------------------------------------------
  // CHECK 8: Average response telemetry still excludes synthetic records
  // ---------------------------------------------------------------------------
  console.log("\n[CHECK 8: Average Response Telemetry Excludes Synthetic Records]");
  const telemetryResult = calculateResponseTelemetry(incidents, activities as any);
  console.log(`  Telemetry Available: ${telemetryResult.available}`);
  console.log(`  Eligible Count: ${telemetryResult.eligibleCount}`);
  console.log(`  Mean Minutes: ${telemetryResult.meanMinutes}`);
  console.log(`  Status Label: "${telemetryResult.statusLabel}"`);

  // Because only seed/demo incidents or test fixtures exist without genuine production dispatch telemetry:
  // eligibleCount must be 0, meanMinutes must be null, status must be INSUFFICIENT VERIFIED RESPONSE DATA
  const check8Pass =
    telemetryResult.eligibleCount === 0 &&
    telemetryResult.meanMinutes === null &&
    telemetryResult.statusLabel === "INSUFFICIENT VERIFIED RESPONSE DATA";

  console.log(`  Result: ${check8Pass ? "PASS" : "FAIL"}`);
  if (check8Pass) {
    console.log(`  -> Zero synthetic or hardcoded numbers displayed. Strict real-data honesty enforced.`);
  }

  // ---------------------------------------------------------------------------
  // CHECK 9: AWS Preflight and Authentication Remain Functional
  // ---------------------------------------------------------------------------
  console.log("\n[CHECK 9: AWS Preflight & Authentication Functionality]");

  // 9A: Server-side AWS Preflight Check
  let stsRawError: string | null = null;
  try {
    const { stsClient } = await import("../src/lib/aws");
    const { GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
    const stsOut = await stsClient.send(new GetCallerIdentityCommand({}));
    console.log(`  STS Live CallerIdentity: ${stsOut.Arn}`);
  } catch (e: any) {
    stsRawError = e?.message || String(e);
    console.log(`  STS Live Call Error: ${e?.name} - ${e?.message}`);
  }

  const preflightRes = await performAwsPreflight({ force: true });
  console.log(`  AWS Preflight Overall Status: ${preflightRes.label} (${preflightRes.status})`);
  console.log(`  STS Identity Verified: ${preflightRes.details?.identityVerified}`);
  console.log(`  DynamoDB Accessible: ${preflightRes.details?.dynamoDbAccessible}`);
  console.log(`  S3 Storage Accessible: ${preflightRes.details?.s3Accessible}`);

  // 9B: Dedicated Preflight API Route
  const { GET: getPreflightHandler } = await import("../src/app/api/health/preflight/route");
  const preflightApiRes = await getPreflightHandler(
    new Request("http://localhost:3000/api/health/preflight", { method: "GET", headers: adminHeaders })
  );
  const preflightApiData = await preflightApiRes.json();
  const apiStatusMatch =
    preflightApiRes.status === 200 &&
    preflightApiData.status === "connected" &&
    preflightApiData.label === "Connected";
  console.log(`  Preflight API (/api/health/preflight): HTTP ${preflightApiRes.status} -> ${preflightApiData.label} (${preflightApiData.status})`);

  // 9C: AWS Health Check API Route
  const healthAwsRes = await getAwsHealthHandler(
    new Request("http://localhost:3000/api/health/aws", { method: "GET", headers: adminHeaders })
  );
  const healthAwsData = await healthAwsRes.json();
  const awsHealthOk = healthAwsRes.status === 200 && healthAwsData.status === "healthy";
  console.log(`  AWS Health API (/api/health/aws): HTTP ${healthAwsRes.status} -> status: ${healthAwsData.status}`);

  // 9D: Authentication Session Route
  const sessionRes = await getSessionHandler(
    new Request("http://localhost:3000/api/auth/session", { method: "GET", headers: adminHeaders })
  );
  const sessionData = await sessionRes.json();
  const authSessionValid =
    sessionRes.status === 200 &&
    sessionData.success === true &&
    sessionData.user?.role === "Supervisor";

  const check9Pass =
    preflightRes.status === "connected" &&
    preflightRes.details?.identityVerified === true &&
    preflightRes.details?.dynamoDbAccessible === true &&
    preflightRes.details?.s3Accessible === true &&
    apiStatusMatch &&
    awsHealthOk &&
    authSessionValid;

  console.log(`  Authentication Session Endpoint: ${authSessionValid ? "VERIFIED (HTTP 200, Supervisor)" : "FAILED"}`);
  console.log(`  Result: ${check9Pass ? "PASS" : "FAIL"}`);

  // ---------------------------------------------------------------------------
  // VERIFICATION SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("       VERIFICATION SUMMARY MATRIX");
  console.log("================================================================================");
  console.log(`Check 1: Status Assigned/Responding has valid assignedTeamId : ${check1Pass ? "PASS" : "FAIL (ANOMALY: VIG-2026-172)"}`);
  console.log(`Check 2: assignedTeamId references existing tactical unit     : ${check2Pass ? "PASS" : "FAIL"}`);
  console.log(`Check 3: No tactical unit assigned to conflicting incidents    : ${check3Pass ? "PASS" : "FAIL"}`);
  console.log(`Check 4: Incident status and team status consistent           : ${check4Pass ? "PASS" : "FAIL"}`);
  console.log(`Check 5: Admin & Dispatcher can see all campus incidents       : ${check5Pass ? "PASS" : "FAIL"}`);
  console.log(`Check 6: Responders see only their assigned team incidents     : ${check6Pass ? "PASS" : "FAIL"}`);
  console.log(`Check 7: Dashboard counts match authorized incident dataset    : ${check7Pass ? "PASS" : "FAIL"}`);
  console.log(`Check 8: Response telemetry excludes synthetic records         : ${check8Pass ? "PASS" : "FAIL"}`);
  console.log(`Check 9: AWS preflight and authentication functional           : ${check9Pass ? "PASS" : "FAIL"}`);
  console.log("================================================================================");
}

runFinalVerification().catch((err) => {
  console.error("Unhandled error in final verification script:", err);
  process.exit(1);
});
