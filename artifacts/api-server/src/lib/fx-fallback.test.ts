// FX fallback chain — Yahoo throws → Frankfurter fills.
//
// Companion to fx-honesty.test.ts. That file locks the "nothing gets
// fabricated when the whole chain is dark" invariant; this file locks
// the "Frankfurter fills when Yahoo is throttling" invariant, which is
// the actual failure mode we're currently in production.
//
// Both invariants matter. Confirming the fallback works matters even
// more than confirming the honesty layer, because the honesty layer
// was already in place — the outage today proved it. What was missing
// was a second lane. This test exists so that lane doesn't silently
// regress the next time someone tries to "simplify" the FX getter.

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getFxRates, __setYahooForTesting } from "./market";
import { __resetProviderHealthForTesting } from "./provider-health";

// A Frankfurter response shape verified against the live endpoint on
// 2026-08-20. 200 OK, base=GBP, includes every currency in FX_PAIRS.
// The numeric values are yesterday's ECB reference rates and don't
// matter for the assertion — what matters is the shape.
const FRANKFURTER_BODY = {
  amount: 1,
  base: "GBP",
  date: "2026-08-19",
  rates: {
    USD: 1.3556, EUR: 1.1681, MYR: 5.5003, CNY: 9.1343,
    JPY: 215.66, AUD: 1.9158, CAD: 1.8804, SGD: 1.73,
    HKD: 10.6301, THB: 44.823, INR: 129.81,
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const throwingYahoo: any = {
  quote: async () => {
    throw new Error("mocked yahoo failure");
  },
};

beforeEach(() => {
  __setYahooForTesting(throwingYahoo);
  __resetProviderHealthForTesting();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FX fallback — Frankfurter fills when Yahoo is dark", () => {
  it("populates all 11 currencies from Frankfurter when Yahoo throws for every pair", async () => {
    // Stub fetch to return the Frankfurter shape. Simulates real
    // production behaviour: Yahoo 429s across the board, Frankfurter
    // is untouched and serves ECB rates.
    vi.stubGlobal("fetch", async (url: string) => {
      expect(url).toContain("api.frankfurter.dev");
      expect(url).toContain("base=GBP");
      // The chain requests only the currencies Yahoo missed. When
      // Yahoo missed everything, that's every currency in FX_PAIRS.
      expect(url).toContain("USD");
      expect(url).toContain("MYR");
      return new Response(JSON.stringify(FRANKFURTER_BODY), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const fx = await getFxRates();
    expect(fx.base).toBe("GBP");
    // All 11 currencies present, sourced from the Frankfurter body.
    expect(Object.keys(fx.rates).sort()).toEqual(
      ["AUD", "CAD", "CNY", "EUR", "HKD", "INR", "JPY", "MYR", "SGD", "THB", "USD"],
    );
    expect(fx.rates.MYR).toBe(5.5003);
    expect(fx.rates.USD).toBe(1.3556);
  });

  it("prefers Yahoo when Yahoo answers, ignores Frankfurter for those currencies", async () => {
    // Yahoo returns USD only; the fallback fills the other 10.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const partialYahoo: any = {
      quote: async (symbol: string) => {
        if (symbol === "GBPUSD=X") return { regularMarketPrice: 1.99 };
        throw new Error(`mocked yahoo failure for ${symbol}`);
      },
    };
    __setYahooForTesting(partialYahoo);

    vi.stubGlobal("fetch", async (url: string) => {
      // Verify Frankfurter is queried for only the 10 missing currencies,
      // not for USD which Yahoo already provided. Otherwise we'd be
      // wasting Frankfurter's daily quota (it doesn't have one — free
      // and unauth — but the principle stands: don't ask twice for
      // something you already know).
      expect(url).not.toContain("symbols=USD");
      expect(url).toContain("symbols=");
      // Return the same body; the code should only merge in what's
      // missing.
      return new Response(JSON.stringify(FRANKFURTER_BODY), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const fx = await getFxRates();
    // USD comes from the (deliberately unrealistic) Yahoo value — the
    // fact that it's 1.99 rather than the Frankfurter 1.3556 is the
    // proof that Yahoo won, not the fallback.
    expect(fx.rates.USD).toBe(1.99);
    // MYR came from Frankfurter.
    expect(fx.rates.MYR).toBe(5.5003);
  });

  it("returns whatever Yahoo delivered when Frankfurter also fails", async () => {
    // Yahoo returns USD, Frankfurter throws. Chain must not fabricate
    // the other 10 currencies — same honesty rule as before, just
    // testing the "one leg fails" case.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const partialYahoo: any = {
      quote: async (symbol: string) => {
        if (symbol === "GBPUSD=X") return { regularMarketPrice: 1.27 };
        throw new Error(`mocked yahoo failure for ${symbol}`);
      },
    };
    __setYahooForTesting(partialYahoo);
    vi.stubGlobal("fetch", async () => {
      throw new Error("mocked network failure");
    });

    const fx = await getFxRates();
    expect(fx.rates.USD).toBe(1.27);
    expect(fx.rates.MYR).toBeUndefined();
    expect(Object.keys(fx.rates)).toEqual(["USD"]);
  });
});
