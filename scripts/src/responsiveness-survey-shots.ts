// Responsiveness survey capture — one page at four viewport widths.
//
// Deliberately narrow scope: shows the dashboard at 820, 1024, 1280,
// and 1920 so the report can point at specific overflow / spread
// behaviour. Not a matrix; four shots total.

import { chromium, type BrowserContext } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../screenshots");
const FRONTEND = "http://localhost:4321";
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

// Narrow set for post-CQ verification. The 1024 and 1280 shots
// showed no visible change from CQ (content above the 900 threshold);
// 820 and 1920 are the informative extremes.
const WIDTHS = [820, 1920] as const;
const HEIGHT = 900;

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

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: HEIGHT },
        deviceScaleFactor: 1,
        storageState: undefined,
      });
      await signIn(context);
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
      const out = resolve(OUT_DIR, `responsive-dashboard-${width}.png`);
      await page.screenshot({ path: out, fullPage: false });
      console.log(`[responsive] ${width}px → ${out}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("responsiveness-survey-shots fatal:", err);
  process.exit(1);
});
