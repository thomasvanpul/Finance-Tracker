// Quote-provider adapters — Alpaca, Polygon, Twelve Data.
//
// Each adapter exposes fetchQuotes(tickers) → Map<ticker, QuoteData>.
// Adapters:
//   • Only speak the shape they can serve. Callers filter tickers by
//     provider coverage BEFORE calling; adapters don't reject-and-throw
//     on out-of-coverage symbols, they simply won't return them.
//   • Wrap every network call in withProvider() so the health module
//     sees the outcome. A whole-batch failure (no ticker returned)
//     throws — that's the signal the breaker uses. Partial success
//     (some tickers missing from response) counts as success but is
//     surfaced to the caller so it can try the next lane for the
//     missing ones.
//   • Return the same StockQuoteData/StockPriceData shape as the
//     Yahoo path so the chain can splice them together transparently.
//
// ── Symbol rewriting ────────────────────────────────────────────────────────
// Every provider has its own idiom:
//   • Alpaca US stocks:  AAPL         → AAPL
//   • Alpaca crypto:     BTC-USD      → BTC/USD  (queries /v2/crypto endpoint)
//   • Polygon US stocks: AAPL         → AAPL
//   • Polygon crypto:    BTC-USD      → X:BTCUSD (queries /v2/aggs different)
//   • Twelve Data:       AAPL         → AAPL
//                        BTC-USD      → BTC/USD
//                        GBPUSD=X     → GBP/USD
//                        VOD.L        → VOD:LSE  (needs exchange mapper)
//                        0700.HK      → 700:HKEX
// The mapper lives at the adapter boundary so callers pass raw Yahoo-shape
// tickers everywhere else.

import { logger } from "./logger";
import { withProvider } from "./provider-health";
import type { StockQuoteData, StockPriceData } from "./market-types";

// ── Alpaca ──────────────────────────────────────────────────────────────────

// The base URL is IEX-feed free tier by default. The SIP feed is paid.
// Setting ALPACA_DATA_URL overrides for those on a paid plan.
const ALPACA_DATA_URL = process.env.ALPACA_DATA_URL ?? "https://data.alpaca.markets";

function alpacaHeaders(): Record<string, string> {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_KEY_ID ?? "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY ?? "",
    Accept: "application/json",
  };
}

// Split tickers into equity vs crypto for the two Alpaca endpoints. Anything
// with a `-USD` (or -EUR / -USDT) suffix goes to /v2/crypto; the rest to
// /v2/stocks. Non-US / futures / forex / indices are dropped — the classifier
// upstream should not have routed them here, but a stray call shouldn't
// error out the batch.
function partitionAlpacaTickers(tickers: string[]): { stocks: string[]; crypto: string[] } {
  const stocks: string[] = [];
  const crypto: string[] = [];
  for (const t of tickers) {
    const u = t.toUpperCase();
    if (/-(USD|USDT|EUR|GBP|BTC|ETH)$/.test(u)) crypto.push(u);
    else if (!u.endsWith("=F") && !u.endsWith("=X") && !u.startsWith("^") && !/\.[A-Z]{1,3}$/.test(u)) {
      stocks.push(u);
    }
  }
  return { stocks, crypto };
}

// Alpaca snapshot shape (only the fields we consume). Full docs:
// https://docs.alpaca.markets/reference/stocksnapshots-1
interface AlpacaTrade { p: number; t: string; }
interface AlpacaDailyBar { c: number; }
interface AlpacaSnapshot {
  latestTrade?: AlpacaTrade;
  latestQuote?: { ap?: number; bp?: number; t: string };
  dailyBar?: AlpacaDailyBar;
  prevDailyBar?: AlpacaDailyBar;
}
interface AlpacaStocksSnapshotsResponse { [symbol: string]: AlpacaSnapshot | undefined; }

async function alpacaFetchStocks(tickers: string[]): Promise<Map<string, StockPriceData>> {
  if (tickers.length === 0) return new Map();
  const url = `${ALPACA_DATA_URL}/v2/stocks/snapshots?symbols=${tickers.join(",")}`;
  const res = await fetch(url, {
    headers: alpacaHeaders(),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`Alpaca stocks HTTP ${res.status}`);
  const body = (await res.json()) as AlpacaStocksSnapshotsResponse;
  const out = new Map<string, StockPriceData>();
  const now = new Date().toISOString();
  for (const [symbol, snap] of Object.entries(body)) {
    // latestTrade is the last IEX print. If it's absent, so is any usable
    // price — skip rather than fabricate.
    const price = snap?.latestTrade?.p ?? snap?.latestQuote?.ap ?? null;
    if (typeof price !== "number" || price <= 0) continue;
    const prev = snap?.prevDailyBar?.c ?? null;
    out.set(symbol, {
      ticker: symbol,
      price,
      currency: "USD",
      previousClose: typeof prev === "number" ? prev : null,
      updatedAt: now,
    });
  }
  if (out.size === 0) throw new Error(`Alpaca stocks returned no usable prices for ${tickers.length} tickers`);
  return out;
}

// Crypto shape is different — /v2/crypto/us/latest/quotes and /trades. We
// use /trades for the last-print price, matching what /v2/stocks does.
interface AlpacaCryptoTradesResponse {
  trades?: Record<string, { p: number; t: string } | undefined>;
}

async function alpacaFetchCrypto(tickers: string[]): Promise<Map<string, StockPriceData>> {
  if (tickers.length === 0) return new Map();
  // Rewrite BTC-USD → BTC/USD. Alpaca expects the pair with a slash.
  const alpacaSymbols = tickers.map((t) => t.replace(/-(USD|USDT|EUR|GBP|BTC|ETH)$/, "/$1"));
  const symbolMap = new Map<string, string>();
  for (let i = 0; i < tickers.length; i += 1) symbolMap.set(alpacaSymbols[i]!, tickers[i]!);

  const url = `${ALPACA_DATA_URL}/v1beta3/crypto/us/latest/trades?symbols=${encodeURIComponent(alpacaSymbols.join(","))}`;
  const res = await fetch(url, {
    headers: alpacaHeaders(),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`Alpaca crypto HTTP ${res.status}`);
  const body = (await res.json()) as AlpacaCryptoTradesResponse;
  const out = new Map<string, StockPriceData>();
  const now = new Date().toISOString();
  for (const [alpacaSym, trade] of Object.entries(body.trades ?? {})) {
    if (!trade || typeof trade.p !== "number" || trade.p <= 0) continue;
    const yahooSym = symbolMap.get(alpacaSym) ?? alpacaSym;
    out.set(yahooSym, {
      ticker: yahooSym,
      price: trade.p,
      currency: "USD",
      // Crypto trades endpoint doesn't return prev-close. Leaving null
      // preserves the "day change unavailable" contract from Yahoo.
      previousClose: null,
      updatedAt: now,
    });
  }
  if (out.size === 0) throw new Error(`Alpaca crypto returned no usable prices for ${tickers.length} tickers`);
  return out;
}

export async function alpacaFetchPrices(tickers: string[]): Promise<Map<string, StockPriceData>> {
  return withProvider("alpaca", async () => {
    const { stocks, crypto } = partitionAlpacaTickers(tickers);
    if (stocks.length === 0 && crypto.length === 0) {
      throw new Error("alpaca has no coverable ticker in this batch");
    }
    // Run both endpoints in parallel; either failing doesn't fail the
    // other. Whichever succeeds contributes its results. Both failing
    // = whole-provider failure per the withProvider contract.
    const [stocksResult, cryptoResult] = await Promise.allSettled([
      alpacaFetchStocks(stocks),
      alpacaFetchCrypto(crypto),
    ]);
    const merged = new Map<string, StockPriceData>();
    if (stocksResult.status === "fulfilled") {
      for (const [k, v] of stocksResult.value) merged.set(k, v);
    } else {
      logger.info({ err: stocksResult.reason }, "alpaca stocks lane failed within provider");
    }
    if (cryptoResult.status === "fulfilled") {
      for (const [k, v] of cryptoResult.value) merged.set(k, v);
    } else {
      logger.info({ err: cryptoResult.reason }, "alpaca crypto lane failed within provider");
    }
    if (merged.size === 0) throw new Error("alpaca both lanes returned nothing");
    return merged;
  });
}

// ── Polygon ─────────────────────────────────────────────────────────────────

// Polygon free is 5 calls/min. We reserve 1 for the intraday history path
// that already uses Polygon (see market.ts getStockHistory), leaving 4 for
// snapshots. That's the whole reason the snapshot adapter is per-ticker
// and quota-aware rather than a batch.

const POLYGON_KEY = process.env.POLYGON_API_KEY ?? "";
const POLYGON_MINUTE_BUDGET = 4; // 1 reserved for intraday history
const polygonMinuteWindow = { start: Date.now(), used: 0 };

function polygonMinuteBudgetOk(): boolean {
  const now = Date.now();
  if (now - polygonMinuteWindow.start >= 60_000) {
    polygonMinuteWindow.start = now;
    polygonMinuteWindow.used = 0;
  }
  return polygonMinuteWindow.used < POLYGON_MINUTE_BUDGET;
}
function polygonMinuteBudgetConsume(): void {
  polygonMinuteWindow.used += 1;
}

// Polygon snapshot response — only the fields we use.
interface PolygonSnapshotResponse {
  status?: string;
  ticker?: {
    ticker: string;
    day?: { c?: number };
    lastTrade?: { p?: number };
    prevDay?: { c?: number };
  };
}

function polygonSymbol(ticker: string): string {
  // BRK-B → BRK.B on Polygon; strip Yahoo exchange suffixes (should not be
  // routed here anyway). Crypto path uses X:BTCUSD.
  if (/-(USD|USDT|EUR|GBP|BTC|ETH)$/.test(ticker)) {
    return `X:${ticker.replace(/-/, "")}`;
  }
  return ticker.replace(/-/, ".").replace(/\.[A-Z]{1,3}$/, "");
}

export async function polygonFetchPrices(tickers: string[]): Promise<Map<string, StockPriceData>> {
  return withProvider("polygon", async () => {
    const out = new Map<string, StockPriceData>();
    for (const ticker of tickers) {
      if (!polygonMinuteBudgetOk()) {
        // Refuse the rest of the batch rather than eating a 429. Callers
        // fall through to Twelve Data for whatever's still missing.
        logger.info({ remaining: tickers.length - out.size }, "polygon minute budget exhausted, refusing rest of batch");
        break;
      }
      const isCrypto = /-(USD|USDT|EUR|GBP|BTC|ETH)$/.test(ticker);
      const polyTicker = polygonSymbol(ticker);
      const bucket = isCrypto ? "global/markets/crypto" : "us/markets/stocks";
      const url = `https://api.polygon.io/v2/snapshot/locale/${bucket}/tickers/${polyTicker}?apiKey=${POLYGON_KEY}`;
      try {
        polygonMinuteBudgetConsume();
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) {
          logger.info({ ticker, status: res.status }, "polygon snapshot non-2xx");
          continue;
        }
        const body = (await res.json()) as PolygonSnapshotResponse;
        const price = body.ticker?.lastTrade?.p ?? body.ticker?.day?.c ?? null;
        const prev = body.ticker?.prevDay?.c ?? null;
        if (typeof price !== "number" || price <= 0) continue;
        out.set(ticker, {
          ticker,
          price,
          currency: "USD",
          previousClose: typeof prev === "number" ? prev : null,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        logger.info({ err, ticker }, "polygon single-ticker snapshot threw");
      }
    }
    if (out.size === 0) throw new Error("polygon returned no usable prices");
    return out;
  });
}

// ── Twelve Data ─────────────────────────────────────────────────────────────
//
// Env-gated: if TWELVEDATA_API_KEY is unset, adapter refuses on the
// requireConfigured check inside withProvider. The health endpoint then
// reports { configured: false } which the operator sees as "provider
// offline: no key" rather than the provider silently missing from the
// chain.
//
// Symbol rewriter handles the four cases the classifier can send us:
//   • US stocks / ETFs / crypto -USD → Twelve Data notation
//   • Forex GBPUSD=X            → GBP/USD
//   • Non-US equity VOD.L       → VOD:LSE (via YAHOO_SUFFIX_TO_TD)
//
// Credit budget: 1 credit per symbol per request. The chain arranges the
// cadence so the daily total stays under the soft cap (see the "budget
// arithmetic" header in market.ts around getStockPrices).

const TWELVEDATA_KEY = process.env.TWELVEDATA_API_KEY ?? "";

// Map Yahoo exchange suffixes to Twelve Data MIC-ish exchange codes.
// Verified against twelvedata.com/exchanges. Symbols not in this map are
// tried as bare US symbols and probably 404.
const YAHOO_SUFFIX_TO_TD: Record<string, string> = {
  L: "LSE",
  TO: "TSX",
  AX: "ASX",
  HK: "HKEX",
  DE: "XETR",
  PA: "Euronext",
  AM: "Euronext",
  BR: "Euronext",
  LS: "Euronext",
  MI: "MIL",
  MC: "BME",
  SS: "SSE",
  SZ: "SZSE",
  NS: "NSE",
  BO: "BSE",
  T: "TSE",
  SW: "SIX",
  ST: "OMX",
  NZ: "NZX",
  SG: "SGX",
  JO: "JSE",
  MX: "BMV",
  SR: "TADAWUL",
  KL: "MYX",
};

function twelveDataSymbol(ticker: string): string {
  const t = ticker.trim();
  if (t.endsWith("=X")) {
    // GBPUSD=X → GBP/USD. Assume 6-letter base+quote.
    const pair = t.replace(/=X$/, "");
    if (pair.length === 6) return `${pair.slice(0, 3)}/${pair.slice(3)}`;
    return t; // will 404, but that's honest
  }
  if (/-(USD|USDT|EUR|GBP|BTC|ETH)$/.test(t)) {
    return t.replace(/-/, "/");
  }
  const suffix = t.match(/\.([A-Z]{1,3})$/);
  if (suffix) {
    const tdExchange = YAHOO_SUFFIX_TO_TD[suffix[1]!];
    if (tdExchange) {
      return `${t.slice(0, -suffix[0]!.length)}:${tdExchange}`;
    }
    return t; // unknown exchange — try bare
  }
  return t;
}

interface TwelveDataQuoteRow {
  symbol?: string;
  price?: string | number;
  currency?: string;
  previous_close?: string | number;
  status?: string;
  code?: number;
  message?: string;
}

// Batch endpoint: /quote?symbol=A,B,C&apikey=. Returns an object keyed by
// symbol (or an error object if the whole call failed). Each symbol costs
// 1 credit whether it succeeds or errors.
export async function twelveDataFetchPrices(tickers: string[]): Promise<Map<string, StockPriceData>> {
  return withProvider(
    "twelvedata",
    async () => {
      if (tickers.length === 0) throw new Error("twelvedata called with empty ticker list");
      const tdSymbols = tickers.map(twelveDataSymbol);
      const symbolMap = new Map<string, string>();
      for (let i = 0; i < tickers.length; i += 1) symbolMap.set(tdSymbols[i]!, tickers[i]!);
      const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(tdSymbols.join(","))}&apikey=${TWELVEDATA_KEY}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
      const raw = (await res.json()) as unknown;
      const out = new Map<string, StockPriceData>();
      const now = new Date().toISOString();
      // Two response shapes:
      //   • Single symbol → flat object with price + previous_close
      //   • Multi symbol  → keyed by TD symbol
      // TD sometimes returns `{ code: 429, message: "..." }` at either
      // level for a rate-limited whole-call — treat that as failure.
      const asRecord = raw as Record<string, unknown>;
      if (asRecord && typeof asRecord === "object" && "code" in asRecord && typeof asRecord.code === "number" && asRecord.code >= 400) {
        throw new Error(`Twelve Data error ${asRecord.code}: ${String(asRecord.message ?? "unknown")}`);
      }
      const iterEntries: [string, TwelveDataQuoteRow][] =
        tickers.length === 1
          ? [[tdSymbols[0]!, raw as TwelveDataQuoteRow]]
          : Object.entries(asRecord as Record<string, TwelveDataQuoteRow>);

      for (const [tdSym, row] of iterEntries) {
        const yahooSym = symbolMap.get(tdSym) ?? tdSym;
        if (!row || typeof row !== "object") continue;
        if (row.code && row.code >= 400) {
          // Per-symbol error (trial-only market, unknown symbol, etc.).
          // Log at info so the operator can see which symbol Twelve Data
          // refused rather than silently dropping.
          logger.info(
            { ticker: yahooSym, tdSymbol: tdSym, code: row.code, message: row.message },
            "twelvedata refused symbol (likely paid-only)",
          );
          continue;
        }
        const price = typeof row.price === "string" ? parseFloat(row.price) : row.price;
        if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) continue;
        const prev =
          typeof row.previous_close === "string" ? parseFloat(row.previous_close) : row.previous_close;
        out.set(yahooSym, {
          ticker: yahooSym,
          price,
          currency: typeof row.currency === "string" ? row.currency : "USD",
          previousClose: typeof prev === "number" && Number.isFinite(prev) ? prev : null,
          updatedAt: now,
        });
      }
      if (out.size === 0) throw new Error(`Twelve Data returned no usable prices for ${tickers.length} tickers`);
      return out;
    },
    // 1 credit per symbol per request. withProvider enforces the daily
    // soft cap (95% of 800 = 760) before any HTTP call.
    { credits: tickers.length },
  );
}

// Enrich a StockPriceData into a StockQuoteData with nulls for fields the
// chain adapters don't return. Only Yahoo returns the rich analyst /
// options / 52w metadata; that's already tolerated in the type definition
// (every metadata field is `| null`).
export function priceToQuote(p: StockPriceData): StockQuoteData {
  return {
    ticker: p.ticker,
    price: p.price,
    currency: p.currency,
    updatedAt: p.updatedAt,
    pe: null, forwardPe: null, eps: null,
    high52w: null, low52w: null, marketCap: null, beta: null,
    dividendYield: null, analystTargetPrice: null,
    displayName: null,
    changePercent:
      typeof p.previousClose === "number" && p.previousClose > 0
        ? Math.round(((p.price - p.previousClose) / p.previousClose) * 10000) / 100
        : null,
    dayHigh: null, dayLow: null, volume: null,
    previousClose: p.previousClose,
    nextEarningsDate: null, marketState: null,
    postMarketPrice: null, postMarketChangePercent: null,
    preMarketPrice: null, preMarketChangePercent: null,
    // Carry provenance through. Without this the Frankfurter forex lane
    // would arrive at the UI indistinguishable from a live Yahoo quote,
    // which is the one thing an ECB daily fixing must not look like.
    stale: p.stale,
    provider: p.provider,
  };
}

// ── Frankfurter (forex only) ────────────────────────────────────────────────
//
// The honest floor under the forex quote lane. Free, unauthenticated, no
// key, no credit budget, and — verified from Render's egress on
// 2026-09-06 — not subject to the shared-IP 429 that is currently
// closing the Yahoo crumb handshake.
//
// WHAT IT IS NOT. This is the ECB euro foreign exchange reference rate:
// one fixing per TARGET working day, published around 16:00 Europe/
// Brussels, based on a concertation procedure at 14:15 CET. It is not a
// tick, not a mid, not a tradeable price, and on a Saturday it is
// Friday's number. Every value this adapter returns is stamped with the
// fixing instant (not `now`) and tagged provider:"frankfurter" so the UI
// can label it rather than rendering it beside a live Yahoo quote as
// though the two were the same kind of thing.
//
// THE DELTA. Frankfurter's /latest carries no previous close, and a
// fabricated 0.00% would be exactly the defect class this repo spent a
// week removing. So we do not call /latest at all: we call the
// timeseries endpoint over a trailing window and take the last two
// distinct fixing dates. `previousClose` is then a real prior fixing and
// priceToQuote's changePercent is a real fixing-over-fixing move. If the
// window yields only one date (a long holiday run), previousClose stays
// null and the change renders "—".
//
// SYMBOL SHAPE. Yahoo forex notation, two forms:
//   GBPUSD=X  → base GBP, quote USD   (6 letters)
//   GBP=X     → base USD, quote GBP   (3 letters; Yahoo's USD-implied form)
// One HTTP call per distinct base currency; the batch is small (the
// overview set has 6 pairs across 3 bases) and the endpoint is free, so
// no cross-rate arithmetic is invented to save a request.

// ECB reference currencies, from https://api.frankfurter.dev/v1/currencies
// (checked 2026-09-06). A pair naming anything outside this set cannot be
// served and is left for orphanReason to explain — never approximated.
const ECB_CURRENCIES = new Set([
  "AUD", "BGN", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP",
  "HKD", "HUF", "IDR", "ILS", "INR", "ISK", "JPY", "KRW", "MXN", "MYR",
  "NOK", "NZD", "PHP", "PLN", "RON", "SEK", "SGD", "THB", "TRY", "USD",
  "ZAR",
]);

// Trailing window for the timeseries call. Long enough to clear a
// Christmas/Easter TARGET closure and still return two fixings.
const FRANKFURTER_LOOKBACK_DAYS = 12;

export interface FrankfurterPair {
  base: string;
  quote: string;
}

// Parse a Yahoo forex ticker into an ECB-serviceable base/quote pair, or
// null when it is not one. `null` is a routing answer, not an error — the
// chain simply leaves the ticker for the orphan log.
export function frankfurterPair(ticker: string): FrankfurterPair | null {
  const t = ticker.trim().toUpperCase();
  if (!t.endsWith("=X")) return null;
  const body = t.slice(0, -2);
  let base: string;
  let quote: string;
  if (body.length === 6) {
    base = body.slice(0, 3);
    quote = body.slice(3);
  } else if (body.length === 3) {
    // Yahoo's `GBP=X` means USD → GBP.
    base = "USD";
    quote = body;
  } else {
    return null;
  }
  if (base === quote) return null;
  if (!ECB_CURRENCIES.has(base) || !ECB_CURRENCIES.has(quote)) return null;
  return { base, quote };
}

// The ECB publishes the daily reference fixing at about 16:00 Europe/
// Brussels. Stamping the row with that instant rather than `now` is the
// whole honesty mechanism: a Sunday reader sees Friday's timestamp.
// Brussels is UTC+1 in winter and UTC+2 in summer, so the offset is read
// off the zone rather than hardcoded.
export function ecbFixingInstant(isoDate: string): string {
  const probe = new Date(`${isoDate}T12:00:00Z`);
  const wallHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Brussels",
      hour: "2-digit",
      hour12: false,
    }).format(probe),
  );
  // wallHour - 12 is the zone's UTC offset in hours on that date.
  const offsetHours = Number.isFinite(wallHour) ? wallHour - 12 : 1;
  const utcHour = 16 - offsetHours;
  return `${isoDate}T${String(utcHour).padStart(2, "0")}:00:00.000Z`;
}

interface FrankfurterTimeseriesResponse {
  amount?: number;
  base?: string;
  start_date?: string;
  end_date?: string;
  rates?: Record<string, Record<string, number> | undefined>;
}

// One timeseries call for one base currency, covering every quote
// currency requested against it.
async function frankfurterFetchBase(
  base: string,
  entries: { ticker: string; quote: string }[],
): Promise<Map<string, StockPriceData>> {
  const start = new Date(Date.now() - FRANKFURTER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const symbols = [...new Set(entries.map((e) => e.quote))].join(",");
  const url = `https://api.frankfurter.dev/v1/${start}..?base=${base}&symbols=${symbols}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status} for base ${base}`);
  const body = (await res.json()) as FrankfurterTimeseriesResponse;

  // Dates are ISO yyyy-mm-dd, so lexical sort is chronological.
  const dates = Object.keys(body.rates ?? {}).sort();
  const out = new Map<string, StockPriceData>();
  if (dates.length === 0) return out;

  const latestDate = dates[dates.length - 1]!;
  const latestRow = body.rates?.[latestDate] ?? {};
  const updatedAt = ecbFixingInstant(latestDate);

  for (const { ticker, quote } of entries) {
    const price = latestRow[quote];
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) continue;
    // Walk backwards for the most recent EARLIER date that actually
    // carries this quote currency. A currency can be absent from one
    // fixing (rare, but the ECB does suspend a currency); taking
    // dates[len-2] blindly would then produce a null-vs-number compare.
    let previousClose: number | null = null;
    for (let i = dates.length - 2; i >= 0; i -= 1) {
      const candidate = body.rates?.[dates[i]!]?.[quote];
      if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
        previousClose = candidate;
        break;
      }
    }
    out.set(ticker, {
      ticker,
      price,
      // The pair's price is expressed in the QUOTE currency: GBPUSD=X is
      // 1.353 USD per GBP.
      currency: quote,
      previousClose,
      updatedAt,
      provider: "frankfurter",
    });
  }
  return out;
}

// Batch entry point, matching the shape of the other adapters. Throws on
// whole-batch failure so withProvider trips the breaker; a partial result
// counts as success and the caller leaves the rest to the orphan log.
export async function frankfurterFetchPrices(tickers: string[]): Promise<Map<string, StockPriceData>> {
  return withProvider("frankfurter", async () => {
    if (tickers.length === 0) throw new Error("frankfurter called with empty ticker list");
    // Group by base currency — one HTTP call each.
    const byBase = new Map<string, { ticker: string; quote: string }[]>();
    for (const ticker of tickers) {
      const pair = frankfurterPair(ticker);
      if (!pair) {
        logger.info({ ticker }, "frankfurter cannot serve ticker (not an ECB pair)");
        continue;
      }
      const list = byBase.get(pair.base) ?? [];
      list.push({ ticker, quote: pair.quote });
      byBase.set(pair.base, list);
    }
    if (byBase.size === 0) {
      throw new Error(`Frankfurter had no ECB-serviceable pair among ${tickers.length} tickers`);
    }
    const settled = await Promise.allSettled(
      [...byBase.entries()].map(([base, entries]) => frankfurterFetchBase(base, entries)),
    );
    const out = new Map<string, StockPriceData>();
    for (const r of settled) {
      if (r.status === "fulfilled") {
        for (const [k, v] of r.value) out.set(k, v);
      } else {
        logger.warn({ err: r.reason instanceof Error ? r.reason.message : r.reason }, "frankfurter base call failed");
      }
    }
    if (out.size === 0) {
      throw new Error(`Frankfurter returned no usable rates for ${tickers.length} tickers`);
    }
    return out;
  });
}
