// How many asset classes the portfolio holds.
//
// A position's class is the user's own assignment (classMap, unassigned →
// "Other"), not a market fact, so the count needs no price. Counting only
// priced positions read "0 · UNDER-DIVERSIFIED" offline and with markets off
// (every position at cost is priceAvailable=false). With no positions there
// is nothing to judge and this returns null. asset-class-count.test.ts.

export interface ClassedPosition {
  id: number;
}

export function assetClassCount(
  positions: readonly ClassedPosition[],
  classOf: (id: number) => string | undefined,
): number | null {
  if (positions.length === 0) return null;
  return new Set(positions.map((p) => classOf(p.id) ?? "Other")).size;
}
