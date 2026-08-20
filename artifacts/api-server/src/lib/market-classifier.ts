// Ticker → asset class → coverable providers.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// Two callers need to know "which providers can even attempt this ticker":
//
//   1. The quote chain, so it doesn't call Alpaca for a =F future (Alpaca
//      would 404 which trips the breaker for callers Alpaca CAN serve).
//   2. The UI banner, so a user holding an LSE stock learns "no free-tier
//      provider covers LSE quotes" rather than a generic "unavailable"
//      that reads as "the app is broken."
//
// A ticker's covering providers is a static property of the symbol shape
// (=F, =X, ^, exchange-suffix) crossed with the provider capability
// declaration below. Runtime state (a provider being down, out of credits,
// or unconfigured) is layered on top by the chain — it's not part of
// classification.
//
// ── Twelve Data on free ("trial symbols") ──────────────────────────────────
// The pricing page lists 3 markets on Basic and "trial symbols" for
// premium exchanges. We list non-US equities as coverable by twelvedata
// because SOME symbols work on trial. The adapter attempts and logs a
// clear failure per symbol if the endpoint returns 401/403. Upgrading to
// Grow ($29/mo) would unlock 20+ markets and make LSE/HKEX/Xetra fully
// coverable — the coverage table would not need to change, only the
// runtime success rate.
//
// Futures and global indices are marked YAHOO-ONLY: Twelve Data indices
// and commodities on free tier are also trial-only, but the symbol
// rewriter would need per-symbol aliases (WTI/USD, XAU/USD, IXIC vs SPY,
// etc.) that we're not building until there's a paid tier to justify it.
// Better to be honest that these have no fallback than pretend a lane
// exists that would 90% fail.

export type TickerKind =
  | "us_equity"
  | "us_etf"          // structurally indistinguishable from us_equity by symbol; kept for future
  | "crypto"
  | "forex"
  | "futures"
  | "index"
  | "non_us_equity";

export type ProviderName = "yahoo" | "alpaca" | "polygon" | "twelvedata" | "frankfurter";

// Symbol-shape rules. Order matters — futures/forex/index tests come before
// exchange-suffix tests because .F / .X / ^ / -USD are more specific than a
// bare dot.
export function classifyTicker(ticker: string): TickerKind {
  const t = ticker.trim().toUpperCase();
  if (t.endsWith("=F")) return "futures";
  if (t.endsWith("=X")) return "forex";
  if (t.startsWith("^")) return "index";
  // Crypto pairs on Yahoo carry a quote-currency suffix. -USDT / -EUR are
  // rare in the current OVERVIEW_TICKERS but supported for completeness.
  if (/-(USD|USDT|EUR|GBP|BTC|ETH)$/.test(t)) return "crypto";
  // Exchange suffix on Yahoo notation: `.L` (LSE), `.HK` (HKEX), `.KL`
  // (Bursa Malaysia), `.T` (TSE), etc. Match 1-3 uppercase letters after
  // a dot at end of symbol. BRK-B (class shares) uses a hyphen, not a
  // dot, so this test does not match it.
  if (/\.[A-Z]{1,3}$/.test(t)) return "non_us_equity";
  return "us_equity";
}

// Which providers can serve which kind on their free tier. This is the
// STATIC capability declaration — runtime state (breaker open, no key,
// budget exhausted) is applied by the chain on top of this list.
export const PROVIDER_COVERAGE: Record<TickerKind, ProviderName[]> = {
  us_equity:     ["yahoo", "alpaca", "polygon", "twelvedata"],
  us_etf:        ["yahoo", "alpaca", "polygon", "twelvedata"],
  crypto:        ["yahoo", "alpaca", "polygon", "twelvedata"],
  forex:         ["yahoo", "twelvedata"],
  futures:       ["yahoo"], // no free-tier alternative
  index:         ["yahoo"], // no free-tier alternative
  non_us_equity: ["yahoo", "twelvedata"], // twelvedata is "trial symbols" on free — best effort
};

/**
 * Return the ordered list of providers that could theoretically quote this
 * ticker on their free tier. The chain walks this list in order, skipping
 * providers whose breaker is open, key is missing, or budget is exhausted.
 * If the returned list has length 1 and that one lane fails, there is no
 * fallback — the UI should surface that fact specifically.
 */
export function providersFor(ticker: string): ProviderName[] {
  return PROVIDER_COVERAGE[classifyTicker(ticker)];
}

/**
 * Human-readable "why can't we quote this" reason for the UI banner. Called
 * only when EVERY covering provider has already failed for this ticker.
 * The message is deliberately specific about the asset class rather than
 * saying "unavailable" — the user should learn what class of ticker has
 * no free fallback rather than think the whole app is broken.
 */
export function orphanReason(ticker: string): string {
  const kind = classifyTicker(ticker);
  switch (kind) {
    case "futures":
      return `no free-tier provider covers commodity futures (${ticker}) — needs paid Polygon Futures or Twelve Data Pro`;
    case "index":
      return `no free-tier provider covers global indices (${ticker}) — needs paid data`;
    case "non_us_equity":
      return `no reliable free-tier provider covers ${ticker.match(/\.([A-Z]{1,3})$/)?.[1] ?? "this exchange"} quotes — needs Twelve Data Grow or Finnhub All-in-one`;
    case "forex":
      return `${ticker}: Yahoo throttled and Twelve Data unavailable`;
    default:
      return `${ticker}: all quote providers failed`;
  }
}
