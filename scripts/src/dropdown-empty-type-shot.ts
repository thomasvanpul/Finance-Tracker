// FtDropdown and phone empty/error type pass (finding 928333794e02). Reads the
// computed font family of:
//  - /tax at desktop width: the Country and Tax Year field labels, both
//    triggers, the country code prefix, and an option in each open list;
//  - /spending at phone width, twice: once with GET /api/transactions answered
//    with [] (MobileEmptyState, "NO TRANSACTIONS") and once answered with 500
//    (PhoneSectionError, "COULDN'T LOAD"). Those two answers are stubbed in the
//    browser; nothing reaches the API and nothing is written.
// Opening a dropdown does not change the selected value. Writes
// .review/shots/dropdown-empty-type/<label>/.
import { chromium, type Browser, type BrowserContext, type Locator } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const LABEL = process.argv[2] ?? "current";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/dropdown-empty-type", LABEL);

type Stub = { status: number; body: string } | null;

async function signedInContext(
  browser: Browser,
  opts: Parameters<Browser["newContext"]>[0],
  transactions: () => Stub,
): Promise<BrowserContext> {
  const ctx = await browser.newContext(opts);
  await ctx.route(`${FRONTEND}/api/**`, async (route) => {
    try {
      const req = route.request();
      const stub = new URL(req.url()).pathname === "/api/transactions" && req.method() === "GET" ? transactions() : null;
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
        body: await r.body(),
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
  // ── /tax, desktop ────────────────────────────────────────────────
  {
    const ctx = await signedInContext(browser, { viewport: { width: 1440, height: 900 } }, () => null);
    const page = await ctx.newPage();
    await page.goto(`${FRONTEND}/tax`, { waitUntil: "networkidle" });
    await refuseOnboarding(page);
    const countryLabel = page.locator("span", { hasText: /^Country$/ });
    try {
      await countryLabel.first().waitFor({ timeout: 15_000 });
    } catch (e) {
      await page.screenshot({ path: join(OUT, "no-tax.png"), fullPage: true });
      console.log(`no Country dropdown at ${page.url()}`);
      throw e;
    }
    const countryRoot = countryLabel.first().locator("..");
    const yearRoot = page.locator("span", { hasText: /^Tax Year$/ }).first().locator("..");
    const countryTrigger = countryRoot.locator(":scope > button");
    const yearTrigger = yearRoot.locator(":scope > button");
    await fam("Country label", countryLabel);
    await fam("Tax Year label", yearRoot.locator(":scope > span"));
    await fam("Country trigger", countryTrigger);
    await fam("Country trigger name", countryTrigger.locator("span").nth(1));
    await fam("Country code prefix", countryTrigger.locator("span").first());
    await fam("Tax Year trigger", yearTrigger);

    await countryTrigger.click();
    const countryOption = countryRoot.locator(":scope > div button").nth(1);
    await fam("Country option", countryOption);
    await fam("Country option code prefix", countryOption.locator("span").first());
    console.log(`Country option text: ${await countryOption.innerText()}`);
    await page.screenshot({ path: join(OUT, "tax-country-open.png"), clip: { x: 0, y: 0, width: 1440, height: 520 } });
    await page.keyboard.press("Escape");

    await yearTrigger.click();
    const yearOption = yearRoot.locator(":scope > div button").first();
    await fam("Tax Year option", yearOption);
    console.log(`Tax Year option text: ${await yearOption.innerText()}`);
    await page.screenshot({ path: join(OUT, "tax-year-open.png"), clip: { x: 0, y: 0, width: 1440, height: 520 } });
    await page.keyboard.press("Escape");
    await ctx.close();
  }

  // ── /spending, phone, empty then error ───────────────────────────
  for (const [name, stub] of [
    ["empty", { status: 200, body: "[]" }],
    ["error", { status: 500, body: JSON.stringify({ error: "stubbed by dropdown-empty-type-shot" }) }],
  ] as const) {
    const ctx = await signedInContext(
      browser,
      { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
      () => stub,
    );
    const page = await ctx.newPage();
    await page.goto(`${FRONTEND}/spending`, { waitUntil: "networkidle" });
    await refuseOnboarding(page);
    const text = name === "empty" ? "NO TRANSACTIONS" : "COULDN'T LOAD";
    const label = page.getByText(text, { exact: true });
    try {
      // React Query retries a failed fetch before it reports the error.
      await label.waitFor({ timeout: 30_000 });
    } catch (e) {
      await page.screenshot({ path: join(OUT, `no-${name}.png`), fullPage: true });
      console.log(`no ${text} at ${page.url()}`);
      throw e;
    }
    await fam(`${name} label (${text})`, label);
    const title = name === "empty" ? "Nothing spent yet." : "Your transactions didn't load.";
    await fam(`${name} title`, page.getByText(title, { exact: true }));
    await page.screenshot({ path: join(OUT, `spending-${name}.png`) });
    await ctx.close();
  }
} finally {
  await browser.close();
  release();
}
