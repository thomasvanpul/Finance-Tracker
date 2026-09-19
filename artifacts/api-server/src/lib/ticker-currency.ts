// The currency a ticker's cost basis was entered in, inferred from its
// exchange suffix — used only when no live/EOD price is available to
// supply a currency (lib/market-eod.ts's ValuationPrices map is empty
// with ENABLE_MARKET_DATA off, or a provider outage). This is NOT a
// fetched or invented value: it mirrors the same suffix table the entry
// form uses to label "Cost per Share" at the moment the user types it
// (artifacts/finance-tracker/src/pages/investments/types.ts,
// EXCHANGE_SUFFIXES / detectExchange) — the API server and the SPA are
// separate deployables with no shared runtime package for this table, so
// it is duplicated here rather than imported. Keep the two in sync by hand.
const EXCHANGE_SUFFIX_CURRENCY: Record<string, string> = {
  ".L": "GBP", ".TO": "CAD", ".AX": "AUD", ".HK": "HKD", ".DE": "EUR",
  ".PA": "EUR", ".AM": "EUR", ".BR": "EUR", ".LS": "EUR", ".MI": "EUR",
  ".MC": "EUR", ".SS": "CNY", ".SZ": "CNY", ".NS": "INR", ".BO": "INR",
  ".T": "JPY", ".SW": "CHF", ".ST": "SEK", ".NZ": "NZD", ".SG": "SGD",
  ".JO": "ZAR", ".MX": "MXN", ".SR": "SAR",
};

/** The currency a ticker's cost basis was entered in. No recognised suffix
 *  means a US-listed ticker, entered in USD — the same default the entry
 *  form falls back to. */
export function nativeCurrencyForTicker(ticker: string): string {
  const upper = ticker.toUpperCase();
  for (const [suffix, currency] of Object.entries(EXCHANGE_SUFFIX_CURRENCY)) {
    if (upper.endsWith(suffix)) return currency;
  }
  return "USD";
}
