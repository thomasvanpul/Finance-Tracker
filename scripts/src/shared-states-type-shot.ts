// Shared empty / error / couldn't-load states, the phone sheet title and the
// dashboard's EDIT LAYOUT control — type pass (finding 928333794e02). Reads
// computed font families:
//  - /transactions with a search that matches nothing: EmptyState's "— NO
//    MATCHES —" title and its description;
//  - /transactions with GET /api/transactions answered 500 in the browser, in
//    a fresh context:
//    ErrorState's "— ERROR —" and its message;
//  - /goals with its route chunk aborted in the browser: LazyRouteBoundary's
//    "COULDN'T LOAD";
//  - the dashboard's EDIT LAYOUT control after it is pressed ("Done"), then
//    pressed again to leave edit mode;
//  - at 390x844, SPENDING's transaction detail sheet: the MobileSheet drawer
//    title "Transaction".
// The 500 and the aborted chunk are browser-side stubs; nothing is written.
// Writes .review/shots/shared-states-type/<label>/.
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { signInSeedUser, openAccountPrefs, assertRoute, type AccountPrefs } from "./account-prefs.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const LABEL = process.argv[2] ?? "current";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/shared-states-type", LABEL);

type Stub = { failTransactions: boolean };

async function signedInContext(browser: Browser, viewport: { width: number; height: number }, stub: Stub): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport });
  await ctx.route(`${FRONTEND}/api/**`, async (route) => {
    try {
      const req = route.request();
      const p = new URL(req.url()).pathname;
      if (stub.failTransactions && p === "/api/transactions" && req.method() === "GET") {
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "probe: forced 500" }) });
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
        body: await r.body(),
      });
    } catch (e) {
      if (!(e instanceof Error) || !/disposed|closed/i.test(e.message)) throw e;
    }
  });
  await signInSeedUser(ctx);
  return ctx;
}

const family = (el: Element) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "");
const fam = async (label: string, loc: Locator) =>
  console.log(`${label} -> ${(await loc.count()) ? await loc.first().evaluate(family) : "absent"}`);

async function refuseOnboarding(page: Page) {
  if (await page.getByText("Let's shape the app around", { exact: false }).count()) {
    throw new Error("landed on the onboarding questionnaire; refusing to capture it");
  }
}

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
let prefs: AccountPrefs | null = null;
try {
  // One prefs session for the run, in a context of its own so it outlives the
  // capture contexts: it takes the capture lock and pins nr-default-page to "/"
  // so HOME is HOME. restore() in the finally puts the account back.
  const prefsCtx = await browser.newContext();
  prefs = await openAccountPrefs(prefsCtx, await signInSeedUser(prefsCtx));
  const ctx = await signedInContext(browser, DESKTOP, { failTransactions: false });
  const page = await ctx.newPage();
  const exact = (t: string | RegExp) => page.getByText(t, { exact: typeof t === "string" });

  // ── /transactions: ErrorState via a browser-side 500 ─────────────
  // Its own context, before anything has loaded: a context that already
  // holds transactions keeps showing them (the persisted query cache), so a
  // 500 after a success never reaches isError.
  {
    const errCtx = await signedInContext(browser, DESKTOP, { failTransactions: true });
    const errPage = await errCtx.newPage();
    await errPage.goto(`${FRONTEND}/transactions`, { waitUntil: "networkidle" });
    await refuseOnboarding(errPage);
    const errEyebrow = errPage.getByText("— ERROR —", { exact: true });
    await errEyebrow.first().waitFor({ timeout: 45000 }).catch(() => undefined);
    await fam("ErrorState '— ERROR —'", errEyebrow);
    await fam("ErrorState message", errEyebrow.locator("xpath=following-sibling::div"));
    await errPage.screenshot({ path: join(OUT, "error-state.png") });
    await errCtx.close();
  }

  // ── /transactions: EmptyState via a search that matches nothing ──
  await page.goto(`${FRONTEND}/transactions`, { waitUntil: "networkidle" });
  await refuseOnboarding(page);
  await page.waitForTimeout(1000);
  const search = page.getByPlaceholder("search…  ( / )");
  if (await search.count()) {
    await search.first().fill("zzqqxx-probe-no-match");
    await page.waitForTimeout(800);
    await fam("EmptyState title '— No matches —'", exact(/^— No matches —$/i));
    await fam("EmptyState description", exact("No transactions match the current filters."));
    await page.screenshot({ path: join(OUT, "empty-state.png") });
  } else {
    console.log("transactions search absent");
  }

  // ── Dashboard: EDIT LAYOUT → Done ────────────────────────────────
  // App.tsx's DefaultPageRedirector sends "/" to the persona's default page
  // once per session; the second load of "/" stays on the dashboard.
  await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
  await assertRoute(page, "/");
  await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
  await assertRoute(page, "/");
  await page.waitForTimeout(1500);
  console.log(`dashboard url ${page.url()}`);
  const edit = page.getByRole("button", { name: "Edit layout", exact: true });
  if (await edit.count()) {
    await edit.first().click();
    const done = page.getByRole("button", { name: "Done editing layout", exact: true });
    await done.first().waitFor({ timeout: 5000 });
    await fam("EditLayout 'Done'", done);
    await page.screenshot({ path: join(OUT, "edit-layout-done.png"), clip: { x: 0, y: 0, width: 1440, height: 260 } });
    await done.first().click();
  } else {
    console.log("Edit layout button absent");
  }

  // ── /goals: LazyRouteBoundary via an aborted route chunk ─────────
  // A fresh page, so the module graph has not cached the goals chunk yet.
  const lazy = await ctx.newPage();
  await lazy.route(/\/src\/pages\/goals\.tsx/, (route) => route.abort());
  await lazy.goto(`${FRONTEND}/accounts`, { waitUntil: "networkidle" });
  await lazy.goto(`${FRONTEND}/goals`, { waitUntil: "networkidle" });
  const couldnt = lazy.getByText("COULDN'T LOAD", { exact: true });
  await couldnt.first().waitFor({ timeout: 20000 }).catch(() => undefined);
  await fam("LazyRouteBoundary 'COULDN'T LOAD'", couldnt);
  await fam("LazyRouteBoundary headline", lazy.getByText("This page didn't finish loading.", { exact: true }));
  await lazy.screenshot({ path: join(OUT, "lazy-boundary.png") });
  await lazy.close();
  await ctx.close();

  // ── Phone: MobileSheet drawer title ──────────────────────────────
  const phoneCtx = await signedInContext(browser, PHONE, { failTransactions: false });
  const phone = await phoneCtx.newPage();
  await phone.goto(`${FRONTEND}/spending`, { waitUntil: "networkidle" });
  await refuseOnboarding(phone);
  await phone.waitForTimeout(1500);
  // SPENDING's ledger opens TxDetailSheet (a MobileSheet titled "Transaction")
  // on a row tap. The sheet is only read; its Delete is never pressed.
  const row = phone.getByText(/TESCO|COFFEE|UBER|PRET|OCTOPUS|TFL/).first();
  if (await row.count()) { await row.scrollIntoViewIfNeeded(); await row.click(); }
  else console.log("no transaction row found at 390px");
  const title = phone.locator('[role="dialog"] h2').first();
  await title.waitFor({ timeout: 8000 }).catch(() => undefined);
  if (await title.count()) console.log(`MobileSheet title "${(await title.innerText()).trim()}" -> ${await title.evaluate(family)}`);
  else console.log("MobileSheet title absent");
  await phone.screenshot({ path: join(OUT, "mobile-sheet.png") });
  await phoneCtx.close();
} finally {
  try {
    await prefs?.restore();
  } finally {
    await browser.close();
  }
}
