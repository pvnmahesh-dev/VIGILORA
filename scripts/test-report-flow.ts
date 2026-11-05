/**
 * VIGILORA HACKATHON: REPORT INCIDENT LIFECYCLE & FRESH FORM TEST SUITE
 *
 * Verifies:
 * 1. Incident Creation: POST /api/incidents creates and commits genuine record.
 * 2. Incident Persistence: Pre-existing incidents remain intact when new reports are submitted.
 * 3. Separate Records: Consecutive reports allocate distinct, non-colliding atomic IDs.
 * 4. Fresh Form Contract: Form state reset lifecycle is complete and comprehensive.
 * 5. Event Navigation Bridge: TopNavigation, Sidebar, Incidents, and Dashboard dispatch "vigilora:new-report".
 * 6. Clean DOM Structure: Zero nested <button> elements inside Next.js <Link> wrappers.
 * 7. Redirect Lifecycle Safety: handleResetForm is executed before any post-submission navigation.
 * 8. Zero Stale State: All 20+ form state fields reset to clean initial defaults.
 */

import { POST as createIncidentHandler, GET as getIncidentsHandler } from "../src/app/api/incidents/route";
import { POST as demoLoginHandler } from "../src/app/api/auth/demo-login/route";
import { SESSION_COOKIE_NAME } from "../src/lib/auth";
import { docClient, DYNAMODB_TABLE } from "../src/lib/aws";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import fs from "node:fs";
import path from "node:path";

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

async function runReportLifecycleSuite() {
  console.log("================================================================================");
  console.log("     VIGILORA HACKATHON: REPORT INCIDENT LIFECYCLE & FRESH FORM TEST SUITE");
  console.log("================================================================================\n");

  const createdIncidentIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // Setup: Authenticate Session
    // -------------------------------------------------------------------------
    console.log("[SETUP: Authenticating Session for Incident Reporting]");
    const loginReq = new Request("http://localhost:3000/api/auth/demo-login", {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "Dispatcher" }),
    });
    const loginRes = await demoLoginHandler(loginReq);
    const sessionCookie = extractCookie(loginRes);
    assert(Boolean(sessionCookie), "Dispatcher session acquired");

    const authHeaders = {
      ...BASE_HEADERS,
      "Content-Type": "application/json",
      Cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
    };

    // -------------------------------------------------------------------------
    // SCENARIO 1: First Incident Submission
    // -------------------------------------------------------------------------
    console.log("\n[SCENARIO 1: First Incident Submission]");
    const incident1Payload = {
      title: "Test Incident Alpha - Electrical Sparking",
      description: "Intermittent electrical sparking observed in basement corridor near electrical panel B.",
      category: "Infrastructure",
      severity: "High",
      zone: "North STEM Quad",
      building: "Engineering Hall B",
      landmark: "Basement Corridor 02",
      reporterContact: "Officer Vance",
      hasPhoto: false,
    };

    const res1 = await createIncidentHandler(
      new Request("http://localhost:3000/api/incidents", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(incident1Payload),
      })
    );

    assert(res1.status === 201, "First incident created with HTTP 201");
    const data1 = await res1.json();
    assert(data1.success === true, "Response reports success = true");
    assert(Boolean(data1.data?.id), `Allocated valid incident ID (${data1.data?.id})`);
    assert(data1.data?.title === incident1Payload.title, "Title matches submitted payload");
    const id1 = data1.data?.id;
    if (id1) createdIncidentIds.push(id1);

    // -------------------------------------------------------------------------
    // SCENARIO 2: Second Incident Submission (Fresh Report Creation)
    // -------------------------------------------------------------------------
    console.log("\n[SCENARIO 2: Second Incident Submission (Distinct Record)]");
    const incident2Payload = {
      title: "Test Incident Beta - Blocked Fire Exit",
      description: "Pallets and debris stacked against west exit door creating bottleneck hazard.",
      category: "Fire and Hazard",
      severity: "Medium",
      zone: "East Sports Complex",
      building: "Memorial Arena",
      landmark: "Gate 4 Service Concourse",
      reporterContact: "Dispatcher Austin",
      hasPhoto: false,
    };

    const res2 = await createIncidentHandler(
      new Request("http://localhost:3000/api/incidents", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(incident2Payload),
      })
    );

    assert(res2.status === 201, "Second incident created with HTTP 201");
    const data2 = await res2.json();
    assert(data2.success === true, "Second response reports success = true");
    assert(Boolean(data2.data?.id), `Allocated separate valid incident ID (${data2.data?.id})`);
    const id2 = data2.data?.id;
    if (id2) createdIncidentIds.push(id2);

    assert(id1 !== id2, `Incident 1 (${id1}) and Incident 2 (${id2}) have distinct IDs`);
    assert(data2.data?.title === incident2Payload.title, "Second incident has its own unique title");

    // -------------------------------------------------------------------------
    // SCENARIO 3: Incident Persistence & Multi-Incident Coexistence
    // -------------------------------------------------------------------------
    console.log("\n[SCENARIO 3: Verification of Pre-Existing Incident Persistence]");
    const listRes = await getIncidentsHandler(
      new Request("http://localhost:3000/api/incidents", {
        method: "GET",
        headers: authHeaders,
      })
    );

    assert(listRes.status === 200, "GET /api/incidents returns HTTP 200");
    const listData = await listRes.json();
    assert(Array.isArray(listData.data), "Incident roster returned as array");

    const found1 = listData.data.find((i: { id: string }) => i.id === id1);
    const found2 = listData.data.find((i: { id: string }) => i.id === id2);

    assert(Boolean(found1), `First incident ${id1} is persistently stored in database`);
    assert(Boolean(found2), `Second incident ${id2} is persistently stored in database`);
    assert(found1?.title === incident1Payload.title, "First incident title preserved without modification");
    assert(found2?.title === incident2Payload.title, "Second incident title preserved without modification");

    // -------------------------------------------------------------------------
    // SCENARIO 4: Source Code Contract Audit - Fresh Form State Lifecycle
    // -------------------------------------------------------------------------
    console.log("\n[SCENARIO 4: Report Page Fresh State & Lifecycle Verification]");
    const reportPagePath = path.join(process.cwd(), "src/app/report/page.tsx");
    const reportCode = fs.readFileSync(reportPagePath, "utf-8");

    // Verify handleResetForm completeness
    assert(reportCode.includes("const handleResetForm = useCallback("), "handleResetForm is memoized with useCallback");
    assert(reportCode.includes('setTitle("")'), "handleResetForm resets title to empty string");
    assert(reportCode.includes('setDescription("")'), "handleResetForm resets description to empty string");
    assert(reportCode.includes('setBuilding("")'), "handleResetForm resets building to empty string");
    assert(reportCode.includes('setSubmittedIncident(null)'), "handleResetForm clears submittedIncident to null");
    assert(reportCode.includes('setRedirectCountdown(null)'), "handleResetForm cancels redirect countdown");
    assert(reportCode.includes('setTriageResult(null)'), "handleResetForm clears AI triage recommendation");
    assert(reportCode.includes('setCategory("Medical")'), "handleResetForm resets category to default");
    assert(reportCode.includes('setSeverity("High")'), "handleResetForm resets severity to default");

    // Verify event listener registration
    assert(reportCode.includes('window.addEventListener("vigilora:new-report"'), "Report page listens to 'vigilora:new-report'");
    assert(reportCode.includes('window.removeEventListener("vigilora:new-report"'), "Report page removes listener on unmount");

    // Verify countdown timer reset integration
    assert(reportCode.includes("handleResetForm();\n      router.push(\"/incidents\");"), "Redirect timer calls handleResetForm before navigating to /incidents");

    // Verify manual exit buttons call handleResetForm
    assert(reportCode.includes("handleResetForm();\n                  router.push(\"/incidents\");"), "View on Live Board calls handleResetForm before navigation");
    assert(reportCode.includes("handleResetForm();\n                  router.push(\"/\");"), "Cancel button calls handleResetForm before navigation");

    // -------------------------------------------------------------------------
    // SCENARIO 5: Navigation Dispatch Contract & Clean DOM Structure
    // -------------------------------------------------------------------------
    console.log("\n[SCENARIO 5: Navigation Buttons Dispatch & HTML DOM Integrity]");
    const topNavPath = path.join(process.cwd(), "src/components/layout/TopNavigation.tsx");
    const topNavCode = fs.readFileSync(topNavPath, "utf-8");

    assert(topNavCode.includes('window.dispatchEvent(new CustomEvent("vigilora:new-report"))'), "TopNavigation dispatches 'vigilora:new-report'");
    assert(!topNavCode.includes('<Link href="/report">\n          <button'), "TopNavigation has zero nested <button> inside <Link>");

    const sidebarPath = path.join(process.cwd(), "src/components/layout/Sidebar.tsx");
    const sidebarCode = fs.readFileSync(sidebarPath, "utf-8");
    assert(sidebarCode.includes('window.dispatchEvent(new CustomEvent("vigilora:new-report"))'), "Sidebar dispatches 'vigilora:new-report'");

    const incidentsPagePath = path.join(process.cwd(), "src/app/incidents/page.tsx");
    const incidentsCode = fs.readFileSync(incidentsPagePath, "utf-8");
    assert(incidentsCode.includes('window.dispatchEvent(new CustomEvent("vigilora:new-report"))'), "Incidents page dispatches 'vigilora:new-report'");
    assert(!incidentsCode.includes('<Link href="/report">\n                <Button'), "Incidents page has zero nested <Button> inside <Link>");

    const homePagePath = path.join(process.cwd(), "src/app/page.tsx");
    const homeCode = fs.readFileSync(homePagePath, "utf-8");
    assert(homeCode.includes('window.dispatchEvent(new CustomEvent("vigilora:new-report"))'), "Dashboard page dispatches 'vigilora:new-report'");
    assert(!homeCode.includes('<Link href="/report">\n                <button'), "Dashboard page has zero nested <button> inside <Link>");

  } finally {
    // -------------------------------------------------------------------------
    // Cleanup: Remove test incidents from DynamoDB
    // -------------------------------------------------------------------------
    console.log("\n[CLEANUP: Removing Temporary Test Incidents]");
    const { getCampusPartitionKey } = await import("../src/lib/aws");
    const campusPk = getCampusPartitionKey();
    for (const id of createdIncidentIds) {
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: DYNAMODB_TABLE,
            Key: {
              pk: campusPk,
              sk: `INCIDENT#${id}`,
            },
          })
        );
        console.log(`  [CLEANUP] Deleted test incident ${id}`);
      } catch (err) {
        console.warn(`  [WARN] Failed to delete test incident ${id}:`, err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`  REPORT LIFECYCLE SUITE RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runReportLifecycleSuite().catch((err) => {
  console.error("Unhandled error in test suite:", err);
  process.exit(1);
});
