// Responsiveness survey capture — one page at four viewport widths.
//
// Deliberately narrow scope: shows the dashboard at 820, 1024, 1280,
// and 1920 so the report can point at specific overflow / spread
// behaviour. Not a matrix; four shots total.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { signInSeedUser, openAccountPrefs, assertRoute, type AccountPrefs } from "./account-prefs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../screenshots");
const FRONTEND = "http://localhost:4321";

// Narrow set for post-CQ verification. The 1024 and 1280 shots
// showed no visible change from CQ (content above the 900 threshold);
// 820 and 1920 are the informative extremes.
const WIDTHS = [820, 1920] as const;
const HEIGHT = 900;

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  let prefs: AccountPrefs | null = null;
  try {
    // Takes the capture lock and pins nr-default-page to "/", so every shot
    // below is the dashboard; restore() in the finally puts the landing page
    // back. Its own context, so it outlives the per-width contexts.
    const prefsCtx = await browser.newContext();
    prefs = await openAccountPrefs(prefsCtx, await signInSeedUser(prefsCtx));
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: HEIGHT },
        deviceScaleFactor: 1,
        storageState: undefined,
      });
      await signInSeedUser(context);
      const page = await context.newPage();
      // Seed the onboarding-complete flag so the dashboard renders
      // rather than the onboarding gate.
      await page.addInitScript(() => {
        try {
          localStorage.setItem("ft-onboarding-complete", "1");
          localStorage.setItem("nr-onboarding-complete", "1");
        } catch { /* ignore */ }
      });
      await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle", timeout: 25000 });
      await page.waitForTimeout(1200);
      await assertRoute(page, "/");
      const out = resolve(OUT_DIR, `responsive-dashboard-${width}.png`);
      await page.screenshot({ path: out, fullPage: false });
      console.log(`[responsive] ${width}px → ${out}`);
      await context.close();
    }
  } finally {
    try {
      await prefs?.restore();
    } finally {
      await browser.close();
    }
  }
}

main().catch((err) => {
  console.error("responsiveness-survey-shots fatal:", err);
  process.exit(1);
});
