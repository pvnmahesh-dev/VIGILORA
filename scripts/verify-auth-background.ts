import { chromium } from "playwright";
import path from "path";
import fs from "fs";

async function verifyAuthBackground() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const outDir = path.resolve(process.cwd(), "public/screenshots/auth_verification");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const pages = [
    { url: "http://localhost:3000/login", name: "login" },
    { url: "http://localhost:3000/register", name: "register" },
  ];

  for (const pageInfo of pages) {
    console.log(`\nVerifying ${pageInfo.name} at ${pageInfo.url}...`);
    
    // Desktop Viewport
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    let bgImageStatus: number | null = null;
    page.on("response", (res) => {
      if (res.url().includes("vigilora-auth-background.png")) {
        bgImageStatus = res.status();
        console.log(`  [NETWORK] vigilora-auth-background.png -> HTTP ${res.status()}`);
      }
    });

    await page.goto(pageInfo.url);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const deskPath = path.join(outDir, `${pageInfo.name}_desktop.png`);
    await page.screenshot({ path: deskPath, fullPage: false });
    console.log(`  [SCREENSHOT] Saved desktop screenshot: ${deskPath}`);
    console.log(`  [RESULT] Background Image Network Status: ${bgImageStatus}`);

    await context.close();

    // Mobile Viewport
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(pageInfo.url);
    await mobilePage.waitForLoadState("networkidle");
    await mobilePage.waitForTimeout(600);

    const mobPath = path.join(outDir, `${pageInfo.name}_mobile.png`);
    await mobilePage.screenshot({ path: mobPath, fullPage: false });
    console.log(`  [SCREENSHOT] Saved mobile screenshot: ${mobPath}`);

    await mobileContext.close();
  }

  await browser.close();
  console.log("\n>>> Verification Complete <<<");
}

verifyAuthBackground().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});

