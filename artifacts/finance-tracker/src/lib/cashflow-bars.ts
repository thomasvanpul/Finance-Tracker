import type { DailyBalance } from "./lowest-so-far";

export type CashflowBar = {
  /** True when the balance is below £0 and the bar hangs down from the zero line. */
  below: boolean;
  /** Distance from the plot edge the bar grows away from to the zero line:
   *  the bottom edge for a bar above zero, the top edge for one below it. */
  offsetPct: number;
  heightPct: number;
};

export type CashflowGeometry = {
  /** Value at the plot's top rule — the highest balance, or £0 if none is positive. */
  top: number;
  /** Value at the plot's bottom rule — the lowest balance, or £0 if none is negative. */
  bottom: number;
  /** Where £0 sits, as a percentage down from the top rule. */
  zeroPct: number;
  bars: CashflowBar[];
};

const MIN_BAR_PCT = 1; // a day at exactly £0 still shows that it happened

/**
 * Bar geometry for HOME's daily cashflow chart. Length encodes value, so the
 * plot spans the highest balance to the lowest with £0 inside it: a day above
 * zero rises from that line and a day below hangs from it, both on one scale.
 */
export function cashflowBars(days: DailyBalance[]): CashflowGeometry {
  const top = Math.max(0, ...days.map((d) => d.balance));
  const bottom = Math.min(0, ...days.map((d) => d.balance));
  const span = top - bottom || 1;
  const zeroPct = (top / span) * 100;
  const bars = days.map((d) => {
    const below = d.balance < 0;
    return {
      below,
      offsetPct: below ? zeroPct : 100 - zeroPct,
      heightPct: Math.max(MIN_BAR_PCT, (Math.abs(d.balance) / span) * 100),
    };
  });
  return { top, bottom, zeroPct, bars };
}
