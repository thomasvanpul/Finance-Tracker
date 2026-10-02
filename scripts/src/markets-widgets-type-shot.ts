// Markets widgets type pass (finding 928333794e02): reads the computed font
// family of components/investments/markets-widgets.tsx as the MARKETS tab on
// /investments renders it, with a ticker's detail open. Read-only against the
// API. Capture-only stubs, in this browser and nowhere else: the market
// provider flag, quotes, history and detail for SPY (a full analyst trend) and
// QQQ (an all-zero trend, so RecBar's empty line renders). Writes
// .review/shots/markets-widgets-type/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/markets-widgets-type");

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

    const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    const quote = (ticker: string, price: number) => ({
      ticker, price, currency: "USD", changePercent: 0.42, pe: 22, forwardPe: 20, eps: 4.1,
      low52w: price * 0.8, high52w: price * 1.1, marketCap: 5e11, beta: 1, dividendYield: 0.013,
      analystTargetPrice: price * 1.08, volume: 7.2e7, previousClose: price * 0.99,
    });
    const QUOTES = [quote("SPY", 560), quote("QQQ", 480)];
    const detail = (ticker: string, trend: Record<string, number>) => ({
      ticker, sector: null, industry: null, country: null, employees: null, description: null, website: null,
      totalRevenue: null, grossMargins: null, operatingMargins: null, netMargins: null, revenueGrowth: 0.08,
      earningsGrowth: 0.1, freeCashflow: null, operatingCashflow: null, totalDebt: null, totalCash: null,
      debtToEquity: null, currentRatio: null, quickRatio: null, sharesOutstanding: null, bookValue: null,
      priceToBook: null, priceToSales: null, enterpriseValue: null, pegRatio: 1.4, forwardEps: null,
      returnOnEquity: 0.2, returnOnAssets: null, institutionalOwnership: null, insiderOwnership: null,
      shortRatio: null, shortPercentFloat: null, targetHigh: 640, targetLow: 500, targetMedian: 600,
      fiftyTwoWeekChange: 0.12, earningsHistory: [], nextEarningsDate: null,
      recommendationTrend: [{ period: "0m", ...trend }],
    });
    const DETAIL: Record<string, unknown> = {
      SPY: detail("SPY", { strongBuy: 4, buy: 9, hold: 6, sell: 2, strongSell: 1 }),
      QQQ: detail("QQQ", { strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 }),
    };
    await ctx.route(`${FRONTEND}/api/market/providers`, (r) => r.fulfill(json({ marketDataEnabled: true })));
    await ctx.route(`${FRONTEND}/api/market/quotes**`, (r) => {
      const want = new URL(r.request().url()).searchParams.get("tickers")?.split(",") ?? [];
      return r.fulfill(json(QUOTES.filter((q) => want.includes(q.ticker))));
    });
    await ctx.route(`${FRONTEND}/api/market/history**`, (r) => r.fulfill(json([])));
    await ctx.route(`${FRONTEND}/api/market/news**`, (r) => r.fulfill(json([])));
    await ctx.route(`${FRONTEND}/api/market/detail**`, (r) => {
      const t = new URL(r.request().url()).searchParams.get("ticker") ?? "";
      return r.fulfill(json(DETAIL[t] ?? {}));
    });

    const page = await ctx.newPage();
    await page.goto(`${FRONTEND}/investments`, { waitUntil: "networkidle" });
    if (await page.getByText("Let's shape the app around", { exact: false }).count()) {
      throw new Error("landed on the onboarding questionnaire; refusing to capture it");
    }
    const family = (el: Element) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "");
    const at = async (label: string, loc: import("playwright").Locator) =>
      console.log(`${label} -> ${(await loc.count()) ? await loc.first().evaluate(family) : "absent"}`);

    // Overview: RangeBar figures on the ETF cards (low / high, toFixed(0)).
    await at("data | RangeBar low 448", page.getByText("448", { exact: true }));
    await at("data | RangeBar high 616", page.getByText("616", { exact: true }));

    await page.locator("button", { hasText: "S&P 500" }).first().click();
    const rating = page.getByText("FT Stock Rating", { exact: true }).locator("xpath=..");
    await rating.waitFor({ timeout: 15_000 });
    for (const w of ["Value", "Growth", "Quality", "Momentum"]) {
      await at(`lang | RatingBar label ${w}`, rating.getByText(w, { exact: true }));
    }
    await at("lang | Overall Score (sibling, reference)", rating.getByText("Overall Score", { exact: true }));
    const score = rating.locator("span", { hasText: /^\d+\.\d$/ });
    await at(`data | RatingBar score ${await score.first().textContent()}`, score);
    for (const [w, n] of [["Strong Buy", 4], ["Buy", 9], ["Hold", 6], ["Sell", 2], ["Strong Sell", 1]] as const) {
      const leg = page.locator("span", { hasText: new RegExp(`^${w}: ${n}$`) }).last();
      await at(`lang | RecBar legend word "${w}"`, leg);
      await at(`data | RecBar legend count ${n}`, leg.getByText(String(n), { exact: true }));
    }
    await at("lang | (N analysts) line, reference", page.getByText("analysts", { exact: false }));
    await page.getByText("FT Stock Rating", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(OUT, `spy-detail-${process.argv[2] ?? "run"}.png`), fullPage: true });

    await page.goto(`${FRONTEND}/investments`, { waitUntil: "networkidle" });
    await page.locator("button", { hasText: "NASDAQ 100" }).first().click();
    await page.getByText("No analyst data", { exact: true }).waitFor({ timeout: 15_000 });
    await at("lang | RecBar empty line No analyst data", page.getByText("No analyst data", { exact: true }));
    await at("lang | No recommendation data sibling? (absent expected)", page.getByText("No recommendation data", { exact: true }));
    await ctx.close();
} finally {
  await browser.close();
  release();
}
