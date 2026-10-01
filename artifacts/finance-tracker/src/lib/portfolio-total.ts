// The portfolio total a screen may print. Holding positions and valuing
// none of them is an unknown, not a portfolio worth zero (BACKLOG L1). The
// API sends null for that since 2 Oct 2026; an API from before then sent 0
// with unavailablePositions > 0, and the SPA (Vercel) and the API (Render)
// deploy separately, so this reads both shapes the same way.
export interface PortfolioTotalInput {
  totalValueBase: number | null;
  unavailablePositions: number;
}

export function knownPortfolioTotal(p: PortfolioTotalInput | null | undefined): number | null {
  if (p == null || p.totalValueBase == null) return null;
  if (p.totalValueBase === 0 && p.unavailablePositions > 0) return null;
  return p.totalValueBase;
}
