// Playwright screenshot harness for Numeris. Signs in as the seeded dev
// user (see seed-dev-user.ts), navigates to a route at a chosen viewport
// and theme, and writes a PNG to ./screenshots (gitignored).
//
// Prerequisite: both dev servers running.
//   1. cd artifacts/api-server      && pnpm dev
//   2. cd artifacts/finance-tracker && PORT=4321 BASE_PATH=/ pnpm dev
//   3. pnpm --filter @workspace/scripts seed:dev   (once)
//   4. pnpm --filter @workspace/scripts screenshot -- --route /accounts --viewport mobile --theme arctic
//
// Batch mode:
//   pnpm --filter @workspace/scripts screenshot -- \
//     --routes /accounts,/net-worth --themes void,arctic --viewport mobile

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { assertRoutesKnown } from "./app-routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ───────────────────────────────────────────────────────────────────
const FRONTEND = process.env.SCREENSHOT_FRONTEND ?? "http://localhost:4321";
const OUTPUT_DIR = resolve(__dirname, "..", "screenshots");

// A rendered Numeris page carries far more text than this. The threshold
// only has to separate "the app drew something" from "the bundle threw and
// React unmounted the tree", which is a two-orders-of-magnitude gap.
const BLANK_PAGE_MIN_CHARS = 40;

type Viewport = "mobile" | "desktop";
const VIEWPORTS: Record<Viewport, { width: number; height: number }> = {
  mobile:  { width: 390,  height: 844  },
  desktop: { width: 1440, height: 900  },
};

const VALID_THEMES = new Set([
  "void", "phosphor", "arctic", "parchment", "slate", "linen",
  "amber", "midnight", "matrix", "synthwave", "deep-space",
  "mario", "gilded", "bloodline",
]);

// ── CLI ──────────────────────────────────────────────────────────────────────
interface Args {
  routes: string[];
  themes: string[];
  viewport: Viewport;
  name: string | null;
  // Account-level preferences to apply to the seed user for this run
  // (see applyAccountPrefs). Undefined = leave as is.
  persona: string | undefined;
  tabSlot: string | null | undefined;
}

function parseArgs(argv: string[]): Args {
  const get = (k: string): string | undefined => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const route = get("--route");
  const routes = get("--routes");
  const theme = get("--theme");
  const themes = get("--themes");
  const viewportRaw = (get("--viewport") ?? "mobile") as Viewport;
  const name = get("--name") ?? null;
  const persona = get("--persona");
  const tabSlotRaw = get("--tab-slot");
  const tabSlot = tabSlotRaw === undefined ? undefined : tabSlotRaw === "null" ? null : tabSlotRaw;

  if (!(viewportRaw in VIEWPORTS)) {
    throw new Error(`--viewport must be one of ${Object.keys(VIEWPORTS).join("|")}`);
  }

  const routeList = routes ? routes.split(",").map((s) => s.trim()) : [route ?? "/"];
  const themeList = themes ? themes.split(",").map((s) => s.trim()) : [theme ?? "void"];

  for (const t of themeList) {
    if (!VALID_THEMES.has(t)) throw new Error(`unknown theme "${t}"`);
  }

  // A route was already validated the same way by inspect.ts before it
  // started two dev servers. Repeated here because screenshot.ts is also
  // run directly, and because the cost is one file read.
  assertRoutesKnown(routeList, viewportRaw);

  return { routes: routeList, themes: themeList, viewport: viewportRaw, name, persona, tabSlot };
}

// ── Login ────────────────────────────────────────────────────────────────────
// Better-auth's server is configured with `advanced.defaultCookieAttributes =
// { secure: true, sameSite: "none" }` for the prod cross-domain deployment,
// which means it emits `__Secure-better-auth.session_token` cookies. The Vite
// dev proxy compensates by stripping `__Secure-` on the way back to the
// browser (so http://localhost stores it), and re-adding it on the way to
// the API. We mirror the same shape here so the SPA sees a normal session:
//   1. POST directly to :3001 with a whitelisted Origin
//   2. rewrite the returned cookies to name = better-auth.* (no __Secure-),
//      secure = false, sameSite = Lax
// After that, browser navigations to :4321 send the cookie, Vite re-prefixes,
// and better-auth reads a valid session.
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

// Returns the raw Cookie header the api-server expects (the __Secure-
// names, before the rewrite below), so direct API calls from this script
// can authenticate without going through Vite.
async function signIn(context: BrowserContext): Promise<string> {
  const res = await context.request.post(`${API_BASE}/api/auth/sign-in/email`, {
    headers: { "Content-Type": "application/json", "Origin": FRONTEND },
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`sign-in failed: ${res.status()} ${await res.text()}`);
  }
  const cookies = await context.cookies();
  const apiCookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  await context.clearCookies();
  await context.addCookies(cookies.map((c) => ({
    ...c,
    name: c.name.replace(/^__Secure-/, ""),
    secure: false,
    sameSite: "Lax" as const,
  })));
  return apiCookieHeader;
}

// ── Per-run account preferences ──────────────────────────────────────────────
// --persona <id> and --tab-slot <id|null> set the seed user's server-side
// preferences before capture and restore them afterwards, so one run can
// show the phone tab bar in a given set (persona default or a pinned slot)
// and HOME/WORTH in that persona's section order. Both are account-level
// (app_settings.persona / .tab_slot) and the app hydrates from the server
// on boot, so injecting localStorage would be overwritten — the API is the
// only honest way to put the app in that state.
type Restore = () => Promise<void>;

// The account theme wins over the localStorage seed once theme-sync hydrates,
// so a capture asked for as "void" rendered whatever the account had. The
// returned setTheme is called before every capture so the PNG is the theme
// its filename claims; the original is restored after the run.
type AccountPrefs = { restore: Restore; setTheme: (theme: string) => Promise<void> };

async function applyAccountPrefs(context: BrowserContext, cookie: string, args: Args): Promise<AccountPrefs> {
  const headers = { "Content-Type": "application/json", "Origin": FRONTEND, Cookie: cookie };
  const restores: Restore[] = [];

  async function put(path: string, body: unknown): Promise<void> {
    const r = await context.request.put(`${API_BASE}${path}`, { headers, data: body });
    if (!r.ok()) throw new Error(`PUT ${path} failed: ${r.status()} ${await r.text()}`);
  }
  async function get<T>(path: string): Promise<T> {
    const r = await context.request.get(`${API_BASE}${path}`, { headers });
    if (!r.ok()) throw new Error(`GET ${path} failed: ${r.status()} ${await r.text()}`);
    return (await r.json()) as T;
  }

  if (args.persona !== undefined) {
    const before = await get<{ persona: string }>("/api/settings/persona");
    await put("/api/settings/persona", { persona: args.persona });
    console.log(`[screenshot] persona ${before.persona} → ${args.persona} (restored after run)`);
    restores.push(() => put("/api/settings/persona", { persona: before.persona }));
  }
  if (args.tabSlot !== undefined) {
    const before = await get<{ tabSlot: string | null }>("/api/settings/tab-slot");
    await put("/api/settings/tab-slot", { tabSlot: args.tabSlot });
    console.log(`[screenshot] tab-slot ${before.tabSlot} → ${args.tabSlot} (restored after run)`);
    restores.push(() => put("/api/settings/tab-slot", { tabSlot: before.tabSlot }));
  }
  const themeBefore = await get<{ theme: string }>("/api/settings/theme");
  let themeNow = themeBefore.theme;
  restores.push(() => put("/api/settings/theme", { theme: themeBefore.theme }));
  const setTheme = async (theme: string): Promise<void> => {
    if (theme === themeNow) return;
    await put("/api/settings/theme", { theme });
    console.log(`[screenshot] theme ${themeNow} → ${theme} (restored after run)`);
    themeNow = theme;
  };

  const restore = async () => {
    for (const r of restores.reverse()) await r();
  };
  return { restore, setTheme };
}

// Intercept /api/* on the frontend origin and forward directly to the api-server
// with a whitelisted Origin. Bypasses the Vite dev proxy, which rewrites origin
// to https://financetracker.work (a prod-only workaround) and therefore gets
// blocked by the api-server's dev CORS check.
async function interceptApiRequests(context: BrowserContext): Promise<void> {
  // FX-null override: rewrite every "converted" field on non-GBP rows to null.
  // Used to visually verify the null-FX display path. Set SCREENSHOT_NULL_FOREIGN_FX=1.
  const nullForeignFx = process.env.SCREENSHOT_NULL_FOREIGN_FX === "1";
  const stripForeignFx = (obj: unknown): unknown => {
    if (Array.isArray(obj)) return obj.map(stripForeignFx);
    if (obj && typeof obj === "object") {
      const rec = obj as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rec)) out[k] = stripForeignFx(v);
      const cur = typeof rec.currency === "string" ? rec.currency : null;
      if (cur && cur !== "GBP") {
        for (const key of ["gbpEquivalent", "gbpValue"]) {
          if (key in out) out[key] = null;
        }
      }
      return out;
    }
    return obj;
  };
  const rewriteDashboardCount = (root: unknown): unknown => {
    if (!root || typeof root !== "object") return root;
    const rec = root as Record<string, unknown>;
    if (Array.isArray(rec.accountBreakdown)) {
      const rows = rec.accountBreakdown as Array<Record<string, unknown>>;
      const count = rows.filter((a) => a.gbpEquivalent === null).length;
      if (count > 0) {
        rec.unconvertibleAccounts = count;
        // Recompute totals from stripped breakdown so headline matches what
        // the server would emit under real null-FX (server skips nulls).
        const totalCash = rows.reduce<number>((s, a) => {
          const v = a.gbpEquivalent;
          return typeof v === "number" ? s + v : s;
        }, 0);
        rec.totalCash = Math.round(totalCash * 100) / 100;
        const portfolioValueGbp = typeof (rec.portfolio as any)?.totalValueGbp === "number"
          ? (rec.portfolio as any).totalValueGbp as number
          : 0;
        rec.netWorth = Math.round((totalCash + portfolioValueGbp) * 100) / 100;
      }
    }
    return rec;
  };

  await context.route(`${FRONTEND}/api/**`, async (route) => {
    const request = route.request();
    const targetUrl = request.url().replace(FRONTEND, API_BASE);
    const dbg = !!process.env.SCREENSHOT_DEBUG;
    try {
    const cookies = await context.cookies();
    const cookieHeader = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const headers = { ...request.headers(), origin: FRONTEND, cookie: cookieHeader };
    const response = await context.request.fetch(targetUrl, {
      method: request.method(),
      headers,
      data: request.postDataBuffer() ?? undefined,
      maxRedirects: 0,
    });
    // Persist any Set-Cookie the server returned, with the same transport-agnostic rewrite.
    const setCookies = response.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie");
    for (const { value } of setCookies) {
      const name = value.split("=")[0].replace(/^__Secure-/, "");
      const rest = value.slice(value.indexOf("=") + 1).split(";")[0];
      await context.addCookies([{ name, value: rest, domain: "localhost", path: "/", secure: false, sameSite: "Lax" }]);
    }
    let body = await response.body();
    let contentType = response.headers()["content-type"] ?? "";
    if (nullForeignFx && contentType.includes("application/json") && response.status() === 200) {
      try {
        const parsed = JSON.parse(body.toString("utf-8"));
        const rewritten = rewriteDashboardCount(stripForeignFx(parsed));
        body = Buffer.from(JSON.stringify(rewritten), "utf-8");
      } catch {
        // leave body untouched if not JSON
      }
    }
    if (dbg && response.status() >= 400) {
      console.log(`[intercept] ${response.status()} ${targetUrl}`);
    }
    await route.fulfill({
      status: response.status(),
      headers: Object.fromEntries(
        response.headersArray()
          .filter((h) => h.name.toLowerCase() !== "set-cookie" && h.name.toLowerCase() !== "content-length")
          .map((h) => [h.name, h.value]),
      ),
      body,
    });
    } catch (err) {
      // Late fetches can outlive the page. Nothing to fulfill onto.
      if (!(err instanceof Error) || !/disposed|closed/i.test(err.message)) throw err;
    }
  });
}

// ── Capture ──────────────────────────────────────────────────────────────────
function slug(s: string): string {
  return s.replace(/^\//, "root").replace(/\//g, "-").replace(/[^a-z0-9-]/gi, "_").toLowerCase();
}

// Refuse to write a PNG of something that is not the page that was asked for.
//
// Three shapes, all of which screenshotted happily and exited 0 before this
// existed: the 404 component, a page that navigated somewhere else after
// load, and a blank body. Each produced a file that looked like evidence.
//
// The 404/auth/onboarding check keys on data-nr-route-state, set on the four
// fallback roots (pages/not-found.tsx, PhoneShell's PhoneNotFound,
// auth-gate.tsx, onboarding.tsx). An attribute survives copy edits that a
// heading-text match would not.
const FALLBACK_REASON: Record<string, string> = {
  "not-found": "the 404 component rendered — this path is not in the router for this viewport",
  auth: "the sign-in screen rendered — the seeded session was not accepted",
  onboarding: "the onboarding flow rendered — the onboarding-complete keys did not take",
};

export async function assertRendered(page: Page, route: string): Promise<void> {
  const seen = await page.evaluate(() => ({
    state: document.querySelector("[data-nr-route-state]")?.getAttribute("data-nr-route-state") ?? null,
    textLength: (document.body?.innerText ?? "").trim().length,
    path: window.location.pathname + window.location.search,
  }));

  const fail = (why: string): never => {
    throw new Error(`${route}: ${why} — refusing to write a PNG. (landed on ${seen.path})`);
  };

  if (seen.state !== null) {
    fail(FALLBACK_REASON[seen.state] ?? `the app reported route state "${seen.state}"`);
  }
  if (seen.textLength < BLANK_PAGE_MIN_CHARS) {
    fail(`the page rendered ${seen.textLength} characters of text, under the ${BLANK_PAGE_MIN_CHARS}-character floor — blank or crashed`);
  }
  // BASE_URL is "" under the harness (inspect sets BASE_PATH=/), so the
  // requested route and the landed pathname are directly comparable.
  const landed = seen.path.split("?")[0].replace(/\/$/, "") || "/";
  const asked = route.split("?")[0].replace(/\/$/, "") || "/";
  if (landed !== asked) {
    fail(`the app navigated away to ${landed} after load`);
  }
}

async function captureOne(context: BrowserContext, route: string, theme: string, viewport: Viewport, explicitName: string | null, persona: string | undefined): Promise<string> {
  const page = await context.newPage();
  // Inject the theme before any script runs, matching ThemeProvider's storage key.
  // SCREENSHOT_AI_INSIGHTS='["one insight"]' primes the dashboard's AI
  // insights cache so the panel can be looked at without a live model. Same
  // precedent as SCREENSHOT_NULL_FOREIGN_FX above: some display paths are
  // unreachable from a seeded account, and "I could not see it" is how a
  // three-column grid holding one card survived.
  const aiInsights = process.env.SCREENSHOT_AI_INSIGHTS ?? null;
  const aiSeed = aiInsights === null ? "" : `
    window.sessionStorage.setItem("ft-dashboard-ai-insights", JSON.stringify({
      insights: ${JSON.stringify(JSON.parse(aiInsights) as string[])},
      ts: Date.now(),
    }));`;

  // With --persona the server already holds it (applyAccountPrefs), so
  // mirror it into the ft-persona cache the way a device that has
  // round-tripped once would have it. Without this the boot hydrate sees
  // a mismatch, fires nr-persona-update, and the "default landing page"
  // handler yanks / to the persona's default page (/portfolio for
  // market) — assertRendered then correctly refuses the PNG.
  const personaSeed = persona === undefined ? "" : `
    window.localStorage.setItem("ft-persona", ${JSON.stringify(JSON.stringify([persona]))});`;

  await page.addInitScript(`try {
    window.localStorage.setItem("ft-theme", ${JSON.stringify(theme)});${personaSeed}
    window.localStorage.setItem("ft-onboarding-complete", "1");
    window.localStorage.setItem("nr-onboarding-complete", "1");${aiSeed}
  } catch (e) {}`);

  // Reported, not fatal. An uncaught exception does not always blank the
  // page — a component below an error boundary can throw while the shell
  // still screenshots convincingly — so the PNG is still written, but the
  // operator is told the render was not clean.
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  const url = new URL(route, FRONTEND).toString();
  await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
  // Small settle for any theme-effects that mount.
  await page.waitForTimeout(400);

  await assertRendered(page, route);

  // SCREENSHOT_MEASURE='<css selector>' prints the rendered box of every
  // match, so a tap-target or column-width claim can be a measurement
  // rather than a reading of the source. Same precedent as the env toggles
  // above: opt-in, no effect on the PNG.
  // SCREENSHOT_SCROLL_TO='<css selector>' scrolls the first match into
  // view before measuring and capturing. The app scrolls inside its own
  // container, so fullPage:true never reaches below the first viewport;
  // this is how a section further down a phone screen gets looked at.
  const scrollTo = process.env.SCREENSHOT_SCROLL_TO ?? null;
  if (scrollTo !== null) {
    const found = await page.$eval(scrollTo, (el) => { el.scrollIntoView({ block: "start" }); return true; }).catch(() => false);
    if (!found) console.log(`[scroll] ${route} ${scrollTo}: no match`);
    await page.waitForTimeout(200);
  }

  const measure = process.env.SCREENSHOT_MEASURE ?? null;
  if (measure !== null) {
    const boxes = await page.$$eval(measure, (els) => els.map((el) => {
      const r = el.getBoundingClientRect();
      return { text: (el.textContent ?? "").trim().slice(0, 40), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }));
    for (const [i, b] of boxes.entries()) {
      console.log(`[measure] ${route} ${measure}[${i}] "${b.text}" x=${b.x} y=${b.y} w=${b.w} h=${b.h}`);
    }
    if (boxes.length === 0) console.log(`[measure] ${route} ${measure}: no matches`);
  }

  const name = explicitName ?? `${slug(route)}_${viewport}_${theme}`;
  const path = resolve(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  for (const message of pageErrors) {
    console.warn(`[screenshot] WARNING ${route}: uncaught page error — ${message}`);
  }
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.close();
  return path;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser: Browser = await chromium.launch();
  const context: BrowserContext = await browser.newContext({
    viewport: VIEWPORTS[args.viewport],
    deviceScaleFactor: 2,
  });

  await interceptApiRequests(context);
  const apiCookie = await signIn(context);
  const { restore, setTheme } = await applyAccountPrefs(context, apiCookie, args);

  try {
    for (const route of args.routes) {
      for (const theme of args.themes) {
        const explicit = args.routes.length === 1 && args.themes.length === 1 ? args.name : null;
        await setTheme(theme);
        const outPath = await captureOne(context, route, theme, args.viewport, explicit, args.persona);
        console.log(`[screenshot] ${route} · ${args.viewport} · ${theme} → ${outPath}`);
      }
    }
  } finally {
    await restore();
    await browser.close();
  }
}

// Only run when this file IS the command. assertRendered is exported so the
// assertion can be exercised against a real browser without booting the whole
// harness; importing it must not sign in to anything.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("[screenshot] failed:", err);
    process.exit(1);
  });
}
