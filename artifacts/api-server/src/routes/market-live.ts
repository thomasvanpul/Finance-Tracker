import { Router } from "express";
import { alpacaStream, type CandlePoint } from "../lib/alpaca-stream.js";

const router = Router();

// SSE stream of closed candles for a given ticker + interval (in seconds)
// Clients connect with EventSource and receive:
//   event: init   — the current buffer (array of CandlePoint)
//   event: candle — each newly closed candle (single CandlePoint)
router.get("/api/market/live/:ticker", (req, res) => {
  if (!alpacaStream.isEnabled()) {
    res.status(503).json({ error: "Live tick streaming requires ALPACA_KEY_ID and ALPACA_SECRET_KEY" });
    return;
  }

  // Strip exchange suffix — Alpaca IEX free tier is US equities only
  const ticker = (req.params.ticker as string).toUpperCase().replace(/\.[A-Z]{1,4}$/, "");
  const intervalSec = Math.max(1, parseInt((req.query.interval as string | undefined) ?? "5", 10));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Drain existing buffer so client gets a head-start
  const buffer = alpacaStream.getBuffer(ticker, intervalSec);
  res.write(`event: init\ndata: ${JSON.stringify(buffer)}\n\n`);

  alpacaStream.subscribe(ticker);

  const onCandle = (t: string, interval: number, point: CandlePoint) => {
    if (t !== ticker || interval !== intervalSec) return;
    res.write(`event: candle\ndata: ${JSON.stringify(point)}\n\n`);
  };
  alpacaStream.on("candle:close", onCandle);

  // Heartbeat every 25 s so proxies / Railway don't close idle connections
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    alpacaStream.off("candle:close", onCandle);
    alpacaStream.unsubscribe(ticker);
  });
});

export default router;
