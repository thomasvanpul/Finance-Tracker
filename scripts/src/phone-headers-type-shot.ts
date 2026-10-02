// Phone SectionHeader, HOME cash-flow legend and HOME news meta type pass
// (finding 928333794e02). Reads computed font families at 390x844:
//  - the SectionHeader title on HOME, WORTH, SPENDING and UPCOMING, with the
//    right-slot figure where there is one;
//  - HOME's cash-flow legend: SO FAR / PROJECTED, LOW SO FAR + figure, the
//    TODAY axis tick;
//  - HOME's news rows: the YOUR <ticker> tag, the publisher, the age.
// Reads only. The one stub is redateThreeExpensesToThisMonth, below; nothing is written. Writes
// .review/shots/phone-headers-type/<label>/.
import { chromium, type Browser, type BrowserContext, type Locator } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const LABEL = process.argv[2] ?? "current";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/phone-headers-type", LABEL);

type Stub = { status: number; body: string } | null;

// On only while HOME is captured: GET /api/transactions asks for last month
// instead of the window HOME requested, and the rows are re-dated into it.
let widenOn = false;
function widenToLastMonth(url: string): string {
  const u = new URL(url);
  if (!u.searchParams.has("dateFrom")) return url;
  const d = new Date();
  const first = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const last = new Date(d.getFullYear(), d.getMonth(), 0);
  const ymd = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  u.searchParams.set("dateFrom", ymd(first));
  u.searchParams.set("dateTo", ymd(last));
  return u.toString();
}

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
      let target = req.url().replace(FRONTEND, API);
      if (isTxRead && rewriteTransactions && widenOn) target = widenToLastMonth(target);
      const r = await ctx.request.fetch(target, {
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
        body: isTxRead && rewriteTransactions && widenOn && r.ok() ? rewriteTransactions(await r.body()) : await r.body(),
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


// HOME's cash-flow chart draws only with transactions dated this month, and the
// dev branch has none for October. HOME's GET /api/transactions is widened to
// last month (widenToLastMonth), and in the browser's copy the newest three expenses are re-dated to the 1st and 2nd
// of this month. Amounts, names and categories are the API's; nothing is written.
function redateThreeExpensesToThisMonth(body: Buffer): Buffer {
  const rows = JSON.parse(body.toString("utf8")) as { type?: string; date: string }[];
  if (!Array.isArray(rows)) return body;
  const d = new Date();
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  let n = 0;
  const out = rows.map((row) => {
    if (row.type !== "expense" || n >= 3) return row;
    n += 1;
    return { ...row, date: `${ym}-0${n === 1 ? 1 : 2}` };
  });
  console.log(`re-dated ${n} expenses into ${ym}`);
  return Buffer.from(JSON.stringify(out));
}

const release = acquireCaptureLock();
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const ctx = await signedInContext(
    browser,
    { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    () => null,
    redateThreeExpensesToThisMonth,
  );
  const page = await ctx.newPage();
  const exact = (t: string | RegExp) => page.getByText(t, { exact: typeof t === "string" });

  // ── HOME ─────────────────────────────────────────────────────────
  // App.tsx's DefaultPageRedirector sends "/" to the persona's default page
  // once per session; the second load of "/" stays on HOME.
  await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
  await refuseOnboarding(page);
  widenOn = true;
  await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  console.log(`HOME url ${page.url()}`);
  await fam("HOME header COMING", exact("COMING · KNOWN WITH CERTAINTY"));
  await fam("HOME header LIQUID", exact(/· LIQUID$/));
  await fam("HOME legend SO FAR+PROJECTED row", page.locator("span").filter({ hasText: /^\s*SO FAR\s*PROJECTED\s*$/ }));
  await fam("HOME legend LOW SO FAR", exact(/^LOW SO FAR /));
  await fam("HOME axis TODAY", exact("TODAY"));
  const tag = exact(/^YOUR /);
  await fam("HOME news tag", tag);
  if (await tag.count()) {
    const row = tag.first().locator("xpath=..");
    const spans = row.locator("> span");
    const n = await spans.count();
    for (let i = 0; i < n; i++) console.log(`HOME news meta span ${i} "${(await spans.nth(i).innerText()).slice(0, 30)}" -> ${await spans.nth(i).evaluate(family)}`);
  }
  await page.screenshot({ path: join(OUT, "home.png"), fullPage: true });
  // HOME scrolls inside the shell, so a full-page shot stops at the viewport.
  const liquid = exact(/· LIQUID$/);
  if (await liquid.count()) {
    await liquid.first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(OUT, "home-cashflow.png") });
  }

  widenOn = false;

  // ── WORTH ────────────────────────────────────────────────────────
  await page.goto(`${FRONTEND}/worth`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await fam("WORTH header BY CURRENCY", exact("BY CURRENCY"));
  await fam("WORTH header HOLDINGS", exact("HOLDINGS"));
  await page.screenshot({ path: join(OUT, "worth.png"), fullPage: true });

  // ── SPENDING ─────────────────────────────────────────────────────
  await page.goto(`${FRONTEND}/spending`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const dayHeader = exact(/^(MON|TUE|WED|THU|FRI|SAT|SUN) \d{2} [A-Z]{3}$/);
  await fam("SPENDING day header", dayHeader);
  if (await dayHeader.count()) console.log(`  text: ${await dayHeader.first().innerText()}`);
  await fam("SPENDING month header", exact(/^[A-Z]+ \d{4}$/));
  await page.screenshot({ path: join(OUT, "spending.png"), fullPage: true });

  // ── UPCOMING ─────────────────────────────────────────────────────
  await page.goto(`${FRONTEND}/upcoming`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await fam("UPCOMING week header", exact(/^(This week|Next week|Overdue|\d{1,2} [A-Z][a-z]{2} – \d{1,2} [A-Z][a-z]{2})$/));
  await page.screenshot({ path: join(OUT, "upcoming.png"), fullPage: true });
  console.log(`final url ${page.url()}`);
  await ctx.close();
} finally {
  await browser.close();
  release();
}
