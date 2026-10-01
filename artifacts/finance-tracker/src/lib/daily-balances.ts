// The LIQUID strip's per-day balance for the current month: days that have
// happened are rolled back from today's balance through the month's rows,
// days that have not are carried forward from today through whatever the
// projection supplies.
import type { DailyBalance } from "./lowest-so-far";

/** A dated, signed base amount: income positive, outgoing negative. */
export interface ProjectedAmount {
  date: string;
  amount: number;
}

export function buildDailyBalances(
  txns: Array<{ date: string; baseEquivalent: number | null; type: string }>,
  now: Date,
  currentBalance: number,
  projected: readonly ProjectedAmount[] = [],
): DailyBalance[] {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const today = now.getDate();
  // Compute the balance at the START of the current month by rolling back
  // today's balance through all this-month transactions. Skip rows whose
  // FX is unavailable — including a fabricated 0 in monthNet would
  // shift the rolled-back start balance and skew the whole curve.
  const thisMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthTxns = txns.filter((t) => t.date.startsWith(thisMonthPrefix) && t.baseEquivalent != null) as Array<{ date: string; baseEquivalent: number; type: string }>;
  const monthNet = monthTxns.reduce((s, t) => {
    const signed = t.type === "expense" ? -Math.abs(t.baseEquivalent) : Math.abs(t.baseEquivalent);
    return s + signed;
  }, 0);
  let running = currentBalance - monthNet;
  const perDay: number[] = new Array(daysInMonth).fill(0);
  for (const t of monthTxns) {
    const day = parseInt(t.date.slice(8, 10), 10);
    const signed = t.type === "expense" ? -Math.abs(t.baseEquivalent) : Math.abs(t.baseEquivalent);
    perDay[day - 1] += signed;
  }
  // Projected occurrences land only on days that have not happened. Today's
  // bar is solid — the ledger's word, not a forecast — and an occurrence
  // dated today that has already cleared is in `txns` already.
  for (const p of projected) {
    if (!p.date.startsWith(thisMonthPrefix)) continue;
    const day = parseInt(p.date.slice(8, 10), 10);
    if (day > today && day <= daysInMonth) perDay[day - 1] += p.amount;
  }
  const result: DailyBalance[] = [];
  for (let d = 0; d < daysInMonth; d++) {
    running += perDay[d];
    result.push({ day: d + 1, balance: running, future: d + 1 > today });
  }
  return result;
}

