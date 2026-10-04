// J28 remainder: every rate says where it came from, and every ECB fixing
// fetched is kept in fx_rates. With ENABLE_MARKET_DATA off the whole map is
// the ECB fixing, and the client can say "ECB" on the fx mark because the
// response says so rather than because the client assumes it.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const persisted: { date: string; base: string; rates: Record<string, number> }[] = [];
vi.mock("./fx-rates-store", () => ({
  persistEcbFixing: (date: string, base: string, rates: Record<string, number>) => {
    persisted.push({ date, base, rates });
  },
}));

const { getFxRates, __setYahooForTesting } = await import("./market");
const { __resetProviderHealthForTesting } = await import("./provider-health");

const FRANKFURTER_BODY = {
  amount: 1, base: "GBP", date: "2026-10-02",
  rates: { USD: 1.34, EUR: 1.15, MYR: 5.6, CNY: 9.5, JPY: 200, AUD: 2, CAD: 1.85, SGD: 1.72, HKD: 10.4, THB: 43, INR: 118 },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooAnswersEverything: any = { quote: async (symbol: string) => ({ symbol, regularMarketPrice: 1.5 }) };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooDown: any = { quote: async () => { throw new Error("throttled"); } };

beforeEach(() => {
  persisted.length = 0;
  __resetProviderHealthForTesting();
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(FRANKFURTER_BODY), { status: 200 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("getFxRates provenance (J28)", () => {
  it("flag off: the map is the ECB fixing, dated, and the fixing is stored", async () => {
    vi.stubEnv("ENABLE_MARKET_DATA", "");
    __setYahooForTesting(yahooAnswersEverything);
    const fx = await getFxRates();
    expect(fx.provider).toBe("ecb");
    expect(fx.fixingDate).toBe("2026-10-02");
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.date).toBe("2026-10-02");
    expect(persisted[0]!.base).toBe("GBP");
    expect(persisted[0]!.rates.MYR).toBe(5.6);
  });

  it("flag on, Yahoo answers everything: not labelled ECB, nothing stored", async () => {
    vi.stubEnv("ENABLE_MARKET_DATA", "1");
    __setYahooForTesting(yahooAnswersEverything);
    const fx = await getFxRates();
    expect(fx.provider).toBe("yahoo");
    expect(fx.fixingDate).toBeNull();
    expect(persisted).toHaveLength(0);
  });

  it("flag on, Yahoo down: ECB fills everything and is labelled so", async () => {
    vi.stubEnv("ENABLE_MARKET_DATA", "1");
    __setYahooForTesting(yahooDown);
    const fx = await getFxRates();
    expect(fx.provider).toBe("ecb");
    expect(fx.fixingDate).toBe("2026-10-02");
  });

  it("no provider answers: no provider is claimed", async () => {
    vi.stubEnv("ENABLE_MARKET_DATA", "");
    __setYahooForTesting(yahooDown);
    vi.stubGlobal("fetch", async () => new Response("down", { status: 503 }));
    const fx = await getFxRates();
    expect(Object.keys(fx.rates)).toHaveLength(0);
    expect(fx.provider).toBeNull();
    expect(fx.fixingDate).toBeNull();
    expect(persisted).toHaveLength(0);
  });
});

describe("fxProvenance — what a response carries for the fx mark", () => {
  it("passes the source and fixing day through", async () => {
    const { fxProvenance } = await import("./market");
    expect(fxProvenance({ base: "GBP", rates: { USD: 1.3 }, updatedAt: "", provider: "ecb", fixingDate: "2026-10-02" }))
      .toEqual({ fxProvider: "ecb", fxFixingDate: "2026-10-02" });
  });

  it("claims nothing for a cache that never stated a source", async () => {
    const { fxProvenance } = await import("./market");
    expect(fxProvenance({ base: "GBP", rates: { USD: 1.3 }, updatedAt: "" }))
      .toEqual({ fxProvider: null, fxFixingDate: null });
  });
});
