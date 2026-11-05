import { chromium } from "playwright";
import path from "path";
import fs from "fs";

async function verifyPages() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const outDir = path.resolve(process.cwd(), "public/screenshots/artwork_verification");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const pagesToTest = [
    { url: "http://localhost:3000/", name: "01_dashboard_desktop", mobileName: "01_dashboard_mobile" },
    { url: "http://localhost:3000/report", name: "02_report_desktop", mobileName: "02_report_mobile" },
    { url: "http://localhost:3000/teams", name: "03_teams_desktop", mobileName: "03_teams_mobile" },
    { url: "http://localhost:3000/analytics", name: "04_analytics_desktop", mobileName: "04_analytics_mobile" },
    { url: "http://localhost:3000/incidents", name: "05_incidents_desktop", mobileName: "05_incidents_mobile" },
    { url: "http://localhost:3000/login", name: "06_login_desktop", mobileName: "06_login_mobile" },
  ];

  let failedImageLoads = 0;

  // 1. Authenticate first as Administrator so all protected dashboard views render
  const authContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const authPage = await authContext.newPage();
  await authPage.goto("http://localhost:3000/login");
  await authPage.waitForLoadState("networkidle");
  const supervisorBtn = authPage.locator("button:has-text('Helena Vance'), button:has-text('Supervisor'), button:has-text('ADMINISTRATOR')").first();
  await supervisorBtn.click();
  await authPage.waitForURL("http://localhost:3000/", { timeout: 10000 });
  await authPage.waitForLoadState("networkidle");
  const cookies = await authContext.cookies();
  await authContext.close();

  for (const item of pagesToTest) {
    // 1. Desktop verification
    const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await desktopContext.addCookies(cookies);
    const desktopPage = await desktopContext.newPage();

    desktopPage.on("response", (res) => {
      const url = res.url();
      if (url.includes("/artwork/") && res.status() !== 200 && res.status() !== 304) {
        console.error(`FAILED IMAGE LOAD: ${url} (status: ${res.status()})`);
        failedImageLoads++;
      }
    });

    await desktopPage.goto(item.url);
    await desktopPage.waitForLoadState("networkidle");
    await desktopPage.waitForTimeout(600);
    const deskPath = path.join(outDir, `${item.name}.png`);
    await desktopPage.screenshot({ path: deskPath, fullPage: false });
    console.log(`Captured ${item.name} -> ${deskPath}`);
    await desktopContext.close();

    // 2. Mobile verification
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    await mobileContext.addCookies(cookies);
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(item.url);
    await mobilePage.waitForLoadState("networkidle");
    await mobilePage.waitForTimeout(600);
    const mobPath = path.join(outDir, `${item.mobileName}.png`);
    await mobilePage.screenshot({ path: mobPath, fullPage: false });
    console.log(`Captured ${item.mobileName} -> ${mobPath}`);
    await mobileContext.close();
  }

  await browser.close();

  if (failedImageLoads === 0) {
    console.log("\n>>> ALL GOTHIC ARTWORK IMAGES LOADED CLEANLY (0 FAILS) <<<");
  } else {
    console.error(`\n>>> FAILED: ${failedImageLoads} images failed to load <<<`);
    process.exit(1);
  }
}

verifyPages();
