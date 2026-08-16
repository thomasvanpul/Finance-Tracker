// Persona → provider-kind gating. Table-shaped rules deserve
// table-shaped tests so a future edit that adds a persona or a new
// provider kind has one visible place to extend.
import { describe, it, expect } from "vitest";
import { providersForPersona } from "./settings-connections";

describe("providersForPersona", () => {
  it("market persona sees broker and exchange, never a bank", () => {
    const ids = providersForPersona("market").map((p) => p.id);
    expect(ids).toContain("alpaca");
    expect(ids).toContain("kraken");
    expect(ids).not.toContain("wise");
  });

  it("budget persona sees banks, never broker or exchange", () => {
    const ids = providersForPersona("budget").map((p) => p.id);
    expect(ids).toContain("wise");
    expect(ids).not.toContain("alpaca");
    expect(ids).not.toContain("kraken");
  });

  it("social persona sees banks only (splits settle from a bank)", () => {
    const ids = providersForPersona("social").map((p) => p.id);
    expect(ids).toContain("wise");
    expect(ids).not.toContain("alpaca");
    expect(ids).not.toContain("kraken");
  });

  it("wealth persona sees banks, broker and exchange", () => {
    const ids = providersForPersona("wealth").map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["wise", "alpaca", "kraken"]));
  });

  it("full persona sees everything", () => {
    const ids = providersForPersona("full").map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["wise", "alpaca", "kraken"]));
  });
});
