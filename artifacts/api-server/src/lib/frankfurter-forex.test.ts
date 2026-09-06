// frankfurter-forex.test.ts
//
// WHAT THIS GUARDS
//
// The forex quote lane's last resort. Frankfurter serves the ECB daily
// euro reference fixing — free, unauthenticated, and (unlike Yahoo's
// crumb handshake) not currently 429ing from Render's shared egress.
//
// Three properties have to hold or the lane is worse than the "—" it
// replaced:
//
//   1. A fixing must never be stamped with `now`. If updatedAt is the
//      fetch time, a Sunday reader sees Friday's number labelled as
//      today's, which is the fabricated-freshness defect this repo spent
//      a week removing.
//   2. The change must never be a fabricated 0.00%. It is derived from
//      two consecutive real fixings, or it is null and renders "—".
//   3. The lane must not silently widen. Frankfurter publishes
//      currencies; it must never be asked for an equity, an index, a
//      future, or a currency outside the ECB reference set.
//
// The network is stubbed throughout — these assert the adapter's
// contract, not Frankfurter's uptime.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  frankfurterPair,
  ecbFixingInstant,
  frankfurterFetchPrices,
  priceToQuote,
} from "./market-adapters";
import { __resetProviderHealthForTesting, registerProvider } from "./provider-health";

describe("frankfurterPair · symbol shape", () => {
  it("parses the 6-letter Yahoo form into base and quote", () => {
    expect(frankfurterPair("GBPUSD=X")).toEqual({ base: "GBP", quote: "USD" });
    expect(frankfurterPair("USDJPY=X")).toEqual({ base: "USD", quote: "JPY" });
    expect(frankfurterPair("gbpeur=x")).toEqual({ base: "GBP", quote: "EUR" });
  });

  it("reads Yahoo's 3-letter form as USD-based", () => {
    // `GBP=X` on Yahoo means USD → GBP, not GBP → something.
    expect(frankfurterPair("GBP=X")).toEqual({ base: "USD", quote: "GBP" });
  });

  it("refuses anything that is not an =X pair", () => {
    for (const t of ["AAPL", "^FTSE", "GC=F", "BTC-USD", "VOD.L"]) {
      expect(frankfurterPair(t)).toBeNull();
    }
  });

  it("refuses a currency outside the ECB reference set rather than approximating it", () => {
    // AED and VND are real currencies the ECB does not publish. Returning
    // null routes them to orphanReason; inventing a cross rate would be
    // a fabricated number.
    expect(frankfurterPair("GBPAED=X")).toBeNull();
    expect(frankfurterPair("USDVND=X")).toBeNull();
  });

  it("refuses a degenerate same-currency pair", () => {
    expect(frankfurterPair("USDUSD=X")).toBeNull();
  });
});

describe("ecbFixingInstant · the honesty stamp", () => {
  it("stamps 16:00 Europe/Brussels, which is 14:00Z in summer and 15:00Z in winter", () => {
    // CEST (UTC+2)
    expect(ecbFixingInstant("2026-09-04")).toBe("2026-09-04T14:00:00.000Z");
    // CET (UTC+1)
    expect(ecbFixingInstant("2026-01-15")).toBe("2026-01-15T15:00:00.000Z");
  });

  it("is the fixing date, never now", () => {
    const stamped = new Date(ecbFixingInstant("2026-09-04")).getTime();
    expect(stamped).toBeLessThan(Date.now());
    expect(new Date(stamped).toISOString().slice(0, 10)).toBe("2026-09-04");
  });
});

// ── Adapter, with the network stubbed ───────────────────────────────────────

const TIMESERIES = {
  amount: 1.0,
  base: "GBP",
  start_date: "2026-09-02",
  end_date: "2026-09-04",
  rates: {
    "2026-09-02": { USD: 1.3483, EUR: 1.1646 },
    "2026-09-03": { USD: 1.3497, EUR: 1.162 },
    "2026-09-04": { USD: 1.353, EUR: 1.1642 },
  },
};

function stubFetch(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 503,
    json: async () => body,
  });
}

beforeEach(() => {
  // The adapter goes through withProvider, which refuses an unregistered
  // provider. Registration lives in market.ts at module load; this test
  // imports the adapter directly, so it registers explicitly rather than
  // pulling in the yahoo-finance2 dependency for a network-stubbed test.
  __resetProviderHealthForTesting();
  registerProvider({ name: "frankfurter", configured: true });
  vi.stubGlobal("fetch", stubFetch(TIMESERIES));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("frankfurterFetchPrices", () => {
  it("returns the latest fixing as price and the PREVIOUS fixing as previousClose", async () => {
    const out = await frankfurterFetchPrices(["GBPUSD=X"]);
    const row = out.get("GBPUSD=X");
    expect(row).toBeDefined();
    expect(row!.price).toBe(1.353);
    expect(row!.previousClose).toBe(1.3497);
  });

  it("stamps updatedAt with the fixing instant, NOT the fetch time", async () => {
    const out = await frankfurterFetchPrices(["GBPUSD=X"]);
    expect(out.get("GBPUSD=X")!.updatedAt).toBe("2026-09-04T14:00:00.000Z");
  });

  it("tags provenance so the UI can mark the row", async () => {
    const out = await frankfurterFetchPrices(["GBPUSD=X"]);
    expect(out.get("GBPUSD=X")!.provider).toBe("frankfurter");
  });

  it("prices the pair in the QUOTE currency", async () => {
    const out = await frankfurterFetchPrices(["GBPUSD=X", "GBPEUR=X"]);
    expect(out.get("GBPUSD=X")!.currency).toBe("USD");
    expect(out.get("GBPEUR=X")!.currency).toBe("EUR");
  });

  it("issues one call per distinct base currency, not one per pair", async () => {
    const spy = stubFetch(TIMESERIES);
    vi.stubGlobal("fetch", spy);
    await frankfurterFetchPrices(["GBPUSD=X", "GBPEUR=X"]);
    expect(spy).toHaveBeenCalledTimes(1);
    const url = String(spy.mock.calls[0]![0]);
    expect(url).toContain("base=GBP");
    expect(url).toContain("USD");
    expect(url).toContain("EUR");
  });

  it("throws — rather than returning an empty map — when no pair is serviceable", async () => {
    // A throw is what trips the breaker. Returning empty would look like
    // a successful call that happened to find nothing.
    await expect(frankfurterFetchPrices(["AAPL", "^FTSE"])).rejects.toThrow();
  });

  it("throws on an HTTP failure rather than yielding a partial truth", async () => {
    vi.stubGlobal("fetch", stubFetch({}, false));
    await expect(frankfurterFetchPrices(["GBPUSD=X"])).rejects.toThrow();
  });
});

describe("the delta is real or it is absent — never zero", () => {
  it("derives a real fixing-over-fixing change percent", async () => {
    const out = await frankfurterFetchPrices(["GBPUSD=X"]);
    const q = priceToQuote(out.get("GBPUSD=X")!);
    // (1.3530 - 1.3497) / 1.3497 = +0.2445% → rounded to 2dp
    expect(q.changePercent).toBeCloseTo(0.24, 2);
    expect(q.changePercent).not.toBe(0);
  });

  it("leaves changePercent null when only ONE fixing is in the window", async () => {
    vi.stubGlobal("fetch", stubFetch({
      base: "GBP",
      rates: { "2026-09-04": { USD: 1.353 } },
    }));
    const out = await frankfurterFetchPrices(["GBPUSD=X"]);
    const row = out.get("GBPUSD=X")!;
    expect(row.price).toBe(1.353);
    expect(row.previousClose).toBeNull();
    // null renders "—". A 0 would render "▲ 0.00%" and assert the rate
    // did not move, which we do not know.
    expect(priceToQuote(row).changePercent).toBeNull();
  });

  it("skips a fixing that is missing this currency when looking back", async () => {
    // The ECB does suspend a currency. Taking dates[len-2] blindly would
    // read undefined and produce a nonsense delta.
    vi.stubGlobal("fetch", stubFetch({
      base: "GBP",
      rates: {
        "2026-09-01": { USD: 1.3531 },
        "2026-09-02": { EUR: 1.1646 },      // USD absent this day
        "2026-09-04": { USD: 1.353, EUR: 1.1642 },
      },
    }));
    const out = await frankfurterFetchPrices(["GBPUSD=X"]);
    expect(out.get("GBPUSD=X")!.previousClose).toBe(1.3531);
  });
});

describe("priceToQuote carries provenance through", () => {
  it("keeps provider on the quote shape", async () => {
    const out = await frankfurterFetchPrices(["GBPUSD=X"]);
    // Without this the ECB fixing arrives at the UI indistinguishable
    // from a live Yahoo quote.
    expect(priceToQuote(out.get("GBPUSD=X")!).provider).toBe("frankfurter");
  });
});
