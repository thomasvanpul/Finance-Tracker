import { useState, useEffect, useRef } from "react";
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
import { AlertCircle, Plus, Trash2, Edit2, TrendingUp, Star, X, Maximize2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
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
  LineChart, Line, CartesianGrid, AreaChart, Area, ReferenceLine, Legend,
} from "recharts";
import { OrdersTab } from "@/components/investments/orders-tab";
import { DerivativesTab } from "@/components/investments/derivatives-tab";
import { ChartAnalysisModal } from "@/components/investments/chart-analysis-modal";
import { StatDrillModal } from "@/components/investments/stat-drill-modal";
import { FundamentalsTable, DividendTracker } from "@/components/investments/portfolio-tables";
import { grahamNumber, dcfValue } from "@/components/investments/black-scholes";

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
type Watchlist = { id: string; name: string; tickers: string[] };

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

const today = new Date().toISOString().slice(0, 10);
const EMPTY_FORM: InvForm = {
  ticker: "", name: "", buyDate: today, inputMode: "perShare",
  shares: "", costPricePerShare: "", totalShares: "", totalCost: "",
  fees: "", nativeCurrency: "USD", assetClass: "",
};
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
  { id: "markets", label: "MARKETS", color: "var(--ft-green)" },
  { id: "portfolio", label: "PORTFOLIO", color: "var(--ft-blue)" },
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

const POPULAR_TICKERS = "AAPL,MSFT,NVDA,GOOGL,META,AMZN,TSLA,AVGO,ORCL,NFLX,AMD,JPM,V,UNH,WMT";
const INDEX_TICKERS = "SPY,QQQ,DIA,IWM,VEA,EEM";
const CRYPTO_MARKET_TICKERS = "BTC-USD,ETH-USD,SOL-USD,BNB-USD,XRP-USD,DOGE-USD";
const FOREX_TICKERS_STR = "GBPUSD=X,EURUSD=X,USDJPY=X,AUDUSD=X,USDCAD=X,GBPEUR=X";
const COMMODITY_TICKERS_STR = "GC=F,SI=F,CL=F,NG=F";
const GLOBAL_INDEX_TICKERS = "^N225,^HSI,^GDAXI,^FCHI,^AXJO";
const SECTOR_TICKERS = "XLK,XLV,XLF,XLE,XLY,XLP,XLRE,XLU,XLI,XLB,XLC";
const OVERVIEW_TICKERS = [POPULAR_TICKERS, INDEX_TICKERS, SECTOR_TICKERS, CRYPTO_MARKET_TICKERS, FOREX_TICKERS_STR, COMMODITY_TICKERS_STR, GLOBAL_INDEX_TICKERS].join(",");

const INDEX_LABELS: Record<string, string> = {
  SPY: "S&P 500", QQQ: "NASDAQ 100", DIA: "Dow Jones", IWM: "Russell 2000", VEA: "Developed Mkts", EEM: "Emerging Mkts",
};
const SECTOR_LABELS: Record<string, string> = {
  XLK: "Technology", XLV: "Health Care", XLF: "Financials", XLE: "Energy",
  XLY: "Cons. Discret.", XLP: "Cons. Staples", XLRE: "Real Estate",
  XLU: "Utilities", XLI: "Industrials", XLB: "Materials", XLC: "Communication",
};
const POPULAR_NAMES: Record<string, string> = {
  AAPL: "Apple Inc.", MSFT: "Microsoft Corp.", NVDA: "NVIDIA Corp.", GOOGL: "Alphabet Inc.",
  META: "Meta Platforms", AMZN: "Amazon.com Inc.", TSLA: "Tesla Inc.", AVGO: "Broadcom Inc.",
  ORCL: "Oracle Corp.", NFLX: "Netflix Inc.", AMD: "Advanced Micro Devices", JPM: "JPMorgan Chase",
  V: "Visa Inc.", UNH: "UnitedHealth Group", WMT: "Walmart Inc.",
};
const CRYPTO_NAMES: Record<string, string> = {
  "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum", "SOL-USD": "Solana",
  "BNB-USD": "BNB", "XRP-USD": "XRP", "DOGE-USD": "Dogecoin",
};
const FOREX_NAMES: Record<string, string> = {
  "GBPUSD=X": "GBP / USD", "EURUSD=X": "EUR / USD", "USDJPY=X": "USD / JPY",
  "AUDUSD=X": "AUD / USD", "USDCAD=X": "USD / CAD", "GBPEUR=X": "GBP / EUR",
};
const COMMODITY_NAMES: Record<string, string> = {
  "GC=F": "Gold ($/oz)", "SI=F": "Silver ($/oz)", "CL=F": "Crude Oil ($/bbl)", "NG=F": "Natural Gas ($/MMBtu)",
};
const GLOBAL_INDEX_NAMES: Record<string, string> = {
  "^N225": "Nikkei 225", "^HSI": "Hang Seng", "^GDAXI": "DAX 40", "^FCHI": "CAC 40", "^AXJO": "ASX 200",
};
const CHART_PERIODS = ["1w", "1m", "3m", "6m", "1y", "2y", "5y"];

function fmtCap(v: number | null | undefined): string {
  if (!v) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

function fmtNum(v: number | null | undefined, suffix = ""): string {
  if (v == null) return "—";
  return `${v}${suffix}`;
}

function RangeBar({ low52w, high52w, price }: { low52w?: number | null; high52w?: number | null; price: number }) {
  if (!low52w || !high52w || high52w <= low52w) return <span style={{ color: "var(--ft-dim)", fontSize: 10 }}>—</span>;
  const pct = Math.max(0, Math.min(100, ((price - low52w) / (high52w - low52w)) * 100));
  const col = pct > 75 ? "var(--ft-green)" : pct < 25 ? "var(--ft-red)" : "var(--ft-amber)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 80 }}>
      <span style={{ fontSize: 9, color: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}>{low52w.toFixed(0)}</span>
      <div style={{ flex: 1, height: 4, background: "var(--ft-raised)", borderRadius: 2, position: "relative", minWidth: 40 }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: col, borderRadius: 2 }} />
        <div style={{ position: "absolute", top: -2, left: `${pct}%`, transform: "translateX(-50%)", width: 8, height: 8, borderRadius: "50%", background: col, border: "1px solid var(--ft-base)" }} />
      </div>
      <span style={{ fontSize: 9, color: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}>{high52w.toFixed(0)}</span>
    </div>
  );
}

function RecBar({ trend }: { trend: { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }[] }) {
  const t = trend[0] ?? { strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 };
  const total = t.strongBuy + t.buy + t.hold + t.sell + t.strongSell;
  if (total === 0) return <span style={{ color: "var(--ft-dim)", fontSize: 10 }}>No analyst data</span>;
  const segs = [
    { label: "Strong Buy", val: t.strongBuy, color: "var(--ft-green)" },
    { label: "Buy", val: t.buy, color: "rgba(63,185,80,0.5)" },
    { label: "Hold", val: t.hold, color: "var(--ft-amber)" },
    { label: "Sell", val: t.sell, color: "rgba(248,81,73,0.5)" },
    { label: "Strong Sell", val: t.strongSell, color: "var(--ft-red)" },
  ];
  return (
    <div>
      <div style={{ display: "flex", height: 10, borderRadius: 2, overflow: "hidden", gap: 1 }}>
        {segs.map((s) => s.val > 0 && (
          <div key={s.label} title={`${s.label}: ${s.val}`} style={{ flex: s.val / total, background: s.color, minWidth: 2 }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
        {segs.map((s) => s.val > 0 && (
          <span key={s.label} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: s.color }}>
            {s.label}: {s.val}
          </span>
        ))}
      </div>
    </div>
  );
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
        <div style={{ display: "flex", minHeight: 80 }}>
          <div style={{ borderRight: "1px solid var(--ft-border)", minWidth: 130, maxWidth: 170 }}>
            {watchlists.map((wl) => (
              <div key={wl.id} style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--ft-border)", background: activeWl === wl.id ? "rgba(88,166,255,0.08)" : "transparent" }}>
                <button onClick={() => setActiveWl(wl.id)} style={{ flex: 1, padding: "7px 10px", fontFamily: "var(--font-mono)", fontSize: 10, color: activeWl === wl.id ? "var(--ft-blue)" : "var(--ft-muted)", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", fontWeight: activeWl === wl.id ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {wl.name} <span style={{ color: "var(--ft-dim)", fontSize: 9 }}>({wl.tickers.length})</span>
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
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-blue)" }}>{ticker}</span>
                          {q ? (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)" }}>
                              ${q.price.toFixed(2)} <span style={{ color: chgColor }}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</span>
                            </span>
                          ) : (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>click to load</span>
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

function MarketsTab() {
  const [search, setSearch] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [chartPeriod, setChartPeriod] = useState("1y");
  const [chartModalOpen, setChartModalOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [watchlists, setWatchlists] = useState<Watchlist[]>(() => readWatchlists());
  const [wlDropdownOpen, setWlDropdownOpen] = useState(false);
  // Tooltip portal state
  const [tipInfo, setTipInfo] = useState<{ label: string; text: string; x: number; y: number } | null>(null);
  // Stat drill-down state
  const [drillLabel, setDrillLabel] = useState<string | null>(null);

  const addTickerToWatchlist = (ticker: string, wlId: string) => {
    const updated = watchlists.map((w) =>
      w.id === wlId && !w.tickers.includes(ticker) ? { ...w, tickers: [...w.tickers, ticker] } : w
    );
    setWatchlists(updated);
    writeWatchlists(updated);
    setWlDropdownOpen(false);
  };

  // Always load overview quotes
  const { data: overviewQuotes } = useGetMarketQuotes(
    { tickers: OVERVIEW_TICKERS },
    { query: { queryKey: getGetMarketQuotesQueryKey({ tickers: OVERVIEW_TICKERS }) } }
  );
  const qMap = new Map<string, QuoteData>(overviewQuotes?.map((q) => [q.ticker, q as QuoteData]) ?? []);

  // When a custom ticker is selected that's not in overview
  const needCustomQuote = !!selectedTicker && !qMap.has(selectedTicker);
  const { data: customQuoteArr } = useGetMarketQuotes(
    { tickers: selectedTicker ?? "" },
    { query: { queryKey: getGetMarketQuotesQueryKey({ tickers: selectedTicker ?? "" }), enabled: needCustomQuote } }
  );
  const selectedQuote = selectedTicker ? (qMap.get(selectedTicker) ?? (customQuoteArr?.[0] as QuoteData | undefined) ?? null) : null;

  // Chart, detail — only when a ticker is selected
  const { data: history, isFetching: histFetching } = useGetMarketHistory(
    { ticker: selectedTicker ?? "", period: chartPeriod },
    { query: { enabled: !!selectedTicker } }
  );
  const { data: detail, isFetching: detailFetching } = useGetMarketDetail(
    { ticker: selectedTicker ?? "" },
    { query: { enabled: !!selectedTicker } }
  );

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
    const chartData = (history ?? []).map((p: StockHistoryPoint) => ({ ...p, label: p.date }));
    const firstClose = chartData[0]?.close ?? 0;
    const lastClose = chartData[chartData.length - 1]?.close ?? 0;
    const periodReturn = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0;
    const chartColor = periodReturn >= 0 ? "var(--ft-green)" : "var(--ft-red)";

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
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
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
        </div>
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

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Back + search + watchlist */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => { setSelectedTicker(null); setWlDropdownOpen(false); }} style={{ fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", color: "var(--ft-muted)", padding: "5px 10px", cursor: "pointer", letterSpacing: "0.06em" }}>
            ← BACK
          </button>
          <form onSubmit={handleSearch} style={{ display: "flex", gap: 4, flex: 1 }}>
            <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search another ticker…" style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", color: "var(--ft-text)", padding: "5px 10px", outline: "none" }} />
            <button type="submit" style={{ fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--ft-accent)", border: "none", color: "var(--ft-base)", padding: "5px 12px", cursor: "pointer", letterSpacing: "0.06em" }}>GO</button>
          </form>
          {watchlists.length > 0 && (
            <div style={{ position: "relative" }}>
              <button onClick={() => setWlDropdownOpen(!wlDropdownOpen)} style={{ fontFamily: "var(--font-mono)", fontSize: 9, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", color: "var(--ft-blue)", padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, letterSpacing: "0.06em" }}>
                <Star size={10} /> WATCHLIST
              </button>
              {wlDropdownOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", minWidth: 140, boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }}>
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
        </div>

        {/* Header */}
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 700, color: "var(--ft-blue)", letterSpacing: "-0.01em" }}>{selectedTicker}</span>
              {q && <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "var(--ft-text)" }}>${q.price.toFixed(2)}</span>}
              {q && (
                <span style={{ padding: "3px 8px", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", background: chg >= 0 ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.12)", color: chgColor, border: `1px solid ${chg >= 0 ? "rgba(63,185,80,0.3)" : "rgba(248,81,73,0.3)"}` }}>
                  {chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%
                </span>
              )}
            </div>
            {detail?.sector && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", marginTop: 3 }}>{detail.sector} · {detail.industry}</div>}
          </div>
          <div style={{ display: "flex", gap: 20, marginLeft: "auto", flexWrap: "wrap" }}>
            {q?.dayLow != null && q?.dayHigh != null && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>DAY RANGE</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>${q.dayLow.toFixed(2)} — ${q.dayHigh.toFixed(2)}</div>
              </div>
            )}
            {q?.volume != null && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>VOLUME</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>{(q.volume / 1e6).toFixed(1)}M</div>
              </div>
            )}
            {q?.marketCap != null && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>MKT CAP</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>{fmtCap(q.marketCap)}</div>
              </div>
            )}
            {detail?.nextEarningsDate && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>NEXT EARNINGS</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-amber)" }}>{detail.nextEarningsDate}</div>
              </div>
            )}
          </div>
        </div>

        {/* Price Chart */}
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "12px 12px 4px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Price Chart
                {!histFetching && chartData.length > 0 && (
                  <span style={{ marginLeft: 8, color: periodReturn >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                    {periodReturn >= 0 ? "+" : ""}{periodReturn.toFixed(2)}%
                  </span>
                )}
              </div>
              {chartData.length > 0 && (
                <button
                  onClick={() => setChartModalOpen(true)}
                  title="Open advanced chart"
                  style={{ display: "flex", alignItems: "center", gap: 3, fontFamily: "var(--font-mono)", fontSize: 8, background: "var(--ft-raised)", border: "1px solid var(--ft-border)", color: "var(--ft-blue)", padding: "2px 7px", cursor: "pointer", letterSpacing: "0.04em" }}
                >
                  <Maximize2 size={9} /> EXPAND
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 2 }}>
              {CHART_PERIODS.map((p) => (
                <button key={p} onClick={() => setChartPeriod(p)} style={{ fontFamily: "var(--font-mono)", fontSize: 9, padding: "2px 6px", border: "1px solid var(--ft-border)", background: p === chartPeriod ? "var(--ft-accent)" : "var(--ft-raised)", color: p === chartPeriod ? "var(--ft-base)" : "var(--ft-dim)", cursor: "pointer", letterSpacing: "0.04em" }}>{p.toUpperCase()}</button>
              ))}
            </div>
          </div>
          {histFetching ? (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ft-dim)", fontFamily: "var(--font-mono)", fontSize: 11 }}>Loading chart…</div>
          ) : chartData.length === 0 ? (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ft-dim)", fontFamily: "var(--font-mono)", fontSize: 11 }}>No history data</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColor} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--ft-raised)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--ft-dim)", fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--ft-dim)", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v.toFixed(0)}`} width={52} />
                <Tooltip contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", fontSize: 11 }} formatter={(v: number) => [`$${v.toFixed(2)}`, "Close"]} labelStyle={{ color: "var(--ft-dim)", fontSize: 9 }} />
                {q?.analystTargetPrice && <ReferenceLine y={q.analystTargetPrice} stroke="var(--ft-amber)" strokeDasharray="4 3" label={{ value: `Target $${q.analystTargetPrice.toFixed(0)}`, fill: "var(--ft-amber)", fontSize: 9, position: "insideTopRight" }} />}
                <Area type="monotone" dataKey="close" stroke={chartColor} strokeWidth={1.5} fill="url(#chartGrad)" dot={false} activeDot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Advanced Chart Modal */}
        {chartModalOpen && (
          <ChartAnalysisModal
            ticker={selectedTicker}
            price={q?.price ?? 0}
            changePercent={chg}
            history={history ?? []}
            period={chartPeriod}
            onPeriodChange={setChartPeriod}
            isFetching={histFetching}
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
                    <YAxis tick={{ fill: "var(--ft-dim)", fontSize: 8 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v.toFixed(1)}`} width={36} />
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
            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              {detail?.recommendationKey && (
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase" }}>Consensus:</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: detail.recommendationKey === "buy" || detail.recommendationKey === "strong_buy" ? "var(--ft-green)" : detail.recommendationKey === "hold" ? "var(--ft-amber)" : "var(--ft-red)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {detail.recommendationKey.replace("_", " ")}
                  </span>
                  {detail.analystCount && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>({detail.analystCount} analysts)</span>}
                </div>
              )}
              {detail?.recommendationTrend?.length ? (
                <>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Current month:</div>
                  <RecBar trend={detail.recommendationTrend} />
                  {(detail?.targetMedian != null || q?.analystTargetPrice != null) && q?.price != null && (
                    <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
                      {(detail?.targetHigh != null || detail?.targetLow != null) && (
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ minWidth: 56 }}>Range:</span>
                          <span style={{ color: "var(--ft-red)" }}>${detail.targetLow?.toFixed(0)}</span>
                          <span>—</span>
                          <span style={{ color: "var(--ft-green)" }}>${detail.targetHigh?.toFixed(0)}</span>
                        </div>
                      )}
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                        Median: <span style={{ color: "var(--ft-amber)", fontWeight: 700 }}>${(detail?.targetMedian ?? q?.analystTargetPrice)?.toFixed(2)}</span>
                        {(() => {
                          const target = detail?.targetMedian ?? q?.analystTargetPrice;
                          if (target == null || !q?.price) return null;
                          const upside = ((target - q.price) / q.price) * 100;
                          return <span style={{ marginLeft: 6, color: upside >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 700 }}>({upside >= 0 ? "+" : ""}{upside.toFixed(1)}%)</span>;
                        })()}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>No recommendation data</div>
              )}
            </div>
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
              <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                {detail.country && `${detail.country} · `}{detail.employees != null && `${(detail.employees / 1000).toFixed(0)}k employees · `}
                <span style={{ color: "var(--ft-accent)" }}>{detail.website}</span>
              </div>
            )}
          </div>
        )}

      </div>
      </>
    );
  }

  // ── Overview mode ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Search bar */}
      <form onSubmit={handleSearch} style={{ display: "flex", gap: 6 }}>
        <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Enter any ticker to view full details (e.g. AAPL, BRK-B, 0700.HK)…" style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", color: "var(--ft-text)", padding: "8px 12px", outline: "none" }} />
        <button type="submit" style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, background: "var(--ft-accent)", border: "none", color: "var(--ft-base)", padding: "8px 16px", cursor: "pointer", letterSpacing: "0.06em" }}>LOOKUP</button>
      </form>

      {/* Watchlists */}
      <WatchlistsPanel watchlists={watchlists} setWatchlists={setWatchlists} onSelectTicker={setSelectedTicker} qMap={qMap} />

      {/* Index strip */}
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8 }}><span style={{ color: "var(--ft-green)" }}>·</span> Global Indices</div>
        <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {INDEX_TICKERS.split(",").map((ticker) => {
            const q = qMap.get(ticker);
            const chg = q?.changePercent ?? 0;
            const chgColor = chg >= 0 ? "var(--ft-green)" : "var(--ft-red)";
            return (
              <button key={ticker} onClick={() => setSelectedTicker(ticker)} style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 12px", cursor: "pointer", textAlign: "left", transition: "border-color 0.1s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ft-accent)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--ft-border)"; }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-accent)" }}>{ticker}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 1 }}>{INDEX_LABELS[ticker] ?? ticker}</div>
                  </div>
                  {q && <span style={{ padding: "2px 6px", fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)", background: chg >= 0 ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.12)", color: chgColor }}>{chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%</span>}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: q ? "var(--ft-text)" : "var(--ft-dim)" }}>{q ? `$${q.price.toFixed(2)}` : "—"}</div>
                {q?.low52w && q?.high52w && <div style={{ marginTop: 6 }}><RangeBar low52w={q.low52w} high52w={q.high52w} price={q.price} /></div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sector performance */}
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8 }}><span style={{ color: "var(--ft-amber)" }}>·</span> US Sector Performance (SPDR ETFs)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 4 }}>
          {SECTOR_TICKERS.split(",").map((ticker) => {
            const q = qMap.get(ticker);
            const chg = q?.changePercent ?? 0;
            const chgColor = chg >= 0 ? "var(--ft-green)" : "var(--ft-red)";
            const barPct = Math.min(100, Math.abs(chg) * 10);
            return (
              <button key={ticker} onClick={() => setSelectedTicker(ticker)} style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "8px 10px", position: "relative", overflow: "hidden", cursor: "pointer", textAlign: "left" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ft-accent)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--ft-border)"; }}>
                <div style={{ position: "absolute", bottom: 0, left: 0, height: 2, width: `${barPct}%`, background: chgColor, opacity: 0.6 }} />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 2 }}>{SECTOR_LABELS[ticker] ?? ticker}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: q ? "var(--ft-text)" : "var(--ft-dim)" }}>{q ? `$${q.price.toFixed(2)}` : "—"}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: chgColor, marginTop: 1 }}>{q ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : "—"}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Popular stocks table */}
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8 }}><span style={{ color: "var(--ft-blue)" }}>·</span> Popular Stocks — Click any row for full analysis</div>
        <div style={{ border: "1px solid var(--ft-border)", overflowX: "auto" }}>
          <div style={{ display: "flex", minWidth: 980 }}>
            {[["#", 32], ["Ticker", 72], ["Company", "flex"], ["Price", 90], ["Chg %", 80], ["Day Hi", 90], ["Day Lo", 90], ["52W Range", 150], ["Mkt Cap", 90], ["P/E", 60], ["Fwd P/E", 70], ["Beta", 60]].map(([h, w]) => (
              <div key={h} style={{ ...MH, ...(w === "flex" ? { flex: 1, minWidth: 130 } : { width: w, minWidth: w }), textAlign: ["Price","Chg %","Day Hi","Day Lo","52W Range","Mkt Cap","P/E","Fwd P/E","Beta"].includes(h as string) ? "right" : h === "#" ? "center" : "left" }}>{h}</div>
            ))}
          </div>
          {POPULAR_TICKERS.split(",").map((ticker, i) => {
            const q = qMap.get(ticker);
            const chg = q?.changePercent ?? 0;
            const chgColor = chg >= 0 ? "var(--ft-green)" : "var(--ft-red)";
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
                  {q ? <span style={{ padding: "1px 4px", fontSize: 10, fontWeight: 700, background: chg >= 0 ? "rgba(63,185,80,0.1)" : "rgba(248,81,73,0.1)", color: chgColor }}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</span> : "—"}
                </div>
                <div style={{ ...TD, width: 90, minWidth: 90, textAlign: "right", color: "var(--ft-green)" }}>{q?.dayHigh != null ? `$${q.dayHigh.toFixed(2)}` : "—"}</div>
                <div style={{ ...TD, width: 90, minWidth: 90, textAlign: "right", color: "var(--ft-red)" }}>{q?.dayLow != null ? `$${q.dayLow.toFixed(2)}` : "—"}</div>
                <div style={{ ...TD, width: 150, minWidth: 150, display: "flex", alignItems: "center", padding: "8px 12px" }}>
                  {q ? <RangeBar low52w={q.low52w} high52w={q.high52w} price={q.price} /> : <span style={{ color: "var(--ft-dim)", fontSize: 10 }}>—</span>}
                </div>
                <div style={{ ...TD, width: 90, minWidth: 90, textAlign: "right", color: "var(--ft-muted)" }}>{fmtCap(q?.marketCap)}</div>
                <div style={{ ...TD, width: 60, minWidth: 60, textAlign: "right", color: q?.pe ? (q.pe > 40 ? "var(--ft-amber)" : q.pe < 15 ? "var(--ft-green)" : "var(--ft-muted)") : "var(--ft-dim)" }}>{q?.pe ? q.pe.toFixed(1) : "—"}</div>
                <div style={{ ...TD, width: 70, minWidth: 70, textAlign: "right", color: "var(--ft-muted)" }}>{q?.forwardPe ? q.forwardPe.toFixed(1) : "—"}</div>
                <div style={{ ...TD, width: 60, minWidth: 60, textAlign: "right", color: q?.beta ? (q.beta > 1.5 ? "var(--ft-red)" : "var(--ft-muted)") : "var(--ft-dim)", borderRight: "none" }}>{q?.beta ?? "—"}</div>
              </button>
            );
          })}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4, textAlign: "right" }}>Via Yahoo Finance · Click any row or index for full chart, earnings, and analyst data</div>
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
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8 }}>
              <span style={{ color: "var(--ft-cyan)" }}>·</span> Top Movers Today
            </div>
            <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-green)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>▲ Top Gainers</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {gainers.map(({ ticker, q }) => (
                    <button key={ticker} onClick={() => setSelectedTicker(ticker)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(63,185,80,0.05)", border: "1px solid rgba(63,185,80,0.15)", padding: "6px 10px", cursor: "pointer", textAlign: "left" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ft-green)"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(63,185,80,0.15)"; }}>
                      <div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-green)" }}>{ticker}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginLeft: 6 }}>{POPULAR_NAMES[ticker] ?? ticker}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", fontWeight: 600 }}>${q!.price.toFixed(2)}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-green)" }}>+{q!.changePercent!.toFixed(2)}%</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-red)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>▼ Top Losers</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {losers.map(({ ticker, q }) => (
                    <button key={ticker} onClick={() => setSelectedTicker(ticker)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(248,81,73,0.05)", border: "1px solid rgba(248,81,73,0.15)", padding: "6px 10px", cursor: "pointer", textAlign: "left" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ft-red)"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(248,81,73,0.15)"; }}>
                      <div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-red)" }}>{ticker}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginLeft: 6 }}>{POPULAR_NAMES[ticker] ?? ticker}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", fontWeight: 600 }}>${q!.price.toFixed(2)}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-red)" }}>{q!.changePercent!.toFixed(2)}%</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Crypto */}
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8 }}>
          <span style={{ color: "var(--ft-amber)" }}>·</span> Crypto Markets
        </div>
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
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(230,162,60,0.15)"; }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-amber)" }}>{CRYPTO_NAMES[ticker] ?? ticker}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 1 }}>{ticker.replace("-USD", "")}</div>
                  </div>
                  {q && <span style={{ padding: "2px 5px", fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)", background: chg >= 0 ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.12)", color: chgColor }}>{chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%</span>}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: q ? "var(--ft-text)" : "var(--ft-dim)" }}>{priceStr}</div>
                {q?.marketCap && <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 3 }}>MCap {fmtCap(q.marketCap)}</div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Forex */}
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8 }}>
          <span style={{ color: "var(--ft-blue)" }}>·</span> Forex — Major Pairs
        </div>
        <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {FOREX_TICKERS_STR.split(",").map((ticker) => {
            const q = qMap.get(ticker);
            const chg = q?.changePercent ?? 0;
            const chgColor = chg >= 0 ? "var(--ft-green)" : "var(--ft-red)";
            return (
              <button key={ticker} onClick={() => setSelectedTicker(ticker)}
                style={{ background: "rgba(88,166,255,0.04)", border: "1px solid rgba(88,166,255,0.12)", padding: "10px 12px", cursor: "pointer", textAlign: "left", transition: "border-color 0.1s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ft-blue)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(88,166,255,0.12)"; }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-blue)" }}>{FOREX_NAMES[ticker] ?? ticker}</div>
                  {q && <span style={{ padding: "2px 5px", fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)", background: chg >= 0 ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.12)", color: chgColor }}>{chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%</span>}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: q ? "var(--ft-text)" : "var(--ft-dim)" }}>{q ? q.price.toFixed(4) : "—"}</div>
                {q?.dayLow != null && q?.dayHigh != null && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 3 }}>
                    <span style={{ color: "var(--ft-red)" }}>{q.dayLow.toFixed(4)}</span> — <span style={{ color: "var(--ft-green)" }}>{q.dayHigh.toFixed(4)}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Commodities */}
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8 }}>
          <span style={{ color: "var(--ft-green)" }}>·</span> Commodities
        </div>
        <div className="ft-four-col" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {COMMODITY_TICKERS_STR.split(",").map((ticker) => {
            const q = qMap.get(ticker);
            const chg = q?.changePercent ?? 0;
            const chgColor = chg >= 0 ? "var(--ft-green)" : "var(--ft-red)";
            return (
              <button key={ticker} onClick={() => setSelectedTicker(ticker)}
                style={{ background: "rgba(63,185,80,0.04)", border: "1px solid rgba(63,185,80,0.12)", padding: "10px 12px", cursor: "pointer", textAlign: "left", transition: "border-color 0.1s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ft-green)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(63,185,80,0.12)"; }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 4 }}>{COMMODITY_NAMES[ticker] ?? ticker}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: q ? "var(--ft-text)" : "var(--ft-dim)" }}>{q ? `$${q.price.toFixed(2)}` : "—"}</div>
                {q && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: chgColor, marginTop: 2 }}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</div>}
                {q?.low52w != null && q?.high52w != null && <div style={{ marginTop: 6 }}><RangeBar low52w={q.low52w} high52w={q.high52w} price={q.price} /></div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Global Indices */}
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8 }}>
          <span style={{ color: "var(--ft-cyan)" }}>·</span> Global Indices
        </div>
        <div className="ft-five-col" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
          {GLOBAL_INDEX_TICKERS.split(",").map((ticker) => {
            const q = qMap.get(ticker);
            const chg = q?.changePercent ?? 0;
            const chgColor = chg >= 0 ? "var(--ft-green)" : "var(--ft-red)";
            return (
              <button key={ticker} onClick={() => setSelectedTicker(ticker)}
                style={{ background: "rgba(34,211,238,0.04)", border: "1px solid rgba(34,211,238,0.12)", padding: "10px 12px", cursor: "pointer", textAlign: "left", transition: "border-color 0.1s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ft-cyan)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.12)"; }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-cyan)", marginBottom: 2 }}>{GLOBAL_INDEX_NAMES[ticker] ?? ticker}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginBottom: 4 }}>{ticker}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: q ? "var(--ft-text)" : "var(--ft-dim)" }}>
                  {q ? q.price.toLocaleString("en", { maximumFractionDigits: 0 }) : "—"}
                </div>
                {q && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: chgColor, marginTop: 2 }}>{chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%</div>}
              </button>
            );
          })}
        </div>
      </div>

    </div>
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
    { date: today, costBasis: inv.costPricePerShare, value: inv.livePrice },
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
                <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--ft-dim)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${sym}${v.toFixed(0)}`} width={48} />
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
                  <div className="text-xs font-mono font-semibold" style={{ color: color ?? "var(--ft-text)" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Valuation Scorecard */}
          {q && (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)" }}>
              <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide border-b" style={{ color: "var(--ft-accent)", borderColor: "var(--ft-border)" }}>Valuation Scorecard</div>
              <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
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
                  <div style={{ fontSize: 12, color: "var(--ft-muted)" }}>52W: <span style={{ color: G }}>{low52pct.toFixed(1)}% above low</span>{" · "}<span style={{ color: R }}>{high52pct.toFixed(1)}% below high</span></div>
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
              </div>
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
                        <div style={{ fontSize: 10, color: "var(--ft-dim)", marginBottom: 3 }}>{label}</div>
                        <input type="range" min={min} max={max} step={1} value={val}
                          onChange={(e) => set(parseInt(e.target.value, 10))}
                          style={{ width: "100%", accentColor: "var(--ft-accent)" }} />
                      </div>
                    ))}
                  </div>
                  {dcfEst && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", background: "rgba(163,113,247,0.06)", border: "1px solid rgba(163,113,247,0.2)" }}>
                      <span style={{ fontSize: 11, color: "var(--ft-dim)" }}>DCF Fair Value</span>
                      <div>
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: dcfUpside != null && dcfUpside > 0 ? "var(--ft-green)" : "var(--ft-red)", fontSize: 14 }}>
                          {sym}{dcfEst.toFixed(0)}
                        </span>
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
        <div style={{ fontSize: 12, color: "var(--ft-dim)" }}>
          Add positions in the Portfolio tab and assign asset classes. The rebalancer groups positions by asset class.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ft-text)", fontFamily: "var(--font-mono)" }}>REBALANCING CALCULATOR</div>
          <div style={{ fontSize: 11, color: "var(--ft-dim)", marginTop: 2 }}>
            Set target allocations per asset class · Buy/Sell amounts computed automatically
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!targetSumOk && (
            <span style={{ fontSize: 11, color: "var(--ft-amber)", fontFamily: "var(--font-mono)" }}>
              Targets sum: {totalTargetPct.toFixed(1)}% (must equal 100%)
            </span>
          )}
          {targetSumOk && (
            <span style={{ fontSize: 11, color: "var(--ft-green)", fontFamily: "var(--font-mono)" }}>
              Targets sum: 100% ✓
            </span>
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
        </div>
      </div>

      {/* Table */}
      <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-base)" }}>
        <div style={{ overflowX: "auto" }}>
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
                <div style={{ ...RTBD, width: 130, minWidth: 130, textAlign: "right", color: "var(--ft-text)" }}>
                  {formatGbp(row.currentValue)}
                </div>
                {/* Current % */}
                <div style={{ ...RTBD, width: 100, minWidth: 100, textAlign: "right", color: "var(--ft-muted)" }}>
                  {row.currentPct.toFixed(1)}%
                </div>
                {/* Target % (editable) */}
                <div style={{ ...RTBD, width: 120, minWidth: 120, padding: "4px 8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
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
                    <span style={{ fontSize: 12, color: "var(--ft-muted)" }}>%</span>
                  </div>
                </div>
                {/* Drift */}
                <div style={{ ...RTBD, width: 100, minWidth: 100, textAlign: "right", color: drift, fontWeight: 600 }}>
                  {row.driftPp > 0 ? "+" : ""}{row.driftPp.toFixed(1)} pp
                </div>
                {/* Action */}
                <div style={{ ...RTBD, width: 160, minWidth: 160, textAlign: "right" }}>
                  {row.action === "Hold" ? (
                    <span style={{ fontSize: 11, color: "var(--ft-green)", fontFamily: "var(--font-mono)" }}>— HOLD</span>
                  ) : (
                    <span style={{
                      fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)",
                      color: row.action === "Buy" ? "var(--ft-green)" : "var(--ft-red)",
                      padding: "1px 6px", borderRadius: 2,
                      background: row.action === "Buy" ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.12)",
                    }}>
                      {row.action} {formatGbp(row.actionAmount)}
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
            <div style={{ ...RTBD, width: 130, minWidth: 130, textAlign: "right", color: "var(--ft-text)", fontWeight: 700 }}>
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
        Portfolio total used: <span style={{ fontFamily: "var(--font-mono)", color: "var(--ft-muted)" }}>{formatGbp(totalPortfolioValue)}</span>.
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Investments() {
  const { data: investments, isLoading, isError, error } = useListInvestments();
  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError } = useGetInvestmentSummary();
  const createInv = useCreateInvestment();
  const updateInv = useUpdateInvestment();
  const deleteInv = useDeleteInvestment();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<TabId>("markets");
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [form, setForm] = useState<InvForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [classMap, setClassMap] = useState<Record<number, AssetClass>>(() => readClassMap());

  useEffect(() => { writeClassMap(classMap); }, [classMap]);

  const tickers = [...new Set(investments?.map((i) => i.ticker) ?? [])].join(",");
  const { data: quotes } = useGetMarketQuotes(
    { tickers }, { query: { enabled: !!tickers, queryKey: getGetMarketQuotesQueryKey({ tickers }) } }
  );
  const quoteMap = new Map<string, QuoteData>(quotes?.map((q) => [q.ticker, q as QuoteData]) ?? []);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListInvestmentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetInvestmentSummaryQueryKey() });
  };

  const openAdd = () => { setForm(EMPTY_FORM); setAddOpen(true); };
  const openEdit = (id: number) => {
    const inv = investments?.find((i) => i.id === id);
    if (!inv) return;
    const exchInfo = detectExchange(inv.ticker);
    setForm({
      ...EMPTY_FORM,
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
    if (!confirm("Delete this position?")) return;
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

  if (isLoading || isSummaryLoading) {
    return <div className="space-y-4"><Skeleton className="h-6 w-48" /><Skeleton className="h-8 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  const INP: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 12 };

  const FormFields = (
    <div className="space-y-4">
      {/* Row 1: Ticker + Date */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="inv-ticker">Ticker Symbol</Label>
          <Input id="inv-ticker" placeholder="e.g. VOO or 0700.HK" style={INP}
            value={form.ticker} onChange={(e) => handleTickerChange(e.target.value)} required />
          {form.ticker && (() => {
            const ex = detectExchange(form.ticker);
            return ex ? (
              <div style={{ fontSize: 10, color: "var(--ft-muted)", fontFamily: "var(--font-mono)" }}>
                {ex.label} · {ex.currency}
              </div>
            ) : (
              <div style={{ fontSize: 10, color: "var(--ft-muted)", fontFamily: "var(--font-mono)" }}>
                US market · {form.nativeCurrency}
              </div>
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
          <div style={{ fontSize: 10, color: "var(--ft-blue)", fontFamily: "var(--font-mono)" }}>
            Auto-detected: {detectAssetClass(form.ticker)}
          </div>
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
        <div className="grid grid-cols-2 gap-4">
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
        <div className="grid grid-cols-2 gap-4">
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
        <Label htmlFor="inv-fees">Transaction Fees ({form.nativeCurrency}) <span style={{ color: "var(--ft-muted)", fontWeight: 400 }}>— optional</span></Label>
        <Input id="inv-fees" type="number" step="0.01" min="0" placeholder="0.00" style={INP}
          value={form.fees} onChange={(e) => setField("fees", e.target.value)} />
      </div>

      {/* Effective cost summary */}
      {effectiveCostPerShare !== null && effectiveCostPerShare > 0 && (
        <div style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Effective Cost / Share</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-accent)" }}>
            {effectiveCostPerShare.toFixed(4)} {form.nativeCurrency}
          </span>
        </div>
      )}
    </div>
  );

  const hasPositions = (investments?.length ?? 0) > 0;

  const portfolioHistory = (() => {
    try {
      const raw = localStorage.getItem(SNAPSHOT_KEY);
      if (!raw) return [];
      const obj: Record<string, number> = JSON.parse(raw);
      return Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
    } catch { return []; }
  })();

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

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <PageHeader
        icon={TrendingUp} title="Investment Positions"
        subtitle="Portfolio tracking · Live market prices via Yahoo Finance"
        actions={
          <Button onClick={openAdd} size="sm" style={{ background: "var(--ft-blue)", color: "white", border: "none", borderRadius: 2, fontSize: 12 }}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />Add Position
          </Button>
        }
      />

      {(isError || isSummaryError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load investments</AlertTitle>
          <AlertDescription>{(error as Error)?.message ?? "Could not reach the server."}</AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--ft-border)", marginBottom: 4 }}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "8px 18px", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)",
                letterSpacing: "0.06em", border: "none", cursor: "pointer",
                background: isActive ? "var(--ft-surface)" : "transparent",
                color: isActive ? tab.color : "var(--ft-dim)",
                borderBottom: isActive ? `2px solid ${tab.color}` : "2px solid transparent",
                transition: "color 0.15s, border-color 0.15s",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

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
      {activeTab === "portfolio" && (
        <div className="space-y-5">
          {/* Summary row */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 border" style={{ borderColor: "var(--ft-border)", background: "var(--ft-surface)" }}>
              {[
                { label: "Total Value", value: formatGbp(summary.totalValueGbp), color: "var(--ft-blue)" },
                { label: "Total P&L", value: `${summary.totalPlGbp >= 0 ? "+" : ""}${formatGbp(summary.totalPlGbp)}`, color: summary.totalPlGbp >= 0 ? "var(--ft-green)" : "var(--ft-red)" },
                { label: "Return %", value: `${summary.totalPlPercent >= 0 ? "+" : ""}${formatPercent(summary.totalPlPercent)}`, color: summary.totalPlPercent >= 0 ? "var(--ft-green)" : "var(--ft-red)" },
              ].map((s) => (
                <div key={s.label} className="px-3 sm:px-4 py-3 border-r border-b sm:border-b-0" style={{ borderColor: "var(--ft-border)" }}>
                  <div className="text-xs mb-1" style={{ color: "var(--ft-dim)" }}>{s.label}</div>
                  <div className="text-base font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
                </div>
              ))}
              <div className="px-3 sm:px-4 py-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" style={{ color: "var(--ft-dim)" }} />
                <span className="text-xs" style={{ color: "var(--ft-dim)" }}>{investments?.length ?? 0} position{investments?.length !== 1 ? "s" : ""}</span>
              </div>
            </div>
          )}

          {/* Empty state — no positions yet */}
          {!hasPositions && !isLoading && (
            <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)", padding: "40px 24px", textAlign: "center" }}>
              <pre style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", lineHeight: 1.6, marginBottom: 20 }}>{`  ┌──────────────────────────────────────────┐
  │   PORTFOLIO                              │
  │                                          │
  │   TICKER   VALUE    GAIN   RETURN        │
  │   ────────────────────────────────────── │
  │   (no positions yet)                     │
  │                                          │
  └──────────────────────────────────────────┘`}</pre>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ft-text)", marginBottom: 6 }}>No positions yet</div>
              <div style={{ fontSize: 12, color: "var(--ft-dim)", marginBottom: 20, maxWidth: 400, margin: "0 auto 20px" }}>
                Add your first holding to start tracking live P&amp;L, allocation, and portfolio analytics.
                Prices are fetched live from Yahoo Finance.
              </div>
              <Button onClick={openAdd} size="sm" style={{ background: "var(--ft-blue)", color: "#fff", fontSize: 12 }}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />Add First Position
              </Button>
            </div>
          )}

          {/* Portfolio value history chart (builds up over time via localStorage snapshots) */}
          {hasPositions && portfolioHistory.length >= 2 && (
            <div className="border" style={{ borderColor: "var(--ft-border)", background: "var(--ft-surface)" }}>
              <div className="flex items-center px-3 py-1.5 text-xs font-bold border-b" style={{ background: "rgba(96,165,250,0.06)", borderColor: "rgba(96,165,250,0.18)", color: "var(--ft-blue)" }}>
                ▼ PORTFOLIO VALUE — Historical ({portfolioHistory.length} day snapshots)
              </div>
              <div style={{ padding: "12px 12px 4px" }}>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={portfolioHistory} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="portHistGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--ft-blue)" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="var(--ft-blue)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--ft-raised)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} tickFormatter={(d: string) => d.slice(5)} interval="preserveStartEnd" />
                    <YAxis tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`} width={46} />
                    <Tooltip
                      contentStyle={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", fontFamily: "var(--font-mono)", fontSize: 10 }}
                      formatter={(v: number) => [formatGbp(v), "Portfolio Value"]}
                      labelFormatter={(l: string) => l}
                    />
                    <Area type="monotone" dataKey="value" stroke="var(--ft-blue)" strokeWidth={2} fill="url(#portHistGrad)" dot={false} activeDot={{ r: 3, fill: "var(--ft-blue)" }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Charts */}
          {hasPositions && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="border p-4" style={{ background: "var(--ft-surface)", borderColor: "var(--ft-border)" }}>
                <div className="text-xs font-bold mb-0.5 uppercase tracking-wide" style={{ color: "var(--ft-blue)" }}>Portfolio Allocation</div>
                <div className="text-xs mb-2" style={{ color: "var(--ft-dim)" }}>By position value (GBP)</div>
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
              <div className="border p-4" style={{ background: "var(--ft-surface)", borderColor: "var(--ft-border)" }}>
                <div className="text-xs font-bold mb-0.5 uppercase tracking-wide" style={{ color: "var(--ft-blue)" }}>Unrealised P&amp;L per Position</div>
                <div className="text-xs mb-2" style={{ color: "var(--ft-dim)" }}>GBP gain / loss</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={plData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fill: "var(--ft-dim)", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "var(--ft-dim)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `£${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}`} />
                    <Tooltip formatter={(v: number) => [formatGbp(v), "P&L"]} contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", fontSize: 11 }} />
                    <Bar dataKey="pl" radius={[2, 2, 0, 0]} maxBarSize={40}>{plData.map((e, i) => <Cell key={i} fill={e.fill} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Asset class allocation */}
          {hasPositions && classAllocData.length > 0 && (
            <div className="border p-4" style={{ background: "var(--ft-surface)", borderColor: "var(--ft-border)" }}>
              <div className="text-xs font-bold mb-0.5 uppercase tracking-wide" style={{ color: "var(--ft-amber)" }}>Asset Class Allocation</div>
              <div className="text-xs mb-3" style={{ color: "var(--ft-dim)" }}>By class tag · stored locally</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
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
                        <span className="font-mono" style={{ color: "var(--ft-muted)" }}>{formatGbp(d.value)}</span>
                        <span className="font-mono w-10 text-right" style={{ color: "var(--ft-dim)" }}>{pct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Positions table */}
          <div className="border" style={{ borderColor: "var(--ft-border)" }}>
            <div className="flex items-center px-3 py-1.5 text-xs font-bold border-b" style={{ background: "rgba(96,165,250,0.08)", borderColor: "rgba(96,165,250,0.18)", color: "var(--ft-blue)" }}>▼ PORTFOLIO POSITIONS — Live Market Data ({getBaseCurrency()})</div>
            <div className="overflow-x-auto">
              <div className="flex" style={{ marginLeft: 36 }}>
                {[["TICKER", "80px"], ["SECURITY NAME", "1"], ["SHARES", "80px"], ["COST/SHARE", "100px"], ["LIVE PRICE", "100px"], [`VALUE (${getBaseCurrency()})`, "110px"], ["GAIN / LOSS", "120px"], ["RETURN %", "100px"], ["ACTIONS", "80px"]].map(([h, w]) => (
                  <div key={h} style={{ ...TH, flex: w === "1" ? 1 : undefined, width: w !== "1" ? w : undefined, minWidth: w !== "1" ? w : undefined, textAlign: ["SHARES", "COST/SHARE", "LIVE PRICE", `VALUE (${getBaseCurrency()})`, "GAIN / LOSS", "RETURN %", "ACTIONS"].includes(h as string) ? "right" : "left" }}>{h}</div>
                ))}
              </div>
              {investments?.map((inv, i) => (
                <div key={inv.id} className="flex items-center border-b" style={{ borderColor: "rgba(33,38,45,0.5)", background: "var(--ft-base)" }}>
                  <div className="flex-shrink-0 flex items-center justify-center text-xs border-r" style={{ width: 36, color: "var(--ft-dim)", borderColor: "var(--ft-border)", alignSelf: "stretch" }}>{i + 2}</div>
                  <button onClick={() => setDetailId(inv.id)} style={{ width: 80, minWidth: 80, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", color: "var(--ft-blue)", fontWeight: 700, fontSize: 12, textAlign: "left", background: "transparent", cursor: "pointer", textDecoration: "underline", textDecorationColor: "rgba(88,166,255,0.3)" }} title="View details">{inv.ticker}</button>
                  <button onClick={() => setDetailId(inv.id)} style={{ flex: 1, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", color: "var(--ft-text)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left", background: "transparent", cursor: "pointer" }}>{inv.name}</button>
                  <div style={{ width: 80, minWidth: 80, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", color: "var(--ft-text)", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{inv.shares}</div>
                  <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", color: "var(--ft-muted)", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{inv.costPricePerShare.toFixed(2)} <span style={{ fontSize: 10 }}>{inv.currency}</span></div>
                  <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", color: "var(--ft-text)", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{inv.livePrice.toFixed(2)} <span style={{ fontSize: 10 }}>{inv.currency}</span></div>
                  <div style={{ width: 110, minWidth: 110, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", color: "var(--ft-text)", fontSize: 12, fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatGbp(inv.gbpValue)}</div>
                  <div style={{ width: 120, minWidth: 120, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums", background: inv.plPercent >= 0 ? "rgba(63,185,80,0.05)" : "rgba(248,81,73,0.05)", color: inv.plPercent >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>{inv.plGbp > 0 ? "+" : ""}{formatGbp(inv.plGbp)}</div>
                  <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", textAlign: "right" }}>
                    <span style={{ padding: "1px 5px", borderRadius: 2, background: inv.plPercent >= 0 ? "rgba(63,185,80,0.15)" : "rgba(248,81,73,0.15)", color: inv.plPercent >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                      {inv.plPercent >= 0 ? "▲" : "▼"} {Math.abs(inv.plPercent).toFixed(2)}%
                    </span>
                  </div>
                  <div style={{ width: 80, minWidth: 80, padding: "4px 6px", textAlign: "right", display: "flex", justifyContent: "flex-end", gap: 2 }}>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(inv.id)}><Edit2 className="w-3.5 h-3.5" style={{ color: "var(--ft-muted)" }} /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(inv.id)}><Trash2 className="w-3.5 h-3.5" style={{ color: "var(--ft-red)" }} /></Button>
                  </div>
                </div>
              ))}
              {(investments?.length ?? 0) === 0 && (
                <div className="flex items-center border-b" style={{ borderColor: "rgba(33,38,45,0.5)" }}>
                  <div style={{ width: 36, borderRight: "1px solid var(--ft-border)", alignSelf: "stretch" }} />
                  <div className="flex-1 text-center py-8 text-xs" style={{ color: "var(--ft-dim)" }}>No positions yet — add a position to start tracking.</div>
                </div>
              )}
              {summary && hasPositions && (
                <div className="flex items-center border-t" style={{ background: "rgba(31,111,235,0.04)", borderColor: "var(--ft-border2)" }}>
                  <div style={{ width: 36, borderRight: "1px solid var(--ft-border)", alignSelf: "stretch" }} />
                  <div style={{ width: 80, minWidth: 80, padding: "6px 12px", borderRight: "1px solid var(--ft-border)", color: "var(--ft-dim)", fontSize: 10, fontWeight: 700 }}>TOTAL</div>
                  <div style={{ flex: 1, padding: "6px 12px", borderRight: "1px solid var(--ft-border)" }} /><div style={{ width: 80, minWidth: 80, borderRight: "1px solid var(--ft-border)" }} /><div style={{ width: 100, minWidth: 100, borderRight: "1px solid var(--ft-border)" }} /><div style={{ width: 100, minWidth: 100, borderRight: "1px solid var(--ft-border)" }} />
                  <div style={{ width: 110, minWidth: 110, padding: "6px 12px", borderRight: "1px solid var(--ft-border)", color: "var(--ft-text)", fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{formatGbp(summary.totalValueGbp)}</div>
                  <div style={{ width: 120, minWidth: 120, padding: "6px 12px", borderRight: "1px solid var(--ft-border)", color: summary.totalPlGbp >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{summary.totalPlGbp > 0 ? "+" : ""}{formatGbp(summary.totalPlGbp)}</div>
                  <div style={{ width: 100, minWidth: 100, padding: "6px 12px", borderRight: "1px solid var(--ft-border)", color: summary.totalPlPercent >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{summary.totalPlPercent >= 0 ? "▲" : "▼"} {Math.abs(summary.totalPlPercent).toFixed(2)}%</div>
                  <div style={{ width: 80, minWidth: 80 }} />
                </div>
              )}
            </div>
          </div>

          {hasPositions && <FundamentalsTable investments={investments ?? []} quoteMap={quoteMap} />}
          {hasPositions && <DividendTracker investments={investments ?? []} quoteMap={quoteMap} />}

          {/* Portfolio Analytics */}
          {hasPositions && (
            <div className="border" style={{ borderColor: "var(--ft-border)", background: "var(--ft-surface)" }}>
              <div className="flex items-center px-3 py-1.5 text-xs font-bold border-b" style={{ background: "rgba(163,113,247,0.07)", borderColor: "rgba(163,113,247,0.18)", color: "var(--ft-accent)" }}>▼ PORTFOLIO ANALYTICS</div>
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
                  <div className="text-base font-bold font-mono" style={{ color: "var(--ft-green)" }}>{formatGbp(totalAnnualDividend)}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--ft-dim)" }}>From {dividendPositions.length} position{dividendPositions.length !== 1 ? "s" : ""}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── ORDERS TAB ─── */}
      {activeTab === "orders" && <OrdersTab quoteMap={quoteMap} />}

      {/* ─── DERIVATIVES TAB ─── */}
      {activeTab === "derivatives" && <DerivativesTab quoteMap={quoteMap} />}

      {/* ─── MARKETS TAB ─── */}
      {activeTab === "markets" && <MarketsTab />}

      {/* ─── REBALANCE TAB ─── */}
      {activeTab === "rebalance" && (
        <RebalanceTab
          classAllocData={classAllocData}
          totalPortfolioValue={totalClassValue}
        />
      )}

    </div>
  );
}
