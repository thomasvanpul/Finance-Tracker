// "Spent so far this month, against the same point last month."
//
// ── Why this is one module and not two implementations ──────────────────────
// The phone's SPENDING hero has compared month-to-date against the SAME
// POINT last month since it shipped. The desktop dashboard's MoM SPEND cell
// compared month-to-date against the WHOLE of last month, so on 16 September
// it divided 16 days of spending by 31 days of spending and printed the
// result as a month-on-month change. On seed data that is the difference
// between -96.0% (40.45 against 1,008.18, being 1-16 August) and -96.9%
// (40.45 against the whole month's 1,325.81): not a rounding difference, a
// different question answered with the same label.
//
// The fix is not a second copy of the phone's arithmetic. Three copies of
// the net-worth delta is how this repo learned that lesson, and the version
// that drifts is never the one anybody is looking at. So the rule lives
// here once, the phone hero calls it, and the desktop cell calls it.
//
// ── The rule ────────────────────────────────────────────────────────────────
// Two windows over the same ledger:
//   mtd                 1st of this month  →  today
//   lastMonthSamePoint  1st of last month  →  the same day-of-month last month
//
// The second bound is clamped to the last day of the previous month when
// today is later than that month has days (31 March → 28/29 February).
// Overflowing into April would compare 31 March with 3 May, which is not the
// same point.
//
// ── Nulls ───────────────────────────────────────────────────────────────────
// Either side goes null if ANY row inside its window has a null
// baseEquivalent. Summing an unconvertible row as zero understates the total
// by an unknown amount and renders identically to a real figure, which is the
// defect class CLAUDE.md names first. A null side means the caller renders
// "no comparison", never a number it cannot stand behind.

export interface SamePointRow {
  type: string;
  date: string;
  baseEquivalent?: number | null;
}

export interface SamePointSpend {
  /** Sum of expenses from the 1st of this month to today. Null if any row
   *  in the window could not be converted to base. */
  mtd: number | null;
  /** Sum of expenses over the same span of last month. Same null rule. */
  lastMonthSamePoint: number | null;
  /** The closing bound of the comparison window, YYYY-MM-DD. Callers label
   *  the span with it — an unlabelled comparison is the thing being fixed. */
  sameDayLastIso: string;
}

/** YYYY-MM-DD from LOCAL calendar fields. Not toISOString(): east of
 *  Greenwich that names yesterday's UTC date and silently shifts every
 *  window by a day. See getPrevMonthBounds in pages/dashboard.tsx for the
 *  bug this idiom caused there. */
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfMonthNBack(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() - n, 1);
}

// Same day-of-month in the previous month, clamped to the last day of the
// previous month when today is later than the prev month has days (e.g.
// today = Mar 31 → prev = Feb 28/29).
export function sameDayInPrevMonth(now: Date): Date {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const lastDayOfPrev = new Date(y, m, 0).getDate();
  return new Date(y, m - 1, Math.min(d, lastDayOfPrev));
}

/** "30 JUL" — for "more/less than by 30 Jul". */
export function sameDayLabel(iso: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  const d = new Date(y ?? 0, (m ?? 1) - 1, day ?? 1);
  return `${day} ${d.toLocaleString(undefined, { month: "short" }).toUpperCase()}`;
}

/**
 * Partition `rows` into the two windows and sum the expenses in each.
 *
 * `rows` may span more than the two windows — anything outside them is
 * ignored, so a caller can pass a whole ledger, or two separate queries
 * concatenated, without pre-filtering. Rows for which `skip` returns true
 * are dropped before either sum (the phone passes its optimistic
 * pending-delete set through it).
 */
export function samePointSpend<T extends SamePointRow>(
  rows: readonly T[],
  now: Date,
  skip?: (row: T) => boolean,
): SamePointSpend {
  const todayIso = ymd(now);
  const startCurIso = ymd(startOfMonth(now));
  const startLastIso = ymd(startOfMonthNBack(now, 1));
  const sameDayLastIso = ymd(sameDayInPrevMonth(now));

  let mtdSum = 0, mtdUnconv = false;
  let lastSum = 0, lastUnconv = false;
  for (const row of rows) {
    if (skip?.(row)) continue;
    if (row.type !== "expense") continue;
    if (row.date >= startCurIso && row.date <= todayIso) {
      if (row.baseEquivalent == null) mtdUnconv = true;
      else mtdSum += Math.abs(row.baseEquivalent);
    } else if (row.date >= startLastIso && row.date <= sameDayLastIso) {
      if (row.baseEquivalent == null) lastUnconv = true;
      else lastSum += Math.abs(row.baseEquivalent);
    }
  }

  return {
    mtd: mtdUnconv ? null : mtdSum,
    lastMonthSamePoint: lastUnconv ? null : lastSum,
    sameDayLastIso,
  };
}
