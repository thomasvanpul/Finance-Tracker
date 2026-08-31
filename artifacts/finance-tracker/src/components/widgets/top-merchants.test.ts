// Bug 1 regression: sign-blind sort/rank on signed sums.
//
// Before 31 Aug, rankMerchants summed signed baseEquivalent values
// (expense rows carry negative signs from enrichTransaction) and
// then sorted DESC. With all values negative, DESC ordered them by
// LEAST-NEGATIVE first — i.e. the smallest expenses at the top.
// The desktop "Top Merchants" widget was displaying the smallest
// merchants as "top" for months. Rent at −£925 ranked below
// Spotify at −£11.99.
//
// This test locks the fix by asserting the INVERSION: on a data
// shape where the sign-blind ranking would have produced Spotify
// first and Rent last, the correct ranking now produces Rent first.
// A regression that reintroduced the sign confusion would flip
// the order and fail this test.

import { describe, it, expect } from "vitest";

// Re-implementing rankMerchants via a dynamic import to keep the
// public surface small. The function isn't exported today; we
// import via type-only source-reading pattern would be brittle,
// so this test reads the sorted+reduced output through the same
// contract by calling into a copy of the fixed logic. The commit
// that ships this test also EXPORTS rankMerchants so the test
// can call it directly.
import { __rankMerchantsForTest as rankMerchants } from "./top-merchants";

describe("rankMerchants — Bug 1 regression: sign-blind sort would show smallest as top", () => {
  // Fixture chosen so the failure mode is unmistakable:
  //   Rent      → largest true spend (£925)
  //   Groceries → medium (£140)
  //   Spotify   → smallest (£11.99)
  //
  // If the code accidentally summed signed baseEquivalent (expense
  // rows carry negative baseEquivalent) and sorted DESC, the order
  // would flip to Spotify, Groceries, Rent. The test asserts the
  // correct order and inspects the numeric magnitudes to catch the
  // subtler variant where sort is right but the sums are still
  // signed (would show up as negative totals).
  const fixture = [
    { description: "Rent", baseEquivalent: -925.0 },
    { description: "Rent", baseEquivalent: -0.0 },     // second-tx-same-merchant sanity
    { description: "Groceries", baseEquivalent: -80.5 },
    { description: "Groceries", baseEquivalent: -60.0 },
    { description: "Spotify", baseEquivalent: -11.99 },
  ];

  it("places the largest-spend merchant first, not the smallest", () => {
    const ranked = rankMerchants(fixture);
    expect(ranked[0].name).toBe("Rent");
    expect(ranked[1].name).toBe("Groceries");
    expect(ranked[2].name).toBe("Spotify");
  });

  it("returns positive magnitudes, not signed negatives", () => {
    const ranked = rankMerchants(fixture);
    for (const row of ranked) {
      expect(row.total).toBeGreaterThan(0);
    }
    expect(ranked[0].total).toBeCloseTo(925.0, 2);
    expect(ranked[1].total).toBeCloseTo(140.5, 2);
    expect(ranked[2].total).toBeCloseTo(11.99, 2);
  });

  it("skips unconvertible transactions rather than fabricating a zero", () => {
    // A merchant with only an unconvertible tx should NOT appear
    // in the ranking as a £0 entry — that's the fabricated-zero
    // shape Lock #16 catches. It should be absent entirely.
    const withUnconvertible = [
      ...fixture,
      { description: "UnknownFX", baseEquivalent: null },
      { description: "UnknownFX", baseEquivalent: null },
    ];
    const ranked = rankMerchants(withUnconvertible);
    expect(ranked.find((m) => m.name === "UnknownFX")).toBeUndefined();
  });
});
