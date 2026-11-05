import { chromium } from "playwright";

async function testBrowser() {
  // Try default chromium first, then msedge, then chrome
  const channels = [undefined, "msedge", "chrome"];
  for (const channel of channels) {
    try {
      console.log(`Attempting to launch browser (channel: ${channel || "default"})...`);
      const browser = await chromium.launch({ channel, headless: true });
      console.log(`Success! Browser version: ${browser.version()} (channel: ${channel || "default"})`);
      const page = await browser.newPage();
      await page.goto("http://localhost:3000/login");
      const title = await page.title();
      console.log(`Visited /login successfully. Page title: "${title}"`);
      await browser.close();
      return channel;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`Channel ${channel || "default"} failed: ${msg}`);
    }
  }
  throw new Error("No browser could be launched.");
}

testBrowser().then((ch) => {
  console.log("Working browser channel:", ch || "default");
  process.exit(0);
}).catch((e) => {
  console.error("Browser launch test failed:", e);
  process.exit(1);
});

