// Spending-insight producer pipeline. The screen mounts <InsightSlot />
// which asks this module for the current (top-priority, not dismissed)
// insight for the given transactions + context. Zero producers in this
// commit — the slot exists so subsequent features can wire producers
// without touching SPENDING's layout.
//
// Selection rule, in one place, because "which single thing do we say"
// is the whole design and must not be re-decided in each producer:
//
//   1. Each producer is a pure function (txs, context) → Insight | null.
//   2. Collect all non-null results.
//   3. Sort by priority DESC; tie-break by source alphabetical.
//   4. Filter out any whose id is in the dismissed set.
//   5. The top-1 is returned. If empty, null.
//
// Priority tiers (producers pick within):
//   100  Financial-fact price change on a recurring charge (actionable, urgent)
//   80   Novel recurring detected / heavy-week-ahead
//   60   Day-spend anomaly ≥ 2σ above the user's baseline / debt-by-age
//   40   Category trend (X up ≥ 50% MoM with meaningful base)
//   20   FX alert (a foreign-currency holding has moved enough to matter)
//   0-10 Informational
//
// Dismissal is keyed on Insight.id. Producers construct ids so that a
// NEW phenomenon (Spotify raises price AGAIN next month) gets a new id
// and surfaces; the same phenomenon stays dismissed. Format is a soft
// convention: "producer:subject:kind:timeWindow" e.g.
// "recurring:spotify:price:2026-08".

import type { Transaction, UpcomingItem } from "@workspace/api-client-react";
import { projectedTrough } from "./projected-trough";
import { unbudgetedCategory } from "./unbudgeted-category";

export interface Insight {
  id: string;
  source: string;
  priority: number;
  headline: string;
  body: string;
  action?: { label: string; onTap: () => void };
  /**
   * Where the headline's figure came from (DESIGN.md §14). Set it when the
   * headline is a number the app computed from rows, and the slot renders
   * the headline as a drill into those rows. Leave it undefined when the
   * headline is a statement rather than a total — a drill that opens
   * something the user did not ask about is worse than no drill.
   */
  drillHref?: string;
}

export interface InsightContext {
  baseCurrency: string | null;
  upcomingItems?: readonly UpcomingItem[];
  topPending?: readonly { name: string; amountBase: number; direction: string; daysOutstanding?: number }[];
  /**
   * Total cash in base currency, as the API supplied it. The projected
   * trough needs a level to project from; without it there is no balance
   * to reach a low point, only a running total of outgoings.
   */
  cashBalanceBase?: number | null;
  /**
   * Categories that already carry a budget. Undefined means the budgets read
   * has not resolved — which is NOT the same as "nothing is budgeted", and
   * the unbudgeted-category producer stays silent rather than assume.
   */
  budgetedCategories?: readonly string[];
  /**
   * A longer window than `txs` — enough to cover the completed months a
   * producer needs for a recurrence test. `txs` stays the current period.
   */
  historyTxs?: readonly Transaction[];
  // Kept intentionally sparse. Producers should not need much more
  // than txs + baseCurrency. Add fields here only when a real
  // producer needs them, not speculatively.
}

export type InsightProducer = (
  txs: readonly Transaction[],
  context: InsightContext,
) => Insight | null;

// ── Producers ─────────────────────────────────────────────────────────────────

function isoWeek(d: Date): string {
  // ISO week: YYYY-Www. Simple approximation via day-of-year.
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const diff = d.getTime() - jan4.getTime();
  const week = Math.ceil((diff / 86_400_000 + jan4.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

// Heavy-week-ahead: fires when there are 3+ pending expense items due in
// the next 7 days. ID is stable within a calendar week so a single dismiss
// covers the whole week.
const heavyWeekAhead: InsightProducer = (_txs, context) => {
  const items = context.upcomingItems;
  if (!items || items.length === 0) return null;
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const in7Str = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const upcoming = items.filter(
    (i) => i.type === "expense" && i.status === "pending" && i.dueDate >= todayStr && i.dueDate <= in7Str,
  );
  if (upcoming.length < 3) return null;
  const convertible = upcoming.filter((i) => i.baseEquivalent != null);
  const sym = context.baseCurrency === "GBP" ? "£" : context.baseCurrency === "USD" ? "$" : (context.baseCurrency ?? "") + " ";
  const body =
    convertible.length === upcoming.length && convertible.length > 0
      ? `${sym}${convertible.reduce((s, i) => s + i.baseEquivalent!, 0).toLocaleString("en-GB", { maximumFractionDigits: 0 })} in committed outgoings in the next 7 days.`
      : `${upcoming.length} expenses due in the next 7 days.`;
  return {
    id: `heavy-week:${isoWeek(now)}`,
    source: "heavy-week-ahead",
    priority: 80,
    headline: `${upcoming.length} BILLS DUE THIS WEEK`,
    body,
  };
};

// Debt-by-age: surfaces the oldest they_owe_me debt when it exceeds 30 days.
// ID is keyed to the person's name so dismissal per-person is stable; a
// new debt from the same person after the old one is settled would get a
// different daysOutstanding key and resurface correctly.
const debtByAge: InsightProducer = (_txs, context) => {
  const pending = context.topPending;
  if (!pending || pending.length === 0) return null;
  const old = pending
    .filter((r) => r.direction === "they_owe_me" && (r.daysOutstanding ?? 0) > 30)
    .sort((a, b) => (b.daysOutstanding ?? 0) - (a.daysOutstanding ?? 0));
  if (old.length === 0) return null;
  const r = old[0];
  const days = r.daysOutstanding ?? 0;
  const sym = context.baseCurrency === "GBP" ? "£" : context.baseCurrency === "USD" ? "$" : (context.baseCurrency ?? "") + " ";
  const amtStr = sym + r.amountBase.toLocaleString("en-GB", { maximumFractionDigits: 0 });
  return {
    id: `debt-age:${r.name}`,
    source: "debt-by-age",
    priority: 60,
    headline: `${r.name.toUpperCase()} OWES YOU`,
    body: `${amtStr} outstanding for ${days} days.`,
  };
};

// Register producers here. Order does not matter — selection sorts by priority.
const PRODUCERS: readonly InsightProducer[] = [heavyWeekAhead, debtByAge, projectedTrough, unbudgetedCategory];

// ── dismissal set — localStorage-backed, per-device ──
// Migrates to user_preferences via G20/B when that lands. Until then
// dismissals don't sync across devices, and the storage key is namespaced
// under `nr-` so the eventual migration can find them.
const DISMISSED_KEY = "nr-dismissed-insights";

export function loadDismissedIds(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

export function dismissInsight(id: string): void {
  if (typeof localStorage === "undefined") return;
  const current = loadDismissedIds();
  current.add(id);
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...current]));
  } catch {
    // Storage full or blocked — the insight stays visible this session
    // and any dismissal the user makes doesn't persist. Acceptable.
  }
}

/**
 * Run every producer, sort by (priority DESC, source ASC), filter
 * dismissed, return the top-1 or null. Pure function of its inputs.
 */
// The one ranking rule, shared by every slot. Priority DESC, then source
// ASC so a tie is stable rather than dependent on producer order, then the
// top one — the slot says one thing (DESIGN.md §15).
//
// Exported because not every slot's candidates come from PRODUCERS: WORTH
// builds its two from separate API reads and still has to rank them the
// same way. Duplicating the comparator there is how two slots quietly end
// up with two different ideas of which insight wins.
export function rankInsights(
  candidates: readonly (Insight | null)[],
  dismissedIds: ReadonlySet<string>,
): Insight | null {
  const live = candidates.filter((c): c is Insight => c != null && !dismissedIds.has(c.id));
  if (live.length === 0) return null;
  return [...live].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.source.localeCompare(b.source);
  })[0] ?? null;
}

export function selectInsight(
  txs: readonly Transaction[],
  context: InsightContext,
  dismissedIds: ReadonlySet<string>,
): Insight | null {
  return rankInsights(PRODUCERS.map((p) => p(txs, context)), dismissedIds);
}
