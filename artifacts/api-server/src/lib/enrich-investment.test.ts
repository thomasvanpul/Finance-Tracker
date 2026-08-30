import { describe, it, expect } from "vitest";
import { enrichInvestment, type InvestmentRow } from "./enrich-investment";
import type { StockPriceData, FxRatesData } from "./market";

// The G10 contract: when the market API has no price for a ticker, every
// price-derived field is null and priceAvailable is false. Never a
// fabricated zero, never a −100% loss.
//
// The 30 Aug 2026 correctness fix extends this: the base-currency
// fields (gbpValue, plGbp) are also null when the FX pivot cannot
// convert to the user's base — the previous `?? 1` fallback turned a
// missing rate into "treat the native amount as if it were base",
// which for a base-MYR user rendered a USD figure with an "RM"
// symbol. Field names still say gbpValue/plGbp at this commit; the
// rename to baseEquivalent/plBase is the next commit.

const row: InvestmentRow = {
  id: 1,
  ticker: "AAPL",
  name: "Apple",
  buyDate: "2026-01-15",
  shares: "10",
  costPricePerShare: "180.00",
  createdAt: new Date("2026-01-15T12:00:00Z"),
};
const fx: FxRatesData = { base: "GBP", rates: { USD: 1.25, EUR: 1.15, MYR: 5.5 }, updatedAt: "2026-08-15T00:00:00Z" };

describe("enrichInvestment — G10 contract", () => {
  it("returns priceAvailable=false and null price fields when the ticker is absent from the price map", () => {
    const result = enrichInvestment(row, new Map(), fx, "GBP");
    expect(result.priceAvailable).toBe(false);
    expect(result.livePrice).toBeNull();
    expect(result.currentValue).toBeNull();
    expect(result.gbpValue).toBeNull();
    expect(result.plGbp).toBeNull();
    expect(result.plPercent).toBeNull();
    // Cost-basis metadata still populated — that isn't derived from live price.
    expect(result.shares).toBe(10);
    expect(result.costPricePerShare).toBe(180);
    expect(result.ticker).toBe("AAPL");
  });

  it("does not fabricate a zero when the priceData is present but the price is NaN", () => {
    const bad: StockPriceData = { ticker: "AAPL", price: Number.NaN, currency: "USD", previousClose: null, updatedAt: "2026-08-15T00:00:00Z" };
    const result = enrichInvestment(row, new Map([["AAPL", bad]]), fx, "GBP");
    expect(result.priceAvailable).toBe(false);
    expect(result.livePrice).toBeNull();
  });

  it("does not fabricate a zero when the priceData is present but the price is Infinity", () => {
    const bad: StockPriceData = { ticker: "AAPL", price: Number.POSITIVE_INFINITY, currency: "USD", previousClose: null, updatedAt: "2026-08-15T00:00:00Z" };
    const result = enrichInvestment(row, new Map([["AAPL", bad]]), fx, "GBP");
    expect(result.priceAvailable).toBe(false);
  });

  it("populates all price-derived fields when the price is available (base=GBP)", () => {
    const good: StockPriceData = { ticker: "AAPL", price: 210, currency: "USD", previousClose: null, updatedAt: "2026-08-15T00:00:00Z" };
    const result = enrichInvestment(row, new Map([["AAPL", good]]), fx, "GBP");
    expect(result.priceAvailable).toBe(true);
    expect(result.livePrice).toBe(210);
    expect(result.currentValue).toBe(2100);          // 10 * 210
    expect(result.plPercent).toBeCloseTo(16.67, 1);   // (210 - 180) / 180
    expect(result.gbpValue).toBe(1680);               // 2100 / 1.25 USD→GBP
    expect(result.plGbp).toBe(240);                    // (2100 - 1800) / 1.25
  });

  it("regression: a missing price MUST NOT produce a −100% loss on cost basis", () => {
    // The G10 defect this fixes: the old `?? 0` made currentValue = 0
    // and plPercent = -100 for every unpriceable position. A market outage
    // rendered the whole portfolio as if it had been wiped out.
    const result = enrichInvestment(row, new Map(), fx, "GBP");
    expect(result.plPercent).not.toBe(-100);
    expect(result.plPercent).toBeNull();
    expect(result.currentValue).not.toBe(0);
    expect(result.currentValue).toBeNull();
  });
});

describe("enrichInvestment — base-currency correctness (30 Aug 2026 fix)", () => {
  const good: StockPriceData = { ticker: "AAPL", price: 210, currency: "USD", previousClose: null, updatedAt: "2026-08-15T00:00:00Z" };

  it("returns the USER's base equivalent, not literal GBP, for a base-MYR user", () => {
    // Regression bar: before the fix, enrichInvestment divided by
    // fx.rates[currency] and returned literal GBP. A base-MYR user
    // saw £1,680 with an "RM" symbol stamped on it — this asserts
    // the digits are now MYR too.
    const result = enrichInvestment(row, new Map([["AAPL", good]]), fx, "MYR");
    expect(result.priceAvailable).toBe(true);
    // 2100 USD → GBP (÷1.25 = 1680) → MYR (×5.5 = 9240)
    expect(result.gbpValue).toBe(9240);
    // Cost basis 1800 USD → GBP (1440) → MYR (7920); pl = 9240 - 7920
    expect(result.plGbp).toBe(1320);
  });

  it("returns null base fields when the base-currency FX rate is missing", () => {
    // Yahoo lost GBPTHB=X and Frankfurter has no THB either — a
    // base-THB user's positions can't be converted. Old behaviour
    // was `?? 1` which returned the USD figure and called it THB;
    // new behaviour is null (same shape as missing price).
    const result = enrichInvestment(row, new Map([["AAPL", good]]), fx, "THB");
    expect(result.priceAvailable).toBe(true);
    expect(result.currentValue).toBe(2100);        // native still available
    expect(result.gbpValue).toBeNull();
    expect(result.plGbp).toBeNull();
    // plPercent is native-only, unaffected by base-FX loss
    expect(result.plPercent).toBeCloseTo(16.67, 1);
  });

  it("returns null base fields when the position-currency FX rate is missing", () => {
    // Same rule from the other direction: THB position, GBP base,
    // no THB rate. Old behaviour: THB treated as GBP.
    const thbRow: InvestmentRow = { ...row, ticker: "SET_TICKER" };
    const thb: StockPriceData = { ticker: "SET_TICKER", price: 100, currency: "THB", previousClose: null, updatedAt: "2026-08-15T00:00:00Z" };
    const result = enrichInvestment(thbRow, new Map([["SET_TICKER", thb]]), fx, "GBP");
    expect(result.priceAvailable).toBe(true);
    expect(result.currentValue).toBe(1000);
    expect(result.gbpValue).toBeNull();
    expect(result.plGbp).toBeNull();
  });

  it("returns identity conversion when position currency equals base currency", () => {
    const gbpRow: InvestmentRow = { ...row };
    const gbp: StockPriceData = { ticker: "AAPL", price: 210, currency: "GBP", previousClose: null, updatedAt: "2026-08-15T00:00:00Z" };
    const result = enrichInvestment(gbpRow, new Map([["AAPL", gbp]]), fx, "GBP");
    expect(result.gbpValue).toBe(2100);
    expect(result.plGbp).toBe(300);
  });
});

describe("enrichInvestment — plPercent divisor-guard fix", () => {
  it("returns null (not 0) for plPercent when costBasis is 0", () => {
    // Divisor-guard fabrication: `costBasis > 0 ? ... : 0` returned
    // 0% return for a position with no cost, which reads as
    // break-even. Null is the honest answer — a percentage of
    // nothing is undefined.
    const freeRow: InvestmentRow = { ...row, costPricePerShare: "0" };
    const good: StockPriceData = { ticker: "AAPL", price: 210, currency: "USD", previousClose: null, updatedAt: "2026-08-15T00:00:00Z" };
    const result = enrichInvestment(freeRow, new Map([["AAPL", good]]), fx, "GBP");
    expect(result.priceAvailable).toBe(true);
    expect(result.currentValue).toBe(2100);
    expect(result.plPercent).toBeNull();
    // gbpValue and plGbp still valid — the base fields don't depend on cost basis.
    expect(result.gbpValue).toBe(1680);
    expect(result.plGbp).toBe(1680);
  });
});
