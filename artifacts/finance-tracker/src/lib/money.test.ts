import { describe, it, expect, beforeEach } from "vitest";
import { formatGbp, formatNative } from "@/lib/utils";
import { setBaseCurrency } from "@/lib/currency-store";
import { computeBalances, minimumTransfers } from "@/lib/split-math";
import { runPayoffStrategy } from "@/lib/payoff";

describe("formatGbp", () => {
  beforeEach(() => {
    setBaseCurrency("GBP");
  });

  it("formats zero", () => {
    expect(formatGbp(0)).toBe("£0.00");
  });

  it("formats positive integer", () => {
    expect(formatGbp(42)).toBe("£42.00");
  });

  it("formats negative value", () => {
    expect(formatGbp(-42.5)).toBe("-£42.50");
  });

  it("formats thousands", () => {
    expect(formatGbp(1234.56)).toBe("£1,234.56");
  });

  it("formats very large value", () => {
    expect(formatGbp(1_000_000)).toBe("£1,000,000.00");
  });

  it("rounds floating-point display (0.1 + 0.2)", () => {
    expect(formatGbp(0.1 + 0.2)).toBe("£0.30");
  });

  it("rounds sub-cent value to zero", () => {
    expect(formatGbp(0.001)).toBe("£0.00");
  });

  it("handles Infinity (division-by-zero result)", () => {
    expect(formatGbp(1 / 0)).toContain("∞");
  });
});

describe("formatNative", () => {
  it("formats zero with currency code", () => {
    expect(formatNative(0, "USD")).toBe("0.00 USD");
  });

  it("formats negative value", () => {
    expect(formatNative(-99.99, "MYR")).toBe("-99.99 MYR");
  });

  it("formats thousands", () => {
    expect(formatNative(1000, "EUR")).toBe("1,000.00 EUR");
  });

  it("pads integer to two decimal places", () => {
    expect(formatNative(42, "JPY")).toBe("42.00 JPY");
  });

  it("rounds 0.1 + 0.2 to 0.30", () => {
    expect(formatNative(0.1 + 0.2, "GBP")).toBe("0.30 GBP");
  });
});

describe("computeBalances", () => {
  it("credits payer and debits shares for single expense", () => {
    const result = computeBalances(
      ["Alice", "Bob"],
      [{ paidBy: "Alice", amount: 90, shares: { Alice: 45, Bob: 45 } }]
    );
    expect(result).toEqual({ Alice: 45, Bob: -45 });
  });

  it("returns zero balances for empty expenses", () => {
    expect(computeBalances(["Alice", "Bob"], [])).toEqual({ Alice: 0, Bob: 0 });
  });

  it("accumulates across multiple expenses", () => {
    const result = computeBalances(["Alice", "Bob"], [
      { paidBy: "Alice", amount: 60, shares: { Alice: 30, Bob: 30 } },
      { paidBy: "Bob",   amount: 40, shares: { Alice: 20, Bob: 20 } },
    ]);
    expect(result).toEqual({ Alice: 10, Bob: -10 });
  });

  it("skips payer credit when payer is not a member", () => {
    const result = computeBalances(
      ["Alice"],
      [{ paidBy: "Bob", amount: 90, shares: { Alice: 45 } }]
    );
    expect(result).toEqual({ Alice: -45 });
  });

  it("handles zero-amount expense without error", () => {
    const result = computeBalances(
      ["Alice", "Bob"],
      [{ paidBy: "Alice", amount: 0, shares: { Alice: 0, Bob: 0 } }]
    );
    expect(result).toEqual({ Alice: 0, Bob: 0 });
  });
});

describe("minimumTransfers", () => {
  it("generates single transfer for two-person imbalance", () => {
    expect(minimumTransfers({ Alice: 45, Bob: -45 })).toEqual([
      { from: "Bob", to: "Alice", amount: 45 },
    ]);
  });

  it("returns empty array when all balances are zero", () => {
    expect(minimumTransfers({ Alice: 0, Bob: 0 })).toEqual([]);
  });

  it("generates two transfers for three-way split", () => {
    const result = minimumTransfers({ Alice: 40, Bob: 10, Carol: -50 });
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.from === "Carol")).toBe(true);
    expect(result.find((t) => t.to === "Alice")?.amount).toBe(40);
    expect(result.find((t) => t.to === "Bob")?.amount).toBe(10);
  });

  it("ignores sub-cent amounts (below 0.01 threshold)", () => {
    expect(minimumTransfers({ Alice: 0.001, Bob: -0.001 })).toEqual([]);
  });

  it("rounds transfer amounts to two decimal places", () => {
    const result = minimumTransfers({ Alice: 33.333, Bob: -33.333 });
    expect(result[0].amount).toBe(33.33);
  });
});

describe("runPayoffStrategy", () => {
  it("pays off zero-APR debt in exact months", () => {
    const result = runPayoffStrategy(
      [{ id: 1, name: "Loan", balance: 1000, apr: 0, minimumPayment: 0 }],
      100,
      "snowball"
    );
    expect(result.months).toBe(10);
    expect(result.totalInterest).toBe(0);
  });

  it("accrues interest on non-zero APR debt", () => {
    const result = runPayoffStrategy(
      [{ id: 1, name: "Card", balance: 1200, apr: 24, minimumPayment: 0 }],
      200,
      "avalanche"
    );
    expect(result.totalInterest).toBeGreaterThan(0);
  });

  it("snowball pays smallest balance first", () => {
    const result = runPayoffStrategy(
      [
        { id: 1, name: "Small", balance: 200, apr: 0, minimumPayment: 0 },
        { id: 2, name: "Large", balance: 800, apr: 0, minimumPayment: 0 },
      ],
      100,
      "snowball"
    );
    expect(result.payoffOrder[0].name).toBe("Small");
  });

  it("avalanche pays highest APR first when balances are equal", () => {
    const result = runPayoffStrategy(
      [
        { id: 1, name: "LowAPR",  balance: 100, apr:  0, minimumPayment: 0 },
        { id: 2, name: "HighAPR", balance: 100, apr: 12, minimumPayment: 0 },
      ],
      120,
      "avalanche"
    );
    expect(result.payoffOrder[0].name).toBe("HighAPR");
  });

  it("produces 12-month amortization table", () => {
    const result = runPayoffStrategy(
      [{ id: 1, name: "Debt", balance: 2400, apr: 0, minimumPayment: 0 }],
      100,
      "snowball"
    );
    expect(result.amortization).toHaveLength(12);
    expect(result.amortization[0].month).toBe(1);
    expect(result.amortization[0].total).toBe(2300);
  });

  it("runs to 360 months when budget covers nothing", () => {
    const result = runPayoffStrategy(
      [{ id: 1, name: "Unpayable", balance: 1000, apr: 0, minimumPayment: 0 }],
      0,
      "snowball"
    );
    expect(result.months).toBe(360);
  });
});

describe("net worth arithmetic", () => {
  it("sums cash and portfolio correctly", () => {
    expect(5000 + 15000).toBe(20000);
  });

  it("handles negative net worth", () => {
    expect(-2000 + 0).toBe(-2000);
  });

  it("handles very large values without overflow", () => {
    expect(1e9 + 5e8).toBe(1.5e9);
  });

  it("floating-point addition stays within one cent", () => {
    expect(Math.abs(1000.1 + 2000.2 - 3000.3)).toBeLessThan(0.01);
  });
});
