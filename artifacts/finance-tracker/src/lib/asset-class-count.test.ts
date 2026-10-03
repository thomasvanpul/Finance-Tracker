// "ASSET CLASSES 0 · UNDER-DIVERSIFIED" was drawn whenever /portfolio had no
// priced position: offline, or markets off with every position at cost. The
// count was taken over priceAvailable positions only, so missing prices read
// as a diversification verdict. A position's class is the user's own
// assignment (classMap), not a market fact, so the count needs no price.

import { describe, it, expect } from "vitest";
import { assetClassCount } from "./asset-class-count";

describe("assetClassCount", () => {
  it("counts the classes held even when no position is priced", () => {
    const positions = [
      { id: 1, priceAvailable: false },
      { id: 2, priceAvailable: false },
      { id: 3, priceAvailable: false },
    ];
    const classes: Record<number, string> = { 1: "Equity", 2: "Bond", 3: "Equity" };
    expect(assetClassCount(positions, (id) => classes[id])).toBe(2);
  });

  it("counts an unpriced position's class alongside priced ones", () => {
    const positions = [
      { id: 1, priceAvailable: true },
      { id: 2, priceAvailable: false },
    ];
    const classes: Record<number, string> = { 1: "Equity", 2: "Crypto" };
    expect(assetClassCount(positions, (id) => classes[id])).toBe(2);
  });

  it("puts an unassigned position under Other", () => {
    const positions = [{ id: 1, priceAvailable: true }, { id: 2, priceAvailable: true }];
    expect(assetClassCount(positions, () => undefined)).toBe(1);
  });

  it("is null with no positions — nothing held is not a verdict", () => {
    expect(assetClassCount([], () => undefined)).toBeNull();
  });
});
