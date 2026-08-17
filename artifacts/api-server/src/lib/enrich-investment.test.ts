import { describe, it, expect } from "vitest";
import { enrichInvestment, type InvestmentRow } from "./enrich-investment";
import type { StockPriceData, FxRatesData } from "./market";

// The G10 contract: when the market API has no price for a ticker, every
// price-derived field is null and priceAvailable is false. Never a
// fabricated zero, never a −100% loss.

const row: InvestmentRow = {
  id: 1,
  ticker: "AAPL",
  name: "Apple",
  buyDate: "2026-01-15",
  shares: "10",
  costPricePerShare: "180.00",
  createdAt: new Date("2026-01-15T12:00:00Z"),
};
const fx: FxRatesData = { base: "GBP", rates: { USD: 1.25, EUR: 1.15 }, updatedAt: "2026-08-15T00:00:00Z" };

describe("enrichInvestment — G10 contract", () => {
  it("returns priceAvailable=false and null price fields when the ticker is absent from the price map", () => {
    const result = enrichInvestment(row, new Map(), fx);
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
    const result = enrichInvestment(row, new Map([["AAPL", bad]]), fx);
    expect(result.priceAvailable).toBe(false);
    expect(result.livePrice).toBeNull();
  });

  it("does not fabricate a zero when the priceData is present but the price is Infinity", () => {
    const bad: StockPriceData = { ticker: "AAPL", price: Number.POSITIVE_INFINITY, currency: "USD", previousClose: null, updatedAt: "2026-08-15T00:00:00Z" };
    const result = enrichInvestment(row, new Map([["AAPL", bad]]), fx);
    expect(result.priceAvailable).toBe(false);
  });

  it("populates all price-derived fields when the price is available", () => {
    const good: StockPriceData = { ticker: "AAPL", price: 210, currency: "USD", previousClose: null, updatedAt: "2026-08-15T00:00:00Z" };
    const result = enrichInvestment(row, new Map([["AAPL", good]]), fx);
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
    const result = enrichInvestment(row, new Map(), fx);
    expect(result.plPercent).not.toBe(-100);
    expect(result.plPercent).toBeNull();
    expect(result.currentValue).not.toBe(0);
    expect(result.currentValue).toBeNull();
  });
});
