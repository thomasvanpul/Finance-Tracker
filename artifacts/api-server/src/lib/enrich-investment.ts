// Enrichment for a single investment position. Extracted from
// routes/investments.ts so the G10 contract (nullable live-price fields
// when the market API can't supply them) is testable.

import type { StockPriceData, FxRatesData } from "./market";

// The narrow subset of the DB row this function needs. Types the arg to
// exactly what the tests supply, without pulling drizzle's inferred row
// shape through.
export interface InvestmentRow {
  id: number;
  ticker: string;
  name: string;
  buyDate: string;
  shares: string;
  costPricePerShare: string;
  createdAt: Date;
}

export type EnrichedPosition =
  | (BasePosition & PricedFields)
  | (BasePosition & UnpricedFields);

interface BasePosition {
  id: number;
  ticker: string;
  name: string;
  buyDate: string;
  shares: number;
  costPricePerShare: number;
  currency: string;
  createdAt: string;
}
interface PricedFields {
  priceAvailable: true;
  livePrice: number;
  currentValue: number;
  gbpValue: number;
  plGbp: number;
  plPercent: number;
}
interface UnpricedFields {
  priceAvailable: false;
  livePrice: null;
  currentValue: null;
  gbpValue: null;
  plGbp: null;
  plPercent: null;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function enrichInvestment(
  inv: InvestmentRow,
  priceMap: Map<string, StockPriceData>,
  fx: FxRatesData,
): EnrichedPosition {
  const shares = parseFloat(inv.shares);
  const costPrice = parseFloat(inv.costPricePerShare);
  const priceData = priceMap.get(inv.ticker);
  const hasFinitePrice =
    priceData != null &&
    typeof priceData.price === "number" &&
    Number.isFinite(priceData.price);
  const currency = priceData?.currency ?? "USD";

  const base: BasePosition = {
    id: inv.id,
    ticker: inv.ticker,
    name: inv.name,
    buyDate: inv.buyDate,
    shares,
    costPricePerShare: costPrice,
    currency,
    createdAt: inv.createdAt.toISOString(),
  };

  if (!hasFinitePrice) {
    return {
      ...base,
      priceAvailable: false,
      livePrice: null,
      currentValue: null,
      plGbp: null,
      plPercent: null,
      gbpValue: null,
    };
  }

  const livePrice = priceData!.price;
  const currentValue = shares * livePrice;
  const costBasis = shares * costPrice;
  const plNative = currentValue - costBasis;
  const plPercent = costBasis > 0 ? (plNative / costBasis) * 100 : 0;
  const fxRate = currency === "GBP" ? 1 : fx.rates[currency] ?? 1;
  const gbpValue = currentValue / fxRate;
  const costGbp = costBasis / fxRate;
  const plGbp = gbpValue - costGbp;

  return {
    ...base,
    priceAvailable: true,
    livePrice,
    currentValue: round(currentValue),
    plGbp: round(plGbp),
    plPercent: round(plPercent),
    gbpValue: round(gbpValue),
  };
}
