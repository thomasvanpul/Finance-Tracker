// A category taking a large share of the month's spending with no budget on it.
//
// This is the weakest of the four insights considered on 2026-09-07 and it
// only earns the slot because of two guards. Without them it is the classic
// nagging observation: it fires on any month with an unusual expense, says
// something the user already knows, and cannot be made to stop.
//
//   Guard 1 — recurrence. The category must have been spent in during at
//   least 2 of the 3 completed months before this one. A single large
//   purchase is an event, not a pattern, and "you spent a lot on Furniture
//   this month" is not news to the person who bought the sofa. A standing
//   share of spending with no budget on it is a different claim.
//
//   Guard 2 — permanent dismissal. The id is the category and nothing else:
//   no month, no amount. Dismissing it dismisses it for that category for
//   good, because "I know, and I don't want a budget on it" is a complete
//   and permanent answer. Every other insight keys its id on the reading so
//   a materially different one comes back; this one must not.
//
// DESIGN.md §15's test, which is exactly where it is weakest and why the
// guards are load-bearing: it is true; the user can act (set a budget, in
// one tap); it stops (guard 2, permanently); and with guard 1 it is a
// sentence you would say out loud rather than a monthly reminder that
// spending exists.

import type { Insight, InsightContext } from "./spending-insights";
import { categoryTransactionsHref } from "./entity-href";
import { formatMoney } from "./utils";
import type { Transaction } from "@workspace/api-client-react";

// The informational end of the ladder. It is a suggestion, not a warning,
// and it must lose to everything that is telling the user something is wrong.
export const UNBUDGETED_CATEGORY_PRIORITY = 30;

/** Share of the month's expense the category must reach. */
const MIN_SHARE = 0.15;

/** Below this the share is arithmetic on a quiet month, not a finding. */
const MIN_ABSOLUTE_BASE = 100;

/** Completed months looked back over, and how many must contain the category. */
const LOOKBACK_MONTHS = 3;
const MIN_MONTHS_PRESENT = 2;

/** "2026-09-07" → "2026-09". */
function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** The `n` completed months before `now`, most recent first. */
function previousMonths(now: Date, n: number): string[] {
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function unbudgetedCategory(
  txs: readonly Transaction[],
  context: InsightContext,
  now: Date = new Date(),
): Insight | null {
  const budgeted = context.budgetedCategories;
  const history = context.historyTxs;
  // No budget list means the read has not resolved. Treating that as "nothing
  // is budgeted" would fire on every category on every cold start.
  if (budgeted == null || history == null) return null;

  const budgetedLower = new Set(budgeted.map((c) => c.trim().toLowerCase()));

  // This month's expense by category. Rows the API could not price in base
  // are dropped rather than counted as zero (Lock #16).
  const spend = new Map<string, number>();
  let total = 0;
  for (const t of txs) {
    if (t.type !== "expense" || t.baseEquivalent == null) continue;
    const amount = Math.abs(t.baseEquivalent);
    const category = t.category.trim();
    if (category === "") continue;
    spend.set(category, (spend.get(category) ?? 0) + amount);
    total += amount;
  }
  if (total <= 0) return null;

  const lookback = new Set(previousMonths(now, LOOKBACK_MONTHS));
  // Which completed months each category appears in, from the longer window.
  const monthsPresent = new Map<string, Set<string>>();
  for (const t of history) {
    if (t.type !== "expense" || t.baseEquivalent == null) continue;
    const month = monthOf(t.date);
    if (!lookback.has(month)) continue;
    const category = t.category.trim();
    if (category === "") continue;
    if (!monthsPresent.has(category)) monthsPresent.set(category, new Set());
    monthsPresent.get(category)!.add(month);
  }

  const candidates = [...spend.entries()]
    .filter(([category, amount]) =>
      !budgetedLower.has(category.toLowerCase()) &&
      amount >= MIN_ABSOLUTE_BASE &&
      amount / total >= MIN_SHARE &&
      // Guard 1.
      (monthsPresent.get(category)?.size ?? 0) >= MIN_MONTHS_PRESENT)
    .sort((a, b) => b[1] - a[1]);

  const top = candidates[0];
  if (top == null) return null;
  const [category, amount] = top;

  const currency = context.baseCurrency ?? "GBP";
  const share = Math.round((amount / total) * 100);

  return {
    // Guard 2 — the category alone. A dismissal here is permanent by design.
    id: `unbudgeted-category:${category.toLowerCase()}`,
    source: "unbudgeted-category",
    priority: UNBUDGETED_CATEGORY_PRIORITY,
    // InsightSlot nowraps both lines and ellipsises the overflow: roughly 32
    // characters for the headline at its weight, 45 for the body. The first
    // wording ran to 45 and 49 and truncated mid-sentence on the rendered
    // page. The category names itself; the size goes in the body.
    headline: `${category} has no budget`,
    body: `${share}% of spending, ${formatMoney(amount, currency)} this month`,
    // A figure summed from rows opens those rows (DESIGN.md §14), filtered on
    // the category's own exact string so the list is what was summed.
    drillHref: categoryTransactionsHref(category),
  };
}
