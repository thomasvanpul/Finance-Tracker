import { describe, it, expect } from "vitest";
import { computeHoldings } from "./MobileHome";

describe("computeHoldings — OTHER block guard", () => {
  it("residual > 0 exposes OTHER with the residual value", () => {
    const h = computeHoldings({
      netWorth: 118238.66,
      totalCash: 12260,
      portfolio: { totalValueGbp: 8380 },
    });
    expect(h.showOther).toBe(true);
    expect(h.other).toBeCloseTo(97598.66, 2);
    expect(h.liquid).toBe(12260);
    expect(h.invested).toBe(8380);
    expect(h.pension).toBeNull();
  });

  it("residual === 0 suppresses OTHER", () => {
    const h = computeHoldings({
      netWorth: 20640,
      totalCash: 12260,
      portfolio: { totalValueGbp: 8380 },
    });
    expect(h.showOther).toBe(false);
    expect(h.other).toBe(0);
    // LIQUID and INVESTED still pass through unchanged
    expect(h.liquid).toBe(12260);
    expect(h.invested).toBe(8380);
  });

  it("negative residual (e.g. mortgage exceeds tracked assets) suppresses OTHER", () => {
    const h = computeHoldings({
      netWorth: 5000,
      totalCash: 12260,
      portfolio: { totalValueGbp: 8380 },
    });
    expect(h.showOther).toBe(false);
    expect(h.other).toBe(0);
  });

  it("missing dashboard produces zeros and no OTHER", () => {
    expect(computeHoldings(null)).toEqual({
      liquid: 0,
      invested: 0,
      other: 0,
      pension: null,
      showOther: false,
    });
    expect(computeHoldings(undefined)).toEqual({
      liquid: 0,
      invested: 0,
      other: 0,
      pension: null,
      showOther: false,
    });
  });

  it("missing portfolio field treats it as zero", () => {
    const h = computeHoldings({ netWorth: 12260, totalCash: 12260 });
    expect(h.invested).toBe(0);
    expect(h.showOther).toBe(false);
  });

  it("cash-only account has liquid but no other and no invested", () => {
    const h = computeHoldings({
      netWorth: 12260,
      totalCash: 12260,
      portfolio: { totalValueGbp: 0 },
    });
    expect(h).toEqual({
      liquid: 12260,
      invested: 0,
      other: 0,
      pension: null,
      showOther: false,
    });
  });
});
