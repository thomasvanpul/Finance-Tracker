// Persona → AlertKind filter table lock. Same table-shape test as
// providersForPersona/inferPersona so adding a persona has one visible
// place to extend.
import { describe, it, expect } from "vitest";
// Imported from lib/notification-kinds directly so this test doesn't
// have to load notifications-panel.tsx (whose transitive imports
// touch window at module init).
import { alertKindsForPersona } from "@/lib/notification-kinds";

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

  it("social sees debt/bill/balance/shared-expense; NOT market/budget/goal", () => {
    const k = alertKindsForPersona("social");
    expect(k.has("debt")).toBe(true);
    expect(k.has("bill")).toBe(true);
    expect(k.has("balance")).toBe(true);
    expect(k.has("shared-expense")).toBe(true);
    expect(k.has("market")).toBe(false);
    expect(k.has("budget")).toBe(false);
    expect(k.has("goal")).toBe(false);
  });

  it("budget sees shared-expense (a split is a spending event)", () => {
    expect(alertKindsForPersona("budget").has("shared-expense")).toBe(true);
  });

  it("market and wealth DO NOT see shared-expense", () => {
    expect(alertKindsForPersona("market").has("shared-expense")).toBe(false);
    expect(alertKindsForPersona("wealth").has("shared-expense")).toBe(false);
  });

  it("full sees every kind", () => {
    const k = alertKindsForPersona("full");
    for (const kind of ["budget", "transaction", "bill", "debt", "goal", "balance", "market", "shared-expense"]) {
      expect(k.has(kind as never)).toBe(true);
    }
  });
});
