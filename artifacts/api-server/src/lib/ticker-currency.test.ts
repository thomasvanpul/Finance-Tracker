import { describe, it, expect } from "vitest";
import { nativeCurrencyForTicker } from "./ticker-currency";

describe("nativeCurrencyForTicker", () => {
  it("defaults to USD for a ticker with no exchange suffix", () => {
    expect(nativeCurrencyForTicker("AAPL")).toBe("USD");
  });

  it("resolves an LSE suffix to GBP", () => {
    expect(nativeCurrencyForTicker("VOD.L")).toBe("GBP");
  });

  it("resolves a Tokyo suffix to JPY", () => {
    expect(nativeCurrencyForTicker("7203.T")).toBe("JPY");
  });

  it("is case-insensitive", () => {
    expect(nativeCurrencyForTicker("vod.l")).toBe("GBP");
  });

  it("does not treat a ticker merely ending in the suffix letter as a suffix match", () => {
    // "BILL" ends in "LL", not the literal ".L" suffix — must stay USD.
    expect(nativeCurrencyForTicker("BILL")).toBe("USD");
  });
});
