import { describe, it, expect } from "vitest";
import { computeHoldings } from "./MobileHome";

describe("computeHoldings — categorises from account.type (no residual)", () => {
  it("sums per bucket by account type and adds portfolio to invested", () => {
    const h = computeHoldings({
      accountBreakdown: [
        { type: "cash",       baseEquivalent: 12260 },
        { type: "cash",       baseEquivalent:  4004 },
        { type: "investment", baseEquivalent:   690 },
        { type: "pension",    baseEquivalent:  7300 },
        { type: "property",   baseEquivalent: 94600 },
        { type: "other",      baseEquivalent:   150 },
      ],
      portfolio: { totalValueGbp: 8380 },
    });
    expect(h).toEqual({
      cash: 16264,
      investment: 690 + 8380,
      pension: 7300,
      property: 94600,
      other: 150,
    });
  });

  it("no accounts and no portfolio produces zeros in every bucket", () => {
    expect(computeHoldings(null)).toEqual({
      cash: 0, investment: 0, pension: 0, property: 0, other: 0,
    });
    expect(computeHoldings(undefined)).toEqual({
      cash: 0, investment: 0, pension: 0, property: 0, other: 0,
    });
  });

  it("cash-only wallet has cash and nothing else", () => {
    const h = computeHoldings({
      accountBreakdown: [
        { type: "cash", baseEquivalent: 12260 },
      ],
    });
    expect(h).toEqual({
      cash: 12260, investment: 0, pension: 0, property: 0, other: 0,
    });
  });

  it("portfolio positions alone still populate invested", () => {
    const h = computeHoldings({
      portfolio: { totalValueGbp: 8380 },
    });
    expect(h.investment).toBe(8380);
    expect(h.cash).toBe(0);
    expect(h.property).toBe(0);
  });

  it("investment-typed account and portfolio positions both feed invested", () => {
    // A brokerage account itself (uninvested cash) is 'investment' typed;
    // the positions it holds live in the investments table and surface via
    // portfolio.totalValueGbp. Both add to the same visual bucket.
    const h = computeHoldings({
      accountBreakdown: [
        { type: "investment", baseEquivalent: 690 },
      ],
      portfolio: { totalValueGbp: 8380 },
    });
    expect(h.investment).toBe(9070);
  });

  it("does not compute a residual from netWorth minus cash minus portfolio", () => {
    // Regression: earlier implementation used
    //   residual = netWorth - totalCash - portfolio
    // and labelled the result OTHER, which lied under mortgages, untracked
    // pensions and empty accounts alike. The new shape has no netWorth or
    // totalCash inputs at all — only the categorised breakdown.
    const h = computeHoldings({
      accountBreakdown: [
        { type: "cash",     baseEquivalent: 12260 },
        { type: "property", baseEquivalent: 94600 },
      ],
      portfolio: { totalValueGbp: 8380 },
    });
    // Property is what the DB says, not what's left over after subtracting.
    expect(h.property).toBe(94600);
    expect(h.other).toBe(0);
  });
});
