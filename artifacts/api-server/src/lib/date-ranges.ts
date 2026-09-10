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

// ── Day windows ─────────────────────────────────────────────────────────────
//
// Added 2026-09-11, after THREE live implementations of "the next 30 days"
// were found running at once:
//
//   dashboard.ts:398-402   localDateString + setDate(+30)   local, calendar
//   upcoming.ts:71-72      toISOString().slice(0, 10)       UTC
//   ai-context.ts:154-162  now.getTime() + 30 * 86_400_000  ms arithmetic
//
// At the moment they were measured, server-local was 2026-09-11 and UTC was
// 2026-09-10, so /upcoming/summary was querying [2026-09-10, 2026-10-10]
// while /dashboard queried [2026-09-11, 2026-10-11]. Two different windows,
// same instant, same user. They agreed on the total only because no pending
// row happened to fall on a boundary date — masked by seed data, not absent.
//
// Two rules, and the lock test (date-window-source.lock.test.ts) enforces
// both at source level so this cannot be fixed a third time:
//
//   1. LOCAL, not UTC. A user's "today" is the date on their wall clock.
//      toISOString() is UTC and is off by a day for eight hours out of every
//      twenty-four at UTC+8, which is where this app is developed and where
//      one of its four seed currencies lives.
//
//   2. CALENDAR arithmetic, not milliseconds. `days * 86_400_000` assumes
//      every day is 86,400 seconds. Across a DST transition one is 82,800
//      and one is 90,000, so a 30-day window built from milliseconds lands
//      on the wrong calendar day for half the year. setDate() shifts the
//      calendar day and lets the Date object resolve the clock, which is the
//      whole reason it exists.

export interface DayWindow {
  from: string;   // YYYY-MM-DD, inclusive
  to: string;     // YYYY-MM-DD, inclusive
}

// Shift by whole calendar days in local time. Not exported as the primary
// interface — prefer the window helpers, which give a caller no way to build
// half a window out of one of these and half out of something else.
function addLocalDays(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

// The local day containing `anchor`, plus the next `days` calendar days.
// Both ends inclusive, which is what every `gte(col, from) AND lte(col, to)`
// query in this codebase already assumes.
export function forwardWindow(anchor: Date, days: number): DayWindow {
  return { from: localDateString(anchor), to: localDateString(addLocalDays(anchor, days)) };
}

// The `days` calendar days before the local day containing `anchor`, up to
// and including that day.
export function trailingWindow(anchor: Date, days: number): DayWindow {
  return { from: localDateString(addLocalDays(anchor, -days)), to: localDateString(anchor) };
}

// YYYY-MM for a Date, in local time. The month-key counterpart to
// localDateString, and the reason monthRange already avoids toISOString.
export function localMonthString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

// Add whole calendar months to a YYYY-MM-DD string, entirely in UTC.
//
// A date STRING has no timezone, so it must not be routed through a
// local-time Date on the way to being shifted: `new Date("2026-03-01")`
// parses as UTC midnight, and at UTC-5 that is 19:00 on 2026-02-28, so a
// local getDate()/setDate() round-trip returns the wrong day. Anchoring on
// Date.UTC keeps the arithmetic in the same frame the string was written in.
//
// Day-of-month overflow follows JS: 2026-01-31 plus one month is 2026-03-03,
// not 2026-02-28. That is the behaviour the installment generator already
// had, preserved deliberately — clamping is a product decision, not a
// timezone fix, and belongs in its own change.
export function addCalendarMonths(dateStr: string, months: number): string {
  const d = new Date(Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10)));
  d.setUTCMonth(d.getUTCMonth() + months);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
