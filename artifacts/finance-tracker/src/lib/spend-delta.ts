// The month-on-month line under the phone SPENDING hero.
//
// It once read "−£1,272.76 less than by 27 AUG": the sign said less and
// the word said less again, and the pair read as a double negative. The
// direction is carried once, by the word; the amount is always unsigned.

export type SpendDelta =
  | { kind: "same"; day: string }
  | { kind: "more" | "less"; abs: number; day: string };

/** "27 Aug" from YYYY-MM-DD, read as a calendar date. */
export function shortDay(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function spendDelta(mtd: number, lastMonthSamePoint: number, sameDayIso: string): SpendDelta {
  const day = shortDay(sameDayIso);
  const cents = Math.round(mtd * 100) - Math.round(lastMonthSamePoint * 100);
  if (cents === 0) return { kind: "same", day };
  return { kind: cents > 0 ? "more" : "less", abs: Math.abs(cents) / 100, day };
}
