import EventEmitter from "node:events";
import WebSocket from "ws";
import { logger } from "./logger.js";

export interface CandlePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface OpenCandle {
  bucketStart: number;
  intervalMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Intervals we build candles for
const INTERVALS_SEC = [5, 15, 30, 60];
const BUFFER_SIZE = 200;

// Reconnect backoff. A flat 5 s retry means a stream that is down for an
// hour makes 720 connection attempts, which is how a provider decides to
// stop answering. Doubling from 5 s to a 60 s ceiling makes the same hour
// cost ~64 attempts, and the ceiling keeps recovery quick once the far
// end returns.
const RECONNECT_BASE_MS = 5_000;
const RECONNECT_MAX_MS = 60_000;

// How long a ticker's candle state outlives its last subscriber.
//
// Pruning the moment the last subscriber leaves is the obvious fix for
// the leak, but unsubscribe/subscribe is also what a page refresh looks
// like — so it would throw away the buffer the next request is about to
// ask for, and at a 5 s interval a 200-point buffer takes ~17 minutes to
// refill. A grace period fixes the leak (state is bounded by the tickers
// watched in the last few minutes, not by every ticker since boot) while
// leaving a refresh with its history.
const PRUNE_GRACE_MS = 5 * 60_000;

class AlpacaStream extends EventEmitter {
  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, number>(); // ticker → ref count
  private openCandles = new Map<string, OpenCandle>(); // "ticker:sec" → open candle
  private buffers = new Map<string, CandlePoint[]>(); // "ticker:sec" → last N candles
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelayMs = RECONNECT_BASE_MS;
  private pruneTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private authenticated = false;

  isEnabled(): boolean {
    return !!(process.env.ALPACA_KEY_ID && process.env.ALPACA_SECRET_KEY);
  }

  connect(): void {
    if (!this.isEnabled()) {
      logger.warn("ALPACA_KEY_ID/ALPACA_SECRET_KEY not set — live tick streaming disabled");
      return;
    }
    this.openConnection();
    // Flush timer closes any stale open candle every second (handles low-volume tickers)
    this.flushTimer = setInterval(() => this.flushStaleCandles(), 1_000);
  }

  private openConnection(): void {
    if (this.ws) {
      try { this.ws.terminate(); } catch {}
    }
    this.ws = new WebSocket("wss://stream.data.alpaca.markets/v2/iex");

    this.ws.on("open", () => {
      // The far end is answering again — start the next outage's backoff
      // from the bottom rather than wherever this one left off.
      this.reconnectDelayMs = RECONNECT_BASE_MS;
      logger.info("Alpaca WebSocket connected");
      this.send({ action: "auth", key: process.env.ALPACA_KEY_ID, secret: process.env.ALPACA_SECRET_KEY });
    });

    this.ws.on("message", (raw) => {
      try {
        const msgs = JSON.parse(raw.toString()) as Array<Record<string, unknown>>;
        for (const msg of msgs) this.handleMsg(msg);
      } catch {}
    });

    this.ws.on("close", () => {
      this.authenticated = false;
      // Clear first. openConnection() terminates any existing socket,
      // which fires this handler again — without the clear, each close
      // leaves another live timer behind and the retries multiply
      // instead of replacing each other.
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      const delay = this.reconnectDelayMs;
      this.reconnectDelayMs = Math.min(delay * 2, RECONNECT_MAX_MS);
      logger.warn({ delayMs: delay }, "Alpaca WebSocket closed — reconnecting");
      this.reconnectTimer = setTimeout(() => this.openConnection(), delay);
    });

    this.ws.on("error", (err) => {
      logger.error({ err }, "Alpaca WebSocket error");
    });
  }

  private flushStaleCandles(): void {
    const now = Date.now();
    for (const [key, oc] of this.openCandles.entries()) {
      if (now >= oc.bucketStart + oc.intervalMs) {
        this.closeCandle(key, oc);
        this.openCandles.delete(key);
      }
    }
  }

  private handleMsg(msg: Record<string, unknown>): void {
    if (msg.T === "success" && msg.msg === "authenticated") {
      this.authenticated = true;
      logger.info("Alpaca authenticated");
      const tickers = [...this.subscriptions.keys()];
      if (tickers.length > 0) this.send({ action: "subscribe", trades: tickers });
    }
    if (msg.T === "t") {
      const ticker = msg.S as string;
      const price = msg.p as number;
      const volume = msg.s as number;
      const tsMs = new Date(msg.t as string).getTime();
      for (const sec of INTERVALS_SEC) {
        this.processTick(ticker, sec, price, volume, tsMs);
      }
    }
  }

  private processTick(ticker: string, intervalSec: number, price: number, volume: number, tsMs: number): void {
    const intervalMs = intervalSec * 1_000;
    const bucketStart = Math.floor(tsMs / intervalMs) * intervalMs;
    const key = `${ticker}:${intervalSec}`;
    const existing = this.openCandles.get(key);

    // Close previous candle if we've moved to a new bucket
    if (existing && existing.bucketStart !== bucketStart) {
      this.closeCandle(key, existing);
      this.openCandles.delete(key);
    }

    const current = this.openCandles.get(key);
    if (!current) {
      this.openCandles.set(key, { bucketStart, intervalMs, open: price, high: price, low: price, close: price, volume });
    } else {
      current.high = Math.max(current.high, price);
      current.low = Math.min(current.low, price);
      current.close = price;
      current.volume += volume;
    }
  }

  private closeCandle(key: string, oc: OpenCandle): void {
    const colonIdx = key.indexOf(":");
    const ticker = key.slice(0, colonIdx);
    const intervalSec = parseInt(key.slice(colonIdx + 1), 10);

    const d = new Date(oc.bucketStart);
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    const ss = d.getSeconds().toString().padStart(2, "0");

    const point: CandlePoint = {
      date: `${hh}:${mm}:${ss}`,
      open: oc.open,
      high: oc.high,
      low: oc.low,
      close: oc.close,
      volume: oc.volume,
    };

    let buf = this.buffers.get(key);
    if (!buf) { buf = []; this.buffers.set(key, buf); }
    buf.push(point);
    if (buf.length > BUFFER_SIZE) buf.shift();

    this.emit("candle:close", ticker, intervalSec, point);
  }

  getBuffer(ticker: string, intervalSec: number): CandlePoint[] {
    return [...(this.buffers.get(`${ticker}:${intervalSec}`) ?? [])];
  }

  subscribe(ticker: string): void {
    // Someone wants this ticker again — call off any pending prune so a
    // refresh keeps the buffer it is about to read.
    const pending = this.pruneTimers.get(ticker);
    if (pending) {
      clearTimeout(pending);
      this.pruneTimers.delete(ticker);
    }
    const count = this.subscriptions.get(ticker) ?? 0;
    this.subscriptions.set(ticker, count + 1);
    if (count === 0 && this.authenticated && this.ws?.readyState === WebSocket.OPEN) {
      this.send({ action: "subscribe", trades: [ticker] });
    }
  }

  unsubscribe(ticker: string): void {
    const count = this.subscriptions.get(ticker) ?? 0;
    if (count <= 1) {
      this.subscriptions.delete(ticker);
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ action: "unsubscribe", trades: [ticker] });
      }
      // Drop this ticker's candle state, after a grace period. Both maps
      // are keyed "ticker:sec" and nothing ever removed from them, so
      // every ticker anyone had ever watched kept four buffers of up to
      // BUFFER_SIZE points alive for the life of the process — an
      // unbounded leak on a long-lived service, and the leading
      // explanation for one that runs healthily and then degrades.
      this.schedulePrune(ticker);
    } else {
      this.subscriptions.set(ticker, count - 1);
    }
  }

  private schedulePrune(ticker: string): void {
    const existing = this.pruneTimers.get(ticker);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      this.pruneTimers.delete(ticker);
      // Re-check: a subscriber may have arrived and left again inside the
      // window, and only the absence of one now justifies dropping state.
      if (this.subscriptions.has(ticker)) return;
      for (const sec of INTERVALS_SEC) {
        const key = `${ticker}:${sec}`;
        this.openCandles.delete(key);
        this.buffers.delete(key);
      }
    }, PRUNE_GRACE_MS);
    // Don't hold the event loop open for a buffer nobody is reading.
    t.unref?.();
    this.pruneTimers.set(ticker, t);
  }

  private send(payload: object): void {
    try { this.ws?.send(JSON.stringify(payload)); } catch {}
  }
}

export const alpacaStream = new AlpacaStream();
