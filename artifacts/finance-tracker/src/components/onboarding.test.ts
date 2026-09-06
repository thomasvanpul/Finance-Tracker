// Unit tests for the persona-inference table. Table-shaped rules
// deserve table-shaped tests so a future edit that adds a persona has
// one visible place to extend.
//
// The bank question (formerly Q2) was deleted along with its argument:
// it collected an answer the app then discarded.

import { describe, it, expect } from "vitest";
import { inferPersona } from "./onboarding";

describe("inferPersona", () => {
  it("returns full when the user picks nothing in Q1", () => {
    expect(inferPersona([], null)).toBe("full");
    expect(inferPersona([], "focused")).toBe("full");
  });

  it("maps a single Q1 selection 1:1 to the matching persona", () => {
    expect(inferPersona(["market"], null)).toBe("market");
    expect(inferPersona(["budget"], null)).toBe("budget");
    expect(inferPersona(["wealth"], null)).toBe("wealth");
    expect(inferPersona(["social"], null)).toBe("social");
  });

  it("escalates to full when the user picks more than one Q1 item", () => {
    expect(inferPersona(["market", "budget"], null)).toBe("full");
    expect(inferPersona(["market", "budget", "wealth"], null)).toBe("full");
    expect(inferPersona(["social", "wealth"], null)).toBe("full");
  });

  it("returns full when Q2 says 'everything' regardless of Q1", () => {
    // The brief: "someone who says they want to track investments and
    // does not mention budgeting gets market" — but if they ALSO ask
    // to see everything, they win the tie.
    expect(inferPersona(["market"], "everything")).toBe("full");
    expect(inferPersona(["budget"], "everything")).toBe("full");
  });

  it("keeps market when Q1 is only investments and Q2 is focused", () => {
    // This is the case the brief pointed at as a load-bearing outcome:
    // a market-persona user must land on the portfolio screen, not on
    // a bank-connect prompt.
    expect(inferPersona(["market"], "focused")).toBe("market");
  });
});
