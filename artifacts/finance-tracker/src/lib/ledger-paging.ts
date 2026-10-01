// The phone ledger pages a month at a time up to a fixed ceiling. The query
// always fetches one month past what is shown (the hero's same-point-last-
// month comparison needs it), so `monthsLoaded > monthsShown` is true for
// any account with more history than is on screen — including at the cap,
// where nothing will ever load. Held here so that rule has a test.
export const LEDGER_MONTH_CAP = 12;

export interface LedgerPaging {
  /** Paging can still do something: the sentinel should be live. */
  hasMoreToLoad: boolean;
  /** At the ceiling with older history beyond it: show a stop, not a spinner. */
  atCap: boolean;
}

export function ledgerPaging(monthsLoaded: number, monthsShown: number): LedgerPaging {
  const atCap = monthsShown >= LEDGER_MONTH_CAP && monthsLoaded > monthsShown;
  // Below the cap, one more month is always on offer even if the last fetch
  // came back empty — a gap in history is not proof nothing older exists.
  const hasMoreToLoad = !atCap && (monthsLoaded > monthsShown || monthsShown < LEDGER_MONTH_CAP);
  return { hasMoreToLoad, atCap };
}
