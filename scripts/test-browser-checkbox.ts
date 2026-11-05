import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("http://localhost:3000/login");
  await page.waitForLoadState("networkidle");

  const supervisorBtn = page.locator("button:has-text('Helena Vance'), button:has-text('Supervisor')").first();
  if (await supervisorBtn.count() > 0) {
    await supervisorBtn.click();
  }

  await page.waitForURL("http://localhost:3000/", { timeout: 10000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  // Find the label for Critical
  const criticalLabel = page.locator('label:has-text("Critical")');
  console.log("Critical label count:", await criticalLabel.count());

  // Inspect the input
  const criticalInput = criticalLabel.locator('input[type="checkbox"]');
  console.log("Critical input checked property:", await criticalInput.isChecked());

  const styles = await criticalInput.evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return {
      appearance: cs.appearance,
      webkitAppearance: cs.webkitAppearance,
      backgroundColor: cs.backgroundColor,
      borderColor: cs.borderColor,
      color: cs.color,
      accentColor: cs.accentColor,
      outline: cs.outline,
      boxShadow: cs.boxShadow,
      backgroundImage: cs.backgroundImage,
      width: cs.width,
      height: cs.height,
    };
  });
  console.log("Critical input computed styles:", JSON.stringify(styles, null, 2));

  // Take a zoomed screenshot of the severity section
  const severitySection = page.locator('aside:has-text("Severity")').first();
  await severitySection.screenshot({ path: "scripts/severity-section.png" });
  console.log("Screenshot saved to scripts/severity-section.png");

  // Now click on the Critical label or checkbox!
  console.log("\n--- Clicking Critical checkbox ---");
  await criticalInput.click();
  console.log("After 1st click, isChecked:", await criticalInput.isChecked());
  await severitySection.screenshot({ path: "scripts/severity-after-click1.png" });

  // Now click again to uncheck!
  console.log("\n--- Clicking Critical checkbox again ---");
  await criticalInput.click();
  console.log("After 2nd click, isChecked:", await criticalInput.isChecked());
  await severitySection.screenshot({ path: "scripts/severity-after-click2.png" });

  await browser.close();
}

main().catch(console.error);
