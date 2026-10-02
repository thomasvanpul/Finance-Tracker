// BACKLOG L1: phone HOME printed "PORTFOLIO £0" for a user who holds stock,
// because the API sent totalValueBase: 0 and `0 != null` passed the guard.
import { describe, expect, it } from "vitest";
import { completePortfolioTotal, knownPortfolioTotal, plTone, signedPl } from "./portfolio-total";

describe("knownPortfolioTotal — a portfolio nobody could value is unknown, not £0", () => {
  it("null from the API stays null", () => {
    expect(knownPortfolioTotal({ totalValueBase: null, unavailablePositions: 1 })).toBeNull();
  });

  it("0 with unvaluable positions is unknown — the shape an API from before the L1 fix still sends", () => {
    expect(knownPortfolioTotal({ totalValueBase: 0, unavailablePositions: 2 })).toBeNull();
  });

  it("0 with nothing unavailable is an honest empty portfolio", () => {
    expect(knownPortfolioTotal({ totalValueBase: 0, unavailablePositions: 0 })).toBe(0);
  });

  it("a partly-valued total keeps its figure; the caller labels the missing positions", () => {
    expect(knownPortfolioTotal({ totalValueBase: 1440, unavailablePositions: 1 })).toBe(1440);
  });

  it("no portfolio block at all is unknown", () => {
    expect(knownPortfolioTotal(undefined)).toBeNull();
  });
});

// BACKLOG L2: /accounts and /net-worth-history add the portfolio to account
// balances in the browser. A sum that leaves positions out, unsaid, is a
// net worth that reads as a different, plausible number.
describe("completePortfolioTotal — only a total covering every position may be summed", () => {
  it("every position valued: the total", () => {
    expect(completePortfolioTotal({ totalValueBase: 1440, unavailablePositions: 0 })).toBe(1440);
  });
  it("an empty portfolio is an honest 0", () => {
    expect(completePortfolioTotal({ totalValueBase: 0, unavailablePositions: 0 })).toBe(0);
  });
  it("a partly-valued total cannot be summed", () => {
    expect(completePortfolioTotal({ totalValueBase: 1440, unavailablePositions: 1 })).toBeNull();
  });
  it("an unknown total cannot be summed", () => {
    expect(completePortfolioTotal({ totalValueBase: null, unavailablePositions: 2 })).toBeNull();
    expect(completePortfolioTotal(undefined)).toBeNull();
  });
});

describe("plTone / signedPl — an unknown P/L is neither a gain nor a loss", () => {
  const fmt = (v: number) => `£${v.toFixed(2)}`;
  it("null is a dash in the neutral colour", () => {
    expect(signedPl(null, fmt)).toBe("—");
    expect(plTone(null)).toBe("var(--ft-dim)");
  });
  it("a real zero is still +£0.00", () => {
    expect(signedPl(0, fmt)).toBe("+£0.00");
  });
  it("signs a gain and leaves a loss's own minus", () => {
    expect(signedPl(12.5, fmt)).toBe("+£12.50");
    expect(signedPl(-3, fmt)).toBe("£-3.00");
    expect(plTone(-3)).toBe("var(--ft-red)");
  });
});
