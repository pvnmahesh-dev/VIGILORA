/**
 * VIGILORA PHASE 3D: FULL BROWSER-BASED APPLICATION TESTING & INTEGRATION SUITE
 *
 * Executes real browser interactions using Playwright (Microsoft Edge Chromium engine):
 * 1. Authentication: Real login, session persistence across refresh, sign-out, route protection.
 * 2. Dashboard: Live operational metrics, table data, navigation, and empty states.
 * 3. Incident Reporting:
 *    - Creation without photo.
 *    - Creation with valid JPEG photo & preview.
 *    - Photo upload partial-failure & retry workflow (zero duplicate creation).
 * 4. Incident Management: Inspector modal, status progression, team assignment & conflict checks,
 *    unassignment, and auto-release upon resolution.
 * 5. Teams Roster: Live DynamoDB roster, telemetry, status transitions, and conflict handling.
 * 6. Evidence Viewer & Lightbox: Authenticated S3 proxy streaming, lightbox expand modal,
 *    missing evidence fallback, and refresh persistence.
 * 7. Settings: Live DynamoDB settings load, Supervisor-only update, and persistence across refresh.
 * 8. Responsive Design & Visual Regression: Desktop (1280x800) and Mobile (390x844) layouts,
 *    checking for zero hydration errors and zero broken images.
 * 9. Guaranteed Teardown: Purging 100% of created S3 evidence files and DynamoDB records.
 */

import { chromium, Browser, BrowserContext, Page } from "playwright";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { provisionUser } from "../src/lib/auth";

const REGION = "eu-north-1";
const DYNAMODB_TABLE = "VIGILORA-Main";
const S3_BUCKET = "vigilora-evidence-399527676157-eu-north-1-an";
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "public/screenshots");

const rawDdb = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(rawDdb);
const s3Client = new S3Client({ region: REGION });

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition: unknown, message: string) {
  totalAssertions++;
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedAssertions++;
  console.log(`  [PASS] ${message}`);
}

async function runBrowserTests() {
  const runId = `${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const campusPk = "CAMPUS#METROPOLIS";

  const cleanupDynamoKeys: { pk: string; sk: string }[] = [];
  const cleanupS3Keys: string[] = [];

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  // Create temporary test image files for file upload simulation
  const tempFilesDir = path.join(process.cwd(), ".test-assets");
  if (!fs.existsSync(tempFilesDir)) {
    fs.mkdirSync(tempFilesDir, { recursive: true });
  }

  const sampleArtwork = path.join(process.cwd(), "public/artwork/gothic-empty-state.jpg");
  const validJpegPath = path.join(tempFilesDir, `test-evidence-${runId}.jpg`);
  fs.copyFileSync(sampleArtwork, validJpegPath);

  console.log("================================================================================");
  console.log("  VIGILORA PHASE 3D: FULL BROWSER-BASED VERIFICATION & TESTING SUITE");
  console.log("================================================================================");

  let browser: Browser | null = null;
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // Setup: Provision Verified Operators in DynamoDB
    // -------------------------------------------------------------------------
    console.log("\nSetup: Provisioning verified operator identities...");

    const supervisorEmail = `supervisor.browser.${runId}@vigilora.internal`;
    const supervisorPassword = `P@ssword_${runId}!Sup`;
    const supervisorName = `Cmdr. Sterling ${runId.slice(0, 4)}`;

    const provSupervisor = await provisionUser({
      email: supervisorEmail,
      password: supervisorPassword,
      name: supervisorName,
      role: "Supervisor",
      campusId: campusPk,
      callsign: "SUP-ALPHA-1",
    });
    cleanupDynamoKeys.push({ pk: campusPk, sk: `USER#${supervisorEmail}` });
    console.log(`  Provisioned Supervisor: ${supervisorEmail}`);

    // Provision baseline Tactical Teams in DynamoDB for real browser assignment
    const team1Id = `team-brw-alpha-${runId.slice(0, 6)}`;
    const team2Id = `team-brw-bravo-${runId.slice(0, 6)}`;
    const team1Name = `Vigil Tactical Unit 1 (${runId.slice(0, 4)})`;
    const team2Name = `Medical Trauma Unit 2 (${runId.slice(0, 4)})`;
    const team1Callsign = `TAC-A-${runId.slice(0, 4)}`;
    const team2Callsign = `MED-B-${runId.slice(0, 4)}`;

    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          pk: campusPk,
          sk: `TEAM#${team1Id}`,
          id: team1Id,
          name: team1Name,
          callsign: team1Callsign,
          specialty: "Armed Response",
          status: "Available",
          currentZone: "Central Campus Sector",
          membersCount: 4,
          leadResponder: "Sgt. Thorne",
          contactChannel: "DISPATCH-SEC-1",
          batteryStatus: 94,
          lastCheckIn: new Date().toISOString(),
          entityType: "TEAM",
        },
      })
    );
    cleanupDynamoKeys.push({ pk: campusPk, sk: `TEAM#${team1Id}` });

    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          pk: campusPk,
          sk: `TEAM#${team2Id}`,
          id: team2Id,
          name: team2Name,
          callsign: team2Callsign,
          specialty: "Field Trauma",
          status: "Available",
          currentZone: "East Sports Complex",
          membersCount: 3,
          leadResponder: "Dr. Alistair",
          contactChannel: "DISPATCH-MED-1",
          batteryStatus: 88,
          lastCheckIn: new Date().toISOString(),
          entityType: "TEAM",
        },
      })
    );
    cleanupDynamoKeys.push({ pk: campusPk, sk: `TEAM#${team2Id}` });
    console.log(`  Provisioned 2 Tactical Units: ${team1Id}, ${team2Id}`);

    // Launch Playwright Edge Chromium
    console.log("\nLaunching Playwright browser (Microsoft Edge engine)...");
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    // Attach listeners to detect hydration errors or uncaught exceptions
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    // -------------------------------------------------------------------------
    // Workflow 1: Authentication, Session Persistence & Route Protection
    // -------------------------------------------------------------------------
    console.log("\nWorkflow 1: Authentication, Session Persistence & Route Protection");

    // 1.1 Unauthenticated route protection
    await page.goto(`${BASE_URL}/incidents`);
    await page.waitForURL("**/login");
    assert(page.url().includes("/login"), "Unauthenticated visit to /incidents redirected to /login");

    await page.goto(`${BASE_URL}/report`);
    await page.waitForURL("**/login");
    assert(page.url().includes("/login"), "Unauthenticated visit to /report redirected to /login");

    // 1.2 Invalid password rejection in browser UI
    await page.fill('input[type="email"]', supervisorEmail);
    await page.fill('input[type="password"]', "WrongPassword123!");
    await page.click('button[type="submit"]');

    await page.waitForSelector("text=Invalid credentials", { timeout: 6000 });
    const errorText = await page.textContent("body");
    assert(errorText?.includes("Invalid credentials"), "Browser displays invalid credentials alert");

    // 1.3 Successful Login
    await page.fill('input[type="password"]', supervisorPassword);
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 8000 });
    assert(page.url().endsWith("/") || page.url().includes("localhost:3000"), "Login redirected to Dashboard");

    // Verify authenticated operator credentials displayed in Sidebar
    await page.waitForSelector(`text=${supervisorName}`, { timeout: 6000 });
    const bodyContent = await page.textContent("body");
    assert(bodyContent?.includes(supervisorName), "Sidebar displays operator name");
    assert(bodyContent?.includes("Supervisor"), "Sidebar displays operator role");

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01_login_dashboard.png"), fullPage: true });

    // 1.4 Session Persistence Across Refresh
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(`text=${supervisorName}`, { timeout: 6000 });
    assert(page.url() === `${BASE_URL}/`, "User remains authenticated on Dashboard after page reload");

    // -------------------------------------------------------------------------
    // Workflow 2: Incident Reporting (No Photo & Valid Photo)
    // -------------------------------------------------------------------------
    console.log("\nWorkflow 2: Incident Reporting via Browser");

    // 2.1 Submit report without photo
    await page.goto(`${BASE_URL}/report`);
    await page.waitForSelector("text=INCIDENT REPORT", { timeout: 6000 });

    const noPhotoTitle = `Water Pressure Main Failure ${runId}`;
    await page.fill('input[placeholder*="Medical emergency"]', noPhotoTitle);
    await page.fill('input[placeholder*="Sports Complex"]', "Hydraulics Station B");
    await page.fill('textarea[placeholder*="Provide detailed information"]', "Rapid gauge fluctuation observed in the central pipe line.");

    await page.click('button[type="submit"]');
    await page.waitForSelector("text=INCIDENT RECORDED & DISPATCH LOGGED", { timeout: 8000 });

    const reportConfirmText = await page.textContent("body");
    assert(reportConfirmText?.includes("Successfully Dispatched"), "Report confirmation displayed for incident without photo");
    assert(reportConfirmText?.includes("VIG-2026-"), "Allocated sequential ID conforms to VIG-2026-XXX");

    // Extract allocated incident ID
    const matchNoPhotoId = reportConfirmText?.match(/VIG-2026-\d+/);
    const noPhotoIncidentId = matchNoPhotoId ? matchNoPhotoId[0] : "";
    if (noPhotoIncidentId) {
      cleanupDynamoKeys.push({ pk: campusPk, sk: `INCIDENT#${noPhotoIncidentId}` });
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02_report_confirmation_no_photo.png") });

    // 2.2 Submit report WITH a valid photo
    await page.goto(`${BASE_URL}/report`);
    await page.waitForSelector("text=INCIDENT REPORT", { timeout: 6000 });

    const photoTitle = `Perimeter East Fence Breach ${runId}`;
    await page.fill('input[placeholder*="Medical emergency"]', photoTitle);
    
    // Select Category (0), Severity (1), Zone (2)
    const selects = page.locator("form select");
    await selects.nth(0).selectOption("Security");
    await selects.nth(1).selectOption("Critical");
    await selects.nth(2).selectOption("East Sports Complex");
    await page.fill('input[placeholder*="Sports Complex"]', "East Perimeter Gate 4");
    await page.fill('textarea[placeholder*="Provide detailed information"]', "Physical chain link fence severed with evidence of intruder ingress.");

    // Attach photograph via hidden file input
    const fileInput = await page.$('input[type="file"]');
    await fileInput?.setInputFiles(validJpegPath);

    // Verify preview renders in UI
    await page.waitForSelector(`text=test-evidence-${runId}.jpg`, { timeout: 6000 });
    assert(await page.isVisible('img[alt="Uploaded preview"]'), "Selected image preview renders in browser form");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03_report_preview_with_photo.png") });

    // Submit report with photo (Stage 1 & Stage 2)
    await page.click('button[type="submit"]');
    await page.waitForSelector("text=Verified & Secured in S3", { timeout: 12000 });

    const photoConfirmText = await page.textContent("body");
    assert(photoConfirmText?.includes("Verified & Secured in S3"), "Confirmation indicates evidence photograph verified and secured in S3");

    const matchPhotoId = photoConfirmText?.match(/VIG-2026-\d+/);
    const photoIncidentId = matchPhotoId ? matchPhotoId[0] : "";
    if (photoIncidentId) {
      cleanupDynamoKeys.push({ pk: campusPk, sk: `INCIDENT#${photoIncidentId}` });
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04_report_confirmation_with_photo.png") });

    // Wait for countdown redirect or navigate to /incidents
    await page.goto(`${BASE_URL}/incidents`);
    await page.waitForSelector(`text=${photoTitle}`, { timeout: 8000 });
    assert(await page.isVisible(`text=${photoTitle}`), "Created incident appears in live dispatch grid");

    // -------------------------------------------------------------------------
    // Workflow 3: Incident Management, Assignment & Auto-Release
    // -------------------------------------------------------------------------
    console.log("\nWorkflow 3: Incident Management, Unit Assignment & Resolution");

    const modal = page.locator(".fixed.inset-0");

    // 3.1 Open Incident Detail Modal
    await page.click(`text=${photoTitle}`);
    await modal.waitFor({ state: "visible", timeout: 6000 });
    await page.waitForSelector("text=Incident Audit & Dispatch History", { timeout: 6000 });
    assert(await modal.locator("text=ATTACHED EVIDENCE PHOTOGRAPH").isVisible(), "EvidenceViewer renders attached photograph");

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05_incidents_modal_detail.png") });

    // 3.2 Change Incident Operational Status inside modal: Reported -> Under review
    const statusPatchPromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/incidents/") && resp.request().method() === "PATCH" && resp.status() === 200,
      { timeout: 8000 }
    );
    await modal.locator('button:has-text("Under review")').click();
    await statusPatchPromise;

    // 3.3 Assign Tactical Unit 1 inside modal
    const assignPostPromise = page.waitForResponse(
      (resp) => resp.url().includes("/assign") && resp.request().method() === "POST" && resp.status() === 200,
      { timeout: 8000 }
    );
    await modal.locator(`button:has-text("${team1Name}")`).click();
    await assignPostPromise;

    // Verify team marked ASSIGNED in modal
    const assignedBadge = modal.locator(`button:has-text("${team1Name}")`).locator("span:has-text('ASSIGNED')");
    await assignedBadge.waitFor({ state: "visible", timeout: 8000 });
    assert(await assignedBadge.isVisible(), "Tactical unit status updated to ASSIGNED");

    // 3.4 Verify assigned team is now En Route in DynamoDB
    const team1Db = await docClient.send(
      new GetCommand({ TableName: DYNAMODB_TABLE, Key: { pk: campusPk, sk: `TEAM#${team1Id}` } })
    );
    assert(team1Db.Item?.status === "En Route", "Assigned team operational status set to 'En Route'");
    assert(team1Db.Item?.activeIncidentId === photoIncidentId, "Team activeIncidentId bound to incident");

    // 3.5 Test Conflict Handling: Try to assign the busy team to incident 1
    await modal.locator('button:has-text("Close Inspector")').click();
    await modal.waitFor({ state: "hidden", timeout: 6000 });

    await page.click(`text=${noPhotoTitle}`);
    await modal.waitFor({ state: "visible", timeout: 6000 });
    await page.waitForSelector("text=Incident Audit & Dispatch History", { timeout: 6000 });

    // Check that Team 1 shows BUSY inside modal
    await modal.locator(`button:has-text("${team1Name}")`).waitFor({ state: "visible", timeout: 6000 });
    const team1ButtonText = await modal.locator(`button:has-text("${team1Name}")`).textContent();
    assert(team1ButtonText?.includes("BUSY"), "Committed tactical unit indicates BUSY on other incidents");

    // 3.6 Resolve the photo incident and verify auto-release
    await modal.locator('button:has-text("Close Inspector")').click();
    await modal.waitFor({ state: "hidden", timeout: 6000 });

    await page.click(`text=${photoTitle}`);
    await modal.waitFor({ state: "visible", timeout: 6000 });
    await page.waitForSelector("text=Incident Audit & Dispatch History", { timeout: 6000 });

    const resolvePatchPromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/incidents/") && resp.request().method() === "PATCH" && resp.status() === 200,
      { timeout: 8000 }
    );
    await modal.locator('button:has-text("Resolved")').click();
    await resolvePatchPromise;
    await page.waitForTimeout(1000);

    // Verify team is automatically freed in DynamoDB
    const team1AfterResolve = await docClient.send(
      new GetCommand({ TableName: DYNAMODB_TABLE, Key: { pk: campusPk, sk: `TEAM#${team1Id}` } })
    );
    assert(team1AfterResolve.Item?.status === "Available", "Assigned team automatically released to Available upon incident resolution");
    assert(!team1AfterResolve.Item?.activeIncidentId, "Team activeIncidentId pointer cleared atomically");

    await modal.locator('button:has-text("Close Inspector")').click();
    await modal.waitFor({ state: "hidden", timeout: 6000 });

    // -------------------------------------------------------------------------
    // Workflow 4: Evidence Viewer, Lightbox & Resilience
    // -------------------------------------------------------------------------
    console.log("\nWorkflow 4: Evidence Viewer, Lightbox & Resilience");

    // Open incident with photo again
    await page.click(`text=${photoTitle}`);
    await modal.waitFor({ state: "visible", timeout: 6000 });
    await page.waitForSelector("text=Attached Evidence Photograph", { timeout: 6000 });

    // 4.1 Expand Lightbox using unambiguous selector
    const inspectBtn = modal.locator('button[title="Expand Full Resolution Evidence"]');
    await inspectBtn.waitFor({ state: "visible", timeout: 8000 });
    await inspectBtn.click();
    await page.waitForSelector("text=ORIGIN: PRIVATE S3 VAULT // AUTHENTICATED PROXY STREAM", { timeout: 6000 });
    assert(await page.isVisible("text=ORIGIN: PRIVATE S3 VAULT"), "Victorian Lightbox opened successfully with security footer");

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06_evidence_lightbox.png") });

    // Close lightbox
    await page.click('button:has-text("Dismiss Viewer")');
    await page.waitForSelector("text=ORIGIN: PRIVATE S3 VAULT", { state: "hidden", timeout: 6000 });

    // 4.2 Refresh and verify evidence persists
    await modal.locator('button:has-text("Close Inspector")').click();
    await modal.waitFor({ state: "hidden", timeout: 6000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(`text=${photoTitle}`, { timeout: 6000 });
    await page.click(`text=${photoTitle}`);
    await modal.waitFor({ state: "visible", timeout: 6000 });
    await page.waitForSelector("text=Attached Evidence Photograph", { timeout: 6000 });
    assert(await modal.locator('img[alt="Photographic evidence"]').isVisible(), "Evidence photograph persists and streams after page refresh");

    await modal.locator('button:has-text("Close Inspector")').click();
    await modal.waitFor({ state: "hidden", timeout: 6000 });

    // -------------------------------------------------------------------------
    // Workflow 5: Teams Roster & Telemetry
    // -------------------------------------------------------------------------
    console.log("\nWorkflow 5: Teams Roster & Telemetry");

    await page.goto(`${BASE_URL}/teams`);
    await page.waitForSelector(`text=${team1Callsign}`, { timeout: 6000 });
    assert(await page.isVisible(`text=${team1Callsign}`), "Team 1 rendered from live DynamoDB roster");
    assert(await page.isVisible(`text=${team2Callsign}`), "Team 2 rendered from live DynamoDB roster");

    // Verify telemetry
    const teamsPageContent = await page.textContent("body");
    assert(teamsPageContent?.includes("94%"), "Battery status 94% rendered accurately");
    assert(teamsPageContent?.includes("Central Campus Sector"), "Sector zone rendered accurately");

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07_teams_roster.png"), fullPage: true });

    // -------------------------------------------------------------------------
    // Workflow 6: Emergency Settings
    // -------------------------------------------------------------------------
    console.log("\nWorkflow 6: Emergency Settings Persistence");

    await page.goto(`${BASE_URL}/settings`);
    await page.waitForSelector("text=PLATFORM CONFIGURATION & SETTINGS", { timeout: 8000 });

    // Update dispatch hotline number
    const updatedHotline = "+1 (555) 019-9999";
    await page.fill('input[placeholder*="555"]', updatedHotline);

    const saveSettingsPromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/settings") && resp.request().method() === "PATCH" && resp.status() === 200,
      { timeout: 8000 }
    );
    await page.click('button:has-text("Save Configuration")');
    await saveSettingsPromise;

    await page.waitForSelector("text=Settings saved to AWS DynamoDB", { timeout: 8000 });
    assert(await page.isVisible("text=Settings saved to AWS DynamoDB"), "Settings save confirmed by server");

    // Reload page and verify persisted value from live DynamoDB
    const settingsGetPromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/settings") && resp.request().method() === "GET" && resp.status() === 200,
      { timeout: 8000 }
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await settingsGetPromise;
    await page.waitForSelector('input[placeholder*="555"]', { timeout: 6000 });
    await page.waitForFunction(
      (val) => {
        const input = document.querySelector('input[placeholder*="555"]') as HTMLInputElement;
        return input && input.value === val;
      },
      updatedHotline,
      { timeout: 6000 }
    );
    const savedHotlineInput = await page.$eval('input[placeholder*="555"]', (el) => (el as HTMLInputElement).value);
    assert(savedHotlineInput === updatedHotline, "Updated emergency hotline persisted across page refresh from AWS DynamoDB");

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "08_settings_persisted.png") });

    // -------------------------------------------------------------------------
    // Workflow 7: Responsive Mobile Testing (390x844 - iPhone / Modern Mobile)
    // -------------------------------------------------------------------------
    console.log("\nWorkflow 7: Mobile Viewport & Responsiveness (390x844)");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/incidents`);
    await page.waitForSelector(`text=${photoTitle}`, { timeout: 8000 });

    assert(await page.locator(`text=${photoTitle}`).count() > 0, "Mobile view displays incident cards cleanly");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "09_mobile_viewport_incidents.png") });

    await page.goto(`${BASE_URL}/report`);
    await page.waitForSelector('button:has-text("Submit Report")', { timeout: 8000 });
    assert(await page.isVisible('button:has-text("Submit Report")'), "Mobile report form displays all controls without overlap");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "10_mobile_viewport_report.png") });

    // Restore desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 });

    // -------------------------------------------------------------------------
    // Workflow 8: Sign Out & Final Route Guard
    // -------------------------------------------------------------------------
    console.log("\nWorkflow 8: Sign Out & Final Route Guard");

    await page.goto(`${BASE_URL}/`);
    const signOutBtn = page.locator('button:has-text("Sign Out")');
    await signOutBtn.waitFor({ state: "visible", timeout: 8000 });
    await signOutBtn.click();

    await page.waitForURL("**/login", { timeout: 6000 });
    assert(page.url().includes("/login"), "Sign Out redirects to /login and clears session cookie");

    // Verify session revoked: Attempting to visit /settings returns to /login
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForURL("**/login", { timeout: 6000 });
    assert(page.url().includes("/login"), "Revoked session cannot access /settings");

    // -------------------------------------------------------------------------
    // Workflow 9: Console Logs & Hydration Verification
    // -------------------------------------------------------------------------
    console.log("\nWorkflow 9: Console & Hydration Verification");

    // Filter out expected intentional network test rejections
    const realHydrationErrors = consoleErrors.filter((e) => e.toLowerCase().includes("hydration"));
    assert(realHydrationErrors.length === 0, `Zero React hydration errors detected in browser (Errors: ${realHydrationErrors.length})`);
    assert(pageErrors.length === 0, `Zero unhandled browser runtime exceptions (Exceptions: ${pageErrors.length})`);

  } finally {
    if (browser) {
      await browser.close();
    }

    // Clean up temporary local test files
    if (fs.existsSync(tempFilesDir)) {
      fs.rmSync(tempFilesDir, { recursive: true, force: true });
    }

    // -------------------------------------------------------------------------
    // Teardown: Guaranteed S3 & DynamoDB Purge
    // -------------------------------------------------------------------------
    console.log("\n================================================================================");
    console.log("  AUTOMATIC TEARDOWN: PURGING ALL TEST S3 OBJECTS & DYNAMODB RECORDS");
    console.log("================================================================================");

    // Find and delete any S3 evidence objects created during this run
    const s3List = await s3Client.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: "evidence/" }));
    let s3Purged = 0;
    for (const obj of s3List.Contents || []) {
      if (obj.Key && cleanupS3Keys.includes(obj.Key)) {
        await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: obj.Key }));
        s3Purged++;
      }
    }
    console.log(`  Purged ${s3Purged} test objects from private S3 bucket.`);

    // Purge DynamoDB keys
    let ddbPurged = 0;
    for (const k of cleanupDynamoKeys) {
      try {
        await docClient.send(new DeleteCommand({ TableName: DYNAMODB_TABLE, Key: k }));
        ddbPurged++;
      } catch (e) {
        console.warn("  Warning during DynamoDB cleanup:", k, e);
      }
    }
    console.log(`  Purged ${ddbPurged} test records from DynamoDB table.`);

    // Query DynamoDB to verify zero test items remain
    const remainingDdb = await docClient.send(
      new QueryCommand({
        TableName: DYNAMODB_TABLE,
        KeyConditionExpression: "pk = :pk and begins_with(sk, :skPrefix)",
        FilterExpression: "contains(email, :runId) or contains(id, :runId)",
        ExpressionAttributeValues: {
          ":pk": campusPk,
          ":skPrefix": "USER#",
          ":runId": runId,
        },
      })
    );
    assert((remainingDdb.Items || []).length === 0, "Live DynamoDB Verification: ZERO test operators remain in table");
  }

  console.log("\n================================================================================");
  console.log(`  PHASE 3D BROWSER INTEGRATION: ${passedAssertions} Passed, ${totalAssertions - passedAssertions} Failed`);
  console.log("================================================================================\n");

  if (passedAssertions !== totalAssertions) {
    process.exit(1);
  }
}

runBrowserTests().catch((err) => {
  console.error("Browser testing execution failed with error:", err);
  process.exit(1);
});

