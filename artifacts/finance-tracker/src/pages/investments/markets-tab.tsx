// MarketsTab: the "Markets" section of the Investments page. Extracted
// from pages/investments.tsx in the E4 refactor. All helpers exclusive
// to this tab (useTickerStream, WatchlistsPanel, StockRating,
// PriceAlertsPanel, alertTriggered/alertLabel) live here alongside it.
//
// alertTriggered is re-exported for the alert-firing effect in
// investments.tsx (used against real portfolio positions, not just
// watchlist tickers).

import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  useGetMarketQuotes,
  useGetMarketHistory,
  useGetMarketDetail,
  getGetMarketQuotesQueryKey,
  type StockHistoryPoint,
} from "@workspace/api-client-react";
import { Bell, Maximize2, Plus, Search, Star, Trash2, X } from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, AreaChart, Area, ReferenceLine, ReferenceArea, Legend,
  ComposedChart, Customized,
} from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiFetch } from "@/lib/api-fetch";
import { ChartAnalysisModal } from "@/components/investments/chart-analysis-modal";
import { StatDrillModal } from "@/components/investments/stat-drill-modal";
import { grahamNumber, dcfValue } from "@/components/investments/black-scholes";
import {
  POPULAR_TICKERS, INDEX_TICKERS, CRYPTO_MARKET_TICKERS,
  FOREX_TICKERS_STR, COMMODITY_TICKERS_STR, GLOBAL_INDEX_TICKERS,
  SECTOR_TICKERS, OVERVIEW_TICKERS,
  INDEX_LABELS, SECTOR_LABELS, POPULAR_NAMES, CRYPTO_NAMES,
  FOREX_NAMES, COMMODITY_NAMES, GLOBAL_INDEX_NAMES,
  CHART_PERIODS, INTRADAY_PERIODS_SET, MULTIDAY_PERIODS_SET,
  TICK_PERIODS_SET, TICK_INTERVAL_MAP, isUSTicker,
  newsScore, timeAgo, fmtCap, fmtNum,
} from "@/components/investments/markets-data";
import { HStack, MonoLabel, PanelBox, Text, VStack } from "@/components/primitives";
import {
  CandlestickLayer, OHLCTooltip, RangeBar, RecBar, RatingBar,
} from "@/components/investments/markets-widgets";
import type { AlertMetric, NewsItem, PriceAlert, QuoteData, Watchlist } from "./types";
import { readAlerts, writeAlerts, readWatchlists, writeWatchlists } from "./types";
import { AXIS_TICK, AXIS_LINE } from "@/lib/chart-tokens";
import { oneShotInsight } from "@/lib/ai-chat-client";

// Colour + label for a change-percent value. Returns "—" and a neutral
// colour when the API didn't supply the value — never a fabricated zero
// coloured green like it's a real flat day.
function pctColor(chg: number | null | undefined): string {
  if (chg == null) return "var(--ft-dim)";
  return chg >= 0 ? "var(--ft-green)" : "var(--ft-red)";
}
function pctLabel(chg: number | null | undefined, decimals = 2): string {
  if (chg == null) return "—";
  return `${chg >= 0 ? "+" : ""}${chg.toFixed(decimals)}%`;
}

// Hook: streams 5s/15s/30s real-time candles via SSE (Alpaca free paper feed)
function useTickerStream(ticker: string | null, period: string) {
  const [liveCandles, setLiveCandles] = useState<{ date: string; open: number; high: number; low: number; close: number; volume: number }[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const isTickPeriod = TICK_PERIODS_SET.has(period);

  useEffect(() => {
    if (!ticker || !isTickPeriod) {
      setLiveCandles([]);
      setIsConnected(false);
      return;
    }
    const intervalSec = TICK_INTERVAL_MAP[period];
    const es = new EventSource(`/api/market/live/${encodeURIComponent(ticker)}?interval=${intervalSec}`, { withCredentials: true });

    es.addEventListener("init", (e: MessageEvent) => {
      try { setLiveCandles(JSON.parse(e.data)); setIsConnected(true); } catch {}
    });
    es.addEventListener("candle", (e: MessageEvent) => {
      try {
        const point = JSON.parse(e.data);
        setLiveCandles((prev) => { const next = [...prev, point]; return next.length > 200 ? next.slice(-200) : next; });
      } catch {}
    });
    es.onerror = () => setIsConnected(false);

    return () => { es.close(); setIsConnected(false); setLiveCandles([]); };
  }, [ticker, period, isTickPeriod]);

  return { liveCandles, isConnected, isLive: isTickPeriod && isConnected };
}



// ── Watchlists Panel ──────────────────────────────────────────────────────────

interface WatchlistsPanelProps {
  watchlists: Watchlist[];
  setWatchlists: React.Dispatch<React.SetStateAction<Watchlist[]>>;
  onSelectTicker: (ticker: string) => void;
  qMap: Map<string, QuoteData>;
}

function WatchlistsPanel({ watchlists, setWatchlists, onSelectTicker, qMap }: WatchlistsPanelProps) {
  const [newName, setNewName] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);
  const [addInputs, setAddInputs] = useState<Record<string, string>>({});
  const [activeWl, setActiveWl] = useState<string | null>(() => watchlists[0]?.id ?? null);

  const createWatchlist = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const wl: Watchlist = { id: Date.now().toString(), name: trimmed, tickers: [] };
    const updated = [...watchlists, wl];
    setWatchlists(updated);
    writeWatchlists(updated);
    setNewName("");
    setCreatingNew(false);
    setActiveWl(wl.id);
  };

  const deleteWatchlist = (id: string) => {
    const updated = watchlists.filter((w) => w.id !== id);
    setWatchlists(updated);
    writeWatchlists(updated);
    if (activeWl === id) setActiveWl(updated[0]?.id ?? null);
  };

  const addTicker = (wlId: string) => {
    const ticker = (addInputs[wlId] ?? "").trim().toUpperCase();
    if (!ticker) return;
    const updated = watchlists.map((w) =>
      w.id === wlId && !w.tickers.includes(ticker) ? { ...w, tickers: [...w.tickers, ticker] } : w
    );
    setWatchlists(updated);
    writeWatchlists(updated);
    setAddInputs((p) => ({ ...p, [wlId]: "" }));
  };

  const removeTicker = (wlId: string, ticker: string) => {
    const updated = watchlists.map((w) =>
      w.id === wlId ? { ...w, tickers: w.tickers.filter((t) => t !== ticker) } : w
    );
    setWatchlists(updated);
    writeWatchlists(updated);
  };

  const activeList = watchlists.find((w) => w.id === activeWl);

  return (
    <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 14px", borderBottom: "1px solid var(--ft-border)", background: "rgba(88,166,255,0.04)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-blue)", letterSpacing: "0.08em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
          <Star size={11} /> Watchlists
        </div>
        <button onClick={() => { setCreatingNew(!creatingNew); }} style={{ fontFamily: "var(--font-mono)", fontSize: 9, background: "var(--ft-raised)", border: "1px solid var(--ft-border)", color: "var(--ft-muted)", padding: "3px 8px", cursor: "pointer" }}>
          {creatingNew ? "CANCEL" : "+ NEW"}
        </button>
      </div>
      {creatingNew && (
        <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", gap: 6 }}>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createWatchlist(); }}
            placeholder="Watchlist name…"
            style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-base)", border: "1px solid var(--ft-border)", color: "var(--ft-text)", padding: "5px 10px", outline: "none" }}
          />
          <button onClick={createWatchlist} style={{ fontFamily: "var(--font-mono)", fontSize: 9, background: "var(--ft-accent)", border: "none", color: "var(--ft-base)", padding: "5px 12px", cursor: "pointer" }}>CREATE</button>
        </div>
      )}
      {watchlists.length === 0 ? (
        <div style={{ padding: "20px 14px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>
          No watchlists yet — create one to track tickers
        </div>
      ) : (
        <div className="ft-watchlist-layout" style={{ display: "flex", minHeight: 80 }}>
          <div className="ft-watchlist-sidebar" style={{ borderRight: "1px solid var(--ft-border)", minWidth: 130, maxWidth: 170 }}>
            {watchlists.map((wl) => (
              <div key={wl.id} style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--ft-border)", background: activeWl === wl.id ? "rgba(88,166,255,0.08)" : "transparent" }}>
                <button onClick={() => setActiveWl(wl.id)} style={{ flex: 1, padding: "7px 10px", fontFamily: "var(--font-mono)", fontSize: 10, color: activeWl === wl.id ? "var(--ft-blue)" : "var(--ft-muted)", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", fontWeight: activeWl === wl.id ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {wl.name} <Text as="span" size={9} color="var(--ft-dim)">({wl.tickers.length})</Text>
                </button>
                <button onClick={() => deleteWatchlist(wl.id)} title="Delete watchlist" style={{ padding: "4px 6px", background: "transparent", border: "none", cursor: "pointer", color: "var(--ft-dim)", flexShrink: 0 }}>
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
          {activeList && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 4, padding: "7px 10px", borderBottom: "1px solid var(--ft-border)" }}>
                <input
                  value={addInputs[activeList.id] ?? ""}
                  onChange={(e) => setAddInputs((p) => ({ ...p, [activeList.id]: e.target.value.toUpperCase() }))}
                  onKeyDown={(e) => { if (e.key === "Enter") addTicker(activeList.id); }}
                  placeholder="Add ticker (e.g. AAPL)"
                  style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--ft-base)", border: "1px solid var(--ft-border)", color: "var(--ft-text)", padding: "4px 8px", outline: "none" }}
                />
                <button onClick={() => addTicker(activeList.id)} style={{ fontFamily: "var(--font-mono)", fontSize: 9, background: "var(--ft-raised)", border: "1px solid var(--ft-border)", color: "var(--ft-muted)", padding: "4px 10px", cursor: "pointer" }}>ADD</button>
              </div>
              {activeList.tickers.length === 0 ? (
                <div style={{ padding: "16px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center" }}>Empty — add tickers above</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
                  {activeList.tickers.map((ticker) => {
                    const q = qMap.get(ticker);
                    const chg = q?.changePercent;
                    return (
                      <div key={ticker} style={{ display: "flex", alignItems: "center", padding: "7px 10px", borderBottom: "1px solid var(--ft-border)", borderRight: "1px solid var(--ft-border)", gap: 6 }}>
                        <button onClick={() => onSelectTicker(ticker)} style={{ flex: 1, background: "transparent", border: "none", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-blue)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{ticker}</span>
                          {q ? (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)" }}>
                              ${q.price.toFixed(2)} <span style={{ color: pctColor(chg) }}>{pctLabel(chg)}</span>
                            </span>
                          ) : (
                            <Text as="span" mono size={9} color="var(--ft-dim)">click to load</Text>
                          )}
                        </button>
                        <button onClick={() => removeTicker(activeList.id, ticker)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--ft-dim)", padding: "2px", flexShrink: 0 }}>
                          <X size={10} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stock Rating System ───────────────────────────────────────────────────────

interface StockRating {
  value: number;      // 0-10
  growth: number;     // 0-10
  quality: number;    // 0-10
  momentum: number;   // 0-10
  overall: number;    // weighted
  grade: string;      // A+, A, B+, B, C, D, F
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function computeStockRating(q: QuoteData | null, detail: { pe?: number | null; pegRatio?: number | null; revenueGrowth?: number | null; earningsGrowth?: number | null; grossMargins?: number | null; debtToEquity?: number | null; returnOnEquity?: number | null; fiftyTwoWeekChange?: number | null; shortPercentFloat?: number | null } | null): StockRating | null {
  if (!q) return null;

  // Value score: lower P/E, lower PEG = better value
  let value = 5;
  if (q.pe != null) {
    if (q.pe <= 0) value = 2; // loss-making
    else if (q.pe < 12) value = 9;
    else if (q.pe < 18) value = 7.5;
    else if (q.pe < 25) value = 6;
    else if (q.pe < 35) value = 4;
    else if (q.pe < 50) value = 3;
    else value = 1.5;
  }
  if (detail?.pegRatio != null && detail.pegRatio > 0) {
    const pegBonus = detail.pegRatio < 1 ? 1.5 : detail.pegRatio < 2 ? 0.5 : -0.5;
    value = clamp(value + pegBonus, 0, 10);
  }

  // Growth score: revenue & earnings growth
  let growth = 5;
  const rg = detail?.revenueGrowth ?? null;
  const eg = detail?.earningsGrowth ?? null;
  if (rg != null) {
    if (rg > 30) growth += 2.5;
    else if (rg > 15) growth += 1.5;
    else if (rg > 5) growth += 0.5;
    else if (rg < -10) growth -= 2;
    else if (rg < 0) growth -= 1;
  }
  if (eg != null) {
    if (eg > 30) growth += 2;
    else if (eg > 15) growth += 1;
    else if (eg < -10) growth -= 2;
    else if (eg < 0) growth -= 1;
  }
  growth = clamp(growth, 0, 10);

  // Quality score: margins, ROE, debt
  let quality = 5;
  if (detail?.grossMargins != null) {
    if (detail.grossMargins > 60) quality += 2;
    else if (detail.grossMargins > 40) quality += 1;
    else if (detail.grossMargins < 20) quality -= 1;
  }
  if (detail?.returnOnEquity != null) {
    if (detail.returnOnEquity > 20) quality += 1.5;
    else if (detail.returnOnEquity > 10) quality += 0.5;
    else if (detail.returnOnEquity < 0) quality -= 2;
  }
  if (detail?.debtToEquity != null) {
    if (detail.debtToEquity < 0.5) quality += 1;
    else if (detail.debtToEquity > 3) quality -= 1.5;
    else if (detail.debtToEquity > 2) quality -= 0.5;
  }
  quality = clamp(quality, 0, 10);

  // Momentum score: 52W change, short interest
  let momentum = 5;
  if (detail?.fiftyTwoWeekChange != null) {
    if (detail.fiftyTwoWeekChange > 50) momentum += 2.5;
    else if (detail.fiftyTwoWeekChange > 20) momentum += 1.5;
    else if (detail.fiftyTwoWeekChange > 5) momentum += 0.5;
    else if (detail.fiftyTwoWeekChange < -30) momentum -= 2.5;
    else if (detail.fiftyTwoWeekChange < -10) momentum -= 1;
  }
  if (detail?.shortPercentFloat != null) {
    if (detail.shortPercentFloat > 20) momentum -= 2;
    else if (detail.shortPercentFloat > 10) momentum -= 1;
  }
  momentum = clamp(momentum, 0, 10);

  const overall = clamp(value * 0.25 + growth * 0.30 + quality * 0.25 + momentum * 0.20, 0, 10);

  let grade: string;
  if (overall >= 8.5) grade = "A+";
  else if (overall >= 7.5) grade = "A";
  else if (overall >= 6.5) grade = "B+";
  else if (overall >= 5.5) grade = "B";
  else if (overall >= 4.5) grade = "C+";
  else if (overall >= 3.5) grade = "C";
  else if (overall >= 2.5) grade = "D";
  else grade = "F";

  return { value: Math.round(value * 10) / 10, growth: Math.round(growth * 10) / 10, quality: Math.round(quality * 10) / 10, momentum: Math.round(momentum * 10) / 10, overall: Math.round(overall * 10) / 10, grade };
}

// ── Price Alerts Panel ────────────────────────────────────────────────────────

interface PriceAlertsPanelProps {
  ticker: string;
  currentPrice: number;
  alerts: PriceAlert[];
  onAlertsChange: (alerts: PriceAlert[]) => void;
}

const ALERT_METRIC_LABELS: Record<AlertMetric, { label: string; unit: string; hint: (p: number) => string }> = {
  price:      { label: "Price",       unit: "$",  hint: (p) => `$${p.toFixed(2)}` },
  pct_change: { label: "Day % chg",   unit: "%",  hint: (p) => `${p >= 0 ? "+" : ""}${p.toFixed(1)}%` },
  pe:         { label: "P/E ratio",   unit: "×",  hint: (p) => `${p.toFixed(1)}×` },
};

export function alertTriggered(a: PriceAlert, currentPrice: number, changePercent?: number | null, pe?: number | null): boolean {
  const metric = a.metric ?? "price";
  let current: number | null = null;
  if (metric === "price") current = currentPrice;
  else if (metric === "pct_change") current = changePercent ?? null;
  else if (metric === "pe") current = pe ?? null;
  if (current === null) return false;
  return a.direction === "above" ? current >= a.targetPrice : current <= a.targetPrice;
}

function alertLabel(a: PriceAlert): string {
  const m = ALERT_METRIC_LABELS[a.metric ?? "price"];
  return `${m.label} ${a.direction === "above" ? "≥" : "≤"} ${m.hint(a.targetPrice)}`;
}

function PriceAlertsPanel({ ticker, currentPrice, alerts, onAlertsChange }: PriceAlertsPanelProps) {
  const [targetInput, setTargetInput] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [metric, setMetric] = useState<AlertMetric>("price");
  const tickerAlerts = alerts.filter((a) => a.ticker === ticker);

  const placeholder = metric === "price" ? `Price (now $${currentPrice.toFixed(2)})` : metric === "pct_change" ? "% change threshold (e.g. 5)" : "P/E threshold (e.g. 20)";

  const addAlert = () => {
    const p = parseFloat(targetInput);
    if (isNaN(p)) return;
    const newAlert: PriceAlert = {
      id: Date.now().toString(),
      ticker,
      metric,
      targetPrice: p,
      direction,
      triggered: false,
      createdAt: new Date().toISOString(),
    };
    const updated = [...alerts, newAlert];
    onAlertsChange(updated);
    writeAlerts(updated);
    setTargetInput("");
  };

  const removeAlert = (id: string) => {
    const updated = alerts.filter((a) => a.id !== id);
    onAlertsChange(updated);
    writeAlerts(updated);
  };

  return (
    <div style={{ border: "1px solid var(--ft-border)" }}>
      <div style={{ padding: "6px 14px", background: "rgba(230,162,60,0.06)", borderBottom: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-amber)", letterSpacing: "0.08em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
        <Bell size={10} /> Ticker Alerts — {ticker}
      </div>
      <VStack gap={10} padding="10px 14px">
        {/* Metric + direction + threshold row */}
        <HStack gap={6} wrap>
          <select value={metric} onChange={(e) => setMetric(e.target.value as AlertMetric)}
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--ft-base)", border: "1px solid var(--ft-border)", color: "var(--ft-text)", padding: "5px 8px", outline: "none" }}>
            {(Object.keys(ALERT_METRIC_LABELS) as AlertMetric[]).map((k) => (
              <option key={k} value={k}>{ALERT_METRIC_LABELS[k].label}</option>
            ))}
          </select>
          <select value={direction} onChange={(e) => setDirection(e.target.value as "above" | "below")}
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--ft-base)", border: "1px solid var(--ft-border)", color: "var(--ft-text)", padding: "5px 8px", outline: "none" }}>
            <option value="above">goes above</option>
            <option value="below">drops below</option>
          </select>
          <input type="number" value={targetInput} onChange={(e) => setTargetInput(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) => { if (e.key === "Enter") addAlert(); }}
            style={{ flex: 1, minWidth: 100, fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--ft-base)", border: "1px solid var(--ft-border)", color: "var(--ft-text)", padding: "5px 8px", outline: "none" }} />
          <button onClick={addAlert}
            style={{ fontFamily: "var(--font-mono)", fontSize: 9, background: "var(--ft-amber)", border: "none", color: "var(--ft-base)", padding: "5px 12px", cursor: "pointer", fontWeight: 700 }}>
            + ADD
          </button>
        </HStack>
        {/* Metric help text */}
        <Text as="div" mono size={9} color="var(--ft-dim)" lineHeight={1.5}>
          {metric === "price" && "Triggers when the live price crosses your target."}
          {metric === "pct_change" && "Triggers when today's % change (vs yesterday's close) crosses your threshold."}
          {metric === "pe" && "Triggers when the trailing P/E ratio crosses your threshold. Requires live quote data."}
        </Text>
        {tickerAlerts.length === 0 ? (
          <Text as="div" mono size={10} color="var(--ft-dim)">No alerts set for {ticker}</Text>
        ) : (
          <VStack gap={4}>
            {tickerAlerts.map((a) => {
              const isFired = alertTriggered(a, currentPrice);
              return (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", background: isFired ? "rgba(230,162,60,0.12)" : "var(--ft-raised)", border: `1px solid ${isFired ? "var(--ft-amber)" : "var(--ft-border)"}` }}>
                  <Bell size={9} style={{ color: isFired ? "var(--ft-amber)" : "var(--ft-dim)", flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: isFired ? "var(--ft-amber)" : "var(--ft-text)", flex: 1 }}>
                    {alertLabel(a)}
                    {isFired && <span style={{ marginLeft: 6, fontSize: 9 }}>● TRIGGERED</span>}
                  </span>
                  <button onClick={() => removeAlert(a.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--ft-dim)", padding: 2 }}><X size={9} /></button>
                </div>
              );
            })}
          </VStack>
        )}
      </VStack>
    </div>
  );
}

export function MarketsTab() {
  const [search, setSearch] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [chartPeriod, setChartPeriod] = useState("1m");
  const [chartModalOpen, setChartModalOpen] = useState(false);
  const [modalChartPeriod, setModalChartPeriod] = useState("1m");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>(() => readAlerts());
  const searchRef = useRef<HTMLInputElement>(null);
  const [watchlists, setWatchlists] = useState<Watchlist[]>(() => readWatchlists());
  const [wlDropdownOpen, setWlDropdownOpen] = useState(false);
  // Tooltip portal state
  const [tipInfo, setTipInfo] = useState<{ label: string; text: string; x: number; y: number } | null>(null);
  // Stat drill-down state
  const [drillLabel, setDrillLabel] = useState<string | null>(null);
  // Chart indicator toggles
  const [showSMA20, setShowSMA20] = useState(false);
  const [showSMA50, setShowSMA50] = useState(false);
  const [showSMA200, setShowSMA200] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [chartType, setChartType] = useState<"area" | "line" | "candle">("area");
  const isMobile = useIsMobile();

  const addTickerToWatchlist = (ticker: string, wlId: string) => {
    const updated = watchlists.map((w) =>
      w.id === wlId && !w.tickers.includes(ticker) ? { ...w, tickers: [...w.tickers, ticker] } : w
    );
    setWatchlists(updated);
    writeWatchlists(updated);
    setWlDropdownOpen(false);
  };

  // Always load overview quotes — refresh every 30 s so prices stay current.
  // No mock fallback: when the API returns nothing, callers must show an
  // empty state; when a real quote is missing changePercent, callers must
  // render "—" for the percent field. Fabricating either would violate
  // CLAUDE.md's "never show a number the API did not supply".
  const { data: overviewQuotes, isLoading: overviewLoading } = useGetMarketQuotes(
    { tickers: OVERVIEW_TICKERS },
    { query: { queryKey: getGetMarketQuotesQueryKey({ tickers: OVERVIEW_TICKERS }), refetchInterval: 30_000 } }
  );
  const qMap = useMemo(
    () => new Map<string, QuoteData>(overviewQuotes?.map((q) => [q.ticker, q as QuoteData]) ?? []),
    [overviewQuotes],
  );
  const quotesUnavailable = !overviewLoading && qMap.size === 0;

  // When a custom ticker is selected that's not in overview
  const needCustomQuote = !!selectedTicker && !qMap.has(selectedTicker);
  const { data: customQuoteArr } = useGetMarketQuotes(
    { tickers: selectedTicker ?? "" },
    { query: { queryKey: getGetMarketQuotesQueryKey({ tickers: selectedTicker ?? "" }), enabled: needCustomQuote, refetchInterval: needCustomQuote ? 30_000 : false } }
  );
  const selectedQuote = selectedTicker ? (qMap.get(selectedTicker) ?? (customQuoteArr?.[0] as QuoteData | undefined) ?? null) : null;

  // Live tick stream (5s/15s/30s via Alpaca SSE) — always call, conditionally active
  const { liveCandles, isLive } = useTickerStream(selectedTicker, chartPeriod);
  const isTickPeriod = TICK_PERIODS_SET.has(chartPeriod);

  // Auto-reset tick period when switching to a non-US ticker
  useEffect(() => {
    if (selectedTicker && !isUSTicker(selectedTicker) && TICK_PERIODS_SET.has(chartPeriod)) {
      setChartPeriod("1min");
    }
  }, [selectedTicker, chartPeriod]);

  // Chart, detail, news — only when a ticker is selected and not using live tick data
  const { data: history, isFetching: histFetching, isError: histError, refetch: refetchHistory } = useGetMarketHistory(
    { ticker: selectedTicker ?? "", period: chartPeriod },
    { query: { enabled: !!selectedTicker && !isTickPeriod, retry: 2 } }
  );
  // Modal has its own independent history query so changing modal period doesn't affect the main chart
  const isModalTickPeriod = TICK_PERIODS_SET.has(modalChartPeriod);
  const { data: modalHistory, isFetching: modalHistFetching } = useGetMarketHistory(
    { ticker: selectedTicker ?? "", period: modalChartPeriod },
    { query: { enabled: !!selectedTicker && chartModalOpen && !isModalTickPeriod, retry: 2 } }
  );
  const { data: detail, isFetching: detailFetching, isError: detailError } = useGetMarketDetail(
    { ticker: selectedTicker ?? "" },
    { query: { enabled: !!selectedTicker, retry: 2 } }
  );

  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsFetching, setNewsFetching] = useState(false);
  const [newsError, setNewsError] = useState(false);
  const lastNewsTicker = useRef<string | null>(null);
  const newsAbortRef = useRef<AbortController | null>(null);
  const [tldrMap, setTldrMap] = useState<Record<string, string>>({});
  const [tldrLoading, setTldrLoading] = useState<Record<string, boolean>>({});
  const [lastQuoteTime, setLastQuoteTime] = useState<Date | null>(null);

  // Track when the selected quote last updated so we can show an "as of" timestamp
  useEffect(() => {
    if (selectedQuote) setLastQuoteTime(new Date());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQuote?.price]);

  // Dismiss ⓘ tooltip on any click or scroll anywhere on the page
  useEffect(() => {
    if (!tipInfo) return;
    const dismiss = () => setTipInfo(null);
    window.addEventListener("pointerdown", dismiss, { capture: true });
    window.addEventListener("scroll", dismiss, { passive: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", dismiss, { capture: true });
      window.removeEventListener("scroll", dismiss, { capture: true });
    };
  }, [tipInfo]);

  const fetchNews = (ticker: string) => {
    newsAbortRef.current?.abort();
    const controller = new AbortController();
    newsAbortRef.current = controller;
    lastNewsTicker.current = ticker;
    setNews([]); setNewsError(false); setNewsFetching(true);
    apiFetch(`/api/market/news?ticker=${encodeURIComponent(ticker)}`, { credentials: "include", signal: controller.signal })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setNews(d); else setNewsError(true); })
      .catch((e) => { if (e.name !== "AbortError") setNewsError(true); })
      .finally(() => setNewsFetching(false));
  };

  const fetchTldr = async (link: string, title: string) => {
    if (tldrMap[link] || tldrLoading[link]) return;
    setTldrLoading((p) => ({ ...p, [link]: true }));
    try {
      // Server frames the response for the /investments page via
      // buildChatContext. The ticker context lives in a plain-text
      // prefix in the prompt — a ticker symbol is public reference
      // data, not user financial state.
      const ticker = selectedTicker ?? "";
      const result = await oneShotInsight({
        path: "/investments",
        prompt: `In exactly one sentence, give a concise investment angle on this news headline about ticker ${ticker}. Be direct, mention if it's positive or negative for investors, and why. Headline: "${title}"`,
      });
      setTldrMap((p) => ({ ...p, [link]: result.text.trim() }));
    } catch { /* silently ignore */ }
    finally { setTldrLoading((p) => ({ ...p, [link]: false })); }
  };
  useEffect(() => {
    if (!selectedTicker || lastNewsTicker.current === selectedTicker) return;
    fetchNews(selectedTicker);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicker]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const t = search.trim().toUpperCase();
    if (t) { setSelectedTicker(t); setSearch(""); }
  };

  const MH: React.CSSProperties = {
    padding: "6px 10px", fontSize: 9, fontWeight: 700, color: "var(--ft-dim)",
    background: "var(--ft-surface)", borderBottom: "2px solid var(--ft-border2)",
    borderRight: "1px solid var(--ft-border)", textTransform: "uppercase",
    letterSpacing: "0.4px", whiteSpace: "nowrap",
  };

  // ── Detail view ────────────────────────────────────────────────────────────
  if (selectedTicker) {
    const q = selectedQuote;
    const chg = q?.changePercent ?? null;
    const chgColor = pctColor(chg);
    const isIntraday = INTRADAY_PERIODS_SET.has(chartPeriod) || isTickPeriod;
    // Tick periods use SSE candles; all others use the REST history
    const rawCandles = isTickPeriod ? liveCandles : (history ?? []);
    const chartData = rawCandles.map((p: StockHistoryPoint) => {
      let label: string;
      if (isTickPeriod) {
        // Live tick data: show HH:MM:SS
        const d = new Date(p.date);
        label = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
      } else if (MULTIDAY_PERIODS_SET.has(chartPeriod)) {
        // "Tue 14:30" for 3d/5d hourly views
        const d = new Date(p.date);
        label = d.toLocaleDateString("en-GB", { weekday: "short" }) + " " + p.date.slice(11, 16);
      } else if (isIntraday) {
        // "HH:MM" from "YYYY-MM-DD HH:MM"
        label = p.date.slice(11, 16);
      } else {
        // Daily: "MM-DD" to save space
        label = p.date.slice(5);
      }
      return { ...p, label };
    });
    const firstClose = chartData[0]?.close ?? 0;
    const lastClose = chartData[chartData.length - 1]?.close ?? 0;
    const periodReturn = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0;
    const chartColor = periodReturn >= 0 ? "var(--ft-green)" : "var(--ft-red)";

    // SMA helper — returns null for points that don't have enough history yet
    const withSMA = (data: typeof chartData, windows: number[]) =>
      data.map((pt, i) =>
        windows.reduce((acc, w) => {
          if (i < w - 1) return acc;
          const slice = data.slice(i - w + 1, i + 1);
          const avg = slice.reduce((s, p) => s + p.close, 0) / w;
          return { ...acc, [`sma${w}`]: parseFloat(avg.toFixed(4)) };
        }, pt as typeof pt & { sma20?: number; sma50?: number; sma200?: number })
      );
    const activeWindows = [showSMA20 && 20, showSMA50 && 50, showSMA200 && 200].filter(Boolean) as number[];
    const chartDataWithSMA = activeWindows.length > 0 ? withSMA(chartData, activeWindows) : chartData;

    const STAT_INFO: Record<string, string> = {
      "P/E (TTM)": "Price-to-Earnings (Trailing Twelve Months). Compares stock price to annual earnings per share. Lower = cheaper relative to earnings. S&P 500 avg ≈ 20–25×.",
      "Forward P/E": "Price divided by next year's estimated earnings. Reflects market expectations for future growth. Lower than TTM P/E suggests expected earnings growth.",
      "EPS (TTM)": "Earnings Per Share — net profit divided by shares outstanding over the last 12 months. Higher is better. Negative means the company lost money.",
      "Beta": "Measures volatility vs the market. Beta > 1 = moves more than the market. Beta < 1 = more stable. Beta < 0 = moves opposite to market (e.g. gold miners).",
      "52W High": "The highest price reached in the past 52 weeks. Current price vs 52W high shows how far off peak the stock is trading.",
      "52W Low": "The lowest price in the past 52 weeks. Current price vs 52W low shows recovery from the bottom.",
      "Div Yield": "Annual dividend paid as a % of share price. E.g. 2% yield means £2 dividend per £100 invested. High yield can indicate value — or risk.",
      "P/Book": "Price-to-Book ratio. Compares market cap to net assets (book value). P/B < 1 may indicate undervaluation. Less meaningful for asset-light tech companies.",
      "Enterprise Val": "Total company value including debt minus cash. Better than market cap for comparing companies with different capital structures.",
      "Shares Out": "Total shares outstanding — the denominator in all per-share calculations. Large share counts dilute EPS.",
      "Analyst Target": "Median 12-month price target from Wall Street analysts. Shows where professionals expect the stock to trade in a year.",
      "Previous Close": "Yesterday's closing price. Used to calculate today's change % shown in the header.",
      "Revenue": "Total sales / income before any costs. Top-line figure. Doesn't account for expenses or profitability.",
      "Revenue Growth": "Year-over-year change in total revenue. Positive growth indicates business expansion.",
      "Earnings Growth": "Year-over-year change in net income. Faster earnings growth than revenue growth shows improving profitability.",
      "Free Cash Flow": "Cash generated after paying for operations and capital expenditure. Often called the 'real' profit — harder to manipulate than net income.",
      "Gross Margin": "Revenue minus cost of goods sold, as a %. High margins (>50%) indicate pricing power or scalable software/services business models.",
      "Operating Margin": "Profit after operating expenses as a % of revenue. Shows core business profitability before interest and taxes.",
      "Net Margin": "Final profit as a % of revenue after all expenses including taxes. The 'bottom line' profitability metric.",
      "Total Debt": "All short and long-term borrowings. High debt increases risk especially when interest rates are high.",
      "Op. Cash Flow": "Cash generated from core business operations. A healthy company consistently generates positive operating cash flow.",
      "Total Cash": "Cash and liquid short-term investments on the balance sheet. High cash provides a safety net and optionality for growth.",
      "Debt / Equity": "Total debt divided by shareholder equity. Measures financial leverage. >2× is considered high leverage in most industries.",
      "Current Ratio": "Current assets divided by current liabilities. Ratio >1 means assets cover near-term debts. <1 signals potential liquidity risk.",
      "Quick Ratio": "Like current ratio but excludes inventory — a stricter liquidity test. >1 is generally healthy.",
      "Book Value": "Net assets per share (assets minus liabilities). Represents the accounting value of one share if the company were liquidated.",
      "ROE": "Return on Equity — net income as a % of shareholders' equity. Measures how efficiently management generates returns from invested capital.",
      "ROA": "Return on Assets — net income as a % of total assets. Shows how profitably the company uses its resources.",
      "PEG Ratio": "P/E divided by earnings growth rate. PEG < 1 suggests a stock may be undervalued relative to its growth. More useful than P/E alone.",
      "P/Sales": "Price-to-Sales ratio. Useful for unprofitable growth companies. The lower the better, but norms vary by industry.",
      "Fwd EPS": "Next 12-month earnings estimate per share from analyst consensus. Used to calculate Forward P/E.",
      "52W Change": "Total return over the past 52 weeks as a percentage. Positive = stock has risen year-on-year.",
      "Institutional": "% of shares held by hedge funds, mutual funds, pension funds, etc. High institutional ownership signals professional conviction.",
      "Insider": "% of shares held by executives, directors, and large insiders. High insider ownership aligns management interests with shareholders.",
      "Short Ratio": "Days to cover — short interest divided by average daily volume. Higher ratio = more bearish sentiment and potential for a short squeeze.",
      "Short Float": "% of float (tradeable shares) sold short. >10% is considered high and indicates significant bearish positioning.",
      "Target High": "Most optimistic 12-month price target from the analyst consensus. Represents the bull case.",
      "Target Low": "Most pessimistic 12-month price target. Represents the bear case scenario from analysts.",
    };

    const hasDrill = (lbl: string) => STAT_INFO[lbl] != null;

    const StatCell = ({ label, value, color }: { label: string; value: string; color?: string }) => (
      <div
        onClick={() => hasDrill(label) && setDrillLabel(label)}
        style={{ padding: "10px 14px", borderRight: "1px solid var(--ft-border)", borderBottom: "1px solid var(--ft-border)", position: "relative", cursor: hasDrill(label) ? "pointer" : "default", transition: "background 0.1s" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
      >
        <HStack gap={4} align="center" marginBottom={4} minWidth0>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{label}</div>
          {STAT_INFO[label] && (
            <span
              onMouseEnter={(e) => {
                e.stopPropagation();
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setTipInfo({ label, text: STAT_INFO[label], x: rect.left + rect.width / 2, y: rect.top });
              }}
              onMouseLeave={() => setTipInfo(null)}
              onClick={(e) => e.stopPropagation()}
              style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", cursor: "help", border: "1px solid var(--ft-border)", borderRadius: "50%", width: 12, height: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1, flexShrink: 0 }}
            >i</span>
          )}
          {hasDrill(label) && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", marginLeft: "auto", opacity: 0.5, letterSpacing: "0.04em" }}>↗</span>
          )}
        </HStack>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: color ?? "var(--ft-text)" }}>{value}</div>
      </div>
    );

    return (
      <>
      {/* ── Portal tooltip — renders over sidebar via document.body ── */}
      {tipInfo && createPortal(
        <div style={{ position: "fixed", left: tipInfo.x, top: tipInfo.y - 8, transform: "translate(-50%, -100%)", zIndex: 9999, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", padding: "8px 10px", width: 240, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)", lineHeight: 1.5, boxShadow: "0 4px 20px rgba(0,0,0,0.7)", pointerEvents: "none" }}>
          <div style={{ fontWeight: 700, color: "var(--ft-text)", marginBottom: 4, fontSize: 9 }}>{tipInfo.label}</div>
          {tipInfo.text}
        </div>,
        document.body,
      )}

      {/* ── Stat drill-down modal ─────────────────────────────────────────── */}
      {drillLabel && (
        <StatDrillModal
          label={drillLabel}
          value={(() => {
            const q = selectedQuote;
            const d = detail;
            const map: Record<string, string> = {
              "P/E (TTM)": q?.pe != null ? `${q.pe.toFixed(1)}×` : "—",
              "Forward P/E": q?.forwardPe != null ? `${q.forwardPe.toFixed(1)}×` : "—",
              "EPS (TTM)": q?.eps != null ? `$${q.eps.toFixed(2)}` : "—",
              "Fwd EPS": d?.forwardEps != null ? `$${d.forwardEps.toFixed(2)}` : "—",
              "Beta": q?.beta != null ? q.beta.toFixed(2) : "—",
              "Gross Margin": d?.grossMargins != null ? `${d.grossMargins.toFixed(1)}%` : "—",
              "Operating Margin": d?.operatingMargins != null ? `${d.operatingMargins.toFixed(1)}%` : "—",
              "Net Margin": d?.netMargins != null ? `${d.netMargins.toFixed(1)}%` : "—",
              "ROE": d?.returnOnEquity != null ? `${d.returnOnEquity.toFixed(1)}%` : "—",
              "ROA": d?.returnOnAssets != null ? `${d.returnOnAssets.toFixed(1)}%` : "—",
              "PEG Ratio": d?.pegRatio != null ? d.pegRatio.toFixed(2) : "—",
              "P/Sales": d?.priceToSales != null ? `${d.priceToSales.toFixed(2)}×` : "—",
              "P/Book": d?.priceToBook != null ? `${d.priceToBook.toFixed(2)}×` : "—",
              "Div Yield": q?.dividendYield != null ? `${q.dividendYield.toFixed(2)}%` : "—",
              "Debt / Equity": d?.debtToEquity != null ? `${d.debtToEquity.toFixed(2)}x` : "—",
              "Current Ratio": d?.currentRatio != null ? d.currentRatio.toFixed(2) : "—",
              "Quick Ratio": d?.quickRatio != null ? d.quickRatio.toFixed(2) : "—",
              "Short Float": d?.shortPercentFloat != null ? `${d.shortPercentFloat.toFixed(1)}%` : "—",
              "Short Ratio": d?.shortRatio != null ? `${d.shortRatio.toFixed(1)}d` : "—",
              "Institutional": d?.institutionalOwnership != null ? `${d.institutionalOwnership.toFixed(1)}%` : "—",
            };
            return map[drillLabel] ?? "—";
          })()}
          info={STAT_INFO[drillLabel] ?? ""}
          earningsHistory={detail?.earningsHistory}
          recTrend={detail?.recommendationTrend}
          onClose={() => setDrillLabel(null)}
        />
      )}

      <VStack gap={14}>

        {/* Back + search + watchlist */}
        <HStack gap={8} align="center">
          <button
            onClick={() => { setSelectedTicker(null); setWlDropdownOpen(false); }}
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "5px 12px", cursor: "pointer", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 6 }}
          >
            ← BACK
          </button>
          <button
            onClick={() => { setSelectedTicker(null); setWlDropdownOpen(false); }}
            title="Close"
            style={{ fontFamily: "var(--font-mono)", fontSize: 14, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", color: "var(--ft-dim)", width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >
            ✕
          </button>
          <form onSubmit={handleSearch} style={{ display: "flex", gap: 4, flex: 1 }}>
            <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search another ticker…" className="ft-filter-input" style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", color: "var(--ft-text)", padding: "5px 10px", outline: "none" }} />
            <button type="submit" style={{ fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--ft-accent)", border: "none", color: "var(--ft-base)", padding: "5px 12px", cursor: "pointer", letterSpacing: "0.06em" }}>GO</button>
          </form>
          {watchlists.length > 0 && (
            <div style={{ position: "relative" }}>
              <button onClick={() => setWlDropdownOpen(!wlDropdownOpen)} style={{ fontFamily: "var(--font-mono)", fontSize: 9, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", color: "var(--ft-blue)", padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, letterSpacing: "0.06em" }}>
                <Star size={10} /> WATCHLIST
              </button>
              {wlDropdownOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", minWidth: 140, boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }}>
                  {watchlists.map((wl) => {
                    const inList = wl.tickers.includes(selectedTicker);
                    return (
                      <button key={wl.id} onClick={() => addTickerToWatchlist(selectedTicker, wl.id)} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "7px 12px", fontFamily: "var(--font-mono)", fontSize: 10, color: inList ? "var(--ft-green)" : "var(--ft-muted)", background: "transparent", border: "none", borderBottom: "1px solid var(--ft-border)", cursor: "pointer", textAlign: "left" }}>
                        {inList ? "✓ " : "+ "}{wl.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <button onClick={() => setAlertsOpen(!alertsOpen)}
            style={{ fontFamily: "var(--font-mono)", fontSize: 9, background: alertsOpen ? "var(--ft-amber)" : "var(--ft-surface)", border: "1px solid var(--ft-border)", color: alertsOpen ? "var(--ft-base)" : priceAlerts.some(a => a.ticker === selectedTicker) ? "var(--ft-amber)" : "var(--ft-muted)", padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, letterSpacing: "0.06em" }}>
            <Bell size={10} /> ALERTS{priceAlerts.filter(a => a.ticker === selectedTicker).length > 0 ? ` (${priceAlerts.filter(a => a.ticker === selectedTicker).length})` : ""}
          </button>
        </HStack>

        {/* Header */}
        {(() => {
          const isPreMarket = q?.marketState === "PRE" || q?.marketState === "PREPRE";
          const isPostMarket = q?.marketState === "POST" || q?.marketState === "POSTPOST";
          const isExtended = isPreMarket || isPostMarket;
          const extPrice = isPostMarket ? q?.postMarketPrice : isPreMarket ? q?.preMarketPrice : null;
          const extChgPct = isPostMarket ? q?.postMarketChangePercent : isPreMarket ? q?.preMarketChangePercent : null;
          const extLabel = isPostMarket ? "AH" : isPreMarket ? "PRE" : null;
          return (
        <HStack gap={14} align="end" wrap>
          <div>
            <HStack gap={10} align="baseline" wrap>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--ft-blue)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedTicker}</span>
              {q && <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: isExtended ? "var(--ft-muted)" : "var(--ft-text)", textDecoration: isExtended ? "none" : undefined, whiteSpace: "nowrap" }}>${q.price.toFixed(2)}</span>}
              {q && !isExtended && (
                chg == null ? (
                  <span style={{ padding: "3px 8px", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", background: "var(--ft-raised)", color: "var(--ft-dim)", border: "1px solid var(--ft-border)", whiteSpace: "nowrap" }}>—</span>
                ) : (
                  <span style={{ padding: "3px 8px", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", background: chg >= 0 ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.12)", color: chgColor, border: `1px solid ${chg >= 0 ? "rgba(63,185,80,0.3)" : "rgba(248,81,73,0.3)"}`, whiteSpace: "nowrap" }}>
                    {chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%
                  </span>
                )
              )}
              {/* Extended hours price shown prominently when market is pre/post */}
              {isExtended && extPrice != null && (
                <>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", alignSelf: "center" }}>reg close</span>
                  <Text as="span" mono size={18} weight={700} color="var(--ft-amber)" nowrap>${extPrice.toFixed(2)}</Text>
                  {extChgPct != null && (
                    <span style={{ padding: "3px 8px", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", background: "rgba(245,158,11,0.12)", color: "var(--ft-amber)", border: "1px solid rgba(245,158,11,0.3)" }}>
                      {extChgPct >= 0 ? "▲" : "▼"} {Math.abs(extChgPct).toFixed(2)}%
                    </span>
                  )}
                  <span style={{ padding: "2px 7px", fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)", background: "rgba(245,158,11,0.15)", color: "var(--ft-amber)", border: "1px solid rgba(245,158,11,0.4)", letterSpacing: "0.08em" }}>
                    {extLabel}
                  </span>
                </>
              )}
            </HStack>
            <HStack gap={10} align="center" marginTop={3}>
              {detail?.sector && <Text as="span" mono size={10} color="var(--ft-muted)">{detail.sector} · {detail.industry}</Text>}
              {lastQuoteTime && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", background: "rgba(255,255,255,0.04)", border: "1px solid var(--ft-border)", padding: "1px 6px" }}>
                  as of {lastQuoteTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              {isExtended && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-amber)", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", padding: "1px 6px" }}>
                  {isPostMarket ? "After-hours trading" : "Pre-market trading"}
                </span>
              )}
            </HStack>
          </div>
          <div style={{ display: "flex", gap: 20, marginLeft: "auto", flexWrap: "wrap" }}>
            {q?.dayLow != null && q?.dayHigh != null && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>DAY RANGE</div>
                <Text as="div" mono size={11} color="var(--ft-text)">${q.dayLow.toFixed(2)} — ${q.dayHigh.toFixed(2)}</Text>
              </div>
            )}
            {q?.volume != null && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>VOLUME</div>
                <Text as="div" mono size={11} color="var(--ft-text)">{(q.volume / 1e6).toFixed(1)}M</Text>
              </div>
            )}
            {q?.marketCap != null && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>MKT CAP</div>
                <Text as="div" mono size={11} color="var(--ft-text)">{fmtCap(q.marketCap)}</Text>
              </div>
            )}
            {detail?.nextEarningsDate && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>NEXT EARNINGS</div>
                <Text as="div" mono size={11} color="var(--ft-amber)">{detail.nextEarningsDate}</Text>
              </div>
            )}
          </div>
        </HStack>
          );
        })()}

        {/* Price Chart */}
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "12px 12px 4px" }}>
          <div className="ft-chart-controls-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <HStack gap={8} align="center">
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
                Price Chart
                {isLive && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "color-mix(in srgb, var(--ft-red) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--ft-red) 35%, transparent)", color: "var(--ft-red)", fontSize: 9, padding: "1px 5px", letterSpacing: "0.1em" }}>
                    <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--ft-red)", animation: "pulse 1s infinite" }} />
                    LIVE
                  </span>
                )}
                {!histFetching && !isTickPeriod && chartData.length > 0 && (
                  <span style={{ color: periodReturn >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                    {periodReturn >= 0 ? "+" : ""}{periodReturn.toFixed(2)}%
                  </span>
                )}
              </div>
              {chartData.length > 0 && !isTickPeriod && (
                <button
                  onClick={(e) => { e.stopPropagation(); localStorage.setItem("ft-chart-expand-seen","1"); setChartModalOpen(true); }}
                  title="Open advanced chart"
                  style={{ display: "flex", alignItems: "center", gap: 3, fontFamily: "var(--font-mono)", fontSize: 8, background: "var(--ft-raised)", border: "1px solid var(--ft-border)", color: "var(--ft-blue)", padding: "2px 7px", cursor: "pointer", letterSpacing: "0.04em" }}
                >
                  <Maximize2 size={9} /> EXPAND
                </button>
              )}
              {/* Chart type toggles */}
              {chartData.length > 0 && (
                <div style={{ display: "flex", gap: 1, marginLeft: 4, borderLeft: "1px solid var(--ft-border)", paddingLeft: 6 }}>
                  {([["area", "AREA"], ["line", "LINE"], ["candle", "OHLC"]] as const).map(([type, label]) => (
                    <button key={type} onClick={() => setChartType(type)} style={{
                      fontFamily: "var(--font-mono)", fontSize: 9, padding: "1px 5px",
                      border: `1px solid ${chartType === type ? "var(--ft-accent)" : "var(--ft-border)"}`,
                      background: chartType === type ? "rgba(163,113,247,0.15)" : "var(--ft-raised)",
                      color: chartType === type ? "var(--ft-accent)" : "var(--ft-dim)", cursor: "pointer", letterSpacing: "0.04em",
                    }}>{label}</button>
                  ))}
                </div>
              )}
              {/* Indicator toggles */}
              {chartData.length > 0 && (
                <div style={{ display: "flex", gap: 2, marginLeft: 4 }}>
                  {[
                    { key: "sma20",  label: "SMA20",  color: "var(--ft-id-1)", on: showSMA20,  set: setShowSMA20  },
                    { key: "sma50",  label: "SMA50",  color: "var(--ft-id-3)", on: showSMA50,  set: setShowSMA50  },
                    { key: "sma200", label: "SMA200", color: "var(--ft-id-6)", on: showSMA200, set: setShowSMA200 },
                    { key: "vol",    label: "VOL",    color: "var(--ft-dim)", on: showVolume,  set: setShowVolume  },
                  ].map(({ key, label, color, on, set }) => (
                    <button key={key} onClick={() => set(!on)} style={{
                      fontFamily: "var(--font-mono)", fontSize: 9, padding: "1px 5px",
                      border: `1px solid ${on ? color : "var(--ft-border)"}`,
                      background: on ? `${color}22` : "var(--ft-raised)",
                      color: on ? color : "var(--ft-dim)", cursor: "pointer", letterSpacing: "0.06em",
                    }}>{label}</button>
                  ))}
                </div>
              )}
            </HStack>
            <div className="ft-chart-controls-row" style={{ display: "flex", gap: 2, alignItems: "center", overflowX: "auto", scrollbarWidth: "none" as const }}>
              {CHART_PERIODS.map((p, i) => {
                // Hide tick-period buttons for non-US tickers
                const isTickBtn = TICK_PERIODS_SET.has(p);
                if (isTickBtn && selectedTicker && !isUSTicker(selectedTicker)) return null;
                // Compute effective index after hiding tick buttons for separator logic
                const usUs = !selectedTicker || isUSTicker(selectedTicker);
                return (<>
                  {/* separator: tick → intraday — only shown for US tickers */}
                  {i === 3 && usUs && <div key="sep-tick" style={{ width: 1, height: 14, background: "var(--ft-border2)", margin: "0 2px" }} />}
                  {/* separator: ultra-short intraday → standard intraday (after 2min) */}
                  {i === 5 && usUs && <div key="sep-micro" style={{ width: 1, height: 14, background: "var(--ft-border)", margin: "0 1px" }} />}
                  {/* separator: intraday → daily (after 1h) — index shifts when tick buttons hidden */}
                  {((usUs && i === 9) || (!usUs && i === 6)) && <div key="sep-daily" style={{ width: 1, height: 14, background: "var(--ft-border2)", margin: "0 2px" }} />}
                  <button key={p} onClick={() => setChartPeriod(p)} style={{
                    fontFamily: "var(--font-mono)", fontSize: 9, padding: "2px 6px",
                    border: `1px solid ${isTickBtn ? "rgba(168,85,247,0.3)" : "var(--ft-border)"}`,
                    background: p === chartPeriod ? "var(--ft-accent)"
                      : isTickBtn ? "rgba(168,85,247,0.08)"
                      : INTRADAY_PERIODS_SET.has(p) ? "rgba(34,211,238,0.06)"
                      : "var(--ft-raised)",
                    color: p === chartPeriod ? "var(--ft-base)"
                      : isTickBtn ? "#c084fc"
                      : INTRADAY_PERIODS_SET.has(p) ? "var(--ft-cyan)"
                      : "var(--ft-dim)",
                    cursor: "pointer", letterSpacing: "0.04em",
                  }}>{p.toUpperCase()}</button>
                </>);
              })}
            </div>
          </div>
          {isTickPeriod && !isLive && chartData.length === 0 ? (
            <div style={{ height: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--ft-dim)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
              <Text as="span" size={18}>◎</Text>
              <span>Awaiting live ticks…</span>
              <span style={{ fontSize: 9, opacity: 0.6 }}>US markets only · powered by Alpaca IEX</span>
            </div>
          ) : histFetching ? (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ft-dim)", fontFamily: "var(--font-mono)", fontSize: 11 }}>Loading chart…</div>
          ) : histError ? (
            <div style={{ height: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--ft-red)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
              <span>⚠ Failed to load chart data</span>
              <button onClick={() => refetchHistory()} style={{ fontSize: 9, padding: "2px 8px", background: "var(--ft-raised)", border: "1px solid var(--ft-border)", color: "var(--ft-dim)", cursor: "pointer" }}>Retry</button>
            </div>
          ) : chartData.length === 0 ? (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ft-dim)", fontFamily: "var(--font-mono)", fontSize: 11 }}>No history data</div>
          ) : (
            <div
              onClick={() => { if (!isTickPeriod && chartData.length > 0) { localStorage.setItem("ft-chart-expand-seen","1"); setChartModalOpen(true); } }}
              style={{ cursor: !isTickPeriod && chartData.length > 0 ? "pointer" : "default", position: "relative" }}
              title={!isTickPeriod ? "Click to expand full analysis" : undefined}
            >
              {/* Click-to-expand hint — only on first few views */}
              {!isTickPeriod && chartData.length > 0 && !localStorage.getItem("ft-chart-expand-seen") && (
                <div style={{ position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)", zIndex: 5, fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-blue)", background: "rgba(88,166,255,0.1)", border: "1px solid rgba(88,166,255,0.25)", padding: "1px 8px", pointerEvents: "none" }}>
                  click to expand ↗
                </div>
              )}
              {/* Main price chart — area / line / candlestick */}
              {(() => {
                const n = chartDataWithSMA.length;
                const targetTicks = isTickPeriod ? 6 : isIntraday ? 7 : 8;
                const xTickInterval = Math.max(1, Math.floor(n / targetTicks));

                // Extended-hours zone boundaries (labels are HH:MM for intraday, HH:MM:SS for tick)
                const OPEN_TIME = "09:30";
                const CLOSE_TIME = "16:00";
                const allLabels = chartDataWithSMA.map((d) => d.label);
                const firstLabel = allLabels[0] ?? "";
                const lastLabel = allLabels[allLabels.length - 1] ?? "";
                // Show zones only for intraday/tick where labels are time strings
                const showExtendedZones = (isIntraday || isTickPeriod) && n > 0;
                // Find the last label strictly before market open (pre-market boundary)
                const preMarketEndLabel = allLabels.filter((l) => l <= OPEN_TIME).at(-1) ?? "";
                // Find the first label at or after market close (after-hours boundary)
                const afterHoursStartLabel = allLabels.find((l) => l >= CLOSE_TIME) ?? "";
                // Pre-market zone: chart start → last bar before 09:30
                const hasPreMarket = showExtendedZones && firstLabel < OPEN_TIME && !!preMarketEndLabel;
                // After-hours zone: first bar at/after 16:00 → chart end
                const hasAfterHours = showExtendedZones && lastLabel > CLOSE_TIME && !!afterHoursStartLabel;

                const commonChart = (
                  <ComposedChart data={chartDataWithSMA} margin={{ top: 4, right: 8, left: -8, bottom: 2 }}>
                    <defs>
                      <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chartColor} stopOpacity={0.15} />
                        <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--ft-raised)" vertical={false} />
                    {/* Pre-market shading: chart start → last bar before market open */}
                    {hasPreMarket && (
                      <ReferenceArea x1={firstLabel} x2={preMarketEndLabel} fill="rgba(96,165,250,0.18)" fillOpacity={1} ifOverflow="visible" />
                    )}
                    {/* After-hours shading: first bar at/after close → chart end */}
                    {hasAfterHours && (
                      <ReferenceArea x1={afterHoursStartLabel} x2={lastLabel} fill="rgba(245,158,11,0.18)" fillOpacity={1} ifOverflow="visible" />
                    )}
                    {/* Market open boundary line */}
                    {showExtendedZones && hasPreMarket && (
                      <ReferenceLine x={preMarketEndLabel} stroke="rgba(96,165,250,0.7)" strokeWidth={1.5} strokeDasharray="4 3"
                        label={{ value: "PRE-MKT", position: "insideTopLeft", fill: "rgba(96,165,250,0.8)", fontSize: 8, fontWeight: 700 }} />
                    )}
                    {/* Market close boundary line */}
                    {showExtendedZones && hasAfterHours && (
                      <ReferenceLine x={afterHoursStartLabel} stroke="rgba(245,158,11,0.7)" strokeWidth={1.5} strokeDasharray="4 3"
                        label={{ value: "AFTER HRS", position: "insideTopRight", fill: "rgba(245,158,11,0.8)", fontSize: 8, fontWeight: 700 }} />
                    )}
                    <XAxis
                      dataKey="label"
                      ticks={(() => {
                        const step = Math.max(1, Math.floor(n / targetTicks));
                        const picks: string[] = [];
                        for (let i = 0; i < chartDataWithSMA.length; i += step) {
                          picks.push(chartDataWithSMA[i].label);
                        }
                        return picks;
                      })()}
                      tick={{ ...AXIS_TICK, fontSize: 10 }}
                      axisLine={AXIS_LINE}
                      tickLine={AXIS_LINE}
                      height={26}
                    />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--ft-dim)", fontSize: 9, fontFamily: "var(--font-mono)", className: "pnum" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`} width={56} />
                    <Tooltip content={<OHLCTooltip />} />
                    {q?.analystTargetPrice && <ReferenceLine y={q.analystTargetPrice} stroke="var(--ft-amber)" strokeDasharray="4 3" label={{ value: `Target $${q.analystTargetPrice.toFixed(0)}`, fill: "var(--ft-amber)", fontSize: 9, position: "insideTopRight" }} />}
                    {chartType === "area" && <Area type="monotone" dataKey="close" stroke={chartColor} strokeWidth={1.5} fill="url(#chartGrad)" dot={false} activeDot={{ r: 3 }} />}
                    {chartType === "line" && <Line type="monotone" dataKey="close" stroke={chartColor} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />}
                    {chartType === "candle" && (
                      <>
                        {/* Invisible area to set YAxis domain */}
                        <Area type="monotone" dataKey="high" stroke="none" fill="none" dot={false} legendType="none" />
                        <Area type="monotone" dataKey="low" stroke="none" fill="none" dot={false} legendType="none" />
                        <Customized component={CandlestickLayer} />
                      </>
                    )}
                    {showSMA20  && <Line type="monotone" dataKey="sma20"  stroke="#60a5fa" strokeWidth={1} dot={false} isAnimationActive={false} />}
                    {showSMA50  && <Line type="monotone" dataKey="sma50"  stroke="#f59e0b" strokeWidth={1} dot={false} isAnimationActive={false} />}
                    {showSMA200 && <Line type="monotone" dataKey="sma200" stroke="#a78bfa" strokeWidth={1} dot={false} isAnimationActive={false} />}
                  </ComposedChart>
                );
                return (
                  <ResponsiveContainer width="100%" height={showVolume ? 200 : 240}>
                    {commonChart}
                  </ResponsiveContainer>
                );
              })()}
              {/* Volume panel */}
              {showVolume && (
                <ResponsiveContainer width="100%" height={52}>
                  <BarChart data={chartData} margin={{ top: 0, right: 8, left: -8, bottom: 0 }} barCategoryGap={1}>
                    <XAxis dataKey="label" hide />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", fontSize: 10 }}
                      formatter={(v: number) => [v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${(v / 1_000).toFixed(0)}K`, "Vol"]}
                      labelStyle={{ color: "var(--ft-dim)", fontSize: 9 }}
                    />
                    <Bar dataKey="volume" fill="var(--ft-border2)" opacity={0.7} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </div>

        {/* Advanced Chart Modal — uses its own independent period so main chart isn't affected */}
        {chartModalOpen && (
          <ChartAnalysisModal
            ticker={selectedTicker}
            price={q?.price ?? 0}
            changePercent={chg}
            history={modalHistory ?? []}
            period={modalChartPeriod}
            onPeriodChange={setModalChartPeriod}
            isFetching={modalHistFetching}
            onClose={() => setChartModalOpen(false)}
          />
        )}

        {/* Key Statistics */}
        <div style={{ border: "1px solid var(--ft-border)" }}>
          <div style={{ padding: "6px 14px", background: "rgba(88,166,255,0.06)", borderBottom: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-blue)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Key Statistics</div>
          <div className="ft-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
            <StatCell label="P/E (TTM)" value={q?.pe != null ? `${q.pe.toFixed(1)}×` : "—"} color={q?.pe ? (q.pe > 40 ? "var(--ft-amber)" : q.pe < 15 ? "var(--ft-green)" : "var(--ft-text)") : undefined} />
            <StatCell label="Forward P/E" value={q?.forwardPe != null ? `${q.forwardPe.toFixed(1)}×` : "—"} />
            <StatCell label="EPS (TTM)" value={q?.eps != null ? `$${q.eps.toFixed(2)}` : "—"} />
            <StatCell label="Beta" value={q?.beta != null ? q.beta.toFixed(2) : "—"} color={q?.beta ? (q.beta > 1.5 ? "var(--ft-red)" : q.beta < 0.7 ? "var(--ft-blue)" : undefined) : undefined} />
            <StatCell label="52W High" value={q?.high52w != null ? `$${q.high52w.toFixed(2)}` : "—"} color="var(--ft-green)" />
            <StatCell label="52W Low" value={q?.low52w != null ? `$${q.low52w.toFixed(2)}` : "—"} color="var(--ft-red)" />
            <StatCell label="Div Yield" value={q?.dividendYield != null ? `${q.dividendYield.toFixed(2)}%` : "—"} />
            <StatCell label="Previous Close" value={q?.previousClose != null ? `$${q.previousClose.toFixed(2)}` : "—"} />
            <StatCell label="Day High" value={q?.dayHigh != null ? `$${q.dayHigh.toFixed(2)}` : "—"} color="var(--ft-green)" />
            <StatCell label="Day Low" value={q?.dayLow != null ? `$${q.dayLow.toFixed(2)}` : "—"} color="var(--ft-red)" />
            <StatCell label="Volume" value={q?.volume != null ? `${(q.volume / 1e6).toFixed(1)}M` : "—"} />
            <StatCell label="Market Cap" value={fmtCap(q?.marketCap)} />
            <StatCell label="P/Book" value={detail?.priceToBook != null ? `${detail.priceToBook.toFixed(2)}×` : "—"} />
            <StatCell label="Enterprise Val" value={fmtCap(detail?.enterpriseValue)} />
            <StatCell label="Shares Out" value={detail?.sharesOutstanding != null ? fmtCap(detail.sharesOutstanding) : "—"} />
            <StatCell label="Analyst Target" value={q?.analystTargetPrice != null ? `$${q.analystTargetPrice.toFixed(2)}` : detail?.targetMedian != null ? `$${detail.targetMedian.toFixed(2)}` : "—"} color="var(--ft-amber)" />
            <StatCell label="52W Change" value={detail?.fiftyTwoWeekChange != null ? `${detail.fiftyTwoWeekChange > 0 ? "+" : ""}${detail.fiftyTwoWeekChange.toFixed(1)}%` : "—"} color={detail?.fiftyTwoWeekChange != null ? (detail.fiftyTwoWeekChange > 0 ? "var(--ft-green)" : "var(--ft-red)") : undefined} />
            <StatCell label="PEG Ratio" value={detail?.pegRatio != null ? detail.pegRatio.toFixed(2) : "—"} color={detail?.pegRatio != null ? (detail.pegRatio < 1 ? "var(--ft-green)" : detail.pegRatio > 2 ? "var(--ft-amber)" : undefined) : undefined} />
            <StatCell label="P/Sales" value={detail?.priceToSales != null ? `${detail.priceToSales.toFixed(2)}×` : "—"} />
            <StatCell label="Short Ratio" value={detail?.shortRatio != null ? `${detail.shortRatio.toFixed(1)}d` : "—"} color={detail?.shortRatio != null && detail.shortRatio > 5 ? "var(--ft-red)" : undefined} />
            <StatCell label="Short Float" value={detail?.shortPercentFloat != null ? `${detail.shortPercentFloat.toFixed(1)}%` : "—"} color={detail?.shortPercentFloat != null ? (detail.shortPercentFloat > 20 ? "var(--ft-red)" : detail.shortPercentFloat > 10 ? "var(--ft-amber)" : undefined) : undefined} />
          </div>
        </div>

        {/* Financial Data */}
        {detail && (detail.totalRevenue != null || detail.grossMargins != null) && (
          <div style={{ border: "1px solid var(--ft-border)" }}>
            <div style={{ padding: "6px 14px", background: "rgba(163,113,247,0.06)", borderBottom: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-accent)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Financials</div>
            <div className="ft-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
              <StatCell label="Revenue" value={fmtCap(detail.totalRevenue)} />
              <StatCell label="Revenue Growth" value={detail.revenueGrowth != null ? `${detail.revenueGrowth > 0 ? "+" : ""}${detail.revenueGrowth.toFixed(1)}%` : "—"} color={detail.revenueGrowth != null ? (detail.revenueGrowth > 0 ? "var(--ft-green)" : "var(--ft-red)") : undefined} />
              <StatCell label="Earnings Growth" value={detail.earningsGrowth != null ? `${detail.earningsGrowth > 0 ? "+" : ""}${detail.earningsGrowth.toFixed(1)}%` : "—"} color={detail.earningsGrowth != null ? (detail.earningsGrowth > 0 ? "var(--ft-green)" : "var(--ft-red)") : undefined} />
              <StatCell label="Free Cash Flow" value={fmtCap(detail.freeCashflow)} />
              <StatCell label="Gross Margin" value={detail.grossMargins != null ? `${detail.grossMargins.toFixed(1)}%` : "—"} />
              <StatCell label="Operating Margin" value={detail.operatingMargins != null ? `${detail.operatingMargins.toFixed(1)}%` : "—"} />
              <StatCell label="Net Margin" value={detail.netMargins != null ? `${detail.netMargins.toFixed(1)}%` : "—"} />
              <StatCell label="Total Debt" value={fmtCap(detail.totalDebt)} color="var(--ft-amber)" />
            </div>
          </div>
        )}

        {/* Balance Sheet */}
        {detail && (detail.operatingCashflow != null || detail.totalDebt != null || detail.debtToEquity != null || detail.currentRatio != null) && (
          <div style={{ border: "1px solid var(--ft-border)" }}>
            <div style={{ padding: "6px 14px", background: "rgba(34,211,238,0.06)", borderBottom: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-cyan)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Balance Sheet</div>
            <div className="ft-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
              <StatCell label="Op. Cash Flow" value={fmtCap(detail.operatingCashflow)} />
              <StatCell label="Free Cash Flow" value={fmtCap(detail.freeCashflow)} />
              <StatCell label="Total Cash" value={fmtCap(detail.totalCash)} color="var(--ft-green)" />
              <StatCell label="Total Debt" value={fmtCap(detail.totalDebt)} color={detail.totalDebt != null && detail.totalDebt > 0 ? "var(--ft-amber)" : undefined} />
              <StatCell label="Debt / Equity" value={detail.debtToEquity != null ? `${detail.debtToEquity.toFixed(2)}x` : "—"} color={detail.debtToEquity != null ? (detail.debtToEquity > 2 ? "var(--ft-red)" : detail.debtToEquity < 0.5 ? "var(--ft-green)" : undefined) : undefined} />
              <StatCell label="Current Ratio" value={detail.currentRatio != null ? detail.currentRatio.toFixed(2) : "—"} color={detail.currentRatio != null ? (detail.currentRatio > 1.5 ? "var(--ft-green)" : detail.currentRatio < 1 ? "var(--ft-red)" : undefined) : undefined} />
              <StatCell label="Quick Ratio" value={detail.quickRatio != null ? detail.quickRatio.toFixed(2) : "—"} color={detail.quickRatio != null ? (detail.quickRatio > 1 ? "var(--ft-green)" : "var(--ft-amber)") : undefined} />
              <StatCell label="Book Value" value={detail.bookValue != null ? `$${detail.bookValue.toFixed(2)}` : "—"} />
            </div>
          </div>
        )}

        {/* Returns/Valuation + Ownership */}
        {detail && (detail.returnOnEquity != null || detail.institutionalOwnership != null || detail.pegRatio != null || detail.shortRatio != null) && (
          <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ border: "1px solid var(--ft-border)" }}>
              <div style={{ padding: "6px 14px", background: "rgba(63,185,80,0.06)", borderBottom: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-green)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Returns & Valuation</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)" }}>
                <StatCell label="ROE" value={detail.returnOnEquity != null ? `${detail.returnOnEquity.toFixed(1)}%` : "—"} color={detail.returnOnEquity != null ? (detail.returnOnEquity > 15 ? "var(--ft-green)" : detail.returnOnEquity < 0 ? "var(--ft-red)" : undefined) : undefined} />
                <StatCell label="ROA" value={detail.returnOnAssets != null ? `${detail.returnOnAssets.toFixed(1)}%` : "—"} color={detail.returnOnAssets != null ? (detail.returnOnAssets > 5 ? "var(--ft-green)" : undefined) : undefined} />
                <StatCell label="PEG Ratio" value={detail.pegRatio != null ? detail.pegRatio.toFixed(2) : "—"} color={detail.pegRatio != null ? (detail.pegRatio < 1 ? "var(--ft-green)" : detail.pegRatio > 2 ? "var(--ft-amber)" : undefined) : undefined} />
                <StatCell label="P/Sales" value={detail.priceToSales != null ? `${detail.priceToSales.toFixed(2)}x` : "—"} />
                <StatCell label="Fwd EPS" value={detail.forwardEps != null ? `$${detail.forwardEps.toFixed(2)}` : "—"} />
                <StatCell label="52W Change" value={detail.fiftyTwoWeekChange != null ? `${detail.fiftyTwoWeekChange > 0 ? "+" : ""}${detail.fiftyTwoWeekChange.toFixed(1)}%` : "—"} color={detail.fiftyTwoWeekChange != null ? (detail.fiftyTwoWeekChange > 0 ? "var(--ft-green)" : "var(--ft-red)") : undefined} />
              </div>
            </div>
            <div style={{ border: "1px solid var(--ft-border)" }}>
              <div style={{ padding: "6px 14px", background: "rgba(248,81,73,0.06)", borderBottom: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-red)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Ownership & Short Interest</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)" }}>
                <StatCell label="Institutional" value={detail.institutionalOwnership != null ? `${detail.institutionalOwnership.toFixed(1)}%` : "—"} />
                <StatCell label="Insider" value={detail.insiderOwnership != null ? `${detail.insiderOwnership.toFixed(1)}%` : "—"} />
                <StatCell label="Short Ratio" value={detail.shortRatio != null ? `${detail.shortRatio.toFixed(1)}d` : "—"} color={detail.shortRatio != null && detail.shortRatio > 5 ? "var(--ft-red)" : undefined} />
                <StatCell label="Short Float" value={detail.shortPercentFloat != null ? `${detail.shortPercentFloat.toFixed(1)}%` : "—"} color={detail.shortPercentFloat != null ? (detail.shortPercentFloat > 20 ? "var(--ft-red)" : detail.shortPercentFloat > 10 ? "var(--ft-amber)" : undefined) : undefined} />
                <StatCell label="Target High" value={detail.targetHigh != null ? `$${detail.targetHigh.toFixed(0)}` : "—"} color="var(--ft-green)" />
                <StatCell label="Target Low" value={detail.targetLow != null ? `$${detail.targetLow.toFixed(0)}` : "—"} color="var(--ft-red)" />
              </div>
            </div>
          </div>
        )}

        {/* Two-column: Earnings + Analyst Recs */}
        <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

          {/* Earnings History */}
          <div style={{ border: "1px solid var(--ft-border)" }}>
            <div style={{ padding: "6px 14px", background: "rgba(230,162,60,0.06)", borderBottom: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-amber)", letterSpacing: "0.08em", textTransform: "uppercase" }}>EPS: Actual vs Estimate</div>
            {detailFetching ? (
              <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ft-dim)", fontFamily: "var(--font-mono)", fontSize: 11 }}>Loading…</div>
            ) : !detail?.earningsHistory?.length ? (
              <div style={{ padding: 16, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>No earnings data</div>
            ) : (
              <div style={{ padding: "12px 8px 4px" }}>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={detail.earningsHistory} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fill: "var(--ft-dim)", fontSize: 8 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "var(--ft-dim)", fontSize: 8, className: "pnum" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v.toFixed(1)}`} width={36} />
                    <Tooltip contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", fontSize: 11 }} formatter={(v: number, name: string) => [`$${v.toFixed(2)}`, name === "epsActual" ? "Actual" : "Estimate"]} />
                    <Legend iconSize={8} wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 9, paddingTop: 4 }} formatter={(v) => v === "epsActual" ? "Actual" : "Estimate"} />
                    <Bar dataKey="epsEstimate" fill="var(--ft-dim)" opacity={0.5} radius={[1, 1, 0, 0]} maxBarSize={18} />
                    <Bar dataKey="epsActual" radius={[1, 1, 0, 0]} maxBarSize={18}>
                      {detail.earningsHistory.map((e, i) => (
                        <Cell key={i} fill={(e.epsActual ?? 0) >= (e.epsEstimate ?? 0) ? "var(--ft-green)" : "var(--ft-red)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Analyst Recommendations */}
          <div style={{ border: "1px solid var(--ft-border)" }}>
            <div style={{ padding: "6px 14px", background: "rgba(34,211,238,0.06)", borderBottom: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-cyan)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Analyst Recommendations</div>
            <VStack gap={12} padding={14}>
              {detail?.recommendationKey && (
                <HStack gap={10} align="center">
                  <MonoLabel as="span" size={9}>Consensus:</MonoLabel>
                  <Text as="span" mono upper size={13} weight={700} color={detail.recommendationKey === "buy" || detail.recommendationKey === "strong_buy" ? "var(--ft-green)" : detail.recommendationKey === "hold" ? "var(--ft-amber)" : "var(--ft-red)"} letterSpacing="0.04em">
                    {detail.recommendationKey.replace("_", " ")}
                  </Text>
                  {detail.analystCount && <Text as="span" mono size={9} color="var(--ft-dim)">({detail.analystCount} analysts)</Text>}
                </HStack>
              )}
              {detail?.recommendationTrend?.length ? (
                <>
                  <MonoLabel as="div" size={9} letterSpacing="0.04em">Current month:</MonoLabel>
                  <RecBar trend={detail.recommendationTrend} />
                  {(detail?.targetMedian != null || q?.analystTargetPrice != null) && q?.price != null && (
                    <VStack gap={3} marginTop={4}>
                      {(detail?.targetHigh != null || detail?.targetLow != null) && (
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ minWidth: 56 }}>Range:</span>
                          <Text as="span" color="var(--ft-red)">${detail.targetLow?.toFixed(0)}</Text>
                          <span>—</span>
                          <Text as="span" color="var(--ft-green)">${detail.targetHigh?.toFixed(0)}</Text>
                        </div>
                      )}
                      <Text as="div" mono size={9} color="var(--ft-dim)">
                        Median: <Text as="span" weight={700} color="var(--ft-amber)">${(detail?.targetMedian ?? q?.analystTargetPrice)?.toFixed(2)}</Text>
                        {(() => {
                          const target = detail?.targetMedian ?? q?.analystTargetPrice;
                          if (target == null || !q?.price) return null;
                          const upside = ((target - q.price) / q.price) * 100;
                          return <span style={{ marginLeft: 6, color: upside >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 700 }}>({upside >= 0 ? "+" : ""}{upside.toFixed(1)}%)</span>;
                        })()}
                      </Text>
                    </VStack>
                  )}
                </>
              ) : (
                <Text as="div" mono size={11} color="var(--ft-dim)">No recommendation data</Text>
              )}
            </VStack>
          </div>
        </div>

        {/* Company Description */}
        {detail?.description && (
          <div style={{ border: "1px solid var(--ft-border)", padding: "12px 14px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>About</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", lineHeight: 1.7, display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {detail.description}
            </div>
            {detail.website && (
              <Text as="div" mono size={9} color="var(--ft-dim)" mt={6}>
                {detail.country && `${detail.country} · `}{detail.employees != null && `${(detail.employees / 1000).toFixed(0)}k employees · `}
                <Text as="span" color="var(--ft-accent)">{detail.website}</Text>
              </Text>
            )}
          </div>
        )}

        {/* ── Stock Rating Panel ───────────────────────────────────────── */}
        {(() => {
          const rating = computeStockRating(q, detail);
          if (!rating) return null;
          const gradeColor = rating.grade.startsWith("A") ? "var(--ft-green)" : rating.grade.startsWith("B") ? "var(--ft-blue)" : rating.grade === "C+" || rating.grade === "C" ? "var(--ft-amber)" : "var(--ft-red)";
          return (
            <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ border: "1px solid var(--ft-border)" }}>
                <div style={{ padding: "6px 14px", background: "rgba(88,166,255,0.06)", borderBottom: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-blue)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  FT Stock Rating
                </div>
                <div style={{ padding: "14px 14px 10px" }}>
                  <HStack gap={14} align="center" marginBottom={14}>
                    <div style={{ fontSize: 38, fontFamily: "var(--font-mono)", fontWeight: 700, color: gradeColor, lineHeight: 1 }}>{rating.grade}</div>
                    <div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: gradeColor }}>{rating.overall.toFixed(1)}<Text as="span" size={11} color="var(--ft-dim)">/10</Text></div>
                      <Text as="div" mono size={9} color="var(--ft-dim)" mt={1}>Overall Score</Text>
                    </div>
                  </HStack>
                  <RatingBar label="Value" score={rating.value} color="var(--ft-cyan)" />
                  <RatingBar label="Growth" score={rating.growth} color="var(--ft-green)" />
                  <RatingBar label="Quality" score={rating.quality} color="var(--ft-blue)" />
                  <RatingBar label="Momentum" score={rating.momentum} color="var(--ft-accent)" />
                </div>
              </div>

              {/* Price Alerts */}
              {alertsOpen && q && (
                <PriceAlertsPanel
                  ticker={selectedTicker}
                  currentPrice={q.price}
                  alerts={priceAlerts}
                  onAlertsChange={setPriceAlerts}
                />
              )}
              {!alertsOpen && (
                <div style={{ border: "1px solid var(--ft-border)", padding: "14px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Graham / DCF Valuation</div>
                  {q && (
                    <VStack gap={8}>
                      {(() => {
                        const eps = q.eps ?? 0;
                        const bv = detail?.bookValue ?? 0;
                        // Revenue growth is a required DCF input. A fabricated
                        // 8% default silently priced every ticker the API had
                        // no growth data for at "generic-large-cap" growth,
                        // then rendered a "DCF Estimate" the user read as a
                        // fair-value target. Now DCF is null when growth is
                        // unknown and the row shows the honest "—".
                        const gr = detail?.revenueGrowth != null ? detail.revenueGrowth / 100 : null;
                        const g = (eps > 0 && bv > 0) ? grahamNumber(eps, bv) : null;
                        const d = (eps > 0 && gr != null) ? dcfValue(eps, gr, 0.10, 15) : null;
                        return (<>
                          <HStack gap={8} justify="between">
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Graham Number</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: g != null && g > 0 ? (q.price < g ? "var(--ft-green)" : "var(--ft-amber)") : "var(--ft-dim)", flexShrink: 0, whiteSpace: "nowrap" }}>{g != null && g > 0 ? `$${g.toFixed(2)}` : "—"}</span>
                          </HStack>
                          <HStack gap={8} justify="between">
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>DCF Estimate</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: d != null && d > 0 ? (q.price < d ? "var(--ft-green)" : "var(--ft-amber)") : "var(--ft-dim)", flexShrink: 0, whiteSpace: "nowrap" }}>{d != null && d > 0 ? `$${d.toFixed(2)}` : "—"}</span>
                          </HStack>
                          {gr == null && (
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.04em", lineHeight: 1.5 }}>
                              DCF needs a revenue-growth input the provider did not supply for this ticker.
                            </div>
                          )}
                          {g != null && g > 0 && (
                            <HStack gap={8} justify="between">
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Margin of Safety</span>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: ((g - q.price) / g * 100) > 0 ? "var(--ft-green)" : "var(--ft-red)", flexShrink: 0, whiteSpace: "nowrap" }}>{(((g - q.price) / g) * 100).toFixed(1)}%</span>
                            </HStack>
                          )}
                        </>);
                      })()}
                    </VStack>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── News Panel ───────────────────────────────────────────────── */}
        <div style={{ border: "1px solid var(--ft-border)" }}>
          <div style={{ padding: "6px 14px", background: "rgba(163,113,247,0.06)", borderBottom: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-accent)", letterSpacing: "0.08em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}>
            <span>News — {selectedTicker}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginLeft: "auto", fontWeight: 400 }}>keyword sentiment · click AI TLDR for deep analysis</span>
          </div>
          {newsFetching ? (
            <div style={{ padding: 20, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center" }}>Loading news…</div>
          ) : newsError ? (
            <div style={{ padding: 20, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-amber)", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <span>⚠ Could not load news</span>
              <button onClick={() => selectedTicker && fetchNews(selectedTicker)} style={{ fontSize: 9, padding: "2px 10px", background: "var(--ft-raised)", border: "1px solid var(--ft-border)", color: "var(--ft-dim)", cursor: "pointer" }}>Retry</button>
            </div>
          ) : news.length === 0 ? (
            <div style={{ padding: 20, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center" }}>No recent news found for {selectedTicker}</div>
          ) : (
            <div>
              {news.map((item, i) => {
                const sentiment = newsScore(item.title);
                const sentColor = sentiment === "bullish" ? "var(--ft-green)" : sentiment === "bearish" ? "var(--ft-red)" : "var(--ft-dim)";
                const sentLabel = sentiment === "bullish" ? "▲ BULL" : sentiment === "bearish" ? "▼ BEAR" : "● NEUTRAL";
                const tldr = tldrMap[item.link];
                const loadingTldr = tldrLoading[item.link];
                return (
                  <div key={i} style={{ padding: "10px 14px", borderBottom: i < news.length - 1 ? "1px solid var(--ft-border)" : "none" }}>
                    <HStack gap={10} align="start">
                      <div style={{ flexShrink: 0, marginTop: 2 }}>
                        <span style={{ display: "inline-block", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: sentColor, background: `${sentColor}18`, padding: "2px 5px", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{sentLabel}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a href={item.link} target="_blank" rel="noopener noreferrer"
                          style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", textDecoration: "none", lineHeight: 1.5, display: "block" }}
                          onMouseEnter={e => { (e.target as HTMLAnchorElement).style.color = "var(--ft-accent)"; }}
                          onMouseLeave={e => { (e.target as HTMLAnchorElement).style.color = "var(--ft-text)"; }}>
                          {item.title}
                        </a>
                        <HStack gap={8} align="center" wrap marginTop={3}>
                          <Text as="span" mono size={8} color="var(--ft-dim)">
                            {item.publisher} · {timeAgo(item.publishedAt)}
                          </Text>
                          {!tldr && (
                            <button
                              onClick={() => fetchTldr(item.link, item.title)}
                              disabled={loadingTldr}
                              style={{
                                fontFamily: "var(--font-mono)", fontSize: 8, padding: "1px 6px",
                                background: "rgba(163,113,247,0.08)", border: "1px solid rgba(163,113,247,0.25)",
                                color: loadingTldr ? "var(--ft-dim)" : "var(--ft-accent)",
                                cursor: loadingTldr ? "wait" : "pointer", letterSpacing: "0.04em",
                              }}
                            >
                              {loadingTldr ? "…" : "AI TLDR →"}
                            </button>
                          )}
                        </HStack>
                      </div>
                    </HStack>
                    {tldr && (
                      <div style={{
                        marginTop: 6, padding: "6px 10px",
                        background: "rgba(163,113,247,0.06)", borderLeft: "2px solid rgba(163,113,247,0.35)",
                        fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", lineHeight: 1.6,
                      }}>
                        <span style={{ fontSize: 8, color: "var(--ft-accent)", letterSpacing: "0.06em", marginRight: 6 }}>AI▸</span>
                        {tldr}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </VStack>
      </>
    );
  }

  // ── Overview mode ──────────────────────────────────────────────────────────
  return (
    <VStack gap={16}>

      {/* Quotes unavailable — the market-quotes endpoint returned an empty
          set (rate-limit, provider outage, or partial API key). Every
          section below correctly renders "—" per row, but a single banner
          up top names the shared cause instead of leaving the user to
          infer it from a wall of dashes. */}
      {quotesUnavailable && (
        <div style={{ border: "1px solid var(--ft-border)", borderLeft: "3px solid var(--ft-amber)", background: "var(--ft-surface)", padding: "12px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <MonoLabel as="div" size={10} letterSpacing="0.12em" color="var(--ft-amber)">
              QUOTES UNAVAILABLE
            </MonoLabel>
            <Text as="div" size={12} color="var(--ft-muted)" mt={4}>
              The market data provider did not return any quotes. Prices and change percentages read "—" throughout Markets until the next refresh (30&nbsp;s).
            </Text>
          </div>
        </div>
      )}

      {/* ── Scrolling ticker strip (Yahoo Finance style) ── */}
      {(() => {
        const STRIP_TICKERS = ["SPY","QQQ","DIA","BTC-USD","GC=F","GBPUSD=X","^N225","^GDAXI","XLK","AAPL","NVDA","TSLA","MSFT","META","AMZN"];
        // Only tickers with a real live price AND changePercent scroll.
        // A fabricated "0.00%" on the marquee would be the loudest kind
        // of lie we could tell (moving, coloured, front-and-centre).
        const items = STRIP_TICKERS.map(t => ({ ticker: t, q: qMap.get(t) })).filter(x => x.q != null && x.q.changePercent != null);
        if (items.length === 0) return null;
        const doubled = [...items, ...items];
        return (
          <div style={{ overflow: "hidden", borderTop: "1px solid var(--ft-border)", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-surface)", position: "relative" }}>
            <style>{`
              @keyframes ft-ticker-scroll {
                0%   { transform: translateX(0); }
                100% { transform: translateX(-50%); }
              }
              .ft-ticker-track { display: flex; animation: ft-ticker-scroll 38s linear infinite; width: max-content; }
              .ft-ticker-track:hover { animation-play-state: paused; }
            `}</style>
            <div className="ft-ticker-track">
              {doubled.map(({ ticker, q }, i) => {
                // Filtered above to guarantee changePercent is present.
                const chg = q!.changePercent!;
                const up = chg >= 0;
                const col = up ? "var(--ft-green)" : "var(--ft-red)";
                const label = INDEX_LABELS[ticker] ?? SECTOR_LABELS[ticker] ?? POPULAR_NAMES[ticker] ?? CRYPTO_NAMES[ticker] ?? FOREX_NAMES[ticker] ?? ticker;
                return (
                  <button
                    key={`${ticker}-${i}`}
                    onClick={() => setSelectedTicker(ticker)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", background: "none", border: "none", borderRight: "1px solid var(--ft-border)", cursor: "pointer", flexShrink: 0 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--ft-raised)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                  >
                    <Text as="span" mono size={10} weight={700} color="var(--ft-accent)" letterSpacing="0.04em">{ticker}</Text>
                    <Text as="span" mono size={10} color="var(--ft-text)" numeric>{q!.price >= 1000 ? q!.price.toFixed(0) : q!.price >= 10 ? q!.price.toFixed(2) : q!.price.toFixed(4)}</Text>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: col, fontVariantNumeric: "tabular-nums" }}>{up ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Search bar */}
      <form onSubmit={handleSearch} style={{ display: "flex", gap: 6 }}>
        <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Enter ticker (e.g. AAPL, BRK-B, 0700.HK)…" className="ft-filter-input" style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", color: "var(--ft-text)", padding: "7px 10px", outline: "none" }} />
        <button type="submit" style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, background: "var(--ft-accent)", border: "none", color: "var(--ft-base)", padding: "7px 14px", cursor: "pointer", letterSpacing: "0.06em" }}>LOOKUP</button>
      </form>

      {/* ── Earnings Calendar ─────────────────────────────────────────────── */}
      {(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // Collect all tickers with an upcoming earnings date from qMap
        const earningsItems: { ticker: string; date: Date; daysUntil: number; label: string }[] = [];
        qMap.forEach((q, ticker) => {
          const dateStr = q.nextEarningsDate;
          if (!dateStr) return;
          const d = new Date(dateStr);
          d.setHours(0, 0, 0, 0);
          const daysUntil = Math.round((d.getTime() - today.getTime()) / (24 * 3600 * 1000));
          if (daysUntil < 0 || daysUntil > 90) return;
          earningsItems.push({ ticker, date: d, daysUntil, label: dateStr });
        });
        // Also include watchlist tickers
        watchlists.forEach((wl) => {
          wl.tickers.forEach((ticker) => {
            if (!qMap.has(ticker)) return;
            const q = qMap.get(ticker)!;
            const dateStr = q.nextEarningsDate;
            if (!dateStr) return;
            const d = new Date(dateStr);
            d.setHours(0, 0, 0, 0);
            const daysUntil = Math.round((d.getTime() - today.getTime()) / (24 * 3600 * 1000));
            if (daysUntil < 0 || daysUntil > 90) return;
            if (!earningsItems.some((e) => e.ticker === ticker)) {
              earningsItems.push({ ticker, date: d, daysUntil, label: dateStr });
            }
          });
        });
        earningsItems.sort((a, b) => a.daysUntil - b.daysUntil);
        if (earningsItems.length === 0) return null;

        // Group by week bucket
        const buckets = new Map<string, typeof earningsItems>();
        earningsItems.forEach((item) => {
          const weekStart = new Date(item.date);
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          const key = weekStart.toISOString().slice(0, 10);
          const arr = buckets.get(key) ?? [];
          arr.push(item);
          buckets.set(key, arr);
        });
        const weekKeys = Array.from(buckets.keys()).sort().slice(0, 8);

        return (
          <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "5px 12px", borderBottom: "1px solid var(--ft-border)", background: "rgba(245,158,11,0.05)", overflow: "hidden" }}>
              <span style={{ flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-amber)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                ▼ EARNINGS CALENDAR · {earningsItems.length} upcoming
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginLeft: 12, fontSize: 9, color: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}>next 90 days · click to view</span>
            </div>
            <div className="ft-scroll-x" style={{ overflowX: "auto" }}>
              <HStack minWidth="max-content">
                {weekKeys.map((weekKey) => {
                  const items = buckets.get(weekKey)!;
                  const weekDate = new Date(weekKey);
                  const weekEnd = new Date(weekDate);
                  weekEnd.setDate(weekEnd.getDate() + 6);
                  const isThisWeek = items.some((i) => i.daysUntil <= 7);
                  return (
                    <div key={weekKey} style={{ borderRight: "1px solid var(--ft-border)", padding: "10px 14px", minWidth: 160 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: isThisWeek ? "var(--ft-amber)" : "var(--ft-dim)", letterSpacing: "0.06em", marginBottom: 8, textTransform: "uppercase" }}>
                        {weekDate.toLocaleDateString("en-GB", { month: "short", day: "numeric" })} – {weekEnd.toLocaleDateString("en-GB", { day: "numeric" })}
                        {isThisWeek && <span style={{ marginLeft: 6, padding: "1px 4px", background: "rgba(245,158,11,0.15)", color: "var(--ft-amber)", borderRadius: 2, fontSize: 8 }}>THIS WEEK</span>}
                      </div>
                      <VStack gap={5}>
                        {items.map((item) => {
                          const q = qMap.get(item.ticker);
                          const chg = q?.changePercent ?? null;
                          const urgency = item.daysUntil === 0 ? "TODAY" : item.daysUntil === 1 ? "TOMORROW" : `${item.daysUntil}d`;
                          return (
                            <button
                              key={item.ticker}
                              onClick={() => setSelectedTicker(item.ticker)}
                              style={{ display: "flex", alignItems: "center", gap: 8, background: item.daysUntil <= 3 ? "rgba(245,158,11,0.06)" : "transparent", border: item.daysUntil <= 3 ? "1px solid rgba(245,158,11,0.15)" : "1px solid transparent", borderRadius: 2, padding: "5px 8px", cursor: "pointer", textAlign: "left", width: "100%" }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <HStack gap={5} align="center">
                                  <Text as="span" mono size={11} weight={700} color="var(--ft-accent)">{item.ticker}</Text>
                                  {q && <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: pctColor(chg) }}>{pctLabel(chg)}</span>}
                                </HStack>
                                <Text as="div" mono size={9} color="var(--ft-dim)" mt={1}>
                                  {item.date.toLocaleDateString("en-GB", { weekday: "short", month: "short", day: "numeric" })}
                                </Text>
                              </div>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 2, background: item.daysUntil <= 3 ? "rgba(245,158,11,0.2)" : "rgba(99,110,123,0.15)", color: item.daysUntil <= 3 ? "var(--ft-amber)" : "var(--ft-dim)", flexShrink: 0 }}>
                                {urgency}
                              </span>
                            </button>
                          );
                        })}
                      </VStack>
                    </div>
                  );
                })}
              </HStack>
            </div>
          </div>
        );
      })()}

      {/* Watchlists */}
      <WatchlistsPanel watchlists={watchlists} setWatchlists={setWatchlists} onSelectTicker={setSelectedTicker} qMap={qMap} />

      {/* ── Market Movers ── */}
      {(() => {
        const allQ = Array.from(qMap.entries())
          .filter(([, q]) => q.changePercent != null)
          .map(([ticker, q]) => ({ ticker, pct: q.changePercent!, price: q.price }));
        if (allQ.length < 4) return null;
        const sorted = [...allQ].sort((a, b) => b.pct - a.pct);
        const gainers = sorted.slice(0, 5);
        const losers = sorted.slice(-5).reverse();
        const nameOf = (t: string) => POPULAR_NAMES[t] ?? INDEX_LABELS[t] ?? SECTOR_LABELS[t] ?? CRYPTO_NAMES[t] ?? FOREX_NAMES[t] ?? COMMODITY_NAMES[t] ?? GLOBAL_INDEX_NAMES[t] ?? t;
        const renderRow = (ticker: string, pct: number, up: boolean) => (
          <button
            key={ticker}
            onClick={() => setSelectedTicker(ticker)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: "none", border: "none", borderBottom: "1px solid var(--ft-border)", cursor: "pointer", textAlign: "left", width: "100%" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--ft-raised)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
            onTouchStart={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--ft-raised)"; }}
            onTouchEnd={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-accent)", lineHeight: 1 }}>{ticker}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: 130 }}>{nameOf(ticker)}</div>
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: up ? "var(--ft-green)" : "var(--ft-red)", flexShrink: 0, letterSpacing: "0.01em" }}>
              {up ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
            </span>
          </button>
        );
        return (
          <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
            <div style={{ padding: "6px 12px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-raised)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--ft-dim)" }}>
              <Text as="span" color="var(--ft-accent)">·</Text> Market Movers
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
              <div style={{ borderRight: "1px solid var(--ft-border)" }}>
                <div style={{ padding: "4px 10px", borderBottom: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", color: "var(--ft-green)", textTransform: "uppercase" as const }}>Top Gainers</div>
                {gainers.map(g => renderRow(g.ticker, g.pct, true))}
              </div>
              <div>
                <div style={{ padding: "4px 10px", borderBottom: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", color: "var(--ft-red)", textTransform: "uppercase" as const }}>Top Losers</div>
                {losers.map(l => renderRow(l.ticker, l.pct, false))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* US ETF strip */}
      <div>
        <MonoLabel as="div" size={9} letterSpacing="0.1em" mb={8}><Text as="span" color="var(--ft-green)">·</Text> US Market ETFs</MonoLabel>
        <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {INDEX_TICKERS.split(",").map((ticker) => {
            const q = qMap.get(ticker);
            const chg = q?.changePercent ?? null;
            const chgColor = pctColor(chg);
            return (
              <button key={ticker} onClick={() => setSelectedTicker(ticker)} style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 12px", cursor: "pointer", textAlign: "left", transition: "border-color 0.1s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ft-accent)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--ft-border)"; }}
                onTouchStart={e => { e.currentTarget.style.borderColor = "var(--ft-accent)"; }}
                onTouchEnd={e => { e.currentTarget.style.borderColor = "var(--ft-border)"; }}
                onTouchCancel={e => { e.currentTarget.style.borderColor = "var(--ft-border)"; }}>
                <HStack align="start" justify="between" marginBottom={4}>
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-accent)" }}>{ticker}</div>
                    <Text as="div" mono size={9} color="var(--ft-dim)" mt={1}>{INDEX_LABELS[ticker] ?? ticker}</Text>
                  </div>
                  {q && (
                    chg == null ? (
                      <span style={{ padding: "2px 6px", fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)", background: "var(--ft-raised)", color: "var(--ft-dim)" }}>—</span>
                    ) : (
                      <span style={{ padding: "2px 6px", fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)", background: chg >= 0 ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.12)", color: chgColor }}>{chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%</span>
                    )
                  )}
                </HStack>
                <Text as="div" mono size={18} weight={700} color={q ? "var(--ft-text)" : "var(--ft-dim)"}>{q ? `$${q.price.toFixed(2)}` : "—"}</Text>
                {q?.low52w && q?.high52w && <div style={{ marginTop: 6 }}><RangeBar low52w={q.low52w} high52w={q.high52w} price={q.price} /></div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sector performance */}
      <div>
        <MonoLabel as="div" size={9} letterSpacing="0.1em" mb={8}><Text as="span" color="var(--ft-amber)">·</Text> US Sector Performance (SPDR ETFs)</MonoLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 4 }}>
          {SECTOR_TICKERS.split(",").map((ticker) => {
            const q = qMap.get(ticker);
            const chg = q?.changePercent ?? null;
            const chgColor = pctColor(chg);
            const barPct = chg == null ? 0 : Math.min(100, Math.abs(chg) * 10);
            return (
              <button key={ticker} onClick={() => setSelectedTicker(ticker)} style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "8px 10px", position: "relative", overflow: "hidden", cursor: "pointer", textAlign: "left" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ft-accent)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--ft-border)"; }}
                onTouchStart={e => { e.currentTarget.style.borderColor = "var(--ft-accent)"; }}
                onTouchEnd={e => { e.currentTarget.style.borderColor = "var(--ft-border)"; }}
                onTouchCancel={e => { e.currentTarget.style.borderColor = "var(--ft-border)"; }}>
                <div style={{ position: "absolute", bottom: 0, left: 0, height: 2, width: `${barPct}%`, background: chgColor, opacity: 0.6 }} />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 2 }}>{SECTOR_LABELS[ticker] ?? ticker}</div>
                <Text as="div" mono size={11} weight={700} color={q ? "var(--ft-text)" : "var(--ft-dim)"}>{q ? `$${q.price.toFixed(2)}` : "—"}</Text>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: chgColor, marginTop: 1 }}>{q ? pctLabel(chg) : "—"}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Popular stocks */}
      <div>
        <MonoLabel as="div" size={9} letterSpacing="0.1em" mb={8}><Text as="span" color="var(--ft-blue)">·</Text> Popular Stocks — tap for full analysis</MonoLabel>
        {isMobile ? (
          // Mobile compact list — no horizontal scroll needed
          <div style={{ border: "1px solid var(--ft-border)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 0, background: "var(--ft-surface)", borderBottom: "2px solid var(--ft-border2)" }}>
              <div style={{ ...MH, borderRight: "none" }}>Ticker</div>
              <div style={{ ...MH, textAlign: "right" }}>Price</div>
              <div style={{ ...MH, textAlign: "right", minWidth: 68 }}>Chg %</div>
            </div>
            {POPULAR_TICKERS.split(",").map((ticker, i) => {
              const q = qMap.get(ticker);
              const chg = q?.changePercent ?? null;
              const chgColor = pctColor(chg);
              return (
                <button key={ticker} onClick={() => setSelectedTicker(ticker)}
                  onTouchStart={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                  onTouchEnd={e => { e.currentTarget.style.background = ""; }}
                  onTouchCancel={e => { e.currentTarget.style.background = ""; }}
                  style={{ display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", width: "100%", border: "none", borderBottom: "1px solid var(--ft-border)", background: i % 2 === 0 ? "var(--ft-base)" : "rgba(22,27,34,0.4)", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ padding: "9px 10px", minWidth: 0 }}>
                    <Text as="span" mono size={11} weight={700} color="var(--ft-blue)">{ticker}</Text>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{POPULAR_NAMES[ticker] ?? ""}</div>
                  </div>
                  <div style={{ padding: "9px 8px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {q ? `$${q.price.toFixed(2)}` : "—"}
                  </div>
                  <div style={{ padding: "9px 10px 9px 4px", minWidth: 68, textAlign: "right" }}>
                    {q && chg != null ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, padding: "1px 4px", background: chg > 0 ? "rgba(63,185,80,0.1)" : chg < 0 ? "rgba(248,81,73,0.1)" : "transparent", color: chgColor }}>{pctLabel(chg)}</span> : <Text as="span" mono size={10} color="var(--ft-dim)">—</Text>}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          // Desktop wide table
          <div className="ft-scroll-x" style={{ border: "1px solid var(--ft-border)", overflowX: "auto" }}>
            <HStack minWidth={980}>
              {[["#", 32], ["Ticker", 72], ["Company", "flex"], ["Price", 90], ["Chg %", 80], ["Day Hi", 90], ["Day Lo", 90], ["52W Range", 150], ["Mkt Cap", 90], ["P/E", 60], ["Fwd P/E", 70], ["Beta", 60]].map(([h, w]) => (
                <div key={h} style={{ ...MH, ...(w === "flex" ? { flex: 1, minWidth: 130 } : { width: w, minWidth: w }), textAlign: ["Price","Chg %","Day Hi","Day Lo","52W Range","Mkt Cap","P/E","Fwd P/E","Beta"].includes(h as string) ? "right" : h === "#" ? "center" : "left" }}>{h}</div>
              ))}
            </HStack>
            {POPULAR_TICKERS.split(",").map((ticker, i) => {
              const q = qMap.get(ticker);
              const chg = q?.changePercent ?? null;
              const chgColor = pctColor(chg);
              const TD: React.CSSProperties = { padding: "8px 10px", fontSize: 11, fontFamily: "var(--font-mono)", borderBottom: "1px solid var(--ft-border)", borderRight: "1px solid var(--ft-border)", fontVariantNumeric: "tabular-nums", background: i % 2 === 0 ? "var(--ft-base)" : "rgba(22,27,34,0.4)" };
              return (
                <button key={ticker} onClick={() => setSelectedTicker(ticker)} style={{ display: "flex", minWidth: 980, width: "100%", cursor: "pointer", border: "none", background: "transparent" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.filter = "brightness(1.08)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = ""; }}>
                  <div style={{ ...TD, width: 32, minWidth: 32, textAlign: "center", color: "var(--ft-dim)", fontSize: 10 }}>{i + 1}</div>
                  <div style={{ ...TD, width: 72, minWidth: 72, fontWeight: 700, color: "var(--ft-blue)", letterSpacing: "0.04em" }}>{ticker}</div>
                  <div style={{ ...TD, flex: 1, minWidth: 130, color: "var(--ft-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>{POPULAR_NAMES[ticker] ?? ticker}</div>
                  <div style={{ ...TD, width: 90, minWidth: 90, textAlign: "right", color: "var(--ft-text)", fontWeight: 600 }}>{q ? `$${q.price.toFixed(2)}` : "—"}</div>
                  <div style={{ ...TD, width: 80, minWidth: 80, textAlign: "right" }}>
                    {q && chg != null ? <span style={{ padding: "1px 4px", fontSize: 10, fontWeight: 700, background: chg > 0 ? "rgba(63,185,80,0.1)" : chg < 0 ? "rgba(248,81,73,0.1)" : "transparent", color: chgColor }}>{pctLabel(chg)}</span> : "—"}
                  </div>
                  <div style={{ ...TD, width: 90, minWidth: 90, textAlign: "right", color: "var(--ft-green)" }}>{q?.dayHigh != null ? `$${q.dayHigh.toFixed(2)}` : "—"}</div>
                  <div style={{ ...TD, width: 90, minWidth: 90, textAlign: "right", color: "var(--ft-red)" }}>{q?.dayLow != null ? `$${q.dayLow.toFixed(2)}` : "—"}</div>
                  <div style={{ ...TD, width: 150, minWidth: 150, display: "flex", alignItems: "center", padding: "8px 12px" }}>
                    {q ? <RangeBar low52w={q.low52w} high52w={q.high52w} price={q.price} /> : <Text as="span" size={10} color="var(--ft-dim)">—</Text>}
                  </div>
                  <div style={{ ...TD, width: 90, minWidth: 90, textAlign: "right", color: "var(--ft-muted)" }}>{fmtCap(q?.marketCap)}</div>
                  <div style={{ ...TD, width: 60, minWidth: 60, textAlign: "right", color: q?.pe ? (q.pe > 40 ? "var(--ft-amber)" : q.pe < 15 ? "var(--ft-green)" : "var(--ft-muted)") : "var(--ft-dim)" }}>{q?.pe ? q.pe.toFixed(1) : "—"}</div>
                  <div style={{ ...TD, width: 70, minWidth: 70, textAlign: "right", color: "var(--ft-muted)" }}>{q?.forwardPe ? q.forwardPe.toFixed(1) : "—"}</div>
                  <div style={{ ...TD, width: 60, minWidth: 60, textAlign: "right", color: q?.beta ? (q.beta > 1.5 ? "var(--ft-red)" : "var(--ft-muted)") : "var(--ft-dim)", borderRight: "none" }}>{q?.beta ?? "—"}</div>
                </button>
              );
            })}
          </div>
        )}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4, textAlign: "right" }}>Via Yahoo Finance · tap any row for chart, earnings, and analyst data</div>
      </div>

      {/* Top Movers */}
      {(() => {
        const popular = POPULAR_TICKERS.split(",").map(t => ({ ticker: t, q: qMap.get(t) })).filter(x => x.q?.changePercent != null);
        const sorted = [...popular].sort((a, b) => (b.q?.changePercent ?? 0) - (a.q?.changePercent ?? 0));
        const gainers = sorted.slice(0, 4);
        const losers = sorted.slice(-4).reverse();
        if (!gainers.length && !losers.length) return null;
        return (
          <div>
            <MonoLabel as="div" size={9} letterSpacing="0.1em" mb={8}>
              <Text as="span" color="var(--ft-cyan)">·</Text> Top Movers Today
            </MonoLabel>
            <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <MonoLabel as="div" size={8} color="var(--ft-green)" letterSpacing="0.08em" mb={4}>▲ Top Gainers</MonoLabel>
                <VStack gap={2}>
                  {gainers.map(({ ticker, q }) => (
                    <button key={ticker} onClick={() => setSelectedTicker(ticker)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(63,185,80,0.05)", border: "1px solid rgba(63,185,80,0.15)", padding: "6px 10px", cursor: "pointer", textAlign: "left" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ft-green)"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(63,185,80,0.15)"; }}
                      onTouchStart={e => { e.currentTarget.style.borderColor = "var(--ft-green)"; }}
                      onTouchEnd={e => { e.currentTarget.style.borderColor = "rgba(63,185,80,0.15)"; }}
                      onTouchCancel={e => { e.currentTarget.style.borderColor = "rgba(63,185,80,0.15)"; }}>
                      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                        <Text as="span" mono size={11} weight={700} color="var(--ft-green)">{ticker}</Text>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginLeft: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{POPULAR_NAMES[ticker] ?? ticker}</span>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", fontWeight: 600 }}>${q!.price.toFixed(2)}</div>
                        <Text as="div" mono size={10} weight={700} color="var(--ft-green)">+{q!.changePercent!.toFixed(2)}%</Text>
                      </div>
                    </button>
                  ))}
                </VStack>
              </div>
              <div>
                <MonoLabel as="div" size={8} color="var(--ft-red)" letterSpacing="0.08em" mb={4}>▼ Top Losers</MonoLabel>
                <VStack gap={2}>
                  {losers.map(({ ticker, q }) => (
                    <button key={ticker} onClick={() => setSelectedTicker(ticker)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(248,81,73,0.05)", border: "1px solid rgba(248,81,73,0.15)", padding: "6px 10px", cursor: "pointer", textAlign: "left" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ft-red)"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(248,81,73,0.15)"; }}
                      onTouchStart={e => { e.currentTarget.style.borderColor = "var(--ft-red)"; }}
                      onTouchEnd={e => { e.currentTarget.style.borderColor = "rgba(248,81,73,0.15)"; }}
                      onTouchCancel={e => { e.currentTarget.style.borderColor = "rgba(248,81,73,0.15)"; }}>
                      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                        <Text as="span" mono size={11} weight={700} color="var(--ft-red)">{ticker}</Text>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginLeft: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{POPULAR_NAMES[ticker] ?? ticker}</span>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", fontWeight: 600 }}>${q!.price.toFixed(2)}</div>
                        <Text as="div" mono size={10} weight={700} color="var(--ft-red)">{q!.changePercent!.toFixed(2)}%</Text>
                      </div>
                    </button>
                  ))}
                </VStack>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Crypto */}
      <div>
        <MonoLabel as="div" size={9} letterSpacing="0.1em" mb={8}>
          <Text as="span" color="var(--ft-amber)">·</Text> Crypto Markets
        </MonoLabel>
        <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {CRYPTO_MARKET_TICKERS.split(",").map((ticker) => {
            const q = qMap.get(ticker);
            const chg = q?.changePercent ?? null;
            const chgColor = pctColor(chg);
            const priceStr = q ? (q.price >= 1000 ? `$${q.price.toLocaleString("en", { maximumFractionDigits: 0 })}` : q.price >= 1 ? `$${q.price.toFixed(2)}` : `$${q.price.toFixed(5)}`) : "—";
            return (
              <button key={ticker} onClick={() => setSelectedTicker(ticker)}
                style={{ background: "rgba(230,162,60,0.04)", border: "1px solid rgba(230,162,60,0.15)", padding: "10px 12px", cursor: "pointer", textAlign: "left", transition: "border-color 0.1s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ft-amber)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(230,162,60,0.15)"; }}
                onTouchStart={e => { e.currentTarget.style.borderColor = "var(--ft-amber)"; }}
                onTouchEnd={e => { e.currentTarget.style.borderColor = "rgba(230,162,60,0.15)"; }}
                onTouchCancel={e => { e.currentTarget.style.borderColor = "rgba(230,162,60,0.15)"; }}>
                <HStack align="start" justify="between" marginBottom={4}>
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-amber)" }}>{CRYPTO_NAMES[ticker] ?? ticker}</div>
                    <Text as="div" mono size={8} color="var(--ft-dim)" mt={1}>{ticker.replace("-USD", "")}</Text>
                  </div>
                  {q && (chg == null
                    ? <span style={{ padding: "2px 5px", fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)", background: "var(--ft-raised)", color: "var(--ft-dim)" }}>—</span>
                    : <span style={{ padding: "2px 5px", fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)", background: chg >= 0 ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.12)", color: chgColor }}>{chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%</span>
                  )}
                </HStack>
                <Text as="div" mono size={16} weight={700} color={q ? "var(--ft-text)" : "var(--ft-dim)"}>{priceStr}</Text>
                {q?.marketCap && <Text as="div" mono size={8} color="var(--ft-dim)" mt={3}>MCap {fmtCap(q.marketCap)}</Text>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Forex */}
      <div>
        <MonoLabel as="div" size={9} letterSpacing="0.1em" mb={8}>
          <Text as="span" color="var(--ft-blue)">·</Text> Forex — Major Pairs
        </MonoLabel>
        <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {FOREX_TICKERS_STR.split(",").map((ticker) => {
            const q = qMap.get(ticker);
            const chg = q?.changePercent ?? null;
            const chgColor = pctColor(chg);
            return (
              <button key={ticker} onClick={() => setSelectedTicker(ticker)}
                style={{ background: "rgba(88,166,255,0.04)", border: "1px solid rgba(88,166,255,0.12)", padding: "10px 12px", cursor: "pointer", textAlign: "left", transition: "border-color 0.1s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ft-blue)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(88,166,255,0.12)"; }}
                onTouchStart={e => { e.currentTarget.style.borderColor = "var(--ft-blue)"; }}
                onTouchEnd={e => { e.currentTarget.style.borderColor = "rgba(88,166,255,0.12)"; }}
                onTouchCancel={e => { e.currentTarget.style.borderColor = "rgba(88,166,255,0.12)"; }}>
                <HStack align="start" justify="between" marginBottom={4}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-blue)" }}>{FOREX_NAMES[ticker] ?? ticker}</div>
                  {q && (chg == null
                    ? <span style={{ padding: "2px 5px", fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)", background: "var(--ft-raised)", color: "var(--ft-dim)" }}>—</span>
                    : <span style={{ padding: "2px 5px", fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)", background: chg >= 0 ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.12)", color: chgColor }}>{chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%</span>
                  )}
                </HStack>
                <Text as="div" mono size={18} weight={700} color={q ? "var(--ft-text)" : "var(--ft-dim)"}>{q ? q.price.toFixed(4) : "—"}</Text>
                {q?.dayLow != null && q?.dayHigh != null && (
                  <Text as="div" mono size={8} color="var(--ft-dim)" mt={3}>
                    <Text as="span" color="var(--ft-red)">{q.dayLow.toFixed(4)}</Text> — <Text as="span" color="var(--ft-green)">{q.dayHigh.toFixed(4)}</Text>
                  </Text>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Commodities */}
      <div>
        <MonoLabel as="div" size={9} letterSpacing="0.1em" mb={8}>
          <Text as="span" color="var(--ft-green)">·</Text> Commodities
        </MonoLabel>
        <div className="ft-four-col" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {COMMODITY_TICKERS_STR.split(",").map((ticker) => {
            const q = qMap.get(ticker);
            const chg = q?.changePercent ?? null;
            const chgColor = pctColor(chg);
            return (
              <button key={ticker} onClick={() => setSelectedTicker(ticker)}
                style={{ background: "rgba(63,185,80,0.04)", border: "1px solid rgba(63,185,80,0.12)", padding: "10px 12px", cursor: "pointer", textAlign: "left", transition: "border-color 0.1s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ft-green)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(63,185,80,0.12)"; }}
                onTouchStart={e => { e.currentTarget.style.borderColor = "var(--ft-green)"; }}
                onTouchEnd={e => { e.currentTarget.style.borderColor = "rgba(63,185,80,0.12)"; }}
                onTouchCancel={e => { e.currentTarget.style.borderColor = "rgba(63,185,80,0.12)"; }}>
                <Text as="div" mono size={9} color="var(--ft-dim)" mb={4}>{COMMODITY_NAMES[ticker] ?? ticker}</Text>
                <Text as="div" mono size={18} weight={700} color={q ? "var(--ft-text)" : "var(--ft-dim)"}>{q ? `$${q.price.toFixed(2)}` : "—"}</Text>
                {q && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: chgColor, marginTop: 2 }}>{pctLabel(chg)}</div>}
                {q?.low52w != null && q?.high52w != null && <div style={{ marginTop: 6 }}><RangeBar low52w={q.low52w} high52w={q.high52w} price={q.price} /></div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Global Indices */}
      <div>
        <MonoLabel as="div" size={9} letterSpacing="0.1em" mb={8}>
          <Text as="span" color="var(--ft-cyan)">·</Text> Global Indices
        </MonoLabel>
        <div className="ft-five-col" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
          {GLOBAL_INDEX_TICKERS.split(",").map((ticker) => {
            const q = qMap.get(ticker);
            const chg = q?.changePercent ?? null;
            const chgColor = pctColor(chg);
            return (
              <button key={ticker} onClick={() => setSelectedTicker(ticker)}
                style={{ background: "rgba(34,211,238,0.04)", border: "1px solid rgba(34,211,238,0.12)", padding: "10px 12px", cursor: "pointer", textAlign: "left", transition: "border-color 0.1s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ft-cyan)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.12)"; }}
                onTouchStart={e => { e.currentTarget.style.borderColor = "var(--ft-cyan)"; }}
                onTouchEnd={e => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.12)"; }}
                onTouchCancel={e => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.12)"; }}>
                <Text as="div" mono size={10} weight={700} color="var(--ft-cyan)" mb={2}>{GLOBAL_INDEX_NAMES[ticker] ?? ticker}</Text>
                <Text as="div" mono size={8} color="var(--ft-dim)" mb={4}>{ticker}</Text>
                <Text as="div" mono size={15} weight={700} color={q ? "var(--ft-text)" : "var(--ft-dim)"}>
                  {q ? q.price.toLocaleString("en", { maximumFractionDigits: 0 }) : "—"}
                </Text>
                {q && (chg == null
                  ? <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-dim)", marginTop: 2 }}>—</div>
                  : <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: chgColor, marginTop: 2 }}>{chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

    </VStack>
  );
}
