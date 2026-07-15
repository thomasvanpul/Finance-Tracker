import { useState } from "react";
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
} from "@workspace/api-client-react";
import { formatGbp, formatPercent } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Plus, Trash2, Edit2, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

interface InvForm {
  ticker: string;
  name: string;
  buyDate: string;
  shares: string;
  costPricePerShare: string;
}

const today = new Date().toISOString().slice(0, 10);
const EMPTY_FORM: InvForm = { ticker: "", name: "", buyDate: today, shares: "", costPricePerShare: "" };

const CHART_COLORS = ["#58A6FF", "#3FB950", "#F0883E", "#A371F7", "#79C0FF", "#56D364", "#FF7B72", "#D2A8FF", "#E3B341", "#FF6E40"];

const TH: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 10,
  fontWeight: 600,
  color: "#6E7681",
  background: "#161B22",
  borderBottom: "2px solid #30363D",
  borderRight: "1px solid #21262D",
  textTransform: "uppercase" as const,
  letterSpacing: "0.4px",
  whiteSpace: "nowrap" as const,
};

function calcDCF(eps: number, growthRate = 0.12, discountRate = 0.10, terminalGrowth = 0.03, years = 10): number {
  if (eps <= 0) return 0;
  let pv = 0, e = eps;
  for (let i = 1; i <= years; i++) { e *= (1 + growthRate); pv += e / Math.pow(1 + discountRate, i); }
  const tv = (e * (1 + terminalGrowth)) / (discountRate - terminalGrowth);
  return Math.max(0, Math.round((pv + tv / Math.pow(1 + discountRate, years)) * 100) / 100);
}

function fmtMktCap(cap: number | null | undefined): string {
  if (!cap) return "—";
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(1)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  return `$${(cap / 1e6).toFixed(0)}M`;
}

export default function Investments() {
  const { data: investments, isLoading, isError, error } = useListInvestments();
  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError } = useGetInvestmentSummary();
  const createInv = useCreateInvestment();
  const updateInv = useUpdateInvestment();
  const deleteInv = useDeleteInvestment();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<InvForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const tickers = [...new Set(investments?.map((i) => i.ticker) ?? [])].join(",");
  const { data: quotes } = useGetMarketQuotes(
    { tickers },
    { query: { enabled: !!tickers, queryKey: getGetMarketQuotesQueryKey({ tickers }) } }
  );
  const quoteMap = new Map(quotes?.map((q) => [q.ticker, q]) ?? []);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListInvestmentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetInvestmentSummaryQueryKey() });
  };

  const openAdd = () => { setForm(EMPTY_FORM); setAddOpen(true); };
  const openEdit = (id: number) => {
    const inv = investments?.find((i) => i.id === id);
    if (!inv) return;
    setForm({ ticker: inv.ticker, name: inv.name, buyDate: inv.buyDate, shares: String(inv.shares), costPricePerShare: String(inv.costPricePerShare) });
    setEditId(id);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    try {
      await createInv.mutateAsync({ data: { ticker: form.ticker.toUpperCase(), name: form.name, buyDate: form.buyDate, shares: parseFloat(form.shares), costPricePerShare: parseFloat(form.costPricePerShare) } });
      invalidate(); setAddOpen(false); toast({ title: "Position added" });
    } catch { toast({ title: "Failed to add position", variant: "destructive" }); }
    finally { setSubmitting(false); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (editId === null) return; setSubmitting(true);
    try {
      await updateInv.mutateAsync({ id: editId, data: { ticker: form.ticker.toUpperCase(), name: form.name, buyDate: form.buyDate, shares: parseFloat(form.shares), costPricePerShare: parseFloat(form.costPricePerShare) } });
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

  if (isLoading || isSummaryLoading) {
    return <div className="space-y-4"><Skeleton className="h-6 w-48" /><Skeleton className="h-8 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  const FormFields = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="inv-ticker">Ticker Symbol</Label>
          <Input id="inv-ticker" placeholder="e.g. VOO" value={form.ticker} onChange={(e) => setField("ticker", e.target.value.toUpperCase())} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-date">Buy Date</Label>
          <Input id="inv-date" type="date" value={form.buyDate} onChange={(e) => setField("buyDate", e.target.value)} required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="inv-name">Company / Fund Name</Label>
        <Input id="inv-name" placeholder="e.g. Vanguard S&P 500 ETF" value={form.name} onChange={(e) => setField("name", e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="inv-shares">Shares</Label>
          <Input id="inv-shares" type="number" step="0.0001" min="0" placeholder="10" value={form.shares} onChange={(e) => setField("shares", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-cost">Cost Price per Share</Label>
          <Input id="inv-cost" type="number" step="0.01" min="0" placeholder="420.50" value={form.costPricePerShare} onChange={(e) => setField("costPricePerShare", e.target.value)} required />
        </div>
      </div>
    </div>
  );

  const hasPositions = (investments?.length ?? 0) > 0;

  const pieData = (investments ?? []).map((inv, i) => ({
    name: inv.ticker,
    value: Math.round(inv.gbpValue * 100) / 100,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const plData = (investments ?? []).map((inv) => ({
    name: inv.ticker,
    pl: Math.round(inv.plGbp * 100) / 100,
    fill: inv.plPercent >= 0 ? "#3FB950" : "#F85149",
  }));

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <PageHeader
        icon={TrendingUp}
        title="Investment Positions"
        subtitle="Portfolio tracking · Live market prices via Yahoo Finance"
        actions={
          <Button onClick={openAdd} size="sm" style={{ background: "#1F6FEB", color: "white", border: "none", borderRadius: 2, fontSize: 12 }}>
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

      {/* Summary row */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 border" style={{ borderColor: "#21262D", background: "#161B22" }}>
          {[
            { label: "Total Value", value: formatGbp(summary.totalValueGbp), color: "#58A6FF" },
            { label: "Total P&L", value: `${summary.totalPlGbp >= 0 ? "+" : ""}${formatGbp(summary.totalPlGbp)}`, color: summary.totalPlGbp >= 0 ? "#3FB950" : "#F85149" },
            { label: "Return %", value: `${summary.totalPlPercent >= 0 ? "+" : ""}${formatPercent(summary.totalPlPercent)}`, color: summary.totalPlPercent >= 0 ? "#3FB950" : "#F85149" },
          ].map((s) => (
            <div key={s.label} className="px-3 sm:px-4 py-3 border-r border-b sm:border-b-0" style={{ borderColor: "#21262D" }}>
              <div className="text-xs mb-1" style={{ color: "#6E7681" }}>{s.label}</div>
              <div className="text-base font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
          <div className="px-3 sm:px-4 py-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" style={{ color: "#484F58" }} />
            <span className="text-xs" style={{ color: "#484F58" }}>{investments?.length ?? 0} position{investments?.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      )}

      {/* Charts row */}
      {hasPositions && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Allocation donut */}
          <div className="border p-4" style={{ background: "#161B22", borderColor: "#21262D" }}>
            <div className="text-xs font-bold mb-0.5 uppercase tracking-wide" style={{ color: "#58A6FF" }}>Portfolio Allocation</div>
            <div className="text-xs mb-2" style={{ color: "#484F58" }}>By position value (GBP)</div>
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={48} outerRadius={75} paddingAngle={2} dataKey="value">
                  {pieData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [formatGbp(value), "Value"]}
                  contentStyle={{ background: "#161B22", border: "1px solid #30363D", color: "#C9D1D9", fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
              {pieData.map((d, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs" style={{ color: "#8B949E" }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                  {d.name}
                  {summary && summary.totalValueGbp > 0 && (
                    <span style={{ color: "#484F58" }}>{((d.value / summary.totalValueGbp) * 100).toFixed(1)}%</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* P&L bar chart */}
          <div className="border p-4" style={{ background: "#161B22", borderColor: "#21262D" }}>
            <div className="text-xs font-bold mb-0.5 uppercase tracking-wide" style={{ color: "#58A6FF" }}>Unrealised P&amp;L per Position</div>
            <div className="text-xs mb-2" style={{ color: "#484F58" }}>GBP gain / loss</div>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={plData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: "#6E7681", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6E7681", fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `£${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}`} />
                <Tooltip
                  formatter={(value: number) => [formatGbp(value), "P&L"]}
                  contentStyle={{ background: "#161B22", border: "1px solid #30363D", color: "#C9D1D9", fontSize: 11 }}
                />
                <Bar dataKey="pl" radius={[2, 2, 0, 0]}>
                  {plData.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Positions table */}
      <div className="border" style={{ borderColor: "#21262D" }}>
        <div className="flex items-center px-3 py-1.5 text-xs font-bold border-b" style={{ background: "#1F6FEB22", borderColor: "#1F6FEB44", color: "#58A6FF" }}>
          ▼ PORTFOLIO POSITIONS — Live Market Data (GBP)
        </div>
        <div className="overflow-x-auto">
          <div className="flex" style={{ marginLeft: 36 }}>
            {[["TICKER", "80px"], ["SECURITY NAME", "1"], ["SHARES", "80px"], ["COST/SHARE", "100px"], ["LIVE PRICE", "100px"], ["VALUE (GBP)", "110px"], ["GAIN / LOSS", "120px"], ["RETURN %", "100px"], ["ACTIONS", "80px"]].map(([h, w]) => (
              <div key={h} style={{ ...TH, flex: w === "1" ? 1 : undefined, width: w !== "1" ? w : undefined, minWidth: w !== "1" ? w : undefined, textAlign: ["SHARES", "COST/SHARE", "LIVE PRICE", "VALUE (GBP)", "GAIN / LOSS", "RETURN %", "ACTIONS"].includes(h as string) ? "right" : "left" }}>
                {h}
              </div>
            ))}
          </div>

          {investments?.map((inv, i) => (
            <div key={inv.id} className="flex items-center border-b xls-row" style={{ borderColor: "rgba(33,38,45,0.5)", background: "#0D1117" }}>
              <div className="flex-shrink-0 flex items-center justify-center text-xs border-r" style={{ width: 36, color: "#484F58", borderColor: "#21262D", alignSelf: "stretch" }}>{i + 2}</div>
              <div style={{ width: 80, minWidth: 80, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#58A6FF", fontWeight: 700, fontSize: 12 }}>{inv.ticker}</div>
              <div style={{ flex: 1, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#C9D1D9", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.name}</div>
              <div style={{ width: 80, minWidth: 80, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#C9D1D9", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{inv.shares}</div>
              <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#8B949E", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {inv.costPricePerShare.toFixed(2)} <span style={{ fontSize: 10 }}>{inv.currency}</span>
              </div>
              <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#C9D1D9", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {inv.livePrice.toFixed(2)} <span style={{ fontSize: 10 }}>{inv.currency}</span>
              </div>
              <div style={{ width: 110, minWidth: 110, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#E6EDF3", fontSize: 12, fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatGbp(inv.gbpValue)}</div>
              <div style={{ width: 120, minWidth: 120, padding: "7px 12px", borderRight: "1px solid #21262D", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums", background: inv.plPercent >= 0 ? "rgba(63,185,80,0.05)" : "rgba(248,81,73,0.05)", color: inv.plPercent >= 0 ? "#3FB950" : "#F85149" }}>
                {inv.plGbp > 0 ? "+" : ""}{formatGbp(inv.plGbp)}
              </div>
              <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid #21262D", textAlign: "right" }}>
                <span style={{ padding: "1px 5px", borderRadius: 2, background: inv.plPercent >= 0 ? "rgba(63,185,80,0.15)" : "rgba(248,81,73,0.15)", color: inv.plPercent >= 0 ? "#3FB950" : "#F85149", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                  {inv.plPercent >= 0 ? "▲" : "▼"} {Math.abs(inv.plPercent).toFixed(2)}%
                </span>
              </div>
              <div style={{ width: 80, minWidth: 80, padding: "4px 6px", textAlign: "right", display: "flex", justifyContent: "flex-end", gap: 2 }}>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(inv.id)}><Edit2 className="w-3.5 h-3.5" style={{ color: "#8B949E" }} /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(inv.id)}><Trash2 className="w-3.5 h-3.5" style={{ color: "#F85149" }} /></Button>
              </div>
            </div>
          ))}

          {(investments?.length ?? 0) === 0 && (
            <div className="flex items-center border-b" style={{ borderColor: "rgba(33,38,45,0.5)" }}>
              <div style={{ width: 36, borderRight: "1px solid #21262D", alignSelf: "stretch" }} />
              <div className="flex-1 text-center py-8 text-xs" style={{ color: "#484F58" }}>No positions yet — add a position to start tracking your portfolio.</div>
            </div>
          )}

          {summary && hasPositions && (
            <div className="flex items-center border-t" style={{ background: "rgba(31,111,235,0.04)", borderColor: "#30363D" }}>
              <div style={{ width: 36, borderRight: "1px solid #21262D", alignSelf: "stretch" }} />
              <div style={{ width: 80, minWidth: 80, padding: "6px 12px", borderRight: "1px solid #21262D", color: "#6E7681", fontSize: 10, fontWeight: 700 }}>TOTAL</div>
              <div style={{ flex: 1, padding: "6px 12px", borderRight: "1px solid #21262D" }} />
              <div style={{ width: 80, minWidth: 80, borderRight: "1px solid #21262D" }} />
              <div style={{ width: 100, minWidth: 100, borderRight: "1px solid #21262D" }} />
              <div style={{ width: 100, minWidth: 100, borderRight: "1px solid #21262D" }} />
              <div style={{ width: 110, minWidth: 110, padding: "6px 12px", borderRight: "1px solid #21262D", color: "#E6EDF3", fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{formatGbp(summary.totalValueGbp)}</div>
              <div style={{ width: 120, minWidth: 120, padding: "6px 12px", borderRight: "1px solid #21262D", color: summary.totalPlGbp >= 0 ? "#3FB950" : "#F85149", fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
                {summary.totalPlGbp > 0 ? "+" : ""}{formatGbp(summary.totalPlGbp)}
              </div>
              <div style={{ width: 100, minWidth: 100, padding: "6px 12px", borderRight: "1px solid #21262D", color: summary.totalPlPercent >= 0 ? "#3FB950" : "#F85149", fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
                {summary.totalPlPercent >= 0 ? "▲" : "▼"} {Math.abs(summary.totalPlPercent).toFixed(2)}%
              </div>
              <div style={{ width: 80, minWidth: 80 }} />
            </div>
          )}
        </div>
      </div>

      {/* Fundamentals & Valuation */}
      {hasPositions && (
        <div className="border" style={{ borderColor: "#21262D" }}>
          <div className="flex items-center px-3 py-1.5 text-xs font-bold border-b" style={{ background: "#A371F722", borderColor: "#A371F744", color: "#A371F7" }}>
            ▼ FUNDAMENTALS & VALUATION — Yahoo Finance · DCF Model
          </div>
          <div className="overflow-x-auto">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[
                    { h: "TICKER", align: "left" },
                    { h: "PE (TTM)", align: "right" },
                    { h: "FWD PE", align: "right" },
                    { h: "EPS (TTM)", align: "right" },
                    { h: "52W RANGE", align: "right" },
                    { h: "MKT CAP", align: "right" },
                    { h: "BETA", align: "right" },
                    { h: "DIV YIELD", align: "right" },
                    { h: "DCF (10yr)", align: "right" },
                    { h: "ANALYST TGT", align: "right" },
                    { h: "UPSIDE", align: "right" },
                  ].map(({ h, align }) => (
                    <th key={h} style={{ ...TH, textAlign: align as "left" | "right" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {investments?.map((inv, i) => {
                  const q = quoteMap.get(inv.ticker);
                  const dcfVal = q?.eps && q.eps > 0 ? calcDCF(q.eps) : null;
                  const dcfUpside = dcfVal && q?.price ? ((dcfVal - q.price) / q.price) * 100 : null;
                  const analystUpside = q?.analystTargetPrice && q?.price ? ((q.analystTargetPrice - q.price) / q.price) * 100 : null;
                  const sym = q?.currency === "GBP" ? "£" : "$";
                  return (
                    <tr key={inv.id} style={{ borderBottom: "1px solid rgba(33,38,45,0.6)", background: i % 2 === 0 ? "#0D1117" : "#0B0E14" }}>
                      <td style={{ padding: "6px 12px", color: "#58A6FF", fontWeight: 700, fontSize: 12 }}>{inv.ticker}</td>
                      <td style={{ padding: "6px 12px", textAlign: "right", color: "#C9D1D9", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{q?.pe != null ? q.pe.toFixed(1) : "—"}</td>
                      <td style={{ padding: "6px 12px", textAlign: "right", color: "#C9D1D9", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{q?.forwardPe != null ? q.forwardPe.toFixed(1) : "—"}</td>
                      <td style={{ padding: "6px 12px", textAlign: "right", color: "#C9D1D9", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                        {q?.eps != null ? `${sym}${q.eps.toFixed(2)}` : "—"}
                      </td>
                      <td style={{ padding: "6px 12px", textAlign: "right", color: "#8B949E", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                        {q?.low52w != null && q?.high52w != null ? `${sym}${q.low52w.toFixed(0)} – ${sym}${q.high52w.toFixed(0)}` : "—"}
                      </td>
                      <td style={{ padding: "6px 12px", textAlign: "right", color: "#C9D1D9", fontSize: 11 }}>{fmtMktCap(q?.marketCap)}</td>
                      <td style={{ padding: "6px 12px", textAlign: "right", color: "#C9D1D9", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{q?.beta != null ? q.beta.toFixed(2) : "—"}</td>
                      <td style={{ padding: "6px 12px", textAlign: "right", fontSize: 11, fontVariantNumeric: "tabular-nums", color: q?.dividendYield ? "#3FB950" : "#484F58" }}>
                        {q?.dividendYield != null ? `${q.dividendYield.toFixed(2)}%` : "—"}
                      </td>
                      <td style={{ padding: "6px 12px", textAlign: "right", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                        {dcfVal ? (
                          <span style={{ color: dcfUpside != null && dcfUpside > 0 ? "#3FB950" : "#F85149" }}>
                            {sym}{dcfVal.toFixed(0)}
                          </span>
                        ) : "—"}
                      </td>
                      <td style={{ padding: "6px 12px", textAlign: "right", color: "#C9D1D9", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                        {q?.analystTargetPrice != null ? `${sym}${q.analystTargetPrice.toFixed(0)}` : "—"}
                      </td>
                      <td style={{ padding: "6px 12px", textAlign: "right", fontSize: 11 }}>
                        {analystUpside != null ? (
                          <span style={{ padding: "1px 5px", borderRadius: 2, background: analystUpside >= 0 ? "rgba(63,185,80,0.15)" : "rgba(248,81,73,0.15)", color: analystUpside >= 0 ? "#3FB950" : "#F85149", fontWeight: 600 }}>
                            {analystUpside >= 0 ? "+" : ""}{analystUpside.toFixed(1)}%
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-1.5 text-xs border-t" style={{ color: "#484F58", background: "#161B22", borderColor: "#21262D" }}>
            DCF model: 12% growth rate · 10% discount rate · 3% terminal growth · 10-year horizon · illustrative only — not financial advice
          </div>
        </div>
      )}
    </div>
  );
}
