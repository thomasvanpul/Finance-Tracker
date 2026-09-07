// The unbudgeted large-share category, and the two guards it needs to earn a slot.

import { describe, it, expect } from "vitest";
import { unbudgetedCategory, UNBUDGETED_CATEGORY_PRIORITY } from "./unbudgeted-category";
import type { InsightContext } from "./spending-insights";
import type { Transaction } from "@workspace/api-client-react";

const NOW = new Date("2026-09-07T09:00:00Z");

let nextId = 1;
function tx(date: string, category: string, baseEquivalent: number, type = "expense"): Transaction {
  return {
    id: nextId++, date, description: category, type: type as Transaction["type"],
    category, accountId: 1, accountName: "Monzo",
    nativeAmount: baseEquivalent, currency: "GBP", baseEquivalent,
    source: "manual" as Transaction["source"], createdAt: `${date}T00:00:00Z`,
  };
}

// This month: Eating out is 400 of 1,000 — 40%, unbudgeted.
const THIS_MONTH = [
  tx("2026-09-02", "Eating out", -400),
  tx("2026-09-03", "Groceries", -350),
  tx("2026-09-04", "Transport", -250),
];

// Eating out present in Aug and Jul: two of the three completed months.
const HISTORY = [
  ...THIS_MONTH,
  tx("2026-08-11", "Eating out", -380),
  tx("2026-07-14", "Eating out", -410),
  tx("2026-08-11", "Groceries", -300),
];

function ctx(over: Partial<InsightContext> = {}): InsightContext {
  return { baseCurrency: "GBP", budgetedCategories: ["Groceries"], historyTxs: HISTORY, ...over };
}

describe("unbudgetedCategory — when it fires", () => {
  it("names the category, its share, and opens exactly the rows it summed", () => {
    const insight = unbudgetedCategory(THIS_MONTH, ctx(), NOW)!;
    expect(insight).not.toBeNull();
    expect(insight.priority).toBe(UNBUDGETED_CATEGORY_PRIORITY);
    expect(insight.headline).toBe("Eating out has no budget");
    expect(insight.body).toBe("40% of spending, £400.00 this month");
    expect(insight.drillHref).toBe("/transactions?category=Eating+out");
  });

  it("keys the id on the category alone, so a dismissal is permanent — guard 2", () => {
    const insight = unbudgetedCategory(THIS_MONTH, ctx(), NOW)!;
    expect(insight.id).toBe("unbudgeted-category:eating out");
    // No month and no amount in the id: next month's larger figure produces
    // the same id and stays dismissed.
    expect(insight.id).not.toMatch(/2026|400/);
  });

  it("treats a budget as covering its category whatever the casing", () => {
    expect(unbudgetedCategory(THIS_MONTH, ctx({ budgetedCategories: ["Groceries", "eating OUT"] }), NOW)).toBeNull();
  });

  it("picks the largest qualifying category when several qualify", () => {
    const wide = [tx("2026-09-02", "Eating out", -400), tx("2026-09-03", "Travel", -500), tx("2026-09-04", "Groceries", -100)];
    const history = [...wide,
      tx("2026-08-11", "Eating out", -380), tx("2026-07-14", "Eating out", -410),
      tx("2026-08-11", "Travel", -480), tx("2026-07-14", "Travel", -520)];
    const insight = unbudgetedCategory(wide, ctx({ historyTxs: history }), NOW)!;
    expect(insight.headline).toContain("Travel");
  });
});

describe("unbudgetedCategory — when it stays silent", () => {
  it("says nothing while the budgets read is unresolved", () => {
    // Not the same as "nothing is budgeted" — assuming that fires on every
    // category on every cold start.
    expect(unbudgetedCategory(THIS_MONTH, ctx({ budgetedCategories: undefined }), NOW)).toBeNull();
  });

  it("says nothing without the history to test recurrence against", () => {
    expect(unbudgetedCategory(THIS_MONTH, ctx({ historyTxs: undefined }), NOW)).toBeNull();
  });

  it("says nothing about a one-off, however large — guard 1", () => {
    // A sofa: 40% of the month, and not seen in any earlier month.
    const oneOff = [tx("2026-09-02", "Furniture", -400), tx("2026-09-03", "Groceries", -350), tx("2026-09-04", "Transport", -250)];
    expect(unbudgetedCategory(oneOff, ctx({ historyTxs: oneOff }), NOW)).toBeNull();
  });

  it("says nothing when the category appears in only one earlier month", () => {
    const thin = [...THIS_MONTH, tx("2026-08-11", "Eating out", -380)];
    expect(unbudgetedCategory(THIS_MONTH, ctx({ historyTxs: thin }), NOW)).toBeNull();
  });

  it("says nothing about a category that is already budgeted", () => {
    expect(unbudgetedCategory(THIS_MONTH, ctx({ budgetedCategories: ["Groceries", "Eating out"] }), NOW)).toBeNull();
  });

  it("says nothing about a small share", () => {
    const spread = [
      tx("2026-09-02", "Eating out", -400), tx("2026-09-03", "Groceries", -3000), tx("2026-09-04", "Rent", -1500),
    ];
    expect(unbudgetedCategory(spread, ctx({ historyTxs: [...spread, ...HISTORY] }), NOW)).toBeNull();
  });

  it("says nothing on a quiet month where the share is arithmetic", () => {
    // 40% of £150 is £60 — a real share of nothing much.
    const quiet = [tx("2026-09-02", "Eating out", -60), tx("2026-09-03", "Groceries", -90)];
    expect(unbudgetedCategory(quiet, ctx({ historyTxs: [...quiet, ...HISTORY] }), NOW)).toBeNull();
  });

  it("ignores income and rows the API could not price", () => {
    const unpriced = { ...tx("2026-09-05", "Eating out", -900), baseEquivalent: null };
    const mixed = [...THIS_MONTH, unpriced, tx("2026-09-06", "Salary", 3000, "income")];
    const insight = unbudgetedCategory(mixed, ctx(), NOW)!;
    // Still 400 of 1,000 — the unpriced £900 was dropped, not counted as zero
    // and not counted at face value.
    expect(insight.headline).toBe("Eating out has no budget");
  });

  it("says nothing when there is no expense at all", () => {
    expect(unbudgetedCategory([tx("2026-09-06", "Salary", 3000, "income")], ctx(), NOW)).toBeNull();
  });

  it("keeps both lines inside what InsightSlot renders", () => {
    // Both lines nowrap and ellipsise; the first wording truncated mid-word
    // on the rendered page. 32 for the headline, 45 for the body.
    const insight = unbudgetedCategory(THIS_MONTH, ctx(), NOW)!;
    expect(insight.headline.length).toBeLessThanOrEqual(32);
    expect(insight.body.length).toBeLessThanOrEqual(45);
  });
});
