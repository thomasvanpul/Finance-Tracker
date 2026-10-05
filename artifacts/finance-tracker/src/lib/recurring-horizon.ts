// What a pending item actually costs inside a 30-, 60- or 90-day horizon.
//
// `upcoming` holds at most ONE future occurrence per subscription — the
// api-server generates "one row ahead, not a horizon" on purpose, so that
// committedOut counts each subscription at most once per window
// (artifacts/api-server/src/lib/subscription-recurrence.ts, the note at
// the top of that file). A COMMITMENT figure wants exactly that.
//
// A FORECAST does not. /upcoming's forecast panel summed the pending rows
// under each cutoff, and because every pending row already falls inside 30
// days, 30D, 60D and 90D all read NET CHANGE -£1,232.95 — the same monthly
// bills, never repeating into the later horizons. Measured 5 Oct 2026.
//
// So a projection expands each pending item by its own `frequency`, here,
// without writing anything. The arithmetic mirrors `occurrenceAt` in the
// server module named above, including the two rules worth restating:
//
//   - every occurrence is computed from the ANCHOR, never from the previous
//     occurrence, so a Jan 31 monthly does not walk Jan 31 → Feb 28 → Mar 28
//     and lose the 31st permanently;
//   - a monthly anchored past the end of a short month CLAMPS to that
//     month's last day rather than rolling into the next one.
//
// Kept as a mirror rather than an import because the client cannot import
// from the api-server package; if a third consumer appears, this belongs in
// a shared workspace lib.

export type HorizonFrequency = "one-time" | "weekly" | "monthly" | "quarterly" | "yearly";

export interface PendingItemLike {
  dueDate: string;
  description?: string;
  type: string;
  frequency?: string | null;
  status: string;
  baseEquivalent: number | null;
}

export interface Occurrence {
  date: string;
  description: string;
  /** "income" or "expense", as the item carries it. */
  type: string;
  /** Always a positive magnitude; `type` carries the direction. */
  amount: number;
  /** False for the dated row itself, true for a repeat this module projected. */
  projected: boolean;
}

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function toIso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addMonthsClamped(iso: string, n: number, anchorDay: number): string {
  const parsed = parseIso(iso);
  if (!parsed) return iso;
  const total = parsed.y * 12 + (parsed.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return toIso(y, m, Math.min(anchorDay, daysInMonth(y, m)));
}

export function addDaysIso(iso: string, n: number): string {
  const parsed = parseIso(iso);
  if (!parsed) return iso;
  const d = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d) + n * 86_400_000);
  return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** The occurrence at step `i` of a rule anchored at `anchor`. */
export function occurrenceAt(anchor: string, frequency: HorizonFrequency, i: number): string | null {
  const parsed = parseIso(anchor);
  if (!parsed) return null;
  switch (frequency) {
    case "weekly": return addDaysIso(anchor, i * 7);
    case "monthly": return addMonthsClamped(anchor, i, parsed.d);
    case "quarterly": return addMonthsClamped(anchor, i * 3, parsed.d);
    case "yearly": return addMonthsClamped(anchor, i * 12, parsed.d);
    case "one-time": return i === 0 ? anchor : null;
  }
}

const FREQUENCIES = new Set<HorizonFrequency>(["one-time", "weekly", "monthly", "quarterly", "yearly"]);

function asFrequency(raw: string | null | undefined): HorizonFrequency {
  // An unrecognised frequency repeats nothing. Guessing "monthly" would
  // invent outgoings; one occurrence is what the row itself says.
  return raw != null && FREQUENCIES.has(raw as HorizonFrequency) ? (raw as HorizonFrequency) : "one-time";
}

/** A ceiling on the walk. A weekly rule over 90 days needs 14. */
const MAX_STEPS = 400;

export function todayIso(now: Date = new Date()): string {
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/**
 * Every occurrence of every pending item from today to `horizonDays` out.
 *
 * Items that are not pending, that are dated before today, or whose FX
 * conversion is unavailable are skipped — an unconvertible item leaves the
 * forecast under-stated rather than fabricated, which is the convention the
 * old `computeForecast` already used.
 */
export function occurrencesInHorizon(
  items: readonly PendingItemLike[],
  horizonDays: number,
  now: Date = new Date(),
): Occurrence[] {
  const today = todayIso(now);
  const end = addDaysIso(today, horizonDays);
  const out: Occurrence[] = [];

  for (const item of items) {
    if (item.status !== "pending") continue;
    if (item.baseEquivalent == null) continue;
    const frequency = asFrequency(item.frequency);
    const amount = Math.abs(item.baseEquivalent);
    const description = item.description ?? "";
    for (let i = 0; i < MAX_STEPS; i++) {
      const date = occurrenceAt(item.dueDate, frequency, i);
      if (date == null) break;
      if (date > end) break;
      if (date >= today) {
        out.push({ date, description, type: item.type, amount, projected: i > 0 });
      }
    }
  }

  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

/** Net change across a horizon: income adds, everything else subtracts. */
export function horizonNet(
  items: readonly PendingItemLike[],
  horizonDays: number,
  now: Date = new Date(),
): number {
  const net = occurrencesInHorizon(items, horizonDays, now).reduce(
    (sum, o) => sum + (o.type === "income" ? o.amount : -o.amount),
    0,
  );
  return Math.round(net * 100) / 100;
}
