import { chromium } from "playwright";

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

async function main() {
  console.log("================================================================================");
  console.log("   VIGILORA — COMPREHENSIVE SEVERITY CHECKBOX E2E VERIFICATION (PLAYWRIGHT)");
  console.log("================================================================================\n");

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // ---------------------------------------------------------------------------
  // TEST 1: Fresh Login as Admin & Default Checkbox State
  // ---------------------------------------------------------------------------
  console.log("[TEST 1: Fresh Login & Default Unchecked State]");
  await context.clearCookies();
  await page.goto("http://localhost:3000/login");
  await page.waitForLoadState("networkidle");

  const supervisorBtn = page.locator("button:has-text('Helena Vance'), button:has-text('Supervisor')").first();
  await supervisorBtn.click();
  await page.waitForURL("http://localhost:3000/", { timeout: 10000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  // Check all four severity checkboxes in desktop RightInspector
  const critInput = page.locator("#desktop-severity-filter-critical");
  const highInput = page.locator("#desktop-severity-filter-high");
  const medInput = page.locator("#desktop-severity-filter-medium");
  const lowInput = page.locator("#desktop-severity-filter-low");

  assert((await critInput.count()) > 0, "Critical checkbox input exists with #desktop-severity-filter-critical");
  assert((await highInput.count()) > 0, "High checkbox input exists with #desktop-severity-filter-high");
  assert((await medInput.count()) > 0, "Medium checkbox input exists with #desktop-severity-filter-medium");
  assert((await lowInput.count()) > 0, "Low checkbox input exists with #desktop-severity-filter-low");

  assert((await critInput.isChecked()) === false, "Critical checkbox is UNCHECKED by default");
  assert((await highInput.isChecked()) === false, "High checkbox is UNCHECKED by default");
  assert((await medInput.isChecked()) === false, "Medium checkbox is UNCHECKED by default");
  assert((await lowInput.isChecked()) === false, "Low checkbox is UNCHECKED by default");

  // Inspect table rows by default: all 3 incidents visible (Resolved, Under review, Reported)
  await page.waitForSelector("tbody tr.cursor-pointer", { timeout: 10000 });
  const rowsDefault = page.locator("tbody tr.cursor-pointer");
  const countDefault = await rowsDefault.count();
  assert(countDefault === 3, `Default shows all campus incidents (found ${countDefault})`);

  // Screenshot of default unchecked appearance
  const aside = page.locator("div.sticky aside");
  await aside.screenshot({ path: "scripts/screenshot-1-default.png" });

  // ---------------------------------------------------------------------------
  // TEST 2: Clicking CRITICAL Only
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 2: Selecting CRITICAL Only]");
  const critLabel = page.locator('label[for="desktop-severity-filter-critical"]');
  await critLabel.click();
  await page.waitForTimeout(300);

  assert((await critInput.isChecked()) === true, "Critical checkbox is now CHECKED");
  assert((await highInput.isChecked()) === false, "High checkbox remains UNCHECKED");
  assert((await medInput.isChecked()) === false, "Medium checkbox remains UNCHECKED");
  assert((await lowInput.isChecked()) === false, "Low checkbox remains UNCHECKED");

  // Verify Incident Queue displays ONLY Critical incident (VIG-2026-171)
  const rowsCritical = page.locator("tbody tr.cursor-pointer");
  const countCritical = await rowsCritical.count();
  assert(countCritical === 1, `Queue filtered to exactly 1 Critical incident (found ${countCritical})`);
  const critRowText = await rowsCritical.first().innerText();
  assert(critRowText.includes("VIG-2026-171"), "Displayed incident is VIG-2026-171 (Critical)");

  // Active filter chip appears
  const activeChips = page.locator('#clear-all-filters-btn');
  assert((await activeChips.count()) > 0, "Header 'Clear All Filters' tag is visible");

  await aside.screenshot({ path: "scripts/screenshot-2-critical-selected.png" });

  // ---------------------------------------------------------------------------
  // TEST 3: Clicking CRITICAL Again Deselects It
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 3: Deselecting CRITICAL by Clicking Again]");
  await critLabel.click();
  await page.waitForTimeout(300);

  assert((await critInput.isChecked()) === false, "Critical checkbox is now DESELECTED (unchecked)");
  const rowsAfterDeselect = page.locator("tbody tr.cursor-pointer");
  assert((await rowsAfterDeselect.count()) === 3, "Queue restored to all 3 incidents after deselecting Critical");

  // ---------------------------------------------------------------------------
  // TEST 4: Multi-Select: Critical + High Combination
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 4: Selecting Multiple Severities (Critical + High)]");
  await critLabel.click();
  await page.waitForTimeout(200);
  const highLabel = page.locator('label[for="desktop-severity-filter-high"]');
  await highLabel.click();
  await page.waitForTimeout(300);

  assert((await critInput.isChecked()) === true, "Critical is checked");
  assert((await highInput.isChecked()) === true, "High is checked");
  assert((await medInput.isChecked()) === false, "Medium is unchecked");
  assert((await lowInput.isChecked()) === false, "Low is unchecked");

  const rowsMulti = page.locator("tbody tr.cursor-pointer");
  const countMulti = await rowsMulti.count();
  assert(countMulti === 2, `Queue shows combined 2 incidents (Critical VIG-2026-171 + High VIG-2026-172, found ${countMulti})`);

  await aside.screenshot({ path: "scripts/screenshot-3-multi-selected.png" });

  // ---------------------------------------------------------------------------
  // TEST 5: Clear All Filters Restores Default
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 5: Clear All Filters Button]");
  const clearBtn = page.locator("#inspector-clear-filters-btn").first();
  await clearBtn.click();
  await page.waitForTimeout(300);

  assert((await critInput.isChecked()) === false, "Critical restored to unchecked");
  assert((await highInput.isChecked()) === false, "High restored to unchecked");
  assert((await medInput.isChecked()) === false, "Medium restored to unchecked");
  assert((await lowInput.isChecked()) === false, "Low restored to unchecked");
  assert((await page.locator("tbody tr.cursor-pointer").count()) === 3, "All 3 incidents restored after clearing");

  // ---------------------------------------------------------------------------
  // TEST 6: Repeated Toggling of Critical Checkbox
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 6: Repeated Rapid Toggling of Critical Checkbox]");
  for (let cycle = 1; cycle <= 3; cycle++) {
    await critLabel.click();
    await page.waitForTimeout(100);
    assert((await critInput.isChecked()) === true, `Cycle ${cycle}: Selected Critical -> isChecked=true`);
    await critLabel.click();
    await page.waitForTimeout(100);
    assert((await critInput.isChecked()) === false, `Cycle ${cycle}: Deselected Critical -> isChecked=false`);
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Browser Refresh Preserves Unchecked State
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 7: Browser Refresh (F5)]");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  const critInputAfterReload = page.locator("#desktop-severity-filter-critical");
  assert((await critInputAfterReload.isChecked()) === false, "Critical checkbox remains UNCHECKED after browser refresh");
  assert((await page.locator("tbody tr.cursor-pointer").count()) === 3, "All 3 incidents displayed after browser refresh");

  // ---------------------------------------------------------------------------
  // TEST 8: Navigation Away and Back
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 8: Navigation Away to /incidents and Back to /]");
  await page.goto("http://localhost:3000/incidents");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  await page.goto("http://localhost:3000/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  const critInputAfterNav = page.locator("#desktop-severity-filter-critical");
  assert((await critInputAfterNav.isChecked()) === false, "Critical checkbox remains UNCHECKED after returning from navigation");

  // ---------------------------------------------------------------------------
  // TEST 9: Fresh Dispatcher and Field Responder Logins
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 9: Role Switch & Verification (Dispatcher, Responder)]");

  // Dispatcher login
  await context.clearCookies();
  await page.goto("http://localhost:3000/login");
  await page.waitForLoadState("networkidle");
  await page.locator("button:has-text('Lead Dispatcher'), button:has-text('Austin')").first().click();
  await page.waitForURL("http://localhost:3000/", { timeout: 10000 });
  await page.waitForLoadState("networkidle");
  await page.waitForSelector("tbody tr.cursor-pointer", { timeout: 10000 });

  const dispRole = await page.locator("#command-centre-role-indicator").innerText();
  console.log("Dispatcher logged in as:", dispRole);

  const dispCrit = page.locator("#desktop-severity-filter-critical");
  assert((await dispCrit.isChecked()) === false, "Dispatcher: Critical is UNCHECKED by default");
  const dispCount = await page.locator("tbody tr.cursor-pointer").count();
  console.log("Dispatcher visible rows:", dispCount);
  assert(dispCount === 3, `Dispatcher: all 3 campus incidents visible (got ${dispCount})`);

  // Field Responder login (Officer Vance)
  await context.clearCookies();
  await page.goto("http://localhost:3000/login");
  await page.waitForLoadState("networkidle");
  await page.locator("button:has-text('Officer Vance'), button:has-text('Responder')").first().click();
  await page.waitForURL("http://localhost:3000/", { timeout: 10000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  const roleText = await page.locator("#command-centre-role-indicator").innerText();
  console.log("Logged-in role indicator:", roleText);

  const respCrit = page.locator("#desktop-severity-filter-critical");
  assert((await respCrit.isChecked()) === false, "Responder: Critical is UNCHECKED by default");
  
  const incidentRows = page.locator("tbody tr.cursor-pointer");
  const rowCount = await incidentRows.count();
  console.log("Responder incident rows count:", rowCount);
  assert(rowCount === 0, "Responder: zero unassigned incidents displayed (strict RBAC)");

  await browser.close();

  console.log("\n================================================================================");
  console.log(`  PLAYWRIGHT E2E SEVERITY FILTER SUITE: ${passed} PASSED | ${failed} FAILED`);
  console.log("================================================================================\n");

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("FATAL ERROR in Playwright E2E:", err);
  process.exit(1);
});
