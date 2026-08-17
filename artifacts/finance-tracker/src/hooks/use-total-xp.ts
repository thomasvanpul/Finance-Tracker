// F5 · composed XP total.
//
// Sums the four earning events:
//   1. Learn topics (localStorage — getLearnXP)
//   2. Auto-categorisation rules (localStorage — getCatRulesXP)
//   3. Reached savings goals (API — useListGoals)
//   4. Successfully-synced providers (API — useListConnections)
//
// If either API query hasn't loaded yet, its contribution is
// treated as 0. That means a level threshold that requires
// event-3 or event-4 XP flickers into view on hydration — which
// is the honest UX: we don't have the data yet, so we don't claim
// the XP. When the query resolves the total ticks up.
//
// The four earning events + their per-event amounts are the
// mechanic. Every rule of the form "if user did X, +N XP" lives
// in learn-xp.ts as an XP_PER_* constant, grepable and
// countable. There is no earning event that reads a transaction
// count, a spend total, a debt magnitude, a session count, a
// streak, or the calendar day.

import { useListGoals, useListConnections } from "@workspace/api-client-react";
import {
  getMaintenanceLocalXP,
  XP_PER_COMPLETED_GOAL,
  XP_PER_SYNCED_PROVIDER,
} from "@/lib/learn-xp";

export interface XPBreakdown {
  total: number;
  learnAndRules: number;
  completedGoals: number;
  syncedProviders: number;
}

export function useTotalXP(): XPBreakdown {
  const { data: goals = [] } = useListGoals();
  const { data: connections = [] } = useListConnections();

  const localXP = getMaintenanceLocalXP();

  // A goal is "reached" when its current >= target. Values are
  // strings in the API (numeric column serialised); parseFloat
  // handles the conversion. Deleting + recreating the goal
  // resets its XP contribution to 0 until it completes again,
  // per the "XP is derived from state" rule.
  const completedGoalsCount = goals.filter((g) => {
    const current = parseFloat(String(g.current));
    const target = parseFloat(String(g.target));
    return Number.isFinite(current) && Number.isFinite(target) && target > 0 && current >= target;
  }).length;
  const completedGoalsXP = completedGoalsCount * XP_PER_COMPLETED_GOAL;

  // First successful sync per provider. lastSyncedAt is nullable;
  // a connection that never synced (still pending) contributes 0.
  // Re-adding the same provider does not re-earn: connections is
  // uniquely indexed on (userId, provider) so there's only ever
  // one row per provider per user.
  const syncedProvidersCount = connections.filter((c) => c.lastSyncedAt != null).length;
  const syncedProvidersXP = syncedProvidersCount * XP_PER_SYNCED_PROVIDER;

  const total = localXP + completedGoalsXP + syncedProvidersXP;

  return {
    total,
    learnAndRules: localXP,
    completedGoals: completedGoalsXP,
    syncedProviders: syncedProvidersXP,
  };
}
