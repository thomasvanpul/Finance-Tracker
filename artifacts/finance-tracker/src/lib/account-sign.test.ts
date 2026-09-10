import { describe, it, expect } from "vitest";
import { isLiabilityType, signedAccountAmount, netAccountsTotal } from "./account-sign";

describe("account-sign", () => {
  it("leaves an asset amount alone", () => {
    expect(signedAccountAmount("cash", 6800)).toBe(6800);
    expect(signedAccountAmount("investment", 6800)).toBe(6800);
    expect(signedAccountAmount("pension", 6800)).toBe(6800);
    expect(signedAccountAmount("property", 6800)).toBe(6800);
    expect(signedAccountAmount("other", 6800)).toBe(6800);
  });

  it("negates a liability, which the API stores as a positive magnitude", () => {
    expect(signedAccountAmount("liability", 6800)).toBe(-6800);
  });

  it("passes null through so an unconvertible account keeps its dash", () => {
    // formatBaseMoney(null) is "—". Coercing to 0 here would reintroduce the
    // fabricated zero Lock #16 exists to prevent.
    expect(signedAccountAmount("liability", null)).toBeNull();
    expect(signedAccountAmount("cash", null)).toBeNull();
  });

  it("keeps an overdraft negative rather than flipping it", () => {
    // A negative balance on a `cash` account is an overdraft, not a
    // liability — the type is what carries the sign, never the sign itself.
    expect(signedAccountAmount("cash", -120)).toBe(-120);
  });

  it("nets a liability out of a mixed total", () => {
    const accounts = [
      { type: "cash", baseEquivalent: 11375.28 },
      { type: "property", baseEquivalent: 190000 },
      { type: "liability", baseEquivalent: 6800 },
    ];
    // Summing baseEquivalent directly gives 208,175.28 — the defect this
    // module replaces. The loan is owed, so it comes off.
    expect(netAccountsTotal(accounts)).toBeCloseTo(194575.28, 2);
  });

  it("skips accounts with no base equivalent", () => {
    const accounts = [
      { type: "cash", baseEquivalent: 100 },
      { type: "cash", baseEquivalent: null },
      { type: "liability", baseEquivalent: null },
    ];
    expect(netAccountsTotal(accounts)).toBe(100);
  });

  it("names only `liability` as a liability", () => {
    expect(isLiabilityType("liability")).toBe(true);
    for (const t of ["cash", "investment", "pension", "property", "other"]) {
      expect(isLiabilityType(t)).toBe(false);
    }
  });
});
