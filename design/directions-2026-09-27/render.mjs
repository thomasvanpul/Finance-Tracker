// Renders every still in this folder to PNG. Headless Chromium, DPR 2.
// Usage: node render.mjs [filter]
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("/Users/TvpPro/Developer/Finance-Tracker/scripts/node_modules/playwright");

const here = path.dirname(fileURLToPath(import.meta.url));
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1440, height: 900 };
const jobs = [
  ["1-spread/phone-home.html", PHONE],
  ["1-spread/phone-spending.html", PHONE],
  ["1-spread/desktop.html", DESK],
  ["2-map/phone-home.html", PHONE],
  ["2-map/phone-cash.html", PHONE],
  ["2-map/desktop.html", DESK],
  ["compare.html", { width: 820, height: 900 }],
];
const filter = process.argv[2];
const browser = await chromium.launch({ headless: true });
try {
  for (const [file, vp] of jobs) {
    if (filter && !file.includes(filter)) continue;
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    try {
      await page.goto("file://" + path.join(here, file), { waitUntil: "networkidle" });
    } catch (e) { console.log(`skip ${file}: ${e.message.split("\n")[0]}`); await ctx.close(); continue; }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    // Hard-rule probe: any number element whose content overflows its box.
    const clipped = await page.evaluate(() => [...document.querySelectorAll(".pnum")]
      .filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > innerWidth + 0.5)
      .map((e) => e.textContent.trim()).slice(0, 10));
    const out = file.replace(/\.html$/, ".png");
    await page.screenshot({ path: path.join(here, out) });
    console.log(`${out}${errors.length ? "  ERRORS: " + errors.join(" | ") : ""}${clipped.length ? "  CLIPPED: " + clipped.join(", ") : ""}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
