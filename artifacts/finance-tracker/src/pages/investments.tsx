import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInvestments,
  useGetInvestmentSummary,
  useCreateInvestment,
  useUpdateInvestment,
  useDeleteInvestment,
  useGetMarketQuotes,
  getGetMarketQuotesQueryKey,
  getListInvestmentsQueryKey,
  getGetInvestmentSummaryQueryKey,
  type Investment,
} from "@workspace/api-client-react";
import { formatGbp, formatPercent } from "@/lib/utils";
import { getBaseCurrency } from "@/lib/currency-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Plus, Trash2, Edit2, TrendingUp } from "lucide-react";
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
  LineChart, Line, CartesianGrid,
} from "recharts";
import { OrdersTab } from "@/components/investments/orders-tab";
import { DerivativesTab } from "@/components/investments/derivatives-tab";
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
}

type TabId = "portfolio" | "orders" | "derivatives";

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
  { id: "portfolio", label: "PORTFOLIO", color: "var(--ft-blue)" },
  { id: "orders", label: "ORDERS", color: "var(--ft-amber)" },
  { id: "derivatives", label: "DERIVATIVES", color: "var(--ft-cyan)" },
];

// ── Utilities ─────────────────────────────────────────────────────────────────

function readClassMap(): Record<number, AssetClass> {
  try { const r = localStorage.getItem(LS_CLASSES_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
function writeClassMap(m: Record<number, AssetClass>): void {
  try { localStorage.setItem(LS_CLASSES_KEY, JSON.stringify(m)); } catch { /* noop */ }
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function Investments() {
  const { data: investments, isLoading, isError, error } = useListInvestments();
  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError } = useGetInvestmentSummary();
  const createInv = useCreateInvestment();
  const updateInv = useUpdateInvestment();
  const deleteInv = useDeleteInvestment();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<TabId>("portfolio");
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

    </div>
  );
}
