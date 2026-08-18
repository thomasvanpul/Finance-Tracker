import { useState, useMemo } from "react";
import { X } from "lucide-react";
import {
  ComposedChart, LineChart, BarChart,
  Line, Area, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import type { StockHistoryPoint } from "@workspace/api-client-react";
import { AXIS_TICK } from "@/lib/chart-tokens";

const PERIODS = ["1d", "3d", "5d", "1w", "1m", "3m", "6m", "1y", "2y", "5y"];
const INTRADAY_MODAL_SET = new Set(["1d", "3d", "5d"]);

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

/** True if the date string has a time component ("YYYY-MM-DD HH:MM") */
function hasTime(dateStr: string): boolean {
  return dateStr.length > 10 && dateStr[10] === " ";
}

function fmtDate(dateStr: string, period: string): string {
  const d = new Date(dateStr.replace(" ", "T") + (hasTime(dateStr) ? "Z" : ""));
  const time = hasTime(dateStr) ? dateStr.slice(11, 16) : "";
  if (period === "1d") return time || d.toLocaleDateString("en", { month: "short", day: "numeric" });
  if (period === "3d" || period === "5d") {
    const day = d.toLocaleDateString("en", { weekday: "short" });
    return time ? `${day} ${time}` : d.toLocaleDateString("en", { month: "short", day: "numeric" });
  }
  if (period === "1w" || period === "1m" || period === "3m") {
    return d.toLocaleDateString("en", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en", { year: "2-digit", month: "short" });
}

function fmtTooltipLabel(dateStr: string, period: string): string {
  const d = new Date(dateStr.replace(" ", "T") + (hasTime(dateStr) ? "Z" : ""));
  const time = hasTime(dateStr) ? dateStr.slice(11, 16) : null;
  const dateLabel = d.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
  if ((period === "1d" || period === "3d" || period === "5d") && time) return `${dateLabel}  ${time}`;
  return dateLabel;
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
  period: string;
}

function PriceTooltip({ active, payload, label, showSMA20, showSMA50, showBB, period }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const map: Record<string, number> = {};
  payload.forEach(p => { if (p.value != null) map[p.dataKey] = p.value; });
  const displayLabel = label ? fmtTooltipLabel(label, period) : "";
  return (
    // Arctic audit unit 1: every colour on this tooltip was a
    // hardcoded GitHub-dark hex. On arctic that rendered as a
    // black box floating on a white page. All colours now route
    // through --ft-* tokens so the tooltip adapts to whichever
    // theme is active. Series semantics preserved: H green,
    // L red, C blue accent, SMA20 green, SMA50 amber, BB cyan.
    // The rgba scrim on the boxShadow stays — a soft dark drop
    // shadow reads correctly under either theme's surface.
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 10, minWidth: 160, boxShadow: "0 4px 16px rgba(0,0,0,0.35)" }}>
      <div style={{ color: "var(--ft-dim)", marginBottom: 6, fontSize: 9 }}>{displayLabel}</div>
      {map.open != null && <div style={{ display: "flex", justifyContent: "space-between", gap: 16, color: "var(--ft-text)" }}>
        <span style={{ color: "var(--ft-dim)" }}>O</span><span>{map.open?.toFixed(2)}</span>
      </div>}
      {map.high != null && <div style={{ display: "flex", justifyContent: "space-between", gap: 16, color: "var(--ft-green)" }}>
        <span style={{ color: "var(--ft-dim)" }}>H</span><span>{map.high?.toFixed(2)}</span>
      </div>}
      {map.low != null && <div style={{ display: "flex", justifyContent: "space-between", gap: 16, color: "var(--ft-red)" }}>
        <span style={{ color: "var(--ft-dim)" }}>L</span><span>{map.low?.toFixed(2)}</span>
      </div>}
      {map.close != null && <div style={{ display: "flex", justifyContent: "space-between", gap: 16, color: "var(--ft-blue)", fontWeight: 700 }}>
        <span style={{ color: "var(--ft-dim)" }}>C</span><span>{map.close?.toFixed(2)}</span>
      </div>}
      {showSMA20 && map.sma20 != null && <div style={{ display: "flex", justifyContent: "space-between", gap: 16, color: "var(--ft-green)", marginTop: 4, fontSize: 9 }}>
        <span style={{ color: "var(--ft-dim)" }}>SMA20</span><span>{map.sma20?.toFixed(2)}</span>
      </div>}
      {showSMA50 && map.sma50 != null && <div style={{ display: "flex", justifyContent: "space-between", gap: 16, color: "var(--ft-amber)", fontSize: 9 }}>
        <span style={{ color: "var(--ft-dim)" }}>SMA50</span><span>{map.sma50?.toFixed(2)}</span>
      </div>}
      {showBB && map.bbUpper != null && <div style={{ display: "flex", justifyContent: "space-between", gap: 16, color: "var(--ft-cyan)", fontSize: 9 }}>
        <span style={{ color: "var(--ft-dim)" }}>BB↑</span><span>{map.bbUpper?.toFixed(2)}</span>
      </div>}
      {showBB && map.bbLower != null && <div style={{ display: "flex", justifyContent: "space-between", gap: 16, color: "var(--ft-cyan)", fontSize: 9 }}>
        <span style={{ color: "var(--ft-dim)" }}>BB↓</span><span>{map.bbLower?.toFixed(2)}</span>
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
        border: `1px solid ${active ? color : "var(--ft-border2)"}`,
        background: active ? `${color}22` : "transparent",
        color: active ? color : "var(--ft-dim)",
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
  changePercent: number | null;
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

  // G10/MOCK_QUOTES: changePercent can be null when the provider didn't
  // supply a percent for this ticker. Neutral colour + "—" label rather
  // than a fabricated 0.00%.
  const chgColor = changePercent == null ? "var(--ft-muted)" : changePercent >= 0 ? "var(--ft-green)" : "var(--ft-red)";
  const firstClose = enriched[0]?.close ?? 0;
  const lastClose = enriched[enriched.length - 1]?.close ?? 0;
  const periodReturn = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0;
  const chartFill = periodReturn >= 0 ? "var(--ft-green)" : "var(--ft-red)";

  const tickCount = enriched.length > 60 ? Math.floor(enriched.length / 6) : "preserveStartEnd";
  const xTickFormatter = (v: string) => fmtDate(v, period);

  const activeSubPanels = (showVolume ? 1 : 0) + (showRSI ? 1 : 0) + (showMACD ? 1 : 0);
  const mainHeightPct = activeSubPanels === 0 ? 100 : activeSubPanels === 1 ? 65 : activeSubPanels === 2 ? 52 : 42;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: "100%", maxWidth: 1200, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", display: "flex", flexDirection: "column", height: "95vh" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-raised)", gap: 12, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flex: 1 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--ft-blue)", letterSpacing: "-0.01em" }}>{ticker}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--ft-text)" }}>${price.toFixed(2)}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: chgColor, padding: "2px 6px", background: `${chgColor}18`, border: `1px solid ${chgColor}44` }}>
              {changePercent == null ? "—" : `${changePercent >= 0 ? "▲" : "▼"} ${Math.abs(changePercent).toFixed(2)}%`}
            </span>
            {enriched.length > 0 && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: periodReturn >= 0 ? "var(--ft-green)" : "var(--ft-red)", marginLeft: 6 }}>
                {period.toUpperCase()}: {periodReturn >= 0 ? "+" : ""}{periodReturn.toFixed(2)}%
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginRight: 4 }}>ADVANCED CHART</div>
            <button onClick={onClose} style={{ background: "transparent", border: "1px solid var(--ft-border2)", color: "var(--ft-dim)", cursor: "pointer", padding: "4px 6px", display: "flex", alignItems: "center" }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-surface)", flexWrap: "wrap", flexShrink: 0 }}>
          {/* Period */}
          <div style={{ display: "flex", gap: 2 }}>
            {PERIODS.map(p => (
              <button
                key={p}
                onClick={() => onPeriodChange(p)}
                style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, padding: "3px 8px",
                  border: "1px solid var(--ft-border2)",
                  background: p === period ? "var(--ft-blue)" : "var(--ft-raised)",
                  color: p === period ? "var(--ft-surface)" : "var(--ft-dim)",
                  cursor: "pointer", fontWeight: p === period ? 700 : 400,
                }}
              >{p.toUpperCase()}</button>
            ))}
          </div>
          <div style={{ width: 1, height: 16, background: "var(--ft-border2)" }} />
          {/* Overlays */}
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginRight: 2 }}>OVERLAYS</span>
            <ToggleBtn label="SMA 20" active={showSMA20} color="var(--ft-green)" onClick={() => setShowSMA20(v => !v)} />
            <ToggleBtn label="SMA 50" active={showSMA50} color="var(--ft-amber)" onClick={() => setShowSMA50(v => !v)} />
            <ToggleBtn label="BB (20,2)" active={showBB} color="var(--ft-cyan)" onClick={() => setShowBB(v => !v)} />
          </div>
          <div style={{ width: 1, height: 16, background: "var(--ft-border2)" }} />
          {/* Panels */}
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginRight: 2 }}>PANELS</span>
            <ToggleBtn label="VOL" active={showVolume} color="var(--ft-blue)" onClick={() => setShowVolume(v => !v)} />
            <ToggleBtn label="RSI (14)" active={showRSI} color="var(--ft-id-6)" onClick={() => setShowRSI(v => !v)} />
            <ToggleBtn label="MACD" active={showMACD} color="var(--ft-red)" onClick={() => setShowMACD(v => !v)} />
          </div>
        </div>

        {/* Charts */}
        <div style={{ flex: 1, padding: "0", overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
          {isFetching ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ft-dim)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
              Loading chart data…
            </div>
          ) : enriched.length === 0 ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ft-dim)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
              No data available
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>

              {/* Main price chart */}
              <div style={{ flex: mainHeightPct, minHeight: 0, borderBottom: activeSubPanels > 0 ? "1px solid var(--ft-border)" : "none", display: "flex", flexDirection: "column" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", padding: "4px 16px 2px", letterSpacing: "0.06em", flexShrink: 0 }}>PRICE</div>
                <div style={{ flex: 1, minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={enriched} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chartFill} stopOpacity={0.12} />
                        <stop offset="95%" stopColor={chartFill} stopOpacity={0} />
                      </linearGradient>
                      {showBB && (
                        <linearGradient id="bbGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--ft-cyan)" stopOpacity={0.06} />
                          <stop offset="100%" stopColor="var(--ft-cyan)" stopOpacity={0.06} />
                        </linearGradient>
                      )}
                    </defs>
                    <CartesianGrid strokeDasharray="2 6" stroke="var(--ft-border)" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={xTickFormatter} tick={{ ...AXIS_TICK, fontSize: 8 }} axisLine={false} tickLine={false} interval={typeof tickCount === "number" ? tickCount : tickCount} />
                    <YAxis domain={["auto", "auto"]} tick={{ ...AXIS_TICK, fontSize: 8 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v.toFixed(0)}`} width={56} orientation="right" />
                    <Tooltip content={<PriceTooltip showSMA20={showSMA20} showSMA50={showSMA50} showBB={showBB} period={period} />} />
                    {/* Hidden lines to get OHLCV into tooltip */}
                    <Line dataKey="open" stroke="transparent" dot={false} legendType="none" />
                    <Line dataKey="high" stroke="transparent" dot={false} legendType="none" />
                    <Line dataKey="low" stroke="transparent" dot={false} legendType="none" />
                    {/* BB bands */}
                    {showBB && <Area type="monotone" dataKey="bbUpper" stroke="var(--ft-cyan)" strokeWidth={1} strokeDasharray="3 3" fill="none" dot={false} connectNulls />}
                    {showBB && <Area type="monotone" dataKey="bbLower" stroke="var(--ft-cyan)" strokeWidth={1} strokeDasharray="3 3" fill="url(#bbGrad)" dot={false} connectNulls />}
                    {showBB && <Line type="monotone" dataKey="bbMiddle" stroke="var(--ft-cyan)" strokeWidth={0.8} strokeDasharray="4 4" dot={false} connectNulls />}
                    {/* Price */}
                    <Area type="monotone" dataKey="close" stroke={chartFill} strokeWidth={1.5} fill="url(#priceGrad)" dot={false} activeDot={{ r: 3, fill: chartFill }} />
                    {/* SMAs */}
                    {showSMA20 && <Line type="monotone" dataKey="sma20" stroke="var(--ft-green)" strokeWidth={1.2} dot={false} connectNulls />}
                    {showSMA50 && <Line type="monotone" dataKey="sma50" stroke="var(--ft-amber)" strokeWidth={1.2} dot={false} connectNulls />}
                  </ComposedChart>
                </ResponsiveContainer>
                </div>
              </div>

              {/* Volume panel */}
              {showVolume && (
                <div style={{ flex: 15, minHeight: 0, borderBottom: (showRSI || showMACD) ? "1px solid var(--ft-border)" : "none", display: "flex", flexDirection: "column" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", padding: "3px 16px 2px", letterSpacing: "0.06em", flexShrink: 0 }}>VOLUME</div>
                  <div style={{ flex: 1, minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={enriched} margin={{ top: 2, right: 12, left: 0, bottom: 0 }}>
                      <XAxis dataKey="date" tickFormatter={xTickFormatter} tick={{ ...AXIS_TICK, fontSize: 8 }} axisLine={false} tickLine={false} interval={typeof tickCount === "number" ? tickCount : tickCount} />
                      <YAxis tick={{ ...AXIS_TICK, fontSize: 7 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : `${v}`} width={40} orientation="right" />
                      <Tooltip contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", fontSize: 9, fontFamily: "var(--font-mono)" }} formatter={(v: number) => [`${(v / 1e6).toFixed(2)}M`, "Vol"]} labelStyle={{ color: "var(--ft-dim)", fontSize: 8 }} />
                      <Bar dataKey="volume" maxBarSize={8}>
                        {enriched.map((d, i) => (
                          <Cell key={i} fill={(d.close ?? 0) >= (d.open ?? 0) ? "color-mix(in srgb, var(--ft-green) 27%, transparent)" : "color-mix(in srgb, var(--ft-red) 27%, transparent)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* RSI panel */}
              {showRSI && (
                <div style={{ flex: 15, minHeight: 0, borderBottom: showMACD ? "1px solid var(--ft-border)" : "none", display: "flex", flexDirection: "column" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", padding: "3px 16px 2px", letterSpacing: "0.06em", flexShrink: 0 }}>RSI (14)</div>
                  <div style={{ flex: 1, minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={enriched} margin={{ top: 2, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 6" stroke="var(--ft-border)" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={xTickFormatter} tick={{ ...AXIS_TICK, fontSize: 8 }} axisLine={false} tickLine={false} interval={typeof tickCount === "number" ? tickCount : tickCount} />
                      <YAxis domain={[0, 100]} ticks={[30, 50, 70]} tick={{ ...AXIS_TICK, fontSize: 8 }} axisLine={false} tickLine={false} width={30} orientation="right" />
                      <Tooltip contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", fontSize: 9, fontFamily: "var(--font-mono)" }} formatter={(v: number) => [v?.toFixed(1), "RSI"]} labelStyle={{ color: "var(--ft-dim)", fontSize: 8 }} />
                      <ReferenceLine y={70} stroke="var(--ft-red)" strokeDasharray="3 3" strokeWidth={0.8} />
                      <ReferenceLine y={50} stroke="var(--ft-border2)" strokeDasharray="2 4" strokeWidth={0.8} />
                      <ReferenceLine y={30} stroke="var(--ft-green)" strokeDasharray="3 3" strokeWidth={0.8} />
                      <Area type="monotone" dataKey="rsi" stroke="var(--ft-id-6)" strokeWidth={1.2} fill="color-mix(in srgb, var(--ft-id-6) 8%, transparent)" dot={false} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* MACD panel */}
              {showMACD && (
                <div style={{ flex: 16, minHeight: 0, display: "flex", flexDirection: "column" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", padding: "3px 16px 2px", letterSpacing: "0.06em", flexShrink: 0 }}>MACD (12, 26, 9)</div>
                  <div style={{ flex: 1, minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={enriched} margin={{ top: 2, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 6" stroke="var(--ft-border)" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={xTickFormatter} tick={{ ...AXIS_TICK, fontSize: 8 }} axisLine={false} tickLine={false} interval={typeof tickCount === "number" ? tickCount : tickCount} />
                      <YAxis tick={{ ...AXIS_TICK, fontSize: 8 }} axisLine={false} tickLine={false} tickFormatter={v => v.toFixed(1)} width={36} orientation="right" />
                      <Tooltip contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", fontSize: 9, fontFamily: "var(--font-mono)" }} formatter={(v: number, name: string) => [v?.toFixed(3), name === "macd" ? "MACD" : name === "signal" ? "Signal" : "Hist"]} labelStyle={{ color: "var(--ft-dim)", fontSize: 8 }} />
                      <ReferenceLine y={0} stroke="var(--ft-border2)" strokeWidth={0.8} />
                      <Bar dataKey="hist" maxBarSize={6}>
                        {enriched.map((d, i) => (
                          <Cell key={i} fill={(d.hist ?? 0) >= 0 ? "color-mix(in srgb, var(--ft-green) 53%, transparent)" : "color-mix(in srgb, var(--ft-red) 53%, transparent)"} />
                        ))}
                      </Bar>
                      <Line type="monotone" dataKey="macd" stroke="var(--ft-blue)" strokeWidth={1.2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="signal" stroke="var(--ft-amber)" strokeWidth={1} dot={false} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

        {/* Footer legend + live interpretation */}
        {(() => {
          const lastRSI = enriched.length > 0 ? enriched[enriched.length - 1].rsi : null;
          const lastMACD = enriched.length > 0 ? enriched[enriched.length - 1] : null;
          const rsiSignal = lastRSI != null
            ? lastRSI > 70 ? { text: `RSI ${lastRSI.toFixed(0)} — overbought, potential pullback`, color: "var(--ft-red)" }
            : lastRSI < 30 ? { text: `RSI ${lastRSI.toFixed(0)} — oversold, potential bounce`, color: "var(--ft-green)" }
            : { text: `RSI ${lastRSI.toFixed(0)} — neutral zone`, color: "var(--ft-dim)" }
            : null;
          const macdSignal = lastMACD?.macd != null && lastMACD?.signal != null
            ? (lastMACD.macd > lastMACD.signal)
              ? { text: "MACD above signal — bullish momentum", color: "var(--ft-green)" }
              : { text: "MACD below signal — bearish momentum", color: "var(--ft-red)" }
            : null;
          return (
            <div style={{ padding: "5px 16px", borderTop: "1px solid var(--ft-border)", background: "var(--ft-raised)", flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", flex: 1 }}>
                  {showSMA20 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-green)" }}>── SMA 20</span>}
                  {showSMA50 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-amber)" }}>── SMA 50</span>}
                  {showBB && <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-cyan)" }}>- - BB (20,2) · bands show volatility range</span>}
                  {showRSI && rsiSignal && <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: rsiSignal.color, fontWeight: 700 }}>{rsiSignal.text}</span>}
                  {!showRSI && <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>RSI: &lt;30 oversold · &gt;70 overbought</span>}
                  {showMACD && macdSignal && <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: macdSignal.color, fontWeight: 700 }}>{macdSignal.text}</span>}
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-muted)" }}>Data via Yahoo Finance</span>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
