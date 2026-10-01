// The household budget table on /family-finance sums this month's expense
// rows whose category matches the budget's case-insensitively, because the
// budget's category is typed free-hand. /transactions filters on the exact
// string. A drill carrying the budget's own spelling could therefore open a
// strict subset of the rows the Spent figure summed (finding 2b3626cea0ae).
// The drill must carry the exact category the summed rows hold, and must not
// exist when no single string selects all of them.

import { describe, it, expect } from "vitest";
import { householdBudgetDrillCategory, type BudgetDrillTx } from "./household-budget-drill";

const MONTH = "2026-10";
const tx = (category: string | null, date = "2026-10-05", type = "expense"): BudgetDrillTx =>
  ({ category, date, type });

describe("householdBudgetDrillCategory", () => {
  it("carries the rows' own spelling when the budget was typed in another case", () => {
    const txs = [tx("Groceries"), tx("Groceries")];
    expect(householdBudgetDrillCategory("groceries", txs, MONTH)).toBe("Groceries");
  });

  it("returns null when the summed rows span more than one spelling", () => {
    const txs = [tx("Groceries"), tx("groceries")];
    expect(householdBudgetDrillCategory("Groceries", txs, MONTH)).toBeNull();
  });

  it("returns null when uncategorised rows were summed under an 'Uncategorised' budget", () => {
    // The tally files a null category as "uncategorised"; the ledger cannot
    // select null rows by that string.
    const txs = [tx(null), tx("Uncategorised")];
    expect(householdBudgetDrillCategory("Uncategorised", txs, MONTH)).toBeNull();
  });

  it("ignores rows the figure did not sum: other months and non-expense rows", () => {
    const txs = [
      tx("Groceries"),
      tx("groceries", "2026-09-30"),
      tx("GROCERIES", "2026-10-02", "income"),
    ];
    expect(householdBudgetDrillCategory("groceries", txs, MONTH)).toBe("Groceries");
  });

  it("keeps the budget's spelling when nothing matched, so the ledger is empty like the £0 figure", () => {
    expect(householdBudgetDrillCategory("Childcare", [tx("Groceries")], MONTH)).toBe("Childcare");
  });
});
