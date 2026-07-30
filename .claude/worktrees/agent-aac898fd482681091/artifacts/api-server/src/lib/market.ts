import { logger } from "./logger";

// yahoo-finance2 v3: default export is the YahooFinance class — must be instantiated
// eslint-disable-next-line @typescript-eslint/no-require-imports
const YahooFinance = require("yahoo-finance2").default;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance: any = new YahooFinance();

export type FxRatesData = {
  base: string;
  rates: Record<string, number>;
  updatedAt: string;
};

export type StockPriceData = {
  ticker: string;
  price: number;
  currency: string;
  updatedAt: string;
};

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

export async function getFxRates(): Promise<FxRatesData> {
  const now = Date.now();
  if (fxCache && now - fxCache.ts < CACHE_TTL_MS) return fxCache.data;

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
        logger.warn({ err, symbol }, "FX rate fetch failed, using fallback");
      }
    })
  );

  // Fallbacks if fetch fails
  if (!rates.USD) rates.USD = 1.27;
  if (!rates.EUR) rates.EUR = 1.17;
  if (!rates.MYR) rates.MYR = 5.95;
  if (!rates.CNY) rates.CNY = 9.20;
  if (!rates.JPY) rates.JPY = 193;
  if (!rates.AUD) rates.AUD = 1.95;
  if (!rates.CAD) rates.CAD = 1.73;
  if (!rates.SGD) rates.SGD = 1.70;
  if (!rates.HKD) rates.HKD = 9.92;
  if (!rates.THB) rates.THB = 43.5;
  if (!rates.INR) rates.INR = 106;

  const data: FxRatesData = { base: "GBP", rates, updatedAt: new Date().toISOString() };
  fxCache = { data, ts: now };
  return data;
}

export async function toGbp(amount: number, currency: string): Promise<number> {
  if (currency === "GBP") return amount;
  const fx = await getFxRates();
  const rate = fx.rates[currency];
  if (!rate) return amount;
  return amount / rate;
}

export async function toBase(amount: number, fromCurrency: string, baseCurrency: string): Promise<number> {
  if (fromCurrency === baseCurrency) return amount;
  const fx = await getFxRates();
  // Convert fromCurrency → GBP → baseCurrency
  const fromRate = fromCurrency === "GBP" ? 1 : fx.rates[fromCurrency];
  const toRate = baseCurrency === "GBP" ? 1 : fx.rates[baseCurrency];
  if (!fromRate || !toRate) return amount;
  return (amount / fromRate) * toRate;
}

/** Convert a GBP amount to the target currency using live FX rates. */
export async function gbpTo(gbpAmount: number, targetCurrency: string): Promise<number> {
  if (targetCurrency === "GBP") return gbpAmount;
  const fx = await getFxRates();
  const rate = fx.rates[targetCurrency];
  if (!rate) return gbpAmount;
  return gbpAmount * rate;
}

export type StockQuoteData = {
  ticker: string;
  price: number;
  currency: string;
  updatedAt: string;
  pe: number | null;
  forwardPe: number | null;
  eps: number | null;
  high52w: number | null;
  low52w: number | null;
  marketCap: number | null;
  beta: number | null;
  dividendYield: number | null;
  analystTargetPrice: number | null;
  displayName: string | null;
};

const quoteCache = new Map<string, { data: StockQuoteData; ts: number }>();

export async function getStockQuotes(tickers: string[]): Promise<StockQuoteData[]> {
  const now = Date.now();
  const results: StockQuoteData[] = [];
  const toFetch: string[] = [];

  for (const ticker of tickers) {
    const cached = quoteCache.get(ticker);
    if (cached && now - cached.ts < CACHE_TTL_MS) {
      results.push(cached.data);
    } else {
      toFetch.push(ticker);
    }
  }

  await Promise.all(
    toFetch.map(async (ticker) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q: any = await yahooFinance.quote(ticker);
        const data: StockQuoteData = {
          ticker,
          price: typeof q?.regularMarketPrice === "number" ? q.regularMarketPrice : 0,
          currency: q?.currency ?? "USD",
          updatedAt: new Date().toISOString(),
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
        };
        quoteCache.set(ticker, { data, ts: now });
        results.push(data);
      } catch (err) {
        logger.warn({ err, ticker }, "Stock quote fetch failed");
        results.push({ ticker, price: 0, currency: "USD", updatedAt: new Date().toISOString(), pe: null, forwardPe: null, eps: null, high52w: null, low52w: null, marketCap: null, beta: null, dividendYield: null, analystTargetPrice: null, displayName: null });
      }
    })
  );

  return results;
}

export async function getStockPrices(tickers: string[]): Promise<StockPriceData[]> {
  const now = Date.now();
  const results: StockPriceData[] = [];
  const toFetch: string[] = [];

  for (const ticker of tickers) {
    const cached = stockCache.get(ticker);
    if (cached && now - cached.ts < CACHE_TTL_MS) {
      results.push(cached.data);
    } else {
      toFetch.push(ticker);
    }
  }

  await Promise.all(
    toFetch.map(async (ticker) => {
      try {
        const quote = await yahooFinance.quote(ticker);
        const price = quote?.regularMarketPrice ?? 0;
        const currency = quote?.currency ?? "USD";
        const data: StockPriceData = {
          ticker,
          price: typeof price === "number" ? price : 0,
          currency,
          updatedAt: new Date().toISOString(),
        };
        stockCache.set(ticker, { data, ts: now });
        results.push(data);
      } catch (err) {
        logger.warn({ err, ticker }, "Stock price fetch failed");
        results.push({ ticker, price: 0, currency: "USD", updatedAt: new Date().toISOString() });
      }
    })
  );

  return results;
}
