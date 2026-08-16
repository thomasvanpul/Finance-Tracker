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

import { chromium, type Browser, type BrowserContext } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ───────────────────────────────────────────────────────────────────
const FRONTEND = process.env.SCREENSHOT_FRONTEND ?? "http://localhost:4321";
const OUTPUT_DIR = resolve(__dirname, "..", "screenshots");

type Viewport = "mobile" | "desktop";
const VIEWPORTS: Record<Viewport, { width: number; height: number }> = {
  mobile:  { width: 390,  height: 844  },
  desktop: { width: 1440, height: 900  },
};

const VALID_THEMES = new Set([
  "void", "phosphor", "arctic", "amber", "midnight", "matrix",
  "synthwave", "deep-space", "mario", "gilded", "bloodline",
]);

// ── CLI ──────────────────────────────────────────────────────────────────────
interface Args {
  routes: string[];
  themes: string[];
  viewport: Viewport;
  name: string | null;
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

  if (!(viewportRaw in VIEWPORTS)) {
    throw new Error(`--viewport must be one of ${Object.keys(VIEWPORTS).join("|")}`);
  }

  const routeList = routes ? routes.split(",").map((s) => s.trim()) : [route ?? "/"];
  const themeList = themes ? themes.split(",").map((s) => s.trim()) : [theme ?? "void"];

  for (const t of themeList) {
    if (!VALID_THEMES.has(t)) throw new Error(`unknown theme "${t}"`);
  }

  return { routes: routeList, themes: themeList, viewport: viewportRaw, name };
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

async function signIn(context: BrowserContext): Promise<void> {
  const res = await context.request.post(`${API_BASE}/api/auth/sign-in/email`, {
    headers: { "Content-Type": "application/json", "Origin": FRONTEND },
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`sign-in failed: ${res.status()} ${await res.text()}`);
  }
  const cookies = await context.cookies();
  await context.clearCookies();
  await context.addCookies(cookies.map((c) => ({
    ...c,
    name: c.name.replace(/^__Secure-/, ""),
    secure: false,
    sameSite: "Lax" as const,
  })));
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

async function captureOne(context: BrowserContext, route: string, theme: string, viewport: Viewport, explicitName: string | null): Promise<string> {
  const page = await context.newPage();
  // Inject the theme before any script runs, matching ThemeProvider's storage key.
  await page.addInitScript(`try {
    window.localStorage.setItem("ft-theme", ${JSON.stringify(theme)});
    window.localStorage.setItem("ft-onboarding-complete", "1");
    window.localStorage.setItem("nr-onboarding-complete", "1");
  } catch (e) {}`);

  const url = new URL(route, FRONTEND).toString();
  await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
  // Small settle for any theme-effects that mount.
  await page.waitForTimeout(400);

  const name = explicitName ?? `${slug(route)}_${viewport}_${theme}`;
  const path = resolve(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
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
  await signIn(context);

  for (const route of args.routes) {
    for (const theme of args.themes) {
      const explicit = args.routes.length === 1 && args.themes.length === 1 ? args.name : null;
      const outPath = await captureOne(context, route, theme, args.viewport, explicit);
      console.log(`[screenshot] ${route} · ${args.viewport} · ${theme} → ${outPath}`);
    }
  }

  await browser.close();
}

main().catch((err) => {
  console.error("[screenshot] failed:", err);
  process.exit(1);
});
