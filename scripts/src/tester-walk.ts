// Walks the app as a TESTER sees it: signs in as one of the dev-branch tester
// accounts made by seed-testers.ts, with a fresh browser profile (no
// localStorage seeded, no theme forced, no onboarding skipped), and writes a
// full-height PNG of each screen at a phone and a desktop width.
//
// Why not screenshot.ts: that harness signs in as the seed account, whose
// demo data is dated from whenever it was last seeded, and it pre-seeds
// localStorage to skip first-run screens. A tester has neither. On 30 Sep
// the seed account's newest spend was 25 days old, so its dashboard showed a
// month of overdue bills and a -96.9% month-on-month figure that no tester
// seeded on 28 Sep would ever see.
//
// The password is read from ~/.atrium/numeris-testers.txt (the file
// seed-testers.ts appends to) and is never printed. Only `dev` rows are used:
// this script never signs in to production.
//
//   pnpm --filter @workspace/scripts exec tsx src/tester-walk.ts <label> [email] [--cat]
//
// --cat switches the assistant to the roaming companion (localStorage only,
// the same flip SCREENSHOT_COMPANION makes) so the cat can be looked at.
import { chromium, type BrowserContext, type Page } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireCaptureLock } from "./capture-lock.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND = process.env.SCREENSHOT_FRONTEND ?? "http://localhost:4321";
const API = process.env.API_BASE_URL ?? "http://localhost:3001";
const OUT_ROOT = resolve(__dirname, "..", "..", ".review", "shots", "tester-walk");

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const label = args[0] ?? "walk";
const email = args[1] ?? "tester7@numeris.local";
const withCat = process.argv.includes("--cat");

const PHONE_ROUTES = ["/", "/worth", "/spending", "/upcoming", "/directory", "/transactions"];
const DESKTOP_ROUTES = ["/", "/transactions", "/budget", "/accounts", "/net-worth", "/goals", "/analytics"];
// The desktop app scrolls inside its own container, so fullPage never reaches
// below the first viewport; the viewport is grown to the content instead.
const MAX_HEIGHT = 7000;

function devPassword(forEmail: string): string {
  const file = join(homedir(), ".atrium", "numeris-testers.txt");
  const rows = readFileSync(file, "utf-8").split("\n").map((l) => l.split("\t"));
  const hits = rows.filter((r) => r.length === 3 && r[0] === "dev" && r[1] === forEmail);
  const row = hits[hits.length - 1];
  if (!row) throw new Error(`no dev row for ${forEmail} in ${file}`);
  return row[2];
}

async function signIn(ctx: BrowserContext): Promise<void> {
  const res = await ctx.request.post(`${API}/api/auth/sign-in/email`, {
    headers: { "Content-Type": "application/json", Origin: FRONTEND },
    data: { email, password: devPassword(email) },
  });
  if (!res.ok()) throw new Error(`sign-in failed for ${email}: ${res.status()}`);
  const cookies = await ctx.cookies();
  await ctx.clearCookies();
  await ctx.addCookies(cookies.map((c) => ({
    ...c, name: c.name.replace(/^__Secure-/, ""), secure: false, sameSite: "Lax" as const,
  })));
}

async function proxyApi(ctx: BrowserContext): Promise<void> {
  await ctx.route(`${FRONTEND}/api/**`, async (route) => {
    const req = route.request();
    try {
      const cs = await ctx.cookies();
      const r = await ctx.request.fetch(req.url().replace(FRONTEND, API), {
        method: req.method(),
        headers: { ...req.headers(), origin: FRONTEND, cookie: cs.map((c) => `${c.name}=${c.value}`).join("; ") },
        data: req.postDataBuffer() ?? undefined,
        maxRedirects: 0,
      });
      await route.fulfill({
        status: r.status(),
        headers: Object.fromEntries(r.headersArray()
          .filter((h) => !["set-cookie", "content-length"].includes(h.name.toLowerCase()))
          .map((h) => [h.name, h.value])),
        body: await r.body(),
      });
    } catch (err) {
      if (!(err instanceof Error) || !/disposed|closed/i.test(err.message)) throw err;
    }
  });
}

async function contentHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    let best = document.documentElement.scrollHeight;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) {
        best = Math.max(best, el.scrollHeight + el.getBoundingClientRect().top);
      }
    }
    return best;
  });
}

async function walk(width: number, height: number, routes: string[], tag: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    await signIn(ctx);
    await proxyApi(ctx);
    const page = await ctx.newPage();
    if (withCat) {
      await page.addInitScript(`try { localStorage.setItem("numeris-ai-style", "wanderer"); } catch (e) {}`);
    }
    for (const route of routes) {
      await page.setViewportSize({ width, height });
      await page.goto(`${FRONTEND}${route}`, { waitUntil: "networkidle", timeout: 45_000 });
      await page.waitForTimeout(1500);
      const h = Math.min(MAX_HEIGHT, Math.max(height, await contentHeight(page)));
      await page.setViewportSize({ width, height: h });
      await page.waitForTimeout(1200);
      const slug = route === "/" ? "home" : route.slice(1).replace(/\//g, "-");
      const path = join(OUT_ROOT, label, `${tag}-${slug}.png`);
      await page.screenshot({ path });
      console.log(`[tester-walk] ${tag} ${route} → ${path} (${width}×${h})`);
    }
    await ctx.close();
  } finally {
    await browser.close();
  }
}

const release = acquireCaptureLock("tester-walk");
try {
  mkdirSync(join(OUT_ROOT, label), { recursive: true });
  await walk(390, 844, PHONE_ROUTES, "phone");
  await walk(1440, 900, DESKTOP_ROUTES, "desktop");
} finally {
  release();
}
