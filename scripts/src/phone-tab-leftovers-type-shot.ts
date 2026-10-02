// Phone tab leftovers type pass (finding 928333794e02). Reads computed font
// families at 390x844:
//  - SPENDING's swipe-to-delete DELETE action and the filter chip's dismiss x
//    (opened with ?type=expense), with the ROWS count beside it;
//  - UPCOMING's series filter chip's dismiss x (opened with ?q=a), with the
//    ITEMS count beside it;
//  - WORTH's COMPOSITION title, its RING tab, and the NET WORTH legend.
// Reads only; nothing is stubbed and nothing is written. Writes
// .review/shots/phone-tab-leftovers-type/<label>/.
import { chromium, type Browser, type BrowserContext, type Locator } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const LABEL = process.argv[2] ?? "current";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/phone-tab-leftovers-type", LABEL);

type Stub = { status: number; body: string } | null;

const widenOn = false;
const widenToLastMonth = (url: string) => url;

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


const release = acquireCaptureLock();
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const ctx = await signedInContext(
    browser,
    { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    () => null,
  );
  const page = await ctx.newPage();
  const exact = (t: string | RegExp) => page.getByText(t, { exact: typeof t === "string" });

  // App.tsx's DefaultPageRedirector redirects the first load once per session.
  await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
  await refuseOnboarding(page);

  // ── SPENDING ─────────────────────────────────────────────────────
  await page.goto(`${FRONTEND}/spending?type=expense`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  console.log(`SPENDING url ${page.url()}`);
  await fam("SPENDING swipe DELETE", page.locator(".ft-swipe-delete-action"));
  await fam("SPENDING chip x", page.locator('button > span[aria-hidden="true"]').filter({ hasText: /^×$/ }));
  await fam("SPENDING chip label (button)", page.locator("button").filter({ has: page.locator('span[aria-hidden="true"]', { hasText: /^×$/ }) }));
  await fam("SPENDING ROWS count", exact(/^\d+ ROWS?$/));
  await page.screenshot({ path: join(OUT, "spending.png") });

  // ── UPCOMING ─────────────────────────────────────────────────────
  await page.goto(`${FRONTEND}/upcoming?q=a`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  console.log(`UPCOMING url ${page.url()}`);
  await fam("UPCOMING chip x", page.locator('button > span[aria-hidden="true"]').filter({ hasText: /^×$/ }));
  await fam("UPCOMING chip label (button)", page.locator('button[aria-label^="Clear filter"]'));
  await fam("UPCOMING ITEMS count", exact(/^\d+ ITEMS?$/));
  await page.screenshot({ path: join(OUT, "upcoming.png") });

  // ── WORTH ────────────────────────────────────────────────────────
  await page.goto(`${FRONTEND}/worth`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const comp = exact("COMPOSITION");
  await fam("WORTH COMPOSITION", comp);
  await fam("WORTH RING tab", exact("RING"));
  await fam("WORTH NET WORTH legend", exact("NET WORTH"));
  if (await comp.count()) await comp.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(OUT, "worth-composition.png") });
  console.log(`final url ${page.url()}`);
  await ctx.close();
} finally {
  await browser.close();
  release();
}
