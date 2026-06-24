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
  MYR: "GBPMYR=X",
  CNY: "GBPCNY=X",
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
  if (!rates.MYR) rates.MYR = 5.95;
  if (!rates.CNY) rates.CNY = 9.2;

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
