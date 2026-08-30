import { logger } from "./logger";
import {
  registerProvider,
  withProvider,
  ProviderUnavailableError,
  CreditBudgetExhaustedError,
} from "./provider-health";

// yahoo-finance2 v3: default export is the YahooFinance class — must be instantiated
// eslint-disable-next-line @typescript-eslint/no-require-imports
const YahooFinance = require("yahoo-finance2").default;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let yahooFinance: any = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

// ── Provider registration ───────────────────────────────────────────────────
// Registered once at module load. Environment presence is captured now; if a
// key is added at runtime, the process must restart to pick it up (Render
// restarts on env change anyway, so this is not a live-config concern).
//
// Twelve Data is intentionally registered even when unconfigured — the health
// endpoint should surface "provider offline: no key" as a diagnosable state,
// not silently omit it. Same rule as auth-providers listing providers as
// unavailable rather than hiding them.
registerProvider({ name: "yahoo", configured: true });
registerProvider({ name: "frankfurter", configured: true });
registerProvider({ name: "alpaca", configured: !!(process.env.ALPACA_KEY_ID && process.env.ALPACA_SECRET_KEY) });
registerProvider({ name: "polygon", configured: !!process.env.POLYGON_API_KEY });
registerProvider({
  name: "twelvedata",
  configured: !!process.env.TWELVEDATA_API_KEY,
  // Free-tier "Basic" ceiling. Adjust if the plan is upgraded (Grow = 55/min,
  // budgets scale accordingly). withProvider enforces a 95% soft cap so we
  // stop at ~760 rather than 800.
  creditsBudget: 800,
});

// Test seam. Vitest cannot cleanly mock a top-level `require(...)` call —
// vi.mock intercepts ES imports, not CommonJS require paths — so tests
// that need to force a Yahoo failure (see fx-honesty.test.ts) call
// __setYahooForTesting(stub) to inject an object whose .quote()
// method throws. Production code never touches this.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// Test helper — inject an FxRatesData directly into the cache and
// mark it fresh so snapshotFxRate / txToBase / toBase read it without
// hitting Yahoo or Frankfurter. Mirrors __setYahooForTesting for
// tests that want to exercise the FX consumers rather than the
// providers. Call with a mutated rates map + fresh updatedAt to
// simulate the ringgit moving between reads.
export function __setFxCacheForTesting(data: FxRatesData): void {
  fxCache = { data, ts: Date.now() };
}

export function __setYahooForTesting(stub: any): void {
  yahooFinance = stub;
  // Bust every cache so the injected failure surfaces immediately.
  fxCache = null;
  quoteCache.clear();
  stockCache.clear();
}

// Types now live in market-types.ts so market-adapters.ts can import them
// without pulling yahoo-finance2 through a circular path. Re-exported here
// so every existing caller (routes, consumers, tests) keeps working
// against the same import path.
export type { FxRatesData, StockPriceData, StockQuoteData } from "./market-types";
import type { FxRatesData, StockPriceData, StockQuoteData } from "./market-types";
import { classifyTicker, providersFor, orphanReason, type ProviderName } from "./market-classifier";
import { alpacaFetchPrices, polygonFetchPrices, twelveDataFetchPrices, priceToQuote } from "./market-adapters";

// Cache entries
let fxCache: { data: FxRatesData; ts: number } | null = null;
const stockCache = new Map<string, { data: StockPriceData; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// GBP-based FX pairs on Yahoo Finance
const FX_PAIRS: Record<string, string> = {
  USD: "GBPUSD=X",
  EUR: "GBPEUR=X",
  MYR: "GBPMYR=X",
  CNY: "GBPCNY=X",
  JPY: "GBPJPY=X",
  AUD: "GBPAUD=X",
  CAD: "GBPCAD=X",
  SGD: "GBPSGD=X",
  HKD: "GBPHKD=X",
  THB: "GBPTHB=X",
  INR: "GBPINR=X",
};

// Yahoo FX path — the original getter, now used as the first provider in
// the chain. Kept per-pair-parallel because Yahoo does not offer a batch
// quote endpoint for FX symbols and running them serially would multiply
// the tail latency by 11.
async function fxRatesFromYahoo(): Promise<Record<string, number>> {
  return withProvider("yahoo", async () => {
    const rates: Record<string, number> = {};
    await Promise.all(
      Object.entries(FX_PAIRS).map(async ([ccy, symbol]) => {
        try {
          const quote = await yahooFinance.quote(symbol);
          const price = quote?.regularMarketPrice ?? null;
          if (typeof price === "number" && price > 0) {
            rates[ccy] = price;
          }
        } catch (err) {
          // Per-symbol failure logged but doesn't fail the whole batch —
          // Yahoo may still cover 10 of 11 pairs. If ZERO come back the
          // outer throw below triggers the circuit breaker.
          logger.warn({ err, symbol }, "yahoo FX pair failed");
        }
      })
    );
    // Fail the whole provider call if we got NOTHING — that's the signal
    // Yahoo is broadly throttling us. A partial result (say 7 of 11)
    // still counts as success for the breaker; the missing 4 will be
    // filled by Frankfurter below.
    if (Object.keys(rates).length === 0) {
      throw new Error("yahoo returned no FX rates");
    }
    return rates;
  });
}

// Frankfurter — free, unauthenticated, ECB reference rates. Daily
// granularity. Covers every currency in FX_PAIRS. Endpoint returns a
// single JSON object with a `rates` map so one HTTP call fills all
// missing currencies — no per-pair loop needed.
//
// Reference: https://frankfurter.dev/ (open source, self-hostable if
// the public instance ever moves).
interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}
async function fxRatesFromFrankfurter(missing: string[]): Promise<Record<string, number>> {
  if (missing.length === 0) return {};
  return withProvider("frankfurter", async () => {
    const url = `https://api.frankfurter.dev/v1/latest?base=GBP&symbols=${missing.join(",")}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);
    const body = (await res.json()) as FrankfurterResponse;
    // Frankfurter returns whole numbers as integers ("USD":1) and
    // fractional ones as floats. Trust its output shape; a missing
    // currency simply doesn't appear in `rates`, which we handle by
    // leaving the outer rates map untouched for that currency.
    const out: Record<string, number> = {};
    for (const [ccy, rate] of Object.entries(body.rates ?? {})) {
      if (typeof rate === "number" && rate > 0) out[ccy] = rate;
    }
    return out;
  });
}

export async function getFxRates(): Promise<FxRatesData> {
  const now = Date.now();
  if (fxCache && now - fxCache.ts < CACHE_TTL_MS) return fxCache.data;

  // Chain: Yahoo first (real-time, matches historical behaviour), then
  // Frankfurter for anything Yahoo missed (daily ECB rate — fine for a
  // personal-finance conversion, and it's what most consumer FX tools
  // show as "today's rate" on weekends anyway).
  //
  // Only real numbers land in this map. Neither provider can substitute
  // a fabricated fallback: the 11 hardcoded rates that used to live in
  // this function silently lied in aggregate — every converted figure
  // in the product depended on them, and the RM 4,120 → £4,120 defect
  // grew out of exactly that class of mistake. See CLAUDE.md's "never
  // show a number the API did not supply".
  let rates: Record<string, number> = {};
  try {
    rates = await fxRatesFromYahoo();
  } catch (err) {
    // ProviderUnavailableError (circuit open) is expected during a Yahoo
    // outage — log at info, not warn, so the log isn't noisy while the
    // breaker is doing its job.
    const isExpected = err instanceof ProviderUnavailableError;
    logger[isExpected ? "info" : "warn"](
      { err: err instanceof Error ? err.message : err },
      "FX yahoo lane failed — falling through to Frankfurter",
    );
  }

  const missing = Object.keys(FX_PAIRS).filter((ccy) => !(ccy in rates));
  if (missing.length > 0) {
    try {
      const fallback = await fxRatesFromFrankfurter(missing);
      let filled = 0;
      for (const [ccy, rate] of Object.entries(fallback)) {
        // Yahoo already provided this currency — do NOT overwrite. A
        // real-time Yahoo quote is closer to "now" than yesterday's
        // ECB fixing, and treating Frankfurter as authoritative for
        // currencies Yahoo already answered would silently degrade
        // freshness for the common case (Yahoo mostly works, one
        // pair fails). Merge is fill-only, not overwrite.
        if (ccy in rates) continue;
        rates[ccy] = rate;
        filled += 1;
      }
      if (filled > 0) {
        logger.info(
          { filled, missingBefore: missing.length, currencies: Object.keys(fallback) },
          "FX filled from Frankfurter fallback",
        );
      }
    } catch (err) {
      const isExpected =
        err instanceof ProviderUnavailableError || err instanceof CreditBudgetExhaustedError;
      logger[isExpected ? "info" : "warn"](
        { err: err instanceof Error ? err.message : err, missing },
        "FX Frankfurter fallback also failed — currencies stay unavailable",
      );
    }
  }

  const data: FxRatesData = { base: "GBP", rates, updatedAt: new Date().toISOString() };
  fxCache = { data, ts: now };
  return data;
}

export async function toGbp(amount: number, currency: string): Promise<number | null> {
  if (currency === "GBP") return amount;
  const fx = await getFxRates();
  const rate = fx.rates[currency];
  if (!rate) return null;
  return amount / rate;
}

export async function toBase(amount: number, fromCurrency: string, baseCurrency: string): Promise<number | null> {
  if (fromCurrency === baseCurrency) return amount;
  const fx = await getFxRates();
  // Convert fromCurrency → GBP → baseCurrency. If either leg is missing,
  // return null. Previously this returned the amount unchanged, which
  // treated the native figure as if it were already in the target
  // currency — a total lie on top of the fabricated-rate lie above.
  const fromRate = fromCurrency === "GBP" ? 1 : fx.rates[fromCurrency];
  const toRate = baseCurrency === "GBP" ? 1 : fx.rates[baseCurrency];
  if (!fromRate || !toRate) return null;
  return (amount / fromRate) * toRate;
}

// snapshotFxRate — write-path helper. Called at every INSERT into
// transactions to freeze the FX rate at write time, so a monthly
// aggregate for August doesn't drift when the ringgit moves in
// September.
//
// Returns { rate, asOf }. rate is base-currency-per-native (multiply
// nativeAmount by rate to get base). asOf is always set — even when
// rate is null, we know WHEN we tried, which the backfill uses to
// tell null-because-outage-just-now from null-because-legacy-row.
//
// On complete FX unavailability: getFxRates() returns an FxRatesData
// with an empty rates map (never throws — confirmed 30-Aug). Both
// fromRate and toRate come back undefined, rate returns null, write
// proceeds with a null-rate row and the backfill catches it later.
// This is deliberate — refusing to record a transaction because an
// FX provider is down is the app failing at its one job. Matches
// the G20/A offline-write premise.
//
// G20/A note: getFxRates() blocks up to ~12s on first call after
// cache expiry when both providers time out (6s Yahoo + 6s
// Frankfurter). Not a hang, but longer than an offline UI thread
// should wait for a write. When the offline queue lands it should
// either pass a short-timeout mode, or read a serve-stale cache
// entry — market.ts CACHE_TTL_MS windowing lets this be added
// without touching this signature. See CLAUDE.md's "the app cannot
// hold or convert money" hard constraint: a null-rate write is
// safe; a hung write blocks the ledger.
export async function snapshotFxRate(
  fromCurrency: string,
  baseCurrency: string,
): Promise<{ rate: number | null; asOf: Date }> {
  const fx = await getFxRates();
  const asOf = new Date(fx.updatedAt);
  if (fromCurrency === baseCurrency) return { rate: 1, asOf };
  const fromRate = fromCurrency === "GBP" ? 1 : fx.rates[fromCurrency];
  const toRate = baseCurrency === "GBP" ? 1 : fx.rates[baseCurrency];
  if (!fromRate || !toRate) return { rate: null, asOf };
  return { rate: toRate / fromRate, asOf };
}

// txToBase — read-path helper. Called by every aggregate that folds
// transactions into a base-currency total (enrichTransaction, monthly
// summary, dashboard, ai-context, export, digest — 16 sites at
// write time of this comment).
//
// If the row carries a stored rate (post-30-Aug write), use it: the
// value doesn't drift, and the monthly total is what it was at the
// moment the transaction happened. Otherwise fall through to live
// toBase() — same behaviour as before the stored-rate migration,
// so pre-migration rows remain accurate-as-of-read.
//
// The `tx` shape is minimal on purpose — only what the conversion
// needs, so every call site can pass a projected row or the full
// drizzle row without a type dance.
export async function txToBase(
  tx: { nativeAmount: string; currency: string; nativeToBaseRate: string | null },
  baseCurrency: string,
): Promise<number | null> {
  const amount = Math.abs(parseFloat(tx.nativeAmount));
  if (tx.nativeToBaseRate != null) {
    return amount * parseFloat(tx.nativeToBaseRate);
  }
  return toBase(amount, tx.currency, baseCurrency);
}

/** Convert a GBP amount to the target currency using live FX rates.
 *  Returns null when the target's rate is not available. */
export async function gbpTo(gbpAmount: number, targetCurrency: string): Promise<number | null> {
  if (targetCurrency === "GBP") return gbpAmount;
  const fx = await getFxRates();
  const rate = fx.rates[targetCurrency];
  if (!rate) return null;
  return gbpAmount * rate;
}

export type HistoryPoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type EarningsEntry = {
  date: string;
  epsActual: number | null;
  epsEstimate: number | null;
  surprise: number | null;
};

export type RecTrend = {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
};

export type StockDetail = {
  ticker: string;
  sector: string | null;
  industry: string | null;
  country: string | null;
  employees: number | null;
  description: string | null;
  website: string | null;
  // Income / margins
  totalRevenue: number | null;
  grossMargins: number | null;
  operatingMargins: number | null;
  netMargins: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  // Cash flow / balance sheet
  freeCashflow: number | null;
  operatingCashflow: number | null;
  totalDebt: number | null;
  totalCash: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  // Per share / valuation
  sharesOutstanding: number | null;
  bookValue: number | null;
  priceToBook: number | null;
  priceToSales: number | null;
  enterpriseValue: number | null;
  pegRatio: number | null;
  forwardEps: number | null;
  // Returns
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  // Ownership / short interest
  institutionalOwnership: number | null;
  insiderOwnership: number | null;
  shortRatio: number | null;
  shortPercentFloat: number | null;
  // Analyst targets
  targetHigh: number | null;
  targetLow: number | null;
  targetMedian: number | null;
  // Historical
  fiftyTwoWeekChange: number | null;
  // Events
  earningsHistory: EarningsEntry[];
  recommendationTrend: RecTrend[];
  nextEarningsDate: string | null;
  analystCount: number | null;
  recommendationKey: string | null;
};

export type OptionsContract = {
  strike: number;
  expiry: string;
  type: "call" | "put";
  bid: number | null;
  ask: number | null;
  lastPrice: number | null;
  volume: number | null;
  openInterest: number | null;
  impliedVolatility: number | null;
  inTheMoney: boolean | null;
};

export type OptionsChain = {
  ticker: string;
  underlyingPrice: number;
  expiryDates: string[];
  selectedExpiry: string;
  calls: OptionsContract[];
  puts: OptionsContract[];
};

const quoteCache = new Map<string, { data: StockQuoteData; ts: number }>();

// ── Cache-tier constants (stale-serve) ──────────────────────────────────────
// Fresh: cached data returned as-is.
// Stale-serve window: past fresh but within STALE_MAX_MS, cached data is
// returned with { stale: true, updatedAt } so the UI shows the timestamp
// rather than a dash. The updatedAt is the FETCH TIME of the original
// call, never re-set to render-time — otherwise the freshness marker
// would lie. A price from 12 minutes ago with a visible timestamp beats
// a dash; a price from 12 minutes ago labelled "just now" is the opposite
// of that.
// Hard expire: past STALE_MAX_MS, cache miss.
const STALE_MAX_MS = 30 * 60 * 1000; // 30 minutes

// ── Chain-fetch helpers ─────────────────────────────────────────────────────
// Two helpers — one for prices (light shape), one for quotes (Yahoo-rich).
// The price chain is Yahoo → Alpaca → Polygon → Twelve Data. The quote
// chain is Yahoo → chain-fallbacks-as-price-only. Only Yahoo returns the
// rich analyst/options metadata; the fallback providers return a
// price-only quote via priceToQuote which nulls the unknown fields. The
// UI already renders those fields with "—" when null, so the degradation
// is honest.

// Yahoo price shape → StockPriceData
async function yahooFetchPrice(ticker: string): Promise<StockPriceData> {
  return withProvider("yahoo", async () => {
    const quote = await yahooFinance.quote(ticker);
    const price = quote?.regularMarketPrice ?? null;
    if (typeof price !== "number" || price <= 0) {
      throw new Error(`yahoo returned no price for ${ticker}`);
    }
    const previousClose =
      typeof quote?.regularMarketPreviousClose === "number"
        ? quote.regularMarketPreviousClose
        : null;
    return {
      ticker,
      price,
      currency: quote?.currency ?? "USD",
      previousClose,
      updatedAt: new Date().toISOString(),
      provider: "yahoo",
    };
  });
}

// Yahoo full-quote shape → StockQuoteData
async function yahooFetchQuote(ticker: string): Promise<StockQuoteData> {
  return withProvider("yahoo", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = await yahooFinance.quote(ticker);
    const price = typeof q?.regularMarketPrice === "number" ? q.regularMarketPrice : null;
    if (typeof price !== "number" || price <= 0) {
      throw new Error(`yahoo returned no quote for ${ticker}`);
    }
    return {
      ticker,
      price,
      currency: q?.currency ?? "USD",
      updatedAt: new Date().toISOString(),
      provider: "yahoo",
      pe: typeof q?.trailingPE === "number" ? Math.round(q.trailingPE * 10) / 10 : null,
      forwardPe: typeof q?.forwardPE === "number" ? Math.round(q.forwardPE * 10) / 10 : null,
      eps: typeof q?.epsTrailingTwelveMonths === "number" ? Math.round(q.epsTrailingTwelveMonths * 100) / 100 : null,
      high52w: typeof q?.fiftyTwoWeekHigh === "number" ? q.fiftyTwoWeekHigh : null,
      low52w: typeof q?.fiftyTwoWeekLow === "number" ? q.fiftyTwoWeekLow : null,
      marketCap: typeof q?.marketCap === "number" ? q.marketCap : null,
      beta: typeof q?.beta === "number" ? Math.round(q.beta * 100) / 100 : null,
      dividendYield: typeof q?.trailingAnnualDividendYield === "number" ? Math.round(q.trailingAnnualDividendYield * 10000) / 100 : null,
      analystTargetPrice: typeof q?.targetMeanPrice === "number" ? q.targetMeanPrice : null,
      displayName: q?.displayName ?? q?.longName ?? q?.shortName ?? null,
      changePercent: typeof q?.regularMarketChangePercent === "number" ? Math.round(q.regularMarketChangePercent * 100) / 100 : null,
      dayHigh: typeof q?.regularMarketDayHigh === "number" ? q.regularMarketDayHigh : null,
      dayLow: typeof q?.regularMarketDayLow === "number" ? q.regularMarketDayLow : null,
      volume: typeof q?.regularMarketVolume === "number" ? q.regularMarketVolume : null,
      previousClose: typeof q?.regularMarketPreviousClose === "number" ? q.regularMarketPreviousClose : null,
      nextEarningsDate: (() => {
        const ts = q?.earningsTimestampStart ?? q?.earningsTimestamp;
        if (typeof ts !== "number" || ts <= 0) return null;
        const d = new Date(ts * 1000);
        return d > new Date() ? d.toISOString().slice(0, 10) : null;
      })(),
      marketState: typeof q?.marketState === "string" ? q.marketState : null,
      postMarketPrice: typeof q?.postMarketPrice === "number" ? Math.round(q.postMarketPrice * 100) / 100 : null,
      postMarketChangePercent: typeof q?.postMarketChangePercent === "number" ? Math.round(q.postMarketChangePercent * 100) / 100 : null,
      preMarketPrice: typeof q?.preMarketPrice === "number" ? Math.round(q.preMarketPrice * 100) / 100 : null,
      preMarketChangePercent: typeof q?.preMarketChangePercent === "number" ? Math.round(q.preMarketChangePercent * 100) / 100 : null,
    };
  });
}

// ── Cadence-per-asset-class refresh budgeter ────────────────────────────────
//
// Different asset classes get different cache-freshness treatment. US
// equities go through Alpaca on 200/min so we can afford a 5-min fresh
// window (matches the historical CACHE_TTL_MS). Forex / futures / indices
// / non-US equities go through Twelve Data on the free 800/day budget,
// and we deliberately pin their fresh window at 30 minutes so we stay
// inside the ceiling.
//
// ── Twelve Data credit budget arithmetic ────────────────────────────────────
// (nobody optimise this away)
//   Overview orphan set: 15 tickers (6 forex + 4 futures + 5 indices)
//   plus non-US user holdings: assume ≤ 5 for a typical portfolio
//   Total per refresh: ~20 credits
//   Cadence: every 30 minutes = 48 refreshes/day
//   Daily spend: 20 × 48 = 960 credits
//
// That's over the 800 free budget. So the fresh window for the SLOW class
// is 45 minutes (32 refreshes/day = 640 credits) not 30, leaving buffer
// for user-initiated fetches. If TWELVEDATA is upgraded to Grow (8000
// credits/day), this can drop back to 30 or lower.
//
// The withProvider soft cap (95% of 800 = 760) catches any drift toward
// the ceiling and refuses NEW calls rather than eating a 429. Running
// out at 4pm every day is worse than a slower refresh from 9am.
const FRESH_MS_FAST = 5 * 60 * 1000;   // 5 minutes  (US, crypto)
const FRESH_MS_SLOW = 45 * 60 * 1000;  // 45 minutes (forex, futures, indices, non-US)

function freshWindowFor(ticker: string): number {
  const kind = classifyTicker(ticker);
  return kind === "us_equity" || kind === "us_etf" || kind === "crypto"
    ? FRESH_MS_FAST
    : FRESH_MS_SLOW;
}

// Try each provider in classifier order for the given tickers. Adapters
// throw on whole-batch failure, which the withProvider wrapper turns into
// a breaker-trip signal. A partial result (some tickers returned, some
// missing) counts as success but the caller re-tries the missing ones on
// the next provider.
async function chainFetchPrices(tickers: string[]): Promise<Map<string, StockPriceData>> {
  const out = new Map<string, StockPriceData>();
  if (tickers.length === 0) return out;

  // Group tickers by their coverable-provider list so a single-provider
  // batch (e.g. futures = yahoo only) doesn't ping Alpaca / Polygon /
  // Twelve Data with a call they'd have to reject. The classifier is
  // static, cheap, and produces small groups.
  const remaining = new Set(tickers);

  // Provider order matches PROVIDER_COVERAGE. Walk the union of coverable
  // providers in preferred order.
  const providerOrder: ProviderName[] = ["yahoo", "alpaca", "polygon", "twelvedata"];
  for (const provider of providerOrder) {
    if (remaining.size === 0) break;
    // Which of the remaining tickers this provider CAN attempt.
    const eligible = [...remaining].filter((t) => providersFor(t).includes(provider));
    if (eligible.length === 0) continue;
    try {
      if (provider === "yahoo") {
        // Yahoo is per-symbol; still parallel-fan. A single ticker's
        // failure doesn't trip the breaker because withProvider is
        // called per-ticker; the breaker trips after 3 consecutive
        // whole-provider throws. Since a partial success would swallow
        // the breaker signal, we treat "zero returned across the batch"
        // as the failure case worth escalating.
        const results = await Promise.allSettled(eligible.map((t) => yahooFetchPrice(t)));
        let successes = 0;
        for (const r of results) {
          if (r.status === "fulfilled") {
            out.set(r.value.ticker, r.value);
            remaining.delete(r.value.ticker);
            successes += 1;
          }
        }
        // Zero across a >0 batch is the "yahoo is dark" signal we want
        // to bubble up so the next call sees the breaker open.
        if (successes === 0 && eligible.length > 0) {
          logger.info({ eligible: eligible.length }, "yahoo returned nothing for eligible batch");
        }
      } else if (provider === "alpaca") {
        const results = await alpacaFetchPrices(eligible);
        for (const [k, v] of results) {
          out.set(k, { ...v, provider: "alpaca" });
          remaining.delete(k);
        }
      } else if (provider === "polygon") {
        const results = await polygonFetchPrices(eligible);
        for (const [k, v] of results) {
          out.set(k, { ...v, provider: "polygon" });
          remaining.delete(k);
        }
      } else if (provider === "twelvedata") {
        const results = await twelveDataFetchPrices(eligible);
        for (const [k, v] of results) {
          out.set(k, { ...v, provider: "twelvedata" });
          remaining.delete(k);
        }
      }
    } catch (err) {
      // ProviderUnavailableError / CreditBudgetExhaustedError are
      // expected outcomes of the chain design — log at info. Other
      // failures (unexpected exceptions) at warn.
      const expected =
        err instanceof ProviderUnavailableError || err instanceof CreditBudgetExhaustedError;
      logger[expected ? "info" : "warn"](
        { err: err instanceof Error ? err.message : err, provider, remaining: remaining.size },
        `provider ${provider} failed, chain continues`,
      );
    }
  }

  // Orphan diagnostics. If anything is still missing after the whole
  // chain, log the specific asset-class reason. The UI banner can call
  // orphanReason(ticker) directly for the user-facing message.
  if (remaining.size > 0) {
    for (const t of remaining) {
      logger.info({ ticker: t, reason: orphanReason(t) }, "ticker orphaned after chain");
    }
  }
  return out;
}

export async function getStockQuotes(tickers: string[]): Promise<StockQuoteData[]> {
  const now = Date.now();
  const results: StockQuoteData[] = [];
  const toFetch: string[] = [];
  const staleServed: string[] = [];

  // Cache tiers: fresh → return as-is; stale window → return with
  // stale=true; expired → refetch.
  for (const ticker of tickers) {
    const cached = quoteCache.get(ticker);
    if (!cached) { toFetch.push(ticker); continue; }
    const age = now - cached.ts;
    const fresh = freshWindowFor(ticker);
    if (age < fresh) {
      results.push(cached.data);
    } else if (age < STALE_MAX_MS) {
      // Stale-serve. updatedAt stays the ORIGINAL fetch time (never
      // re-stamped to now), so the UI's "12 min ago" label is real.
      results.push({ ...cached.data, stale: true });
      staleServed.push(ticker);
      // Also enqueue for background-fresh via the same toFetch path —
      // the caller gets the stale immediately, and next request has
      // fresh again. The queued fetch races with response construction
      // but we don't wait: fire-and-forget with a swallowed catch.
      toFetch.push(ticker);
    } else {
      toFetch.push(ticker);
    }
  }
  if (staleServed.length > 0) {
    logger.info({ count: staleServed.length, tickers: staleServed }, "served stale quotes");
  }

  // Fetch quotes needed. For each ticker try Yahoo (rich shape) first;
  // if Yahoo fails, fall through to the price-only chain and adapt with
  // priceToQuote — the fallback providers can't populate PE, EPS, 52w,
  // options, so those fields go null. The UI already renders null with
  // "—" so the degradation is honest.
  const yahooResults = await Promise.allSettled(toFetch.map((t) => yahooFetchQuote(t)));
  const yahooOk = new Map<string, StockQuoteData>();
  const yahooMiss: string[] = [];
  for (let i = 0; i < toFetch.length; i += 1) {
    const r = yahooResults[i]!;
    const t = toFetch[i]!;
    if (r.status === "fulfilled") yahooOk.set(t, r.value);
    else yahooMiss.push(t);
  }
  // Fill misses via the price chain (Alpaca → Polygon → Twelve Data).
  const priceFillers = yahooMiss.length > 0 ? await chainFetchPrices(yahooMiss) : new Map<string, StockPriceData>();
  for (const t of toFetch) {
    const yr = yahooOk.get(t);
    if (yr) {
      quoteCache.set(t, { data: yr, ts: now });
      // Only push if we didn't already serve stale — otherwise it's a
      // background refresh, not part of this response.
      if (!staleServed.includes(t)) results.push(yr);
      continue;
    }
    const p = priceFillers.get(t);
    if (p) {
      const q = priceToQuote(p);
      quoteCache.set(t, { data: q, ts: now });
      if (!staleServed.includes(t)) results.push(q);
    }
    // else: orphan, already logged in chainFetchPrices; omit from
    // response (never fabricate).
  }
  return results;
}

export async function getStockPrices(tickers: string[]): Promise<StockPriceData[]> {
  const now = Date.now();
  const results: StockPriceData[] = [];
  const toFetch: string[] = [];
  const staleServed: string[] = [];

  for (const ticker of tickers) {
    const cached = stockCache.get(ticker);
    if (!cached) { toFetch.push(ticker); continue; }
    const age = now - cached.ts;
    const fresh = freshWindowFor(ticker);
    if (age < fresh) {
      results.push(cached.data);
    } else if (age < STALE_MAX_MS) {
      results.push({ ...cached.data, stale: true });
      staleServed.push(ticker);
      toFetch.push(ticker);
    } else {
      toFetch.push(ticker);
    }
  }
  if (staleServed.length > 0) {
    logger.info({ count: staleServed.length, tickers: staleServed }, "served stale prices");
  }

  const fresh = toFetch.length > 0 ? await chainFetchPrices(toFetch) : new Map<string, StockPriceData>();
  for (const t of toFetch) {
    const data = fresh.get(t);
    if (data) {
      stockCache.set(t, { data, ts: now });
      if (!staleServed.includes(t)) results.push(data);
    }
  }
  return results;
}

// ── History ───────────────────────────────────────────────────────────────────

const historyCache = new Map<string, { data: HistoryPoint[]; ts: number }>();
const HISTORY_TTL_MS  = 30 * 60 * 1000;
const INTRADAY_TTL_MS =  2 * 60 * 1000;
const MICRO_TTL_MS    =     30 * 1000;   // 30 s for 1-min data

const INTRADAY_PERIODS = new Set(["1min", "2min", "5min", "15min", "30min", "1h", "1d", "3d", "5d"]);

type YfInterval = "1m" | "2m" | "5m" | "15m" | "30m" | "60m" | "1d" | "1wk" | "1mo";

interface PeriodConfig { days: number; interval: YfInterval; intraday: boolean; }

const PERIOD_CONFIGS: Record<string, PeriodConfig> = {
  "1min":  { days: 1,    interval: "1m",  intraday: true  },
  "2min":  { days: 2,    interval: "2m",  intraday: true  },
  "5min":  { days: 2,    interval: "5m",  intraday: true  },
  "15min": { days: 5,    interval: "15m", intraday: true  },
  "30min": { days: 5,    interval: "30m", intraday: true  },
  "1h":    { days: 10,   interval: "60m", intraday: true  },
  "1d":    { days: 1,    interval: "30m", intraday: true  },
  "3d":    { days: 3,    interval: "60m", intraday: true  },
  "5d":    { days: 5,    interval: "60m", intraday: true  },
  "1w":    { days: 7,    interval: "1d",  intraday: false },
  "1m":    { days: 30,   interval: "1d",  intraday: false },
  "3m":    { days: 90,   interval: "1wk", intraday: false },
  "6m":    { days: 180,  interval: "1wk", intraday: false },
  "1y":    { days: 365,  interval: "1wk", intraday: false },
  "2y":    { days: 730,  interval: "1mo", intraday: false },
  "5y":    { days: 1825, interval: "1mo", intraday: false },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseHistoryRows(rows: any[], intraday = false): HistoryPoint[] {
  return rows
    .filter((r) => r.close != null && typeof r.close === "number")
    .map((r) => {
      let date: string;
      if (intraday) {
        const d = r.date instanceof Date ? r.date : new Date(r.date as string | number);
        // Use UTC throughout to avoid local-timezone/ISO-string mismatch
        const h = d.getUTCHours().toString().padStart(2, "0");
        const m = d.getUTCMinutes().toString().padStart(2, "0");
        date = `${d.toISOString().slice(0, 10)} ${h}:${m}`;
      } else {
        date = r.date instanceof Date
          ? r.date.toISOString().slice(0, 10)
          : new Date(r.date as string | number).toISOString().slice(0, 10);
      }
      return {
        date,
        open: typeof r.open === "number" ? r.open : r.close,
        high: typeof r.high === "number" ? r.high : r.close,
        low: typeof r.low === "number" ? r.low : r.close,
        close: r.close as number,
        volume: typeof r.volume === "number" ? r.volume : 0,
      };
    });
}

// ── Polygon.io integration (optional — set POLYGON_API_KEY for enhanced 1-min data) ──

const POLYGON_KEY = process.env.POLYGON_API_KEY ?? "";

interface PolygonAgg { t: number; o: number; h: number; l: number; c: number; v: number; }
interface PolygonAggsResponse { results?: PolygonAgg[]; status?: string; error?: string; }

/** Returns YYYY-MM-DD of the most recent trading day (Mon–Fri). */
function lastTradingDay(daysBack = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  const day = d.getDay();
  if (day === 0) d.setDate(d.getDate() - 2);
  else if (day === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function polygonToPoints(aggs: PolygonAgg[]): HistoryPoint[] {
  return aggs.map((r) => {
    const d = new Date(r.t);
    const date = `${d.toISOString().slice(0, 10)} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    return { date, open: r.o, high: r.h, low: r.l, close: r.c, volume: r.v };
  });
}

async function fetchPolygonAggs(
  ticker: string, multiplier: number, timespan: string, from: string, to: string
): Promise<HistoryPoint[]> {
  // Polygon uses hyphens for class-B shares (BRK-B), strip exchange suffixes like .HK
  const polyTicker = ticker.replace(/\.[A-Z]{1,3}$/, "").replace(".", "-");
  const url = `https://api.polygon.io/v2/aggs/ticker/${polyTicker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&limit=5000&apiKey=${POLYGON_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Polygon HTTP ${res.status}`);
  const body = await res.json() as PolygonAggsResponse;
  if (!body.results?.length) return [];
  return polygonToPoints(body.results);
}

export async function getStockHistory(ticker: string, period: string): Promise<HistoryPoint[]> {
  const cacheKey = `${ticker}:${period}`;
  const now = Date.now();
  const ttl = period === "1min" ? MICRO_TTL_MS
            : INTRADAY_PERIODS.has(period) ? INTRADAY_TTL_MS
            : HISTORY_TTL_MS;

  const cached = historyCache.get(cacheKey);
  if (cached && now - cached.ts < ttl) return cached.data;

  const cfg = PERIOD_CONFIGS[period] ?? { days: 365, interval: "1wk" as YfInterval, intraday: false };
  const period1 = new Date(now - cfg.days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let data: HistoryPoint[] = [];

  // ── Yahoo Finance path (primary for all periods) ──
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.chart(ticker, { period1, interval: cfg.interval });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = result?.quotes ?? [];
    data = parseHistoryRows(rows, cfg.intraday);
  } catch (chartErr) {
    logger.warn({ chartErr, ticker, period }, "chart() failed, trying historical()");
    if (!cfg.intraday) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows: any[] = await yahooFinance.historical(ticker, { period1, interval: cfg.interval as "1d" | "1wk" | "1mo" });
        data = parseHistoryRows(rows, false);
      } catch (histErr) {
        logger.warn({ histErr, ticker, period }, "historical() also failed");
      }
    }
  }

  // ── Polygon.io fallback for 1-2min only when Yahoo returns nothing ──
  if (data.length === 0 && POLYGON_KEY && (period === "1min" || period === "2min")) {
    try {
      const multiplier = period === "1min" ? 1 : 2;
      const to   = lastTradingDay(0);
      const from = lastTradingDay(period === "1min" ? 1 : 3);
      data = await fetchPolygonAggs(ticker, multiplier, "minute", from, to);
      logger.info({ ticker, period, points: data.length }, "Polygon 1-min fallback ok");
    } catch (polygonErr) {
      logger.warn({ polygonErr, ticker, period }, "Polygon fallback also failed");
    }
  }

  if (data.length > 0) {
    historyCache.set(cacheKey, { data, ts: now });
  }
  return data;
}

// ── News ──────────────────────────────────────────────────────────────────────

export interface NewsItem {
  title: string;
  link: string;
  publisher: string;
  publishedAt: string;
}

// F3 · a news item scoped to something the user actually holds.
// `connectedTo` names the anchor so the UI can render the required
// connection line ("Ringgit slips as Malaysia holds rate" next to
// "your RM 4,120 in Maybank"). If the item cannot be tied to a
// holding or currency, it does not appear in the response.
export interface FilteredNewsItem extends NewsItem {
  connectedTo: {
    kind: "ticker" | "currency";
    // For tickers: the ticker symbol. For currencies: the ISO code.
    value: string;
    // Human label the UI can render alongside the anchor amount.
    // For tickers: the ticker itself. For currencies: the code.
    label: string;
  };
}

// Deterministic keywords per currency for the generic-feed filter.
// Kept short and specific enough that a "yen" or "dollar" mention
// counts, but a passing "pounds of ..." or "buck" doesn't. The
// three-letter ISO code always counts as a hit.
const CURRENCY_KEYWORDS: Record<string, string[]> = {
  GBP: ["gbp", "sterling", "pound sterling", "british pound"],
  USD: ["usd", "us dollar", "u.s. dollar", "dollar"],
  EUR: ["eur", "euro", "eurozone"],
  MYR: ["myr", "ringgit", "malaysian ringgit"],
  SGD: ["sgd", "singapore dollar"],
  CNY: ["cny", "yuan", "renminbi"],
  JPY: ["jpy", "yen"],
  AUD: ["aud", "australian dollar", "aussie dollar"],
  CAD: ["cad", "canadian dollar"],
  HKD: ["hkd", "hong kong dollar"],
  THB: ["thb", "thai baht", "baht"],
  INR: ["inr", "rupee", "indian rupee"],
};

// Filter a set of raw news items against a user's holdings. Every
// surviving item carries a `connectedTo` marker. Items that match
// multiple anchors are attributed to the FIRST match in
// (tickers, currencies) order — good enough for the "why is this
// on my screen" caption, and cheap to compute.
export function filterNewsForUser(
  items: NewsItem[],
  holdings: { tickers: string[]; currencies: string[] },
): FilteredNewsItem[] {
  const tickers = holdings.tickers.map((t) => t.toUpperCase());
  const currencies = holdings.currencies.map((c) => c.toUpperCase());
  const out: FilteredNewsItem[] = [];
  for (const item of items) {
    const t = item.title.toUpperCase();
    // Ticker match first — a bare ticker in a title is a stronger
    // signal than a currency keyword, and the F3 UX prefers a
    // ticker-scoped caption over a currency-scoped one when both
    // could apply.
    const tickerHit = tickers.find((ticker) => t.includes(ticker));
    if (tickerHit) {
      out.push({ ...item, connectedTo: { kind: "ticker", value: tickerHit, label: tickerHit } });
      continue;
    }
    let matched = false;
    for (const code of currencies) {
      const keywords = CURRENCY_KEYWORDS[code];
      if (!keywords) continue;
      const lower = item.title.toLowerCase();
      if (keywords.some((kw) => lower.includes(kw))) {
        out.push({ ...item, connectedTo: { kind: "currency", value: code, label: code } });
        matched = true;
        break;
      }
    }
    if (matched) continue;
    // No anchor → drop. The whole point of F3.
  }
  return out;
}

// Aggregate news for a user across ticker + currency holdings. Ticker
// news is fetched per-ticker (so it's inherently anchor-scoped —
// survival is 100% by request construction). Currency news requires
// a generic feed + keyword filter; that path is off by default
// because no generic-feed source is wired today. When it lands, this
// function will fetch it and pass through filterNewsForUser().
export async function getFilteredNewsForUser(
  holdings: { tickers: string[]; currencies: string[] },
  limit: number = 12,
): Promise<FilteredNewsItem[]> {
  if (holdings.tickers.length === 0 && holdings.currencies.length === 0) {
    return [];
  }
  const out: FilteredNewsItem[] = [];
  // Per-ticker fetch — each result is inherently connected to that
  // ticker, so we tag directly rather than run the keyword matcher.
  for (const ticker of holdings.tickers) {
    const upper = ticker.toUpperCase();
    try {
      const items = await getStockNews(upper);
      for (const item of items) {
        out.push({ ...item, connectedTo: { kind: "ticker", value: upper, label: upper } });
        if (out.length >= limit) return out;
      }
    } catch (err) {
      logger.warn({ err, ticker: upper }, "per-ticker news fetch failed");
    }
  }
  // Currency-side news: no generic feed source in play today.
  // Documented as unavailable; when a generic-feed source is wired,
  // call filterNewsForUser(feedItems, holdings) here.
  return out;
}

const newsCache = new Map<string, { data: NewsItem[]; ts: number }>();
const NEWS_TTL_MS = 10 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapNewsItem(n: any): NewsItem {
  let publishedAt: string;
  if (n.providerPublishTime instanceof Date) {
    publishedAt = n.providerPublishTime.toISOString();
  } else if (typeof n.providerPublishTime === "number") {
    publishedAt = new Date(n.providerPublishTime * 1000).toISOString();
  } else {
    publishedAt = new Date().toISOString();
  }
  return { title: n.title ?? "", link: n.link ?? "", publisher: n.publisher ?? "", publishedAt };
}

async function fetchNewsYahooQuery(ticker: string): Promise<NewsItem[]> {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=10&quotesCount=0&enableFuzzyQuery=false`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://finance.yahoo.com/",
    },
  });
  if (!res.ok) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawNews: any[] = Array.isArray(json?.news) ? json.news : [];
  return rawNews
    .filter((n) => n?.title && n?.link)
    .map((n) => ({
      title: String(n.title ?? ""),
      link: String(n.link ?? ""),
      publisher: String(n.providerDisplayName ?? n.publisher ?? "Yahoo Finance"),
      publishedAt: typeof n.providerPublishTime === "number"
        ? new Date((n.providerPublishTime as number) * 1000).toISOString()
        : new Date().toISOString(),
    }));
}

async function fetchNewsRSS(ticker: string): Promise<NewsItem[]> {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(6000),
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/rss+xml, application/xml, text/xml, */*",
    },
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const items: NewsItem[] = [];
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  for (const item of itemMatches) {
    const title = (item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ?? item.match(/<title>([\s\S]*?)<\/title>/))?.[1]?.trim() ?? "";
    const link = (item.match(/<link>([\s\S]*?)<\/link>/))?.[1]?.trim() ?? "";
    const pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/))?.[1]?.trim() ?? "";
    const publisher = "Yahoo Finance";
    if (!title || !link) continue;
    const publishedAt = pubDate ? new Date(pubDate).toISOString() : new Date().toISOString();
    items.push({ title, link, publisher, publishedAt });
    if (items.length >= 12) break;
  }
  return items;
}

export async function getStockNews(ticker: string): Promise<NewsItem[]> {
  const key = ticker;
  const now = Date.now();
  const cached = newsCache.get(key);
  if (cached && now - cached.ts < NEWS_TTL_MS) return cached.data;

  // Attempt 1: yahoo-finance2 search()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.search(ticker, { newsCount: 12, quotesCount: 0 }, { validateResult: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawNews: any[] = Array.isArray(result?.news) ? result.news : [];
    const items: NewsItem[] = rawNews
      .filter((n) => n?.title && n?.link)
      .map(mapNewsItem);
    if (items.length > 0) {
      newsCache.set(key, { data: items, ts: now });
      return items;
    }
  } catch (err) {
    logger.warn({ err, ticker }, "News search() failed, trying direct Yahoo query");
  }

  // Attempt 2: direct Yahoo Finance query API (browser-like UA)
  try {
    const items = await fetchNewsYahooQuery(ticker);
    if (items.length > 0) {
      newsCache.set(key, { data: items, ts: now });
      return items;
    }
  } catch (err) {
    logger.warn({ err, ticker }, "Direct Yahoo query failed, trying RSS");
  }

  // Attempt 3: RSS feed
  try {
    const items = await fetchNewsRSS(ticker);
    if (items.length > 0) newsCache.set(key, { data: items, ts: now });
    return items;
  } catch (rssErr) {
    logger.warn({ rssErr, ticker }, "All news sources failed");
    return [];
  }
}

// ── Detail ────────────────────────────────────────────────────────────────────

const detailCache = new Map<string, { data: StockDetail; ts: number }>();
const DETAIL_TTL_MS = 15 * 60 * 1000;

export async function getStockDetail(ticker: string): Promise<StockDetail> {
  const now = Date.now();
  const cached = detailCache.get(ticker);
  if (cached && now - cached.ts < DETAIL_TTL_MS) return cached.data;

  const empty: StockDetail = {
    ticker, sector: null, industry: null, country: null, employees: null,
    description: null, website: null,
    totalRevenue: null, grossMargins: null, operatingMargins: null, netMargins: null,
    revenueGrowth: null, earningsGrowth: null,
    freeCashflow: null, operatingCashflow: null, totalDebt: null, totalCash: null,
    debtToEquity: null, currentRatio: null, quickRatio: null,
    sharesOutstanding: null, bookValue: null, priceToBook: null, priceToSales: null,
    enterpriseValue: null, pegRatio: null, forwardEps: null,
    returnOnEquity: null, returnOnAssets: null,
    institutionalOwnership: null, insiderOwnership: null,
    shortRatio: null, shortPercentFloat: null,
    targetHigh: null, targetLow: null, targetMedian: null,
    fiftyTwoWeekChange: null,
    earningsHistory: [], recommendationTrend: [],
    nextEarningsDate: null, analystCount: null, recommendationKey: null,
  };

  // Safely extract a number from either a plain number or a Yahoo Finance { raw, fmt } wrapper
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function n(v: any): number | null {
    if (typeof v === "number") return v;
    if (v != null && typeof v.raw === "number") return v.raw;
    return null;
  }
  // Same but multiplies by 100 and rounds to 1 dp (for percentages stored as 0.xx)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function p(v: any): number | null {
    const val = n(v);
    return val !== null ? Math.round(val * 1000) / 10 : null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ap: any = {}, fd: any = {}, ks: any = {}, rt: any = {}, ce: any = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let earn: any = {};

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s: any = await yahooFinance.quoteSummary(ticker, {
      modules: ["assetProfile", "financialData", "defaultKeyStatistics", "recommendationTrend", "calendarEvents"],
    });
    ap = s?.assetProfile ?? {};
    fd = s?.financialData ?? {};
    ks = s?.defaultKeyStatistics ?? {};
    rt = s?.recommendationTrend ?? {};
    ce = s?.calendarEvents ?? {};
  } catch (err) {
    logger.warn({ err, ticker }, "quoteSummary (base) fetch failed");
  }

  // Earnings is in a separate call because ETFs throw "No fundamentals data" which would
  // kill the entire quoteSummary response if included in the same call.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const se: any = await yahooFinance.quoteSummary(ticker, { modules: ["earnings"] });
    earn = se?.earnings ?? {};
  } catch {
    // Expected for ETFs and indices — not an error condition
  }

  try {
    // Earnings history: try earningsHistory.history first (has proper dates), then earningsChart.quarterly
    const rawHistory = earn?.earningsHistory?.history ?? earn?.earningsChart?.quarterly ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const earningsHistory: EarningsEntry[] = rawHistory.map((e: any) => {
      const dateRaw = e.date ?? e.period ?? "";
      const date = dateRaw instanceof Date
        ? dateRaw.toISOString().slice(0, 7)
        : String(dateRaw).replace(/^(\d{4})-(\d{2}).*/, "$1-$2").slice(0, 7);
      // earningsHistory.history uses epsActual/epsEstimate; earningsChart.quarterly uses actual/estimate
      const epsActual = n(e.epsActual) ?? n(e.actual);
      const epsEstimate = n(e.epsEstimate) ?? n(e.estimate);
      const surprise = n(e.surprisePercent) != null
        ? Math.round((n(e.surprisePercent) as number) * 10) / 10 : null;
      return { date, epsActual, epsEstimate, surprise };
    }).slice(-8);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recTrend: RecTrend[] = (rt?.trend ?? []).map((t: any) => ({
      period: String(t.period ?? ""),
      strongBuy: typeof t.strongBuy === "number" ? t.strongBuy : 0,
      buy: typeof t.buy === "number" ? t.buy : 0,
      hold: typeof t.hold === "number" ? t.hold : 0,
      sell: typeof t.sell === "number" ? t.sell : 0,
      strongSell: typeof t.strongSell === "number" ? t.strongSell : 0,
    })).slice(0, 4);

    const earningsDates: unknown[] = ce?.earnings?.earningsDate ?? [];
    const nextEarningsDate = earningsDates.length > 0 && earningsDates[0] instanceof Date
      ? earningsDates[0].toISOString().slice(0, 10) : null;

    const data: StockDetail = {
      ticker,
      sector: ap.sector ?? null,
      industry: ap.industry ?? null,
      country: ap.country ?? null,
      employees: typeof ap.fullTimeEmployees === "number" ? ap.fullTimeEmployees : null,
      description: ap.longBusinessSummary ?? null,
      website: ap.website ?? null,
      // Income / margins (stored as 0.xx decimals → multiply by 100)
      totalRevenue: n(fd.totalRevenue),
      grossMargins: p(fd.grossMargins),
      operatingMargins: p(fd.operatingMargins),
      netMargins: p(fd.profitMargins),
      revenueGrowth: p(fd.revenueGrowth),
      earningsGrowth: p(fd.earningsGrowth),
      // Cash flow / balance sheet
      freeCashflow: n(fd.freeCashflow),
      operatingCashflow: n(fd.operatingCashflow),
      totalDebt: n(fd.totalDebt),
      totalCash: n(fd.totalCash),
      debtToEquity: n(fd.debtToEquity),
      currentRatio: n(fd.currentRatio),
      quickRatio: n(fd.quickRatio),
      // Per share / valuation
      sharesOutstanding: n(ks.sharesOutstanding),
      bookValue: n(ks.bookValue),
      priceToBook: (() => { const v = n(ks.priceToBook); return v != null ? Math.round(v * 100) / 100 : null; })(),
      priceToSales: (() => { const v = n(ks.priceToSalesTrailing12Months); return v != null ? Math.round(v * 100) / 100 : null; })(),
      enterpriseValue: n(ks.enterpriseValue),
      pegRatio: n(ks.pegRatio),
      forwardEps: n(ks.forwardEps),
      // Returns
      returnOnEquity: p(fd.returnOnEquity),
      returnOnAssets: p(fd.returnOnAssets),
      // Ownership / short
      institutionalOwnership: p(ks.heldPercentInstitutions),
      insiderOwnership: p(ks.heldPercentInsiders),
      shortRatio: n(ks.shortRatio),
      shortPercentFloat: p(ks.shortPercentOfFloat),
      // Analyst targets
      targetHigh: n(fd.targetHighPrice),
      targetLow: n(fd.targetLowPrice),
      targetMedian: n(fd.targetMedianPrice),
      // Historical
      fiftyTwoWeekChange: p(ks['52WeekChange']),
      // Events
      earningsHistory,
      recommendationTrend: recTrend,
      nextEarningsDate,
      analystCount: n(fd.numberOfAnalystOpinions),
      recommendationKey: typeof fd.recommendationKey === "string" ? fd.recommendationKey : null,
    };

    detailCache.set(ticker, { data, ts: now });
    return data;
  } catch (err) {
    logger.warn({ err, ticker }, "Stock detail fetch failed");
    return empty;
  }
}

// ── Options Chain ─────────────────────────────────────────────────────────────

const optionsCache = new Map<string, { data: OptionsChain; ts: number }>();
const OPTIONS_TTL_MS = 10 * 60 * 1000;

export async function getOptionsChain(ticker: string, expiry?: string): Promise<OptionsChain> {
  const key = `${ticker}:${expiry ?? "first"}`;
  const now = Date.now();
  const cached = optionsCache.get(key);
  if (cached && now - cached.ts < OPTIONS_TTL_MS) return cached.data;

  const empty: OptionsChain = { ticker, underlyingPrice: 0, expiryDates: [], selectedExpiry: "", calls: [], puts: [] };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts: any = await (expiry
      ? yahooFinance.options(ticker, { date: new Date(expiry) })
      : yahooFinance.options(ticker));

    const underlyingPrice: number = opts?.quote?.regularMarketPrice ?? 0;
    const expiryDates: string[] = (opts?.expirationDates ?? []).map((d: Date | string) =>
      d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)
    );
    const selectedExpiry = expiry ?? expiryDates[0] ?? "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapContract = (c: any, type: "call" | "put"): OptionsContract => ({
      strike: typeof c.strike === "number" ? c.strike : 0,
      expiry: c.expiration instanceof Date ? c.expiration.toISOString().slice(0, 10) : selectedExpiry,
      type,
      bid: typeof c.bid === "number" ? c.bid : null,
      ask: typeof c.ask === "number" ? c.ask : null,
      lastPrice: typeof c.lastPrice === "number" ? c.lastPrice : null,
      volume: typeof c.volume === "number" ? c.volume : null,
      openInterest: typeof c.openInterest === "number" ? c.openInterest : null,
      impliedVolatility: typeof c.impliedVolatility === "number" ? Math.round(c.impliedVolatility * 1000) / 10 : null,
      inTheMoney: typeof c.inTheMoney === "boolean" ? c.inTheMoney : null,
    });

    const calls: OptionsContract[] = (opts?.options?.[0]?.calls ?? []).map((c: unknown) => mapContract(c, "call"));
    const puts: OptionsContract[] = (opts?.options?.[0]?.puts ?? []).map((c: unknown) => mapContract(c, "put"));

    const data: OptionsChain = { ticker, underlyingPrice, expiryDates, selectedExpiry, calls, puts };
    optionsCache.set(key, { data, ts: now });
    return data;
  } catch (err) {
    logger.warn({ err, ticker, expiry }, "Options chain fetch failed");
    return empty;
  }
}
