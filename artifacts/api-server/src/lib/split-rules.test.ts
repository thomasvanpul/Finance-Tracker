// Split-rule tests. The remainder-pence rule is the whole feature —
// most of these tests are for that rule, on inputs designed to
// exercise it. If any of these break, the shared-ledger arithmetic
// is no longer trustworthy and F4 stops.

import { describe, it, expect } from "vitest";
import { splitEqual, splitExact, splitShares } from "./split-rules";

function sum(xs: number[]): number {
  // Sum in integer pence to avoid float-error in the assertion
  // itself. If we asserted 8.20 + 8.20 + 8.21 === 24.61 in float,
  // we'd fail on 0.0000000001 drift.
  const pence = xs.reduce((s, x) => s + Math.round(x * 100), 0);
  return pence / 100;
}

describe("splitEqual", () => {
  it("splits an exact-divisor amount evenly", () => {
    const r = splitEqual(30, 3);
    expect(r.amounts).toEqual([10, 10, 10]);
    expect(sum(r.amounts)).toBe(30);
  });

  it("gives remainder pence to earliest participants — £10 / 3", () => {
    const r = splitEqual(10, 3);
    expect(r.amounts).toEqual([3.34, 3.33, 3.33]);
    expect(sum(r.amounts)).toBe(10);
  });

  it("gives remainder pence to earliest participants — £24.61 / 3", () => {
    const r = splitEqual(24.61, 3);
    expect(r.amounts).toEqual([8.21, 8.20, 8.20]);
    expect(sum(r.amounts)).toBe(24.61);
  });

  it("degenerate £0.01 / 3 — one person pays 1p, two pay 0", () => {
    const r = splitEqual(0.01, 3);
    expect(r.amounts).toEqual([0.01, 0, 0]);
    expect(sum(r.amounts)).toBe(0.01);
  });

  it("degenerate £0 / n — everyone owes 0", () => {
    const r = splitEqual(0, 4);
    expect(r.amounts).toEqual([0, 0, 0, 0]);
  });

  it("single participant carries the whole total", () => {
    const r = splitEqual(17.77, 1);
    expect(r.amounts).toEqual([17.77]);
  });

  it("rejects n <= 0", () => {
    expect(() => splitEqual(10, 0)).toThrow(/positive integer/);
    expect(() => splitEqual(10, -1)).toThrow(/positive integer/);
  });

  it("rejects non-integer n", () => {
    expect(() => splitEqual(10, 2.5)).toThrow(/positive integer/);
  });

  it("rejects non-finite total", () => {
    expect(() => splitEqual(NaN, 3)).toThrow(/finite/);
    expect(() => splitEqual(Infinity, 3)).toThrow(/finite/);
  });
});

describe("splitExact", () => {
  it("returns the amounts unchanged when they sum to total", () => {
    const r = splitExact(24.61, [8.21, 8.20, 8.20]);
    expect(r.amounts).toEqual([8.21, 8.20, 8.20]);
    expect(sum(r.amounts)).toBe(24.61);
  });

  it("rejects amounts that sum to less than the total", () => {
    expect(() => splitExact(30, [10, 10, 9])).toThrow(/sum to 29\.00, expected 30\.00/);
  });

  it("rejects amounts that sum to more than the total", () => {
    expect(() => splitExact(30, [10, 10, 11])).toThrow(/sum to 31\.00, expected 30\.00/);
  });

  it("rejects an off-by-one-penny miss (the whole point)", () => {
    // A £10 total split as 3.33 + 3.33 + 3.33 is 9.99, not 10 —
    // this is the "quiet unfairness" case F4 called out.
    expect(() => splitExact(10, [3.33, 3.33, 3.33])).toThrow(/sum to 9\.99, expected 10\.00/);
  });

  it("rejects negative amounts", () => {
    expect(() => splitExact(10, [5, -2, 7])).toThrow(/non-negative/);
  });

  it("rejects an empty array", () => {
    expect(() => splitExact(10, [])).toThrow(/at least one/);
  });
});

describe("splitShares", () => {
  it("integer-clean shares [2,1,1] on £10 — no remainder", () => {
    const r = splitShares(10, [2, 1, 1]);
    expect(r.amounts).toEqual([5.00, 2.50, 2.50]);
    expect(sum(r.amounts)).toBe(10);
  });

  it("equal shares [1,1,1] on £10 — remainder to biggest, tiebreak insertion order", () => {
    // All shares are equal (1), so the tiebreak rules — the first
    // participant gets the extra penny.
    const r = splitShares(10, [1, 1, 1]);
    expect(r.amounts).toEqual([3.34, 3.33, 3.33]);
    expect(sum(r.amounts)).toBe(10);
  });

  it("weighted shares [3,1,1] on £24.61 — remainder to biggest share", () => {
    // 24.61 × 3/5 = 14.766 → 14.76 (base)
    // 24.61 × 1/5 = 4.922  → 4.92  (base) × 2 = 9.84
    // allocated = 14.76 + 9.84 = 24.60. remainder = 0.01 → to
    // index 0 (share=3, the biggest).
    const r = splitShares(24.61, [3, 1, 1]);
    expect(r.amounts).toEqual([14.77, 4.92, 4.92]);
    expect(sum(r.amounts)).toBe(24.61);
  });

  it("2p remainder distributed across the two biggest shares", () => {
    // £1.00 × [3, 3, 1, 1] / 8 shares
    //   base = floor(100 × 3/8) = 37p × 2 = 74
    //   base = floor(100 × 1/8) = 12p × 2 = 24
    //   allocated = 74 + 24 = 98. remainder = 2p.
    // Ranked by share DESC then index ASC: [0, 1, 2, 3].
    // Top 2 (positions 0, 1) each get +1p.
    const r = splitShares(1, [3, 3, 1, 1]);
    expect(r.amounts).toEqual([0.38, 0.38, 0.12, 0.12]);
    expect(sum(r.amounts)).toBe(1);
  });

  it("zero share is legal — participant on the ledger, owes 0", () => {
    const r = splitShares(10, [1, 1, 0]);
    // 10 / 2 shares = £5 each on the two 1-shares; 0-share owes 0.
    expect(r.amounts).toEqual([5, 5, 0]);
    expect(sum(r.amounts)).toBe(10);
  });

  it("rejects negative shares", () => {
    expect(() => splitShares(10, [1, -1, 2])).toThrow(/non-negative/);
  });

  it("rejects non-integer shares", () => {
    expect(() => splitShares(10, [1, 1.5, 1])).toThrow(/non-negative integers/);
  });

  it("rejects all-zero shares (total shares = 0)", () => {
    expect(() => splitShares(10, [0, 0, 0])).toThrow(/total shares must be > 0/);
  });

  it("rejects an empty shares array", () => {
    expect(() => splitShares(10, [])).toThrow(/at least one share/);
  });
});

describe("cross-rule invariant — every split sums exactly to total", () => {
  // A property-style test on a small grid. If any of these fail
  // the split arithmetic has lost the sum invariant.
  const totals = [0, 0.01, 0.03, 10, 24.61, 99.99, 100, 100.05, 1000.01];
  const ns = [1, 2, 3, 4, 5, 7, 10];

  it("splitEqual: sum matches total for every (total, n)", () => {
    for (const t of totals) {
      for (const n of ns) {
        const r = splitEqual(t, n);
        expect(sum(r.amounts)).toBe(t);
      }
    }
  });

  it("splitShares: sum matches total for [1,1,...,1] every (total, n)", () => {
    for (const t of totals) {
      for (const n of ns) {
        const shares = new Array(n).fill(1);
        const r = splitShares(t, shares);
        expect(sum(r.amounts)).toBe(t);
      }
    }
  });
});
