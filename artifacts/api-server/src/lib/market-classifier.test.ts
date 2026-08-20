// Ticker classifier + coverage table locks.
//
// The classifier is a static function of the symbol shape and doesn't touch
// state, but two invariants matter enough to lock:
//
//   1. Every OVERVIEW_TICKERS bucket ends up in exactly the class that
//      determines its provider fallback chain. If someone renames a
//      classifier branch, the chain silently sends LSE to Alpaca and
//      Alpaca reasonably 404s — the user sees "unavailable" for a
//      symbol that Twelve Data would have covered.
//
//   2. The 15 orphans (forex 6 + futures 4 + indices 5) are listed with
//      exactly the providers we intend, so a future "add Polygon Currencies
//      subscription" edit shows up here first as a coverage change and
//      the ripple is diff-able.

import { describe, it, expect } from "vitest";
import { classifyTicker, providersFor, orphanReason, PROVIDER_COVERAGE } from "./market-classifier";

describe("classifyTicker · symbol-shape rules", () => {
  it("classifies OVERVIEW_TICKERS representatives", () => {
    // Sample one from each bucket in markets-data.ts.
    expect(classifyTicker("AAPL")).toBe("us_equity");        // POPULAR
    expect(classifyTicker("SPY")).toBe("us_equity");         // INDEX (ETF, shape-indistinguishable)
    expect(classifyTicker("XLK")).toBe("us_equity");         // SECTOR
    expect(classifyTicker("BTC-USD")).toBe("crypto");        // CRYPTO
    expect(classifyTicker("GBPUSD=X")).toBe("forex");        // FOREX
    expect(classifyTicker("GC=F")).toBe("futures");          // COMMODITY
    expect(classifyTicker("^N225")).toBe("index");           // GLOBAL_INDEX
  });

  it("classifies non-US exchange suffixes", () => {
    expect(classifyTicker("VOD.L")).toBe("non_us_equity");   // LSE
    expect(classifyTicker("0700.HK")).toBe("non_us_equity"); // HKEX
    expect(classifyTicker("MAYBANK.KL")).toBe("non_us_equity"); // Bursa Malaysia
    expect(classifyTicker("SAP.DE")).toBe("non_us_equity");  // Xetra
    expect(classifyTicker("7203.T")).toBe("non_us_equity");  // Tokyo
  });

  it("does NOT confuse BRK-B (hyphenated share class) with a crypto pair", () => {
    // BRK-B looks like it could be caught by the crypto regex if the
    // regex were "-[A-Z]+$" instead of the strict quote-currency list.
    // Regression lock: BRK-B is us_equity.
    expect(classifyTicker("BRK-B")).toBe("us_equity");
  });

  it("case-insensitive on input", () => {
    expect(classifyTicker("aapl")).toBe("us_equity");
    expect(classifyTicker("btc-usd")).toBe("crypto");
    expect(classifyTicker("gbpusd=x")).toBe("forex");
  });
});

describe("providersFor · coverage matrix", () => {
  it("US assets can be served by all four quote providers", () => {
    expect(providersFor("AAPL")).toEqual(["yahoo", "alpaca", "polygon", "twelvedata"]);
    expect(providersFor("SPY")).toEqual(["yahoo", "alpaca", "polygon", "twelvedata"]);
    expect(providersFor("BTC-USD")).toEqual(["yahoo", "alpaca", "polygon", "twelvedata"]);
  });

  it("forex has two providers (yahoo + twelvedata); Alpaca/Polygon don't cover forex on free", () => {
    expect(providersFor("GBPUSD=X")).toEqual(["yahoo", "twelvedata"]);
  });

  it("non-US equities have two providers (yahoo + twelvedata); the twelvedata leg is best-effort trial-symbol on free", () => {
    expect(providersFor("VOD.L")).toEqual(["yahoo", "twelvedata"]);
    expect(providersFor("MAYBANK.KL")).toEqual(["yahoo", "twelvedata"]);
  });

  it("futures and global indices are yahoo-only on any free tier", () => {
    // Regression lock: if this list ever grows to include twelvedata,
    // update PROVIDER_COVERAGE AND the credit-budget arithmetic in
    // market.ts. Silent expansion of Twelve Data's covered set would
    // push us past the 800/day soft cap.
    expect(providersFor("GC=F")).toEqual(["yahoo"]);
    expect(providersFor("^N225")).toEqual(["yahoo"]);
  });
});

describe("orphanReason · user-facing specific messages", () => {
  it("names the asset class rather than saying 'unavailable'", () => {
    expect(orphanReason("GC=F")).toMatch(/commodity futures/);
    expect(orphanReason("^N225")).toMatch(/global indices/);
    expect(orphanReason("VOD.L")).toMatch(/L\b/); // mentions the exchange suffix
    expect(orphanReason("MAYBANK.KL")).toMatch(/KL/);
  });

  it("suggests the upgrade path when there is one", () => {
    // Whichever paid tier we pointed at, the message should carry it.
    // Change here first if the recommended vendor changes.
    expect(orphanReason("VOD.L")).toMatch(/Twelve Data|Finnhub/);
    expect(orphanReason("GC=F")).toMatch(/Polygon Futures|Twelve Data Pro/);
  });
});

describe("PROVIDER_COVERAGE table shape", () => {
  it("every ticker kind has at least one provider", () => {
    for (const [kind, providers] of Object.entries(PROVIDER_COVERAGE)) {
      expect(providers.length, `${kind} has no providers`).toBeGreaterThan(0);
      expect(providers, `${kind} must include yahoo as the universal baseline`).toContain("yahoo");
    }
  });
});
