// Build YYYY-MM keys and YYYY-MM-DD ranges strictly from LOCAL time.
//
// The dashboard used to mix `Date.toISOString().slice(0, 7)` (which is UTC)
// with `Date.getMonth()` (which is local). At UTC+8 a `new Date(2026, 1, 1)`
// (Feb 1 local) becomes "2026-01-31" in ISO, so the month key printed
// "2026-01" while `getMonth() + 1` still said 2 (March). Combined with the
// month-end lookup, we generated ranges like `2026-02-31` (Postgres rejects)
// and off-by-one ranges like `2026-05-30` (queried May while intending June).
//
// These helpers do everything from local getters and never call toISOString,
// so the two components can't drift apart.

export interface MonthRange {
  month: string;   // YYYY-MM
  from: string;    // YYYY-MM-01
  to: string;      // YYYY-MM-<last day of month>
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function daysInMonth(year: number, monthIndex: number): number {
  // Day 0 of next month = last day of this month, computed via local time.
  return new Date(year, monthIndex + 1, 0).getDate();
}

// Range for the month containing `date` (local time).
export function monthRange(date: Date): MonthRange {
  const year = date.getFullYear();
  const monthIndex = date.getMonth();
  const month = `${year}-${pad(monthIndex + 1)}`;
  return {
    month,
    from: `${month}-01`,
    to: `${month}-${pad(daysInMonth(year, monthIndex))}`,
  };
}

// The last `count` months up to and including the month containing `now`,
// oldest first. Used for dashboard.monthlyHistory (6 months).
export function trailingMonthRanges(now: Date, count: number): MonthRange[] {
  const ranges: MonthRange[] = [];
  const year = now.getFullYear();
  const monthIndex = now.getMonth();
  for (let i = count - 1; i >= 0; i--) {
    // new Date normalises negative or overflow monthIndex correctly.
    ranges.push(monthRange(new Date(year, monthIndex - i, 1)));
  }
  return ranges;
}

// YYYY-MM-DD for a Date, in local time. Used where we need "today" as a
// date string that matches what users think of as today, not what UTC says.
export function localDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
