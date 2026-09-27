import { describe, expect, it } from "vitest";
import { baseMagnitude, incomeExpenseTotals, savingsRatePct, withBaseMagnitudes } from "./tx-magnitude";

// Rows shaped as GET /api/transactions returns them: expense baseEquivalent
// is NEGATIVE (enrichTransaction), income positive.
const rows = [
  { id: 1, type: "income", category: "Salary", baseEquivalent: 100 },
  { id: 2, type: "expense", category: "Groceries", baseEquivalent: -40.45 },
  { id: 3, type: "expense", category: "Transport", baseEquivalent: -2.27 },
  { id: 4, type: "expense", category: "Rent", baseEquivalent: -1200 },
  { id: 5, type: "expense", category: "Travel", baseEquivalent: null },
];

describe("baseMagnitude", () => {
  it("strips the sign and keeps null as null, never 0", () => {
    expect(baseMagnitude(-40.45)).toBe(40.45);
    expect(baseMagnitude(40.45)).toBe(40.45);
    expect(baseMagnitude(null)).toBeNull();
    expect(baseMagnitude(undefined)).toBeNull();
    expect(baseMagnitude(Number.NaN)).toBeNull();
  });
});

describe("withBaseMagnitudes", () => {
  it("returns new rows with unsigned values and leaves the input untouched", () => {
    const out = withBaseMagnitudes(rows);
    expect(out.map((r) => r.baseEquivalent)).toEqual([100, 40.45, 2.27, 1200, null]);
    expect(rows[1].baseEquivalent).toBe(-40.45);
    expect(out[1]).not.toBe(rows[1]);
  });

  it("makes budget spend positive, so a category can go over its limit", () => {
    const spent = withBaseMagnitudes(rows)
      .filter((r) => r.type === "expense" && r.category === "Rent")
      .reduce((s, r) => s + (r.baseEquivalent ?? 0), 0);
    const limit = 1000;
    expect(spent).toBe(1200);
    expect(limit - spent).toBe(-200);
  });

  it("makes 'largest expense' the biggest spend, not the smallest", () => {
    const largest = withBaseMagnitudes(rows)
      .filter((r) => r.type === "expense" && r.baseEquivalent != null)
      .reduce((top, r) => ((r.baseEquivalent ?? 0) > (top.baseEquivalent ?? 0) ? r : top));
    expect(largest.id).toBe(4);
  });
});

describe("incomeExpenseTotals / savingsRatePct", () => {
  it("net savings is income minus spend, never income plus spend", () => {
    const t = incomeExpenseTotals(rows);
    expect(t.income).toBe(100);
    expect(t.expenses).toBeCloseTo(1242.72, 2);
    expect(t.income - t.expenses).toBeCloseTo(-1142.72, 2);
    expect(savingsRatePct(t)).toBeCloseTo(-1142.72, 2);
  });

  it("a month of spend with no income nets negative, with no savings rate", () => {
    const t = incomeExpenseTotals([{ type: "expense", baseEquivalent: -40.45 }]);
    expect(t.income - t.expenses).toBeCloseTo(-40.45, 2);
    expect(savingsRatePct(t)).toBeNull();
  });

  it("gives the same totals whether rows arrive signed or already unsigned", () => {
    expect(incomeExpenseTotals(withBaseMagnitudes(rows))).toEqual(incomeExpenseTotals(rows));
  });
});
