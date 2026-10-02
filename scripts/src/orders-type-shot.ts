// Investments ORDERS tab type pass (finding 928333794e02): reads the computed
// font family of the tab's language and data, with the add form open, and
// captures it. Read-only against the API. Two capture-only stubs, both in this
// browser and nowhere else: /api/market/providers answers marketDataEnabled
// (the tab is hidden without market data) and the preferences read carries
// two order alerts (the tab's only store). Writes .review/shots/orders-type/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/orders-type");

const release = acquireCaptureLock();
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route(`${FRONTEND}/api/**`, async (route) => {
      try {
        const req = route.request();
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

    // An un-onboarded seed account renders the questionnaire on every route.
    // PUT persona re-stamps onboarded_at; the persona itself is kept.
    const personaRes = await ctx.request.get(`${FRONTEND}/api/settings/persona`);
    const persona = (await personaRes.json()) as { persona: string | null; onboarded: boolean };
    if (!persona.onboarded) {
      const put = await ctx.request.put(`${FRONTEND}/api/settings/persona`, {
        headers: { "Content-Type": "application/json" },
        data: { persona: persona.persona ?? "full" },
      });
      console.log(`seed account was not onboarded; re-stamped persona ${persona.persona ?? "full"}: ${put.status()}`);
    }

    // The tab exists only with market data on; the dev server may run without it.
    await ctx.route(`${FRONTEND}/api/market/providers`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ marketDataEnabled: true }) }),
    );
    // Order alerts are an account-synced localStorage key: hydration replaces
    // whatever the page holds with GET /api/settings/preferences. Inject two
    // alerts into that answer, and swallow the PATCH so nothing this run does
    // reaches the account.
    const ORDERS = [
      { id: "o1", ticker: "AAPL", name: "Apple Inc.", orderType: "limit-buy", targetPrice: 150, quantity: 10, notes: "support level retest", createdAt: "2026-10-01T00:00:00Z", triggered: false },
      { id: "o2", ticker: "MSFT", name: "Microsoft", orderType: "stop-loss", targetPrice: 300, createdAt: "2026-10-01T00:00:00Z", triggered: true },
    ];
    await ctx.route(`${FRONTEND}/api/settings/preferences`, async (route) => {
      const req = route.request();
      if (req.method() !== "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
        return;
      }
      const cs = await ctx.cookies();
      const r = await ctx.request.get(`${API}/api/settings/preferences`, {
        headers: { origin: FRONTEND, cookie: cs.map((c) => `${c.name}=${c.value}`).join("; ") },
      });
      const body = (await r.json()) as { preferences?: Record<string, string> };
      body.preferences = { ...(body.preferences ?? {}), "ft-inv-orders": JSON.stringify(ORDERS) };
      await route.fulfill({ status: r.status(), contentType: "application/json", body: JSON.stringify(body) });
    });

    const page = await ctx.newPage();
    await page.goto(`${FRONTEND}/portfolio`, { waitUntil: "networkidle" });
    if (await page.getByText("Let's shape the app around", { exact: false }).count()) {
      throw new Error("landed on the onboarding questionnaire; refusing to capture it");
    }
    await page.getByRole("button", { name: "ORDERS", exact: true }).click({ timeout: 10_000 });
    await page.getByText("Watchlist & Order Alerts", { exact: true }).waitFor({ timeout: 15_000 });
    await page.getByRole("button", { name: "Add Alert" }).first().click();
    const family = (el: Element) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "");
    const fam = async (text: string, exact = true) => {
      const loc = page.getByText(text, { exact }).first();
      if (!(await loc.count())) return "absent";
      return loc.evaluate(family);
    };
    const log = async (label: string, texts: [string, boolean?][]) => {
      for (const [t, exact] of texts) console.log(`${label} | ${t} -> ${await fam(t, exact ?? true)}`);
    };
    const sel = async (label: string, css: string) => {
      const loc = page.locator(css).first();
      console.log(`${label} | ${css} -> ${(await loc.count()) ? await loc.evaluate(family) : "absent"}`);
    };

    await log("lang", [["Watchlist & Order Alerts"], ["simulated, not connected to a broker", false], ["New Order Alert"],
      ["Ticker"], ["Security Name"], ["Target Price"], ["Cancel"], ["Only executes if price drops", false],
      ["Active Alerts", false], ["support level retest"]]);
    // Badges by structure: the select's <option> and the "Clear 1 triggered" button carry the same words.
    for (const b of [/^Limit Buy$/, /^Stop Loss$/, /^TRIGGERED$/, /^WATCHING$/]) {
      const loc = page.locator("tbody td span", { hasText: b }).first();
      console.log(`lang | badge ${b} -> ${(await loc.count()) ? await loc.evaluate(family) : "absent"}`);
    }
    await sel("lang", 'input[placeholder="e.g. Apple Inc."]');
    await sel("lang", 'input[placeholder="e.g. support level retest"]');
    await sel("lang", "form select");
    await log("data", [["AAPL"], ["$150.00"], ["$300.00"], ["10"], ["TARGET"], ["QTY"], ["NOTES"]]);
    await sel("data", 'input[placeholder="e.g. AAPL"]');
    await sel("data", 'input[placeholder="e.g. 150.00"]');
    await sel("data", 'input[placeholder="e.g. 100"]');
    const count = page.locator("span", { hasText: /^2$/ }).first();
    console.log(`data | header count 2 -> ${(await count.count()) ? await count.evaluate(family) : "absent"}`);
    await page.screenshot({ path: join(OUT, "orders-tab.png"), fullPage: true });
    await ctx.close();
} finally {
  await browser.close();
  release();
}
