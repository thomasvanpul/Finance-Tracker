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
//   80   Novel recurring detected
//   60   Day-spend anomaly ≥ 2σ above the user's baseline
//   40   Category trend (X up ≥ 50% MoM with meaningful base)
//   20   FX alert (a foreign-currency holding has moved enough to matter)
//   0-10 Informational
//
// Dismissal is keyed on Insight.id. Producers construct ids so that a
// NEW phenomenon (Spotify raises price AGAIN next month) gets a new id
// and surfaces; the same phenomenon stays dismissed. Format is a soft
// convention: "producer:subject:kind:timeWindow" e.g.
// "recurring:spotify:price:2026-08".

import type { Transaction } from "@workspace/api-client-react";

export interface Insight {
  id: string;
  source: string;
  priority: number;
  headline: string;
  body: string;
  action?: { label: string; onTap: () => void };
}

export interface InsightContext {
  baseCurrency: string | null;
  // Kept intentionally sparse. Producers should not need much more
  // than txs + baseCurrency. Add fields here only when a real
  // producer needs them, not speculatively.
}

export type InsightProducer = (
  txs: readonly Transaction[],
  context: InsightContext,
) => Insight | null;

// Register producers here. Empty in this commit. The features that
// follow SPENDING land add entries (recurring-detector, novel-
// subscription, big-day) — each is imported and added to the array.
const PRODUCERS: readonly InsightProducer[] = [];

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
export function selectInsight(
  txs: readonly Transaction[],
  context: InsightContext,
  dismissedIds: ReadonlySet<string>,
): Insight | null {
  const candidates: Insight[] = [];
  for (const p of PRODUCERS) {
    const result = p(txs, context);
    if (result != null && !dismissedIds.has(result.id)) candidates.push(result);
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.source.localeCompare(b.source);
  });
  return candidates[0] ?? null;
}
