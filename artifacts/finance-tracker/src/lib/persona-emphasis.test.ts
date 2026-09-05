import { describe, it, expect } from "vitest";
import { homeSectionOrder, worthSectionOrder } from "./persona-emphasis";
import type { PersonaId } from "./persona";

const ALL: readonly PersonaId[] = ["market", "budget", "wealth", "social", "full"];

describe("persona-emphasis", () => {
  it("only the market persona leads WORTH with holdings", () => {
    expect(worthSectionOrder("market")).toEqual(["holdings", "cash"]);
    for (const p of ALL.filter((p) => p !== "market")) {
      expect(worthSectionOrder(p)).toEqual(["cash", "holdings"]);
    }
  });

  it("only the market persona leads HOME with markets", () => {
    expect(homeSectionOrder("market")).toEqual(["markets", "cashflow"]);
    for (const p of ALL.filter((p) => p !== "market")) {
      expect(homeSectionOrder(p)).toEqual(["cashflow", "markets"]);
    }
  });

  it("reorders, never drops — every persona gets both sections", () => {
    for (const p of ALL) {
      expect([...worthSectionOrder(p)].sort()).toEqual(["cash", "holdings"]);
      expect([...homeSectionOrder(p)].sort()).toEqual(["cashflow", "markets"]);
    }
  });
});
