// Trading journal type pass (finding 928333794e02): reads the computed font
// family of /trading's language and data, empty and with trades, and captures
// both. The trades live in localStorage, so the seeded pass writes four
// made-up trades into this throwaway browser context only; nothing reaches the
// API or the account. Writes .review/shots/trading-type/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/trading-type");

const TRADES = [
  { id: "t1", date: "2026-07-02", closeDate: "2026-07-10", ticker: "MSFT", direction: "long", status: "closed", entryPrice: 400, exitPrice: 430, quantity: 10, currency: "USD", setup: "breakout", notes: "Clean break of the range on volume.", confidence: 4, execution: 3, tags: ["earnings", "swing"] },
  { id: "t2", date: "2026-08-04", closeDate: "2026-08-12", ticker: "NVDA", direction: "short", status: "closed", entryPrice: 120, exitPrice: 126, quantity: 20, currency: "USD", setup: "reversal", notes: "", confidence: 2, execution: 2, tags: [] },
  { id: "t3", date: "2026-09-01", closeDate: "2026-09-08", ticker: "VOD", direction: "long", status: "closed", entryPrice: 70, exitPrice: 76, quantity: 100, currency: "GBP", setup: "breakout", notes: "", confidence: 3, execution: 4, tags: ["weekly"] },
  { id: "t4", date: "2026-09-20", ticker: "AAPL", direction: "long", status: "open", entryPrice: 210, quantity: 5, currency: "USD", setup: "momentum", notes: "", confidence: 3, execution: 3, tags: [] },
];

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

    const serverTrades = async () => {
      const r = await ctx.request.get(`${FRONTEND}/api/settings/preferences`);
      const body = (await r.json()) as { preferences?: Record<string, string> };
      return body.preferences?.["ft-trading-journal-trades"] ?? "(absent)";
    };
    console.log(`account | ft-trading-journal-trades before -> ${await serverTrades()}`);
    const patches: string[] = [];
    const family = (el: Element) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "");
    const open = async (seed: boolean) => {
      const page = await ctx.newPage();
      // The trades key is account-level: hydrate pulls it from
      // /settings/preferences and any local write is PATCHed back. Serve this
      // pass's trades in the GET, and answer every PATCH here, so nothing this
      // capture writes reaches the account.
      await page.route(`${FRONTEND}/api/settings/preferences`, async (route) => {
        const req = route.request();
        if (req.method() !== "GET") {
          patches.push(req.method());
          await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
          return;
        }
        const cs = await ctx.cookies();
        const r = await ctx.request.get(`${API}/api/settings/preferences`, {
          headers: { origin: FRONTEND, cookie: cs.map((c) => `${c.name}=${c.value}`).join("; ") },
        });
        const body = (await r.json()) as { preferences?: Record<string, string> };
        const preferences = { ...(body.preferences ?? {}), "ft-trading-journal-trades": seed ? JSON.stringify(TRADES) : "[]" };
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...body, preferences }) });
      });
      await page.addInitScript((trades) => {
        localStorage.setItem("ft-trading-journal-trades", trades);
      }, seed ? JSON.stringify(TRADES) : "[]");
      await page.goto(`${FRONTEND}/trading`, { waitUntil: "networkidle" });
      if (await page.getByText("Let's shape the app around", { exact: false }).count()) {
        throw new Error("landed on the onboarding questionnaire; refusing to capture it");
      }
      await page.getByText("Win Rate", { exact: true }).first().waitFor({ timeout: 15_000 });
      return page;
    };
    const reader = (page: import("playwright").Page) => ({
      text: async (label: string, texts: [string, boolean?][]) => {
        for (const [t, exact] of texts) {
          const loc = page.getByText(t, { exact: exact ?? true }).first();
          console.log(`${label} | ${t} -> ${(await loc.count()) ? await loc.evaluate(family) : "absent"}`);
        }
      },
      css: async (label: string, css: string) => {
        const loc = page.locator(css).first();
        console.log(`${label} | ${css} -> ${(await loc.count()) ? await loc.evaluate(family) : "absent"}`);
      },
    });

    // Empty journal.
    const empty = await open(false);
    const e = reader(empty);
    await e.text("empty", [["No trades logged"], ["Log your first trade to start", false], ["Log First Trade", false], ["[ NO TRADES MATCH ]"], ["Log your first trade to begin"], ["No trades"], ["Total P&L"], ["closed", false]]);
    await e.css("empty", 'div:has(> br):text("JOURNAL")');
    await empty.screenshot({ path: join(OUT, "trading-empty.png"), fullPage: true });
    await empty.getByRole("button", { name: "New Trade" }).click();
    await e.text("form", [["Ticker *"], ["Journal Notes"], ["Tags (comma-separated)"], ["Tab to navigate", false], ["long"], ["closed"], ["Log Trade"], ["Cancel"]]);
    await e.css("form", 'input[placeholder="AAPL"]');
    await e.css("form", 'input[placeholder="0.00"]');
    await e.css("form", 'input[type="date"]');
    await e.css("form", 'input[placeholder="earnings, swing, weekly"]');
    await e.css("form", "textarea");
    await e.css("form", 'select:has(option[value="GBP"])');
    await e.css("form", 'select:has(option[value="breakout"]):not(:has(option[value="all"]))');
    await empty.screenshot({ path: join(OUT, "trading-form.png"), fullPage: true });
    await empty.close();

    // With trades.
    const full = await open(true);
    const f = reader(full);
    console.log(`seeded | trades in localStorage -> ${await full.evaluate(() => (JSON.parse(localStorage.getItem("ft-trading-journal-trades") ?? "[]") as unknown[]).length)}`);
    await f.text("kpi", [["Win Rate"], ["closed", false], ["open", false], ["winning run", false], ["gross win / loss"]]);
    await f.text("badges", [["LONG"], ["SHORT"], ["OPEN"], ["CLOSED"]]);
    await f.text("callout", [["Best Trade", false]]);
    await f.text("card", [["ENTRY"], ["DAYS HELD"]]);
    await f.css("card", 'div:text-is("momentum")');
    await f.css("log", 'td:text-is("breakout")');
    await f.css("log", 'td:text-is("MSFT")');
    await f.css("log", 'th:text("Setup")');
    await f.text("filters", [["All Setups"], ["All Symbols"]]);
    await f.css("filters", 'select:has(option[value="all"])');
    await f.css("filters", 'select:has(option[value=""])');
    await f.css("filters", 'input[placeholder="P&L min"]');
    await f.css("months", 'div:text-is("No trades")');
    // The win-rate chart's category axis, not the P&L chart's money axis.
    const setupTick = full.locator(".recharts-yAxis .recharts-cartesian-axis-tick text", { hasText: "breakout" }).first();
    console.log(`setup-axis | breakout tick -> ${(await setupTick.count()) ? await setupTick.evaluate(family) : "absent"}`);
    await f.css("money-axis", ".recharts-yAxis .recharts-cartesian-axis-tick text");
    await f.css("pnl-axis", ".recharts-xAxis .recharts-cartesian-axis-tick text");
    await f.css("data", ".pnum");
    await full.locator('td:text-is("MSFT")').click();
    await f.text("expanded", [["JOURNAL NOTES"], ["Clean break of the range", false], ["earnings"], ["CURRENCY"], ["USD"]]);
    await full.screenshot({ path: join(OUT, "trading-full.png"), fullPage: true });
    await full.getByRole("button", { name: "closed", exact: true }).click();
    await f.text("filters", [["Clear Filters"]]);
    await full.close();
    console.log(`account | preference writes answered locally -> ${patches.length}`);
    console.log(`account | ft-trading-journal-trades after -> ${await serverTrades()}`);
    await ctx.close();
} finally {
  await browser.close();
  release();
}
