// Pure date logic for the phone's UPCOMING tab and Home's COMING list.
//
// Everything here works on calendar dates (YYYY-MM-DD). "Today" is the
// user's LOCAL date, not the UTC one: between midnight and 01:00 BST a
// toISOString() "today" is yesterday, which would call a bill due today
// overdue. Day arithmetic is done in UTC so a DST change inside a week
// cannot shift a date by one.

const DAY_MS = 86_400_000;

export function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function utc(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

function addUtcDays(iso: string, n: number): string {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Days from today to `iso`: positive is future, negative is overdue. */
export function daysUntil(iso: string, now: Date): number {
  return Math.round((utc(iso).getTime() - utc(localYmd(now)).getTime()) / DAY_MS);
}

/** Countdown chip text. An overdue item says how late it is, never TODAY. */
export function daysLabel(days: number): string {
  if (days < 0) return `${-days}D LATE`;
  if (days === 0) return "TODAY";
  if (days === 1) return "1 DAY";
  return `${days} DAYS`;
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const day = utc(iso).getUTCDay(); // 0 = Sun
  return addUtcDays(iso, day === 0 ? -6 : 1 - day);
}

/** "This week", "Next week", or "5 Oct – 11 Oct". */
export function weekLabel(mondayIso: string, now: Date): string {
  const thisMonday = weekStart(localYmd(now));
  if (mondayIso === thisMonday) return "This week";
  if (mondayIso === addUtcDays(thisMonday, 7)) return "Next week";
  const fmt = (iso: string) =>
    utc(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(mondayIso)} – ${fmt(addUtcDays(mondayIso, 6))}`;
}

export interface ScheduleGroup<T> {
  key: string;
  label: string;
  overdue: boolean;
  items: T[];
}

/**
 * Overdue items first, in one group of their own, then the rest by week.
 * An unpaid bill from 12 Sep is not part of "the week of 7 Sep" any more;
 * it is late, and the list says so before it says anything else.
 */
export function groupUpcoming<T extends { dueDate: string }>(
  items: readonly T[],
  now: Date,
): ScheduleGroup<T>[] {
  const today = localYmd(now);
  const sorted = [...items].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const overdue = sorted.filter((i) => i.dueDate < today);
  const byWeek = new Map<string, T[]>();
  for (const item of sorted) {
    if (item.dueDate < today) continue;
    const mon = weekStart(item.dueDate);
    byWeek.set(mon, [...(byWeek.get(mon) ?? []), item]);
  }
  const weeks = [...byWeek.entries()].map(([monday, groupItems]) => ({
    key: monday,
    label: weekLabel(monday, now),
    overdue: false,
    items: groupItems,
  }));
  return overdue.length > 0
    ? [{ key: "overdue", label: "Overdue", overdue: true, items: overdue }, ...weeks]
    : weeks;
}

/**
 * Base-currency total of the pending expenses dated before today.
 * `total` is null when any of them has no base equivalent: a sum that
 * silently drops a row is a different, plausible number.
 */
export function overdueOutgoings(
  items: readonly { dueDate: string; type: string; status: string; baseEquivalent: number | null }[],
  now: Date,
): { count: number; total: number | null } {
  const today = localYmd(now);
  const late = items.filter((i) => i.status === "pending" && i.type === "expense" && i.dueDate < today);
  if (late.some((i) => i.baseEquivalent == null)) return { count: late.length, total: null };
  const cents = late.reduce((s, i) => s + Math.round((i.baseEquivalent as number) * 100), 0);
  return { count: late.length, total: cents / 100 };
}

/**
 * Bills for Home's COMING list: dated today or later, nearest first.
 * A subscription whose nextDue has passed is not coming; it is either
 * paid and not yet rolled forward, or late. Neither belongs under
 * "known with certainty".
 */
export function comingBills<T extends { nextDue?: string | null }>(
  subs: readonly T[],
  now: Date,
  limit: number,
): (T & { nextDue: string })[] {
  const today = localYmd(now);
  return subs
    .filter((s): s is T & { nextDue: string } => !!s.nextDue && s.nextDue >= today)
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
    .slice(0, limit);
}
