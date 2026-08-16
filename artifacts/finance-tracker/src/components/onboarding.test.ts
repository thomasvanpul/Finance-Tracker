// Unit tests for the persona-inference table. Table-shaped rules
// deserve table-shaped tests so a future edit that adds a persona has
// one visible place to extend.

import { describe, it, expect } from "vitest";
import { inferPersona } from "./onboarding";

describe("inferPersona", () => {
  it("returns full when the user picks nothing in Q1", () => {
    expect(inferPersona([], null, null)).toBe("full");
    expect(inferPersona([], "no", "focused")).toBe("full");
  });

  it("maps a single Q1 selection 1:1 to the matching persona", () => {
    expect(inferPersona(["market"], null, null)).toBe("market");
    expect(inferPersona(["budget"], null, null)).toBe("budget");
    expect(inferPersona(["wealth"], null, null)).toBe("wealth");
    expect(inferPersona(["social"], null, null)).toBe("social");
  });

  it("escalates to full when the user picks more than one Q1 item", () => {
    expect(inferPersona(["market", "budget"], null, null)).toBe("full");
    expect(inferPersona(["market", "budget", "wealth"], null, null)).toBe("full");
    expect(inferPersona(["social", "wealth"], null, null)).toBe("full");
  });

  it("returns full when Q3 says 'everything' regardless of Q1", () => {
    // The brief: "someone who says they want to track investments and
    // does not mention budgeting gets market" — but if they ALSO ask
    // to see everything, they win the tie.
    expect(inferPersona(["market"], null, "everything")).toBe("full");
    expect(inferPersona(["budget"], null, "everything")).toBe("full");
  });

  it("keeps market when Q1 is only investments and Q3 is focused", () => {
    // This is the case the brief pointed at as a load-bearing outcome:
    // a market-persona user must land on the portfolio screen, not on
    // a bank-connect prompt.
    expect(inferPersona(["market"], "no", "focused")).toBe("market");
    expect(inferPersona(["market"], "later", "focused")).toBe("market");
  });

  it("Q2 does not override Q1 once Q1 is unambiguous", () => {
    // Answering "yes I'll connect a bank" alongside a market-only Q1
    // does NOT escalate to full. Q1 owns persona; Q2 informs the
    // connection UI defaults.
    expect(inferPersona(["market"], "yes", "focused")).toBe("market");
    expect(inferPersona(["budget"], "no", "focused")).toBe("budget");
  });
});
