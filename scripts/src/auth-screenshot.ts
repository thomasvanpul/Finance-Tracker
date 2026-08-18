// Auth-gate screenshot helper.
//
// The main screenshot harness signs in as the seed user before
// capturing, so it can never reach the auth gate. This tiny sibling
// visits the app cold, with no cookies, and captures the auth
// screen in whichever mode + theme + viewport is asked for.
//
// Modes: signin, signup, forgot, reset (?token=demo), error-*
// Themes: void, arctic
// Viewports: mobile (390×844), desktop (1440×900)
//
// Run:
//   pnpm --filter @workspace/scripts exec tsx src/auth-screenshot.ts

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../screenshots");

const BASE = "http://localhost:4321";

type Theme = "void" | "arctic";
type Viewport = "mobile" | "desktop";

interface Shot {
  name: string;
  path: string;              // route + query, e.g. "/?mode=signup"
  clicks?: string[];         // roles or selectors to click before capture
  fills?: [string, string][]; // selectors + values to fill (to trigger error states)
  submit?: boolean;          // submit the form after fills
  waitForText?: string;      // wait for a text to appear (post-submit)
}

const shots: Shot[] = [
  { name: "signin",  path: "/" },
  { name: "signup",  path: "/", clicks: ["Sign up"] },
  { name: "forgot",  path: "/", clicks: ["Forgot password?"] },
  { name: "reset",   path: "/?token=demo-reset-token-xyz" },
];

const viewports: Record<Viewport, { width: number; height: number }> = {
  mobile:  { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
};

async function shoot(theme: Theme, viewport: Viewport, shot: Shot): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: viewports[viewport],
    // Clear storage so auth-gate always renders
    storageState: undefined,
  });
  const page = await context.newPage();

  // Preload the theme choice into localStorage before the app boots.
  // Theme context reads "ft-theme" (see contexts/theme-context.tsx).
  await page.addInitScript((t) => {
    localStorage.setItem("ft-theme", t);
  }, theme);

  await page.goto(`${BASE}${shot.path}`, { waitUntil: "domcontentloaded" });
  // Give the client a beat to hydrate + settle theme
  await page.waitForTimeout(400);

  if (shot.clicks) {
    for (const label of shot.clicks) {
      await page.getByRole("button", { name: label }).click();
      await page.waitForTimeout(200);
    }
  }
  if (shot.fills) {
    for (const [sel, val] of shot.fills) {
      await page.fill(sel, val);
    }
  }
  if (shot.submit) {
    await page.keyboard.press("Enter");
    if (shot.waitForText) {
      await page.getByText(shot.waitForText, { exact: false }).waitFor({ timeout: 8000 }).catch(() => {});
    } else {
      await page.waitForTimeout(1200);
    }
  }

  const out = resolve(OUT_DIR, `auth-${shot.name}_${viewport}_${theme}.png`);
  await page.screenshot({ path: out, fullPage: false });
  console.log(`[auth-screenshot] ${shot.name} · ${viewport} · ${theme} → ${out}`);

  await context.close();
  await browser.close();
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  for (const theme of ["void", "arctic"] as Theme[]) {
    for (const viewport of ["mobile", "desktop"] as Viewport[]) {
      for (const shot of shots) {
        try {
          await shoot(theme, viewport, shot);
        } catch (err) {
          console.error(`[auth-screenshot] ${shot.name} · ${viewport} · ${theme} FAILED:`, err);
        }
      }
    }
  }
}

main().catch((err) => {
  console.error("auth-screenshot fatal:", err);
  process.exit(1);
});
