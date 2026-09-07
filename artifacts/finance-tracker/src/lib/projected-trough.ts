// The projected balance low point.
//
// Numeris already says "a heavy week is coming" by totalling outgoings. That
// is a total, not a balance, and a total is not a problem: £3,000 of bills
// against £5,000 of cash and a salary two days earlier is a normal month.
// The question a user actually has is **how low does it get, and when** —
// and that needs the income side of the ledger as well as the outgoing side.
//
// This projects the recurring series forward and reports the minimum. It
// fires on three conditions, and without all three it is noise:
//
//   1. Both series high-confidence. A trough built on a guessed salary date
//      is a guess with a number attached, which is worse than saying nothing.
//   2. Silent while the trough stays above a comfortable multiple of the
//      largest single outgoing in the window. Dipping to £400 before a £150
//      direct debit is not a warning; dipping to £120 is.
//   3. The finding is the projected balance low point, not the calendar gap
//      between two dates. "Your rent lands 4 days before payday" is a fact
//      about a calendar. "You are projected to reach £86 on 26 Sep" is a
//      fact about money, and only the second one can be acted on.
//
// DESIGN.md §15's test: it is true within a stated projection, the user can
// move a payment date or hold cash back, it stops as soon as the trough
// clears the comfort line, and it is a sentence you would say out loud.

import type { Insight, InsightContext } from "./spending-insights";
import { detectRecurring, type RecurringTx } from "./recurring-detect";
import type { Transaction } from "@workspace/api-client-react";
import { formatShortDate } from "./reconciliation-insight";
import { formatMoney } from "./utils";

// Above heavy-week-ahead (80), which totals outgoings without knowing what
// is coming in. When both fire this is the truer statement.
export const PROJECTED_TROUGH_PRIORITY = 85;

const DAY_MS = 86_400_000;

// Far enough to contain a full monthly cycle plus the next salary, near
// enough that the series are still a fair description of the future.
const HORIZON_DAYS = 60;

// detectRecurring's confidence is intervalConsistency·0.4 + amountConsistency·0.4
// + occurrenceScore·0.2.
const MIN_CONFIDENCE = 70;

// Confidence alone is not enough, and measuring it showed why: a merchant
// seen exactly TWICE scores 84 — the single interval between two points has
// zero variance by construction, so intervalConsistency is a perfect 1.0
// that means nothing. Two points cannot evidence a rhythm. Three can.
const MIN_OCCURRENCES = 3;

// The trough must clear this many times the largest single outgoing in the
// window before it is worth a sentence. One multiple means "you can just
// pay it"; two means "you can pay it and absorb one surprise".
const COMFORT_MULTIPLE = 2;

interface ProjectedEvent {
  date: string;
  /** Signed base amount: income positive, outgoing negative. */
  amount: number;
  name: string;
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Occurrences of one series from its next estimate up to the horizon. */
function occurrencesOf(
  pattern: { nextEstimated: string | null; intervalDays: number; estimatedAmount: number; merchantName: string },
  sign: 1 | -1,
  today: string,
  horizon: string,
): ProjectedEvent[] {
  const { nextEstimated, intervalDays } = pattern;
  if (nextEstimated == null || intervalDays <= 0) return [];
  const events: ProjectedEvent[] = [];
  // A series whose next estimate is already in the past is stepped forward
  // rather than dropped — a salary due last Friday is still due, and
  // dropping it would understate income and manufacture a trough.
  let date = nextEstimated;
  while (date < today) date = addDays(date, intervalDays);
  while (date <= horizon) {
    events.push({ date, amount: sign * pattern.estimatedAmount, name: pattern.merchantName });
    date = addDays(date, intervalDays);
  }
  return events;
}

export function projectedTrough(
  txs: readonly Transaction[],
  context: InsightContext,
  now: Date = new Date(),
): Insight | null {
  const balance = context.cashBalanceBase;
  // No balance, no projection. A trough is a level, and a level needs a
  // starting point the API supplied.
  if (balance == null || !Number.isFinite(balance)) return null;

  // A recurring series needs months, and the screen this producer runs on
  // hands `txs` the current month alone — three occurrences of anything are
  // impossible inside it, so the producer could never fire. Read the history
  // the context carries, exactly as unbudgetedCategory does, and fall back to
  // `txs` only for a caller that passes the full ledger as its first argument.
  const source = context.historyTxs ?? txs;

  // A row whose base equivalent the API could not supply is dropped, not
  // coerced to zero — Lock #16's rule. A dropped row weakens the series'
  // confidence, which is the correct consequence.
  const list: RecurringTx[] = source
    .filter((t) => t.baseEquivalent != null)
    .map((t) => ({
      date: t.date,
      description: t.description,
      type: t.type,
      category: t.category,
      baseEquivalent: t.baseEquivalent as number,
    }));
  const confident = (p: { confidence: number; occurrences: number; nextEstimated: string | null }) =>
    p.confidence >= MIN_CONFIDENCE && p.occurrences >= MIN_OCCURRENCES && p.nextEstimated != null;
  const income = detectRecurring(list, { type: "income" }).filter(confident);
  const outgoing = detectRecurring(list, { type: "expense" }).filter(confident);

  // Condition 1. Outgoings alone would project a balance that only falls,
  // and would fire every month for everyone.
  if (income.length === 0 || outgoing.length === 0) return null;

  const today = now.toISOString().slice(0, 10);
  const horizon = addDays(today, HORIZON_DAYS);
  const events = [
    ...income.flatMap((p) => occurrencesOf(p, 1, today, horizon)),
    ...outgoing.flatMap((p) => occurrencesOf(p, -1, today, horizon)),
  ].sort((a, b) => (a.date === b.date ? a.amount - b.amount : a.date.localeCompare(b.date)));
  // Same-day ties settle outgoings first: the pessimistic reading, and the
  // one that matches how a bank actually clears a morning direct debit
  // against an afternoon credit.

  if (events.length === 0) return null;

  let running = balance;
  let trough = balance;
  let troughDate = today;
  for (const e of events) {
    running += e.amount;
    if (running < trough) {
      trough = running;
      troughDate = e.date;
    }
  }

  // The trough is the balance today if nothing takes it lower — nothing to say.
  if (trough >= balance) return null;

  const largestOutgoing = Math.max(...events.filter((e) => e.amount < 0).map((e) => -e.amount), 0);

  // Condition 2.
  if (trough >= COMFORT_MULTIPLE * largestOutgoing) return null;

  const currency = context.baseCurrency ?? "GBP";
  const when = formatShortDate(troughDate);
  // Named the LAST outgoing before the low, which on the real ledger was a
  // £3.85 coffee sitting after the rent — true in sequence, false in cause,
  // and read as "your coffee habit takes you to £1,111". Seen on the
  // rendered slot, 2026-09-07. Count them instead; the balance is the claim.
  const dueCount = events.filter((e) => e.amount < 0 && e.date <= troughDate).length;
  // Crossing zero is a different fact from getting low, and "Down to
  // -£130.00" makes the reader do the sign themselves. Say it in words.
  const headline = trough < 0
    ? `Overdrawn by ${formatMoney(-trough, currency)} on ${when}`
    : `Down to ${formatMoney(trough, currency)} on ${when}`;

  return {
    // Level and date both in the id: a dismissal covers this projection, and
    // a materially different one earns the slot again.
    id: `projected-trough:${troughDate}:${Math.round(trough * 100)}`,
    source: "projected-trough",
    priority: PROJECTED_TROUGH_PRIORITY,
    // Condition 3 — the low point, stated as a balance.
    headline,
    // One nowrap line at 13px in InsightSlot — about 45 characters.
    body: `${dueCount} payment${dueCount === 1 ? "" : "s"} first, from ${formatMoney(balance, currency)} now`,
    // Projected rows are not rows. The series the projection is built from
    // are real and live on /recurring, so that is where the figure opens —
    // the honest answer to "where did this come from".
    drillHref: "/recurring",
  };
}
