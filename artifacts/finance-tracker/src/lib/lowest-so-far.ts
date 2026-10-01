export type DailyBalance = { day: number; balance: number; future: boolean };

/**
 * The lowest balance this month has actually reached — the LIQUID strip's
 * LOW. Days that have not happened are left out: HOME's trough insight is
 * the screen's one forward-looking low ("Overdrawn by … on 7 Oct"), and a
 * strip LOW that could also pick a future day would be a second, unlabelled
 * projection sitting next to it.
 */
export function lowestSoFar(days: DailyBalance[]): DailyBalance | null {
  const past = days.filter((d) => !d.future);
  return past.length ? past.reduce((lo, d) => (d.balance < lo.balance ? d : lo)) : null;
}
