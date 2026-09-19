import { describe, it, expect } from "vitest";
import { enrichInvestment, summarizeInvestments, type InvestmentRow } from "./enrich-investment";
import type { StockPriceData, FxRatesData } from "./market";

// The G10 contract: when the market API has no price for a ticker, every
// price-derived field is null and priceAvailable is false. Never a
// fabricated zero, never a −100% loss.
//
// The 30 Aug 2026 correctness fix extends this: the base-currency
// fields (baseEquivalent, plBase — renamed from gbpValue/plGbp in the
// naming pass that followed) are also null when the FX pivot cannot
// convert to the user's base. The previous `?? 1` fallback turned a
// missing rate into "treat the native amount as if it were base",
// which for a base-MYR user rendered a USD figure with an "RM" symbol.

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
    expect(result.baseEquivalent).toBeNull();
    expect(result.plBase).toBeNull();
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
    expect(result.baseEquivalent).toBe(1680);               // 2100 / 1.25 USD→GBP
    expect(result.plBase).toBe(240);                    // (2100 - 1800) / 1.25
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
    expect(result.baseEquivalent).toBe(9240);
    // Cost basis 1800 USD → GBP (1440) → MYR (7920); pl = 9240 - 7920
    expect(result.plBase).toBe(1320);
  });

  it("returns null base fields when the base-currency FX rate is missing", () => {
    // Yahoo lost GBPTHB=X and Frankfurter has no THB either — a
    // base-THB user's positions can't be converted. Old behaviour
    // was `?? 1` which returned the USD figure and called it THB;
    // new behaviour is null (same shape as missing price).
    const result = enrichInvestment(row, new Map([["AAPL", good]]), fx, "THB");
    expect(result.priceAvailable).toBe(true);
    expect(result.currentValue).toBe(2100);        // native still available
    expect(result.baseEquivalent).toBeNull();
    expect(result.plBase).toBeNull();
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
    expect(result.baseEquivalent).toBeNull();
    expect(result.plBase).toBeNull();
  });

  it("returns identity conversion when position currency equals base currency", () => {
    const gbpRow: InvestmentRow = { ...row };
    const gbp: StockPriceData = { ticker: "AAPL", price: 210, currency: "GBP", previousClose: null, updatedAt: "2026-08-15T00:00:00Z" };
    const result = enrichInvestment(gbpRow, new Map([["AAPL", gbp]]), fx, "GBP");
    expect(result.baseEquivalent).toBe(2100);
    expect(result.plBase).toBe(300);
  });
});

describe("enrichInvestment — cost-basis fallback (markets off / no price)", () => {
  it("values an unpriced position at cost basis instead of leaving it at nothing", () => {
    // Net worth honesty fix: a position with no live price used to
    // contribute nothing to any total. costBasisValueBase gives a caller
    // something legitimate to fall back on — never null just because
    // priceAvailable is false.
    const result = enrichInvestment(row, new Map(), fx, "GBP");
    expect(result.priceAvailable).toBe(false);
    // 10 shares * $180 = $1800 USD -> GBP at 1.25 = 1440
    expect(result.costBasisValueBase).toBe(1440);
  });

  it("infers the position's currency from its exchange suffix, not a hardcoded USD", () => {
    const lseRow: InvestmentRow = { ...row, ticker: "VOD.L", costPricePerShare: "100.00" };
    const result = enrichInvestment(lseRow, new Map(), fx, "GBP");
    expect(result.priceAvailable).toBe(false);
    expect(result.currency).toBe("GBP");
    // 10 shares * £100 = £1000, GBP base -> identity conversion, no FX loss.
    expect(result.costBasisValueBase).toBe(1000);
  });

  it("returns null costBasisValueBase when the base-currency FX rate is missing", () => {
    const result = enrichInvestment(row, new Map(), fx, "THB");
    expect(result.priceAvailable).toBe(false);
    expect(result.costBasisValueBase).toBeNull();
  });

  it("is still populated when a live price IS available (doesn't regress the priced path)", () => {
    const good: StockPriceData = { ticker: "AAPL", price: 210, currency: "USD", previousClose: null, updatedAt: "2026-08-15T00:00:00Z" };
    const result = enrichInvestment(row, new Map([["AAPL", good]]), fx, "GBP");
    expect(result.priceAvailable).toBe(true);
    expect(result.costBasisValueBase).toBe(1440);
    // Unaffected by the shared-rate refactor.
    expect(result.baseEquivalent).toBe(1680);
    expect(result.plBase).toBe(240);
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
    // baseEquivalent and plBase still valid — the base fields don't depend on cost basis.
    expect(result.baseEquivalent).toBe(1680);
    expect(result.plBase).toBe(1680);
  });
});

describe("summarizeInvestments — net worth must not silently drop the unpriced portfolio", () => {
  const good: StockPriceData = { ticker: "AAPL", price: 210, currency: "USD", previousClose: null, updatedAt: "2026-08-15T00:00:00Z" };

  it("regression: with every ticker unpriced (markets off), totalValueBase is NOT zero", () => {
    // This is the exact defect the task describes: ENABLE_MARKET_DATA off
    // made getValuationPrices() return an empty map for every ticker, and
    // the old reduce (`e.priceAvailable === true` only) summed zero
    // positions — a real portfolio rendered as £0.
    const unpriced = enrichInvestment(row, new Map(), fx, "GBP");
    const totals = summarizeInvestments([unpriced]);
    expect(totals.totalValueBase).not.toBe(0);
    expect(totals.totalValueBase).toBe(1440); // cost basis, GBP
    expect(totals.positionsAtCost).toBe(1);
    expect(totals.unavailablePositions).toBe(0);
  });

  it("sums an all-live portfolio exactly as before (no regression to the priced path)", () => {
    const priced = enrichInvestment(row, new Map([["AAPL", good]]), fx, "GBP");
    const totals = summarizeInvestments([priced]);
    expect(totals.totalValueBase).toBe(1680);
    expect(totals.totalPlBase).toBe(240);
    expect(totals.positionsAtCost).toBe(0);
    expect(totals.unavailablePositions).toBe(0);
  });

  it("mixes a live position and a cost-valued position in one total", () => {
    const priced = enrichInvestment(row, new Map([["AAPL", good]]), fx, "GBP");
    const lseRow: InvestmentRow = { ...row, ticker: "VOD.L", costPricePerShare: "100.00" };
    const unpriced = enrichInvestment(lseRow, new Map(), fx, "GBP");
    const totals = summarizeInvestments([priced, unpriced]);
    expect(totals.totalValueBase).toBe(1680 + 1000);
    // Cost-valued leg contributes 0 P/L, not a fabricated return.
    expect(totals.totalPlBase).toBe(240);
    expect(totals.positions).toBe(2);
    expect(totals.positionsAtCost).toBe(1);
    expect(totals.unavailablePositions).toBe(0);
  });

  it("still excludes a position with neither a live price nor a convertible cost basis", () => {
    const noFx = enrichInvestment(row, new Map(), fx, "THB");
    const totals = summarizeInvestments([noFx]);
    expect(totals.totalValueBase).toBe(0);
    expect(totals.unavailablePositions).toBe(1);
    expect(totals.positionsAtCost).toBe(0);
  });
});
