interface TxRow {
  date: string;
  description: string;
  nativeAmount: string;
  currency: string;
  type: string;
}

export interface DetectedPattern {
  normalizedKey: string;
  displayName: string;
  intervalDays: number;
  expectedAmount: number;
  currency: string;
  lastOccurrence: string;
  nextExpected: string;
  occurrenceCount: number;
}

const MIN_OCCURRENCES = 3;
const INTERVAL_TOLERANCE_DAYS = 7;
const AMOUNT_TOLERANCE_RATIO = 0.2;
const MIN_INTERVAL_DAYS = 7;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function detectRecurringPatterns(transactions: TxRow[]): DetectedPattern[] {
  const expenses = transactions.filter(t => t.type === "expense");

  // Group by (description, currency)
  const groups = new Map<string, Map<string, TxRow[]>>();
  for (const tx of expenses) {
    const key = tx.description;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, new Map());
    const byCurrency = groups.get(key)!;
    if (!byCurrency.has(tx.currency)) byCurrency.set(tx.currency, []);
    byCurrency.get(tx.currency)!.push(tx);
  }

  const results: DetectedPattern[] = [];

  for (const [key, byCurrency] of groups) {
    for (const [currency, txs] of byCurrency) {
      if (txs.length < MIN_OCCURRENCES) continue;

      const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));

      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
      }

      const medianGap = median(gaps);
      if (medianGap < MIN_INTERVAL_DAYS) continue;

      // All gaps must be within ±INTERVAL_TOLERANCE_DAYS of the median
      const gapConsistent = gaps.every(g => Math.abs(g - medianGap) <= INTERVAL_TOLERANCE_DAYS);
      if (!gapConsistent) continue;

      const amounts = sorted.map(t => Math.abs(parseFloat(t.nativeAmount)));
      const medianAmount = median(amounts);
      if (medianAmount <= 0) continue;

      // Amount-stability gate: all amounts within ±20% of median.
      // A price rise (e.g. Spotify £10.99→£11.99) keeps the same series —
      // expected_amount is updated to the most recent occurrence after detection.
      const amountConsistent = amounts.every(
        a => Math.abs(a - medianAmount) / medianAmount <= AMOUNT_TOLERANCE_RATIO,
      );
      if (!amountConsistent) continue;

      const last = sorted[sorted.length - 1];
      const intervalDays = Math.round(medianGap);

      results.push({
        normalizedKey: key,
        displayName: key,
        intervalDays,
        expectedAmount: Math.abs(parseFloat(last.nativeAmount)),
        currency,
        lastOccurrence: last.date,
        nextExpected: addDays(last.date, intervalDays),
        occurrenceCount: sorted.length,
      });
    }
  }

  return results.sort((a, b) => b.expectedAmount - a.expectedAmount);
}
