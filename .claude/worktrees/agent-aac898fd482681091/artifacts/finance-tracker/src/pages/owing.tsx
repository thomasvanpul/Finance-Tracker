import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDebts,
  useGetDebtSummary,
  useCreateDebt,
  useSettleDebt,
  useDeleteDebt,
  useListAccounts,
  getListDebtsQueryKey,
  getGetDebtSummaryQueryKey,
  getListAccountsQueryKey,
  getGetDashboardQueryKey,
} from "@workspace/api-client-react";
import { formatGbp, formatNative, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Plus, Trash2, CheckCheck, HandCoins, TrendingDown, TrendingUp, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

type Direction = "i_owe_them" | "they_owe_me";
type Currency = "GBP" | "USD" | "EUR" | "MYR" | "CNY" | "JPY" | "AUD" | "CAD" | "SGD" | "HKD" | "THB" | "INR";

interface DebtForm {
  personName: string;
  description: string;
  date: string;
  nativeAmount: string;
  currency: Currency;
  direction: Direction;
  notes: string;
  accountId: string;
}

const today = new Date().toISOString().slice(0, 10);
const EMPTY_FORM: DebtForm = {
  personName: "",
  description: "",
  date: today,
  nativeAmount: "",
  currency: "GBP",
  direction: "i_owe_them",
  notes: "",
  accountId: "",
};

const TH: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 10,
  fontWeight: 600,
  color: "#6E7681",
  background: "#161B22",
  borderBottom: "2px solid #30363D",
  borderRight: "1px solid #21262D",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  whiteSpace: "nowrap" as const,
};
const TD: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 12,
  borderBottom: "1px solid #21262D",
  borderRight: "1px solid #21262D",
  color: "#C9D1D9",
  whiteSpace: "nowrap" as const,
};

const PRESETS = [
  { icon: "🍜", label: "Restaurant" },
  { icon: "☕", label: "Cafe" },
  { icon: "🎉", label: "Entertainment" },
  { icon: "🍺", label: "Drinks" },
  { icon: "🛒", label: "Groceries" },
  { icon: "🚗", label: "Transport" },
  { icon: "✈️", label: "Travel" },
  { icon: "🏨", label: "Accommodation" },
  { icon: "🛍️", label: "Shopping" },
  { icon: "🏥", label: "Medical" },
];

export default function Owing() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: debts, isLoading, error } = useListDebts();
  const { data: summary } = useGetDebtSummary();
  const createDebt = useCreateDebt();
  const settleDebt = useSettleDebt();
  const deleteDebt = useDeleteDebt();

  const { data: accounts } = useListAccounts();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DebtForm>(EMPTY_FORM);
  const [filter, setFilter] = useState<"all" | "pending" | "settled">("pending");

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListDebtsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDebtSummaryQueryKey() });
    qc.invalidateQueries({ queryKey: getListAccountsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  }

  async function handleAdd() {
    const amount = parseFloat(form.nativeAmount);
    if (!form.personName.trim() || !form.description.trim() || isNaN(amount) || amount <= 0) {
      toast({ title: "Missing fields", description: "Fill in person, description, and a valid amount.", variant: "destructive" });
      return;
    }
    try {
      await createDebt.mutateAsync({
        data: {
          personName: form.personName.trim(),
          description: form.description.trim(),
          date: form.date,
          nativeAmount: amount,
          currency: form.currency,
          direction: form.direction,
          notes: form.notes.trim() || undefined,
          accountId: form.accountId ? parseInt(form.accountId) : undefined,
        },
      });
      invalidate();
      setOpen(false);
      setForm(EMPTY_FORM);
      toast({ title: "Added", description: `${form.direction === "i_owe_them" ? "You owe" : form.personName} recorded.` });
    } catch {
      toast({ title: "Error", description: "Failed to add entry.", variant: "destructive" });
    }
  }

  async function handleSettle(id: number, name: string) {
    try {
      await settleDebt.mutateAsync({ id });
      invalidate();
      toast({ title: "Settled!", description: `Debt with ${name} marked as settled.` });
    } catch {
      toast({ title: "Error", description: "Failed to settle.", variant: "destructive" });
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteDebt.mutateAsync({ id });
      invalidate();
      toast({ title: "Deleted", description: "Entry removed." });
    } catch {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    }
  }

  const filtered = (debts ?? []).filter((d) => {
    if (filter === "all") return true;
    return d.status === filter;
  });

  const pending = (debts ?? []).filter((d) => d.status === "pending");
  const iOwe = pending.filter((d) => d.direction === "i_owe_them");
  const theyOwe = pending.filter((d) => d.direction === "they_owe_me");

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold" style={{ color: "#E6EDF3" }}>Owing</h1>
          <p className="text-xs mt-0.5" style={{ color: "#6E7681" }}>Track who owes who — split bills, IOUs, shared expenses</p>
        </div>
        <Button
          size="sm"
          onClick={() => setOpen(true)}
          style={{ background: "#1F6FEB", color: "#fff", height: 30, fontSize: 12, gap: 6 }}
        >
          <Plus className="w-3.5 h-3.5" /> Add IOU
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to load debts.</AlertDescription>
        </Alert>
      )}

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-3 gap-3">
        {/* They owe me */}
        <div className="rounded-sm border p-4" style={{ background: "#161B22", borderColor: "#21262D" }}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4" style={{ color: "#3FB950" }} />
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "#6E7681" }}>They Owe Me</span>
          </div>
          {summary ? (
            <>
              <div className="text-xl font-bold font-mono" style={{ color: "#3FB950" }}>
                {formatGbp(summary.totalOwedToMe)}
              </div>
              <div className="text-xs mt-1" style={{ color: "#484F58" }}>
                {theyOwe.length} pending
              </div>
            </>
          ) : (
            <Skeleton className="h-6 w-24 mt-1" />
          )}
        </div>

        {/* I owe */}
        <div className="rounded-sm border p-4" style={{ background: "#161B22", borderColor: "#21262D" }}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4" style={{ color: "#F85149" }} />
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "#6E7681" }}>I Owe</span>
          </div>
          {summary ? (
            <>
              <div className="text-xl font-bold font-mono" style={{ color: "#F85149" }}>
                {formatGbp(summary.totalIOwe)}
              </div>
              <div className="text-xs mt-1" style={{ color: "#484F58" }}>
                {iOwe.length} pending
              </div>
            </>
          ) : (
            <Skeleton className="h-6 w-24 mt-1" />
          )}
        </div>

        {/* Net */}
        <div className="rounded-sm border p-4" style={{ background: "#161B22", borderColor: "#21262D" }}>
          <div className="flex items-center gap-2 mb-2">
            <HandCoins className="w-4 h-4" style={{ color: "#58A6FF" }} />
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "#6E7681" }}>Net Position</span>
          </div>
          {summary ? (
            <>
              <div
                className="text-xl font-bold font-mono"
                style={{ color: summary.netGbp >= 0 ? "#3FB950" : "#F85149" }}
              >
                {summary.netGbp >= 0 ? "+" : ""}{formatGbp(summary.netGbp)}
              </div>
              <div className="text-xs mt-1" style={{ color: "#484F58" }}>
                {summary.pendingCount} total open
              </div>
            </>
          ) : (
            <Skeleton className="h-6 w-24 mt-1" />
          )}
        </div>
      </div>

      {/* ── People summary for pending ── */}
      {pending.length > 0 && (
        <div className="rounded-sm border overflow-hidden" style={{ borderColor: "#21262D" }}>
          <div
            className="px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b flex items-center gap-2"
            style={{ background: "#161B22", borderColor: "#21262D", color: "#6E7681" }}
          >
            <span style={{ color: "#58A6FF" }}>⬡</span> Open balances by person
          </div>
          <div className="flex flex-wrap gap-2 p-3" style={{ background: "#0D1117" }}>
            {Object.entries(
              pending.reduce((acc, d) => {
                const key = d.personName;
                if (!acc[key]) acc[key] = 0;
                acc[key] += d.direction === "they_owe_me" ? d.gbpEquivalent : -d.gbpEquivalent;
                return acc;
              }, {} as Record<string, number>)
            ).map(([name, net]) => (
              <div
                key={name}
                className="flex items-center gap-2 px-3 py-1.5 rounded-sm border text-xs"
                style={{
                  background: "#161B22",
                  borderColor: net >= 0 ? "rgba(63,185,80,0.3)" : "rgba(248,81,73,0.3)",
                }}
              >
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: "#21262D", color: "#58A6FF" }}
                >
                  {name[0].toUpperCase()}
                </span>
                <span style={{ color: "#C9D1D9" }}>{name}</span>
                <span className="font-mono font-semibold" style={{ color: net >= 0 ? "#3FB950" : "#F85149" }}>
                  {net >= 0 ? "+" : ""}{formatGbp(net)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div className="rounded-sm border overflow-hidden" style={{ borderColor: "#21262D" }}>
        {/* Filter tabs - scrollable on mobile */}
        <div
          className="flex items-center border-b"
          style={{ background: "#161B22", borderColor: "#21262D" }}
        >
          {(["pending", "settled", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-4 py-2 text-xs font-medium capitalize border-b-2 transition-colors"
              style={{
                borderBottomColor: filter === f ? "#1F6FEB" : "transparent",
                color: filter === f ? "#58A6FF" : "#6E7681",
                background: "transparent",
              }}
            >
              {f}
            </button>
          ))}
          <div className="flex-1" />
          <span className="text-xs px-3" style={{ color: "#484F58" }}>
            {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
          </span>
        </div>

        <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 28, textAlign: "center" }}>#</th>
                <th style={TH}>Date</th>
                <th style={TH}>Person</th>
                <th style={TH}>Description</th>
                <th style={TH}>Direction</th>
                <th style={{ ...TH, textAlign: "right" }}>Amount</th>
                <th style={{ ...TH, textAlign: "right" }}>GBP</th>
                <th style={TH}>Status</th>
                <th style={{ ...TH, borderRight: "none" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} style={TD}>
                        <Skeleton className="h-3 w-full" />
                      </td>
                    ))}
                  </tr>
                ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ ...TD, textAlign: "center", padding: "32px 12px", color: "#484F58", borderRight: "none" }}>
                    No entries — add one with <strong style={{ color: "#58A6FF" }}>Add IOU</strong>
                  </td>
                </tr>
              )}
              {!isLoading &&
                filtered.map((d, i) => (
                  <tr
                    key={d.id}
                    style={{ background: d.status === "settled" ? "rgba(255,255,255,0.01)" : undefined }}
                  >
                    <td style={{ ...TD, textAlign: "center", color: "#484F58", width: 28 }}>{i + 1}</td>
                    <td style={{ ...TD, fontFamily: "monospace" }}>{formatDate(d.date)}</td>
                    <td style={TD}>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: "#21262D", color: "#58A6FF" }}
                        >
                          {d.personName[0].toUpperCase()}
                        </span>
                        <span style={{ color: d.status === "settled" ? "#484F58" : "#C9D1D9" }}>{d.personName}</span>
                      </div>
                    </td>
                    <td style={{ ...TD, color: d.status === "settled" ? "#484F58" : "#C9D1D9" }}>
                      {d.description}
                      {d.notes && (
                        <span className="ml-1.5 text-xs" style={{ color: "#484F58" }}>· {d.notes}</span>
                      )}
                    </td>
                    <td style={TD}>
                      {d.direction === "i_owe_them" ? (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-xs"
                          style={{ background: "rgba(248,81,73,0.1)", color: "#F85149", border: "1px solid rgba(248,81,73,0.2)" }}
                        >
                          <TrendingDown className="w-3 h-3" /> I owe
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-xs"
                          style={{ background: "rgba(63,185,80,0.1)", color: "#3FB950", border: "1px solid rgba(63,185,80,0.2)" }}
                        >
                          <TrendingUp className="w-3 h-3" /> They owe
                        </span>
                      )}
                    </td>
                    <td style={{ ...TD, textAlign: "right", fontFamily: "monospace" }}>
                      {formatNative(d.nativeAmount, d.currency)}
                    </td>
                    <td style={{ ...TD, textAlign: "right", fontFamily: "monospace", color: d.direction === "they_owe_me" ? "#3FB950" : "#F85149" }}>
                      {d.direction === "they_owe_me" ? "+" : "-"}{formatGbp(d.gbpEquivalent)}
                    </td>
                    <td style={TD}>
                      {d.status === "settled" ? (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-xs"
                          style={{ background: "rgba(63,185,80,0.08)", color: "#3FB950", border: "1px solid rgba(63,185,80,0.15)" }}
                        >
                          <CheckCheck className="w-3 h-3" /> Settled
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-xs"
                          style={{ background: "rgba(255,166,0,0.08)", color: "#F0883E", border: "1px solid rgba(255,166,0,0.15)" }}
                        >
                          <RefreshCw className="w-3 h-3" /> Pending
                        </span>
                      )}
                    </td>
                    <td style={{ ...TD, borderRight: "none" }}>
                      <div className="flex items-center gap-1">
                        {d.status === "pending" && (
                          <button
                            onClick={() => handleSettle(d.id, d.personName)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs transition-colors"
                            style={{ background: "rgba(63,185,80,0.1)", color: "#3FB950", border: "1px solid rgba(63,185,80,0.2)" }}
                            title="Mark as settled"
                          >
                            <CheckCheck className="w-3 h-3" /> Settle
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(d.id)}
                          className="p-1 rounded-sm transition-colors"
                          style={{ color: "#484F58" }}
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add IOU Dialog ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent style={{ background: "#161B22", border: "1px solid #30363D", maxWidth: 500 }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#E6EDF3", fontSize: 14 }}>Add IOU</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Direction toggle — most prominent choice */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setForm((f) => ({ ...f, direction: "i_owe_them" }))}
                className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-sm border text-xs font-medium transition-all"
                style={{
                  background: form.direction === "i_owe_them" ? "rgba(248,81,73,0.12)" : "#0D1117",
                  borderColor: form.direction === "i_owe_them" ? "rgba(248,81,73,0.5)" : "#30363D",
                  color: form.direction === "i_owe_them" ? "#F85149" : "#6E7681",
                }}
              >
                <TrendingDown className="w-5 h-5" />
                I owe them
              </button>
              <button
                onClick={() => setForm((f) => ({ ...f, direction: "they_owe_me" }))}
                className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-sm border text-xs font-medium transition-all"
                style={{
                  background: form.direction === "they_owe_me" ? "rgba(63,185,80,0.12)" : "#0D1117",
                  borderColor: form.direction === "they_owe_me" ? "rgba(63,185,80,0.5)" : "#30363D",
                  color: form.direction === "they_owe_me" ? "#3FB950" : "#6E7681",
                }}
              >
                <TrendingUp className="w-5 h-5" />
                They owe me
              </button>
            </div>

            {/* Person name */}
            <div className="space-y-1.5">
              <Label style={{ color: "#8B949E", fontSize: 11 }}>Person</Label>
              <Input
                placeholder="e.g. Alice"
                value={form.personName}
                onChange={(e) => setForm((f) => ({ ...f, personName: e.target.value }))}
                style={{ background: "#0D1117", border: "1px solid #30363D", color: "#E6EDF3", height: 32, fontSize: 12 }}
              />
            </div>

            {/* Description with presets */}
            <div className="space-y-1.5">
              <Label style={{ color: "#8B949E", fontSize: 11 }}>Description</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setForm((f) => ({ ...f, description: `${p.icon} ${p.label}` }))}
                    className="px-2 py-0.5 rounded-sm text-xs border transition-colors"
                    style={{
                      background: form.description === `${p.icon} ${p.label}` ? "rgba(31,111,235,0.15)" : "#0D1117",
                      borderColor: form.description === `${p.icon} ${p.label}` ? "rgba(31,111,235,0.5)" : "#30363D",
                      color: form.description === `${p.icon} ${p.label}` ? "#58A6FF" : "#8B949E",
                    }}
                  >
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
              <Input
                placeholder="or type anything..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                style={{ background: "#0D1117", border: "1px solid #30363D", color: "#E6EDF3", height: 32, fontSize: 12 }}
              />
            </div>

            {/* Amount + currency */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label style={{ color: "#8B949E", fontSize: 11 }}>Amount</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={form.nativeAmount}
                  onChange={(e) => setForm((f) => ({ ...f, nativeAmount: e.target.value }))}
                  style={{ background: "#0D1117", border: "1px solid #30363D", color: "#E6EDF3", height: 32, fontSize: 12 }}
                />
              </div>
              <div className="space-y-1.5">
                <Label style={{ color: "#8B949E", fontSize: 11 }}>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v as Currency }))}>
                  <SelectTrigger style={{ background: "#0D1117", border: "1px solid #30363D", color: "#E6EDF3", height: 32, fontSize: 12 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ background: "#161B22", border: "1px solid #30363D" }}>
                    {(["GBP", "USD", "EUR", "MYR", "CNY", "JPY", "AUD", "CAD", "SGD", "HKD", "THB", "INR"] as Currency[]).map((c) => (
                      <SelectItem key={c} value={c} style={{ color: "#C9D1D9", fontSize: 12 }}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Date + notes */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label style={{ color: "#8B949E", fontSize: 11 }}>Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  style={{ background: "#0D1117", border: "1px solid #30363D", color: "#E6EDF3", height: 32, fontSize: 12 }}
                />
              </div>
              <div className="space-y-1.5">
                <Label style={{ color: "#8B949E", fontSize: 11 }}>Notes <span style={{ color: "#484F58" }}>(optional)</span></Label>
                <Input
                  placeholder="extra detail..."
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  style={{ background: "#0D1117", border: "1px solid #30363D", color: "#E6EDF3", height: 32, fontSize: 12 }}
                />
              </div>
            </div>

            {/* Account — optional, auto-adjusts balance on settle */}
            <div className="space-y-1.5">
              <Label style={{ color: "#8B949E", fontSize: 11 }}>
                Account <span style={{ color: "#484F58" }}>(optional — adjusts balance when settled)</span>
              </Label>
              <Select
                value={form.accountId || "__none__"}
                onValueChange={(v) => setForm((f) => ({ ...f, accountId: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger style={{ background: "#0D1117", border: "1px solid #30363D", color: "#E6EDF3", height: 32, fontSize: 12 }}>
                  <SelectValue placeholder="No account linked" />
                </SelectTrigger>
                <SelectContent style={{ background: "#161B22", border: "1px solid #30363D" }}>
                  <SelectItem value="__none__" style={{ color: "#6E7681", fontSize: 12 }}>No account</SelectItem>
                  {accounts?.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)} style={{ color: "#C9D1D9", fontSize: 12 }}>
                      {a.name} ({a.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm" style={{ color: "#6E7681", fontSize: 12 }}>Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={createDebt.isPending}
              style={{ background: "#1F6FEB", color: "#fff", fontSize: 12 }}
            >
              {createDebt.isPending ? "Adding…" : "Add IOU"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
