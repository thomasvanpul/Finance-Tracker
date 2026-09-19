// Enrichment for a single investment position. Extracted from
// routes/investments.ts so the G10 contract (nullable live-price fields
// when the market API can't supply them) is testable.
//
// Correctness — 30 Aug 2026.
// This function used to divide by `fx.rates[currency] ?? 1` and return
// the result as `gbpValue` (renamed to `baseEquivalent` in the naming
// pass that followed). That was literal GBP: the FX cache is
// GBP-pivoted (market.ts:207), so a USD position came back in GBP
// regardless of the user's base currency. For a base-MYR user the
// summary endpoint was handing the frontend GBP figures which
// formatBaseMoney then stamped with "RM" — wrong digits under the
// right symbol, exactly the class of defect the mobile ledger purge
// closed for cash.
//
// Fix: take the user's base currency, pivot through GBP the same way
// toBase() does in market.ts, and return the base-currency value.
//
// The `?? 1` fallback is also removed. If either FX leg is missing
// (fromRate for the position's currency, or toRate for the user's
// base) the value fields go null — the same shape the G10 contract
// already uses for missing prices. Callers who used to sum
// `gbpValue` with `?? 0` now skip null-value rows explicitly in the
// summary-endpoint reduces, matching how they already skip
// !priceAvailable.
//
// plPercent fabrication is removed here too — divisor-guard survey
// item, `costBasis > 0 ? … : 0` on a percentage rendered a nonzero
// ratio for a cost basis of zero. Null is the honest answer.

import type { StockPriceData, FxRatesData } from "./market";
import { nativeCurrencyForTicker } from "./ticker-currency";

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
  /** Cost basis (shares × costPricePerShare) converted to the user's base
   *  currency — what was actually paid, never a fetched or invented price.
   *  Populated independently of priceAvailable, so a caller can fall back
   *  to it (and say so) instead of showing nothing when there is no live
   *  price. Null only when the base-currency FX leg itself is missing. */
  costBasisValueBase: number | null;
}
interface PricedFields {
  priceAvailable: true;
  livePrice: number;
  currentValue: number;
  // Nullable in the priced case too: a live price with no FX pivot
  // yields a native currentValue but no base equivalent. Callers must
  // treat this the same as they treat priceAvailable=false for base
  // aggregates. OpenAPI already declares these three as [number, null].
  baseEquivalent: number | null;
  plBase: number | null;
  plPercent: number | null;
}
interface UnpricedFields {
  priceAvailable: false;
  livePrice: null;
  currentValue: null;
  baseEquivalent: null;
  plBase: null;
  plPercent: null;
}

const round = (n: number) => Math.round(n * 100) / 100;

export interface InvestmentTotals {
  totalValueBase: number;
  totalPlBase: number;
  totalPlPercent: number | null;
  positions: number;
  /** Priced positions valued at cost basis instead of a live price — value
   *  is legitimate (what was paid), but there is no P/L or day-change for
   *  it. Already included in totalValueBase; surfaced so a caller can
   *  label the total as partly not-live rather than staying silent. */
  positionsAtCost: number;
  /** Positions excluded from every total above because NEITHER a live
   *  price NOR the cost basis could be converted to the base currency
   *  (the FX leg itself is missing) — the one case still genuinely
   *  unaccounted for. */
  unavailablePositions: number;
}

/** Folds enriched positions into portfolio totals. Live-priced positions
 *  contribute their market value and P/L; unpriced positions fall back to
 *  costBasisValueBase (P/L 0 — valuing at cost cannot show a return); only
 *  a position with neither is dropped. Shared by GET /investments/summary
 *  and, in spirit, dashboard.ts's processInvestments — same rule, applied
 *  to the DB-shaped rows dashboard.ts already has in hand. */
export function summarizeInvestments(enriched: readonly EnrichedPosition[]): InvestmentTotals {
  let totalValueBase = 0;
  let totalPlBase = 0;
  let positionsAtCost = 0;
  let unavailablePositions = 0;
  for (const e of enriched) {
    if (e.priceAvailable && e.baseEquivalent != null && e.plBase != null) {
      totalValueBase += e.baseEquivalent;
      totalPlBase += e.plBase;
      continue;
    }
    if (e.costBasisValueBase != null) {
      totalValueBase += e.costBasisValueBase;
      positionsAtCost += 1;
      continue;
    }
    unavailablePositions += 1;
  }
  const totalCostBase = totalValueBase - totalPlBase;
  // No cost basis → no return to compute. Null, not 0 — see plPercent
  // above for the same rule and reason.
  const totalPlPercent: number | null = totalCostBase > 0 ? (totalPlBase / totalCostBase) * 100 : null;
  return {
    totalValueBase: round(totalValueBase),
    totalPlBase: round(totalPlBase),
    totalPlPercent: totalPlPercent == null ? null : round(totalPlPercent),
    positions: enriched.length,
    positionsAtCost,
    unavailablePositions,
  };
}

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
  // Live price currency when we have one; otherwise the ticker's own
  // exchange currency (nativeCurrencyForTicker), not a hardcoded "USD" —
  // an unpriced LSE holding is denominated in GBP whether or not a quote
  // came back for it today.
  const currency = priceData?.currency ?? nativeCurrencyForTicker(inv.ticker);
  const costBasisNative = shares * costPrice;
  const costFromRate = currency === "GBP" ? 1 : fx.rates[currency];
  const costToRate = baseCurrency === "GBP" ? 1 : fx.rates[baseCurrency];
  const costBasisValueBase: number | null =
    costFromRate && costToRate ? round((costBasisNative / costFromRate) * costToRate) : null;

  const base: BasePosition = {
    id: inv.id,
    ticker: inv.ticker,
    name: inv.name,
    buyDate: inv.buyDate,
    shares,
    costPricePerShare: costPrice,
    currency,
    createdAt: inv.createdAt.toISOString(),
    costBasisValueBase,
  };

  if (!hasFinitePrice) {
    return {
      ...base,
      priceAvailable: false,
      livePrice: null,
      currentValue: null,
      plBase: null,
      plPercent: null,
      baseEquivalent: null,
    };
  }

  const livePrice = priceData!.price;
  const currentValue = shares * livePrice;
  const costBasis = costBasisNative;
  const plNative = currentValue - costBasis;
  // Divisor guard: a zero cost basis makes the percentage undefined,
  // not zero. Null propagates through totals honestly; the old `: 0`
  // fabricated a break-even return for a position that had no cost.
  const plPercent = costBasis > 0 ? (plNative / costBasis) * 100 : null;

  // Pivot through GBP using the same math as toBase() in market.ts. Same
  // currency and baseCurrency as costBasisValueBase above, so reuse its
  // rates rather than re-deriving them. Missing either leg drops
  // base-denominated fields to null — matches the G10 shape for missing
  // prices and stops the "USD figure served as GBP" lie the `?? 1`
  // fallback used to hide.
  const baseValue: number | null =
    costFromRate && costToRate ? (currentValue / costFromRate) * costToRate : null;
  const baseCost: number | null =
    costFromRate && costToRate ? (costBasis / costFromRate) * costToRate : null;
  const plBase: number | null =
    baseValue != null && baseCost != null ? baseValue - baseCost : null;

  return {
    ...base,
    priceAvailable: true,
    livePrice,
    currentValue: round(currentValue),
    plBase: plBase == null ? null : round(plBase),
    plPercent: plPercent == null ? null : round(plPercent),
    baseEquivalent: baseValue == null ? null : round(baseValue),
  };
}
