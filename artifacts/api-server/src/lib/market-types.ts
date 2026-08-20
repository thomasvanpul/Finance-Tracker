// Shared market-data types. Extracted from market.ts so that market-adapters.ts
// can import them without pulling in the yahoo-finance2 dependency and
// creating a circular import path between adapter modules and the top-level
// getter functions.
//
// The `stale` field on the price/quote shapes is new: it flags a value
// served from cache past the fresh-TTL window (5 min) but within the
// stale-serve window (30 min). The UI must show the stale timestamp
// rather than presenting the value as live. "A price from 12 minutes ago
// with a visible timestamp beats a dash." See lib/market.ts stale-serve
// header for the whole argument.

export type FxRatesData = {
  base: string;
  rates: Record<string, number>;
  updatedAt: string;
};

export type StockPriceData = {
  ticker: string;
  price: number;
  currency: string;
  previousClose: number | null;
  updatedAt: string;
  // True when the data was served from cache past the fresh window.
  // Optional so existing consumers that construct StockPriceData without
  // it (fresh data) don't need updating.
  stale?: boolean;
  // Which provider actually served this value. Optional for the same
  // reason; the health endpoint carries provider-level context, and
  // per-record provenance is informational.
  provider?: string;
};

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
  nextEarningsDate: string | null;
  marketState: string | null;
  postMarketPrice: number | null;
  postMarketChangePercent: number | null;
  preMarketPrice: number | null;
  preMarketChangePercent: number | null;
  stale?: boolean;
  provider?: string;
};
