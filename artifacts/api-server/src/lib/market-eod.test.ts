// The two pure rules of end-of-day valuation.
//
// getValuationPrices itself needs Postgres and a provider, so it is not
// covered here. What IS covered is the pair of decisions that determine
// whether a number reaches the screen at all: which session counts as
// completed, and which instruments are valued end-of-day in the first place.
//
// The measurement that forced this module into existence is in its header:
// on 2026-09-16 Yahoo's `chartPreviousClose` returned 326.57 for AAPL on a
// 5-day window and 313.45 on a 20-day one, against a true prior-session
// close of 333.08. It is the close before the WINDOW's first bar, not before
// today, so it moves with the request. Dated bars are the only lane that
// answers "what did this close at on this day", which is why
// lastCompletedSessions takes bars and not a previousClose field.

import { describe, it, expect, vi } from "vitest";

// @workspace/db validates DATABASE_URL at import; nothing here opens a
// connection. Same stub idiom as data-export.lock.test.ts.
vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test:test@localhost/test";
});

import { isEodValued, lastCompletedSessions } from "./market-eod";
import type { DailyBar } from "./market";

const bar = (date: string, close: number): DailyBar => ({ date, close, currency: "USD" });

describe("lastCompletedSessions", () => {
  it("returns the two newest completed sessions, newest as `latest`", () => {
    const r = lastCompletedSessions([
      bar("2026-09-10", 320),
      bar("2026-09-14", 333.08),
      bar("2026-09-11", 326.57),
    ]);
    expect(r?.latest.date).toBe("2026-09-14");
    expect(r?.latest.close).toBe(333.08);
    expect(r?.previous?.date).toBe("2026-09-11");
  });

  it("excludes today's bar — during a session it carries the running price", () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = lastCompletedSessions([bar("2026-09-14", 333.08), bar(today, 999)]);
    expect(r?.latest.date).toBe("2026-09-14");
  });

  it("drops a dated bar with a null close rather than carrying it", () => {
    // VUSA.L returned exactly this on 15 Sep 2026. Treating it as zero, or as
    // the previous bar's value, would be a fabricated price.
    const nulled = { date: "2026-09-15", close: null as unknown as number, currency: "GBP" };
    const r = lastCompletedSessions([bar("2026-09-14", 333.08), nulled]);
    expect(r?.latest.date).toBe("2026-09-14");
  });

  it("drops non-finite and non-positive closes", () => {
    const r = lastCompletedSessions([
      bar("2026-09-14", 333.08),
      bar("2026-09-15", 0),
      bar("2026-09-11", Number.NaN),
    ]);
    expect(r?.latest.date).toBe("2026-09-14");
    expect(r?.previous).toBeNull();
  });

  it("returns null when nothing usable is left — never a guessed price", () => {
    expect(lastCompletedSessions([])).toBeNull();
    expect(lastCompletedSessions([bar("2026-09-15", -4)])).toBeNull();
  });

  it("reports `previous` as null when only one session is available", () => {
    const r = lastCompletedSessions([bar("2026-09-14", 333.08)]);
    expect(r?.latest.date).toBe("2026-09-14");
    expect(r?.previous).toBeNull();
  });
});

describe("isEodValued", () => {
  it("values equities and ETFs end of day", () => {
    expect(isEodValued("AAPL")).toBe(true);
    expect(isEodValued("VUSA.L")).toBe(true);
  });

  it("leaves crypto and FX on the live path — a 24/7 market has no close", () => {
    expect(isEodValued("BTC-USD")).toBe(false);
    expect(isEodValued("MYRGBP=X")).toBe(false);
  });
});
