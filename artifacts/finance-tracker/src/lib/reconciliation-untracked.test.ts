// isUntracked — the one case where a gap has a specific, fixable cause.

import { describe, it, expect } from "vitest";
import { isUntracked } from "./reconciliation-insight";

const base = { transactionsCounted: 0, balanceChange: -240, gap: -240 };

describe("isUntracked", () => {
  it("is true when the balance moved and nothing was recorded", () => {
    expect(isUntracked(base)).toBe(true);
  });

  it("is false once any transaction was counted", () => {
    // Even one row means the ledger is being kept; the gap is a discrepancy
    // in it, not an absence of it.
    expect(isUntracked({ ...base, transactionsCounted: 1 })).toBe(false);
  });

  it("is false when the balance did not move", () => {
    expect(isUntracked({ transactionsCounted: 0, balanceChange: 0, gap: 0 })).toBe(false);
  });

  it("is false when the gap is not the whole balance change", () => {
    expect(isUntracked({ ...base, gap: -100 })).toBe(false);
  });

  it("treats sub-half-penny movement as no movement", () => {
    expect(isUntracked({ transactionsCounted: 0, balanceChange: 0.004, gap: 0.004 })).toBe(false);
  });
});
