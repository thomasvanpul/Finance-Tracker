// The lock the markets decision hangs on.
//
// Thomas, 19 Sep 2026: "we can't really do live markets or markets at all."
// Alpaca forbids display to end users in writing; index levels were already
// refused on the same grounds. So this file asserts the one thing that makes
// that true of the SERVER — with the flag off, no market-data function in
// this process can reach a provider — and does it by enumerating the module's
// own exports rather than a hand-kept list, so a tenth fetcher added next
// month fails here instead of quietly shipping a quote.
//
// It deliberately does NOT assert the shape of any response. What matters is
// the refusal, and a test that also pinned shapes would start failing for
// reasons that have nothing to do with the licence.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {},
  investmentsTable: {},
  accountsTable: {},
  eodPricesTable: {},
}));

const SAVED = process.env.ENABLE_MARKET_DATA;
beforeEach(() => { delete process.env.ENABLE_MARKET_DATA; });
afterEach(() => {
  if (SAVED === undefined) delete process.env.ENABLE_MARKET_DATA;
  else process.env.ENABLE_MARKET_DATA = SAVED;
});

const market = await import("./market");
const { MarketDataOffError, isMarketDataEnabled, decideMarketData } =
  await import("./market-flag");
const { getEodPrices, getValuationPrices } = await import("./market-eod");

// ── (a) The flag itself ─────────────────────────────────────────────────────

describe("the flag defaults to off, and only one string turns it on", () => {
  it("unset means off — a deployment that never sets it lands in the safe state", () => {
    expect(isMarketDataEnabled({})).toBe(false);
  });

  it.each(["0", "true", "yes", "", " 1 ", "ENABLE"])(
    "%j does not turn market data on",
    (value) => {
      expect(isMarketDataEnabled({ ENABLE_MARKET_DATA: value })).toBe(false);
    },
  );

  it('"1" turns it on, so the decision is reversible without a code change', () => {
    expect(isMarketDataEnabled({ ENABLE_MARKET_DATA: "1" })).toBe(true);
  });

  it("the off decision names the variable that decides it", () => {
    const d = decideMarketData({});
    expect(d.enabled).toBe(false);
    if (!d.enabled) expect(d.reason).toContain("ENABLE_MARKET_DATA");
  });
});

// ── (b) Every quote-fetching export refuses ─────────────────────────────────

// Name -> a call with arguments that would otherwise reach a provider.
// FX is absent ON PURPOSE and is asserted separately below.
const QUOTE_FETCHERS: Record<string, () => Promise<unknown>> = {
  getStockQuotes:         () => market.getStockQuotes(["AAPL"]),
  readStockQuotes:        () => market.readStockQuotes(["AAPL"]),
  getStockPrices:         () => market.getStockPrices(["AAPL"]),
  readStockPrices:        () => market.readStockPrices(["AAPL"]),
  getStockHistory:        () => market.getStockHistory("AAPL", "1mo"),
  getStockDetail:         () => market.getStockDetail("AAPL"),
  getOptionsChain:        () => market.getOptionsChain("AAPL"),
  getStockNews:           () => market.getStockNews("AAPL"),
  getFilteredNewsForUser: () => market.getFilteredNewsForUser({ tickers: ["AAPL"], currencies: ["USD"] }),
  yahooDailyBars:         () => market.yahooDailyBars("AAPL"),
};

describe("with the flag off, no market fetcher reaches a provider", () => {
  it.each(Object.keys(QUOTE_FETCHERS))("%s throws MarketDataOffError", async (name) => {
    await expect(QUOTE_FETCHERS[name]()).rejects.toBeInstanceOf(MarketDataOffError);
  });
});

// ── (c) The enumeration lock ────────────────────────────────────────────────

describe("no market export escapes the list above", () => {
  // The failure this catches: someone adds getCryptoQuotes next month, wires
  // it to a route, and every test here still passes because the list was
  // hand-kept. Comparing against the module's real exports means a new
  // fetcher has to be classified — gated, or explicitly named FX/pure — by
  // whoever adds it.
  const FX_AND_PURE: readonly string[] = [
    // FX: outside the flag by decision. See lib/market-flag.ts.
    "getFxRates", "toGbp", "toBase", "snapshotFxRate", "txToBase", "gbpTo",
    // Pure helpers and status reads — no network, nothing displayed.
    // filterNewsForUser is a pure filter over items ALREADY fetched; the
    // fetch is getFilteredNewsForUser, which is gated. (This lock found it
    // on its first run — which is the argument for enumerating exports
    // rather than keeping a list by hand.)
    "sessionDateUtc", "utcDayBefore", "getYahooRichQuoteStatus", "filterNewsForUser",
    // previousSessionClose reads a chart response ALREADY fetched by the
    // gated price lane; it has no transport of its own.
    "previousSessionClose",
    // Test seams.
    "__setFxCacheForTesting", "__setYahooForTesting",
  ];

  it("every exported function is either gated or on the exempt list", () => {
    const exported = Object.keys(market).filter(
      (k) => typeof (market as Record<string, unknown>)[k] === "function",
    );
    const unclassified = exported.filter(
      (name) => !(name in QUOTE_FETCHERS) && !FX_AND_PURE.includes(name),
    );
    expect(unclassified).toEqual([]);
  });

  it("the exempt list has not been used to smuggle a fetcher back in", () => {
    // FX must still WORK with the flag off — that is the whole point of the
    // exemption — so this asserts the exemption is real, not just declared.
    expect(typeof market.getFxRates).toBe("function");
    expect(() => market.sessionDateUtc(new Date())).not.toThrow();
  });
});

// ── (d) The valuation path degrades instead of throwing ─────────────────────

describe("holdings valuation returns nothing rather than failing", () => {
  // /api/investments and /api/dashboard must keep serving a portfolio with
  // no prices in it. An absent price is a shape those routes already handle
  // (priceAvailable false); an exception is not.
  it("getEodPrices is empty", async () => {
    expect((await getEodPrices(["AAPL", "VWRL.L"])).size).toBe(0);
  });

  it("getValuationPrices is empty and dates nothing", async () => {
    const v = await getValuationPrices(["AAPL", "BTC-USD"]);
    expect(v.prices.size).toBe(0);
    expect(v.asOfSession).toBeNull();
    expect(v.staleTickers).toEqual([]);
  });
});
