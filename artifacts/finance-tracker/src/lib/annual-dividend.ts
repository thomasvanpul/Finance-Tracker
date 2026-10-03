// Estimated annual dividend across positions, from quoted yields.
//
// Yield exists only on a quote. With no position quoted (offline — quotes
// are never persisted — or market data off) the estimate is unknown and
// this returns null; the KPI draws "—", never £0. annual-dividend.test.ts.

export interface DividendPosition {
  ticker: string;
  shares: number;
}

export interface DividendQuote {
  price: number;
  dividendYield?: number | null;
}

export interface AnnualDividendEstimate {
  total: number;
  paying: number;
  unquoted: number;
}

export function estimatedAnnualDividend(
  positions: readonly DividendPosition[],
  quoteFor: (ticker: string) => DividendQuote | undefined,
): AnnualDividendEstimate | null {
  const quoted = positions.filter((p) => quoteFor(p.ticker) !== undefined);
  if (quoted.length === 0) return null;
  const payers = quoted.filter((p) => (quoteFor(p.ticker)?.dividendYield ?? 0) > 0);
  const total = payers.reduce((s, p) => {
    const q = quoteFor(p.ticker)!;
    return s + ((q.dividendYield as number) / 100) * q.price * p.shares;
  }, 0);
  return { total, paying: payers.length, unquoted: positions.length - quoted.length };
}
