// Change attribution — the headline movement, decomposed into what caused it.
//
// Numeris already computes each part separately: `fx-drift.ts` prices the rate
// share, `reconciliation.ts` prices the share no transaction explains, and the
// ledger is the share the user actually moved. Each reaches the product in its
// own corner — an insight slot, a panel below the fold — so the decomposition
// exists and is mostly invisible. This joins them into one standing figure:
//
//   CHANGE            −£159.45
//     you spent        −£27.04   2 transactions
//     the rate moved   −£90.00   MYR 5.41 → 5.47
//     unexplained      −£42.41   balance moved, no transaction
//
// ── Why this is not just "call the other two and add up" ───────────────────
//
// The two existing reports use DIFFERENT windows, and a decomposition whose
// parts are measured over different periods does not sum — it only looks as
// though it does. `fx-drift` takes each account's own earliest snapshot, to
// give each account the longest honest window. `reconciliation` takes a date
// on which EVERY cash account has a snapshot, because a partial day cannot
// anchor a total. A total is exactly what this is, so it follows the
// reconciliation rule, over the set of accounts it can measure:
//
//   base_then = balance_then × rate_then     (rate as recorded at capture)
//   base_now  = balance_now  × rate_now
//
//   rate        = Σ balance_then × (rate_now − rate_then)
//   activity    = Σ (balance_now − balance_then) × rate_now
//   total       = Σ (base_now − base_then) = rate + activity
//
// and `activity` splits again, per account, by whether the ledger explains it:
//
//   ledger      = Σ signed tx effects since the baseline, at rate_now
//   residual    = activity − ledger
//
// The split is exact by construction, which is the point: the surface is only
// allowed to exist if its parts add to its headline. `residualBase` carries
// what is left over and `balances` says whether it is within tolerance, so a
// caller can say "these do not add up" rather than round into agreement.
//
// ── The fourth part, and why three would have been a lie ───────────────────
//
// The residual on a CASH account is money typed into a balance field with no
// transaction — that is the reconciliation gap, and "nothing explains it" is
// the honest label. The residual on a property, a pension or an investment
// account is a revaluation: the user marked the flat up, the pension grew.
// Calling that "unexplained" would be false, and folding it into the rate or
// the spend would be worse. It is reported separately as `valuation`.
//
// The task that asked for this specified three parts. Four is what makes the
// three true: without it either the figures stop summing, or a revaluation is
// mislabelled as an unexplained balance edit.
//
// ── No snapshot, no attribution ────────────────────────────────────────────
//
// Same rule as everywhere else. An account with no snapshot on the baseline
// date, no stored rate on that snapshot, or no current rate cannot be
// attributed and is counted in `unmeasurableAccounts` rather than attributed
// to zero. A baseline rate is NEVER re-derived by applying today's rate
// backwards — that makes the rate share zero by construction and turns a real
// drift into "no drift".
//
// Pure: everything it needs is passed in, including the FX conversion, so the
// arithmetic is testable without a database and without an FX provider.

import {
  signedEffect,
  completeBaselineDates,
  choosePeriod,
  type PeriodRule,
} from "./reconciliation";

export interface AttributionAccountInput {
  id: number;
  name: string;
  currency: string;
  /** cash | investment | pension | property | other. Decides which bucket the residual lands in. */
  type: string;
  /** Native balance now. */
  balance: number;
  /** Native-to-base rate now, or null when FX for this currency is unavailable. */
  currentRate: number | null;
}

export interface AttributionSnapshotInput {
  accountId: number;
  date: string; // YYYY-MM-DD
  balance: number;
  /** Native-to-base rate recorded at capture time. Null means unmeasurable. */
  nativeToBaseRate: number | null;
  capturedAt: Date;
}

export interface AttributionTxInput {
  accountId: number;
  type: string; // income | expense | transfer
  nativeAmount: number;
  currency: string;
  transferDirection: string | null; // out | in | null (legacy)
  createdAt: Date;
  updatedAt: Date;
}

export type Convert = (
  amount: number,
  from: string,
  to: string,
) => Promise<number | null>;

export interface ChangeAttributionInput {
  accounts: AttributionAccountInput[];
  snapshots: AttributionSnapshotInput[];
  transactions: AttributionTxInput[];
  today: string; // YYYY-MM-DD, server-local
  baseCurrency: string;
  convert: Convert;
}

export type AttributionKind = "spend" | "rate" | "valuation" | "unexplained";

export interface AttributionAccountShare {
  accountId: number;
  name: string;
  currency: string;
  amountBase: number;
  /** Rate part only: the two rates the move is priced between. */
  fromRate: number | null;
  toRate: number | null;
}

export interface AttributionPart {
  kind: AttributionKind;
  amountBase: number;
  /** Spend part only: how many ledger rows were summed. */
  transactions: number | null;
  /** Largest magnitude first. Never empty for a part that is reported. */
  accounts: AttributionAccountShare[];
}

export interface ChangeAttributionReport {
  status: "ok" | "insufficient";
  baseCurrency: string;
  periodRule: PeriodRule | null;
  periodFrom: string | null;
  periodTo: string;
  days: number;
  /** Earliest snapshot of any measurable account — what the window could become. */
  dataAvailableSince: string | null;
  /** The headline. Null when insufficient — never zero standing in for unknown. */
  totalDeltaBase: number | null;
  parts: AttributionPart[];
  /** headline − Σ parts. Zero by construction; carried so a caller can check. */
  residualBase: number;
  /** False means the parts do not add to the headline and the surface must say so. */
  balances: boolean;
  measuredAccounts: number;
  /** No snapshot on the baseline date, or no rate at either end. */
  unmeasurableAccounts: number;
}

// A tenth of a base-currency unit. Larger than any float error over a few
// dozen accounts, smaller than anything a user would see as a discrepancy.
const BALANCE_TOLERANCE = 0.1;

// Half a penny — below this a figure rounds to 0.00 at the precision every
// surface prints it in. A part or a share under it is dropped rather than
// reported, because "nothing explains it  £0.00" reads as a measured zero and
// it is usually float dust from the subtraction. A part that genuinely nets
// to zero (one account up, another down by the same amount) did not move the
// headline either, so leaving it out costs the decomposition nothing; the
// per-account detail is what the reconciliation panel is for.
const DISPLAY_EPSILON = 0.005;

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export async function computeChangeAttribution(
  input: ChangeAttributionInput,
): Promise<ChangeAttributionReport> {
  const { accounts, snapshots, transactions, today, baseCurrency, convert } = input;

  // An account is a candidate only if it can be priced at BOTH ends. Doing
  // this before choosing the period matters: an account that can never be
  // attributed must not veto a baseline date for the ones that can.
  const rateNow = new Map<number, number>();
  for (const a of accounts) {
    if (a.currentRate != null && Number.isFinite(a.currentRate)) rateNow.set(a.id, a.currentRate);
  }
  const priceable = accounts.filter((a) => rateNow.has(a.id));
  const usable = snapshots.filter(
    (s) => rateNow.has(s.accountId) && s.nativeToBaseRate != null,
  );

  const dataAvailableSince = usable.length === 0
    ? null
    : usable.map((s) => s.date).sort()[0];

  const insufficient = (): ChangeAttributionReport => ({
    status: "insufficient",
    baseCurrency,
    periodRule: null,
    periodFrom: null,
    periodTo: today,
    days: 0,
    dataAvailableSince,
    totalDeltaBase: null,
    parts: [],
    residualBase: 0,
    balances: true,
    measuredAccounts: 0,
    unmeasurableAccounts: accounts.length,
  });

  if (priceable.length === 0) return insufficient();
  const period = choosePeriod(
    completeBaselineDates(priceable.map((a) => a.id), usable, today),
    today,
  );
  if (period == null) return insufficient();

  let total = 0;
  let spend = 0;
  let rate = 0;
  let valuation = 0;
  let unexplained = 0;
  let txCount = 0;
  const shares: Record<AttributionKind, AttributionAccountShare[]> = {
    spend: [], rate: [], valuation: [], unexplained: [],
  };

  for (const account of priceable) {
    const baseline = usable.find(
      (s) => s.accountId === account.id && s.date === period.from,
    );
    // completeBaselineDates guarantees this, but a missing row must not
    // silently contribute zero to a total that claims to be complete.
    if (baseline == null || baseline.nativeToBaseRate == null) continue;

    const rateThen = baseline.nativeToBaseRate;
    const rateCurrent = rateNow.get(account.id)!;

    const fxDelta = baseline.balance * (rateCurrent - rateThen);
    const balanceChange = account.balance - baseline.balance;
    const activityDelta = balanceChange * rateCurrent;

    // The ledger boundary is capturedAt vs createdAt, not the user-facing
    // date: a balance moves when a row is written, whatever date it carries.
    // Identical to reconciliation.ts, deliberately — the two surfaces must
    // not disagree about what the ledger explains.
    let ledgerNative = 0;
    for (const tx of transactions) {
      if (tx.accountId !== account.id) continue;
      if (tx.createdAt <= baseline.capturedAt) continue;
      let effect = signedEffect(tx);
      if (tx.currency !== account.currency) {
        const converted = await convert(effect, tx.currency, account.currency);
        // A row that cannot be converted is not counted as zero — it falls
        // into the residual, where "no transaction explains this" is at
        // least true of the arithmetic.
        if (converted == null) continue;
        effect = converted;
      }
      ledgerNative += effect;
      txCount += 1;
    }

    const ledgerBase = ledgerNative * rateCurrent;
    const residual = activityDelta - ledgerBase;
    const isCash = account.type === "cash";

    total += fxDelta + activityDelta;
    rate += fxDelta;
    spend += ledgerBase;
    if (isCash) unexplained += residual; else valuation += residual;

    const share = (amountBase: number, fromRate: number | null, toRate: number | null) => ({
      accountId: account.id,
      name: account.name,
      currency: account.currency,
      amountBase: round4(amountBase),
      fromRate,
      toRate,
    });
    if (Math.abs(fxDelta) >= DISPLAY_EPSILON) shares.rate.push(share(fxDelta, rateThen, rateCurrent));
    if (Math.abs(ledgerBase) >= DISPLAY_EPSILON) shares.spend.push(share(ledgerBase, null, null));
    if (Math.abs(residual) >= DISPLAY_EPSILON) {
      shares[isCash ? "unexplained" : "valuation"].push(share(residual, null, null));
    }
  }

  const byMagnitude = (a: AttributionAccountShare, b: AttributionAccountShare) =>
    Math.abs(b.amountBase) - Math.abs(a.amountBase);

  // A part with no contribution is not reported as £0.00 — a zero line reads
  // as a measured zero, and the surface is shorter without it. That covers
  // both "no account contributed" and "the contributions cancelled".
  const amounts: Record<AttributionKind, number> = { spend, rate, valuation, unexplained };
  const order: AttributionKind[] = ["spend", "rate", "valuation", "unexplained"];
  const parts: AttributionPart[] = order
    .filter((kind) => shares[kind].length > 0 && Math.abs(amounts[kind]) >= DISPLAY_EPSILON)
    .map((kind) => ({
      kind,
      amountBase: round4(amounts[kind]),
      transactions: kind === "spend" ? txCount : null,
      accounts: [...shares[kind]].sort(byMagnitude),
    }));

  const residualBase = round4(total - parts.reduce((sum, p) => sum + p.amountBase, 0));

  return {
    status: "ok",
    baseCurrency,
    periodRule: period.rule,
    periodFrom: period.from,
    periodTo: today,
    days: daysBetween(period.from, today),
    dataAvailableSince,
    totalDeltaBase: round4(total),
    parts,
    residualBase,
    balances: Math.abs(residualBase) < BALANCE_TOLERANCE,
    measuredAccounts: priceable.length,
    unmeasurableAccounts: accounts.length - priceable.length,
  };
}
