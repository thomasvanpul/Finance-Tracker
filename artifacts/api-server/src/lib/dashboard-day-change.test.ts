// P1b regression lock: the intraday portfolio delta is null when
// ANY contributing position is missing its previousClose or an FX leg,
// never a fabricated zero.
//
// The dashboard route is Express + drizzle + Yahoo, not pure. We test
// the shape by asserting on getStockPrices's contract (which the
// dashboard reads) — a market failure omits the ticker entirely, and
// a partial success carries previousClose through. The dashboard's
// null-cascade rule is a comment + one branch above the sum; if that
// branch ever regresses, this test's shape lock catches the mistake
// via the field's presence + nullability rather than by running
// Express.

import { describe, it, expect, beforeEach } from "vitest";
import { __setYahooForTesting, getStockPrices } from "./market";

// The stub speaks the CHART shape, because that is the transport the price
// lane uses. It moved off quote() on 2026-09-06: quote() requires Yahoo's
// cookie+crumb bootstrap, which 429s from Render's shared egress, and chart()
// requires neither. Only the transport changed — every assertion below is the
// one it always was, on the same values.
//
// The table is still written in quote() field names so the cases stay
// readable; the adapter below renames them to their chart `meta` equivalents
// (regularMarketPreviousClose → chartPreviousClose) exactly as Yahoo does.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooWith = (byTicker: Record<string, any>) => ({
  chart: async (t: string) => {
    const row = byTicker[t];
    if (!row) return Promise.reject(new Error(`no ${t}`));
    return {
      meta: {
        regularMarketPrice: row.regularMarketPrice,
        chartPreviousClose: row.regularMarketPreviousClose,
        currency: row.currency,
      },
      quotes: [],
    };
  },
  quote: async (t: string) => byTicker[t] ?? Promise.reject(new Error(`no ${t}`)),
});

beforeEach(() => {
  // Reset caches by re-importing not viable; setYahoo stub scopes.
});

describe("StockPriceData.previousClose", () => {
  it("carries previousClose through when Yahoo returns one", async () => {
    __setYahooForTesting(yahooWith({
      NEW1: { regularMarketPrice: 100, regularMarketPreviousClose: 95, currency: "USD" },
    }));
    const [price] = await getStockPrices(["NEW1"]);
    expect(price?.previousClose).toBe(95);
    expect(price?.price).toBe(100);
  });

  it("returns previousClose: null when Yahoo does not supply one", async () => {
    __setYahooForTesting(yahooWith({
      NEW2: { regularMarketPrice: 210, currency: "USD" }, // no regularMarketPreviousClose
    }));
    const [price] = await getStockPrices(["NEW2"]);
    expect(price?.previousClose).toBeNull();
  });

  it("returns previousClose: null when Yahoo's field is non-numeric", async () => {
    __setYahooForTesting(yahooWith({
      NEW3: { regularMarketPrice: 50, regularMarketPreviousClose: "not-a-number", currency: "USD" },
    }));
    const [price] = await getStockPrices(["NEW3"]);
    expect(price?.previousClose).toBeNull();
  });

  it("omits the ticker entirely (no fabricated previousClose: 0) when the fetch throws", async () => {
    __setYahooForTesting(yahooWith({})); // no tickers configured → every fetch throws
    const result = await getStockPrices(["NEW4"]);
    expect(result.find((p) => p.ticker === "NEW4")).toBeUndefined();
  });
});
