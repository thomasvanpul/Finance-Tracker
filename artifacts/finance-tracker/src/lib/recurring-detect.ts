/**
 * Recurring-expense detection.
 *
 * Amounts are compared as magnitudes. Stored `baseEquivalent` values carry
 * their direction in the transaction `type`, and some outflows are stored
 * negative, so a signed average would make the deviation ratios negative:
 * the 10% tolerance never rejected, `amountConsistency` exceeded 1 (hence
 * 104% and 168% confidences), and the estimated amount came out negative
 * (hence "--£3.85" once the caller prefixed its own minus).
 */

export interface RecurringTx {
  date: string;
  description: string;
  type: string;
  category: string;
  baseEquivalent: number;
}

export interface RecurringPattern {
  id: string;
  merchantName: string;
  estimatedAmount: number;
  frequency: string;
  lastOccurrence: string;
  nextEstimated: string | null;
  occurrences: number;
  category: string;
  intervalDays: number;
  confidence: number; // 0–100
}

const DAY_MS = 86_400_000;
const AMOUNT_TOLERANCE = 0.1;

function frequencyFor(avgInterval: number, count: number): string {
  if (avgInterval >= 5 && avgInterval <= 9) return "weekly";
  if (avgInterval >= 25 && avgInterval <= 35) return "monthly";
  if (avgInterval >= 85 && avgInterval <= 95) return "quarterly";
  if (avgInterval >= 355 && avgInterval <= 375) return "yearly";
  if (count >= 3) return `~${Math.round(avgInterval)}d`;
  return "";
}

export function detectRecurring<T extends RecurringTx>(txs: T[]): RecurringPattern[] {
  const groups: Record<string, T[]> = {};
  for (const tx of txs) {
    if (tx.type !== "expense") continue;
    const key = tx.description.trim().toLowerCase();
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  }

  const patterns: RecurringPattern[] = [];

  for (const [key, items] of Object.entries(groups)) {
    if (items.length < 2) continue;

    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));

    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1].date).getTime();
      const curr = new Date(sorted[i].date).getTime();
      intervals.push(Math.round((curr - prev) / DAY_MS));
    }

    const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    const stdDev = Math.sqrt(
      intervals.reduce((s, v) => s + Math.pow(v - avgInterval, 2), 0) / intervals.length
    );
    const intervalConsistency = avgInterval > 0 ? Math.max(0, 1 - stdDev / avgInterval) : 0;

    const frequency = frequencyFor(avgInterval, items.length);
    if (!frequency) continue;

    const amounts = sorted.map((t) => Math.abs(t.baseEquivalent));
    const avgAmt = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    if (avgAmt <= 0) continue;

    const deviations = amounts.map((a) => Math.abs(a - avgAmt) / avgAmt);
    if (deviations.some((d) => d > AMOUNT_TOLERANCE)) continue;

    const amountVariance = deviations.reduce((s, d) => s + d, 0) / deviations.length;
    const amountConsistency = Math.max(0, 1 - amountVariance / AMOUNT_TOLERANCE);

    const occurrenceScore = Math.min(1, (items.length - 1) / 5);

    const confidence = Math.min(
      100,
      Math.round((intervalConsistency * 0.4 + amountConsistency * 0.4 + occurrenceScore * 0.2) * 100)
    );

    const lastDate = new Date(sorted[sorted.length - 1].date);
    let nextEstimated: string | null = null;
    if (!isNaN(lastDate.getTime())) {
      const next = new Date(lastDate.getTime() + avgInterval * DAY_MS);
      nextEstimated = next.toISOString().slice(0, 10);
    }

    patterns.push({
      id: `rec-${key.slice(0, 20)}`,
      merchantName: sorted[0].description,
      estimatedAmount: Math.round(avgAmt * 100) / 100,
      frequency,
      lastOccurrence: sorted[sorted.length - 1].date,
      nextEstimated,
      occurrences: items.length,
      category: sorted[sorted.length - 1].category || "",
      intervalDays: Math.round(avgInterval),
      confidence,
    });
  }

  return patterns.sort((a, b) => b.estimatedAmount - a.estimatedAmount);
}
