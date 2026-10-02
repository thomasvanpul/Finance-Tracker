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

// The total a screen may ADD to account balances. A partly-valued total is
// fine printed beside its "N unavailable" note, but summed into a net worth
// it vanishes into a plausible figure (BACKLOG L2), so only a total that
// covers every position counts here.
export function completePortfolioTotal(p: PortfolioTotalInput | null | undefined): number | null {
  if (p == null || p.unavailablePositions > 0) return null;
  return knownPortfolioTotal(p);
}

// P/L is null when positions are held and none is priced (valued at cost a
// position has no known return). These keep the "—" and its neutral colour
// in one place instead of a `>= 0` that reads null as a gain.
export function plTone(pl: number | null | undefined): string {
  if (pl == null) return "var(--ft-dim)";
  return pl >= 0 ? "var(--ft-green)" : "var(--ft-red)";
}

export function signedPl(pl: number | null | undefined, format: (v: number) => string): string {
  if (pl == null) return "—";
  return `${pl >= 0 ? "+" : ""}${format(pl)}`;
}
