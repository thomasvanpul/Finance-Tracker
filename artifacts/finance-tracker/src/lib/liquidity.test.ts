import { describe, it, expect } from "vitest";
import { isCashType, cashAccountsTotal } from "./liquidity";

describe("liquidity classification", () => {
  it("counts only the `cash` type as cash", () => {
    expect(isCashType("cash")).toBe(true);
    for (const t of ["investment", "pension", "property", "other", "liability"]) {
      expect(isCashType(t)).toBe(false);
    }
  });

  it("excludes a flat, a pension, an ISA and a loan from the cash total", () => {
    // The shape of the seed account that produced "LIQUID ASSETS £203k".
    const accounts = [
      { type: "cash", baseEquivalent: 9000 },
      { type: "cash", baseEquivalent: 2375.18 },
      { type: "property", baseEquivalent: 120000 },
      { type: "pension", baseEquivalent: 50000 },
      { type: "investment", baseEquivalent: 20000 },
      { type: "liability", baseEquivalent: 6800 },
      { type: "other", baseEquivalent: 500 },
    ];
    const r = cashAccountsTotal(accounts);
    expect(r.total).toBeCloseTo(11375.18, 2);
    expect(r.cashAccounts).toBe(2);
    expect(r.unconvertible).toBe(0);
  });

  it("keeps an overdraft negative", () => {
    const r = cashAccountsTotal([
      { type: "cash", baseEquivalent: 500 },
      { type: "cash", baseEquivalent: -120 },
    ]);
    expect(r.total).toBe(380);
  });

  it("counts unconvertible cash accounts instead of treating them as zero", () => {
    const r = cashAccountsTotal([
      { type: "cash", baseEquivalent: 500 },
      { type: "cash", baseEquivalent: null },
      { type: "property", baseEquivalent: null },
    ]);
    expect(r.total).toBe(500);
    expect(r.cashAccounts).toBe(2);
    expect(r.unconvertible).toBe(1);
  });

  it("reports no cash accounts, so a caller can show an empty state rather than £0", () => {
    const r = cashAccountsTotal([{ type: "pension", baseEquivalent: 50000 }]);
    expect(r.cashAccounts).toBe(0);
    expect(r.total).toBe(0);
  });
});
