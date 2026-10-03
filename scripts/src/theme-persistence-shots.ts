// Two-shot capture proving the theme persistence fix.
//
// Shot 1: signed-out auth screen. Boots with an ARCTIC value already
// in localStorage (worst-case: a previous user left it there). The
// screen must render VOID — the fixed signed-out default — because
// the ThemeProvider now ignores the cache once session resolves as
// null, and clears the cache on the way out.
//
// Shot 2: signed-in dashboard after a theme change to ARCTIC. The
// change is pushed to the server via PUT /settings/theme. The page
// is then reloaded with EMPTY localStorage, so the arctic paint on
// second load is only possible if the server hydrate is wiring
// through.
//
// Prereqs: both dev servers running, seed dev user created.
//   cd artifacts/api-server      && pnpm dev
//   cd artifacts/finance-tracker && PORT=4321 BASE_PATH=/ pnpm dev
//   pnpm --filter @workspace/scripts seed:dev
//
// Run:
//   pnpm --filter @workspace/scripts exec tsx src/theme-persistence-shots.ts

import { chromium, type Browser } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { signInSeedUser, openAccountPrefs, assertRoute } from "./account-prefs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../screenshots");
const FRONTEND = "http://localhost:4321";
const VIEWPORT = { width: 1440, height: 900 } as const;

async function shotSignedOut(browser: Browser): Promise<string> {
  const context = await browser.newContext({ viewport: VIEWPORT, storageState: undefined });
  // Deliberately seed localStorage with a NON-default theme. If the
  // ThemeProvider still trusted the cache pre-auth, the screen would
  // render arctic. It must render void.
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("ft-theme", "arctic");
  });
  await page.goto(FRONTEND, { waitUntil: "domcontentloaded" });
  // Wait for session to resolve as null and effect (3) in the
  // ThemeProvider to clear the cache + apply DEFAULT_THEME.
  await page.waitForTimeout(1500);
  const out = resolve(OUT_DIR, "theme-persist-01-signed-out-auth.png");
  await page.screenshot({ path: out, fullPage: false });
  await context.close();
  return out;
}

async function shotSignedInAfterThemeChange(browser: Browser): Promise<string> {
  const context = await browser.newContext({ viewport: VIEWPORT, storageState: undefined });
  // One capture at a time. This script sets the seed account's theme, which is
  // an account-level column shared with every other capture script — two runs
  // at once overwrite each other and one photographs the other's state.
  // openAccountPrefs takes the capture lock (see capture-lock.ts), pins
  // nr-default-page to "/" so the dashboard load is the dashboard, and
  // restore() puts the theme and the landing page back.
  const cookie = await signInSeedUser(context);
  const prefs = await openAccountPrefs(context, cookie);
  const out = resolve(OUT_DIR, "theme-persist-02-signed-in-arctic.png");
  try {
    await prefs.setTheme("arctic");
    // Deliberately NO proxyApi interceptor — the browser talks to Vite
    // on :4321, which forwards /api/* to :3001 with the __Secure- cookie
    // prefix re-added. proxyApi is the harness's workaround for cases
    // where the Vite proxy's origin-rewrite trips dev CORS; this
    // capture doesn't need it, and installing it made the client's own
    // fetch see a mangled cookie header (Vite direct: 200 session; via
    // proxyApi: session hydrate quietly returned null).
    const page = await context.newPage();
    await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle", timeout: 20000 });
    // Wait past initial paint → session resolve → server theme fetch.
    await page.waitForTimeout(1500);
    await assertRoute(page, "/");
    const themeAttr = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    console.log(`[theme-persist] rendered data-theme: ${themeAttr}`);
    await page.screenshot({ path: out, fullPage: false });
  } finally {
    await prefs.restore();
  }
  await context.close();
  return out;
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const a = await shotSignedOut(browser);
    console.log(`[theme-persist] signed-out auth → ${a}`);
    const b = await shotSignedInAfterThemeChange(browser);
    console.log(`[theme-persist] signed-in arctic → ${b}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("theme-persistence-shots fatal:", err);
  process.exit(1);
});
