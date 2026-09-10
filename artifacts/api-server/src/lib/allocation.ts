// The allocation engine — one number: what can be spent today.
//
// Not "what did I spend". A forward-looking daily allowance over a rolling
// window, moved by four inputs and nothing else:
//
//   1. Committed outgoings  — pending `upcoming` expense rows in the window,
//      which since 04c84e5 include rows generated from subscription rules.
//   2. Dated expected income — pending `upcoming` income rows in the window.
//      A date, not an average.
//   3. Goals as a dated claim — a goal is not a progress bar. It is £X/day
//      between now and its deadline, and that money is spoken for.
//   4. Observed drift       — the reconciliation gap (lib/reconciliation.ts).
//      Balance movement the ledger does not explain.
//
// Input 4 is the one that stops this being a commodity feature. Sub-threshold
// spending does not cancel out: fifteen unlogged coffees is £50 in ONE
// direction, so a naive safe-to-spend drifts optimistic, which is the
// dangerous direction to be wrong in. The engine therefore discounts itself
// by measured drift and can say "£40 unaccounted for, so I have reduced
// today's allowance by £6".
//
// ONE NUMBER. `dailyAllowance` is the output. Everything else in the result
// is the decomposition of that number, so the desktop can show the reasoning
// and the phone can show the figure, from one computation. Nothing here is a
// second headline figure, and adding one is how this becomes five widgets and
// stops being distinctive.
//
// Pure: every input, including the FX conversion, is passed in — so the
// arithmetic is asserted by tests rather than by comment. Same shape as
// computeReconciliation and computeNetWorth.

// The window. 30 days matches the window committedOut already uses at
// dashboard.ts:400 and upcoming.ts:70, so the two figures are talking about
// the same obligations rather than two overlapping sets.
export const HORIZON_DAYS = 30;

// The shortest observed period the drift term will extrapolate from.
//
// driftReduction multiplies gapBase/days by a 30-day horizon, so a short
// sample is not merely noisy — it is amplified by 30/days. What the code did
// before this constant: computeReconciliation reports `insufficient` only
// when there is NO complete baseline date strictly before today
// (reconciliation.ts:169-171), so ONE qualifying snapshot day was enough and
// the worst case was a 30x projection of a single day. On the seed account,
// measured 2026-09-11, driftDays was 4 — a 7.5x projection, and snapshots
// cannot be backfilled (schema/account-balance-snapshots.ts:41-43), so every
// real user passes through that on day five.
//
// SEVEN, on this basis: the movement drift measures — untracked card taps,
// cash withdrawals, hand-corrected balances — is weekly-periodic. A sample
// shorter than seven days does not contain each weekday once, so gapBase/days
// estimates a WEEKDAY-SPECIFIC rate and calls it a daily one. That is bias,
// not noise, and no amount of rounding fixes it. Seven days is the shortest
// window where the mean is of the thing it claims to be the mean of. It caps
// the projection at 4.3x as a consequence, not as the reason.
//
// The error is deliberately on the LOW side, against the instinct that a
// bigger floor is a safer floor. Two reasons:
//
//   1. Short-sample noise cannot push this number in the dangerous
//      direction. driftReduction honours only a NEGATIVE per-day gap — an
//      unexplained increase is never read as headroom — so a noisy sample can
//      only make the allowance smaller. The optimistic direction is the one
//      that hurts a user, and the drift term structurally cannot go there.
//
//   2. Below the floor the cost is not a slightly-wrong number, it is NO
//      number: dailyAllowance is null and the whole figure is withheld. At 14
//      the engine's headline is absent for a user's first fortnight; at 30,
//      for their first month. That is precisely the period in which someone
//      decides whether this app is worth keeping, and the floor is served in
//      real time, once, with no way to shorten it.
//
// What seven does NOT buy: a single mis-keyed balance correction inside the
// week still projects at 4.3x. That is real, and it is why the floor is not
// lower. It is not an argument for 14 — the amplification does not vanish at
// any floor below 30, and since the term is a DISCOUNT, over-discounting is
// the safe error and under-sampling it is not.
export const MIN_DRIFT_DAYS = 7;

// Days in a year, for turning a monthly contribution into a daily claim.
// 365.25/12 rather than 30, so twelve monthly contributions claim exactly a
// year rather than 360 days' worth.
const DAYS_PER_MONTH = 365.25 / 12;

export type Convert = (amount: number, from: string, to: string) => Promise<number | null>;

export interface AllocationAccountInput {
  id: number;
  name: string;
  currency: string;
  balance: number;
}

// A pending dated obligation or receipt. `type` is the upcoming row's own
// "income" | "expense"; anything else is ignored rather than guessed at.
export interface AllocationUpcomingInput {
  id: number;
  dueDate: string; // YYYY-MM-DD
  description: string;
  type: string;
  nativeAmount: number;
  currency: string;
}

// Goals carry no currency column (lib/db/src/schema/goals.ts). `target` and
// `current` are bare numerics. They are therefore read as ALREADY IN BASE
// CURRENCY, which is what every existing goal surface assumes. Stated here
// because it is an assumption, not a fact the schema enforces.
export interface AllocationGoalInput {
  id: number;
  name: string;
  target: number;
  current: number;
  deadline: string | null; // YYYY-MM-DD, or null
  monthlyContribution: number | null;
}

// The measured gap, already in base currency, as computeReconciliation
// returns it. `null` gapBase with an "ok" status means every cash account was
// unconvertible; `insufficient` means there is not yet enough snapshot
// history to measure anything.
export interface AllocationDriftInput {
  status: "ok" | "insufficient";
  gapBase: number | null;
  days: number;
  periodFrom: string | null;
}

export interface AllocationInput {
  today: string; // YYYY-MM-DD, server-local
  baseCurrency: string;
  horizonDays?: number;
  cashAccounts: AllocationAccountInput[];
  upcoming: AllocationUpcomingInput[];
  goals: AllocationGoalInput[];
  drift: AllocationDriftInput;
  convert: Convert;
}

// Why a leg could not be computed. Each maps to a concrete missing input, so
// a caller can say what is wrong rather than showing a shrug.
export type AllocationBlocker =
  | "no-cash-accounts"
  | "cash-unconvertible"
  | "upcoming-unconvertible"
  | "drift-insufficient-history"
  | "drift-unconvertible";

export interface AllocationGoalClaim {
  id: number;
  name: string;
  remaining: number;
  deadline: string | null;
  daysRemaining: number | null;
  perDay: number;
  claimedOverWindow: number;
  basis: "deadline" | "monthly-contribution";
}

export interface AllocationResult {
  // "ok"      — every leg known; dailyAllowance is a number.
  // "unknown" — a leg could not be computed; dailyAllowance is null and
  //             `blockers` names why. There is deliberately NO second,
  //             partial figure to fall back to: a safe-to-spend that quietly
  //             drops its drift term is exactly the optimistic number this
  //             engine exists to avoid.
  status: "ok" | "unknown";
  blockers: AllocationBlocker[];
  baseCurrency: string;
  today: string;
  horizonDays: number;
  windowEnd: string;

  // THE NUMBER.
  dailyAllowance: number | null;

  // Its decomposition, in base currency, over the window.
  availableNow: number | null;
  expectedIncome: number | null;
  committedOut: number | null;
  goalClaim: number | null;
  driftReduction: number | null;

  // Provenance for the legs above.
  goalClaims: AllocationGoalClaim[];
  goalsWithoutClaim: number;
  cashAccountsCounted: number;
  cashAccountsUnconvertible: number;
  upcomingCounted: number;
  upcomingUnconvertible: number;
  driftGapBase: number | null;
  driftPerDay: number | null;
  driftDays: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// A goal's claim on future income, per day.
//
// Two bases, in this order:
//
//   deadline            — remaining / days until the deadline. A nearer
//                         deadline claims MORE per day, which is the property
//                         the tests pin.
//   monthly-contribution — the user stated a monthly figure and no date. That
//                         is still a real claim, so it is honoured at
//                         contribution/DAYS_PER_MONTH.
//
// A goal with neither claims nothing. That is not a fabrication — an undated
// goal with no stated contribution makes no claim on any particular day — but
// it does make the allowance more generous, so the count is reported.
//
// A deadline in the past or today claims the whole remainder immediately:
// the money is due now, not spread. A goal already met claims nothing.
export function goalClaim(goal: AllocationGoalInput, today: string, horizonDays: number): AllocationGoalClaim | null {
  const remaining = Math.max(0, goal.target - goal.current);
  if (remaining === 0) return null;

  if (goal.deadline != null && /^\d{4}-\d{2}-\d{2}$/.test(goal.deadline)) {
    const daysRemaining = daysBetween(today, goal.deadline);
    if (daysRemaining <= 0) {
      // Overdue or due today. The whole remainder is claimed now; spreading
      // it over a negative number of days would flip the sign and hand the
      // user an allowance INCREASE for missing a savings deadline.
      return {
        id: goal.id, name: goal.name, remaining, deadline: goal.deadline,
        daysRemaining, perDay: remaining, claimedOverWindow: remaining, basis: "deadline",
      };
    }
    const perDay = remaining / daysRemaining;
    // Only the part of the goal that falls inside the window is claimed
    // against this window's spending.
    const claimedOverWindow = perDay * Math.min(horizonDays, daysRemaining);
    return {
      id: goal.id, name: goal.name, remaining, deadline: goal.deadline,
      daysRemaining, perDay, claimedOverWindow, basis: "deadline",
    };
  }

  if (goal.monthlyContribution != null && goal.monthlyContribution > 0) {
    const perDay = goal.monthlyContribution / DAYS_PER_MONTH;
    // Never claim more than is left to save.
    const claimedOverWindow = Math.min(remaining, perDay * horizonDays);
    return {
      id: goal.id, name: goal.name, remaining, deadline: null,
      daysRemaining: null, perDay, claimedOverWindow, basis: "monthly-contribution",
    };
  }

  return null;
}

// Drift's contribution to the allowance, as a POSITIVE reduction.
//
// The gap is signed: negative means money left the account that the ledger
// cannot explain, positive means money arrived that it cannot explain.
// Only the negative direction is honoured. An unexplained INCREASE is not
// evidence of headroom — it is just as likely to be a mis-keyed balance —
// and treating it as headroom would make the number more optimistic on worse
// data, which is the one thing this term exists to prevent.
export function driftReduction(gapBase: number, days: number, horizonDays: number): number {
  if (days <= 0) return 0;
  const perDay = gapBase / days;
  if (perDay >= 0) return 0;
  return -perDay * horizonDays;
}

export async function computeAllocation(input: AllocationInput): Promise<AllocationResult> {
  const { today, baseCurrency, cashAccounts, upcoming, goals, drift, convert } = input;
  const horizonDays = input.horizonDays ?? HORIZON_DAYS;
  const windowEnd = addDays(today, horizonDays);
  const blockers: AllocationBlocker[] = [];

  // Leg 1 — liquid cash now. Cash accounts only, the same filter
  // computeReconciliation uses, so market movement on an investment account
  // cannot present itself as spendable.
  let availableNow: number | null = 0;
  let cashUnconvertible = 0;
  for (const account of cashAccounts) {
    const converted = await convert(account.balance, account.currency, baseCurrency);
    if (converted == null) { cashUnconvertible += 1; continue; }
    if (availableNow != null) availableNow += converted;
  }
  if (cashAccounts.length === 0) blockers.push("no-cash-accounts");
  if (cashUnconvertible > 0) { blockers.push("cash-unconvertible"); availableNow = null; }

  // Legs 2 and 3 — dated income and dated commitments inside the window.
  let expectedIncome: number | null = 0;
  let committedOut: number | null = 0;
  let upcomingCounted = 0;
  let upcomingUnconvertible = 0;
  for (const item of upcoming) {
    if (item.dueDate < today || item.dueDate > windowEnd) continue;
    if (item.type !== "income" && item.type !== "expense") continue;
    const converted = await convert(item.nativeAmount, item.currency, baseCurrency);
    if (converted == null) { upcomingUnconvertible += 1; continue; }
    upcomingCounted += 1;
    if (item.type === "income") { if (expectedIncome != null) expectedIncome += converted; }
    else if (committedOut != null) committedOut += converted;
  }
  if (upcomingUnconvertible > 0) {
    blockers.push("upcoming-unconvertible");
    expectedIncome = null;
    committedOut = null;
  }

  // Leg 4 — goals. Never unknown: a goal that makes no dated claim is
  // counted, not guessed at.
  const goalClaims: AllocationGoalClaim[] = [];
  let goalsWithoutClaim = 0;
  for (const goal of goals) {
    const claim = goalClaim(goal, today, horizonDays);
    if (claim == null) { goalsWithoutClaim += 1; continue; }
    goalClaims.push(claim);
  }
  const goalClaimTotal = goalClaims.reduce((sum, c) => sum + c.claimedOverWindow, 0);

  // Leg 5 — observed drift.
  //
  // Two ways to have no drift term, reported as the same blocker because they
  // are the same thing to a reader: there is not enough history to say. Either
  // reconciliation found no complete baseline at all, or it found one too
  // recent to extrapolate from (see MIN_DRIFT_DAYS).
  //
  // Below the floor the term does not apply AT ALL, rather than applying with
  // a caveat attached. A confidence marker would still let the noisy number
  // reach the figure a user acts on, and per this engine's existing rule an
  // unknown leg makes the total unknown — so dailyAllowance goes null and the
  // blocker says why. There is deliberately no drift-free allowance for the
  // first week: that is the partial figure this engine does not have.
  const driftSampleTooShort = drift.status === "ok" && drift.days < MIN_DRIFT_DAYS;
  let driftReductionBase: number | null;
  if (drift.status === "insufficient" || driftSampleTooShort) {
    blockers.push("drift-insufficient-history");
    driftReductionBase = null;
  } else if (drift.gapBase == null) {
    blockers.push("drift-unconvertible");
    driftReductionBase = null;
  } else {
    driftReductionBase = driftReduction(drift.gapBase, drift.days, horizonDays);
  }

  // driftGapBase and driftDays stay populated below the floor: an observed gap
  // over a known number of days is a FACT, and /accounts/reconciliation
  // reports it as one without extrapolating. driftPerDay is the extrapolation,
  // and it is the number that must not reach a screen — a rate derived from
  // four days is the thing the floor exists to withhold.
  const driftPerDay = drift.gapBase != null && drift.days > 0 && !driftSampleTooShort
    ? drift.gapBase / drift.days
    : null;

  // Written as one narrowing expression rather than a `known` boolean so the
  // compiler, not a comment, is what guarantees no null reaches the
  // arithmetic. round2 always returns a number, so `dailyAllowance != null`
  // is exactly "every leg was known".
  const dailyAllowance =
    cashAccounts.length > 0 &&
    availableNow != null &&
    expectedIncome != null &&
    committedOut != null &&
    driftReductionBase != null
      ? round2((availableNow + expectedIncome - committedOut - goalClaimTotal - driftReductionBase) / horizonDays)
      : null;
  const known = dailyAllowance != null;

  return {
    status: known ? "ok" : "unknown",
    blockers,
    baseCurrency,
    today,
    horizonDays,
    windowEnd,
    dailyAllowance,
    availableNow: availableNow == null ? null : round2(availableNow),
    expectedIncome: expectedIncome == null ? null : round2(expectedIncome),
    committedOut: committedOut == null ? null : round2(committedOut),
    goalClaim: round2(goalClaimTotal),
    driftReduction: driftReductionBase == null ? null : round2(driftReductionBase),
    goalClaims: goalClaims.map((c) => ({
      ...c,
      remaining: round2(c.remaining),
      perDay: round2(c.perDay),
      claimedOverWindow: round2(c.claimedOverWindow),
    })),
    goalsWithoutClaim,
    cashAccountsCounted: cashAccounts.length - cashUnconvertible,
    cashAccountsUnconvertible: cashUnconvertible,
    upcomingCounted,
    upcomingUnconvertible,
    driftGapBase: drift.gapBase == null ? null : round2(drift.gapBase),
    driftPerDay: driftPerDay == null ? null : round2(driftPerDay),
    driftDays: drift.days,
  };
}
