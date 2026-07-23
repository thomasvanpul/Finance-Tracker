import { logger } from "./logger";

// yahoo-finance2 v3: default export is the YahooFinance class — must be instantiated
// eslint-disable-next-line @typescript-eslint/no-require-imports
const YahooFinance = require("yahoo-finance2").default;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance: any = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

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
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  previousClose: number | null;
};

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
          changePercent: typeof q?.regularMarketChangePercent === "number" ? Math.round(q.regularMarketChangePercent * 100) / 100 : null,
          dayHigh: typeof q?.regularMarketDayHigh === "number" ? q.regularMarketDayHigh : null,
          dayLow: typeof q?.regularMarketDayLow === "number" ? q.regularMarketDayLow : null,
          volume: typeof q?.regularMarketVolume === "number" ? q.regularMarketVolume : null,
          previousClose: typeof q?.regularMarketPreviousClose === "number" ? q.regularMarketPreviousClose : null,
        };
        quoteCache.set(ticker, { data, ts: now });
        results.push(data);
      } catch (err) {
        logger.warn({ err, ticker }, "Stock quote fetch failed");
        results.push({ ticker, price: 0, currency: "USD", updatedAt: new Date().toISOString(), pe: null, forwardPe: null, eps: null, high52w: null, low52w: null, marketCap: null, beta: null, dividendYield: null, analystTargetPrice: null, displayName: null, changePercent: null, dayHigh: null, dayLow: null, volume: null, previousClose: null });
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

// ── History ───────────────────────────────────────────────────────────────────

const historyCache = new Map<string, { data: HistoryPoint[]; ts: number }>();
const HISTORY_TTL_MS = 30 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseHistoryRows(rows: any[]): HistoryPoint[] {
  return rows
    .filter((r) => r.close != null && typeof r.close === "number")
    .map((r) => ({
      date: r.date instanceof Date
        ? r.date.toISOString().slice(0, 10)
        : new Date(r.date as string | number).toISOString().slice(0, 10),
      open: typeof r.open === "number" ? r.open : r.close,
      high: typeof r.high === "number" ? r.high : r.close,
      low: typeof r.low === "number" ? r.low : r.close,
      close: r.close as number,
      volume: typeof r.volume === "number" ? r.volume : 0,
    }));
}

export async function getStockHistory(ticker: string, period: string): Promise<HistoryPoint[]> {
  const key = `${ticker}:${period}`;
  const now = Date.now();
  const cached = historyCache.get(key);
  if (cached && now - cached.ts < HISTORY_TTL_MS) return cached.data;

  const periodMap: Record<string, number> = {
    "1w": 7, "1m": 30, "3m": 90, "6m": 180, "1y": 365, "2y": 730, "5y": 1825,
  };
  const days = periodMap[period] ?? 365;
  const period1 = new Date(now - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const interval: "1d" | "1wk" | "1mo" =
    days <= 30 ? "1d" : days < 730 ? "1wk" : "1mo";

  // Try chart() first, fall back to historical() if it fails
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: HistoryPoint[] = [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.chart(ticker, { period1, interval });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = result?.quotes ?? [];
    data = parseHistoryRows(rows);
  } catch (chartErr) {
    logger.warn({ chartErr, ticker, period }, "chart() failed, trying historical()");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = await yahooFinance.historical(ticker, { period1, interval });
      data = parseHistoryRows(rows);
    } catch (histErr) {
      logger.warn({ histErr, ticker, period }, "historical() also failed");
    }
  }

  if (data.length > 0) {
    historyCache.set(key, { data, ts: now });
  }
  return data;
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
