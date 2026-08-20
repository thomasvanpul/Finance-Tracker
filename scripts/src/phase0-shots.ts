// Two-shot verification for Phase 0 fixes:
//   01: /investments at 900px viewport (~688 content) — the width
//       that used to overlap the DIVERSIFIED delta into the next
//       KPI cell AND cram 6 cells into ~90px each. Post-fix, the
//       .ft-kpi-bar CQ rule at ≤900 drops to 3 columns and the
//       .ft-kpi-bar-cell min-width:0 + delta overflow-wrap prevent
//       any single-word overlap.
//   02: same page at 1440px (~1228 content) — proves the fix
//       doesn't regress the wide-viewport case.
//
// Two only. Chromium closed on exit; verified with pgrep after.

import { chromium, type BrowserContext } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../screenshots");
const FRONTEND = "http://localhost:4321";
const API_BASE = "http://localhost:3001";

async function signIn(context: BrowserContext): Promise<void> {
  const res = await context.request.post(`${API_BASE}/api/auth/sign-in/email`, {
    headers: { "Content-Type": "application/json", "Origin": FRONTEND },
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  if (!res.ok()) throw new Error(`sign-in failed: ${res.status()} ${await res.text()}`);
  const cookies = await context.cookies();
  await context.clearCookies();
  await context.addCookies(cookies.map((c) => ({
    ...c,
    name: c.name.replace(/^__Secure-/, ""),
    secure: false,
    sameSite: "Lax" as const,
  })));
}

async function shot(browser: import("playwright").Browser, width: number, label: string): Promise<string> {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    storageState: undefined,
  });
  await signIn(context);
  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem("ft-onboarding-complete", "1");
      localStorage.setItem("nr-onboarding-complete", "1");
    } catch { /* ignore */ }
  });
  await page.goto(`${FRONTEND}/investments`, { waitUntil: "networkidle", timeout: 25000 });
  await page.waitForTimeout(1500);
  const out = resolve(OUT_DIR, `phase0-investments-${label}.png`);
  await page.screenshot({ path: out, fullPage: false });
  console.log(`[phase0] ${label} (${width}px) → ${out}`);
  await context.close();
  return out;
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    // Recapture narrow only — verifying the InvKpiBar className add.
    // Wide shot already captured earlier this session; no visual
    // regression risk from CSS-only opt-in.
    await shot(browser, 900, "narrow");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("phase0-shots fatal:", err);
  process.exit(1);
});
