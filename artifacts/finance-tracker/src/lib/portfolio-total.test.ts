// BACKLOG L1: phone HOME printed "PORTFOLIO £0" for a user who holds stock,
// because the API sent totalValueBase: 0 and `0 != null` passed the guard.
import { describe, expect, it } from "vitest";
import { knownPortfolioTotal } from "./portfolio-total";

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
