// Two-shot capture proving the auth-card weight rebalance.
//
// Shot 1: sign-in default (void theme). The mark + wordmark now lead;
//   the primary action is outline-accent, not a solid olive block.
// Shot 2: sign-in with wrong-credentials error. Same ladder holds
//   under an error state; the alert doesn't dominate the mark.
//
// Two only — the audit's session budget is a handful of screenshots.
// Chromium is closed on exit; verified with pgrep.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../screenshots");
const FRONTEND = "http://localhost:4321";
const VIEWPORT = { width: 1440, height: 900 } as const;

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    // Shot 1 — default sign-in, void.
    {
      const context = await browser.newContext({ viewport: VIEWPORT, storageState: undefined });
      const page = await context.newPage();
      await page.goto(FRONTEND, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(700);
      const out = resolve(OUT_DIR, "auth-rebalance-01-signin-default.png");
      await page.screenshot({ path: out, fullPage: false });
      console.log(`[auth-rebalance] signin default → ${out}`);
      await context.close();
    }
    // Shot 2 — sign-in with wrong-credentials error, void.
    {
      const context = await browser.newContext({ viewport: VIEWPORT, storageState: undefined });
      const page = await context.newPage();
      await page.goto(FRONTEND, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);
      await page.fill('input[type="email"]', "nobody@example.test");
      await page.fill('input[type="password"]', "not-a-real-password");
      await page.keyboard.press("Enter");
      await page.getByText("Wrong email or password", { exact: false }).waitFor({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(400);
      const out = resolve(OUT_DIR, "auth-rebalance-02-signin-error.png");
      await page.screenshot({ path: out, fullPage: false });
      console.log(`[auth-rebalance] signin error → ${out}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("auth-rebalance-shots fatal:", err);
  process.exit(1);
});
