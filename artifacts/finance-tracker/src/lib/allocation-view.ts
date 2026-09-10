// What the allocation surfaces SAY, derived once from the response.
//
// Two surfaces read GET /allocation: one figure on the phone's SPENDING
// screen, the figure plus its reasoning on the desktop dashboard. Neither
// recomputes any arithmetic — that is the server's, deliberately (see
// routes/allocation.ts). But both have to turn `status`, `blockers` and
// `driftDays` into a sentence, and two sentences written twice is the same
// class of defect as two implementations of the number: they disagree, and
// nothing catches it.
//
// So the wording lives here, as pure functions over the response, and the
// components render what these return.
//
// Nothing in this file invents a figure. When the engine withholds
// dailyAllowance there is no partial number here either — the engine has
// none to give (allocation.ts: "There is deliberately no drift-free
// allowance for the first week"), and manufacturing one on the client would
// be exactly the optimistic number the engine exists to avoid.

import type { AllocationResult } from "@workspace/api-client-react";

// Days in a month, matching DAYS_PER_MONTH in the engine (365.25/12) so a
// per-day claim converted back to a monthly rate here states the same
// monthly figure the engine divided.
const DAYS_PER_MONTH = 365.25 / 12;

export type AllowanceState =
  // The number. Nothing else in this union carries one.
  | { kind: "figure"; value: number }
  // Not blocked, just early: the drift sample is shorter than the floor and
  // gets one day longer per day. This is the state EVERY new account is in
  // for its first week — snapshots cannot be backfilled.
  | { kind: "waiting"; daysSoFar: number; daysNeeded: number; resolvesOn: string | null }
  // Something is missing that time will not fix on its own.
  | { kind: "blocked"; reason: string; fix: string | null };

export function addDays(date: string, days: number): string {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// "2026-09-14" → "the 14th". The blocker copy names a day the user can hold
// against a calendar, which is what the Mobile Amendment's ban on
// manufactured urgency asks for: a real date, not a countdown.
export function ordinalDay(iso: string): string {
  const day = +iso.slice(8, 10);
  const rem100 = day % 100;
  const suffix =
    rem100 >= 11 && rem100 <= 13 ? "th"
    : day % 10 === 1 ? "st"
    : day % 10 === 2 ? "nd"
    : day % 10 === 3 ? "rd"
    : "th";
  return `the ${day}${suffix}`;
}

// The order matters. A user with no cash account and too little history has
// two problems, and the one they can act on today is the one to state.
// drift-insufficient-history is last because it is the only blocker that
// resolves by itself.
const BLOCKER_COPY: Record<string, { reason: string; fix: string | null }> = {
  "no-cash-accounts": {
    reason: "No cash account to spend from.",
    fix: "Add one, or set an existing account's type to cash.",
  },
  "cash-unconvertible": {
    reason: "One of your cash balances has no exchange rate today.",
    fix: "The figure returns when the rate does.",
  },
  "upcoming-unconvertible": {
    reason: "An upcoming payment has no exchange rate today.",
    fix: "The figure returns when the rate does.",
  },
  "drift-unconvertible": {
    reason: "Your balance history has no exchange rate today.",
    fix: "The figure returns when the rate does.",
  },
};

const BLOCKER_ORDER = [
  "no-cash-accounts",
  "cash-unconvertible",
  "upcoming-unconvertible",
  "drift-unconvertible",
  "drift-insufficient-history",
];

export function allowanceState(a: AllocationResult): AllowanceState {
  if (a.dailyAllowance != null) return { kind: "figure", value: a.dailyAllowance };

  const ranked = BLOCKER_ORDER.filter((b) => a.blockers.includes(b as never));
  const first = ranked[0];

  if (first === "drift-insufficient-history") {
    // driftDays is 0 when reconciliation found no complete baseline at all
    // (reconciliation.ts:162) — there is no run of history to project a
    // finish date from, so none is promised. One is only offered once the
    // count is actually climbing.
    const resolvesOn = a.driftDays >= 1 && a.minDriftDays > a.driftDays
      ? addDays(a.today, a.minDriftDays - a.driftDays)
      : null;
    return {
      kind: "waiting",
      daysSoFar: a.driftDays,
      daysNeeded: a.minDriftDays,
      resolvesOn,
    };
  }

  const copy = first != null ? BLOCKER_COPY[first] : undefined;
  return {
    kind: "blocked",
    reason: copy?.reason ?? "Not enough information to work this out yet.",
    fix: copy?.fix ?? null,
  };
}

// The one line the waiting state says. Kept here rather than in two
// components because the phone and the desktop must not describe the same
// wait differently.
export function waitingLine(s: Extract<AllowanceState, { kind: "waiting" }>): string {
  const history = `${s.daysSoFar} of ${s.daysNeeded} days of history`;
  return s.resolvesOn == null
    ? `${history} — your allowance appears once there is a week of it`
    : `${history} — your allowance appears on ${ordinalDay(s.resolvesOn)}`;
}

// ── Goals ───────────────────────────────────────────────────────────────────

export interface GoalClaimView {
  id: number;
  name: string;
  perDay: number;
  claimedOverWindow: number;
  // True for a deadline that has passed: the whole remainder is claimed at
  // once (allocation.ts, goalClaim). Startling, and correct — so it is
  // labelled rather than smoothed.
  overdue: boolean;
  daysOverdue: number | null;
  // The one place this UI adds meaning the API does not. A goal can state a
  // monthly contribution AND carry a deadline, and the engine lets the
  // deadline win. Showing only the winner turns the user's own stated figure
  // into a surprise; showing both makes it a decision they can see.
  statedMonthly: number | null;
  deadlineNeedsMonthly: number | null;
}

export function goalClaimViews(
  a: AllocationResult,
  goals: readonly { id: number; monthlyContribution?: string | number | null }[],
): GoalClaimView[] {
  const stated = new Map<number, number>();
  for (const g of goals) {
    const raw = g.monthlyContribution;
    const n = raw == null ? null : typeof raw === "number" ? raw : parseFloat(raw);
    if (n != null && Number.isFinite(n) && n > 0) stated.set(g.id, n);
  }

  return a.goalClaims.map((c) => {
    const overdue = c.daysRemaining != null && c.daysRemaining <= 0;
    const monthly = stated.get(c.id) ?? null;
    // Only meaningful where the deadline is what set the rate. On a
    // monthly-contribution claim the two figures are the same claim stated
    // twice, and on an overdue goal the "rate" is the whole remainder due
    // now, which is not a monthly anything.
    const deadlineNeedsMonthly =
      c.basis === "deadline" && !overdue ? c.perDay * DAYS_PER_MONTH : null;
    return {
      id: c.id,
      name: c.name,
      perDay: c.perDay,
      claimedOverWindow: c.claimedOverWindow,
      overdue,
      daysOverdue: overdue && c.daysRemaining != null ? -c.daysRemaining : null,
      statedMonthly: monthly,
      deadlineNeedsMonthly,
    };
  });
}

// A goal whose deadline demands more per month than the user said they would
// put in. The threshold is £1 rather than 0 so a rounding difference does not
// present itself as a disagreement.
export function contributionGap(g: GoalClaimView): { stated: number; needed: number } | null {
  if (g.statedMonthly == null || g.deadlineNeedsMonthly == null) return null;
  if (Math.abs(g.deadlineNeedsMonthly - g.statedMonthly) < 1) return null;
  return { stated: g.statedMonthly, needed: g.deadlineNeedsMonthly };
}
