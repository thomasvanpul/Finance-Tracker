// Reconciliation gap — money that moved through a cash account without a
// transaction being recorded.
//
// Every write path that moves a balance also writes a transaction row
// (transactions create/update/delete, debts, upcoming mark-paid — all via
// adjustAccountBalance), except one: PATCH /accounts/:id, the manual
// correction. So for a cash account
//
//   (balance now − balance at baseline) − Σ signed tx effects since baseline
//
// is the money the user typed into a balance field without saying where it
// went. Edits and deletions of transactions that predate the baseline also
// land here, because the row that would explain the movement is gone or
// changed; those are counted (editedSinceBaseline) rather than guessed.
//
// Period rule. The baseline is a snapshot date, strictly before today, on
// which EVERY current cash account has a row — a partial day cannot anchor a
// total. If the 1st of the current month qualifies, the period is
// month-to-date; otherwise it is the earliest qualifying date, so the window
// widens on its own as history accumulates and switches to month-to-date the
// first month that starts with a snapshot. Below one qualifying date the
// report is `insufficient` and carries no figure.
//
// The boundary is each account's baseline capturedAt, compared against
// transaction createdAt (not the user-facing date): balances move when a
// row is written, whatever date it carries, so createdAt is what the balance
// arithmetic actually saw.
//
// Pure: everything it needs is passed in, including the FX conversion, so
// the arithmetic is testable without a database.

export interface ReconciliationAccountInput {
  id: number;
  name: string;
  currency: string;
  balance: number;
}

export interface ReconciliationSnapshotInput {
  accountId: number;
  date: string; // YYYY-MM-DD
  balance: number;
  capturedAt: Date;
}

export interface ReconciliationTxInput {
  accountId: number;
  type: string; // income | expense | transfer
  nativeAmount: number;
  currency: string;
  transferDirection: string | null; // out | in | null (legacy)
  createdAt: Date;
  updatedAt: Date;
}

export type Convert = (amount: number, from: string, to: string) => Promise<number | null>;

export interface ReconciliationInput {
  cashAccounts: ReconciliationAccountInput[];
  snapshots: ReconciliationSnapshotInput[];
  transactions: ReconciliationTxInput[];
  today: string; // YYYY-MM-DD, server-local
  baseCurrency: string;
  convert: Convert;
}

export interface ReconciliationAccountResult {
  accountId: number;
  name: string;
  currency: string;
  baselineDate: string;
  baselineBalance: number;
  currentBalance: number;
  balanceChange: number;
  ledgerChange: number;
  gap: number;
  gapBase: number | null;
  transactionsCounted: number;
  editedSinceBaseline: number;
  fxSkippedTransactions: number;
}

export type PeriodRule = "month-to-date" | "since-first-snapshot";

export interface ReconciliationReport {
  status: "ok" | "insufficient";
  baseCurrency: string;
  periodRule: PeriodRule | null;
  periodFrom: string | null;
  periodTo: string;
  days: number;
  dataAvailableSince: string | null;
  gapBase: number | null;
  accounts: ReconciliationAccountResult[];
  unconvertibleAccounts: number;
}

// Mirrors adjustAccountBalance in balance.ts: income +, expense −, transfer
// by leg direction, legacy direction-less transfer is a no-op there too.
export function signedEffect(tx: Pick<ReconciliationTxInput, "type" | "nativeAmount" | "transferDirection">): number {
  if (tx.type === "income") return tx.nativeAmount;
  if (tx.type === "expense") return -tx.nativeAmount;
  if (tx.type === "transfer") {
    if (tx.transferDirection === "out") return -tx.nativeAmount;
    if (tx.transferDirection === "in") return tx.nativeAmount;
  }
  return 0;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

// Dates strictly before today on which every cash account has a snapshot.
export function completeBaselineDates(
  accountIds: number[],
  snapshots: readonly ReconciliationSnapshotInput[],
  today: string,
): string[] {
  const byDate = new Map<string, Set<number>>();
  for (const s of snapshots) {
    if (s.date >= today) continue;
    if (!byDate.has(s.date)) byDate.set(s.date, new Set());
    byDate.get(s.date)!.add(s.accountId);
  }
  return [...byDate.entries()]
    .filter(([, ids]) => accountIds.every((id) => ids.has(id)))
    .map(([d]) => d)
    .sort();
}

export function choosePeriod(
  completeDates: readonly string[],
  today: string,
): { rule: PeriodRule; from: string } | null {
  if (completeDates.length === 0) return null;
  const monthStart = `${today.slice(0, 7)}-01`;
  if (completeDates.includes(monthStart)) return { rule: "month-to-date", from: monthStart };
  return { rule: "since-first-snapshot", from: completeDates[0] };
}

export async function computeReconciliation(input: ReconciliationInput): Promise<ReconciliationReport> {
  const { cashAccounts, snapshots, transactions, today, baseCurrency, convert } = input;
  const ids = cashAccounts.map((a) => a.id);
  const cashSnapshots = snapshots.filter((s) => ids.includes(s.accountId));
  const dataAvailableSince = cashSnapshots.length === 0
    ? null
    : cashSnapshots.map((s) => s.date).sort()[0];

  const insufficient = (): ReconciliationReport => ({
    status: "insufficient",
    baseCurrency,
    periodRule: null,
    periodFrom: null,
    periodTo: today,
    days: 0,
    dataAvailableSince,
    gapBase: null,
    accounts: [],
    unconvertibleAccounts: 0,
  });

  if (cashAccounts.length === 0) return insufficient();
  const period = choosePeriod(completeBaselineDates(ids, cashSnapshots, today), today);
  if (period == null) return insufficient();

  const accounts: ReconciliationAccountResult[] = [];
  for (const account of cashAccounts) {
    const baseline = cashSnapshots.find((s) => s.accountId === account.id && s.date === period.from)!;
    let ledgerChange = 0;
    let counted = 0;
    let edited = 0;
    let fxSkipped = 0;
    for (const tx of transactions) {
      if (tx.accountId !== account.id) continue;
      if (tx.createdAt <= baseline.capturedAt) {
        if (tx.updatedAt > baseline.capturedAt) edited += 1;
        continue;
      }
      let effect = signedEffect(tx);
      if (tx.currency !== account.currency) {
        const converted = await convert(effect, tx.currency, account.currency);
        if (converted == null) { fxSkipped += 1; continue; }
        effect = converted;
      }
      ledgerChange += effect;
      counted += 1;
    }
    const balanceChange = account.balance - baseline.balance;
    const gap = round4(balanceChange - ledgerChange);
    const gapBase = await convert(gap, account.currency, baseCurrency);
    accounts.push({
      accountId: account.id,
      name: account.name,
      currency: account.currency,
      baselineDate: baseline.date,
      baselineBalance: baseline.balance,
      currentBalance: account.balance,
      balanceChange: round4(balanceChange),
      ledgerChange: round4(ledgerChange),
      gap,
      gapBase: gapBase == null ? null : round4(gapBase),
      transactionsCounted: counted,
      editedSinceBaseline: edited,
      fxSkippedTransactions: fxSkipped,
    });
  }

  const convertible = accounts.filter((a) => a.gapBase != null);
  return {
    status: "ok",
    baseCurrency,
    periodRule: period.rule,
    periodFrom: period.from,
    periodTo: today,
    days: daysBetween(period.from, today),
    dataAvailableSince,
    gapBase: convertible.length === 0 ? null : round4(convertible.reduce((s, a) => s + (a.gapBase ?? 0), 0)),
    accounts,
    unconvertibleAccounts: accounts.length - convertible.length,
  };
}
