// The app's single definition of MONTHLY INCOME and SAVINGS RATE.
//
// Before this existed, four surfaces answered "what is my monthly income"
// four different ways for the same month — the dashboard "—", /analytics
// £937.50 (a recorded-months average), /cashflow £1,250.00 (a 90-day
// average) and /whatif £3,000.00 (a literal) — and gave three different
// savings rates, all under the same labels. Measured 5 Oct 2026, desktop
// audit X1/X3.
//
// The definitions, which DESIGN.md §10 also states:
//
//   MONTHLY INCOME is the income recorded in the current calendar month,
//   in base currency. It is UNKNOWN, not zero, when no income has been
//   recorded: a user who has entered no income has not earned nothing,
//   they have told us nothing.
//
//   SAVINGS RATE is (monthly income − monthly expenses) / monthly income,
//   as a percentage. With no recorded income there is no denominator, so
//   it is UNKNOWN. It is never clamped and may be negative.
//
// Any surface that means something else — a six-month average, a 90-day
// trend, a projection — must not use these labels unqualified. Its label
// states its window. This module is the only place either figure is
// derived from the dashboard payload.

/** The `thisMonth` block of GET /api/dashboard, structurally. */
export interface ThisMonthLike {
  income?: number | null;
  expenses?: number | null;
  netSavings?: number | null;
  savingsRate?: number | null;
}

export interface MonthlyMoney {
  /** Recorded income this calendar month. Null = none recorded (unknown). */
  income: number | null;
  /** Recorded expenses this calendar month. Null = unavailable. */
  expenses: number | null;
  /** income − expenses. Null when either side is unknown. */
  netSavings: number | null;
  /** Percent. Null when there is no income denominator. */
  savingsRate: number | null;
}

/** What a surface prints instead of a figure it does not have. */
export const UNKNOWN_FIGURE = "—";

/** Said once, in full, wherever a surface has to explain the dash. */
export const NO_INCOME_RECORDED =
  "No income recorded this month, so monthly income and savings rate are unknown.";

/** Asks for the one input that makes both figures knowable. */
export const NO_INCOME_ACTION = "Record income to see this";

export function monthlyMoney(m: ThisMonthLike | null | undefined): MonthlyMoney {
  // A zero income total means no income rows, not a month of earning
  // nothing — the API sums rows and income rows are positive. Treating it
  // as a number is what let £0 become the denominator of a fabricated
  // rate and the seed of a fabricated projection.
  const income = m?.income != null && m.income > 0 ? m.income : null;
  const expenses = m?.expenses ?? null;
  const netSavings = income == null || expenses == null ? null : round2(income - expenses);
  const savingsRate =
    income == null || expenses == null ? null : round2(((income - expenses) / income) * 100);
  return { income, expenses, netSavings, savingsRate };
}

/** True when monthly income is a figure, not an unknown. */
export function hasRecordedIncome(m: ThisMonthLike | null | undefined): boolean {
  return monthlyMoney(m).income != null;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** One entry of `monthlyHistory` on GET /api/dashboard, structurally. */
export interface MonthHistoryLike {
  month?: string;
  income?: number | null;
}

export interface RecordedAnnualIncome {
  /** Average of the months that recorded income, times twelve. */
  annual: number;
  /** What was actually recorded, before annualising. */
  total: number;
  /** How many months that total came from. */
  months: number;
}

// Annualised recorded income, for the surfaces that need a yearly figure
// (/tax) rather than a monthly one. Only months that recorded income count
// toward the average — including a month of nothing would halve the figure
// on the strength of a month the user simply has not entered yet.
//
// Null when nothing is recorded. There is no fallback salary: a surface
// with a null here states that income is unknown.
export function recordedAnnualIncome(
  history: readonly MonthHistoryLike[] | null | undefined,
): RecordedAnnualIncome | null {
  const earning = (history ?? []).filter((m) => m.income != null && m.income > 0);
  if (earning.length === 0) return null;
  const total = earning.reduce((sum, m) => sum + (m.income ?? 0), 0);
  return {
    annual: Math.round((total / earning.length) * 12),
    total: round2(total),
    months: earning.length,
  };
}
