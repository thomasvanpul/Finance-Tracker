import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInvestments,
  useGetInvestmentSummary,
  useCreateInvestment,
  useUpdateInvestment,
  useDeleteInvestment,
  getListInvestmentsQueryKey,
  getGetInvestmentSummaryQueryKey,
} from "@workspace/api-client-react";
import { formatGbp, formatPercent } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Plus, Trash2, Edit2, TrendingUp } from "lucide-react";
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

interface InvForm {
  ticker: string;
  name: string;
  buyDate: string;
  shares: string;
  costPricePerShare: string;
}

const today = new Date().toISOString().slice(0, 10);
const EMPTY_FORM: InvForm = { ticker: "", name: "", buyDate: today, shares: "", costPricePerShare: "" };

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
          <Label htmlFor="inv-cost">Cost Price per Share (USD)</Label>
          <Input id="inv-cost" type="number" step="0.01" min="0" placeholder="420.50" value={form.costPricePerShare} onChange={(e) => setField("costPricePerShare", e.target.value)} required />
        </div>
      </div>
    </div>
  );

  const totalWeight = summary?.totalValueGbp ?? 0;

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight" style={{ color: "#E6EDF3" }}>
            Investment Positions
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "#484F58" }}>
            Portfolio tracking · Live market prices via Yahoo Finance
          </p>
        </div>
        <Button
          onClick={openAdd}
          size="sm"
          style={{ background: "#1F6FEB", color: "white", border: "none", borderRadius: 2, fontSize: 12 }}
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add Position
        </Button>
      </div>

      {(isError || isSummaryError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load investments</AlertTitle>
          <AlertDescription>{(error as any)?.message ?? "Could not reach the server."}</AlertDescription>
        </Alert>
      )}

      {/* Add Dialog */}
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

      {/* Edit Dialog */}
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
            <div
              key={s.label}
              className="px-3 sm:px-4 py-3 border-r border-b sm:border-b-0"
              style={{ borderColor: "#21262D" }}
            >
              <div className="text-xs mb-1" style={{ color: "#6E7681" }}>{s.label}</div>
              <div className="text-base font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
          <div className="px-3 sm:px-4 py-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" style={{ color: "#484F58" }} />
            <span className="text-xs" style={{ color: "#484F58" }}>
              {investments?.length ?? 0} position{investments?.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}

      {/* Positions spreadsheet table */}
      <div className="border" style={{ borderColor: "#21262D" }}>
        {/* Section header */}
        <div className="flex items-center px-3 py-1.5 text-xs font-bold border-b" style={{ background: "#1F6FEB22", borderColor: "#1F6FEB44", color: "#58A6FF" }}>
          ▼ PORTFOLIO POSITIONS — Live Market Data (GBP)
        </div>

        <div className="overflow-x-auto">
        {/* Column headers */}
        <div className="flex" style={{ marginLeft: 36 }}>
          {[["TICKER", "80px"], ["SECURITY NAME", "1"], ["SHARES", "80px"], ["COST/SHARE", "100px"], ["LIVE PRICE", "100px"], ["VALUE (GBP)", "110px"], ["GAIN / LOSS", "120px"], ["RETURN %", "100px"], ["ACTIONS", "80px"]].map(([h, w]) => (
            <div
              key={h}
              style={{
                ...TH,
                flex: w === "1" ? 1 : undefined,
                width: w !== "1" ? w : undefined,
                minWidth: w !== "1" ? w : undefined,
                textAlign: ["SHARES", "COST/SHARE", "LIVE PRICE", "VALUE (GBP)", "GAIN / LOSS", "RETURN %", "ACTIONS"].includes(h as string) ? "right" : "left",
              }}
            >
              {h}
            </div>
          ))}
        </div>

        {/* Rows */}
        {investments?.map((inv, i) => (
          <div
            key={inv.id}
            className="flex items-center border-b xls-row"
            style={{ borderColor: "rgba(33,38,45,0.5)", background: i % 2 === 0 ? "#0D1117" : "#0D1117" }}
          >
            {/* Row number */}
            <div className="flex-shrink-0 flex items-center justify-center text-xs border-r" style={{ width: 36, color: "#484F58", borderColor: "#21262D", alignSelf: "stretch" }}>
              {i + 2}
            </div>

            {/* Ticker */}
            <div style={{ width: 80, minWidth: 80, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#58A6FF", fontWeight: 700, fontSize: 12 }}>
              {inv.ticker}
            </div>

            {/* Name */}
            <div style={{ flex: 1, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#C9D1D9", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {inv.name}
            </div>

            {/* Shares */}
            <div style={{ width: 80, minWidth: 80, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#C9D1D9", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {inv.shares}
            </div>

            {/* Cost */}
            <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#8B949E", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {inv.costPricePerShare.toFixed(2)} <span style={{ fontSize: 10 }}>{inv.currency}</span>
            </div>

            {/* Live price */}
            <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#C9D1D9", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {inv.livePrice.toFixed(2)} <span style={{ fontSize: 10 }}>{inv.currency}</span>
            </div>

            {/* Value GBP */}
            <div style={{ width: 110, minWidth: 110, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#E6EDF3", fontSize: 12, fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {formatGbp(inv.gbpValue)}
            </div>

            {/* P&L */}
            <div style={{ width: 120, minWidth: 120, padding: "7px 12px", borderRight: "1px solid #21262D", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums", background: inv.plPercent >= 0 ? "rgba(63,185,80,0.05)" : "rgba(248,81,73,0.05)", color: inv.plPercent >= 0 ? "#3FB950" : "#F85149" }}>
              {inv.plGbp > 0 ? "+" : ""}{formatGbp(inv.plGbp)}
            </div>

            {/* Return % */}
            <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid #21262D", textAlign: "right" }}>
              <span style={{ padding: "1px 5px", borderRadius: 2, background: inv.plPercent >= 0 ? "rgba(63,185,80,0.15)" : "rgba(248,81,73,0.15)", color: inv.plPercent >= 0 ? "#3FB950" : "#F85149", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                {inv.plPercent >= 0 ? "▲" : "▼"} {Math.abs(inv.plPercent).toFixed(2)}%
              </span>
            </div>

            {/* Actions */}
            <div style={{ width: 80, minWidth: 80, padding: "4px 6px", textAlign: "right", display: "flex", justifyContent: "flex-end", gap: 2 }}>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(inv.id)}>
                <Edit2 className="w-3.5 h-3.5" style={{ color: "#8B949E" }} />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(inv.id)}>
                <Trash2 className="w-3.5 h-3.5" style={{ color: "#F85149" }} />
              </Button>
            </div>
          </div>
        ))}

        {/* Empty state */}
        {investments?.length === 0 && (
          <div className="flex items-center border-b" style={{ borderColor: "rgba(33,38,45,0.5)" }}>
            <div style={{ width: 36, borderRight: "1px solid #21262D", alignSelf: "stretch" }} />
            <div className="flex-1 text-center py-8 text-xs" style={{ color: "#484F58" }}>
              No positions yet — add a position to start tracking your portfolio.
            </div>
          </div>
        )}

        {/* Totals row */}
        {summary && (investments?.length ?? 0) > 0 && (
          <div className="flex items-center border-t" style={{ background: "rgba(31,111,235,0.04)", borderColor: "#30363D" }}>
            <div style={{ width: 36, borderRight: "1px solid #21262D", alignSelf: "stretch" }} />
            <div style={{ width: 80, minWidth: 80, padding: "6px 12px", borderRight: "1px solid #21262D", color: "#6E7681", fontSize: 10, fontWeight: 700 }}>TOTAL</div>
            <div style={{ flex: 1, padding: "6px 12px", borderRight: "1px solid #21262D" }} />
            <div style={{ width: 80, minWidth: 80, borderRight: "1px solid #21262D" }} />
            <div style={{ width: 100, minWidth: 100, borderRight: "1px solid #21262D" }} />
            <div style={{ width: 100, minWidth: 100, borderRight: "1px solid #21262D" }} />
            <div style={{ width: 110, minWidth: 110, padding: "6px 12px", borderRight: "1px solid #21262D", color: "#E6EDF3", fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
              {formatGbp(summary.totalValueGbp)}
            </div>
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
    </div>
  );
}
