// The whole-portfolio day change, folded from its per-position legs.
//
// One rule, the same one the rest of the app follows: an unknown leg makes
// the total unknown. A leg is unknown when its delta or baseline value could
// not be resolved, AND when the session its baseline comes from is not dated
// or is not the same session as every other leg's.
//
// The second half is why this is its own module. Before 2026-09-16 the fold
// summed any legs that had numbers and dated the total by the OLDEST leg, so
// a Monday portfolio of equities (close-to-close from Friday) plus bitcoin
// (baseline from Yahoo's chartPreviousClose over a 5-day window, roughly six
// days back, and undated) printed one figure labelled SINCE 11 SEP that was
// exact for the equities and false for the crypto. A sum over mismatched
// spans is not a day change of anything, so it is not shown.

export interface DayChangeLeg {
  dayBase: number | null;
  dayPrevBase: number | null;
  /** YYYY-MM-DD of the session the baseline was taken from, or null when the
   *  baseline carries no date (a live quote's previous close). */
  dayFromSession: string | null;
}

export interface DayChange {
  dayChangeBase: number | null;
  dayChangePrevValueBase: number | null;
  /** The one session every leg is measured from. Null with the delta. */
  dayChangeFromSession: string | null;
}

const UNKNOWN: DayChange = { dayChangeBase: null, dayChangePrevValueBase: null, dayChangeFromSession: null };

export function foldDayChange(legs: ReadonlyArray<DayChangeLeg>): DayChange {
  // Nothing held: a real zero, and nothing to date it by.
  if (legs.length === 0) return { dayChangeBase: 0, dayChangePrevValueBase: 0, dayChangeFromSession: null };

  const session = legs[0].dayFromSession;
  let dayChangeBase = 0;
  let dayChangePrevValueBase = 0;
  for (const leg of legs) {
    if (leg.dayBase == null || leg.dayPrevBase == null) return UNKNOWN;
    if (leg.dayFromSession == null || leg.dayFromSession !== session) return UNKNOWN;
    dayChangeBase += leg.dayBase;
    dayChangePrevValueBase += leg.dayPrevBase;
  }
  return { dayChangeBase, dayChangePrevValueBase, dayChangeFromSession: session };
}
