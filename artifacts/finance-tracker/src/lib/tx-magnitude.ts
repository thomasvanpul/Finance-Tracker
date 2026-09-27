/**
 * Transaction sign convention, client side.
 *
 * The API returns `Transaction.baseEquivalent` SIGNED: negative for an
 * expense row, positive for income and transfers
 * (`api-server/src/routes/transactions.ts` enrichTransaction does
 * `type === "expense" ? -rawBase : rawBase`, and `txToBase` takes the
 * absolute native amount first). The month summary endpoint, by contrast,
 * returns `totalExpenses` as a positive magnitude.
 *
 * Budget, analytics, reports and year review all reason with `type` as
 * the sign carrier — "spent = sum of expenses", "net = income − expenses".
 * Fed the signed value, spend summed negative: a budget could never go
 * over, net savings came out as income + spend, and "largest expense"
 * picked the smallest one.
 *
 * These helpers convert at the load point so those screens see
 * magnitudes, with `type` alone saying which way the money moved. A null
 * baseEquivalent (FX unavailable) stays null — never coerced to 0.
 */

export function baseMagnitude(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.abs(value);
}

type HasBase = { baseEquivalent?: number | null };

/** New array of new rows whose baseEquivalent is the unsigned magnitude. */
export function withBaseMagnitudes<T extends HasBase>(txs: readonly T[]): T[] {
  return txs.map((tx) =>
    tx.baseEquivalent == null ? tx : { ...tx, baseEquivalent: baseMagnitude(tx.baseEquivalent) },
  );
}

export interface IncomeExpenseTotals {
  income: number;
  expenses: number;
}

/**
 * Income and expense totals as positive magnitudes, whichever sign the
 * rows carry. Rows without a base value are skipped (a summary dropping
 * an unconvertible row is truer than summing it as 0).
 */
export function incomeExpenseTotals(
  txs: readonly (HasBase & { type: string })[],
): IncomeExpenseTotals {
  let income = 0;
  let expenses = 0;
  for (const tx of txs) {
    const v = baseMagnitude(tx.baseEquivalent);
    if (v == null) continue;
    if (tx.type === "income") income += v;
    else if (tx.type === "expense") expenses += v;
  }
  return { income, expenses };
}

/** Savings rate in percent, or null when there is no income to divide by. */
export function savingsRatePct({ income, expenses }: IncomeExpenseTotals): number | null {
  return income > 0 ? ((income - expenses) / income) * 100 : null;
}
