import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInvestments,
  useGetInvestmentSummary,
  useCreateInvestment,
  useUpdateInvestment,
  useDeleteInvestment,
  useGetMarketQuotes,
  useGetMarketHistory,
  useGetMarketDetail,
  useGetOptionsChain,
  getGetMarketQuotesQueryKey,
  getListInvestmentsQueryKey,
  getGetInvestmentSummaryQueryKey,
  type Investment,
  type StockHistoryPoint,
  type OptionsChain,
} from "@workspace/api-client-react";
import { formatGbp, formatPercent } from "@/lib/utils";
import { getBaseCurrency } from "@/lib/currency-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Plus, Trash2, Edit2, TrendingUp, Star, X, Maximize2, Bell, RefreshCw } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, AreaChart, Area, ReferenceLine, ReferenceArea, Legend,
  ComposedChart, Customized,
} from "recharts";
import { OrdersTab } from "@/components/investments/orders-tab";
import { DerivativesTab } from "@/components/investments/derivatives-tab";
import { PersonaQuickStart } from "@/components/persona-quick-start";
import { loadPersonaIds, PERSONA_COLORS } from "@/lib/persona";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChartAnalysisModal } from "@/components/investments/chart-analysis-modal";
import { StatDrillModal } from "@/components/investments/stat-drill-modal";
import { FundamentalsTable, DividendTracker } from "@/components/investments/portfolio-tables";
import { grahamNumber, dcfValue } from "@/components/investments/black-scholes";
import {
  POPULAR_TICKERS, INDEX_TICKERS, CRYPTO_MARKET_TICKERS,
  FOREX_TICKERS_STR, COMMODITY_TICKERS_STR, GLOBAL_INDEX_TICKERS,
  SECTOR_TICKERS, OVERVIEW_TICKERS,
  INDEX_LABELS, SECTOR_LABELS, POPULAR_NAMES, CRYPTO_NAMES,
  FOREX_NAMES, COMMODITY_NAMES, GLOBAL_INDEX_NAMES,
  CHART_PERIODS, INTRADAY_PERIODS_SET, MULTIDAY_PERIODS_SET,
  TICK_PERIODS_SET, TICK_INTERVAL_MAP, isUSTicker,
  MOCK_QUOTES, newsScore, timeAgo, fmtCap, fmtNum,
} from "@/components/investments/markets-data";
import { HStack, MonoLabel, PanelBox, Text, VStack } from "@/components/primitives";
import {
  CandlestickLayer, OHLCTooltip, RangeBar, RecBar, RatingBar,
} from "@/components/investments/markets-widgets";

// ── Types ──────────────────────────────────────────────────────────────────────

type InputMode = "perShare" | "totalCost";

interface InvForm {
  ticker: string;
  name: string;
  buyDate: string;
  inputMode: InputMode;
  shares: string;
  costPricePerShare: string;
  totalShares: string;
  totalCost: string;
  fees: string;
  nativeCurrency: string;
  assetClass: AssetClass | "";
}

type AssetClass = "ETF" | "Stock" | "Bond" | "Crypto" | "Cash" | "Real Estate" | "Other";
const ASSET_CLASSES: AssetClass[] = ["ETF", "Stock", "Bond", "Crypto", "Cash", "Real Estate", "Other"];
const LS_CLASSES_KEY = "ft-inv-classes";
const LS_WATCHLISTS_KEY = "ft-watchlists";
const LS_REBALANCE_KEY = "ft-rebalance-targets";
const LS_ALERTS_KEY = "ft-price-alerts";
type Watchlist = { id: string; name: string; tickers: string[] };

// ── Price Alerts ──────────────────────────────────────────────────────────────
type AlertMetric = "price" | "pct_change" | "pe";

interface PriceAlert {
  id: string;
  ticker: string;
  metric: AlertMetric;    // "price" is default — backward-compat: absent = "price"
  targetPrice: number;   // for "price": a price; "pct_change": a % (e.g. 5 = 5%); "pe": a P/E ratio
  direction: "above" | "below";
  triggered: boolean;
  createdAt: string;
}

function readAlerts(): PriceAlert[] {
  try { const r = localStorage.getItem(LS_ALERTS_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}

function writeAlerts(alerts: PriceAlert[]): void {
  try { localStorage.setItem(LS_ALERTS_KEY, JSON.stringify(alerts)); } catch { /* noop */ }
}

interface QuoteData {
  ticker: string;
  price: number;
  currency: string;
  changePercent?: number;
  pe?: number | null;
  forwardPe?: number | null;
  eps?: number | null;
  low52w?: number | null;
  high52w?: number | null;
  marketCap?: number | null;
  beta?: number | null;
  dividendYield?: number | null;
  analystTargetPrice?: number | null;
  dayHigh?: number | null;
  dayLow?: number | null;
  volume?: number | null;
  previousClose?: number | null;
  nextEarningsDate?: string | null;
  marketState?: string | null;
  postMarketPrice?: number | null;
  postMarketChangePercent?: number | null;
  preMarketPrice?: number | null;
  preMarketChangePercent?: number | null;
}

type TabId = "portfolio" | "orders" | "derivatives" | "markets" | "rebalance";

// ── Auto-detection helpers ────────────────────────────────────────────────────

const CRYPTO_TICKERS = new Set([
  "BTC","ETH","BNB","XRP","SOL","ADA","DOGE","DOT","AVAX","MATIC","LINK","UNI","ATOM",
  "LTC","BCH","XLM","ALGO","VET","FIL","THETA","TRX","EOS","XTZ","NEO","DASH","ZEC",
  "SHIB","PEPE","FLOKI","WIF","BONK","MEME",
]);

const ETF_TICKERS = new Set([
  "VOO","VTI","SPY","QQQ","IVV","VEA","VXUS","BND","VNQ","GLD","SLV","IAU","TLT",
  "LQD","HYG","AGG","VIG","SCHD","JEPI","JEPQ","VYM","DGRO","ITOT","IEFA","IEMG",
  "EFA","EEM","VWO","RSP","ARKK","ARKG","ARKW","ARKF","XLK","XLV","XLF","XLE",
  "SMH","SOXX","NVDL","TQQQ","SQQQ","SH","VGSH","VGIT","VGLT","BSV","BKAG",
  "VUSA","VWRL","VWRP","CSPX","SWRD","IWDA","EIMI","VDEV","VAPX","ISF","CSP1",
  "ACWI","URTH","IOO","MOAT","DIVO","NOBL","VT","BNDW",
]);

const BOND_ETF_TICKERS = new Set(["BND","AGG","TLT","LQD","HYG","MUB","SHY","IEF","BSV","BKAG","VGSH","VGIT","VGLT"]);

interface ExchangeInfo { label: string; currency: string; }
const EXCHANGE_SUFFIXES: Record<string, ExchangeInfo> = {
  ".L":  { label: "LSE",        currency: "GBP" },
  ".TO": { label: "TSX",        currency: "CAD" },
  ".AX": { label: "ASX",        currency: "AUD" },
  ".HK": { label: "HKEX",       currency: "HKD" },
  ".DE": { label: "Xetra",      currency: "EUR" },
  ".PA": { label: "Euronext Paris", currency: "EUR" },
  ".AM": { label: "Euronext Amsterdam", currency: "EUR" },
  ".BR": { label: "Euronext Brussels", currency: "EUR" },
  ".LS": { label: "Euronext Lisbon", currency: "EUR" },
  ".MI": { label: "Borsa Italiana", currency: "EUR" },
  ".MC": { label: "BME Spain",  currency: "EUR" },
  ".SS": { label: "Shanghai",   currency: "CNY" },
  ".SZ": { label: "Shenzhen",   currency: "CNY" },
  ".NS": { label: "NSE India",  currency: "INR" },
  ".BO": { label: "BSE India",  currency: "INR" },
  ".T":  { label: "Tokyo",      currency: "JPY" },
  ".SW": { label: "SIX Swiss",  currency: "CHF" },
  ".ST": { label: "Stockholm",  currency: "SEK" },
  ".NZ": { label: "NZX",        currency: "NZD" },
  ".SG": { label: "SGX",        currency: "SGD" },
  ".JO": { label: "JSE",        currency: "ZAR" },
  ".MX": { label: "BMV Mexico", currency: "MXN" },
  ".SR": { label: "Tadawul",    currency: "SAR" },
};

function detectExchange(ticker: string): ExchangeInfo & { suffix: string } | null {
  for (const [suffix, info] of Object.entries(EXCHANGE_SUFFIXES)) {
    if (ticker.toUpperCase().endsWith(suffix.toUpperCase())) return { ...info, suffix };
  }
  return null;
}

function detectAssetClass(ticker: string): AssetClass {
  const t = ticker.toUpperCase().split(".")[0];
  if (CRYPTO_TICKERS.has(t)) return "Crypto";
  if (BOND_ETF_TICKERS.has(t)) return "Bond";
  if (ETF_TICKERS.has(t)) return "ETF";
  if (/^[A-Z]{2,5}\d+$/.test(t)) return "Bond";
  return "Stock";
}

// ── Constants ─────────────────────────────────────────────────────────────────

function makeEmptyInvForm(): InvForm {
  return {
    ticker: "", name: "", buyDate: new Date().toISOString().slice(0, 10), inputMode: "perShare",
    shares: "", costPricePerShare: "", totalShares: "", totalCost: "",
    fees: "", nativeCurrency: "USD", assetClass: "",
  };
}
const CHART_COLORS = ["var(--ft-blue)", "var(--ft-green)", "var(--ft-amber)", "var(--ft-cyan)", "#79C0FF", "#56D364", "#FF7B72", "#D2A8FF", "#E3B341", "#FF6E40"];
const CLASS_COLORS: Record<AssetClass, string> = {
  ETF: "var(--ft-blue)", Stock: "var(--ft-green)", Bond: "var(--ft-amber)", Crypto: "var(--ft-cyan)",
  Cash: "#E3B341", "Real Estate": "#79C0FF", Other: "var(--ft-dim)",
};

const TH: React.CSSProperties = {
  padding: "6px 12px", fontSize: 10, fontWeight: 600, color: "var(--ft-dim)",
  background: "var(--ft-surface)", borderBottom: "2px solid var(--ft-border2)",
  borderRight: "1px solid var(--ft-border)", textTransform: "uppercase" as const,
  letterSpacing: "0.4px", whiteSpace: "nowrap" as const,
};

const TABS: { id: TabId; label: string; color: string }[] = [
  { id: "portfolio", label: "PORTFOLIO", color: "var(--ft-blue)" },
  { id: "markets", label: "MARKETS", color: "var(--ft-green)" },
  { id: "orders", label: "ORDERS", color: "var(--ft-amber)" },
  { id: "derivatives", label: "DERIVATIVES", color: "var(--ft-cyan)" },
  { id: "rebalance", label: "REBALANCE", color: "var(--ft-accent)" },
];

// ── Utilities ─────────────────────────────────────────────────────────────────

function readClassMap(): Record<number, AssetClass> {
  try { const r = localStorage.getItem(LS_CLASSES_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
function writeClassMap(m: Record<number, AssetClass>): void {
  try { localStorage.setItem(LS_CLASSES_KEY, JSON.stringify(m)); } catch { /* noop */ }
}
function readWatchlists(): Watchlist[] {
  try { const r = localStorage.getItem(LS_WATCHLISTS_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function writeWatchlists(wls: Watchlist[]): void {
  try { localStorage.setItem(LS_WATCHLISTS_KEY, JSON.stringify(wls)); } catch { /* noop */ }
}


// ── Markets Tab ───────────────────────────────────────────────────────────────


interface NewsItem { title: string; link: string; publisher: string; publishedAt: string; }

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
                    const chg = q?.changePercent ?? 0;
                    const chgColor = chg >= 0 ? "var(--ft-green)" : "var(--ft-red)";
                    return (
                      <div key={ticker} style={{ display: "flex", alignItems: "center", padding: "7px 10px", borderBottom: "1px solid var(--ft-border)", borderRight: "1px solid var(--ft-border)", gap: 6 }}>
                        <button onClick={() => onSelectTicker(ticker)} style={{ flex: 1, background: "transparent", border: "none", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-blue)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{ticker}</span>
                          {q ? (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)" }}>
                              ${q.price.toFixed(2)} <span style={{ color: chgColor }}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</span>
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

function alertTriggered(a: PriceAlert, currentPrice: number, changePercent?: number | null, pe?: number | null): boolean {
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

function MarketsTab() {
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
  const [marketIntroSeen, setMarketIntroSeen] = useState(() => !!localStorage.getItem("ft-markets-intro-seen"));
  const [tickerTipSeen, setTickerTipSeen] = useState(() => !!localStorage.getItem("ft-ticker-tip-seen"));
  const isMobile = useIsMobile();

  const addTickerToWatchlist = (ticker: string, wlId: string) => {
    const updated = watchlists.map((w) =>
      w.id === wlId && !w.tickers.includes(ticker) ? { ...w, tickers: [...w.tickers, ticker] } : w
    );
    setWatchlists(updated);
    writeWatchlists(updated);
    setWlDropdownOpen(false);
  };

  // Always load overview quotes — refresh every 30 s so prices stay current
  const { data: overviewQuotes } = useGetMarketQuotes(
    { tickers: OVERVIEW_TICKERS },
    { query: { queryKey: getGetMarketQuotesQueryKey({ tickers: OVERVIEW_TICKERS }), refetchInterval: 30_000 } }
  );
  const qMap = useMemo(() => {
    const live = new Map<string, QuoteData>(overviewQuotes?.map((q) => [q.ticker, q as QuoteData]) ?? []);
    if (live.size === 0) {
      // API returned nothing — inject full mock data
      for (const [ticker, mock] of Object.entries(MOCK_QUOTES)) {
        live.set(ticker, { ticker, price: mock.price, changePercent: mock.changePercent, low52w: mock.low52w, high52w: mock.high52w } as unknown as QuoteData);
      }
    } else {
      // API returned prices but changePercent may be null (market closed / partial key)
      // Supplement with mock values so the UI always shows realistic change percentages
      for (const [ticker, q] of live.entries()) {
        if (q.changePercent == null && MOCK_QUOTES[ticker] != null) {
          live.set(ticker, { ...q, changePercent: MOCK_QUOTES[ticker].changePercent } as QuoteData);
        }
      }
    }
    return live;
  }, [overviewQuotes]);

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
    fetch(`/api/market/news?ticker=${encodeURIComponent(ticker)}`, { credentials: "include", signal: controller.signal })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setNews(d); else setNewsError(true); })
      .catch((e) => { if (e.name !== "AbortError") setNewsError(true); })
      .finally(() => setNewsFetching(false));
  };

  const fetchTldr = async (link: string, title: string) => {
    if (tldrMap[link] || tldrLoading[link]) return;
    setTldrLoading((p) => ({ ...p, [link]: true }));
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: [{ role: "user", text: `In exactly one sentence, give a concise investment angle on this news headline. Be direct, mention if it's positive or negative for investors, and why. Headline: "${title}"` }],
          context: `Ticker: ${selectedTicker ?? ""}`,
        }),
      });
      if (res.ok) {
        const d = await res.json() as { text: string };
        setTldrMap((p) => ({ ...p, [link]: d.text.trim() }));
      }
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
    const chg = q?.changePercent ?? 0;
    const chgColor = chg >= 0 ? "var(--ft-green)" : "var(--ft-red)";
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
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: color ?? "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
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
                <span style={{ padding: "3px 8px", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", background: chg >= 0 ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.12)", color: chgColor, border: `1px solid ${chg >= 0 ? "rgba(63,185,80,0.3)" : "rgba(248,81,73,0.3)"}`, whiteSpace: "nowrap" }}>
                  {chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%
                </span>
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
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", color: "#ef4444", fontSize: 9, padding: "1px 5px", letterSpacing: "0.1em" }}>
                    <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#ef4444", animation: "pulse 1s infinite" }} />
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
                    { key: "sma20",  label: "SMA20",  color: "#60a5fa", on: showSMA20,  set: setShowSMA20  },
                    { key: "sma50",  label: "SMA50",  color: "#f59e0b", on: showSMA50,  set: setShowSMA50  },
                    { key: "sma200", label: "SMA200", color: "#a78bfa", on: showSMA200, set: setShowSMA200 },
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
                      tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "var(--font-mono)" }}
                      axisLine={{ stroke: "#374151", strokeWidth: 1 }}
                      tickLine={{ stroke: "#374151", strokeWidth: 1 }}
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

        {/* First-time ticker tip */}
        {!tickerTipSeen && !isTickPeriod && (
          <div style={{ border: "1px solid rgba(88,166,255,0.25)", background: "rgba(88,166,255,0.04)", padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: "4px 20px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", lineHeight: 1.6 }}>
              <span><Text as="span" weight={600} color="var(--ft-blue)">Click chart</Text> → full RSI / MACD / Bollinger analysis</span>
              <span><Text as="span" weight={600} color="var(--ft-blue)">Hover ⓘ</Text> on any stat for explanation</span>
              <span><Text as="span" weight={600} color="var(--ft-blue)">Click stat value</Text> → drill into earnings &amp; analyst data</span>
              <span><Text as="span" weight={600} color="var(--ft-blue)">Colors:</Text> green = bullish signal · amber = caution · red = risk flag</span>
            </div>
            <button onClick={() => { localStorage.setItem("ft-ticker-tip-seen","1"); setTickerTipSeen(true); }} title="Dismiss" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", background: "transparent", border: "none", cursor: "pointer", padding: "0 4px", flexShrink: 0, lineHeight: 1 }}>✕</button>
          </div>
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
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: gradeColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rating.overall.toFixed(1)}<Text as="span" size={11} color="var(--ft-dim)">/10</Text></div>
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
                        const gr = detail?.revenueGrowth != null ? detail.revenueGrowth / 100 : 0.08;
                        const g = (eps > 0 && bv > 0) ? grahamNumber(eps, bv) : null;
                        const d = (eps > 0) ? dcfValue(eps, gr, 0.10, 15) : null;
                        return (<>
                          <HStack gap={8} justify="between">
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Graham Number</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: g != null && g > 0 ? (q.price < g ? "var(--ft-green)" : "var(--ft-amber)") : "var(--ft-dim)", flexShrink: 0, whiteSpace: "nowrap" }}>{g != null && g > 0 ? `$${g.toFixed(2)}` : "—"}</span>
                          </HStack>
                          <HStack gap={8} justify="between">
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>DCF Estimate</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: d != null && d > 0 ? (q.price < d ? "var(--ft-green)" : "var(--ft-amber)") : "var(--ft-dim)", flexShrink: 0, whiteSpace: "nowrap" }}>{d != null && d > 0 ? `$${d.toFixed(2)}` : "—"}</span>
                          </HStack>
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

      {/* ── Scrolling ticker strip (Yahoo Finance style) ── */}
      {(() => {
        const STRIP_TICKERS = ["SPY","QQQ","DIA","BTC-USD","GC=F","GBPUSD=X","^N225","^GDAXI","XLK","AAPL","NVDA","TSLA","MSFT","META","AMZN"];
        const items = STRIP_TICKERS.map(t => ({ ticker: t, q: qMap.get(t) })).filter(x => x.q != null);
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
                const chg = q!.changePercent ?? 0;
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

      {/* First-visit markets intro banner */}
      {!marketIntroSeen && (
        <div style={{ border: "1px solid rgba(210,153,34,0.35)", background: "rgba(210,153,34,0.04)", padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-amber)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 7 }}>◈ Markets — Quick start</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", lineHeight: 1.65 }}>
              <div><Text as="span" weight={600} color="var(--ft-accent)">Search any ticker</Text> — stocks, ETFs, indices, crypto (e.g. AAPL, QQQ, ^GSPC, BTC-USD, 0700.HK)</div>
              <div><Text as="span" weight={600} color="var(--ft-green)">Click the chart</Text> to open full analysis — RSI, MACD, Bollinger Bands, candlestick view with all periods</div>
              <div><Text as="span" weight={600} color="var(--ft-blue)">Tap ⓘ icons</Text> on any statistic to understand what it means; tap values to drill into earnings history &amp; analyst ratings</div>
              <div><span style={{ color: "var(--ft-amber)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}><svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5.5 1.5a3 3 0 013 3v2l.75 1H1.75L2.5 6.5v-2a3 3 0 013-3z"/><path d="M4.25 9.5a1.25 1.25 0 002.5 0"/></svg>Price alerts</span> — open any ticker and hit the bell icon to get notified when it hits your target</div>
              <div style={{ marginTop: 5, paddingTop: 6, borderTop: "1px solid rgba(210,153,34,0.2)", color: "var(--ft-dim)", fontSize: 9 }}>
                Track positions → <Text as="span" color="var(--ft-accent)">Portfolio tab</Text> &nbsp;·&nbsp; Ranked action items from your full financial picture → <Text as="span" color="var(--ft-accent)">Decisions page</Text>
              </div>
            </div>
          </div>
          <button onClick={() => { localStorage.setItem("ft-markets-intro-seen","1"); setMarketIntroSeen(true); }} title="Dismiss" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", background: "transparent", border: "none", cursor: "pointer", padding: "0 4px", flexShrink: 0, lineHeight: 1 }}>✕</button>
        </div>
      )}

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
                          const chg = q?.changePercent ?? 0;
                          const chgColor = chg >= 0 ? "var(--ft-green)" : "var(--ft-red)";
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
                                  {q && <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: chgColor }}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</span>}
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
            const chg = q?.changePercent ?? 0;
            const chgColor = chg >= 0 ? "var(--ft-green)" : "var(--ft-red)";
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
                  {q && <span style={{ padding: "2px 6px", fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)", background: chg >= 0 ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.12)", color: chgColor }}>{chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%</span>}
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
            const chg = q?.changePercent ?? 0;
            const chgColor = chg >= 0 ? "var(--ft-green)" : "var(--ft-red)";
            const barPct = Math.min(100, Math.abs(chg) * 10);
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
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: chgColor, marginTop: 1 }}>{q ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : "—"}</div>
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
              const chg = q?.changePercent ?? 0;
              const chgColor = chg > 0 ? "var(--ft-green)" : chg < 0 ? "var(--ft-red)" : "var(--ft-dim)";
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
                    {q ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, padding: "1px 4px", background: chg > 0 ? "rgba(63,185,80,0.1)" : chg < 0 ? "rgba(248,81,73,0.1)" : "transparent", color: chgColor }}>{chg > 0 ? "+" : ""}{chg.toFixed(2)}%</span> : <Text as="span" mono size={10} color="var(--ft-dim)">—</Text>}
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
              const chg = q?.changePercent ?? 0;
              const chgColor = chg > 0 ? "var(--ft-green)" : chg < 0 ? "var(--ft-red)" : "var(--ft-dim)";
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
                    {q ? <span style={{ padding: "1px 4px", fontSize: 10, fontWeight: 700, background: chg > 0 ? "rgba(63,185,80,0.1)" : chg < 0 ? "rgba(248,81,73,0.1)" : "transparent", color: chgColor }}>{chg > 0 ? "+" : ""}{chg.toFixed(2)}%</span> : "—"}
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
            const chg = q?.changePercent ?? 0;
            const chgColor = chg >= 0 ? "var(--ft-green)" : "var(--ft-red)";
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
                  {q && <span style={{ padding: "2px 5px", fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)", background: chg >= 0 ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.12)", color: chgColor }}>{chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%</span>}
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
            const chg = q?.changePercent ?? 0;
            const chgColor = chg >= 0 ? "var(--ft-green)" : "var(--ft-red)";
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
                  {q && <span style={{ padding: "2px 5px", fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)", background: chg >= 0 ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.12)", color: chgColor }}>{chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%</span>}
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
            const chg = q?.changePercent ?? 0;
            const chgColor = chg >= 0 ? "var(--ft-green)" : "var(--ft-red)";
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
                {q && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: chgColor, marginTop: 2 }}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</div>}
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
            const chg = q?.changePercent ?? 0;
            const chgColor = chg >= 0 ? "var(--ft-green)" : "var(--ft-red)";
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
                {q && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: chgColor, marginTop: 2 }}>{chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%</div>}
              </button>
            );
          })}
        </div>
      </div>

    </VStack>
  );
}

// ── Position Detail Modal ─────────────────────────────────────────────────────

interface PositionDetailProps {
  invId: number | null; onClose: () => void;
  investments: Investment[] | undefined;
  quoteMap: Map<string, QuoteData>;
  classMap: Record<number, AssetClass>;
  onClassChange: (id: number, cls: AssetClass) => void;
}

function PositionDetailModal({ invId, onClose, investments, quoteMap, classMap, onClassChange }: PositionDetailProps) {
  const inv = investments?.find((i) => i.id === invId);
  const [dcfGrowth, setDcfGrowth] = useState(12);
  const [dcfDiscount, setDcfDiscount] = useState(10);
  const [dcfTermPe, setDcfTermPe] = useState(15);

  if (!inv) return null;
  const q = quoteMap.get(inv.ticker);
  const sym = q?.currency === "GBP" ? "£" : "$";
  const plColor = inv.plPercent >= 0 ? "var(--ft-green)" : "var(--ft-red)";

  // Valuation scorecard helpers
  const analystUpside = q?.analystTargetPrice && q?.price
    ? ((q.analystTargetPrice - q.price) / q.price) * 100 : null;

  const dcfEst = q?.eps && q.eps > 0
    ? dcfValue(q.eps, dcfGrowth / 100, dcfDiscount / 100, dcfTermPe) : null;
  const dcfUpside = dcfEst && q?.price ? ((dcfEst - q.price) / q.price) * 100 : null;

  const bvpsEst = q?.eps && q.eps > 0 ? q.eps * 10 : null;
  const grahamEst = q?.eps && q.eps > 0 && bvpsEst ? grahamNumber(q.eps, bvpsEst) : null;
  const grahamUpside = grahamEst && q?.price ? ((grahamEst - q.price) / q.price) * 100 : null;

  const low52pct = q?.low52w && q?.price ? ((q.price - q.low52w) / q.low52w) * 100 : null;
  const high52pct = q?.high52w && q?.price ? ((q.high52w - q.price) / q.high52w) * 100 : null;

  type Verdict = { label: string; color: string; bg: string };
  const V = (label: string, color: string, bg: string): Verdict => ({ label, color, bg });
  const G = "var(--ft-green)", R = "var(--ft-red)", A = "var(--ft-amber)", B = "var(--ft-blue)", C = "var(--ft-cyan)", M = "var(--ft-muted)";
  const peVerdict = (pe: number) => pe < 15 ? V("CHEAP", G, "rgba(63,185,80,0.12)") : pe <= 25 ? V("FAIR", A, "rgba(230,162,60,0.12)") : V("PRICEY", R, "rgba(248,81,73,0.12)");
  const fwdPeVerdict = (pe: number) => pe < 12 ? V("CHEAP", G, "rgba(63,185,80,0.12)") : pe <= 22 ? V("FAIR", A, "rgba(230,162,60,0.12)") : V("PRICEY", R, "rgba(248,81,73,0.12)");
  const betaVerdict = (b: number) => b < 0.7 ? V("DEFENSIVE", B, "rgba(88,166,255,0.12)") : b <= 1.3 ? V("MARKET", M, "rgba(139,148,158,0.12)") : V("AGGRESSIVE", R, "rgba(248,81,73,0.12)");
  const divVerdict = (y: number) => y > 4 ? V("INCOME", G, "rgba(63,185,80,0.12)") : y > 0 ? V("MODERATE", A, "rgba(230,162,60,0.12)") : V("GROWTH", C, "rgba(34,211,238,0.12)");

  function VerdictChip({ v }: { v: Verdict }) {
    return <span style={{ padding: "1px 5px", borderRadius: 2, fontSize: 10, fontWeight: 700, background: v.bg, color: v.color, fontFamily: "var(--font-mono)" }}>{v.label}</span>;
  }

  const chartData = [
    { date: inv.buyDate, costBasis: inv.costPricePerShare, value: inv.costPricePerShare },
    { date: new Date().toISOString().slice(0, 10), costBasis: inv.costPricePerShare, value: inv.livePrice },
  ];

  return (
    <Dialog open={invId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent style={{ background: "var(--ft-base)", border: "1px solid var(--ft-border)", maxWidth: 680, maxHeight: "90vh", overflowY: "auto" }}>
        <DialogHeader style={{ borderBottom: "1px solid var(--ft-border)", paddingBottom: 12 }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg font-bold font-mono" style={{ color: "var(--ft-blue)" }}>{inv.ticker}</span>
                <span className="px-2 py-0.5 rounded-sm text-xs font-semibold" style={{ background: inv.plPercent >= 0 ? "rgba(63,185,80,0.15)" : "rgba(248,81,73,0.15)", color: plColor, border: `1px solid ${inv.plPercent >= 0 ? "rgba(63,185,80,0.3)" : "rgba(248,81,73,0.3)"}` }}>
                  {inv.plPercent >= 0 ? "▲" : "▼"} {Math.abs(inv.plPercent).toFixed(2)}%
                </span>
              </div>
              <div className="text-xs" style={{ color: "var(--ft-muted)" }}>{inv.name}</div>
            </div>
            <div className="space-y-1 flex-shrink-0">
              <div className="text-xs" style={{ color: "var(--ft-dim)" }}>Asset Class</div>
              <Select value={classMap[inv.id] ?? "Other"} onValueChange={(v) => onClassChange(inv.id, v as AssetClass)}>
                <SelectTrigger style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", height: 28, fontSize: 11, minWidth: 120 }}><SelectValue /></SelectTrigger>
                <SelectContent style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)" }}>
                  {ASSET_CLASSES.map((cls) => <SelectItem key={cls} value={cls} style={{ color: "var(--ft-text)", fontSize: 12 }}>{cls}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* P&L chart */}
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "12px 12px 4px" }}>
            <div className="text-xs font-bold mb-1 uppercase tracking-wide" style={{ color: "var(--ft-dim)" }}>Cost Basis vs. Current</div>
            <ResponsiveContainer width="100%" height={110}>
              <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--ft-raised)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "var(--ft-dim)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--ft-dim)", fontSize: 10, className: "pnum" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${sym}${v.toFixed(0)}`} width={48} />
                <Tooltip contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", fontSize: 11 }} formatter={(value: number, name: string) => [`${sym}${value.toFixed(2)}`, name === "costBasis" ? "Cost Basis" : "Live Price"]} />
                <Line type="monotone" dataKey="costBasis" stroke="var(--ft-dim)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="costBasis" />
                <Line type="monotone" dataKey="value" stroke={plColor} strokeWidth={2} dot={{ fill: plColor, r: 4, strokeWidth: 0 }} name="value" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Position metrics */}
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)" }}>
            <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide border-b" style={{ color: "var(--ft-dim)", borderColor: "var(--ft-border)" }}>Position Metrics</div>
            <div className="grid grid-cols-3">
              {[
                { label: "Shares", value: String(inv.shares) },
                { label: "Cost / Share", value: `${sym}${inv.costPricePerShare.toFixed(2)}` },
                { label: "Live Price", value: `${sym}${inv.livePrice.toFixed(2)}` },
                { label: "Total Cost", value: formatGbp(inv.costPricePerShare * inv.shares) },
                { label: "Current Value", value: formatGbp(inv.gbpValue) },
                { label: "Unrealised P&L", value: `${inv.plGbp >= 0 ? "+" : ""}${formatGbp(inv.plGbp)} (${inv.plPercent >= 0 ? "+" : ""}${inv.plPercent.toFixed(2)}%)`, color: plColor },
              ].map(({ label, value, color }) => (
                <div key={label} className="px-3 py-2 border-b border-r" style={{ borderColor: "var(--ft-border)" }}>
                  <div className="text-xs mb-0.5" style={{ color: "var(--ft-dim)" }}>{label}</div>
                  <div className="text-xs font-mono font-semibold pnum" style={{ color: color ?? "var(--ft-text)" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Valuation Scorecard */}
          {q && (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)" }}>
              <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide border-b" style={{ color: "var(--ft-accent)", borderColor: "var(--ft-border)" }}>Valuation Scorecard</div>
              <VStack gap={6} padding="8px 12px">
                {/* Metric rows: label | value | verdict chip */}
                {[
                  q.pe != null && { label: "P/E (TTM)", val: q.pe.toFixed(1), v: peVerdict(q.pe) },
                  q.forwardPe != null && { label: "Forward P/E", val: q.forwardPe.toFixed(1), v: fwdPeVerdict(q.forwardPe) },
                  q.beta != null && { label: "Beta", val: q.beta.toFixed(2), v: betaVerdict(q.beta) },
                  q.dividendYield != null && { label: "Div Yield", val: `${q.dividendYield.toFixed(2)}%`, v: divVerdict(q.dividendYield) },
                ].filter(Boolean).map((row) => {
                  if (!row || typeof row === "boolean") return null;
                  return (
                    <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <span style={{ color: "var(--ft-dim)", width: 120 }}>{row.label}</span>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--ft-text)", width: 60 }}>{row.val}</span>
                      <VerdictChip v={row.v} />
                    </div>
                  );
                })}
                {low52pct != null && high52pct != null && (
                  <Text as="div" size={12} color="var(--ft-muted)">52W: <span style={{ color: G }}>{low52pct.toFixed(1)}% above low</span>{" · "}<span style={{ color: R }}>{high52pct.toFixed(1)}% below high</span></Text>
                )}
                {grahamEst && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span style={{ color: "var(--ft-dim)", width: 120 }}>Graham Num.</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: grahamUpside != null && grahamUpside > 0 ? G : R, width: 60 }}>{sym}{grahamEst.toFixed(0)}</span>
                    {grahamUpside != null && <span style={{ fontSize: 11, color: grahamUpside > 0 ? G : R }}>{grahamUpside > 0 ? "+" : ""}{grahamUpside.toFixed(1)}% upside</span>}
                  </div>
                )}
                {analystUpside != null && q.analystTargetPrice && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span style={{ color: "var(--ft-dim)", width: 120 }}>Analyst Target</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--ft-text)", width: 60 }}>{sym}{q.analystTargetPrice.toFixed(0)}</span>
                    <span style={{ fontSize: 11, color: analystUpside >= 0 ? G : R }}>{analystUpside >= 0 ? "+" : ""}{analystUpside.toFixed(1)}%</span>
                  </div>
                )}
              </VStack>
              {/* DCF sliders */}
              {q.eps && q.eps > 0 && (
                <div style={{ borderTop: "1px solid var(--ft-border)", padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Adjustable DCF (Terminal P/E × Model)</div>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    {[
                      { label: `Growth ${dcfGrowth}%`, val: dcfGrowth, set: setDcfGrowth, min: 5, max: 25 },
                      { label: `Discount ${dcfDiscount}%`, val: dcfDiscount, set: setDcfDiscount, min: 8, max: 15 },
                      { label: `Terminal P/E ${dcfTermPe}×`, val: dcfTermPe, set: setDcfTermPe, min: 10, max: 20 },
                    ].map(({ label, val, set, min, max }) => (
                      <div key={label}>
                        <Text as="div" size={10} color="var(--ft-dim)" mb={3}>{label}</Text>
                        <input type="range" min={min} max={max} step={1} value={val}
                          onChange={(e) => set(parseInt(e.target.value, 10))}
                          style={{ width: "100%", accentColor: "var(--ft-accent)" }} />
                      </div>
                    ))}
                  </div>
                  {dcfEst && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", background: "rgba(163,113,247,0.06)", border: "1px solid rgba(163,113,247,0.2)" }}>
                      <Text as="span" size={11} color="var(--ft-dim)">DCF Fair Value</Text>
                      <div>
                        <Text as="span" mono size={14} weight={700} color={dcfUpside != null && dcfUpside > 0 ? "var(--ft-green)" : "var(--ft-red)"}>
                          {sym}{dcfEst.toFixed(0)}
                        </Text>
                        {dcfUpside != null && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: dcfUpside > 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                            {dcfUpside > 0 ? "+" : ""}{dcfUpside.toFixed(1)}% upside
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter style={{ borderTop: "1px solid var(--ft-border)", paddingTop: 12 }}>
          <DialogClose asChild>
            <Button variant="ghost" size="sm" style={{ color: "var(--ft-dim)", fontSize: 12 }}>Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Price Alert Popover ────────────────────────────────────────────────────────

interface PriceAlertPopoverProps {
  ticker: string;
  currentPrice: number;
  alerts: PriceAlert[];
  onAlertsChange: (alerts: PriceAlert[]) => void;
}

function PriceAlertPopover({ ticker, currentPrice, alerts, onAlertsChange }: PriceAlertPopoverProps) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [targetInput, setTargetInput] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const existing = alerts.find((a) => a.ticker === ticker && !a.triggered);

  useEffect(() => {
    if (existing) {
      setDirection(existing.direction);
      setTargetInput(existing.targetPrice.toString());
    } else {
      setDirection("above");
      setTargetInput("");
    }
  }, [existing, open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const setAlert = () => {
    const price = parseFloat(targetInput);
    if (isNaN(price) || price <= 0) return;
    const withoutOld = alerts.filter((a) => !(a.ticker === ticker && !a.triggered));
    const newAlert: PriceAlert = {
      id: `${ticker}-${Date.now()}`,
      ticker,
      metric: "price",
      targetPrice: price,
      direction,
      triggered: false,
      createdAt: new Date().toISOString(),
    };
    const updated = [...withoutOld, newAlert];
    onAlertsChange(updated);
    writeAlerts(updated);
    setOpen(false);
  };

  const removeAlert = () => {
    const updated = alerts.filter((a) => !(a.ticker === ticker && !a.triggered));
    onAlertsChange(updated);
    writeAlerts(updated);
    setOpen(false);
  };

  const hasAlert = !!existing;

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        title={hasAlert ? `Alert: ${existing.direction} £${existing.targetPrice}` : "Set price alert"}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "2px 3px",
          display: "flex",
          alignItems: "center",
          color: hasAlert ? "var(--ft-amber)" : "var(--ft-dim)",
          opacity: hasAlert ? 1 : 0.5,
          transition: "opacity 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = hasAlert ? "1" : "0.5"; }}
      >
        <Bell style={{ width: 13, height: 13 }} />
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            zIndex: 9999,
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-border2)",
            padding: "14px 16px",
            width: 240,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            top: (() => {
              const rect = buttonRef.current?.getBoundingClientRect();
              return rect ? rect.bottom + 6 : 100;
            })(),
            left: (() => {
              const rect = buttonRef.current?.getBoundingClientRect();
              return rect ? Math.min(rect.left, window.innerWidth - 256) : 100;
            })(),
          }}
        >
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-amber)", letterSpacing: "0.1em", marginBottom: 10 }}>
            ALERT · {ticker}
          </div>

          <Text as="div" mono size={9} color="var(--ft-dim)" mb={6}>
            CURRENT: <Text as="span" color="var(--ft-text)">£{currentPrice.toFixed(2)}</Text>
          </Text>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 5 }}>ALERT WHEN PRICE GOES:</div>
            <div style={{ display: "flex", gap: 0, border: "1px solid var(--ft-border2)" }}>
              {(["above", "below"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDirection(d)}
                  style={{
                    flex: 1, padding: "5px 8px", fontSize: 10, fontWeight: 600,
                    fontFamily: "var(--font-mono)", letterSpacing: "0.06em", border: "none",
                    cursor: "pointer", textTransform: "uppercase",
                    background: direction === d ? (d === "above" ? "rgba(63,185,80,0.18)" : "rgba(248,81,73,0.18)") : "transparent",
                    color: direction === d ? (d === "above" ? "var(--ft-green)" : "var(--ft-red)") : "var(--ft-dim)",
                    transition: "background 0.1s, color 0.1s",
                  }}
                >{d}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 4 }}>TARGET PRICE (£)</div>
            <input
              type="number"
              step="0.01"
              min="0"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              placeholder="e.g. 150.00"
              style={{
                width: "100%", fontFamily: "var(--font-mono)", fontSize: 12,
                background: "var(--ft-raised)", border: "1px solid var(--ft-border2)",
                color: "var(--ft-text)", padding: "5px 8px", outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <HStack gap={6}>
            <button
              onClick={setAlert}
              style={{
                flex: 1, padding: "6px 10px", fontSize: 10, fontWeight: 700,
                fontFamily: "var(--font-mono)", letterSpacing: "0.06em", cursor: "pointer",
                background: "var(--ft-amber)", color: "var(--ft-base)", border: "none",
              }}
            >
              {existing ? "UPDATE" : "SET ALERT"}
            </button>
            {existing && (
              <button
                onClick={removeAlert}
                style={{
                  padding: "6px 10px", fontSize: 10, fontWeight: 700,
                  fontFamily: "var(--font-mono)", letterSpacing: "0.06em", cursor: "pointer",
                  background: "transparent", color: "var(--ft-red)",
                  border: "1px solid var(--ft-red)",
                }}
              >
                REMOVE
              </button>
            )}
          </HStack>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Rebalance Tab ─────────────────────────────────────────────────────────────

function readRebalanceTargets(): Record<string, number> {
  try { const r = localStorage.getItem(LS_REBALANCE_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}

function writeRebalanceTargets(m: Record<string, number>): void {
  try { localStorage.setItem(LS_REBALANCE_KEY, JSON.stringify(m)); } catch { /* noop */ }
}

interface RebalanceRow {
  assetClass: string;
  currentValue: number;
  currentPct: number;
  targetPct: number;
  driftPp: number;
  action: "Buy" | "Sell" | "Hold";
  actionAmount: number;
}

interface RebalanceTabProps {
  classAllocData: { name: string; value: number }[];
  totalPortfolioValue: number;
}

function RebalanceTab({ classAllocData, totalPortfolioValue }: RebalanceTabProps) {
  const [targets, setTargets] = useState<Record<string, number>>(() => readRebalanceTargets());
  const [editingTargets, setEditingTargets] = useState<Record<string, string>>({});

  // Derive rows from classAllocData + targets
  const rows: RebalanceRow[] = classAllocData.map((d) => {
    const currentPct = totalPortfolioValue > 0 ? (d.value / totalPortfolioValue) * 100 : 0;
    const targetPct = targets[d.name] ?? 0;
    const driftPp = currentPct - targetPct;
    const targetValue = totalPortfolioValue * (targetPct / 100);
    const diff = targetValue - d.value;
    return {
      assetClass: d.name,
      currentValue: d.value,
      currentPct,
      targetPct,
      driftPp,
      action: Math.abs(diff) < 0.005 ? "Hold" : diff > 0 ? "Buy" : "Sell",
      actionAmount: Math.abs(diff),
    };
  });

  const totalTargetPct = rows.reduce((s, r) => s + r.targetPct, 0);
  const totalCurrentValue = rows.reduce((s, r) => s + r.currentValue, 0);

  const handleTargetChange = (assetClass: string, raw: string) => {
    setEditingTargets((prev) => ({ ...prev, [assetClass]: raw }));
  };

  const handleTargetBlur = (assetClass: string) => {
    const raw = editingTargets[assetClass] ?? "";
    const parsed = parseFloat(raw);
    const newVal = isNaN(parsed) ? 0 : Math.max(0, Math.min(100, Math.round(parsed * 10) / 10));
    const updated = { ...targets, [assetClass]: newVal };
    setTargets(updated);
    writeRebalanceTargets(updated);
    setEditingTargets((prev) => { const next = { ...prev }; delete next[assetClass]; return next; });
  };

  const resetToEqualWeight = () => {
    if (classAllocData.length === 0) return;
    const equal = Math.round((100 / classAllocData.length) * 10) / 10;
    const newTargets: Record<string, number> = {};
    classAllocData.forEach((d, i) => {
      // Distribute remainder to the last item to ensure sum is exactly 100
      if (i === classAllocData.length - 1) {
        const assigned = equal * (classAllocData.length - 1);
        newTargets[d.name] = Math.round((100 - assigned) * 10) / 10;
      } else {
        newTargets[d.name] = equal;
      }
    });
    setTargets(newTargets);
    writeRebalanceTargets(newTargets);
    setEditingTargets({});
  };

  const driftColor = (driftPp: number): string => {
    const abs = Math.abs(driftPp);
    if (abs <= 2) return "var(--ft-green)";
    if (abs <= 5) return "var(--ft-amber)";
    return "var(--ft-red)";
  };

  const targetSumOk = Math.abs(totalTargetPct - 100) < 0.15;

  const RTBH: React.CSSProperties = {
    padding: "6px 12px", fontSize: 10, fontWeight: 600, color: "var(--ft-dim)",
    background: "var(--ft-surface)", borderBottom: "2px solid var(--ft-border2)",
    borderRight: "1px solid var(--ft-border)", textTransform: "uppercase" as const,
    letterSpacing: "0.4px", whiteSpace: "nowrap" as const,
  };

  const RTBD: React.CSSProperties = {
    padding: "7px 12px", borderRight: "1px solid var(--ft-border)",
    fontSize: 12, fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-mono)",
  };

  if (classAllocData.length === 0) {
    return (
      <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ft-text)", marginBottom: 8 }}>No positions to rebalance</div>
        <Text as="div" size={12} color="var(--ft-dim)">
          Add positions in the Portfolio tab and assign asset classes. The rebalancer groups positions by asset class.
        </Text>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <HStack gap={8} align="center" justify="between" wrap>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ft-text)", fontFamily: "var(--font-mono)" }}>REBALANCING CALCULATOR</div>
          <Text as="div" size={11} color="var(--ft-dim)" mt={2}>
            Set target allocations per asset class · Buy/Sell amounts computed automatically
          </Text>
        </div>
        <HStack gap={10} align="center">
          {!targetSumOk && (
            <Text as="span" mono size={11} color="var(--ft-amber)">
              Targets sum: {totalTargetPct.toFixed(1)}% (must equal 100%)
            </Text>
          )}
          {targetSumOk && (
            <Text as="span" mono size={11} color="var(--ft-green)">
              Targets sum: 100% ✓
            </Text>
          )}
          <button
            onClick={resetToEqualWeight}
            style={{
              padding: "5px 12px", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)",
              letterSpacing: "0.04em", border: "1px solid var(--ft-border2)",
              background: "var(--ft-raised)", color: "var(--ft-muted)", cursor: "pointer",
              borderRadius: 2,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ft-text)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ft-muted)"; }}
          >
            EQUAL WEIGHT
          </button>
        </HStack>
      </HStack>

      {/* Table */}
      <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-base)" }}>
        <div className="ft-scroll-x" style={{ overflowX: "auto" }}>
          {/* Header */}
          <div style={{ display: "flex", background: "var(--ft-surface)" }}>
            {[
              ["ASSET CLASS", "160px"],
              ["CURRENT VALUE", "130px"],
              ["CURRENT %", "100px"],
              ["TARGET %", "120px"],
              ["DRIFT (pp)", "100px"],
              ["ACTION", "160px"],
            ].map(([h, w]) => (
              <div key={h} style={{ ...RTBH, width: w, minWidth: w, flex: h === "ASSET CLASS" ? 1 : undefined, textAlign: ["CURRENT VALUE", "CURRENT %", "DRIFT (pp)", "ACTION"].includes(h) ? "right" : "left" }}>
                {h}
              </div>
            ))}
          </div>

          {/* Data rows */}
          {rows.map((row) => {
            const color = CLASS_COLORS[row.assetClass as AssetClass] ?? "var(--ft-dim)";
            const drift = driftColor(row.driftPp);
            const inputVal = editingTargets[row.assetClass] !== undefined
              ? editingTargets[row.assetClass]
              : row.targetPct.toFixed(1);
            return (
              <div
                key={row.assetClass}
                style={{ display: "flex", alignItems: "center", borderBottom: "1px solid rgba(33,38,45,0.5)", background: "var(--ft-base)" }}
              >
                {/* Asset class */}
                <div style={{ ...RTBD, flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                  <span style={{ color: "var(--ft-text)", fontWeight: 600, fontSize: 12 }}>{row.assetClass}</span>
                </div>
                {/* Current value */}
                <div className="pnum" style={{ ...RTBD, width: 130, minWidth: 130, textAlign: "right", color: "var(--ft-text)" }}>
                  {formatGbp(row.currentValue)}
                </div>
                {/* Current % */}
                <div style={{ ...RTBD, width: 100, minWidth: 100, textAlign: "right", color: "var(--ft-muted)" }}>
                  {row.currentPct.toFixed(1)}%
                </div>
                {/* Target % (editable) */}
                <div style={{ ...RTBD, width: 120, minWidth: 120, padding: "4px 8px" }}>
                  <HStack gap={4} align="center" justify="end">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={inputVal}
                      onChange={(e) => handleTargetChange(row.assetClass, e.target.value)}
                      onBlur={() => handleTargetBlur(row.assetClass)}
                      style={{
                        width: 60, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12,
                        background: "var(--ft-raised)", border: "1px solid var(--ft-border2)",
                        color: "var(--ft-text)", padding: "2px 5px", borderRadius: 2, outline: "none",
                      }}
                    />
                    <Text as="span" size={12} color="var(--ft-muted)">%</Text>
                  </HStack>
                </div>
                {/* Drift */}
                <div style={{ ...RTBD, width: 100, minWidth: 100, textAlign: "right", color: drift, fontWeight: 600 }}>
                  {row.driftPp > 0 ? "+" : ""}{row.driftPp.toFixed(1)} pp
                </div>
                {/* Action */}
                <div style={{ ...RTBD, width: 160, minWidth: 160, textAlign: "right" }}>
                  {row.action === "Hold" ? (
                    <Text as="span" mono size={11} color="var(--ft-green)">— HOLD</Text>
                  ) : (
                    <span style={{
                      fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)",
                      color: row.action === "Buy" ? "var(--ft-green)" : "var(--ft-red)",
                      padding: "1px 6px", borderRadius: 2,
                      background: row.action === "Buy" ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.12)",
                    }}>
                      {row.action} <span className="pnum">{formatGbp(row.actionAmount)}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Totals row */}
          <div style={{ display: "flex", alignItems: "center", borderTop: "2px solid var(--ft-border2)", background: "rgba(163,113,247,0.04)" }}>
            <div style={{ ...RTBD, flex: 1, color: "var(--ft-dim)", fontWeight: 700, fontSize: 10, letterSpacing: "0.4px", textTransform: "uppercase" }}>
              TOTAL
            </div>
            <div className="pnum" style={{ ...RTBD, width: 130, minWidth: 130, textAlign: "right", color: "var(--ft-text)", fontWeight: 700 }}>
              {formatGbp(totalCurrentValue)}
            </div>
            <div style={{ ...RTBD, width: 100, minWidth: 100, textAlign: "right", color: "var(--ft-muted)", fontWeight: 700 }}>
              {totalPortfolioValue > 0 ? "100.0%" : "—"}
            </div>
            <div style={{ ...RTBD, width: 120, minWidth: 120, textAlign: "right", color: targetSumOk ? "var(--ft-green)" : "var(--ft-amber)", fontWeight: 700, fontSize: 12, padding: "7px 12px" }}>
              {totalTargetPct.toFixed(1)}%
            </div>
            <div style={{ ...RTBD, width: 100, minWidth: 100 }} />
            <div style={{ ...RTBD, width: 160, minWidth: 160 }} />
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", paddingTop: 2 }}>
        {[
          { color: "var(--ft-green)", label: "Within ±2pp — on target" },
          { color: "var(--ft-amber)", label: "±2–5pp drift — consider rebalancing" },
          { color: "var(--ft-red)", label: ">5pp drift — rebalance recommended" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: color }} />
            {label}
          </div>
        ))}
      </div>

      {/* Info note */}
      <div style={{ padding: "8px 12px", background: "var(--ft-surface)", border: "1px solid var(--ft-border)", fontSize: 11, color: "var(--ft-dim)" }}>
        Targets persist in localStorage. Asset classes are derived from your portfolio positions using the class tags you assign to each holding.
        Portfolio total used: <span className="pnum" style={{ fontFamily: "var(--font-mono)", color: "var(--ft-muted)" }}>{formatGbp(totalPortfolioValue)}</span>.
      </div>
    </div>
  );
}

// ── AI Portfolio Commentary ───────────────────────────────────────────────────

const AI_COMMENTARY_CACHE_KEY = "ft-investments-ai-commentary";
const AI_COMMENTARY_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function callAI(context: string, prompt: string): Promise<string> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ messages: [{ role: "user", text: prompt }], context }),
  });
  if (!res.ok) throw new Error();
  const { text } = await res.json() as { text: string };
  return text;
}

interface AiPortfolioCommentaryProps {
  investments: Array<{ ticker: string; gbpValue: number; quantity?: number }>;
  totalValue: number;
}

function AiPortfolioCommentary({ investments, totalValue }: AiPortfolioCommentaryProps) {
  const [commentary, setCommentary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(true);

  const top3 = [...investments]
    .sort((a, b) => b.gbpValue - a.gbpValue)
    .slice(0, 3);

  const topTicker = top3[0]?.ticker ?? "";
  const topPct = totalValue > 0 && top3[0] ? (top3[0].gbpValue / totalValue) * 100 : 0;
  const isConcentrated = investments.some(
    (inv) => totalValue > 0 && (inv.gbpValue / totalValue) * 100 > 30,
  );

  const annualYield = (() => {
    // Rough placeholder — no yield data at this component level, so omit
    return null;
  })();

  const holdingCount = investments.length;

  const buildPrompt = () => {
    const rows = investments
      .map((inv) => {
        const pct = totalValue > 0 ? ((inv.gbpValue / totalValue) * 100).toFixed(1) : "0.0";
        return `${inv.ticker}: £${inv.gbpValue.toFixed(0)} (${pct}%)`;
      })
      .join(", ");
    return (
      `Analyse this investment portfolio in exactly 3-4 sentences. Cover: ` +
      `(1) composition — mention the top 3 holdings by weight; ` +
      `(2) concentration risk — flag any position over 30%; ` +
      `(3) diversification assessment; ` +
      `(4) one forward-looking observation. ` +
      `Be concise, factual, and professional. No bullet points. No headings. Plain prose only.\n\n` +
      `Portfolio (total £${totalValue.toFixed(0)}): ${rows}`
    );
  };

  const fetchCommentary = async () => {
    if (investments.length === 0 || totalValue <= 0) return;
    setLoading(true);
    try {
      const prompt = buildPrompt();
      const text = await callAI("", prompt);
      setCommentary(text);
      try {
        sessionStorage.setItem(
          AI_COMMENTARY_CACHE_KEY,
          JSON.stringify({ text, ts: Date.now() }),
        );
      } catch { /* storage quota — silently ignore */ }
    } catch {
      // Silently hide on error
      setVisible(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (investments.length === 0 || totalValue <= 0) return;
    // Check session cache first
    try {
      const raw = sessionStorage.getItem(AI_COMMENTARY_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { text: string; ts: number };
        if (Date.now() - cached.ts < AI_COMMENTARY_TTL_MS) {
          setCommentary(cached.text);
          return;
        }
      }
    } catch { /* ignore */ }
    const id = setTimeout(() => { void fetchCommentary(); }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investments.length, totalValue]);

  if (!visible || investments.length === 0 || totalValue <= 0) return null;

  return (
    <div style={{
      background: "var(--ft-raised)",
      borderLeft: "2px solid var(--ft-accent)",
      padding: "10px 14px",
      marginBottom: 0,
    }}>
      {/* Header */}
      <HStack align="center" justify="between" marginBottom={8}>
        <Text as="span" mono size={10} weight={700} color="var(--ft-accent)" letterSpacing="0.08em">· PORTFOLIO INTELLIGENCE</Text>
        <button
          onClick={() => {
            try { sessionStorage.removeItem(AI_COMMENTARY_CACHE_KEY); } catch { /* noop */ }
            void fetchCommentary();
          }}
          title="Refresh analysis"
          disabled={loading}
          style={{ background: "transparent", border: "none", cursor: loading ? "default" : "pointer", padding: 2, color: "var(--ft-dim)", display: "flex", alignItems: "center", transition: "color 0.15s" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ft-accent)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ft-dim)"; }}
        >
          <RefreshCw
            className={loading ? "animate-spin" : ""}
            style={{ width: 12, height: 12 }}
          />
        </button>
      </HStack>

      {/* Commentary text */}
      {loading && !commentary && (
        <Text as="div" mono size={12} color="var(--ft-dim)" letterSpacing="0.01em" lineHeight={1.75}>
          Analysing portfolio…
        </Text>
      )}
      {commentary && (
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-text)", lineHeight: 1.75, margin: 0, letterSpacing: "0.01em" }}>
          {commentary}
        </p>
      )}

      {/* Stat chips */}
      {(commentary || loading) && (
        <HStack gap={6} wrap marginTop={10}>
          {[
            `${holdingCount} holding${holdingCount !== 1 ? "s" : ""}`,
            topTicker ? `Top position: ${topTicker} (${topPct.toFixed(1)}%)` : null,
            isConcentrated ? "⚠ Concentrated position" : "Diversified",
            annualYield != null ? `Est. annual yield: ${annualYield}%` : null,
          ]
            .filter(Boolean)
            .map((chip) => (
              <span
                key={chip as string}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--ft-dim)",
                  background: "var(--ft-surface)",
                  border: "1px solid var(--ft-border)",
                  padding: "2px 8px",
                  letterSpacing: "0.03em",
                }}
              >
                {chip}
              </span>
            ))}
        </HStack>
      )}
    </div>
  );
}

// ── useFlashCell — Bloomberg price-update flash animation hook ────────────────

function useFlashCell(value: number): [string, (node: HTMLElement | null) => void] {
  const prevRef = useRef<number>(value);
  const [flashClass, setFlashClass] = useState<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ref = useCallback((node: HTMLElement | null) => {
    // just a ref callback for the caller's convenience
  }, []);

  useEffect(() => {
    const prev = prevRef.current;
    if (prev !== value && prev !== 0) {
      const cls = value > prev ? "ft-flash-up" : "ft-flash-down";
      setFlashClass(cls);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setFlashClass(""), 650);
    }
    prevRef.current = value;
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value]);

  return [flashClass, ref];
}

// ── FlashCell — wraps a td/div with flash animation ─────────────────────────

function FlashCell({ value, children, style, className }: {
  value: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  const [flashClass] = useFlashCell(value);
  return (
    <td
      className={[flashClass, className].filter(Boolean).join(" ")}
      style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", ...style }}
    >
      {children}
    </td>
  );
}

// ── PortfolioValueOverTimePanel — AreaChart of raw daily snapshots ────────────

interface PortfolioValueOverTimePanelProps {
  snapshots: { date: string; value: number }[];
}

function PortfolioValueOverTimePanel({ snapshots }: PortfolioValueOverTimePanelProps) {
  const last90 = snapshots.slice(-90);
  const daysTracked = snapshots.length;

  // Format X-axis ticks: show month label at first occurrence of each month
  const monthTicks = useMemo(() => {
    const seen = new Set<string>();
    const picks: string[] = [];
    for (const pt of last90) {
      const month = pt.date.slice(0, 7); // "YYYY-MM"
      if (!seen.has(month)) { seen.add(month); picks.push(pt.date); }
    }
    return picks;
  }, [last90]);

  const minVal = last90.length > 0 ? Math.min(...last90.map((p) => p.value)) : 0;
  const maxVal = last90.length > 0 ? Math.max(...last90.map((p) => p.value)) : 0;
  const domain: [number | string, number | string] = [
    Math.max(0, minVal * 0.97),
    maxVal * 1.03,
  ];

  const firstVal = last90[0]?.value ?? 0;
  const lastVal = last90[last90.length - 1]?.value ?? 0;
  const netChange = firstVal > 0 ? ((lastVal - firstVal) / firstVal) * 100 : 0;
  const netChangeColor = netChange >= 0 ? "var(--ft-green)" : "var(--ft-red)";

  if (last90.length < 2) {
    return (
      <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
        <div className="ft-panel-header">
          <div className="ft-panel-label"><span className="accent-dot">·</span>PORTFOLIO VALUE OVER TIME</div>
          <Text as="span" mono size={9} color="var(--ft-dim)">
            {daysTracked} day{daysTracked !== 1 ? "s" : ""} tracked
          </Text>
        </div>
        <div style={{ padding: "20px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>
          Collecting snapshots… check back tomorrow ({daysTracked} snapshot{daysTracked !== 1 ? "s" : ""} so far)
        </div>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
      <div className="ft-panel-header">
        <HStack gap={12} align="center">
          <div className="ft-panel-label"><span className="accent-dot">·</span>PORTFOLIO VALUE OVER TIME</div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: netChangeColor }}>
            {netChange >= 0 ? "▲" : "▼"} {Math.abs(netChange).toFixed(1)}%
          </span>
        </HStack>
        <Text as="span" mono size={9} color="var(--ft-dim)">
          {daysTracked} day{daysTracked !== 1 ? "s" : ""} tracked
        </Text>
      </div>
      <div style={{ padding: "12px 12px 4px" }}>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={last90} margin={{ top: 4, right: 8, left: 0, bottom: 2 }}>
            <defs>
              <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--ft-accent)" stopOpacity={0.30} />
                <stop offset="95%" stopColor="var(--ft-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--ft-raised)" vertical={false} />
            <XAxis
              dataKey="date"
              ticks={monthTicks}
              tickFormatter={(d: string) => {
                const dt = new Date(d + "T00:00:00");
                return dt.toLocaleDateString("en-GB", { month: "short" });
              }}
              tick={{ fill: "var(--ft-dim)", fontSize: 9, fontFamily: "var(--font-mono)" }}
              axisLine={{ stroke: "var(--ft-border2)", strokeWidth: 1 }}
              tickLine={false}
              height={22}
            />
            <YAxis
              hide
              domain={domain}
            />
            <Tooltip
              contentStyle={{
                background: "var(--ft-surface)",
                border: "1px solid var(--ft-border2)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
              }}
              formatter={(v: number) => [`£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Value"]}
              labelStyle={{ color: "var(--ft-dim)", fontSize: 9 }}
              itemStyle={{ color: "var(--ft-accent)" }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--ft-accent)"
              strokeWidth={1.5}
              fill="url(#portfolioGrad)"
              dot={false}
              activeDot={{ r: 3, fill: "var(--ft-accent)", stroke: "var(--ft-base)", strokeWidth: 1 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── InvKpiBar — Bloomberg-style KPI strip for the Investments page ────────────

interface KpiCell {
  label: string;
  value: string;
  delta?: string;
  deltaPositive?: boolean | null; // null = neutral
}

function InvKpiBar({ cells, style }: { cells: KpiCell[]; style?: React.CSSProperties }) {
  const isMobile = useIsMobile();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : `repeat(${cells.length}, 1fr)`,
        borderBottom: "1px solid var(--ft-border)",
        ...style,
      } as React.CSSProperties}
    >
      {cells.map((cell, i) => {
        const isLastOdd = isMobile && i === cells.length - 1 && cells.length % 2 === 1;
        return (
        <div key={cell.label} className="ft-kpi-bar-cell" style={isLastOdd ? { gridColumn: "span 2" } : undefined}>
          <div className="ft-kpi-bar-cell-label">{cell.label}</div>
          <div className="ft-kpi-bar-cell-value pnum">{cell.value}</div>
          {cell.delta != null && (
            <div
              className="ft-kpi-bar-cell-delta pnum"
              style={{
                color:
                  cell.deltaPositive === null || cell.deltaPositive === undefined
                    ? "var(--ft-muted)"
                    : cell.deltaPositive
                    ? "var(--ft-green)"
                    : "var(--ft-red)",
              }}
            >
              {cell.delta}
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}

// ── PortfolioPositionsTable — Bloomberg equity screen style ───────────────────

interface PortfolioPositionsTableProps {
  investments: Investment[];
  summary: { totalValueGbp: number; totalPlGbp: number; totalPlPercent: number } | null | undefined;
  quoteMap: Map<string, QuoteData>;
  classMap: Record<number, AssetClass>;
  tickerFilter: string;
  onTickerFilterChange: (v: string) => void;
  onDetailOpen: (id: number) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  deleteConfirmId: number | null;
  priceAlerts: PriceAlert[];
  onAlertsChange: (alerts: PriceAlert[]) => void;
  baseCurrency: string;
}

function PortfolioPositionsTable({
  investments,
  summary,
  quoteMap,
  classMap,
  tickerFilter,
  onTickerFilterChange,
  onDetailOpen,
  onEdit,
  onDelete,
  deleteConfirmId,
  priceAlerts,
  onAlertsChange,
  baseCurrency,
}: PortfolioPositionsTableProps) {
  const filtered = investments.filter((inv) => {
    if (!tickerFilter) return true;
    const q = tickerFilter.toLowerCase();
    return inv.ticker.toLowerCase().includes(q) || inv.name.toLowerCase().includes(q);
  });

  const totalValue = summary?.totalValueGbp ?? 0;

  // Column header style
  const CH: React.CSSProperties = {
    padding: "6px 10px",
    fontSize: 10,
    fontWeight: 600,
    color: "var(--ft-muted)",
    background: "var(--ft-surface)",
    borderBottom: "2px solid var(--ft-border2)",
    borderRight: "1px solid var(--ft-border)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
    fontFamily: "var(--font-mono)",
    fontVariantNumeric: "tabular-nums",
  };

  const TD: React.CSSProperties = {
    padding: "var(--ft-cell-py) 10px",
    fontSize: 11,
    fontFamily: "var(--font-mono)",
    fontVariantNumeric: "tabular-nums",
    borderBottom: "1px solid var(--ft-border)",
    borderRight: "1px solid var(--ft-border)",
    whiteSpace: "nowrap",
    overflow: "hidden",
  };

  return (
    <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
      {/* Panel header */}
      <div className="ft-panel-header">
        <div className="ft-panel-label">
          <span className="accent-dot">·</span>
          POSITIONS — LIVE MARKET DATA ({baseCurrency})
        </div>
        <input
          className="ft-filter-input"
          placeholder="Filter ticker / name…"
          value={tickerFilter}
          onChange={(e) => onTickerFilterChange(e.target.value)}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            padding: "3px 8px",
            background: "var(--ft-raised)",
            border: "1px solid var(--ft-border2)",
            color: "var(--ft-text)",
            outline: "none",
            width: 160,
          }}
        />
      </div>

      {/* Table */}
      <div className="ft-scroll-x" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
          <thead>
            <tr>
              <th style={{ ...CH, width: 60, textAlign: "left" }}>TICKER</th>
              <th style={{ ...CH, minWidth: 140, textAlign: "left" }}>NAME</th>
              <th style={{ ...CH, width: 70, textAlign: "right" }}>SHARES</th>
              <th style={{ ...CH, width: 90, textAlign: "right" }}>AVG COST</th>
              <th style={{ ...CH, width: 90, textAlign: "right" }}>CURRENT</th>
              <th style={{ ...CH, width: 100, textAlign: "right" }}>VALUE</th>
              <th style={{ ...CH, width: 110, textAlign: "right" }}>P&amp;L</th>
              <th style={{ ...CH, width: 80, textAlign: "right" }}>P&amp;L %</th>
              <th style={{ ...CH, width: 70, textAlign: "right" }}>WEIGHT</th>
              <th style={{ ...CH, width: 90, textAlign: "right", borderRight: "none" }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  style={{ ...TD, textAlign: "center", color: "var(--ft-dim)", padding: "24px", borderRight: "none" }}
                >
                  {tickerFilter ? `No positions match "${tickerFilter}"` : "No positions yet — add a position to start tracking."}
                </td>
              </tr>
            )}
            {filtered.map((inv, i) => {
              const plColor = inv.plPercent >= 0 ? "var(--ft-green)" : "var(--ft-red)";
              const plSign = inv.plPercent >= 0 ? "▲" : "▼";
              const weight = totalValue > 0 ? (inv.gbpValue / totalValue) * 100 : 0;
              const rowBg = i % 2 === 0 ? "var(--ft-base)" : `color-mix(in srgb, var(--ft-raised) 30%, transparent)`;

              return (
                <tr
                  key={inv.id}
                  className="xls-row"
                  style={{ background: rowBg }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "var(--ft-raised)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = rowBg; }}
                >
                  {/* TICKER — accent color, bold, 12px mono */}
                  <td
                    style={{ ...TD, width: 60, cursor: "pointer" }}
                    onClick={() => onDetailOpen(inv.id)}
                  >
                    <Text as="span" mono size={12} weight={700} color="var(--ft-accent)" letterSpacing="0.04em">{inv.ticker}</Text>
                  </td>

                  {/* NAME */}
                  <td
                    style={{ ...TD, color: "var(--ft-muted)", cursor: "pointer", maxWidth: 200, textOverflow: "ellipsis" }}
                    onClick={() => onDetailOpen(inv.id)}
                    title={inv.name}
                  >
                    {inv.name}
                  </td>

                  {/* SHARES */}
                  <td style={{ ...TD, textAlign: "right", color: "var(--ft-text)" }}>
                    {inv.shares}
                  </td>

                  {/* AVG COST */}
                  <td style={{ ...TD, textAlign: "right", color: "var(--ft-muted)" }}>
                    {inv.costPricePerShare.toFixed(2)}
                    <span style={{ fontSize: 9, color: "var(--ft-dim)", marginLeft: 3 }}>{inv.currency}</span>
                  </td>

                  {/* CURRENT PRICE — flash cell */}
                  <FlashCell
                    value={inv.livePrice}
                    style={{ ...TD, textAlign: "right", color: "var(--ft-text)", fontWeight: 600 }}
                  >
                    {inv.livePrice.toFixed(2)}
                    <span style={{ fontSize: 9, color: "var(--ft-dim)", marginLeft: 3 }}>{inv.currency}</span>
                  </FlashCell>

                  {/* VALUE */}
                  <td style={{ ...TD, textAlign: "right", color: "var(--ft-text)", fontWeight: 600 }} className="pnum">
                    {formatGbp(inv.gbpValue)}
                  </td>

                  {/* P&L — flash cell, colored */}
                  <FlashCell
                    value={inv.plGbp}
                    style={{
                      ...TD,
                      textAlign: "right",
                      color: plColor,
                      fontWeight: 600,
                      background: inv.plPercent >= 0 ? "color-mix(in srgb, var(--ft-green) 5%, transparent)" : "color-mix(in srgb, var(--ft-red) 5%, transparent)",
                    }}
                    className="pnum"
                  >
                    {inv.plGbp >= 0 ? "+" : ""}{formatGbp(inv.plGbp)}
                  </FlashCell>

                  {/* P&L % — directional symbol */}
                  <td style={{ ...TD, textAlign: "right" }}>
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      fontWeight: 700,
                      color: plColor,
                      padding: "1px 4px",
                      background: inv.plPercent >= 0 ? "color-mix(in srgb, var(--ft-green) 12%, transparent)" : "color-mix(in srgb, var(--ft-red) 12%, transparent)",
                    }} className="pnum">
                      {plSign} {Math.abs(inv.plPercent).toFixed(2)}%
                    </span>
                  </td>

                  {/* WEIGHT — inline proportional bar */}
                  <td style={{ ...TD, textAlign: "right" }}>
                    <HStack gap={5} align="center" justify="end">
                      <div style={{ width: 32, height: 3, background: "var(--ft-raised)", flexShrink: 0 }}>
                        <div style={{ width: `${Math.min(100, weight)}%`, height: "100%", background: "var(--ft-accent)", opacity: 0.7 }} />
                      </div>
                      <span style={{ color: "var(--ft-muted)", fontSize: 10, minWidth: 32, textAlign: "right" }}>
                        {weight.toFixed(1)}%
                      </span>
                    </HStack>
                  </td>

                  {/* ACTIONS */}
                  <td style={{ ...TD, borderRight: "none", textAlign: "right", padding: "4px 6px" }}>
                    <HStack gap={2} align="center" justify="end">
                      <PriceAlertPopover
                        ticker={inv.ticker}
                        currentPrice={inv.livePrice}
                        alerts={priceAlerts}
                        onAlertsChange={onAlertsChange}
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(inv.id)}>
                        <Edit2 className="w-3.5 h-3.5" style={{ color: "var(--ft-muted)" }} />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => onDelete(inv.id)}
                        title={deleteConfirmId === inv.id ? "Click again to confirm delete" : "Delete position"}
                        style={deleteConfirmId === inv.id ? { background: "var(--ft-red)", color: "var(--ft-base)" } : undefined}
                      >
                        {deleteConfirmId === inv.id
                          ? <Text as="span" mono size={8} weight={700}>DEL?</Text>
                          : <Trash2 className="w-3.5 h-3.5" style={{ color: "var(--ft-red)" }} />}
                      </Button>
                    </HStack>
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Totals row */}
          {summary && investments.length > 0 && (
            <tfoot>
              <tr style={{ background: "color-mix(in srgb, var(--ft-raised) 40%, transparent)", borderTop: "2px solid var(--ft-border2)" }}>
                <td colSpan={2} style={{ ...TD, fontWeight: 700, color: "var(--ft-dim)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", borderBottom: "none" }}>TOTAL</td>
                <td style={{ ...TD, borderBottom: "none" }} />
                <td style={{ ...TD, borderBottom: "none" }} />
                <td style={{ ...TD, borderBottom: "none" }} />
                <td style={{ ...TD, textAlign: "right", fontWeight: 700, color: "var(--ft-text)", fontSize: 12, borderBottom: "none" }} className="pnum">
                  {formatGbp(summary.totalValueGbp)}
                </td>
                <td style={{ ...TD, textAlign: "right", fontWeight: 700, fontSize: 12, borderBottom: "none", color: summary.totalPlGbp >= 0 ? "var(--ft-green)" : "var(--ft-red)" }} className="pnum">
                  {summary.totalPlGbp >= 0 ? "+" : ""}{formatGbp(summary.totalPlGbp)}
                </td>
                <td style={{ ...TD, textAlign: "right", fontWeight: 700, fontSize: 11, borderBottom: "none", color: summary.totalPlPercent >= 0 ? "var(--ft-green)" : "var(--ft-red)" }} className="pnum">
                  {summary.totalPlPercent >= 0 ? "▲" : "▼"} {Math.abs(summary.totalPlPercent).toFixed(2)}%
                </td>
                <td style={{ ...TD, borderBottom: "none" }} />
                <td style={{ ...TD, borderBottom: "none", borderRight: "none" }} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Investments({ defaultTab }: { defaultTab?: TabId } = {}) {
  const { data: investments, isLoading, isError, error } = useListInvestments();
  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError } = useGetInvestmentSummary();
  const createInv = useCreateInvestment();
  const updateInv = useUpdateInvestment();
  const deleteInv = useDeleteInvestment();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<TabId>(defaultTab ?? "markets");
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [form, setForm] = useState<InvForm>(makeEmptyInvForm);
  const [submitting, setSubmitting] = useState(false);
  const [classMap, setClassMap] = useState<Record<number, AssetClass>>(() => readClassMap());
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>(() => readAlerts());
  const [triggeredAlerts, setTriggeredAlerts] = useState<PriceAlert[]>([]);
  const [alertsBannerDismissed, setAlertsBannerDismissed] = useState(false);
  const [histPeriod, setHistPeriod] = useState<"3m" | "6m" | "1y" | "all">("all");
  const [tickerFilter, setTickerFilter] = useState("");
  const [portfolioIntroSeen, setPortfolioIntroSeen] = useState(() => !!localStorage.getItem("ft-portfolio-intro-seen"));
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => { writeClassMap(classMap); }, [classMap]);

  const hasInvestments = (investments?.length ?? 0) > 0;
  const { data: spyHistory } = useGetMarketHistory(
    { ticker: "SPY", period: "1y" },
    { query: { enabled: hasInvestments, staleTime: 1000 * 60 * 60 } }
  );

  const tickers = [...new Set(investments?.map((i) => i.ticker) ?? [])].join(",");
  const { data: quotes } = useGetMarketQuotes(
    { tickers }, { query: { enabled: !!tickers, queryKey: getGetMarketQuotesQueryKey({ tickers }), refetchInterval: 60_000 } }
  );
  const quoteMap = new Map<string, QuoteData>(quotes?.map((q) => [q.ticker, q as QuoteData]) ?? []);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListInvestmentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetInvestmentSummaryQueryKey() });
  };

  const openAdd = () => { setForm(makeEmptyInvForm()); setAddOpen(true); };
  const openEdit = (id: number) => {
    const inv = investments?.find((i) => i.id === id);
    if (!inv) return;
    const exchInfo = detectExchange(inv.ticker);
    setForm({
      ...makeEmptyInvForm(),
      ticker: inv.ticker, name: inv.name, buyDate: inv.buyDate,
      shares: String(inv.shares), costPricePerShare: String(inv.costPricePerShare),
      nativeCurrency: exchInfo?.currency ?? "USD",
      assetClass: classMap[id] ?? "",
    });
    setEditId(id);
  };

  const getSubmitData = () => {
    const ticker = form.ticker.toUpperCase();
    const name = form.name;
    const buyDate = form.buyDate;
    const fees = parseFloat(form.fees || "0") || 0;
    if (form.inputMode === "totalCost") {
      const totalShares = parseFloat(form.totalShares) || 0;
      const totalCost = parseFloat(form.totalCost) || 0;
      const costPricePerShare = totalShares > 0 ? (totalCost + fees) / totalShares : 0;
      return { ticker, name, buyDate, shares: totalShares, costPricePerShare };
    }
    const shares = parseFloat(form.shares) || 0;
    const costPricePerShare = parseFloat(form.costPricePerShare) || 0;
    return { ticker, name, buyDate, shares, costPricePerShare: costPricePerShare + (shares > 0 ? fees / shares : 0) };
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    try {
      const data = getSubmitData();
      const result = await createInv.mutateAsync({ data });
      const detectedClass = (form.assetClass as AssetClass) || detectAssetClass(form.ticker);
      if (result && typeof (result as { id?: number }).id === "number") {
        setClassMap((p) => ({ ...p, [(result as { id: number }).id]: detectedClass }));
      }
      invalidate(); setAddOpen(false); toast({ title: "Position added" });
    } catch { toast({ title: "Failed to add position", variant: "destructive" }); }
    finally { setSubmitting(false); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (editId === null) return; setSubmitting(true);
    try {
      const data = getSubmitData();
      await updateInv.mutateAsync({ id: editId, data });
      if (form.assetClass) setClassMap((p) => ({ ...p, [editId]: form.assetClass as AssetClass }));
      invalidate(); setEditId(null); toast({ title: "Position updated" });
    } catch { toast({ title: "Failed to update", variant: "destructive" }); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
      return;
    }
    setDeleteConfirmId(null);
    try { await deleteInv.mutateAsync({ id }); invalidate(); toast({ title: "Position deleted" }); }
    catch { toast({ title: "Failed to delete", variant: "destructive" }); }
  };

  const setField = <K extends keyof InvForm>(k: K, v: InvForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const handleTickerChange = (raw: string) => {
    const t = raw.toUpperCase();
    const exchInfo = detectExchange(t);
    const autoClass = t.length >= 2 ? detectAssetClass(t) : "";
    setForm((f) => ({
      ...f,
      ticker: t,
      nativeCurrency: exchInfo?.currency ?? f.nativeCurrency,
      assetClass: f.assetClass || autoClass,
    }));
  };

  const effectiveCostPerShare = (() => {
    const fees = parseFloat(form.fees || "0") || 0;
    if (form.inputMode === "totalCost") {
      const sh = parseFloat(form.totalShares) || 0;
      const tc = parseFloat(form.totalCost) || 0;
      return sh > 0 ? (tc + fees) / sh : null;
    }
    const sh = parseFloat(form.shares) || 0;
    const cpp = parseFloat(form.costPricePerShare) || 0;
    return sh > 0 ? cpp + fees / sh : null;
  })();

  // ── Portfolio snapshot history (localStorage) — must be above early return ──
  const SNAPSHOT_KEY = "ft-portfolio-snapshots";
  useEffect(() => {
    const totalVal = summary?.totalValueGbp;
    const hasPosNow = (investments?.length ?? 0) > 0;
    if (totalVal != null && hasPosNow && totalVal > 0) {
      const todayStr = new Date().toISOString().slice(0, 10);
      try {
        const existing: Record<string, number> = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? "{}");
        existing[todayStr] = Math.round(totalVal * 100) / 100;
        const sorted = Object.entries(existing).sort(([a], [b]) => a.localeCompare(b)).slice(-90);
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(Object.fromEntries(sorted)));
      } catch { /* noop */ }
    }
  }, [summary?.totalValueGbp, investments?.length]);

  // ── Check alerts on load (once investments & quotes are available) ──
  useEffect(() => {
    if (!investments || investments.length === 0) return;
    const alerts = readAlerts();
    const nowTriggered: PriceAlert[] = [];
    const updated = alerts.map((alert) => {
      if (alert.triggered) return alert;
      const inv = investments.find((i) => i.ticker === alert.ticker);
      if (!inv) return alert;
      const q = quoteMap.get(alert.ticker);
      const fired = alertTriggered(alert, inv.livePrice, q?.changePercent, q?.pe);
      if (fired) {
        nowTriggered.push({ ...alert, triggered: true });
        return { ...alert, triggered: true };
      }
      return alert;
    });
    if (nowTriggered.length > 0) {
      writeAlerts(updated);
      setPriceAlerts(updated);
      setTriggeredAlerts(nowTriggered);
      setAlertsBannerDismissed(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investments]);

  const portfolioHistory = (() => {
    try {
      const raw = localStorage.getItem(SNAPSHOT_KEY);
      if (!raw) return [];
      const obj: Record<string, number> = JSON.parse(raw);
      return Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
    } catch { return []; }
  })();

  const benchmarkChartData = useMemo(() => {
    if (portfolioHistory.length === 0) return [];
    const cutoff = new Date();
    if (histPeriod === "3m") cutoff.setMonth(cutoff.getMonth() - 3);
    else if (histPeriod === "6m") cutoff.setMonth(cutoff.getMonth() - 6);
    else if (histPeriod === "1y") cutoff.setFullYear(cutoff.getFullYear() - 1);
    else cutoff.setFullYear(2000);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const filtered = portfolioHistory.filter((p) => p.date >= cutoffStr);
    if (filtered.length === 0) return [];
    const basePortfolio = filtered[0].value;
    const spyMap = new Map<string, number>();
    (spyHistory ?? []).forEach((p: StockHistoryPoint) => spyMap.set(p.date, p.close));
    let baseSpy = 0;
    for (const p of filtered) {
      const s = spyMap.get(p.date);
      if (s) { baseSpy = s; break; }
    }
    return filtered.map((p) => {
      const spyClose = spyMap.get(p.date);
      return {
        date: p.date,
        portfolio: Math.round((p.value / basePortfolio) * 10000) / 100,
        spy: baseSpy > 0 && spyClose ? Math.round((spyClose / baseSpy) * 10000) / 100 : undefined as number | undefined,
      };
    });
  }, [portfolioHistory, spyHistory, histPeriod]);

  const riskMetrics = useMemo(() => {
    if (portfolioHistory.length < 10) return null;
    const returns = portfolioHistory.slice(1).map((p, i) => (p.value - portfolioHistory[i].value) / portfolioHistory[i].value);
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
    const vol = Math.sqrt(variance * 252) * 100;
    let peak = portfolioHistory[0].value;
    let maxDD = 0;
    portfolioHistory.forEach((p) => {
      if (p.value > peak) peak = p.value;
      const dd = (p.value - peak) / peak;
      if (dd < maxDD) maxDD = dd;
    });
    const first = portfolioHistory[0];
    const last = portfolioHistory[portfolioHistory.length - 1];
    const years = (new Date(last.date).getTime() - new Date(first.date).getTime()) / (365.25 * 24 * 3600 * 1000);
    const cagr = years > 0.08 ? (Math.pow(last.value / first.value, 1 / years) - 1) * 100 : null;
    const annReturn = returns.reduce((s, r) => s + r, 0) * (252 / returns.length) * 100;
    const sharpe = vol > 0 ? (annReturn - 5) / vol : null;
    return { vol, maxDD: maxDD * 100, cagr, sharpe };
  }, [portfolioHistory]);

  const upcomingEarnings = useMemo(() => {
    const today = new Date();
    const cutoff = new Date(today.getTime() + 45 * 24 * 3600 * 1000);
    return (investments ?? [])
      .flatMap((inv) => {
        const q = quoteMap.get(inv.ticker);
        if (!q?.nextEarningsDate) return [];
        const d = new Date(q.nextEarningsDate);
        if (d <= today || d > cutoff) return [];
        const daysUntil = Math.ceil((d.getTime() - today.getTime()) / (24 * 3600 * 1000));
        return [{ ticker: inv.ticker, name: inv.name, date: q.nextEarningsDate, daysUntil }];
      })
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [investments, quoteMap]);

  if (isLoading || isSummaryLoading) {
    return <div className="space-y-4"><Skeleton className="h-6 w-48" /><Skeleton className="h-8 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  const INP: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 12 };

  const FormFields = (
    <div className="space-y-4">
      {/* Row 1: Ticker + Date */}
      <div className="ft-two-col grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="inv-ticker">Ticker Symbol</Label>
          <Input id="inv-ticker" placeholder="e.g. VOO or 0700.HK" style={INP}
            value={form.ticker} onChange={(e) => handleTickerChange(e.target.value)} required />
          {form.ticker && (() => {
            const ex = detectExchange(form.ticker);
            return ex ? (
              <Text as="div" mono size={10} color="var(--ft-muted)">
                {ex.label} · {ex.currency}
              </Text>
            ) : (
              <Text as="div" mono size={10} color="var(--ft-muted)">
                US market · {form.nativeCurrency}
              </Text>
            );
          })()}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-date">Buy Date</Label>
          <Input id="inv-date" type="date" value={form.buyDate} onChange={(e) => setField("buyDate", e.target.value)} required />
        </div>
      </div>

      {/* Company name */}
      <div className="space-y-1.5">
        <Label htmlFor="inv-name">Company / Fund Name</Label>
        <Input id="inv-name" placeholder="e.g. Vanguard S&P 500 ETF" value={form.name} onChange={(e) => setField("name", e.target.value)} required />
      </div>

      {/* Asset class */}
      <div className="space-y-1.5">
        <Label>Asset Class</Label>
        <Select value={form.assetClass || (form.ticker ? detectAssetClass(form.ticker) : "Stock")}
          onValueChange={(v) => setField("assetClass", v as AssetClass)}>
          <SelectTrigger style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASSET_CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        {form.ticker && !form.assetClass && (
          <Text as="div" mono size={10} color="var(--ft-blue)">
            Auto-detected: {detectAssetClass(form.ticker)}
          </Text>
        )}
      </div>

      {/* Input mode toggle */}
      <div className="space-y-1.5">
        <Label>Input Method</Label>
        <div style={{ display: "flex", gap: 0, border: "1px solid var(--ft-border2)", borderRadius: 2, overflow: "hidden" }}>
          {(["perShare", "totalCost"] as InputMode[]).map((mode) => (
            <button key={mode} type="button"
              onClick={() => setField("inputMode", mode)}
              style={{
                flex: 1, padding: "6px 10px", fontSize: 10, fontWeight: 600,
                fontFamily: "var(--font-mono)", letterSpacing: "0.06em",
                border: "none", cursor: "pointer", transition: "background 0.1s",
                background: form.inputMode === mode ? "var(--ft-accent)" : "var(--ft-raised)",
                color: form.inputMode === mode ? "var(--ft-base)" : "var(--ft-muted)",
              }}
            >
              {mode === "perShare" ? "Per Share" : "Total Cost"}
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic price inputs */}
      {form.inputMode === "perShare" ? (
        <div className="ft-two-col grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="inv-shares">Number of Shares</Label>
            <Input id="inv-shares" type="number" step="0.0001" min="0" placeholder="10" style={INP}
              value={form.shares} onChange={(e) => setField("shares", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-cost">Cost per Share ({form.nativeCurrency})</Label>
            <Input id="inv-cost" type="number" step="0.0001" min="0" placeholder="420.50" style={INP}
              value={form.costPricePerShare} onChange={(e) => setField("costPricePerShare", e.target.value)} required />
          </div>
        </div>
      ) : (
        <div className="ft-two-col grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="inv-total-shares">Number of Shares</Label>
            <Input id="inv-total-shares" type="number" step="0.0001" min="0" placeholder="10" style={INP}
              value={form.totalShares} onChange={(e) => setField("totalShares", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-total-cost">Total Amount Paid ({form.nativeCurrency})</Label>
            <Input id="inv-total-cost" type="number" step="0.01" min="0" placeholder="4205.00" style={INP}
              value={form.totalCost} onChange={(e) => setField("totalCost", e.target.value)} required />
          </div>
        </div>
      )}

      {/* Transaction fees */}
      <div className="space-y-1.5">
        <Label htmlFor="inv-fees">Transaction Fees ({form.nativeCurrency}) <Text as="span" weight={400} color="var(--ft-muted)">— optional</Text></Label>
        <Input id="inv-fees" type="number" step="0.01" min="0" placeholder="0.00" style={INP}
          value={form.fees} onChange={(e) => setField("fees", e.target.value)} />
      </div>

      {/* Effective cost summary */}
      {effectiveCostPerShare !== null && effectiveCostPerShare > 0 && (
        <div style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <MonoLabel as="span" size={10} color="var(--ft-muted)" letterSpacing="0.06em">Effective Cost / Share</MonoLabel>
          <Text as="span" mono size={13} weight={700} color="var(--ft-accent)">
            {effectiveCostPerShare.toFixed(4)} {form.nativeCurrency}
          </Text>
        </div>
      )}
    </div>
  );

  const hasPositions = (investments?.length ?? 0) > 0;

  // ── Chart data ──
  const pieData = (investments ?? []).map((inv, i) => ({ name: inv.ticker, value: Math.round(inv.gbpValue * 100) / 100, color: CHART_COLORS[i % CHART_COLORS.length] }));
  const classAllocMap: Record<string, number> = {};
  (investments ?? []).forEach((inv) => { const cls = classMap[inv.id] ?? "Other"; classAllocMap[cls] = (classAllocMap[cls] ?? 0) + inv.gbpValue; });
  const classAllocData = Object.entries(classAllocMap).filter(([, v]) => v > 0).map(([name, value]) => ({ name: name as AssetClass, value: Math.round(value * 100) / 100 }));
  const totalClassValue = classAllocData.reduce((s, d) => s + d.value, 0);
  const plData = (investments ?? []).map((inv) => ({ name: inv.ticker, pl: Math.round(inv.plGbp * 100) / 100, fill: inv.plPercent >= 0 ? "var(--ft-green)" : "var(--ft-red)" }));

  const dividendPositions = (investments ?? []).filter((inv) => (quoteMap.get(inv.ticker)?.dividendYield ?? 0) > 0);
  const totalAnnualDividend = dividendPositions.reduce((s, inv) => { const q = quoteMap.get(inv.ticker); return q?.dividendYield ? s + (q.dividendYield / 100) * q.price * inv.shares : s; }, 0);

  // ── Portfolio Analytics ──
  const portBeta = (() => {
    if (!summary || summary.totalValueGbp <= 0) return null;
    let wb = 0, covered = 0;
    (investments ?? []).forEach((inv) => { const q = quoteMap.get(inv.ticker); if (q?.beta != null) { wb += (inv.gbpValue / summary.totalValueGbp) * q.beta; covered += inv.gbpValue; } });
    return covered > 0 ? wb : null;
  })();

  const largestPos = summary && summary.totalValueGbp > 0
    ? (investments ?? []).reduce<{ ticker: string; pct: number } | null>((best, inv) => {
        const pct = (inv.gbpValue / summary.totalValueGbp) * 100;
        return !best || pct > best.pct ? { ticker: inv.ticker, pct } : best;
      }, null) : null;

  const numAssetClasses = classAllocData.length;

  // ── KPI bar data ──
  const kpiCells: KpiCell[] = summary ? [
    {
      label: "PORTFOLIO VALUE",
      value: formatGbp(summary.totalValueGbp),
      delta: investments && investments.length > 0 ? `${investments.length} position${investments.length !== 1 ? "s" : ""}` : undefined,
      deltaPositive: null,
    },
    {
      label: "TOTAL P&L",
      value: `${summary.totalPlGbp >= 0 ? "+" : ""}${formatGbp(summary.totalPlGbp)}`,
      delta: `${summary.totalPlPercent >= 0 ? "▲" : "▼"} ${Math.abs(summary.totalPlPercent).toFixed(2)}%`,
      deltaPositive: summary.totalPlGbp >= 0,
    },
    {
      label: "PORTFOLIO BETA",
      value: portBeta != null ? portBeta.toFixed(2) : "—",
      delta: portBeta != null ? (portBeta > 1.3 ? "AGGRESSIVE" : portBeta < 0.7 ? "DEFENSIVE" : "MARKET") : undefined,
      deltaPositive: portBeta != null ? portBeta <= 1.3 : null,
    },
    {
      label: "ASSET CLASSES",
      value: String(numAssetClasses),
      delta: numAssetClasses <= 1 ? "UNDER-DIVERSIFIED" : "DIVERSIFIED",
      deltaPositive: numAssetClasses > 1,
    },
    {
      label: "EST. ANNUAL DIV",
      value: formatGbp(totalAnnualDividend),
      delta: dividendPositions.length > 0 ? `${dividendPositions.length} paying` : "no yield",
      deltaPositive: totalAnnualDividend > 0 ? true : null,
    },
    {
      label: "LARGEST POSITION",
      value: largestPos ? `${largestPos.pct.toFixed(1)}%` : "—",
      delta: largestPos ? largestPos.ticker : undefined,
      deltaPositive: largestPos ? largestPos.pct <= 30 : null,
    },
  ] : [
    { label: "PORTFOLIO VALUE", value: "—" },
    { label: "TOTAL P&L", value: "—" },
    { label: "PORTFOLIO BETA", value: "—" },
    { label: "ASSET CLASSES", value: "—" },
    { label: "EST. ANNUAL DIV", value: "—" },
    { label: "LARGEST POSITION", value: "—" },
  ];

  return (
    <VStack gap="var(--ft-row-gap)">
      {/* KPI Bar — replaces PageHeader on this data page */}
      <div>
        <div style={{ position: "relative" }}>
          <InvKpiBar cells={kpiCells} style={isMobile ? undefined : { paddingRight: 220 }} />
          <Button
            onClick={openAdd}
            size="sm"
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              background: "var(--ft-accent)",
              color: "var(--ft-base)",
              border: "none",
              borderRadius: 0,
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: "0 16px",
            }}
            className="inv-add-btn-desktop"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />ADD POSITION
          </Button>
        </div>
        <div className="inv-add-btn-mobile" style={{ display: "none" }}>
          <Button
            onClick={openAdd}
            size="sm"
            style={{
              width: "100%",
              background: "var(--ft-accent)",
              color: "var(--ft-base)",
              border: "none",
              borderRadius: 0,
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              letterSpacing: "0.06em",
            }}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />ADD POSITION
          </Button>
        </div>
      </div>

      {/* Persona context strip */}
      {(() => {
        const pid = loadPersonaIds()[0];
        if (!pid) return null;
        const msgs: Record<string, string | null> = {
          market: "Market Terminal active — live prices, P&L tracking, and price alerts across all your positions.",
          wealth: "Portfolio growth is the core asset in Wealth Architect — track performance and rebalance toward your FIRE target.",
          budget: "Long-term investments tracked here — your monthly budget surplus feeds directly into this portfolio.",
          social: "Individual investments tracked here — for group fund contributions or shared investment pools, use Group Expenses.",
          full: null,
        };
        const msg = msgs[pid];
        if (!msg) return null;
        const color = PERSONA_COLORS[pid as keyof typeof PERSONA_COLORS] ?? "var(--ft-accent)";
        return (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", border: "1px solid var(--ft-border)", borderLeft: `3px solid ${color}`, background: "var(--ft-surface)", padding: "7px 14px 7px 10px", marginBottom: 4, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color, fontWeight: 700, flexShrink: 0 }}>·</span>
            <span>{msg}</span>
          </div>
        );
      })()}

      {(isError || isSummaryError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load investments</AlertTitle>
          <AlertDescription>{(error as Error)?.message ?? "Could not reach the server."}</AlertDescription>
        </Alert>
      )}

      {/* ── Triggered alerts banner ── */}
      {triggeredAlerts.length > 0 && !alertsBannerDismissed && (
        <div style={{
          background: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.35)",
          padding: "10px 14px",
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}>
          <Bell style={{ width: 14, height: 14, color: "var(--ft-amber)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-amber)", letterSpacing: "0.08em", marginBottom: 5 }}>
              PRICE ALERTS TRIGGERED
            </div>
            <VStack gap={3}>
              {triggeredAlerts.map((a) => {
                const inv = investments?.find((i) => i.ticker === a.ticker);
                return (
                  <div key={a.id} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>
                    <Text as="span" weight={700} color="var(--ft-amber)">{a.ticker}</Text>
                    {" "}crossed {a.direction === "above" ? "above" : "below"}{" "}
                    <Text as="span" weight={700}>£{a.targetPrice.toFixed(2)}</Text>
                    {inv && (
                      <Text as="span" color="var(--ft-dim)"> · current: £{inv.livePrice.toFixed(2)}</Text>
                    )}
                  </div>
                );
              })}
            </VStack>
          </div>
          <button
            onClick={() => setAlertsBannerDismissed(true)}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--ft-dim)", padding: "0 2px" }}
          >
            <X style={{ width: 13, height: 13 }} />
          </button>
        </div>
      )}

      {/* Terminal tab bar — 1px border bottom, active tab uses --ft-accent underline */}
      {defaultTab !== "markets" && (
        <div style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid var(--ft-border)",
          background: "var(--ft-surface)",
          overflowX: "auto",
          scrollbarWidth: "none" as const,
          WebkitOverflowScrolling: "touch" as const,
        }}>
          {TABS.filter((t) => t.id !== "markets").map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "0 16px",
                  height: "var(--ft-panel-header-h)",
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.08em",
                  border: "none",
                  borderRight: "1px solid var(--ft-border)",
                  cursor: "pointer",
                  background: isActive ? "var(--ft-raised)" : "transparent",
                  color: isActive ? "var(--ft-accent)" : "var(--ft-dim)",
                  borderBottom: isActive ? "2px solid var(--ft-accent)" : "2px solid transparent",
                  transition: "color 0.1s",
                  textTransform: "uppercase" as const,
                }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "var(--ft-muted)"; }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "var(--ft-dim)"; }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Add / Edit dialogs */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Investment Position</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd}>{FormFields}
            <DialogFooter className="mt-6">
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" disabled={submitting}>{submitting ? "Adding…" : "Add Position"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={editId !== null} onOpenChange={(o) => !o && setEditId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Investment Position</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit}>{FormFields}
            <DialogFooter className="mt-6">
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save Changes"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <PositionDetailModal invId={detailId} onClose={() => setDetailId(null)} investments={investments} quoteMap={quoteMap} classMap={classMap} onClassChange={(id, cls) => setClassMap((p) => ({ ...p, [id]: cls }))} />

      {/* ─── PORTFOLIO TAB ─── */}
      {defaultTab !== "markets" && activeTab === "portfolio" && (
        <VStack gap="var(--ft-row-gap)">
          {/* Persona quick-start for Market Terminal users */}
          {(() => { const ids = loadPersonaIds(); return ids[0] === "market"; })() && <PersonaQuickStart />}

          {/* Empty state — no positions yet */}
          {!hasPositions && !isLoading && (
            <div style={{
              background: "var(--ft-raised)",
              border: "1px dashed var(--ft-border2)",
              padding: 40,
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}>
              <pre style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-border2)", lineHeight: 1.55, marginBottom: 20, userSelect: "none", whiteSpace: "pre" }}>{
`  ┌─────────────────────────────────────────────────────┐
  │  PORTFOLIO TERMINAL                                 │
  │                                                     │
  │  TICKER  SHARES   COST     LIVE    VALUE    GAIN   │
  │  ─────────────────────────────────────────────────  │
  │                                                     │
  │           [ no positions loaded ]                   │
  │                                                     │
  │  Total  £ 0.00  ─────────  vs S&P 500  ± 0.00%   │
  └─────────────────────────────────────────────────────┘`}</pre>
              <div style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--ft-text)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}>
                NO POSITIONS
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", marginBottom: 28, maxWidth: 460, lineHeight: 1.7 }}>
                Add a stock, ETF, crypto, or bond to start tracking live P&amp;L, allocation breakdowns, benchmark comparisons, and AI-driven portfolio decisions.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 40px", marginBottom: 28, maxWidth: 500, width: "100%", textAlign: "left" }}>
                {[
                  ["▲", "Live prices via Yahoo Finance"],
                  ["◈", "Portfolio vs S&P 500 benchmark"],
                  ["◆", "Asset allocation heat map"],
                  ["⬡", "Dividend tracker + earnings calendar"],
                  ["●", "Concentration risk + rebalancer"],
                  ["◎", "AI-powered portfolio decisions"],
                ].map(([glyph, text]) => (
                  <div key={text} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                    <span style={{ color: "var(--ft-accent)", flexShrink: 0, fontWeight: 700 }}>{glyph}</span>
                    {text}
                  </div>
                ))}
              </div>
              <button
                onClick={openAdd}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  padding: "8px 24px",
                  background: "var(--ft-accent)",
                  color: "var(--ft-base)",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  transition: "opacity 0.1s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.85"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
              >
                <Plus size={13} />ADD POSITION
              </button>
              <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", opacity: 0.6 }}>
                US &amp; UK stocks · ETFs · crypto · bonds · mutual funds
              </div>
            </div>
          )}

          {/* First-time portfolio tip */}
          {hasPositions && !portfolioIntroSeen && (
            <div style={{ border: "1px solid rgba(210,153,34,0.35)", background: "rgba(210,153,34,0.04)", padding: "11px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-amber)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 7 }}>◈ Portfolio — Reading the data</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 20px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", lineHeight: 1.65 }}>
                  <span><Text as="span" weight={600} color="var(--ft-blue)">vs S&P 500</Text> chart shows your portfolio indexed to 100 — <Text as="span" weight={600}>α (alpha)</Text> is your outperformance</span>
                  <span><Text as="span" weight={600} color="var(--ft-blue)">Heat map</Text> tile size = portfolio weight · colour = P&amp;L (green up / red down)</span>
                  <span><Text as="span" weight={600} color="var(--ft-blue)">Asset class column</Text> in the table — click to assign ETF / equity / bond / etc. for allocation analysis</span>
                  <span><Text as="span" weight={600} color="var(--ft-blue)">Concentration risk</Text> &amp; diversification gaps → check the <Text as="span" color="var(--ft-accent)">Decisions page</Text> for ranked actions</span>
                </div>
              </div>
              <button onClick={() => { localStorage.setItem("ft-portfolio-intro-seen","1"); setPortfolioIntroSeen(true); }} title="Dismiss" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", background: "transparent", border: "none", cursor: "pointer", padding: "0 4px", flexShrink: 0, lineHeight: 1 }}>✕</button>
            </div>
          )}

          {/* Portfolio value history + benchmark comparison */}
          {hasPositions && portfolioHistory.length >= 1 && (() => {
            const last = benchmarkChartData[benchmarkChartData.length - 1];
            const portReturn = last ? last.portfolio - 100 : 0;
            const spyReturn = last?.spy != null ? last.spy - 100 : null;
            const alpha = spyReturn !== null ? portReturn - spyReturn : null;
            const portColor = portReturn >= 0 ? "var(--ft-green)" : "var(--ft-red)";
            const PERIODS = ["3m", "6m", "1y", "all"] as const;
            return (
              <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
                {/* Header */}
                <div className="ft-panel-header">
                  <HStack gap={12} align="center">
                    <div className="ft-panel-label">
                      <span className="accent-dot">·</span>PORTFOLIO vs S&P 500 — INDEXED (100 = START)
                    </div>
                    {/* Return badges */}
                    {benchmarkChartData.length >= 2 && (
                      <HStack gap={8}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: portColor }}>
                          Portfolio {portReturn >= 0 ? "▲" : "▼"} {Math.abs(portReturn).toFixed(1)}%
                        </span>
                        {spyReturn !== null && (
                          <Text as="span" mono size={10} color="var(--ft-dim)">
                            SPY {spyReturn >= 0 ? "▲" : "▼"} {Math.abs(spyReturn).toFixed(1)}%
                          </Text>
                        )}
                        {alpha !== null && (
                          <Text as="span" mono size={10} weight={700} color={alpha >= 0 ? "var(--ft-green)" : "var(--ft-red)"}>
                            α {alpha >= 0 ? "+" : ""}{alpha.toFixed(1)}pp
                          </Text>
                        )}
                      </HStack>
                    )}
                  </HStack>
                  {/* Period selector */}
                  <HStack gap={2}>
                    {PERIODS.map((p) => (
                      <button key={p} onClick={() => setHistPeriod(p)} style={{
                        fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, padding: "2px 7px",
                        border: "1px solid", letterSpacing: "0.06em", cursor: "pointer",
                        borderColor: histPeriod === p ? "var(--ft-blue)" : "var(--ft-border)",
                        background: histPeriod === p ? "rgba(96,165,250,0.15)" : "transparent",
                        color: histPeriod === p ? "var(--ft-blue)" : "var(--ft-dim)",
                        transition: "background 0.1s, color 0.1s, border-color 0.1s",
                      }}>{p.toUpperCase()}</button>
                    ))}
                  </HStack>
                </div>
                {benchmarkChartData.length < 2 ? (
                  <div style={{ padding: "20px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>
                    Collecting snapshots… check back tomorrow for a chart ({portfolioHistory.length} snapshot{portfolioHistory.length !== 1 ? "s" : ""} so far)
                  </div>
                ) : (
                  <div style={{ padding: "12px 12px 4px" }}>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={benchmarkChartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="2 4" stroke="var(--ft-raised)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} tickFormatter={(d: string) => d.slice(5)} interval="preserveStartEnd" />
                        <YAxis tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} tickFormatter={(v: number) => `${v.toFixed(0)}`} width={36} domain={["auto", "auto"]} />
                        <ReferenceLine y={100} stroke="var(--ft-border2)" strokeDasharray="3 3" />
                        <Tooltip
                          contentStyle={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", fontFamily: "var(--font-mono)", fontSize: 10 }}
                          formatter={(v: number, name: string) => [`${v.toFixed(2)}`, name === "portfolio" ? "Portfolio" : "S&P 500 (SPY)"]}
                          labelFormatter={(l: string) => l}
                        />
                        <Line type="monotone" dataKey="portfolio" stroke="var(--ft-blue)" strokeWidth={2} dot={false} activeDot={{ r: 3 }} name="portfolio" />
                        <Line type="monotone" dataKey="spy" stroke="var(--ft-dim)" strokeWidth={1} strokeDasharray="4 2" dot={false} activeDot={{ r: 2 }} name="spy" connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                    <div style={{ display: "flex", gap: 16, paddingTop: 4, paddingLeft: 4 }}>
                      <HStack gap={5} align="center">
                        <div style={{ width: 16, height: 2, background: "var(--ft-blue)" }} />
                        <Text as="span" mono size={9} color="var(--ft-dim)">YOUR PORTFOLIO</Text>
                      </HStack>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ width: 16, height: 2, background: "var(--ft-dim)", opacity: 0.6 }} />
                        <Text as="span" mono size={9} color="var(--ft-dim)">S&P 500 (SPY)</Text>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Charts */}
          {hasPositions && (
            <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--ft-row-gap)" }}>
              <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
                <div className="ft-panel-header">
                  <div className="ft-panel-label"><span className="accent-dot">·</span>PORTFOLIO ALLOCATION</div>
                  <Text as="span" mono size={9} color="var(--ft-dim)">by position value</Text>
                </div>
                <div style={{ padding: "8px 12px 0" }}>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={44} outerRadius={70} paddingAngle={2} dataKey="value" isAnimationActive={false}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [formatGbp(v), "Value"]} contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", fontSize: 11 }} wrapperStyle={{ zIndex: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                  {pieData.map((d, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--ft-muted)" }}>
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                      {d.name}
                      {summary && summary.totalValueGbp > 0 && <span style={{ color: "var(--ft-dim)" }}>{((d.value / summary.totalValueGbp) * 100).toFixed(1)}%</span>}
                    </div>
                  ))}
                </div>
              </div>
              </div>
              <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
                <div className="ft-panel-header">
                  <div className="ft-panel-label"><span className="accent-dot">·</span>UNREALISED P&amp;L</div>
                  <Text as="span" mono size={9} color="var(--ft-dim)">GBP gain / loss</Text>
                </div>
                <div style={{ padding: "8px 12px" }}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={plData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fill: "var(--ft-dim)", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "var(--ft-dim)", fontSize: 10, className: "pnum" }} axisLine={false} tickLine={false} tickFormatter={(v) => `£${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}`} />
                    <Tooltip formatter={(v: number) => [formatGbp(v), "P&L"]} contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", fontSize: 11 }} />
                    <Bar dataKey="pl" radius={[2, 2, 0, 0]} maxBarSize={40}>{plData.map((e, i) => <Cell key={i} fill={e.fill} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Heat map: positions sized by weight, colored by P&L */}
          {hasPositions && (investments?.length ?? 0) >= 2 && summary && summary.totalValueGbp > 0 && (
            <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
              <div className="ft-panel-header">
                <div className="ft-panel-label"><span className="accent-dot">·</span>PORTFOLIO HEAT MAP</div>
                <Text as="span" mono size={9} color="var(--ft-dim)">Size = weight · Colour = P&L</Text>
              </div>
              <div style={{ padding: 8 }}>
                <HStack gap={3} wrap>
                  {(investments ?? [])
                    .slice()
                    .sort((a, b) => b.gbpValue - a.gbpValue)
                    .map((inv) => {
                      const weight = summary.totalValueGbp > 0 ? (inv.gbpValue / summary.totalValueGbp) * 100 : 0;
                      const pct = inv.plPercent;
                      const bg = pct > 15 ? "rgba(63,185,80,0.85)" : pct > 7 ? "rgba(63,185,80,0.55)" : pct > 2 ? "rgba(63,185,80,0.3)" : pct > -2 ? "rgba(180,180,180,0.18)" : pct > -7 ? "rgba(248,81,73,0.3)" : pct > -15 ? "rgba(248,81,73,0.55)" : "rgba(248,81,73,0.85)";
                      const textColor = Math.abs(pct) > 7 ? "rgba(255,255,255,0.95)" : "var(--ft-text)";
                      const minW = Math.max(44, weight * 3.2);
                      return (
                        <button
                          key={inv.id}
                          onClick={() => setDetailId(inv.id)}
                          title={`${inv.ticker} · ${weight.toFixed(1)}% · ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}
                          style={{
                            flexGrow: weight, flexBasis: `${minW}px`, minWidth: minW, height: 60,
                            background: bg, border: "1px solid var(--ft-border)",
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", padding: "2px 4px",
                            transition: "filter 0.1s",
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.15)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = ""; }}
                        >
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: textColor, lineHeight: 1 }}>{inv.ticker}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: textColor, opacity: 0.85, marginTop: 2 }}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: textColor, opacity: 0.6 }}>{weight.toFixed(1)}w</div>
                        </button>
                      );
                    })}
                </HStack>
              </div>
            </div>
          )}

          {/* Asset class allocation */}
          {hasPositions && classAllocData.length > 0 && (
            <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
              <div className="ft-panel-header">
                <div className="ft-panel-label"><span className="accent-dot">·</span>ASSET CLASS ALLOCATION</div>
                <Text as="span" mono size={9} color="var(--ft-dim)">By class tag · stored locally</Text>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center" style={{ padding: "8px 12px" }}>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={classAllocData} cx="50%" cy="50%" innerRadius={40} outerRadius={66} paddingAngle={2} dataKey="value" isAnimationActive={false}>
                      {classAllocData.map((e, i) => <Cell key={i} fill={CLASS_COLORS[e.name] ?? CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [formatGbp(v), "Value"]} contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", fontSize: 11 }} wrapperStyle={{ zIndex: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5">
                  {classAllocData.map((d) => {
                    const pct = totalClassValue > 0 ? (d.value / totalClassValue) * 100 : 0;
                    const color = CLASS_COLORS[d.name] ?? "var(--ft-dim)";
                    return (
                      <div key={d.name} className="flex items-center gap-2 text-xs">
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                        <span style={{ color: "var(--ft-text)", flex: 1 }}>{d.name}</span>
                        <span className="pnum font-mono" style={{ color: "var(--ft-muted)" }}>{formatGbp(d.value)}</span>
                        <span className="font-mono w-10 text-right" style={{ color: "var(--ft-dim)" }}>{pct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* AI Portfolio Commentary — terminal style */}
          {hasPositions && summary && summary.totalValueGbp > 0 && (
            <AiPortfolioCommentary
              investments={(investments ?? []).map((inv) => ({ ticker: inv.ticker, gbpValue: inv.gbpValue, quantity: inv.shares }))}
              totalValue={summary.totalValueGbp}
            />
          )}

          {/* Portfolio Value Over Time — AreaChart of raw daily snapshots */}
          {hasPositions && (
            <PortfolioValueOverTimePanel snapshots={portfolioHistory} />
          )}

          {/* Positions table — Bloomberg equity screen style with flash cells */}
          <PortfolioPositionsTable
            investments={investments ?? []}
            summary={summary}
            quoteMap={quoteMap}
            classMap={classMap}
            tickerFilter={tickerFilter}
            onTickerFilterChange={setTickerFilter}
            onDetailOpen={setDetailId}
            onEdit={openEdit}
            onDelete={handleDelete}
            deleteConfirmId={deleteConfirmId}
            priceAlerts={priceAlerts}
            onAlertsChange={setPriceAlerts}
            baseCurrency={getBaseCurrency()}
          />

          {hasPositions && <FundamentalsTable investments={investments ?? []} quoteMap={quoteMap} />}
          {hasPositions && <DividendTracker investments={investments ?? []} quoteMap={quoteMap} />}

          {/* Portfolio Analytics */}
          {hasPositions && (
            <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
              <div className="ft-panel-header">
                <div className="ft-panel-label"><span className="accent-dot">·</span>PORTFOLIO ANALYTICS</div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4" style={{ borderColor: "var(--ft-border)" }}>
                <div className="px-4 py-3 border-r" style={{ borderColor: "var(--ft-border)" }}>
                  <div className="text-xs mb-1" style={{ color: "var(--ft-dim)" }}>Portfolio Beta</div>
                  <div className="text-base font-bold font-mono" style={{ color: portBeta != null ? (portBeta > 1.3 ? "var(--ft-red)" : portBeta < 0.7 ? "var(--ft-blue)" : "var(--ft-text)") : "var(--ft-dim)" }}>
                    {portBeta != null ? portBeta.toFixed(2) : "—"}
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--ft-dim)" }}>{portBeta != null ? (portBeta > 1.3 ? "Aggressive" : portBeta < 0.7 ? "Defensive" : "Market-like") : "Awaiting data"}</div>
                </div>
                <div className="px-4 py-3 border-r" style={{ borderColor: "var(--ft-border)" }}>
                  <div className="text-xs mb-1" style={{ color: "var(--ft-dim)" }}>Largest Position</div>
                  <div className="text-base font-bold font-mono" style={{ color: largestPos && largestPos.pct > 30 ? "var(--ft-amber)" : "var(--ft-text)" }}>
                    {largestPos ? `${largestPos.pct.toFixed(1)}%` : "—"}
                  </div>
                  <div className="text-xs mt-1" style={{ color: largestPos && largestPos.pct > 30 ? "var(--ft-amber)" : "var(--ft-dim)" }}>
                    {largestPos ? (largestPos.pct > 30 ? `${largestPos.ticker} · Consider trimming` : largestPos.ticker) : "—"}
                  </div>
                </div>
                <div className="px-4 py-3 border-r" style={{ borderColor: "var(--ft-border)" }}>
                  <div className="text-xs mb-1" style={{ color: "var(--ft-dim)" }}>Asset Classes</div>
                  <div className="text-base font-bold font-mono" style={{ color: numAssetClasses <= 1 ? "var(--ft-amber)" : "var(--ft-green)" }}>{numAssetClasses}</div>
                  <div className="text-xs mt-1" style={{ color: numAssetClasses <= 1 ? "var(--ft-amber)" : "var(--ft-dim)" }}>{numAssetClasses <= 1 ? "Consider diversifying" : "Good spread"}</div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-xs mb-1" style={{ color: "var(--ft-dim)" }}>Est. Annual Dividends</div>
                  <div className="pnum text-base font-bold font-mono" style={{ color: "var(--ft-green)" }}>{formatGbp(totalAnnualDividend)}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--ft-dim)" }}>From {dividendPositions.length} position{dividendPositions.length !== 1 ? "s" : ""}</div>
                </div>
              </div>
              {/* Risk metrics row — needs ≥10 days of snapshots */}
              {riskMetrics && (
                <div className="grid grid-cols-2 sm:grid-cols-4 border-t" style={{ borderColor: "var(--ft-border)" }}>
                  <div className="px-4 py-3 border-r" style={{ borderColor: "var(--ft-border)" }}>
                    <div className="text-xs mb-1" style={{ color: "var(--ft-dim)" }}>Annualised Vol.</div>
                    <div className="text-base font-bold font-mono" style={{ color: riskMetrics.vol > 25 ? "var(--ft-red)" : riskMetrics.vol < 12 ? "var(--ft-green)" : "var(--ft-amber)" }}>
                      {riskMetrics.vol.toFixed(1)}%
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--ft-dim)" }}>{riskMetrics.vol > 25 ? "High volatility" : riskMetrics.vol < 12 ? "Low volatility" : "Moderate"}</div>
                  </div>
                  <div className="px-4 py-3 border-r" style={{ borderColor: "var(--ft-border)" }}>
                    <div className="text-xs mb-1" style={{ color: "var(--ft-dim)" }}>Max Drawdown</div>
                    <div className="text-base font-bold font-mono" style={{ color: riskMetrics.maxDD < -15 ? "var(--ft-red)" : riskMetrics.maxDD < -7 ? "var(--ft-amber)" : "var(--ft-text)" }}>
                      {riskMetrics.maxDD.toFixed(1)}%
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--ft-dim)" }}>Peak-to-trough</div>
                  </div>
                  <div className="px-4 py-3 border-r" style={{ borderColor: "var(--ft-border)" }}>
                    <div className="text-xs mb-1" style={{ color: "var(--ft-dim)" }}>CAGR</div>
                    <div className="text-base font-bold font-mono" style={{ color: riskMetrics.cagr == null ? "var(--ft-dim)" : riskMetrics.cagr > 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                      {riskMetrics.cagr != null ? `${riskMetrics.cagr >= 0 ? "+" : ""}${riskMetrics.cagr.toFixed(1)}%` : "—"}
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--ft-dim)" }}>Compounded annual</div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="text-xs mb-1" style={{ color: "var(--ft-dim)" }}>Sharpe Ratio</div>
                    <div className="text-base font-bold font-mono" style={{ color: riskMetrics.sharpe == null ? "var(--ft-dim)" : riskMetrics.sharpe > 1 ? "var(--ft-green)" : riskMetrics.sharpe > 0 ? "var(--ft-amber)" : "var(--ft-red)" }}>
                      {riskMetrics.sharpe != null ? riskMetrics.sharpe.toFixed(2) : "—"}
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--ft-dim)" }}>vs 5% risk-free rate</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Upcoming Earnings Calendar */}
          {hasPositions && upcomingEarnings.length > 0 && (
            <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
              <div className="ft-panel-header">
                <div className="ft-panel-label"><span className="accent-dot">·</span>UPCOMING EARNINGS</div>
                <Text as="span" mono size={9} color="var(--ft-dim)">{upcomingEarnings.length} IN 45 DAYS</Text>
              </div>
              <div className="flex items-stretch overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
                {upcomingEarnings.map((e, i) => (
                  <div key={e.ticker} className="flex-shrink-0 px-4 py-3" style={{
                    borderRight: i < upcomingEarnings.length - 1 ? "1px solid var(--ft-border)" : "none",
                    minWidth: 120,
                  }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)" }}>{e.ticker}</div>
                    <Text as="div" mono size={10} color={e.daysUntil <= 7 ? "var(--ft-amber)" : "var(--ft-dim)"} mt={2}>
                      {new Date(e.date).toLocaleDateString("en", { month: "short", day: "numeric" })}
                    </Text>
                    <div style={{
                      marginTop: 4,
                      display: "inline-block",
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 2,
                      border: `1px solid ${e.daysUntil <= 7 ? "var(--ft-amber)" : "var(--ft-border2)"}`,
                      color: e.daysUntil <= 7 ? "var(--ft-amber)" : "var(--ft-muted)",
                    }}>{e.daysUntil}d</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tax Lots Panel */}
          {hasPositions && (() => {
            const byTicker = new Map<string, typeof investments>();
            (investments ?? []).forEach((inv) => {
              const arr = byTicker.get(inv.ticker) ?? [];
              arr.push(inv);
              byTicker.set(inv.ticker, arr);
            });
            const today2 = new Date();
            const tickers2 = Array.from(byTicker.keys()).sort();
            return (
              <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
                <div className="ft-panel-header">
                  <div className="ft-panel-label"><span className="accent-dot">·</span>TAX LOTS</div>
                  <Text as="span" mono size={9} color="var(--ft-dim)">FIFO ANALYSIS</Text>
                </div>
                <div className="ft-scroll-x" style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "var(--font-mono)", minWidth: 700 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--ft-border)" }}>
                        {["Ticker", "Acquired", "Shares", "Cost/sh", "Live/sh", "Cost Basis", "Market Value", "Unrealized G/L", "Holding"].map((h) => (
                          <th key={h} style={{ padding: "5px 10px", textAlign: "left", fontSize: 9, fontWeight: 700, color: "var(--ft-dim)", letterSpacing: "0.07em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tickers2.flatMap((ticker) => {
                        const lots = (byTicker.get(ticker) ?? []).slice().sort((a, b) => a.buyDate.localeCompare(b.buyDate));
                        const liveQ = quoteMap.get(ticker);
                        const live = liveQ?.price ?? 0;
                        return lots.map((lot, li) => {
                          const costBasis = lot.shares * lot.costPricePerShare;
                          const mktVal = lot.shares * live;
                          const gl = mktVal - costBasis;
                          const acqDate = new Date(lot.buyDate);
                          const daysHeld = Math.floor((today2.getTime() - acqDate.getTime()) / (24 * 3600 * 1000));
                          const isLT = daysHeld >= 365;
                          return (
                            <tr key={lot.id} style={{ borderBottom: li === lots.length - 1 ? "2px solid var(--ft-border2)" : "1px solid var(--ft-border)", background: li % 2 === 0 ? "transparent" : "var(--ft-raised)" }}>
                              <td style={{ padding: "5px 10px", fontWeight: li === 0 ? 700 : 400, color: li === 0 ? "var(--ft-text)" : "var(--ft-muted)" }}>{li === 0 ? ticker : ""}</td>
                              <td style={{ padding: "5px 10px", color: "var(--ft-dim)" }}>{new Date(lot.buyDate).toLocaleDateString("en", { year: "2-digit", month: "short", day: "numeric" })}</td>
                              <td style={{ padding: "5px 10px", textAlign: "right" }}>{lot.shares.toFixed(lot.shares % 1 === 0 ? 0 : 4)}</td>
                              <td style={{ padding: "5px 10px", textAlign: "right", color: "var(--ft-muted)" }}>{lot.costPricePerShare.toFixed(2)}</td>
                              <td style={{ padding: "5px 10px", textAlign: "right", color: "var(--ft-muted)" }}>{live > 0 ? live.toFixed(2) : "—"}</td>
                              <td style={{ padding: "5px 10px", textAlign: "right" }}>{costBasis.toFixed(2)}</td>
                              <td style={{ padding: "5px 10px", textAlign: "right" }}>{live > 0 ? mktVal.toFixed(2) : "—"}</td>
                              <td style={{ padding: "5px 10px", textAlign: "right", color: gl >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 600 }}>{live > 0 ? `${gl >= 0 ? "+" : ""}${gl.toFixed(2)}` : "—"}</td>
                              <td style={{ padding: "5px 10px" }}>
                                <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 2, border: `1px solid ${isLT ? "var(--ft-green)" : "var(--ft-amber)"}`, color: isLT ? "var(--ft-green)" : "var(--ft-amber)" }}>
                                  {isLT ? "LT" : "ST"} {daysHeld}d
                                </span>
                              </td>
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: "6px 10px", borderTop: "1px solid var(--ft-border)", display: "flex", gap: 16 }}>
                  <Text as="span" mono size={9} color="var(--ft-dim)">
                    LT = Long-term (&ge;365 days · lower CGT rate) &nbsp;·&nbsp; ST = Short-term (&lt;365 days) &nbsp;·&nbsp; Lots sorted FIFO (oldest first)
                  </Text>
                </div>
              </div>
            );
          })()}
        </VStack>
      )}

      {/* ─── ORDERS TAB ─── */}
      {defaultTab !== "markets" && activeTab === "orders" && <OrdersTab quoteMap={quoteMap} />}

      {/* ─── DERIVATIVES TAB ─── */}
      {defaultTab !== "markets" && activeTab === "derivatives" && <DerivativesTab quoteMap={quoteMap} />}

      {/* ─── MARKETS TAB — rendered directly on /investments, hidden on /portfolio ─── */}
      {defaultTab === "markets" ? <MarketsTab /> : null}

      {/* ─── REBALANCE TAB ─── */}
      {defaultTab !== "markets" && activeTab === "rebalance" && (
        <VStack gap="var(--ft-row-gap)">
          <RebalanceTab
            classAllocData={classAllocData}
            totalPortfolioValue={totalClassValue}
          />

          {/* ── Price Alerts Management Panel ── */}
          <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
            <div className="ft-panel-header">
              <div className="ft-panel-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Bell style={{ width: 10, height: 10, color: "var(--ft-amber)" }} />
                <span className="accent-dot">·</span>PRICE ALERTS
              </div>
              {priceAlerts.some((a) => a.triggered) && (
                <button
                  onClick={() => {
                    const cleared = priceAlerts.filter((a) => !a.triggered);
                    setPriceAlerts(cleared);
                    writeAlerts(cleared);
                  }}
                  style={{
                    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                    background: "transparent", border: "1px solid var(--ft-border2)",
                    color: "var(--ft-dim)", cursor: "pointer", padding: "3px 8px",
                  }}
                >
                  CLEAR ALL TRIGGERED
                </button>
              )}
            </div>

            {priceAlerts.length === 0 ? (
              <div style={{ padding: "20px 16px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>
                No alerts set · use the bell icon next to any holding in the Portfolio tab
              </div>
            ) : (
              <div className="ft-scroll-x" style={{ overflowX: "auto" }}>
                <div style={{ display: "flex", background: "var(--ft-surface)", minWidth: 620 }}>
                  {[["TICKER", "100px"], ["DIRECTION", "100px"], ["TARGET", "110px"], ["CURRENT", "110px"], ["STATUS", "100px"], ["CREATED", "1"]].map(([h, w]) => (
                    <div key={h} style={{ ...TH, width: w !== "1" ? w : undefined, minWidth: w !== "1" ? w : undefined, flex: w === "1" ? 1 : undefined }}>{h}</div>
                  ))}
                </div>
                {priceAlerts.map((alert) => {
                  const inv = investments?.find((i) => i.ticker === alert.ticker);
                  const statusColor = alert.triggered ? "var(--ft-green)" : "var(--ft-amber)";
                  return (
                    <div key={alert.id} style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-base)", minWidth: 620 }}>
                      <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-blue)" }}>
                        {alert.ticker}
                      </div>
                      <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 11, color: alert.direction === "above" ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 700, textTransform: "uppercase" }}>
                        {alert.direction === "above" ? "▲ Above" : "▼ Below"}
                      </div>
                      <div style={{ width: 110, minWidth: 110, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-text)", textAlign: "right" }}>
                        £{alert.targetPrice.toFixed(2)}
                      </div>
                      <div style={{ width: 110, minWidth: 110, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-muted)", textAlign: "right" }}>
                        {inv ? `£${inv.livePrice.toFixed(2)}` : "—"}
                      </div>
                      <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: statusColor, letterSpacing: "0.06em" }}>
                        {alert.triggered ? "TRIGGERED" : "ACTIVE"}
                      </div>
                      <div style={{ flex: 1, padding: "7px 12px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
                        {alert.createdAt.slice(0, 10)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </VStack>
      )}

    </VStack>
  );
}
