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
// clear failure per symbol if the endpoint returns 401/403.
//
// What an upgrade would actually buy (checked 2026-09-06 against
// twelvedata.com/pricing and twelvedata.com/exchanges?level=grow):
//   • Grow  $29/mo — "20+ markets". The exchange directory lists London
//     Stock Exchange (XLON) at minimum plan Grow, delivery EOD. So Grow
//     buys END-OF-DAY LSE, not a live quote.
//   • Pro   $99/mo — "70+ markets, Real-time EU market data". Real-time
//     LSE is a Pro feature, not a Grow one.
// This comment previously said Grow would make "LSE/HKEX/Xetra fully
// coverable", which would have bought the wrong tier for a live-quote
// requirement: Grow's LSE is EOD. HKEX and Xetra are not asserted here —
// check each in the exchange directory before spending, because delivery
// type varies per exchange independently of the plan.
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
  // `^` is Yahoo's index notation; `I:` is Polygon's.
  if (t.startsWith("^") || t.startsWith("I:")) return "index";
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

// ── Index levels are refused, not merely unquoted ───────────────────────────
// An index level (S&P 500, FTSE 100, Nikkei …) is a proprietary benchmark.
// The index owner licenses the number itself, separately from whoever sells
// the feed, and none of the 17 sources checked on 2026-09-06 licenses it for
// free. So "index" is not a lane with a missing provider the way futures or
// LSE quotes are; it is a class the app does not display. market.ts refuses
// it before any provider is called, and routes/market.ts answers 451.
//
// The symbol shape is NOT sufficient on its own. Yahoo's quoteType and chart
// instrumentType were probed on 2026-09-11 and report INDEX for symbols with
// no caret at all: 000001.SS (SSE Composite), 000300.SS (CSI 300), DX-Y.NYB
// (ICE US Dollar Index), IMOEX.ME (MOEX Russia). Those are caught on the
// provider's own answer by isIndexInstrumentType. Alpaca, Polygon and Twelve
// Data rows carry no instrument type, so a no-caret index reaching one of
// them — only possible when Yahoo did not answer for it — cannot be caught
// this way.
//
// Stock and ETF prices are a different problem and are not refused here.
// SPY and VUSA.L track the S&P 500 but are ETFs (Yahoo: ETF), and stay.
export const INDEX_LEVEL_REFUSED = "index_level_unlicensed";

export function isIndexSymbol(ticker: string): boolean {
  return classifyTicker(ticker) === "index";
}

export function isIndexInstrumentType(type: unknown): boolean {
  return typeof type === "string" && type.trim().toUpperCase() === "INDEX";
}

export function indexRefusalReason(tickers: readonly string[]): string {
  const subject = tickers.length === 1
    ? `${tickers[0]} is a market index`
    : `${tickers.join(", ")} are market indices`;
  return `${subject}. Index levels are licensed by the index owner, and this app does not hold that licence, so it does not show them.`;
}

// The 451 body. `error` is written to be shown to the user as it stands.
export interface IndexRefusalBody {
  error: string;
  code: typeof INDEX_LEVEL_REFUSED;
  refused: string[];
}

export function indexRefusalBody(refused: string[]): IndexRefusalBody {
  return { error: indexRefusalReason(refused), code: INDEX_LEVEL_REFUSED, refused };
}

export class IndexLevelRefusedError extends Error {
  readonly code = INDEX_LEVEL_REFUSED;
  readonly ticker: string;
  constructor(ticker: string) {
    super(indexRefusalReason([ticker]));
    this.name = "IndexLevelRefusedError";
    this.ticker = ticker;
  }
}

// Which providers can serve which kind on their free tier. This is the
// STATIC capability declaration — runtime state (breaker open, no key,
// budget exhausted) is applied by the chain on top of this list.
export const PROVIDER_COVERAGE: Record<TickerKind, ProviderName[]> = {
  us_equity:     ["yahoo", "alpaca", "polygon", "twelvedata"],
  us_etf:        ["yahoo", "alpaca", "polygon", "twelvedata"],
  crypto:        ["yahoo", "alpaca", "polygon", "twelvedata"],
  // frankfurter is LAST deliberately: it is an ECB daily reference
  // fixing, not a live quote. It is the honest floor under the forex
  // lane when Yahoo (throttled) and Twelve Data (breaker open) both
  // fail, not a peer of either. The adapter stamps updatedAt with the
  // actual fixing instant and tags provider:"frankfurter" so the UI can
  // say so rather than passing yesterday's fixing off as a live rate.
  forex:         ["yahoo", "twelvedata", "frankfurter"],
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
      return `no reliable free-tier provider covers ${ticker.match(/\.([A-Z]{1,3})$/)?.[1] ?? "this exchange"} quotes — needs Twelve Data Pro for real-time (Grow is end-of-day) or Finnhub All-in-one`;
    case "forex":
      return `${ticker}: Yahoo throttled, Twelve Data unavailable, and the pair is outside the ECB reference set Frankfurter publishes`;
    default:
      return `${ticker}: all quote providers failed`;
  }
}
