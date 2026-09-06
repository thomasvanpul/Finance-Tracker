// The two measured findings from the API diagnosis, pinned.
//
// 1. unsubscribe() removed the refcount but never the candle state, so
//    openCandles and buffers grew for the life of the process — every
//    ticker anyone had ever watched, four buffers each. That is the
//    leading explanation for a service that runs healthily for a while
//    and then degrades.
// 2. the reconnect was a flat 5 s with no ceiling and no clear of the
//    previous timer, so an outage became a connection storm.
//
// Both are reached through the public surface plus the private maps —
// the maps are the thing under test, and the class is not exported, so
// there is no honest way to assert on them from outside.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("ws", () => ({ default: class {} }));
vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const INTERVALS_SEC = [5, 15, 30, 60];

async function freshStream() {
  vi.resetModules();
  const { alpacaStream } = await import("./alpaca-stream");
  return alpacaStream as unknown as {
    subscribe(t: string): void;
    unsubscribe(t: string): void;
    getBuffer(t: string, sec: number): unknown[];
    subscriptions: Map<string, number>;
    buffers: Map<string, unknown[]>;
    openCandles: Map<string, unknown>;
    pruneTimers: Map<string, unknown>;
  };
}

function seedState(s: Awaited<ReturnType<typeof freshStream>>, ticker: string) {
  for (const sec of INTERVALS_SEC) {
    s.buffers.set(`${ticker}:${sec}`, [{ t: 1, close: 1 }]);
    s.openCandles.set(`${ticker}:${sec}`, { bucketStart: 0 });
  }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("candle state does not outlive its subscribers", () => {
  it("drops a ticker's buffers once the grace period passes", async () => {
    const s = await freshStream();
    s.subscribe("AAPL");
    seedState(s, "AAPL");
    s.unsubscribe("AAPL");

    // Still there during the grace window — a refresh must not lose it.
    vi.advanceTimersByTime(60_000);
    expect(s.buffers.size).toBe(INTERVALS_SEC.length);

    vi.advanceTimersByTime(5 * 60_000);
    expect(s.buffers.size).toBe(0);
    expect(s.openCandles.size).toBe(0);
    expect(s.subscriptions.size).toBe(0);
  });

  it("keeps the buffer across an unsubscribe/subscribe refresh", async () => {
    const s = await freshStream();
    s.subscribe("AAPL");
    seedState(s, "AAPL");

    s.unsubscribe("AAPL");
    s.subscribe("AAPL"); // the page came back
    vi.advanceTimersByTime(60 * 60_000);

    expect(s.getBuffer("AAPL", 5)).toHaveLength(1);
    expect(s.pruneTimers.size).toBe(0);
  });

  it("keeps state while another subscriber still holds the ticker", async () => {
    const s = await freshStream();
    s.subscribe("AAPL");
    s.subscribe("AAPL");
    seedState(s, "AAPL");

    s.unsubscribe("AAPL"); // one of two leaves
    vi.advanceTimersByTime(60 * 60_000);
    expect(s.buffers.size).toBe(INTERVALS_SEC.length);
    expect(s.subscriptions.get("AAPL")).toBe(1);
  });

  it("does not leak across many tickers watched in turn", async () => {
    const s = await freshStream();
    for (let i = 0; i < 50; i++) {
      const t = `T${i}`;
      s.subscribe(t);
      seedState(s, t);
      s.unsubscribe(t);
    }
    vi.advanceTimersByTime(5 * 60_000 + 1_000);
    expect(s.buffers.size).toBe(0);
    expect(s.pruneTimers.size).toBe(0);
  });
});
