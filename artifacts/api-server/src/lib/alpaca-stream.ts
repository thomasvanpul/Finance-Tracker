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

class AlpacaStream extends EventEmitter {
  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, number>(); // ticker → ref count
  private openCandles = new Map<string, OpenCandle>(); // "ticker:sec" → open candle
  private buffers = new Map<string, CandlePoint[]>(); // "ticker:sec" → last N candles
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
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
      logger.warn("Alpaca WebSocket closed — reconnecting in 5 s");
      this.reconnectTimer = setTimeout(() => this.openConnection(), 5_000);
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
    } else {
      this.subscriptions.set(ticker, count - 1);
    }
  }

  private send(payload: object): void {
    try { this.ws?.send(JSON.stringify(payload)); } catch {}
  }
}

export const alpacaStream = new AlpacaStream();
