// Persona → DecisionKind filter table lock, same shape as
// alertKindsForPersona and providersForPersona.
import { describe, it, expect } from "vitest";
import { decisionKindsForPersona } from "./decision-engine";

describe("decisionKindsForPersona", () => {
  it("market sees cash/portfolio; NOT budget/goal/subscription/debt", () => {
    const k = decisionKindsForPersona("market");
    expect(k.has("cash")).toBe(true);
    expect(k.has("portfolio")).toBe(true);
    expect(k.has("budget")).toBe(false);
    expect(k.has("goal")).toBe(false);
    expect(k.has("subscription")).toBe(false);
    expect(k.has("debt")).toBe(false);
  });

  it("budget sees subscription/budget/debt/goal; NOT cash/portfolio", () => {
    const k = decisionKindsForPersona("budget");
    expect(k.has("subscription")).toBe(true);
    expect(k.has("budget")).toBe(true);
    expect(k.has("debt")).toBe(true);
    expect(k.has("goal")).toBe(true);
    expect(k.has("cash")).toBe(false);
    expect(k.has("portfolio")).toBe(false);
  });

  it("wealth sees cash/portfolio/goal/budget; NOT subscription/debt", () => {
    const k = decisionKindsForPersona("wealth");
    expect(k.has("cash")).toBe(true);
    expect(k.has("portfolio")).toBe(true);
    expect(k.has("goal")).toBe(true);
    expect(k.has("budget")).toBe(true);
    expect(k.has("subscription")).toBe(false);
    expect(k.has("debt")).toBe(false);
  });

  it("social sees debt/subscription/budget; NOT cash/portfolio/goal", () => {
    const k = decisionKindsForPersona("social");
    expect(k.has("debt")).toBe(true);
    expect(k.has("subscription")).toBe(true);
    expect(k.has("budget")).toBe(true);
    expect(k.has("cash")).toBe(false);
    expect(k.has("portfolio")).toBe(false);
    expect(k.has("goal")).toBe(false);
  });

  it("full sees every kind", () => {
    const k = decisionKindsForPersona("full");
    for (const kind of ["cash", "portfolio", "goal", "subscription", "budget", "debt"]) {
      expect(k.has(kind as never)).toBe(true);
    }
  });
});
