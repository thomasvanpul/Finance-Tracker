// J28 (BACKLOG § J): FX rates stay on with ENABLE_MARKET_DATA off — every
// converted balance depends on them, and lib/market-flag.ts keeps them
// outside the flag on purpose (confirmed with Thomas, 19 Sep 2026). But
// Yahoo is an unlicensed scrape, out on the same decision, and getFxRates
// still asked it first on every cache miss. With the flag off, FX comes
// from the ECB via Frankfurter and nothing else.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getFxRates, __setYahooForTesting } from "./market";
import { __resetProviderHealthForTesting } from "./provider-health";

const FRANKFURTER_BODY = {
  amount: 1, base: "GBP", date: "2026-10-01",
  rates: { USD: 1.34, EUR: 1.15, MYR: 5.6, CNY: 9.5, JPY: 200, AUD: 2, CAD: 1.85, SGD: 1.72, HKD: 10.4, THB: 43, INR: 118 },
};

let yahooCalls = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const countingYahoo: any = {
  quote: async (symbol: string) => {
    yahooCalls += 1;
    return { symbol, regularMarketPrice: 1.5 };
  },
};

beforeEach(() => {
  yahooCalls = 0;
  __setYahooForTesting(countingYahoo);
  __resetProviderHealthForTesting();
  vi.stubGlobal("fetch", async (url: string) => {
    expect(url).toContain("api.frankfurter.dev");
    return new Response(JSON.stringify(FRANKFURTER_BODY), { status: 200 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("getFxRates — Yahoo is behind ENABLE_MARKET_DATA (J28)", () => {
  it("flag off: Yahoo is never asked, and every rate comes from Frankfurter", async () => {
    vi.stubEnv("ENABLE_MARKET_DATA", "");
    const fx = await getFxRates();
    expect(yahooCalls).toBe(0);
    expect(fx.rates.USD).toBe(1.34);
    expect(fx.rates.MYR).toBe(5.6);
  });

  it("flag on: the existing chain is unchanged — Yahoo first", async () => {
    vi.stubEnv("ENABLE_MARKET_DATA", "1");
    const fx = await getFxRates();
    expect(yahooCalls).toBeGreaterThan(0);
    expect(fx.rates.USD).toBe(1.5);
  });
});
