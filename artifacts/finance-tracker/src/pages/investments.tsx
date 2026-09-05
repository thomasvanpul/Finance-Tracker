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
import { formatBaseMoney, formatPercent } from "@/lib/utils";
import { StaleAsOf } from "@/components/StaleAsOf";
import { getBaseCurrency } from "@/lib/currency-store";
import { oneShotInsight } from "@/lib/ai-chat-client";
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
  newsScore, timeAgo, fmtCap, fmtNum,
} from "@/components/investments/markets-data";
import { HStack, MonoLabel, PanelBox, PanelHeader, Text, VStack } from "@/components/primitives";
import {
  CandlestickLayer, OHLCTooltip, RangeBar, RecBar, RatingBar,
} from "@/components/investments/markets-widgets";

// ── Types ──────────────────────────────────────────────────────────────────────
// Lifted to ./investments/types.ts — see E4 refactor commit.
import type {
  InputMode,
  InvForm,
  AssetClass,
  Watchlist,
  AlertMetric,
  PriceAlert,
  QuoteData,
  TabId,
  ExchangeInfo,
  NewsItem,
} from "./investments/types";
import {
  ASSET_CLASSES,
  LS_CLASSES_KEY,
  LS_WATCHLISTS_KEY,
  LS_REBALANCE_KEY,
  LS_ALERTS_KEY,
  CRYPTO_TICKERS,
  ETF_TICKERS,
  BOND_ETF_TICKERS,
  EXCHANGE_SUFFIXES,
  detectExchange,
  detectAssetClass,
  makeEmptyInvForm,
  CHART_COLORS,
  CLASS_COLORS,
  TABS,
  readAlerts,
  writeAlerts,
  readClassMap,
  writeClassMap,
  readWatchlists,
  writeWatchlists,
} from "./investments/types";

// MarketsTab + PriceAlertsPanel + WatchlistsPanel + computeStockRating +
// useTickerStream all live in ./investments/markets-tab. alertTriggered
// is re-imported here because the portfolio-level alert-firing effect
// (later in this file) uses it against real positions, not just
// watchlist tickers.
import { MarketsTab, alertTriggered } from "./investments/markets-tab";

const TH: React.CSSProperties = {
  padding: "6px 12px", fontSize: 10, fontWeight: 600, color: "var(--ft-dim)",
  background: "var(--ft-surface)", borderBottom: "2px solid var(--ft-border2)",
  borderRight: "1px solid var(--ft-border)", textTransform: "uppercase" as const,
  letterSpacing: "0.4px", whiteSpace: "nowrap" as const,
};

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
  // G10: unpriced positions render "—" for price-derived fields. Never
  // colour a P&L badge red on a fabricated −100%.
  const priced = inv.priceAvailable === true;
  const plColor = priced && (inv.plPercent ?? 0) >= 0 ? "var(--ft-green)" : "var(--ft-red)";

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

  const chartData = priced
    ? [
        { date: inv.buyDate, costBasis: inv.costPricePerShare, value: inv.costPricePerShare },
        { date: new Date().toISOString().slice(0, 10), costBasis: inv.costPricePerShare, value: inv.livePrice ?? inv.costPricePerShare },
      ]
    : [];

  return (
    <Dialog open={invId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent style={{ background: "var(--ft-base)", border: "1px solid var(--ft-border)", maxWidth: 680, maxHeight: "90vh", overflowY: "auto" }}>
        <DialogHeader style={{ borderBottom: "1px solid var(--ft-border)", paddingBottom: 12 }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg font-bold font-mono" style={{ color: "var(--ft-blue)" }}>{inv.ticker}</span>
                {priced && inv.plPercent != null ? (
                  <span className="px-2 py-0.5 rounded-sm text-xs font-semibold" style={{ background: inv.plPercent >= 0 ? "rgba(63,185,80,0.15)" : "rgba(248,81,73,0.15)", color: plColor, border: `1px solid ${inv.plPercent >= 0 ? "rgba(63,185,80,0.3)" : "rgba(248,81,73,0.3)"}` }}>
                    {inv.plPercent >= 0 ? "▲" : "▼"} {Math.abs(inv.plPercent).toFixed(2)}%
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-sm text-xs font-semibold" style={{ background: "var(--ft-raised)", color: "var(--ft-dim)", border: "1px solid var(--ft-border)" }}>
                    NO QUOTE
                  </span>
                )}
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
                { label: "Live Price", value: priced && inv.livePrice != null ? `${sym}${inv.livePrice.toFixed(2)}` : "—" },
                { label: "Total Cost", value: formatBaseMoney(inv.costPricePerShare * inv.shares) },
                { label: "Current Value", value: priced && inv.baseEquivalent != null ? formatBaseMoney(inv.baseEquivalent) : "—" },
                { label: "Unrealised P&L", value: priced && inv.plBase != null && inv.plPercent != null ? `${inv.plBase >= 0 ? "+" : ""}${formatBaseMoney(inv.plBase)} (${inv.plPercent >= 0 ? "+" : ""}${inv.plPercent.toFixed(2)}%)` : "—", color: priced ? plColor : "var(--ft-dim)" },
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
    <div className="space-y-1.5">
      {/* Table — the calculator title is the frame's own header */}
      <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
        <PanelHeader right={(
          <>
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
          </>
        )}>
          Rebalancing Calculator
        </PanelHeader>
        <div style={{ padding: "6px 12px", borderBottom: "1px solid var(--ft-border)" }}>
          <Text as="div" size={11} color="var(--ft-dim)">
            Set target allocations per asset class · Buy/Sell amounts computed automatically
          </Text>
        </div>
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
                  {formatBaseMoney(row.currentValue)}
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
                      {row.action} <span className="pnum">{formatBaseMoney(row.actionAmount)}</span>
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
              {formatBaseMoney(totalCurrentValue)}
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
        Portfolio total used: <span className="pnum" style={{ fontFamily: "var(--font-mono)", color: "var(--ft-muted)" }}>{formatBaseMoney(totalPortfolioValue)}</span>.
      </div>
    </div>
  );
}

// ── AI Portfolio Commentary ───────────────────────────────────────────────────

const AI_COMMENTARY_CACHE_KEY = "ft-investments-ai-commentary";
const AI_COMMENTARY_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface AiPortfolioCommentaryProps {
  investments: Array<{ ticker: string; baseEquivalent: number; quantity?: number }>;
  totalValue: number;
}

// Prompt is a static instruction — the server reads holdings, weights,
// and concentration from buildChatContext(userId, "/investments").
// The old buildPrompt() inlined a full ticker × £ × weight matrix
// into the prompt text (bypassing the removed `context:` field). Now
// gone — the model reads the portfolio from the currency-exposure and
// net-position sections of the context.
const PORTFOLIO_COMMENTARY_PROMPT =
  "Analyse my investment portfolio in exactly 3-4 sentences. Cover: " +
  "(1) composition — mention the top 3 holdings by weight; " +
  "(2) concentration risk — flag any position over 30%; " +
  "(3) diversification assessment; " +
  "(4) one forward-looking observation. " +
  "Be concise, factual, and professional. No bullet points. No headings. Plain prose only.";

function AiPortfolioCommentary({ investments, totalValue }: AiPortfolioCommentaryProps) {
  const [commentary, setCommentary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(true);

  // Local UI-only stats for the chip row below the commentary. These
  // stay client-side because they're rendered locally, never sent
  // in a prompt — the model reads the same figures from
  // buildChatContext on the server.
  const holdingCount = investments.length;
  const top1 = [...investments].sort((a, b) => b.baseEquivalent - a.baseEquivalent)[0];
  const topTicker = top1?.ticker ?? "";
  const topPct = totalValue > 0 && top1 ? (top1.baseEquivalent / totalValue) * 100 : 0;
  const isConcentrated = investments.some(
    (inv) => totalValue > 0 && (inv.baseEquivalent / totalValue) * 100 > 30,
  );
  const annualYield: number | null = null; // no yield data at this component level

  const fetchCommentary = async () => {
    if (investments.length === 0 || totalValue <= 0) return;
    setLoading(true);
    try {
      const result = await oneShotInsight({
        path: "/investments",
        prompt: PORTFOLIO_COMMENTARY_PROMPT,
      });
      setCommentary(result.text);
      try {
        sessionStorage.setItem(
          AI_COMMENTARY_CACHE_KEY,
          JSON.stringify({ text: result.text, ts: Date.now() }),
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
    <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
      <PanelHeader right={
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
      }>
        Portfolio Intelligence
      </PanelHeader>
      <div style={{ padding: "10px 12px" }}>
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
        <PanelHeader right={<Text as="span" mono size={9} color="var(--ft-dim)">{daysTracked} day{daysTracked !== 1 ? "s" : ""} tracked</Text>}>
          Portfolio Value Over Time
        </PanelHeader>
        <div style={{ padding: "20px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>
          Collecting snapshots… check back tomorrow ({daysTracked} snapshot{daysTracked !== 1 ? "s" : ""} so far)
        </div>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
      <PanelHeader right={<Text as="span" mono size={9} color="var(--ft-dim)">{daysTracked} day{daysTracked !== 1 ? "s" : ""} tracked</Text>}>
        Portfolio Value Over Time
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: netChangeColor }}>
          {netChange >= 0 ? "▲" : "▼"} {Math.abs(netChange).toFixed(1)}%
        </span>
      </PanelHeader>
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
  /** Elevate to the premium tier (34px, spans 2 cols). One per bar max —
   *  the type ladder from MobileHome has exactly one primary figure. */
  primary?: boolean;
}

function InvKpiBar({ cells, style }: { cells: KpiCell[]; style?: React.CSSProperties }) {
  const isMobile = useIsMobile();
  // Grid template accounts for primary cells (span 2). On desktop that
  // means (n + primaryCount) column tracks so 1fr math still lines up.
  const primaryCount = cells.filter((c) => c.primary).length;
  const desktopCols = cells.length + primaryCount;
  return (
    // ft-kpi-bar opts into the main-content container-query rules
    // that drop this strip to 3-col at ≤900 content and 2-col at
    // ≤700 content. Without the class, the inline
    // gridTemplateColumns above stays 7-column at every desktop
    // width and each cell shrinks past the point where its value +
    // delta fit — the DIVERSIFIED overlap case.
    <div
      className="ft-kpi-bar"
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : `repeat(${desktopCols}, 1fr)`,
        borderBottom: "1px solid var(--ft-border)",
        ...style,
      } as React.CSSProperties}
    >
      {cells.map((cell, i) => {
        const isLastOdd = isMobile && i === cells.length - 1 && cells.length % 2 === 1;
        const gridStyle = cell.primary
          ? (isMobile ? { gridColumn: "span 2" } : undefined)
          : isLastOdd
            ? { gridColumn: "span 2" }
            : undefined;
        return (
        <div key={cell.label} className={`ft-kpi-bar-cell${cell.primary ? " is-primary" : ""}`} style={gridStyle}>
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
  summary: { totalValueBase: number; totalPlBase: number; totalPlPercent: number | null } | null | undefined;
  quoteMap: Map<string, QuoteData>;
  classMap: Record<number, AssetClass>;
  tickerFilter: string;
  onTickerFilterChange: (v: string) => void;
  onAdd: () => void;
  onDetailOpen: (id: number) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  deleteConfirmId: number | null;
  priceAlerts: PriceAlert[];
  onAlertsChange: (alerts: PriceAlert[]) => void;
  baseCurrency: string | null;
}

function PortfolioPositionsTable({
  investments,
  summary,
  quoteMap,
  classMap,
  tickerFilter,
  onTickerFilterChange,
  onAdd,
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

  const totalValue = summary?.totalValueBase ?? 0;

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
      <PanelHeader right={(
        <>
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
          <button
            type="button"
            onClick={onAdd}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.08em",
              color: "var(--ft-accent)",
              background: "transparent",
              border: "1px solid var(--ft-border2)",
              padding: "3px 10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
              flexShrink: 0,
              whiteSpace: "nowrap" as const,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--ft-accent)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--ft-border2)"; }}
          >
            <Plus size={10} />ADD POSITION
          </button>
        </>
      )}>
        Positions — Live Market Data ({baseCurrency ?? "—"})
      </PanelHeader>

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
              // G10: an unquoted position renders "—" for every price-derived
              // cell; never colour a P&L cell red or size a weight bar off
              // a fabricated zero.
              const priced = inv.priceAvailable === true;
              const plPct = inv.plPercent ?? 0;
              const plColor = priced && plPct >= 0 ? "var(--ft-green)" : "var(--ft-red)";
              const plSign = plPct >= 0 ? "▲" : "▼";
              const weight = priced && inv.baseEquivalent != null && totalValue > 0 ? (inv.baseEquivalent / totalValue) * 100 : 0;
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
                    value={inv.livePrice ?? 0}
                    style={{ ...TD, textAlign: "right", color: "var(--ft-text)", fontWeight: 600 }}
                  >
                    {priced && inv.livePrice != null ? (
                      <>
                        {inv.livePrice.toFixed(2)}
                        <span style={{ fontSize: 9, color: "var(--ft-dim)", marginLeft: 3 }}>{inv.currency}</span>
                      </>
                    ) : (
                      <span style={{ color: "var(--ft-dim)" }}>—</span>
                    )}
                  </FlashCell>

                  {/* VALUE */}
                  <td style={{ ...TD, textAlign: "right", color: priced ? "var(--ft-text)" : "var(--ft-dim)", fontWeight: 600 }} className="pnum">
                    {priced && inv.baseEquivalent != null ? formatBaseMoney(inv.baseEquivalent) : "—"}
                  </td>

                  {/* P&L — flash cell, colored */}
                  <FlashCell
                    value={inv.plBase ?? 0}
                    style={{
                      ...TD,
                      textAlign: "right",
                      color: priced ? plColor : "var(--ft-dim)",
                      fontWeight: 600,
                      background: priced ? (plPct >= 0 ? "color-mix(in srgb, var(--ft-green) 5%, transparent)" : "color-mix(in srgb, var(--ft-red) 5%, transparent)") : "transparent",
                    }}
                    className="pnum"
                  >
                    {priced && inv.plBase != null ? `${inv.plBase >= 0 ? "+" : ""}${formatBaseMoney(inv.plBase)}` : "—"}
                  </FlashCell>

                  {/* P&L % — directional symbol */}
                  <td style={{ ...TD, textAlign: "right" }}>
                    {priced && inv.plPercent != null ? (
                      <span style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        fontWeight: 700,
                        color: plColor,
                        padding: "1px 4px",
                        background: plPct >= 0 ? "color-mix(in srgb, var(--ft-green) 12%, transparent)" : "color-mix(in srgb, var(--ft-red) 12%, transparent)",
                      }} className="pnum">
                        {plSign} {Math.abs(inv.plPercent).toFixed(2)}%
                      </span>
                    ) : (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>—</span>
                    )}
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
                        currentPrice={inv.livePrice ?? 0}
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
                  {formatBaseMoney(summary.totalValueBase)}
                </td>
                <td style={{ ...TD, textAlign: "right", fontWeight: 700, fontSize: 12, borderBottom: "none", color: summary.totalPlBase >= 0 ? "var(--ft-green)" : "var(--ft-red)" }} className="pnum">
                  {summary.totalPlBase >= 0 ? "+" : ""}{formatBaseMoney(summary.totalPlBase)}
                </td>
                <td style={{ ...TD, textAlign: "right", fontWeight: 700, fontSize: 11, borderBottom: "none", color: summary.totalPlPercent == null ? "var(--ft-dim)" : summary.totalPlPercent >= 0 ? "var(--ft-green)" : "var(--ft-red)" }} className="pnum">
                  {summary.totalPlPercent == null
                    ? "—"
                    : `${summary.totalPlPercent >= 0 ? "▲" : "▼"} ${Math.abs(summary.totalPlPercent).toFixed(2)}%`}
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
  const {
    data: summary, isLoading: isSummaryLoading, isError: isSummaryError,
    dataUpdatedAt: summaryUpdatedAt, isStale: summaryIsStale,
  } = useGetInvestmentSummary();
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
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => { writeClassMap(classMap); }, [classMap]);

  // Open the Add-Position dialog automatically when the URL carries
  // ?add=1. Used by the market-persona quick-add path (P2·8): pressing
  // N or the FAB for a market user navigates to /investments?add=1
  // instead of opening the transaction modal. Runs once on mount.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("add") === "1") {
        setForm(makeEmptyInvForm());
        setAddOpen(true);
      }
    } catch { /* ignore */ }
  }, []);

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
    const totalVal = summary?.totalValueBase;
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
  }, [summary?.totalValueBase, investments?.length]);

  // ── Check alerts on load (once investments & quotes are available) ──
  useEffect(() => {
    if (!investments || investments.length === 0) return;
    const alerts = readAlerts();
    const nowTriggered: PriceAlert[] = [];
    const updated = alerts.map((alert) => {
      if (alert.triggered) return alert;
      const inv = investments.find((i) => i.ticker === alert.ticker);
      // G10: no live price means no valid alert fire — skip until the
      // quote returns rather than firing off a fabricated zero.
      if (!inv || inv.livePrice == null) return alert;
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
  // G10: allocation, class breakdown, and P&L charts exclude unpriced
  // positions. A pie slice sized off "0" would misrepresent the portfolio.
  const pricedInvs = (investments ?? []).filter((inv) => inv.priceAvailable === true);
  const pieData = pricedInvs.map((inv, i) => ({ name: inv.ticker, value: Math.round((inv.baseEquivalent ?? 0) * 100) / 100, color: CHART_COLORS[i % CHART_COLORS.length] }));
  const classAllocMap: Record<string, number> = {};
  pricedInvs.forEach((inv) => { const cls = classMap[inv.id] ?? "Other"; classAllocMap[cls] = (classAllocMap[cls] ?? 0) + (inv.baseEquivalent ?? 0); });
  const classAllocData = Object.entries(classAllocMap).filter(([, v]) => v > 0).map(([name, value]) => ({ name: name as AssetClass, value: Math.round(value * 100) / 100 }));
  const totalClassValue = classAllocData.reduce((s, d) => s + d.value, 0);
  const plData = pricedInvs.map((inv) => ({ name: inv.ticker, pl: Math.round((inv.plBase ?? 0) * 100) / 100, fill: (inv.plPercent ?? 0) >= 0 ? "var(--ft-green)" : "var(--ft-red)" }));

  const dividendPositions = (investments ?? []).filter((inv) => (quoteMap.get(inv.ticker)?.dividendYield ?? 0) > 0);
  const totalAnnualDividend = dividendPositions.reduce((s, inv) => { const q = quoteMap.get(inv.ticker); return q?.dividendYield ? s + (q.dividendYield / 100) * q.price * inv.shares : s; }, 0);

  // ── Portfolio Analytics ──
  const portBeta = (() => {
    if (!summary || summary.totalValueBase <= 0) return null;
    let wb = 0, covered = 0;
    (investments ?? []).forEach((inv) => { const q = quoteMap.get(inv.ticker); if (q?.beta != null && inv.baseEquivalent != null) { wb += (inv.baseEquivalent / summary.totalValueBase) * q.beta; covered += inv.baseEquivalent; } });
    return covered > 0 ? wb : null;
  })();

  const largestPos = summary && summary.totalValueBase > 0
    ? pricedInvs.reduce<{ ticker: string; pct: number } | null>((best, inv) => {
        const pct = ((inv.baseEquivalent ?? 0) / summary.totalValueBase) * 100;
        return !best || pct > best.pct ? { ticker: inv.ticker, pct } : best;
      }, null) : null;

  const numAssetClasses = classAllocData.length;

  // ── KPI bar data ──
  const kpiCells: KpiCell[] = summary ? [
    {
      label: "PORTFOLIO VALUE",
      value: formatBaseMoney(summary.totalValueBase),
      // Surface unavailablePositions the same way /accounts KPI
      // surfaces unconvertibleAccounts. Server sums totalValueBase
      // over `priced` positions only (see routes/investments.ts) —
      // any position without a live quote is silently excluded.
      // Without this line the desktop user reads a value that
      // understates their holdings and has no signal that some
      // positions are missing. Mobile follows the same pattern.
      delta: summary.unavailablePositions > 0
        ? `${summary.unavailablePositions} unavailable — not in value`
        : investments && investments.length > 0
          ? `${investments.length} position${investments.length !== 1 ? "s" : ""}`
          : undefined,
      deltaPositive: summary.unavailablePositions > 0 ? false : null,
      primary: true,
    },
    {
      label: "TOTAL P&L",
      value: `${summary.totalPlBase >= 0 ? "+" : ""}${formatBaseMoney(summary.totalPlBase)}`,
      delta: summary.totalPlPercent == null
        ? "—"
        : `${summary.totalPlPercent >= 0 ? "▲" : "▼"} ${Math.abs(summary.totalPlPercent).toFixed(2)}%`,
      deltaPositive: summary.totalPlBase >= 0,
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
      value: formatBaseMoney(totalAnnualDividend),
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
    <VStack gap={6}>
      {/* KPI Bar — replaces PageHeader on this data page */}
      <div>
        <InvKpiBar cells={kpiCells} />
        {summaryIsStale && summary && (
          <div style={{ padding: "6px 14px", textAlign: "right" }}>
            <StaleAsOf ts={summaryUpdatedAt} isFresh={false} />
          </div>
        )}
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
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", border: "1px solid var(--ft-border)", background: "var(--ft-surface)", padding: "7px 12px", marginBottom: 4, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
                    {inv && inv.livePrice != null && (
                      <Text as="span" color="var(--ft-dim)"> · current: £{inv.livePrice.toFixed(2)}</Text>
                    )}
                  </div>
                );
              })}
            </VStack>
          </div>
          <button
            onClick={() => setAlertsBannerDismissed(true)}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ft-text)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ft-dim)"; }}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--ft-dim)", padding: "0 2px", transition: "color 0.1s" }}
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
        <VStack gap={6}>
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
                <PanelHeader right={(
                  <HStack gap={2}>
                    {PERIODS.map((p) => (
                      <button key={p} onClick={() => setHistPeriod(p)}
                        onMouseEnter={(e) => { if (histPeriod !== p) (e.currentTarget as HTMLButtonElement).style.color = "var(--ft-muted)"; }}
                        onMouseLeave={(e) => { if (histPeriod !== p) (e.currentTarget as HTMLButtonElement).style.color = "var(--ft-dim)"; }}
                        style={{
                          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, padding: "2px 7px",
                          border: "1px solid", letterSpacing: "0.06em", cursor: "pointer",
                          borderColor: histPeriod === p ? "var(--ft-blue)" : "var(--ft-border)",
                          background: histPeriod === p ? "rgba(96,165,250,0.15)" : "transparent",
                          color: histPeriod === p ? "var(--ft-blue)" : "var(--ft-dim)",
                          transition: "background 0.1s, color 0.1s, border-color 0.1s",
                        }}>{p.toUpperCase()}</button>
                    ))}
                  </HStack>
                )}>
                  Portfolio vs S&P 500 — Indexed (100 = start)
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
                </PanelHeader>
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
            <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
                <PanelHeader right={<Text as="span" mono size={9} color="var(--ft-dim)">by position value</Text>}>PORTFOLIO ALLOCATION</PanelHeader>
                <div style={{ padding: "8px 12px 0" }}>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={44} outerRadius={70} paddingAngle={2} dataKey="value" isAnimationActive={false}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [formatBaseMoney(v), "Value"]} contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", fontSize: 11 }} wrapperStyle={{ zIndex: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                  {pieData.map((d, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--ft-muted)" }}>
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                      {d.name}
                      {summary && summary.totalValueBase > 0 && <span style={{ color: "var(--ft-dim)" }}>{((d.value / summary.totalValueBase) * 100).toFixed(1)}%</span>}
                    </div>
                  ))}
                </div>
              </div>
              </div>
              <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
                <PanelHeader right={<Text as="span" mono size={9} color="var(--ft-dim)">GBP gain / loss</Text>}>UNREALISED P&amp;L</PanelHeader>
                <div style={{ padding: "8px 12px" }}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={plData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fill: "var(--ft-dim)", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "var(--ft-dim)", fontSize: 10, className: "pnum" }} axisLine={false} tickLine={false} tickFormatter={(v) => `£${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}`} />
                    <Tooltip formatter={(v: number) => [formatBaseMoney(v), "P&L"]} contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", fontSize: 11 }} />
                    <Bar dataKey="pl" radius={[2, 2, 0, 0]} maxBarSize={40}>{plData.map((e, i) => <Cell key={i} fill={e.fill} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Heat map: positions sized by weight, colored by P&L */}
          {hasPositions && (investments?.length ?? 0) >= 2 && summary && summary.totalValueBase > 0 && (
            <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
              <PanelHeader right={<Text as="span" mono size={9} color="var(--ft-dim)">Size = weight · Colour = P&L</Text>}>PORTFOLIO HEAT MAP</PanelHeader>
              <div style={{ padding: 8 }}>
                <HStack gap={3} wrap>
                  {/* G10: heat map only tiles priced positions. An unquoted
                      ticker sized off "0" would visually vanish; better to
                      omit it from the map (the position count above already
                      surfaces the gap). */}
                  {pricedInvs
                    .slice()
                    .sort((a, b) => (b.baseEquivalent ?? 0) - (a.baseEquivalent ?? 0))
                    .map((inv) => {
                      const gbpVal = inv.baseEquivalent ?? 0;
                      const weight = summary.totalValueBase > 0 ? (gbpVal / summary.totalValueBase) * 100 : 0;
                      const pct = inv.plPercent ?? 0;
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
              <PanelHeader right={<Text as="span" mono size={9} color="var(--ft-dim)">By class tag · stored locally</Text>}>ASSET CLASS ALLOCATION</PanelHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center" style={{ padding: "8px 12px" }}>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={classAllocData} cx="50%" cy="50%" innerRadius={40} outerRadius={66} paddingAngle={2} dataKey="value" isAnimationActive={false}>
                      {classAllocData.map((e, i) => <Cell key={i} fill={CLASS_COLORS[e.name] ?? CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [formatBaseMoney(v), "Value"]} contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", fontSize: 11 }} wrapperStyle={{ zIndex: 10 }} />
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
                        <span className="pnum font-mono" style={{ color: "var(--ft-muted)" }}>{formatBaseMoney(d.value)}</span>
                        <span className="font-mono w-10 text-right" style={{ color: "var(--ft-dim)" }}>{pct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* AI Portfolio Commentary — terminal style */}
          {hasPositions && summary && summary.totalValueBase > 0 && (
            <AiPortfolioCommentary
              investments={pricedInvs.map((inv) => ({ ticker: inv.ticker, baseEquivalent: inv.baseEquivalent ?? 0, quantity: inv.shares }))}
              totalValue={summary.totalValueBase}
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
            onAdd={openAdd}
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
              <PanelHeader>PORTFOLIO ANALYTICS</PanelHeader>
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
                  <div className="pnum text-base font-bold font-mono" style={{ color: "var(--ft-green)" }}>{formatBaseMoney(totalAnnualDividend)}</div>
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
              <PanelHeader right={<Text as="span" mono size={9} color="var(--ft-dim)">{upcomingEarnings.length} IN 45 DAYS</Text>}>UPCOMING EARNINGS</PanelHeader>
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
                <PanelHeader right={<Text as="span" mono size={9} color="var(--ft-dim)">FIFO ANALYSIS</Text>}>TAX LOTS</PanelHeader>
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
        <VStack gap={6}>
          <RebalanceTab
            classAllocData={classAllocData}
            totalPortfolioValue={totalClassValue}
          />

          {/* ── Price Alerts Management Panel ── */}
          <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
            <PanelHeader right={priceAlerts.some((a) => a.triggered) ? (
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
              ) : undefined}>
              <Bell style={{ width: 10, height: 10, color: "var(--ft-muted)" }} />
              PRICE ALERTS
            </PanelHeader>

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
                        {inv && inv.livePrice != null ? `£${inv.livePrice.toFixed(2)}` : "—"}
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
