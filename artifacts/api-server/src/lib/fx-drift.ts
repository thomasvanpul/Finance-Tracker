// FX-only drift — how much of an account's change in base value was the
// exchange rate rather than the user.
//
// `/accounts` shows a balance and `/net-worth` shows a movement, and neither
// says "this movement is not yours". For a foreign-currency account that has
// not been touched in weeks, the whole change in base value is the rate
// moving, and that can be the largest single thing to happen to a net worth
// in a month. Numeris knows it and has never said it.
//
// The decomposition, per account, between a baseline snapshot and now:
//
//   base_then = balance_then × rate_then
//   base_now  = balance_now  × rate_now
//
//   fxDeltaBase       = balance_then × (rate_now − rate_then)
//   activityDeltaBase = (balance_now − balance_then) × rate_now
//   totalDeltaBase    = fxDeltaBase + activityDeltaBase = base_now − base_then
//
// The split is exact: expand the two products and the cross terms cancel.
// `fxDeltaBase` prices the balance the user already held at the rate move;
// `activityDeltaBase` prices what they added or removed at today's rate.
// Attributing the money they moved at today's rate rather than at the rate on
// the day they moved it is a deliberate simplification, and it is the
// conservative one — it keeps every penny of the rate move in the FX term,
// which is the term the insight is about, and never inflates it.
//
// ── What this must never do ────────────────────────────────────────────────
//
// **No snapshot, no claim.** The baseline rate comes out of
// `account_balance_snapshots.native_to_base_rate`, recorded at capture time.
// Where there is no snapshot for an account, or its stored rate is null, the
// account is reported as unmeasurable and contributes nothing — it is NEVER
// re-derived by applying today's rate backwards. Doing that would fabricate
// the exact number the insight exists to report: the difference between the
// two rates would be zero by construction, and a real drift would read as
// "no drift". CLAUDE.md's hardest constraint is that no figure is shown the
// API did not supply, and a rate the app invented for a past date is exactly
// that.
//
// **All account types, unlike reconciliation.** The reconciliation gap filters
// to `type = 'cash'` so market movement does not swamp the signal. This does
// the opposite on purpose: a property or a pension held in a foreign currency
// is where FX drift is largest, and excluding it would exclude the whole
// point. A market-priced position is a different thing again and is not an
// account, so nothing here touches it.
//
// Pure: everything it needs is passed in, so the arithmetic is testable
// without a database and without an FX provider.

export interface FxDriftAccountInput {
  id: number;
  name: string;
  currency: string;
  type: string;
  /** Native balance now. */
  balance: number;
  /**
   * Native-to-base rate now, or null when FX for this currency is
   * unavailable. A base-currency account is rate 1 and always available.
   */
  currentRate: number | null;
}

export interface FxDriftSnapshotInput {
  accountId: number;
  date: string; // YYYY-MM-DD
  balance: number;
  /** Rate recorded at capture time. Null when FX was unavailable then. */
  nativeToBaseRate: number | null;
}

/** The most recent transaction date on an account, for the "untouched" test. */
export interface FxDriftActivityInput {
  accountId: number;
  lastTransactionDate: string | null; // YYYY-MM-DD
}

export interface FxDriftInput {
  accounts: FxDriftAccountInput[];
  /** Every snapshot strictly before `today`; the earliest per account wins. */
  snapshots: FxDriftSnapshotInput[];
  activity: FxDriftActivityInput[];
  today: string; // YYYY-MM-DD, server-local
  baseCurrency: string;
}

export interface FxDriftAccountResult {
  accountId: number;
  name: string;
  currency: string;
  type: string;
  baselineDate: string;
  baselineBalance: number;
  baselineRate: number;
  currentBalance: number;
  currentRate: number;
  fxDeltaBase: number;
  activityDeltaBase: number;
  totalDeltaBase: number;
  /** YYYY-MM-DD of the newest transaction on this account, or null. */
  lastTransactionDate: string | null;
  /** today − lastTransactionDate in days. null when there has never been one. */
  daysSinceLastTransaction: number | null;
}

export interface FxDriftReport {
  status: "ok" | "insufficient";
  baseCurrency: string;
  /** Earliest baseline actually used, YYYY-MM-DD. null when insufficient. */
  periodFrom: string | null;
  periodTo: string;
  /** Longest measured window in days; 0 when insufficient. */
  days: number;
  /** Earliest snapshot held for any account, measurable or not. */
  dataAvailableSince: string | null;
  accounts: FxDriftAccountResult[];
  /**
   * Accounts excluded because they have no usable baseline — no snapshot
   * before today, or a snapshot whose rate was never captured. Named so the
   * UI can say what is missing instead of implying the drift is zero.
   */
  unmeasurableAccounts: number;
}

const DAY_MS = 86_400_000;

/** Whole days between two YYYY-MM-DD dates. Both are local dates, so UTC
 *  midnight on each is a safe way to difference them without timezone drift. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / DAY_MS);
}

export function computeFxDrift(input: FxDriftInput): FxDriftReport {
  const { accounts, snapshots, activity, today, baseCurrency } = input;

  // Earliest snapshot per account, strictly before today. Earliest rather
  // than latest: the longest honest window is the one most likely to contain
  // a rate move worth naming, and the caller has already excluded today's
  // partial row.
  const earliest = new Map<number, FxDriftSnapshotInput>();
  for (const s of snapshots) {
    if (s.date >= today) continue;
    const held = earliest.get(s.accountId);
    if (held == null || s.date < held.date) earliest.set(s.accountId, s);
  }

  const dataAvailableSince = [...earliest.values()]
    .reduce<string | null>((min, s) => (min == null || s.date < min ? s.date : min), null);

  const lastTxByAccount = new Map<number, string | null>();
  for (const a of activity) lastTxByAccount.set(a.accountId, a.lastTransactionDate);

  const results: FxDriftAccountResult[] = [];
  let unmeasurable = 0;

  for (const account of accounts) {
    const snap = earliest.get(account.id);
    // No baseline, no baseline rate, or no rate today — all three mean the
    // same thing: the two ends of the comparison are not both known, so
    // there is no honest figure. Counted, never estimated.
    if (snap == null || snap.nativeToBaseRate == null || account.currentRate == null) {
      unmeasurable++;
      continue;
    }

    const baselineRate = snap.nativeToBaseRate;
    const currentRate = account.currentRate;
    const fxDeltaBase = snap.balance * (currentRate - baselineRate);
    const activityDeltaBase = (account.balance - snap.balance) * currentRate;
    const lastTransactionDate = lastTxByAccount.get(account.id) ?? null;

    results.push({
      accountId: account.id,
      name: account.name,
      currency: account.currency,
      type: account.type,
      baselineDate: snap.date,
      baselineBalance: snap.balance,
      baselineRate,
      currentBalance: account.balance,
      currentRate,
      fxDeltaBase,
      activityDeltaBase,
      totalDeltaBase: fxDeltaBase + activityDeltaBase,
      lastTransactionDate,
      daysSinceLastTransaction:
        lastTransactionDate == null ? null : daysBetween(lastTransactionDate, today),
    });
  }

  // Largest absolute FX move first: the report is read top-down and the
  // account that moved most is the one worth a sentence.
  results.sort((a, b) => Math.abs(b.fxDeltaBase) - Math.abs(a.fxDeltaBase));

  const periodFrom = results.reduce<string | null>(
    (min, r) => (min == null || r.baselineDate < min ? r.baselineDate : min), null);

  return {
    status: results.length === 0 ? "insufficient" : "ok",
    baseCurrency,
    periodFrom,
    periodTo: today,
    days: periodFrom == null ? 0 : daysBetween(periodFrom, today),
    dataAvailableSince,
    accounts: results,
    unmeasurableAccounts: unmeasurable,
  };
}
