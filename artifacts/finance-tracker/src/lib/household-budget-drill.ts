/**
 * The category a household budget row's drill should carry, or null when no
 * drill can open exactly the rows its Spent figure summed.
 *
 * /family-finance sums this month's expense rows whose category matches the
 * budget's case-insensitively (a null category counts as "Uncategorised"),
 * because the budget's category is typed free-hand. /transactions filters on
 * the exact string. So the drill carries the one spelling the summed rows
 * share; with several spellings, or null rows among them, any single filter
 * would open a subset, and the figure stays undrilled (DESIGN.md §14).
 */
export interface BudgetDrillTx {
  category: string | null;
  date: string | null;
  type: string;
}

export function householdBudgetDrillCategory(
  budgetCategory: string,
  transactions: readonly BudgetDrillTx[],
  month: string,
): string | null {
  const key = budgetCategory.toLowerCase();
  const spellings = new Set<string | null>();
  for (const t of transactions) {
    if (t.type !== "expense" || (t.date ?? "").slice(0, 7) !== month) continue;
    if ((t.category ?? "Uncategorised").toLowerCase() !== key) continue;
    spellings.add(t.category);
  }
  if (spellings.size === 0) return budgetCategory;
  if (spellings.size > 1) return null;
  const [only] = spellings;
  return only ?? null;
}
