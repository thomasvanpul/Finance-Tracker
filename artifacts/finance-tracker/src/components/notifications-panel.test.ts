// Persona → AlertKind filter table lock. Same table-shape test as
// providersForPersona/inferPersona so adding a persona has one visible
// place to extend.
import { describe, it, expect } from "vitest";
import { alertKindsForPersona } from "./notifications-panel";

describe("alertKindsForPersona", () => {
  it("market sees balance/transaction/market; NOT budget/bill/goal/debt", () => {
    const k = alertKindsForPersona("market");
    expect(k.has("balance")).toBe(true);
    expect(k.has("transaction")).toBe(true);
    expect(k.has("market")).toBe(true);
    expect(k.has("budget")).toBe(false);
    expect(k.has("bill")).toBe(false);
    expect(k.has("goal")).toBe(false);
    expect(k.has("debt")).toBe(false);
  });

  it("budget sees budget/transaction/bill/balance; NOT market", () => {
    const k = alertKindsForPersona("budget");
    expect(k.has("budget")).toBe(true);
    expect(k.has("transaction")).toBe(true);
    expect(k.has("bill")).toBe(true);
    expect(k.has("balance")).toBe(true);
    expect(k.has("market")).toBe(false);
  });

  it("wealth sees goal/balance/market; NOT budget/transaction", () => {
    const k = alertKindsForPersona("wealth");
    expect(k.has("goal")).toBe(true);
    expect(k.has("balance")).toBe(true);
    expect(k.has("market")).toBe(true);
    expect(k.has("budget")).toBe(false);
    expect(k.has("transaction")).toBe(false);
  });

  it("social sees debt/bill/balance; NOT market/budget/goal", () => {
    const k = alertKindsForPersona("social");
    expect(k.has("debt")).toBe(true);
    expect(k.has("bill")).toBe(true);
    expect(k.has("balance")).toBe(true);
    expect(k.has("market")).toBe(false);
    expect(k.has("budget")).toBe(false);
    expect(k.has("goal")).toBe(false);
  });

  it("full sees every kind", () => {
    const k = alertKindsForPersona("full");
    for (const kind of ["budget", "transaction", "bill", "debt", "goal", "balance", "market"]) {
      expect(k.has(kind as never)).toBe(true);
    }
  });
});
