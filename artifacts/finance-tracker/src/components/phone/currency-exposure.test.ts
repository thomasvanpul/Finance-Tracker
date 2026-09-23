import { describe, it, expect } from "vitest";
import { computeCurrencyExposure } from "./WorthScreen";

// BY CURRENCY prints each row as baseValue / totalBase. Rows carry both
// accounts and positions, so the total must too — otherwise the rows sum
// past 100% whenever the user holds a position (77+27+3 on the seed).

const account = (id: number, currency: string, baseEquivalent: number, type: "cash" | "liability" = "cash") => ({
  id, name: `acct ${id}`, currency, balance: baseEquivalent, baseEquivalent, type,
});
const position = (id: number, currency: string, baseEquivalent: number | null) => ({
  id, ticker: `T${id}`, name: `pos ${id}`, shares: 1, costPricePerShare: 1, currency,
  priceAvailable: baseEquivalent != null, livePrice: null, currentValue: baseEquivalent,
  baseEquivalent, plBase: null, plPercent: null,
});

describe("computeCurrencyExposure · BY CURRENCY percentages", () => {
  it("totals include positions, so the row percentages sum to 100", () => {
    const exposure = computeCurrencyExposure(
      [account(1, "GBP", 8000), account(2, "MYR", 500)],
      [position(1, "USD", 2500), position(2, "GBP", 1000)],
    );
    expect(exposure.totalBase).toBe(12000);
    const pctSum = exposure.rows.reduce((s, r) => s + (r.baseValue / exposure.totalBase) * 100, 0);
    expect(pctSum).toBeCloseTo(100, 9);
  });

  it("a liability still reduces its currency and the total", () => {
    const exposure = computeCurrencyExposure(
      [account(1, "GBP", 10000), account(2, "GBP", 4000, "liability")],
      [position(1, "USD", 2000)],
    );
    expect(exposure.totalBase).toBe(8000);
    expect(exposure.rows.find((r) => r.currency === "GBP")?.baseValue).toBe(6000);
  });

  it("an unconvertible position is counted, not added to either side", () => {
    const exposure = computeCurrencyExposure([account(1, "GBP", 1000)], [position(1, "USD", null)]);
    expect(exposure.totalBase).toBe(1000);
    expect(exposure.unconvertibleCount).toBe(1);
  });
});
