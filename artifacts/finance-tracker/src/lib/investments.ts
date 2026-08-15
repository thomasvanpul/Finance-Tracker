// Type-narrowing helpers for investment positions after G10.
//
// The API returns priceAvailable=false with every price-derived field null
// when the market provider can't quote a ticker. Consumers that aggregate
// (sums, weights, allocation charts) must filter first so a market outage
// doesn't silently shrink a total; consumers that render one row can
// branch on priceAvailable and print "—" instead.

type MaybePriced = {
  priceAvailable: boolean;
  livePrice: number | null;
  currentValue: number | null;
  gbpValue: number | null;
  plGbp: number | null;
  plPercent: number | null;
};

export type PricedInvestment<T extends MaybePriced> = Omit<
  T,
  "priceAvailable" | "livePrice" | "currentValue" | "gbpValue" | "plGbp" | "plPercent"
> & {
  priceAvailable: true;
  livePrice: number;
  currentValue: number;
  gbpValue: number;
  plGbp: number;
  plPercent: number;
};

export function isPriced<T extends MaybePriced>(inv: T): inv is T & PricedInvestment<T> {
  return inv.priceAvailable === true;
}

export function pricedOnly<T extends MaybePriced>(list: readonly T[]): (T & PricedInvestment<T>)[] {
  return list.filter(isPriced);
}
