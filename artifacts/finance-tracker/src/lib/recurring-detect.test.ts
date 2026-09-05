import { describe, it, expect } from "vitest";
import { detectRecurring } from "./recurring-detect";

function monthly(description: string, amounts: number[]) {
  return amounts.map((baseEquivalent, i) => ({
    date: `2026-0${i + 1}-15`,
    description,
    type: "expense",
    category: "Subscriptions",
    baseEquivalent,
  }));
}

describe("detectRecurring", () => {
  it("treats negatively stored outflows as magnitudes", () => {
    const [p] = detectRecurring(monthly("Spotify", [-3.85, -3.85, -3.85, -3.85]));
    expect(p).toBeDefined();
    expect(p.estimatedAmount).toBe(3.85);
    expect(p.confidence).toBeGreaterThan(0);
    expect(p.confidence).toBeLessThanOrEqual(100);
  });

  it("never reports a confidence above 100 for any sign mix", () => {
    const patterns = detectRecurring([
      ...monthly("Netflix", [-12.99, 12.99, -12.99, 12.99, -12.99, 12.99]),
      ...monthly("Gym", [40, 40, 40, 40, 40, 40]),
    ]);
    expect(patterns).toHaveLength(2);
    for (const p of patterns) {
      expect(p.confidence).toBeLessThanOrEqual(100);
      expect(p.estimatedAmount).toBeGreaterThan(0);
    }
  });

  it("rejects a group whose amounts vary by more than 10%", () => {
    expect(detectRecurring(monthly("Groceries", [-50, -80, -30, -100]))).toHaveLength(0);
    expect(detectRecurring(monthly("Groceries", [50, 80, 30, 100]))).toHaveLength(0);
  });

  it("ignores income and single occurrences", () => {
    const income = monthly("Salary", [2500, 2500, 2500]).map((t) => ({ ...t, type: "income" }));
    const once = monthly("Dentist", [90]);
    expect(detectRecurring([...income, ...once])).toHaveLength(0);
  });
});
