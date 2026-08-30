// Enrichment for a single investment position. Extracted from
// routes/investments.ts so the G10 contract (nullable live-price fields
// when the market API can't supply them) is testable.
//
// Correctness — 30 Aug 2026.
// This function used to divide by `fx.rates[currency] ?? 1` and return
// the result as `gbpValue`. That was literal GBP: the FX cache is
// GBP-pivoted (market.ts:207), so a USD position came back in GBP
// regardless of the user's base currency. For a base-MYR user the
// summary endpoint was handing the frontend GBP figures which
// formatBaseMoney then stamped with "RM" — wrong digits under the
// right symbol, exactly the class of defect the mobile ledger purge
// closed for cash.
//
// Fix: take the user's base currency, pivot through GBP the same way
// toBase() does in market.ts, and return the base-currency value. The
// field is still named `gbpValue` at this commit; the rename to
// `baseEquivalent` (with the matching rename for plGbp → plBase, and
// totalValueGbp / totalPlGbp / dayChangeGbp) is the next commit, so
// this one is behaviour-only and cannot silently regress a naming
// sweep in the same diff.
//
// The `?? 1` fallback is also removed. If either FX leg is missing
// (fromRate for the position's currency, or toRate for the user's
// base) the value fields go null — the same shape the G10 contract
// already uses for missing prices. Callers who currently sum
// `gbpValue` without a null-guard start under-counting missing
// positions; the summary-endpoint reduces are updated in the same
// commit to skip null-value rows explicitly, matching how they
// already skip !priceAvailable.
//
// plPercent fabrication is removed here too — divisor-guard survey
// item, `costBasis > 0 ? … : 0` on a percentage rendered a nonzero
// ratio for a cost basis of zero. Null is the honest answer.

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
  // Nullable in the priced case too: a live price with no FX pivot
  // yields a native currentValue but no base equivalent. Callers must
  // treat this the same as they treat priceAvailable=false for base
  // aggregates. OpenAPI already declares these three as [number, null].
  gbpValue: number | null;
  plGbp: number | null;
  plPercent: number | null;
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
  baseCurrency: string,
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
  // Divisor guard: a zero cost basis makes the percentage undefined,
  // not zero. Null propagates through totals honestly; the old `: 0`
  // fabricated a break-even return for a position that had no cost.
  const plPercent = costBasis > 0 ? (plNative / costBasis) * 100 : null;

  // Pivot through GBP using the same math as toBase() in market.ts.
  // Missing either leg drops base-denominated fields to null — matches
  // the G10 shape for missing prices and stops the "USD figure served
  // as GBP" lie the `?? 1` fallback used to hide.
  const fromRate = currency === "GBP" ? 1 : fx.rates[currency];
  const toRate = baseCurrency === "GBP" ? 1 : fx.rates[baseCurrency];
  const baseValue: number | null =
    fromRate && toRate ? (currentValue / fromRate) * toRate : null;
  const baseCost: number | null =
    fromRate && toRate ? (costBasis / fromRate) * toRate : null;
  const plBase: number | null =
    baseValue != null && baseCost != null ? baseValue - baseCost : null;

  return {
    ...base,
    priceAvailable: true,
    livePrice,
    currentValue: round(currentValue),
    plGbp: plBase == null ? null : round(plBase),
    plPercent: plPercent == null ? null : round(plPercent),
    gbpValue: baseValue == null ? null : round(baseValue),
  };
}
