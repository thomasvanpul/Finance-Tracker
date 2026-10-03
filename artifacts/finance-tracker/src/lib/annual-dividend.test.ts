// "EST. ANNUAL DIV £0.00 · no yield" was drawn whenever /portfolio had no
// quotes: offline (market quotes are never persisted, offline-cache.ts) and
// with market data off. Yield comes only from a quote, so with no quotes the
// estimate is unknown, not zero (verify-offline FABRICATED ZEROS, 3 Oct 2026).

import { describe, it, expect } from "vitest";
import { estimatedAnnualDividend } from "./annual-dividend";

const positions = [
  { ticker: "VUSA.L", shares: 10 },
  { ticker: "AAPL", shares: 2 },
];

describe("estimatedAnnualDividend", () => {
  it("is null when no position has a quote — unknown, not £0", () => {
    expect(estimatedAnnualDividend(positions, () => undefined)).toBeNull();
  });

  it("is a real zero when every position is quoted and none pays", () => {
    const quotes = new Map([
      ["VUSA.L", { price: 80, dividendYield: 0 }],
      ["AAPL", { price: 200, dividendYield: null }],
    ]);
    expect(estimatedAnnualDividend(positions, (t) => quotes.get(t))).toEqual({
      total: 0, paying: 0, unquoted: 0,
    });
  });

  it("sums the quoted payers and counts the positions it could not see", () => {
    const quotes = new Map([["VUSA.L", { price: 80, dividendYield: 1.5 }]]);
    expect(estimatedAnnualDividend(positions, (t) => quotes.get(t))).toEqual({
      total: 12, paying: 1, unquoted: 1,
    });
  });
});
