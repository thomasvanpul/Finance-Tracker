// End-to-end quote-chain invariants.
//
// Locks two things not covered by classifier / provider-health tests:
//
//   1. Chain fallthrough: Yahoo empty → Alpaca picks up. The user's
//      current production incident is Yahoo 429-throttling. The chain
//      exists to serve prices during that failure mode, so the test
//      that Alpaca answers when Yahoo doesn't is the load-bearing one.
//
//   2. Stale-serve: past fresh but within STALE_MAX_MS, cached data
//      returns with stale=true AND the ORIGINAL updatedAt preserved.
//      Re-stamping updatedAt to now would make the UI's "12 min ago"
//      label lie in the opposite direction of the fabricated-zero
//      defect this whole chain design guards against.

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getStockPrices, __setYahooForTesting } from "./market";
import { __resetProviderHealthForTesting, registerProvider } from "./provider-health";

// Mock the api-server env so Alpaca is "configured" in test — the
// adapter checks process.env at call time (via the auth headers), so
// providing plausible dummy values is sufficient. Production behaviour
// is decided by the real env in Render.
beforeEach(() => {
  process.env.ALPACA_KEY_ID = "TEST_KEY";
  process.env.ALPACA_SECRET_KEY = "TEST_SECRET";
  process.env.TWELVEDATA_API_KEY = "TEST_TD_KEY";
  __resetProviderHealthForTesting();
  // Re-register with configured=true now that env is set. registerProvider
  // is idempotent and the module-load calls in market.ts already registered
  // once, but the test env may have been different.
  registerProvider({ name: "yahoo", configured: true });
  registerProvider({ name: "alpaca", configured: true });
  registerProvider({ name: "polygon", configured: false });
  registerProvider({ name: "twelvedata", configured: true, creditsBudget: 800 });
  registerProvider({ name: "frankfurter", configured: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Alpaca snapshot response for AAPL — minimal shape from the docs.
function alpacaAaplBody() {
  return {
    AAPL: {
      latestTrade: { p: 185.42, t: "2026-08-20T15:59:00Z" },
      prevDailyBar: { c: 182.15 },
    },
  };
}

describe("quote chain · Yahoo dark → Alpaca serves", () => {
  it("returns Alpaca price for AAPL when Yahoo throws", async () => {
    // Yahoo throws for every call.
    __setYahooForTesting({
      quote: async () => { throw new Error("mocked yahoo 429"); },
    });
    // Fetch mock: return Alpaca snapshot for the stocks batch, empty for
    // crypto batch (no crypto in this test's ticker set).
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("data.alpaca.markets/v2/stocks/snapshots")) {
        expect(url).toContain("symbols=AAPL");
        return new Response(JSON.stringify(alpacaAaplBody()), {
          status: 200, headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("data.alpaca.markets/v1beta3/crypto")) {
        return new Response(JSON.stringify({ trades: {} }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const results = await getStockPrices(["AAPL"]);
    expect(results).toHaveLength(1);
    const aapl = results[0]!;
    expect(aapl.ticker).toBe("AAPL");
    expect(aapl.price).toBe(185.42);
    expect(aapl.previousClose).toBe(182.15);
    expect(aapl.provider).toBe("alpaca");
    expect(aapl.stale).toBeUndefined();
  });

  it("orphans a futures ticker when Yahoo is dark (no Alpaca/Polygon/TD lane for =F)", async () => {
    __setYahooForTesting({
      quote: async () => { throw new Error("mocked yahoo 429"); },
    });
    vi.stubGlobal("fetch", async () => {
      throw new Error("no fetch should be made for a futures ticker after yahoo fails");
    });

    // GC=F (gold future) has coverage list ["yahoo"] only. Yahoo throws,
    // no fallback exists. Result must be empty — never a fabricated
    // £0 or a synthesised value.
    const results = await getStockPrices(["GC=F"]);
    expect(results).toEqual([]);
  });
});

describe("quote chain · stale-serve", () => {
  it("returns cached price with stale=true past fresh window, preserving original updatedAt", async () => {
    // First call: fresh fetch from Alpaca.
    __setYahooForTesting({
      quote: async () => { throw new Error("mocked yahoo"); },
    });
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("v2/stocks/snapshots")) {
        return new Response(JSON.stringify(alpacaAaplBody()), {
          status: 200, headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("v1beta3/crypto")) {
        return new Response(JSON.stringify({ trades: {} }), { status: 200 });
      }
      throw new Error(`unexpected: ${url}`);
    });

    const firstBatch = await getStockPrices(["AAPL"]);
    const originalUpdatedAt = firstBatch[0]!.updatedAt;
    expect(firstBatch[0]!.stale).toBeUndefined();

    // Fake time forward 10 minutes: past fresh (5 min) but within stale
    // window (30 min). Stub fetch to fail so the background refresh has
    // nothing to overwrite the cache with.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 10 * 60 * 1000);
    vi.stubGlobal("fetch", async () => { throw new Error("network down"); });

    const secondBatch = await getStockPrices(["AAPL"]);
    expect(secondBatch).toHaveLength(1);
    const stale = secondBatch[0]!;
    // stale=true is the whole point.
    expect(stale.stale).toBe(true);
    // updatedAt is the ORIGINAL fetch time, not "now". A 10-min-old
    // price presented with a now-timestamp would read as fresh — the
    // exact deception this treatment guards against.
    expect(stale.updatedAt).toBe(originalUpdatedAt);
    expect(stale.price).toBe(185.42);
    vi.useRealTimers();
  });

  it("stops serving cached data past the 30-minute stale-max window", async () => {
    __setYahooForTesting({
      quote: async () => { throw new Error("mocked yahoo"); },
    });
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("v2/stocks/snapshots")) {
        return new Response(JSON.stringify(alpacaAaplBody()), {
          status: 200, headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("v1beta3/crypto")) {
        return new Response(JSON.stringify({ trades: {} }), { status: 200 });
      }
      throw new Error(`unexpected: ${url}`);
    });
    await getStockPrices(["AAPL"]);

    // 45 minutes later. Past STALE_MAX_MS (30 min). Cache invalid.
    // Stub network to fail — nothing new can be fetched.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 45 * 60 * 1000);
    vi.stubGlobal("fetch", async () => { throw new Error("network down"); });

    const results = await getStockPrices(["AAPL"]);
    // No stale-serve, no fresh fetch — omit rather than lie.
    expect(results).toEqual([]);
    vi.useRealTimers();
  });
});
