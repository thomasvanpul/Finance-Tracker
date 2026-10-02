// PWA install prompt and phone StatGrid type pass (finding 928333794e02).
// Reads the computed font family of:
//  - the install prompt at desktop width: INSTALL and the dismiss ×. The
//    prompt only shows after the browser fires `beforeinstallprompt`, so the
//    probe dispatches a synthetic one in the page; the app only stores it, and
//    nothing is clicked, so nothing is installed or dismissed;
//  - /spending at phone width: SPENDING's CategoryStrip, the StatGrid of the
//    month's top categories — the category label and its figure. The strip
//    only renders with expenses dated this month, so the probe re-dates the
//    newest expense of each of three categories to today in the browser's copy
//    of GET /api/transactions. Names, categories and amounts are the API's.
// Nothing reaches the API but reads, and nothing is written. Writes .review/shots/pwa-statgrid-type/<label>/.
import { chromium, type Browser, type BrowserContext, type Locator } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const LABEL = process.argv[2] ?? "current";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/pwa-statgrid-type", LABEL);

type Stub = { status: number; body: string } | null;

async function signedInContext(
  browser: Browser,
  opts: Parameters<Browser["newContext"]>[0],
  transactions: () => Stub,
  rewriteTransactions?: (body: Buffer) => Buffer,
): Promise<BrowserContext> {
  const ctx = await browser.newContext(opts);
  await ctx.route(`${FRONTEND}/api/**`, async (route) => {
    try {
      const req = route.request();
      const isTxRead = new URL(req.url()).pathname === "/api/transactions" && req.method() === "GET";
      const stub = isTxRead ? transactions() : null;
      if (stub) {
        await route.fulfill({ status: stub.status, contentType: "application/json", body: stub.body });
        return;
      }
      const cs = await ctx.cookies();
      const r = await ctx.request.fetch(req.url().replace(FRONTEND, API), {
        method: req.method(),
        headers: { ...req.headers(), origin: FRONTEND, cookie: cs.map((c) => `${c.name}=${c.value}`).join("; ") },
        data: req.postDataBuffer() ?? undefined,
        maxRedirects: 0,
      });
      await route.fulfill({
        status: r.status(),
        headers: Object.fromEntries(
          r.headersArray()
            .filter((h) => !["set-cookie", "content-length"].includes(h.name.toLowerCase()))
            .map((h) => [h.name, h.value]),
        ),
        body: isTxRead && rewriteTransactions && r.ok() ? rewriteTransactions(await r.body()) : await r.body(),
      });
    } catch (e) {
      if (!(e instanceof Error) || !/disposed|closed/i.test(e.message)) throw e;
    }
  });
  const signIn = await ctx.request.post(`${API}/api/auth/sign-in/email`, {
    headers: { "Content-Type": "application/json", Origin: FRONTEND },
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  if (!signIn.ok()) throw new Error(`sign-in failed: ${signIn.status()} ${await signIn.text()}`);
  const cookies = await ctx.cookies();
  await ctx.clearCookies();
  await ctx.addCookies(cookies.map((c) => ({ ...c, name: c.name.replace(/^__Secure-/, ""), secure: false, sameSite: "Lax" as const })));
  return ctx;
}

const family = (el: Element) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "");
const fam = async (label: string, loc: Locator) =>
  console.log(`${label} -> ${(await loc.count()) ? await loc.first().evaluate(family) : "absent"}`);

async function refuseOnboarding(page: import("playwright").Page) {
  if (await page.getByText("Let's shape the app around", { exact: false }).count()) {
    throw new Error("landed on the onboarding questionnaire; refusing to capture it");
  }
}

function redateThreeCategoriesToToday(body: Buffer): Buffer {
  const rows = JSON.parse(body.toString("utf8")) as { type?: string; category?: string | null; date: string }[];
  if (!Array.isArray(rows)) return body;
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const seen = new Set<string>();
  const out = rows.map((row) => {
    const cat = row.category?.trim();
    if (row.type !== "expense" || !cat || seen.has(cat) || seen.size >= 3) return row;
    seen.add(cat);
    return { ...row, date: today };
  });
  console.log(`re-dated to ${today}: ${[...seen].join(", ")}`);
  return Buffer.from(JSON.stringify(out));
}

const release = acquireCaptureLock();
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  // ── install prompt, desktop ──────────────────────────────────────
  {
    const ctx = await signedInContext(browser, { viewport: { width: 1440, height: 900 } }, () => null);
    const page = await ctx.newPage();
    await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
    await refuseOnboarding(page);
    // A string, not a function: tsx injects a `__name` helper into compiled
    // functions, and the page has no such global.
    await page.evaluate(`(() => {
      const e = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(e, { prompt: () => Promise.resolve(), userChoice: new Promise(() => {}) });
      window.dispatchEvent(e);
    })()`);
    const install = page.getByRole("button", { name: "INSTALL", exact: true });
    try {
      await install.waitFor({ timeout: 10_000 });
    } catch (e) {
      await page.screenshot({ path: join(OUT, "no-prompt.png") });
      console.log(`no install prompt at ${page.url()}`);
      throw e;
    }
    await fam("INSTALL", install);
    await fam("dismiss ×", page.getByRole("button", { name: "Dismiss install prompt" }));
    await fam("prompt title", page.getByText("Install Numeris", { exact: true }));
    await page.screenshot({ path: join(OUT, "install-prompt.png"), clip: { x: 420, y: 760, width: 600, height: 140 } });
    await ctx.close();
  }

  // ── /spending CategoryStrip, phone ───────────────────────────────
  {
    const ctx = await signedInContext(
      browser,
      { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
      () => null,
      redateThreeCategoriesToToday,
    );
    const page = await ctx.newPage();
    await page.goto(`${FRONTEND}/spending`, { waitUntil: "networkidle" });
    await refuseOnboarding(page);
    // A StatGrid cell is the only place a "… — open what it is made of" drill
    // title sits on an anchor wrapping an uppercase label and a .pnum figure.
    const cell = page.locator('a[title$="— open what it is made of"]').filter({ has: page.locator(".pnum") });
    try {
      await cell.first().waitFor({ timeout: 20_000 });
    } catch (e) {
      await page.screenshot({ path: join(OUT, "no-category-strip.png"), fullPage: true });
      console.log(`no CategoryStrip cell at ${page.url()}`);
      throw e;
    }
    const n = await cell.count();
    for (let i = 0; i < n; i++) {
      const c = cell.nth(i);
      const label = c.locator("span").filter({ hasNotText: /£|\d/ }).first();
      console.log(`cell ${i} label text: ${await label.innerText()}`);
      await fam(`cell ${i} label`, label);
      await fam(`cell ${i} figure`, c.locator(".pnum"));
    }
    await cell.first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(OUT, "spending-category-strip.png") });
    await ctx.close();
  }
} finally {
  await browser.close();
  release();
}
