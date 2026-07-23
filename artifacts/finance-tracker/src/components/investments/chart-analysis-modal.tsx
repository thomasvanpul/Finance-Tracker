import { useState, useMemo } from "react";
import { X } from "lucide-react";
import {
  ComposedChart, LineChart, BarChart,
  Line, Area, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import type { StockHistoryPoint } from "@workspace/api-client-react";

const PERIODS = ["1w", "1m", "3m", "6m", "1y", "2y", "5y"];

// ── Technical Indicator Computations ─────────────────────────────────────────

function computeSMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    return sum / period;
  });
}

function computeEMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  let ema: number | null = null;
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    if (i === period - 1) {
      let seed = 0;
      for (let j = 0; j < period; j++) seed += closes[j];
      ema = seed / period;
      result.push(ema);
      continue;
    }
    ema = closes[i] * k + ema! * (1 - k);
    result.push(ema);
  }
  return result;
}

function computeBB(closes: number[], period = 20, mult = 2) {
  return closes.map((_, i) => {
    if (i < period - 1) return { upper: null, middle: null, lower: null };
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    const mean = sum / period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (closes[j] - mean) ** 2;
    const std = Math.sqrt(variance / period);
    return { upper: mean + mult * std, middle: mean, lower: mean - mult * std };
  });
}

function computeRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period) { result.push(null); continue; }
    let avgGain = 0, avgLoss = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const chg = closes[j] - closes[j - 1];
      if (chg > 0) avgGain += chg;
      else avgLoss += Math.abs(chg);
    }
    avgGain /= period;
    avgLoss /= period;
    if (avgLoss === 0) { result.push(100); continue; }
    const rs = avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

function computeMACD(closes: number[], fast = 12, slow = 26, signalP = 9) {
  const emaFast = computeEMA(closes, fast);
  const emaSlow = computeEMA(closes, slow);
  const macdLine = closes.map((_, i) => {
    const f = emaFast[i], s = emaSlow[i];
    return f != null && s != null ? f - s : null;
  });
  const macdForEMA = macdLine.map(v => v ?? 0);
  const signalRaw = computeEMA(macdForEMA, signalP);
  return closes.map((_, i) => {
    const m = macdLine[i];
    const s = m != null ? signalRaw[i] : null;
    const h = m != null && s != null ? m - s : null;
    return { macd: m, signal: s, hist: h };
  });
}

function enrichData(history: StockHistoryPoint[]) {
  if (!history.length) return [];
  const closes = history.map(p => p.close);
  const sma20 = computeSMA(closes, 20);
  const sma50 = computeSMA(closes, 50);
  const bb = computeBB(closes);
  const rsi = computeRSI(closes);
  const macdData = computeMACD(closes);
  return history.map((p, i) => ({
    ...p,
    sma20: sma20[i],
    sma50: sma50[i],
    bbUpper: bb[i].upper,
    bbMiddle: bb[i].middle,
    bbLower: bb[i].lower,
    rsi: rsi[i],
    macd: macdData[i].macd,
    signal: macdData[i].signal,
    hist: macdData[i].hist,
  }));
}

function fmtDate(dateStr: string, period: string): string {
  const d = new Date(dateStr);
  if (period === "1w" || period === "1m" || period === "3m") {
    return d.toLocaleDateString("en", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en", { year: "2-digit", month: "short" });
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────

interface TooltipPayload {
  dataKey: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  showSMA20: boolean;
  showSMA50: boolean;
  showBB: boolean;
}

function PriceTooltip({ active, payload, label, showSMA20, showSMA50, showBB }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const map: Record<string, number> = {};
  payload.forEach(p => { if (p.value != null) map[p.dataKey] = p.value; });
  return (
    <div style={{ background: "#0d1117", border: "1px solid #30363d", padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 10, minWidth: 160, boxShadow: "0 4px 16px rgba(0,0,0,0.6)" }}>
      <div style={{ color: "#7d8590", marginBottom: 6, fontSize: 9 }}>{label}</div>
      {map.open != null && <div style={{ display: "flex", justifyContent: "space-between", gap: 16, color: "#e6edf3" }}>
        <span style={{ color: "#7d8590" }}>O</span><span>{map.open?.toFixed(2)}</span>
      </div>}
      {map.high != null && <div style={{ display: "flex", justifyContent: "space-between", gap: 16, color: "#3fb950" }}>
        <span style={{ color: "#7d8590" }}>H</span><span>{map.high?.toFixed(2)}</span>
      </div>}
      {map.low != null && <div style={{ display: "flex", justifyContent: "space-between", gap: 16, color: "#f85149" }}>
        <span style={{ color: "#7d8590" }}>L</span><span>{map.low?.toFixed(2)}</span>
      </div>}
      {map.close != null && <div style={{ display: "flex", justifyContent: "space-between", gap: 16, color: "#58a6ff", fontWeight: 700 }}>
        <span style={{ color: "#7d8590" }}>C</span><span>{map.close?.toFixed(2)}</span>
      </div>}
      {showSMA20 && map.sma20 != null && <div style={{ display: "flex", justifyContent: "space-between", gap: 16, color: "#3fb950", marginTop: 4, fontSize: 9 }}>
        <span style={{ color: "#7d8590" }}>SMA20</span><span>{map.sma20?.toFixed(2)}</span>
      </div>}
      {showSMA50 && map.sma50 != null && <div style={{ display: "flex", justifyContent: "space-between", gap: 16, color: "#e3b341", fontSize: 9 }}>
        <span style={{ color: "#7d8590" }}>SMA50</span><span>{map.sma50?.toFixed(2)}</span>
      </div>}
      {showBB && map.bbUpper != null && <div style={{ display: "flex", justifyContent: "space-between", gap: 16, color: "#22d3ee", fontSize: 9 }}>
        <span style={{ color: "#7d8590" }}>BB↑</span><span>{map.bbUpper?.toFixed(2)}</span>
      </div>}
      {showBB && map.bbLower != null && <div style={{ display: "flex", justifyContent: "space-between", gap: 16, color: "#22d3ee", fontSize: 9 }}>
        <span style={{ color: "#7d8590" }}>BB↓</span><span>{map.bbLower?.toFixed(2)}</span>
      </div>}
    </div>
  );
}

// ── Toggle Button ──────────────────────────────────────────────────────────────

function ToggleBtn({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "var(--font-mono)", fontSize: 9, padding: "3px 8px",
        border: `1px solid ${active ? color : "#30363d"}`,
        background: active ? `${color}22` : "transparent",
        color: active ? color : "#7d8590",
        cursor: "pointer", letterSpacing: "0.04em", transition: "all 0.1s",
      }}
    >
      {label}
    </button>
  );
}

// ── Modal Component ───────────────────────────────────────────────────────────

interface ChartAnalysisModalProps {
  ticker: string;
  price: number;
  changePercent: number;
  history: StockHistoryPoint[];
  period: string;
  onPeriodChange: (p: string) => void;
  isFetching: boolean;
  onClose: () => void;
}

export function ChartAnalysisModal({
  ticker, price, changePercent, history, period, onPeriodChange, isFetching, onClose,
}: ChartAnalysisModalProps) {
  const [showSMA20, setShowSMA20] = useState(true);
  const [showSMA50, setShowSMA50] = useState(true);
  const [showBB, setShowBB] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [showRSI, setShowRSI] = useState(true);
  const [showMACD, setShowMACD] = useState(false);

  const enriched = useMemo(() => enrichData(history), [history]);

  const chgColor = changePercent >= 0 ? "#3fb950" : "#f85149";
  const firstClose = enriched[0]?.close ?? 0;
  const lastClose = enriched[enriched.length - 1]?.close ?? 0;
  const periodReturn = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0;
  const chartFill = periodReturn >= 0 ? "#3fb950" : "#f85149";

  const tickCount = enriched.length > 60 ? Math.floor(enriched.length / 6) : "preserveStartEnd";
  const xTickFormatter = (v: string) => fmtDate(v, period);

  const activeSubPanels = (showVolume ? 1 : 0) + (showRSI ? 1 : 0) + (showMACD ? 1 : 0);
  const mainHeightPct = activeSubPanels === 0 ? 100 : activeSubPanels === 1 ? 65 : activeSubPanels === 2 ? 52 : 42;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "16px", overflowY: "auto" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: "100%", maxWidth: 1200, background: "#0d1117", border: "1px solid #30363d", display: "flex", flexDirection: "column", minHeight: "85vh", maxHeight: "95vh" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid #21262d", background: "#161b22", gap: 12, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flex: 1 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "#58a6ff", letterSpacing: "-0.01em" }}>{ticker}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "#e6edf3" }}>${price.toFixed(2)}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: chgColor, padding: "2px 6px", background: `${chgColor}18`, border: `1px solid ${chgColor}44` }}>
              {changePercent >= 0 ? "▲" : "▼"} {Math.abs(changePercent).toFixed(2)}%
            </span>
            {enriched.length > 0 && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: periodReturn >= 0 ? "#3fb950" : "#f85149", marginLeft: 6 }}>
                {period.toUpperCase()}: {periodReturn >= 0 ? "+" : ""}{periodReturn.toFixed(2)}%
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#7d8590", marginRight: 4 }}>ADVANCED CHART</div>
            <button onClick={onClose} style={{ background: "transparent", border: "1px solid #30363d", color: "#7d8590", cursor: "pointer", padding: "4px 6px", display: "flex", alignItems: "center" }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", borderBottom: "1px solid #21262d", background: "#0d1117", flexWrap: "wrap", flexShrink: 0 }}>
          {/* Period */}
          <div style={{ display: "flex", gap: 2 }}>
            {PERIODS.map(p => (
              <button
                key={p}
                onClick={() => onPeriodChange(p)}
                style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, padding: "3px 8px",
                  border: "1px solid #30363d",
                  background: p === period ? "#58a6ff" : "#161b22",
                  color: p === period ? "#0d1117" : "#7d8590",
                  cursor: "pointer", fontWeight: p === period ? 700 : 400,
                }}
              >{p.toUpperCase()}</button>
            ))}
          </div>
          <div style={{ width: 1, height: 16, background: "#30363d" }} />
          {/* Overlays */}
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#7d8590", marginRight: 2 }}>OVERLAYS</span>
            <ToggleBtn label="SMA 20" active={showSMA20} color="#3fb950" onClick={() => setShowSMA20(v => !v)} />
            <ToggleBtn label="SMA 50" active={showSMA50} color="#e3b341" onClick={() => setShowSMA50(v => !v)} />
            <ToggleBtn label="BB (20,2)" active={showBB} color="#22d3ee" onClick={() => setShowBB(v => !v)} />
          </div>
          <div style={{ width: 1, height: 16, background: "#30363d" }} />
          {/* Panels */}
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#7d8590", marginRight: 2 }}>PANELS</span>
            <ToggleBtn label="VOL" active={showVolume} color="#58a6ff" onClick={() => setShowVolume(v => !v)} />
            <ToggleBtn label="RSI (14)" active={showRSI} color="#d2a8ff" onClick={() => setShowRSI(v => !v)} />
            <ToggleBtn label="MACD" active={showMACD} color="#ff7b72" onClick={() => setShowMACD(v => !v)} />
          </div>
        </div>

        {/* Charts */}
        <div style={{ flex: 1, padding: "0", overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
          {isFetching ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#7d8590", fontFamily: "var(--font-mono)", fontSize: 12 }}>
              Loading chart data…
            </div>
          ) : enriched.length === 0 ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#7d8590", fontFamily: "var(--font-mono)", fontSize: 12 }}>
              No data available
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>

              {/* Main price chart */}
              <div style={{ flex: mainHeightPct, minHeight: 0, borderBottom: activeSubPanels > 0 ? "1px solid #21262d" : "none" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#7d8590", padding: "4px 16px 0", letterSpacing: "0.06em" }}>PRICE</div>
                <ResponsiveContainer width="100%" height="95%">
                  <ComposedChart data={enriched} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chartFill} stopOpacity={0.12} />
                        <stop offset="95%" stopColor={chartFill} stopOpacity={0} />
                      </linearGradient>
                      {showBB && (
                        <linearGradient id="bbGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.06} />
                          <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.06} />
                        </linearGradient>
                      )}
                    </defs>
                    <CartesianGrid strokeDasharray="2 6" stroke="#21262d" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={xTickFormatter} tick={{ fill: "#7d8590", fontSize: 8 }} axisLine={false} tickLine={false} interval={typeof tickCount === "number" ? tickCount : tickCount} />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: "#7d8590", fontSize: 8 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v.toFixed(0)}`} width={56} orientation="right" />
                    <Tooltip content={<PriceTooltip showSMA20={showSMA20} showSMA50={showSMA50} showBB={showBB} />} />
                    {/* Hidden lines to get OHLCV into tooltip */}
                    <Line dataKey="open" stroke="transparent" dot={false} legendType="none" />
                    <Line dataKey="high" stroke="transparent" dot={false} legendType="none" />
                    <Line dataKey="low" stroke="transparent" dot={false} legendType="none" />
                    {/* BB bands */}
                    {showBB && <Area type="monotone" dataKey="bbUpper" stroke="#22d3ee" strokeWidth={1} strokeDasharray="3 3" fill="none" dot={false} connectNulls />}
                    {showBB && <Area type="monotone" dataKey="bbLower" stroke="#22d3ee" strokeWidth={1} strokeDasharray="3 3" fill="url(#bbGrad)" dot={false} connectNulls />}
                    {showBB && <Line type="monotone" dataKey="bbMiddle" stroke="#22d3ee" strokeWidth={0.8} strokeDasharray="4 4" dot={false} connectNulls />}
                    {/* Price */}
                    <Area type="monotone" dataKey="close" stroke={chartFill} strokeWidth={1.5} fill="url(#priceGrad)" dot={false} activeDot={{ r: 3, fill: chartFill }} />
                    {/* SMAs */}
                    {showSMA20 && <Line type="monotone" dataKey="sma20" stroke="#3fb950" strokeWidth={1.2} dot={false} connectNulls />}
                    {showSMA50 && <Line type="monotone" dataKey="sma50" stroke="#e3b341" strokeWidth={1.2} dot={false} connectNulls />}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Volume panel */}
              {showVolume && (
                <div style={{ flex: 15, minHeight: 0, borderBottom: (showRSI || showMACD) ? "1px solid #21262d" : "none" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#7d8590", padding: "3px 16px 0", letterSpacing: "0.06em" }}>VOLUME</div>
                  <ResponsiveContainer width="100%" height="85%">
                    <BarChart data={enriched} margin={{ top: 2, right: 12, left: 0, bottom: 0 }}>
                      <XAxis dataKey="date" tickFormatter={xTickFormatter} tick={{ fill: "#7d8590", fontSize: 8 }} axisLine={false} tickLine={false} interval={typeof tickCount === "number" ? tickCount : tickCount} />
                      <YAxis tick={{ fill: "#7d8590", fontSize: 7 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : `${v}`} width={40} orientation="right" />
                      <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #30363d", fontSize: 9, fontFamily: "var(--font-mono)" }} formatter={(v: number) => [`${(v / 1e6).toFixed(2)}M`, "Vol"]} labelStyle={{ color: "#7d8590", fontSize: 8 }} />
                      <Bar dataKey="volume" maxBarSize={8}>
                        {enriched.map((d, i) => (
                          <Cell key={i} fill={(d.close ?? 0) >= (d.open ?? 0) ? "#3fb95044" : "#f8514944"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* RSI panel */}
              {showRSI && (
                <div style={{ flex: 15, minHeight: 0, borderBottom: showMACD ? "1px solid #21262d" : "none" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#7d8590", padding: "3px 16px 0", letterSpacing: "0.06em" }}>RSI (14)</div>
                  <ResponsiveContainer width="100%" height="85%">
                    <ComposedChart data={enriched} margin={{ top: 2, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 6" stroke="#21262d" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={xTickFormatter} tick={{ fill: "#7d8590", fontSize: 8 }} axisLine={false} tickLine={false} interval={typeof tickCount === "number" ? tickCount : tickCount} />
                      <YAxis domain={[0, 100]} ticks={[30, 50, 70]} tick={{ fill: "#7d8590", fontSize: 8 }} axisLine={false} tickLine={false} width={30} orientation="right" />
                      <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #30363d", fontSize: 9, fontFamily: "var(--font-mono)" }} formatter={(v: number) => [v?.toFixed(1), "RSI"]} labelStyle={{ color: "#7d8590", fontSize: 8 }} />
                      <ReferenceLine y={70} stroke="#f85149" strokeDasharray="3 3" strokeWidth={0.8} />
                      <ReferenceLine y={50} stroke="#30363d" strokeDasharray="2 4" strokeWidth={0.8} />
                      <ReferenceLine y={30} stroke="#3fb950" strokeDasharray="3 3" strokeWidth={0.8} />
                      <Area type="monotone" dataKey="rsi" stroke="#d2a8ff" strokeWidth={1.2} fill="#d2a8ff14" dot={false} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* MACD panel */}
              {showMACD && (
                <div style={{ flex: 16, minHeight: 0 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#7d8590", padding: "3px 16px 0", letterSpacing: "0.06em" }}>MACD (12, 26, 9)</div>
                  <ResponsiveContainer width="100%" height="85%">
                    <ComposedChart data={enriched} margin={{ top: 2, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 6" stroke="#21262d" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={xTickFormatter} tick={{ fill: "#7d8590", fontSize: 8 }} axisLine={false} tickLine={false} interval={typeof tickCount === "number" ? tickCount : tickCount} />
                      <YAxis tick={{ fill: "#7d8590", fontSize: 8 }} axisLine={false} tickLine={false} tickFormatter={v => v.toFixed(1)} width={36} orientation="right" />
                      <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #30363d", fontSize: 9, fontFamily: "var(--font-mono)" }} formatter={(v: number, name: string) => [v?.toFixed(3), name === "macd" ? "MACD" : name === "signal" ? "Signal" : "Hist"]} labelStyle={{ color: "#7d8590", fontSize: 8 }} />
                      <ReferenceLine y={0} stroke="#30363d" strokeWidth={0.8} />
                      <Bar dataKey="hist" maxBarSize={6}>
                        {enriched.map((d, i) => (
                          <Cell key={i} fill={(d.hist ?? 0) >= 0 ? "#3fb95088" : "#f8514988"} />
                        ))}
                      </Bar>
                      <Line type="monotone" dataKey="macd" stroke="#58a6ff" strokeWidth={1.2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="signal" stroke="#e3b341" strokeWidth={1} dot={false} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

            </div>
          )}
        </div>

        {/* Footer legend */}
        <div style={{ display: "flex", gap: 12, padding: "6px 16px", borderTop: "1px solid #21262d", background: "#161b22", flexShrink: 0, flexWrap: "wrap" }}>
          {showSMA20 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#3fb950" }}>── SMA 20</span>}
          {showSMA50 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#e3b341" }}>── SMA 50</span>}
          {showBB && <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#22d3ee" }}>- - BB (20,2)</span>}
          {showRSI && <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#d2a8ff" }}>RSI: &lt;30 oversold · &gt;70 overbought</span>}
          {showMACD && <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#58a6ff" }}>MACD ── Signal ── Histogram</span>}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#484f58", marginLeft: "auto" }}>Data via Yahoo Finance</span>
        </div>

      </div>
    </div>
  );
}
