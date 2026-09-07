// The projected balance low point, and the three conditions that keep it quiet.

import { describe, it, expect } from "vitest";
import { projectedTrough, PROJECTED_TROUGH_PRIORITY } from "./projected-trough";
import type { InsightContext } from "./spending-insights";
import type { Transaction } from "@workspace/api-client-react";

const NOW = new Date("2026-09-07T09:00:00Z");

let nextId = 1;
function tx(date: string, description: string, type: string, baseEquivalent: number): Transaction {
  return {
    id: nextId++, date, description, type: type as Transaction["type"],
    category: "General", accountId: 1, accountName: "Monzo",
    nativeAmount: baseEquivalent, currency: "GBP", baseEquivalent,
    source: "manual" as Transaction["source"], createdAt: `${date}T00:00:00Z`,
  };
}

/** Six monthly occurrences ending `monthsBack` before the 7th of Sep. */
function monthly(description: string, type: string, amount: number, day: number): Transaction[] {
  const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
  const dd = String(day).padStart(2, "0");
  return months
    .map((m) => `${m}-${dd}`)
    .filter((d) => d <= "2026-09-07")
    .map((d) => tx(d, description, type, amount));
}

// Rent on the 12th, salary on the 28th: the outgoing lands first, which is
// the only arrangement that produces a trough below today's balance.
const SALARY = monthly("Acme Payroll", "income", 3200, 28);
const RENT = monthly("Riverside Lettings", "expense", -1450, 12);

function ctx(over: Partial<InsightContext> = {}): InsightContext {
  return { baseCurrency: "GBP", cashBalanceBase: 1_800, ...over };
}

describe("projectedTrough — when it fires", () => {
  it("reports the low point as a balance and a date, not a calendar gap", () => {
    const insight = projectedTrough([...SALARY, ...RENT], ctx({ cashBalanceBase: 1_500 }), NOW)!;
    expect(insight).not.toBeNull();
    expect(insight.source).toBe("projected-trough");
    expect(insight.priority).toBe(PROJECTED_TROUGH_PRIORITY);
    // Rent takes 1,500 → 50 on 11 Sep, before salary arrives on the 27th.
    expect(insight.headline).toBe("Down to £50.00 on 11 Sep");
    expect(insight.body).toContain("from £1,500.00 now");
    expect(insight.body).toContain("£1,500.00 now");
    // The series the projection is built from are real, and live here.
    expect(insight.drillHref).toBe("/recurring");
  });

  it("keys the id on the level and the date, so a different projection is a new insight", () => {
    const a = projectedTrough([...SALARY, ...RENT], ctx({ cashBalanceBase: 1_500 }), NOW)!;
    const b = projectedTrough([...SALARY, ...RENT], ctx({ cashBalanceBase: 1_600 }), NOW)!;
    expect(a.id).not.toBe(b.id);
    expect(a.id).toContain("2026-09-11");
  });

  it("steps a stale series forward rather than dropping it", () => {
    // A weekly outgoing whose last occurrence was 20 Aug: its next estimate
    // (27 Aug) is already past. Dropping it would understate the outgoings
    // and overstate the trough, so it must be stepped into the window.
    const stale = ["2026-07-02", "2026-07-09", "2026-07-16", "2026-07-23", "2026-07-30", "2026-08-06", "2026-08-13", "2026-08-20"]
      .map((d) => tx(d, "Weekly Gym", "expense", -60));
    const without = projectedTrough([...SALARY, ...RENT], ctx({ cashBalanceBase: 1_500 }), NOW)!;
    const withStale = projectedTrough([...SALARY, ...RENT, ...stale], ctx({ cashBalanceBase: 1_500 }), NOW)!;
    // Stepped in, the gym charges push the low point past the rent date and
    // £180 lower — far enough to cross zero, which is said in words rather
    // than as a minus sign. Dropped, the trough would have stopped at £50.
    expect(without.headline).toBe("Down to £50.00 on 11 Sep");
    expect(withStale.headline).toBe("Overdrawn by £130.00 on 24 Sep");
  });
});

describe("projectedTrough — when it stays silent", () => {
  it("says nothing without a balance to project from", () => {
    expect(projectedTrough([...SALARY, ...RENT], ctx({ cashBalanceBase: null }), NOW)).toBeNull();
    expect(projectedTrough([...SALARY, ...RENT], ctx({ cashBalanceBase: undefined }), NOW)).toBeNull();
  });

  it("says nothing with outgoings but no confident income — condition 1", () => {
    expect(projectedTrough([...RENT], ctx({ cashBalanceBase: 1_500 }), NOW)).toBeNull();
  });

  it("says nothing with income but no confident outgoing — condition 1", () => {
    expect(projectedTrough([...SALARY], ctx({ cashBalanceBase: 1_500 }), NOW)).toBeNull();
  });

  it("says nothing when a series is seen only twice", () => {
    // Measured: two occurrences score 84, comfortably over the confidence
    // floor, because the single interval between two points has no variance.
    // The occurrence gate is what rejects this, not the confidence.
    const thin = [
      tx("2026-07-28", "Acme Payroll", "income", 3200),
      tx("2026-08-28", "Acme Payroll", "income", 3200),
      tx("2026-07-12", "Riverside Lettings", "expense", -1450),
      tx("2026-08-12", "Riverside Lettings", "expense", -1450),
    ];
    expect(projectedTrough(thin, ctx({ cashBalanceBase: 1_500 }), NOW)).toBeNull();
  });

  it("says nothing when the trough clears the comfort line — condition 2", () => {
    // 12,000 − 1,450 = 10,550, comfortably over 2 × 1,450. A dip is not a
    // warning just because it is a dip.
    expect(projectedTrough([...SALARY, ...RENT], ctx({ cashBalanceBase: 12_000 }), NOW)).toBeNull();
  });

  it("fires just below the comfort line and not just above it", () => {
    // Largest outgoing 1,450 → comfort line 2,900. Trough = balance − 1,450
    // at the first rent, before salary. balance 4,360 → trough 2,910 (quiet);
    // balance 4,340 → trough 2,890 (fires).
    expect(projectedTrough([...SALARY, ...RENT], ctx({ cashBalanceBase: 4_360 }), NOW)).toBeNull();
    expect(projectedTrough([...SALARY, ...RENT], ctx({ cashBalanceBase: 4_340 }), NOW)).not.toBeNull();
  });

  it("says nothing when there is nothing to project", () => {
    expect(projectedTrough([], ctx(), NOW)).toBeNull();
  });

  it("counts the payments before the low rather than naming the last one", () => {
    // Naming the last outgoing before the trough attributed a £1,111 low to a
    // £3.85 coffee on the real ledger. The body states how many payments land
    // first, and stays inside InsightSlot's single ~45-character line.
    const insight = projectedTrough([...SALARY, ...RENT], { baseCurrency: "GBP", cashBalanceBase: 900 }, NOW)!;
    expect(insight).not.toBeNull();
    expect(insight.body).toMatch(/^\d+ payments? first, from £900\.00 now$/);
    expect(insight.body.length).toBeLessThanOrEqual(45);
  });

  it("reads the full ledger from context, not the one-month window it is given", () => {
    // MobileHome hands its producers the current month only. Three occurrences
    // of anything are impossible inside one month, so before the context
    // carried the history this producer could never fire on the screen it
    // runs on — measured against the live ledger, 2026-09-07.
    const history = [...SALARY, ...RENT];
    const thisMonth = history.filter((t) => t.date >= "2026-09-01");
    expect(projectedTrough(thisMonth, { baseCurrency: "GBP", cashBalanceBase: 900 }, NOW)).toBeNull();
    expect(
      projectedTrough(thisMonth, { baseCurrency: "GBP", cashBalanceBase: 900, historyTxs: history }, NOW),
    ).not.toBeNull();
  });
});
