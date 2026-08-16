import { describe, it, expect, beforeEach } from "vitest";
import {
  getFxRates,
  toBase,
  toGbp,
  gbpTo,
  getStockQuotes,
  __setYahooForTesting,
} from "./market";

// Yahoo is imported via require() at module scope, and vi.mock cannot
// intercept that cleanly, so market.ts exposes __setYahooForTesting as a
// test seam. Inject a stub whose .quote() always throws and every FX/
// quote helper must refuse to invent numbers.
//
// This test locks the door on two deleted defects at once:
//   1. Eleven hardcoded FX fallbacks that substituted for missing rates
//      and set updatedAt = now (asserting freshness for fabricated data).
//      Every converted figure in the product ran through them.
//   2. getStockQuotes error path that pushed { price: 0, currency: "USD"
//      } on fetch failure, which G10's finite-price check treated as
//      valid — a legit-looking £0 position on every consumer.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const throwingYahoo: any = {
  quote: async () => {
    throw new Error("mocked yahoo failure");
  },
};

beforeEach(() => {
  __setYahooForTesting(throwingYahoo);
});

describe("FX honesty — no fabricated rate survives a fetch failure", () => {
  it("getFxRates returns an empty rates map when every fetch fails", async () => {
    const fx = await getFxRates();
    expect(fx.base).toBe("GBP");
    expect(fx.rates).toEqual({});
    // No fallback keys — the app must NOT see USD/EUR/MYR pre-filled
    // with hardcoded numbers.
    expect(Object.keys(fx.rates)).toHaveLength(0);
  });

  it("toBase returns null when the from-currency rate is missing", async () => {
    // Convert 4120 MYR → GBP: no MYR rate, so return null.
    expect(await toBase(4120, "MYR", "GBP")).toBeNull();
  });

  it("toBase returns null when the target-currency rate is missing", async () => {
    // Convert 1000 GBP → MYR: no MYR rate, so return null.
    expect(await toBase(1000, "GBP", "MYR")).toBeNull();
  });

  it("toBase passes through same-currency without touching FX", async () => {
    expect(await toBase(1000, "GBP", "GBP")).toBe(1000);
    expect(await toBase(4120, "MYR", "MYR")).toBe(4120);
  });

  it("toGbp returns null when the source-currency rate is missing", async () => {
    expect(await toGbp(4120, "MYR")).toBeNull();
  });

  it("toGbp passes GBP through unchanged", async () => {
    expect(await toGbp(1000, "GBP")).toBe(1000);
  });

  it("gbpTo returns null when the target-currency rate is missing", async () => {
    expect(await gbpTo(1000, "MYR")).toBeNull();
  });

  it("regression: never returns the amount unchanged when the rate is missing", async () => {
    // The old behaviour returned the input amount when the rate was
    // missing, so a $1000 USD balance came back as "£1000" — treating
    // native as if it were target. That must not happen.
    expect(await toBase(1000, "USD", "GBP")).not.toBe(1000);
    expect(await toBase(1000, "USD", "GBP")).toBeNull();
  });
});

describe("Stock quote honesty — no fabricated £0 entry on fetch failure", () => {
  it("getStockQuotes omits tickers whose fetch fails instead of pushing price: 0", async () => {
    const results = await getStockQuotes(["AAPL", "MSFT", "ZZZFAKE"]);
    // Every ticker's fetch throws under the mock, so the result must be
    // empty. Previously each error produced { ticker, price: 0,
    // currency: "USD", ... } — a legit-looking £0 row on the client.
    expect(results).toEqual([]);
    expect(results.every((r) => r.price !== 0)).toBe(true);
  });
});
