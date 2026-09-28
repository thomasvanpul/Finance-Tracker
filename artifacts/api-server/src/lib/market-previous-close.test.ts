// The live price lane's previous close — the baseline of every day change.
//
// It used to be meta.chartPreviousClose, which is the close before the
// request WINDOW's first bar, not before today. On a 5-day window that is
// a close about six days old for a 24/7 crypto leg, and three or four
// sessions old for an equity. The previous close has to come from a dated
// bar before the current session.

import { describe, it, expect, vi } from "vitest";

// @workspace/db validates DATABASE_URL at import; nothing here opens a
// connection. Same stub idiom as market-eod.test.ts.
vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test:test@localhost/test";
});

import { previousSessionClose } from "./market";

const row = (iso: string, close: number | null) => ({ date: new Date(iso), close });

describe("previousSessionClose", () => {
  it("takes a crypto leg's close from yesterday, not from the window's start", () => {
    // Reading at 10:00 UTC on the 28th. The window opened on the 23rd.
    const meta = {
      regularMarketTime: new Date("2026-09-28T10:00:00Z"),
      chartPreviousClose: 60_000,
    };
    const quotes = [
      row("2026-09-23T00:00:00Z", 61_000),
      row("2026-09-24T00:00:00Z", 62_000),
      row("2026-09-25T00:00:00Z", 63_000),
      row("2026-09-26T00:00:00Z", 64_000),
      row("2026-09-27T00:00:00Z", 65_000),
      row("2026-09-28T00:00:00Z", 65_500),
    ];
    expect(previousSessionClose(meta, quotes)).toBe(65_000);
  });

  it("on a weekend, an equity's baseline is the session before Friday's", () => {
    // Friday's session is the current one until Monday opens.
    const meta = {
      regularMarketTime: new Date("2026-09-25T20:00:00Z"),
      chartPreviousClose: 226,
    };
    const quotes = [
      row("2026-09-23T13:30:00Z", 228),
      row("2026-09-24T13:30:00Z", 229),
      row("2026-09-25T13:30:00Z", 231),
    ];
    expect(previousSessionClose(meta, quotes)).toBe(229);
  });

  it("is null when the prior row has no close, rather than reaching past it", () => {
    // Yahoo served exactly this for BTC-USD on 2026-09-28: a null close on
    // the 27th. The 26th's close would make a two-day change read as one.
    const meta = { regularMarketTime: new Date("2026-09-28T10:00:00Z") };
    const quotes = [
      row("2026-09-26T00:00:00Z", 64_000),
      row("2026-09-27T00:00:00Z", null),
      row("2026-09-28T00:00:00Z", 65_500),
    ];
    expect(previousSessionClose(meta, quotes)).toBeNull();
  });

  it("is null, never chartPreviousClose, when no dated bar precedes the session", () => {
    const meta = {
      regularMarketTime: new Date("2026-09-28T10:00:00Z"),
      chartPreviousClose: 60_000,
    };
    expect(previousSessionClose(meta, [row("2026-09-28T00:00:00Z", 65_500)])).toBeNull();
    expect(previousSessionClose(meta, undefined)).toBeNull();
  });

  it("is null without a market time to place the current session", () => {
    const quotes = [row("2026-09-27T00:00:00Z", 65_000)];
    expect(previousSessionClose({ chartPreviousClose: 60_000 }, quotes)).toBeNull();
  });
});
