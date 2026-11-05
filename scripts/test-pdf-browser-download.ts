import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { POST as demoLoginHandler } from "../src/app/api/auth/demo-login/route";
import { SESSION_COOKIE_NAME } from "../src/lib/auth";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function main() {
  console.log("================================================================================");
  console.log("       VIGILORA HACKATHON: BROWSER PDF DOWNLOAD VERIFICATION");
  console.log("================================================================================\n");

  // Step 1: Obtain a valid session cookie for Lead Dispatcher
  const req = new Request("http://localhost:3000/api/auth/demo-login", {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "Content-Type": "application/json",
      "x-vigilora-test-client": "browser-pdf-test",
    },
    body: JSON.stringify({ role: "Dispatcher" }),
  });

  const res = await demoLoginHandler(req);
  assert(res.status === 200, "Demo login API returns HTTP 200");
  const setCookie = res.headers.get("set-cookie");
  const tokenMatch = setCookie?.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  const sessionToken = tokenMatch ? tokenMatch[1] : null;
  assert(Boolean(sessionToken), "Acquired valid session token cookie");

  if (!sessionToken) {
    console.error("Failed to acquire session token.");
    process.exit(1);
  }

  // Step 2: Launch Microsoft Edge Chromium headless browser
  console.log("\n[Launching Playwright Headless Browser (Edge Channel)]");
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
  });

  // Inject authentication session cookie into browser context
  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: sessionToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();

  try {
    // Step 3: Navigate to Analytics Page
    console.log("\n[Navigating to /analytics]");
    await page.goto("http://localhost:3000/analytics", { waitUntil: "networkidle" });
    assert(page.url().includes("/analytics"), "Successfully loaded /analytics page");

    // Verify presence of Export button
    const exportButton = page.locator("button:has-text('Export Summary Report')");
    await exportButton.waitFor({ state: "visible", timeout: 10000 });
    assert(await exportButton.isVisible(), "'Export Summary Report' button is visible on page");

    // Step 4: Click button and capture browser download event
    console.log("\n[Triggering PDF Export Download]");
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 15000 }),
      exportButton.click(),
    ]);

    const suggestedName = download.suggestedFilename();
    assert(
      suggestedName === "VIGILORA_Campus_Incident_Summary.pdf",
      `Downloaded file name matches exact requirement: "${suggestedName}"`
    );

    // Save downloaded file and inspect
    const downloadDest = path.join(process.cwd(), "public", "demo", "browser-downloaded-report.pdf");
    await download.saveAs(downloadDest);
    assert(fs.existsSync(downloadDest), "Downloaded file successfully written to disk");

    const fileBuffer = fs.readFileSync(downloadDest);
    assert(fileBuffer.length > 4000, `Downloaded PDF is valid size: ${fileBuffer.length} bytes (> 4KB)`);
    assert(fileBuffer.toString("latin1").startsWith("%PDF-"), "Downloaded PDF starts with %PDF- magic bytes");

    // Step 5: Verify on-page UI status feedback (success notification banner)
    console.log("\n[Verifying In-Page Feedback]");
    const successBanner = page.locator("text=Report downloaded: VIGILORA_Campus_Incident_Summary.pdf");
    await successBanner.waitFor({ state: "visible", timeout: 5000 });
    assert(await successBanner.isVisible(), "Success banner appeared in the UI without alert() popups");

    console.log("\n[Browser PDF Download Verified Successfully]");
  } finally {
    await browser.close();
  }

  console.log("\n================================================================================");
  console.log(`  BROWSER DOWNLOAD TEST: ${passed} PASSED | ${failed} FAILED`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Browser test failed:", err);
  process.exit(1);
});
