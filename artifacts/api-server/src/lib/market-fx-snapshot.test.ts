// Tests for snapshotFxRate + txToBase — the write- and read-path
// helpers for FX-at-write. Both live in market.ts alongside toBase.
//
// snapshotFxRate freezes the rate at write time; txToBase prefers
// the frozen rate at read time and falls back to live toBase() when
// none is stored. The whole point of these two together is that a
// stored-rate row's base value does not drift, while a null-rate
// row's does (until the backfill catches it).
//
// FX cache is injected via __setFxCacheForTesting rather than
// vi.mock — the internal references inside market.ts (snapshotFxRate
// reading getFxRates) stay pointed at the real module even when
// callers see a mock, so a mock only fools consumers, not the
// function under test. The setter mirrors __setYahooForTesting.

import { describe, it, expect, beforeEach } from "vitest";
import { snapshotFxRate, txToBase, __setFxCacheForTesting } from "./market";

const BASE_FX = {
  base: "GBP",
  rates: { USD: 1.266, EUR: 1.15, MYR: 5.7 },
  updatedAt: "2026-08-30T09:00:00.000Z",
};

describe("snapshotFxRate — write-path FX freeze", () => {
  beforeEach(() => {
    __setFxCacheForTesting(BASE_FX);
  });

  it("returns rate=1 when fromCurrency equals baseCurrency", async () => {
    const r = await snapshotFxRate("GBP", "GBP");
    expect(r.rate).toBe(1);
    expect(r.asOf).toBeInstanceOf(Date);
  });

  it("returns base-per-native rate for GBP→MYR (base=MYR, from=GBP)", async () => {
    const r = await snapshotFxRate("GBP", "MYR");
    expect(r.rate).toBeCloseTo(5.7, 5);
  });

  it("returns base-per-native rate for MYR→GBP (base=GBP, from=MYR)", async () => {
    const r = await snapshotFxRate("MYR", "GBP");
    expect(r.rate).toBeCloseTo(1 / 5.7, 5);
  });

  it("pivots correctly for USD→MYR (base=MYR, from=USD)", async () => {
    // USD → GBP is 1/1.266 = 0.79...; GBP → MYR is *5.7.
    // Expected: 5.7 / 1.266 = 4.502...
    const r = await snapshotFxRate("USD", "MYR");
    expect(r.rate).toBeCloseTo(5.7 / 1.266, 5);
    // Sanity: 100 USD × rate should equal (100/1.266)*5.7
    if (r.rate != null) {
      expect(100 * r.rate).toBeCloseTo((100 / 1.266) * 5.7, 3);
    }
  });

  it("returns rate=null when fromCurrency has no FX rate (base-side leg missing)", async () => {
    const r = await snapshotFxRate("THB", "GBP");
    expect(r.rate).toBeNull();
    // asOf still populated — "we tried at T and had no rate" is
    // useful for the backfill to distinguish outage from legacy row.
    expect(r.asOf).toBeInstanceOf(Date);
  });

  it("returns rate=null when baseCurrency has no FX rate (target-side leg missing)", async () => {
    const r = await snapshotFxRate("USD", "THB");
    expect(r.rate).toBeNull();
    expect(r.asOf).toBeInstanceOf(Date);
  });

  it("returns rate=null when both providers failed and rates map is empty", async () => {
    // Simulates the complete-network-outage case. getFxRates returns
    // an FxRatesData with an empty rates map rather than throwing;
    // snapshotFxRate must handle that as null and NOT hang or throw.
    __setFxCacheForTesting({ base: "GBP", rates: {}, updatedAt: "2026-08-30T09:00:00.000Z" });
    const r = await snapshotFxRate("USD", "MYR");
    expect(r.rate).toBeNull();
    expect(r.asOf).toBeInstanceOf(Date);
  });

  it("asOf reflects the FX cache's updatedAt (write-time provenance)", async () => {
    const r = await snapshotFxRate("USD", "GBP");
    expect(r.asOf.toISOString()).toBe("2026-08-30T09:00:00.000Z");
  });
});

describe("txToBase — read-path prefers stored rate over live conversion", () => {
  beforeEach(() => {
    __setFxCacheForTesting(BASE_FX);
  });

  it("uses the row's stored rate when nativeToBaseRate is not null", async () => {
    const tx = { nativeAmount: "100.00", currency: "USD", nativeToBaseRate: "0.80" };
    // Live conversion USD→GBP would give 100/1.266 = 78.99...
    // Stored rate 0.80 gives 100 * 0.80 = 80.00 — proving stored wins.
    const result = await txToBase(tx, "GBP");
    expect(result).toBe(80);
  });

  it("falls back to live toBase() when nativeToBaseRate is null", async () => {
    const tx = { nativeAmount: "100.00", currency: "USD", nativeToBaseRate: null };
    const result = await txToBase(tx, "GBP");
    // Live conversion: 100 USD → GBP = 100 / 1.266 = 78.99...
    expect(result).toBeCloseTo(78.99, 2);
  });

  it("regression bar for the WHOLE POINT of stored-rate: stored value does NOT drift when FX moves", async () => {
    const tx = { nativeAmount: "100.00", currency: "USD", nativeToBaseRate: "0.80" };
    const first = await txToBase(tx, "GBP");

    // Mutate the FX cache so a LIVE conversion would produce a
    // different number. If txToBase used live conversion, the second
    // call would return a different value. It must not.
    __setFxCacheForTesting({
      base: "GBP",
      rates: { USD: 2.0, EUR: 1.15, MYR: 5.7 },  // USD rate moved from 1.266 → 2.0
      updatedAt: "2026-09-30T09:00:00.000Z",
    });
    const second = await txToBase(tx, "GBP");
    expect(second).toBe(first);
    expect(second).toBe(80);
  });

  it("regression bar for the OPPOSITE case: null-rate row DOES drift with live FX", async () => {
    // This is what the backfill exists to fix. Until a legacy row is
    // backfilled, its base value re-derives on every read. Locking
    // this behaviour proves the fallback is what's being tested and
    // that the stored-rate no-drift assertion isn't a false positive
    // from the FX cache never changing.
    const tx = { nativeAmount: "100.00", currency: "USD", nativeToBaseRate: null };
    const first = await txToBase(tx, "GBP");
    __setFxCacheForTesting({
      base: "GBP",
      rates: { USD: 2.0 },
      updatedAt: "2026-09-30T09:00:00.000Z",
    });
    const second = await txToBase(tx, "GBP");
    expect(second).not.toBe(first);
    expect(second).toBe(50);   // 100 / 2.0
  });

  it("returns null when nativeToBaseRate is null AND live conversion is unavailable", async () => {
    const tx = { nativeAmount: "100.00", currency: "THB", nativeToBaseRate: null };
    const result = await txToBase(tx, "GBP");
    expect(result).toBeNull();
  });

  it("uses Math.abs on nativeAmount — an expense stored as positive returns positive base", async () => {
    // Native storage convention: always positive; sign is carried by type.
    // txToBase returns the magnitude; callers apply the sign.
    const tx = { nativeAmount: "100.00", currency: "USD", nativeToBaseRate: "0.80" };
    const result = await txToBase(tx, "GBP");
    expect(result).toBeGreaterThan(0);
  });
});
