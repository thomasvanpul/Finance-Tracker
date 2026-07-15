import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTransactions,
  useGetTransactionSummary,
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
  useListAccounts,
  getListTransactionsQueryKey,
  getGetTransactionSummaryQueryKey,
  getListAccountsQueryKey,
  getGetDashboardQueryKey,
} from "@workspace/api-client-react";
import { formatGbp, formatNative, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Plus, Trash2, Edit2, Search, X, ArrowLeftRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
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

type TxType = "income" | "expense" | "transfer";
type Currency = "GBP" | "USD" | "EUR" | "MYR" | "CNY" | "JPY" | "AUD" | "CAD" | "SGD" | "HKD" | "THB" | "INR";

interface TxForm {
  date: string;
  description: string;
  type: TxType;
  category: string;
  accountId: string;
  nativeAmount: string;
  currency: Currency;
}

const today = new Date().toISOString().slice(0, 10);
const EMPTY_FORM: TxForm = { date: today, description: "", type: "expense", category: "", accountId: "", nativeAmount: "", currency: "GBP" };

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

const TX_TYPE_COLOR: Record<TxType, string> = {
  income: "#3FB950",
  expense: "#F85149",
  transfer: "#58A6FF",
};

const CATEGORIES = [
  "Salary", "Freelance", "Investment Income", "Gift",
  "Rent / Mortgage", "Groceries", "Eating Out", "Coffee",
  "Transport", "Fuel", "Flights", "Accommodation",
  "Utilities", "Subscriptions", "Healthcare", "Insurance",
  "Shopping", "Electronics", "Clothing",
  "Entertainment", "Sport", "Education",
  "Transfer", "Savings", "Tax",
  "Other",
];

export default function Transactions() {
  const { data: transactions, isLoading, isError, error } = useListTransactions();
  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError } = useGetTransactionSummary();
  const { data: accounts } = useListAccounts();
  const createTx = useCreateTransaction();
  const updateTx = useUpdateTransaction();
  const deleteTx = useDeleteTransaction();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<TxForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | TxType>("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const hasFilters = search || filterType !== "all" || filterDateFrom || filterDateTo;

  const filtered = (transactions ?? []).filter((tx) => {
    if (filterType !== "all" && tx.type !== filterType) return false;
    if (filterDateFrom && tx.date < filterDateFrom) return false;
    if (filterDateTo && tx.date > filterDateTo) return false;
    if (search) {
      const q = search.toLowerCase();
      const desc = (tx.description ?? "").toLowerCase();
      const cat = (tx.category ?? "").toLowerCase();
      const acct = (tx.accountName ?? "").toLowerCase();
      if (!desc.includes(q) && !cat.includes(q) && !acct.includes(q)) return false;
    }
    return true;
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetTransactionSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  };

  const openAdd = () => {
    const first = accounts?.[0];
    setForm({ ...EMPTY_FORM, accountId: first ? String(first.id) : "", currency: (first?.currency as Currency) ?? "GBP" });
    setAddOpen(true);
  };

  const openEdit = (id: number) => {
    const tx = transactions?.find((t) => t.id === id);
    if (!tx) return;
    setForm({
      date: tx.date,
      description: tx.description,
      type: tx.type as TxType,
      category: tx.category,
      accountId: String(tx.accountId),
      nativeAmount: String(Math.abs(tx.nativeAmount)),
      currency: tx.currency as Currency,
    });
    setEditId(id);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    try {
      await createTx.mutateAsync({ data: { date: form.date, description: form.description, type: form.type, category: form.category, accountId: parseInt(form.accountId), nativeAmount: parseFloat(form.nativeAmount), currency: form.currency } });
      invalidate(); setAddOpen(false); toast({ title: "Transaction added" });
    } catch { toast({ title: "Failed to add transaction", variant: "destructive" }); }
    finally { setSubmitting(false); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (editId === null) return; setSubmitting(true);
    try {
      await updateTx.mutateAsync({ id: editId, data: { date: form.date, description: form.description, type: form.type, category: form.category, nativeAmount: parseFloat(form.nativeAmount), currency: form.currency } });
      invalidate(); setEditId(null); toast({ title: "Transaction updated" });
    } catch { toast({ title: "Failed to update", variant: "destructive" }); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this transaction?")) return;
    try { await deleteTx.mutateAsync({ id }); invalidate(); toast({ title: "Transaction deleted" }); }
    catch { toast({ title: "Failed to delete", variant: "destructive" }); }
  };

  const setField = <K extends keyof TxForm>(k: K, v: TxForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  if (isLoading || isSummaryLoading) {
    return <div className="space-y-4"><Skeleton className="h-6 w-48" /><Skeleton className="h-8 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <PageHeader
        icon={ArrowLeftRight}
        title="Transactions"
        subtitle="Every flow of capital, tracked and categorised"
        actions={
          <Button onClick={openAdd} size="sm" style={{ background: "#1F6FEB", color: "white", border: "none", borderRadius: 2, fontSize: 12 }}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Transaction
          </Button>
        }
      />

      {(isError || isSummaryError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load transactions</AlertTitle>
          <AlertDescription>{(error as any)?.message ?? "Could not reach the server."}</AlertDescription>
        </Alert>
      )}

      {/* category datalist for native autocomplete */}
      <datalist id="tx-categories">
        {CATEGORIES.map((c) => <option key={c} value={c} />)}
      </datalist>

      {/* Shared form fields used in both Add and Edit dialogs */}
      {(() => {
        const FormFields = (isEdit: boolean) => (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="tx-date">Date</Label>
                <Input id="tx-date" type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setField("type", v as TxType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-desc">Description</Label>
              <Input id="tx-desc" placeholder="e.g. Monthly Salary" value={form.description} onChange={(e) => setField("description", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-cat">Category</Label>
              <Input id="tx-cat" list="tx-categories" placeholder="e.g. Groceries, Salary…" value={form.category} onChange={(e) => setField("category", e.target.value)} required />
            </div>
            {!isEdit && (
              <div className="space-y-1.5">
                <Label>Account</Label>
                <Select value={form.accountId} onValueChange={(v) => {
                  const acct = accounts?.find((a) => String(a.id) === v);
                  setForm((f) => ({ ...f, accountId: v, currency: (acct?.currency as Currency) ?? f.currency }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {accounts?.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name} ({a.currency})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="tx-amount">Amount</Label>
                <Input id="tx-amount" type="number" step="0.01" min="0" placeholder="0.00" value={form.nativeAmount} onChange={(e) => setField("nativeAmount", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setField("currency", v as Currency)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["GBP","USD","EUR","MYR","CNY","JPY","AUD","CAD","SGD","HKD","THB","INR"] as Currency[]).map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );
        return (
          <>
            {/* Add dialog */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
                <form onSubmit={handleAdd}>
                  {FormFields(false)}
                  <DialogFooter className="mt-6">
                    <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" disabled={submitting}>{submitting ? "Adding…" : "Add Transaction"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            {/* Edit dialog */}
            <Dialog open={editId !== null} onOpenChange={(o) => !o && setEditId(null)}>
              <DialogContent>
                <DialogHeader><DialogTitle>Edit Transaction</DialogTitle></DialogHeader>
                <form onSubmit={handleEdit}>
                  {FormFields(true)}
                  <DialogFooter className="mt-6">
                    <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save Changes"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </>
        );
      })()}

      {/* Summary bar */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 border" style={{ borderColor: "#21262D", background: "#161B22" }}>
          {[
            { label: `Income (${summary.month})`, value: `+${formatGbp(summary.totalIncome)}`, color: "#3FB950" },
            { label: "Expenses", value: `-${formatGbp(summary.totalExpenses)}`, color: "#F85149" },
            { label: "Net", value: `${summary.netSavings > 0 ? "+" : ""}${formatGbp(summary.netSavings)}`, color: summary.netSavings >= 0 ? "#3FB950" : "#F85149" },
            { label: "Savings Rate", value: `${summary.savingsRate.toFixed(1)}%`, color: "#58A6FF" },
          ].map((s) => (
            <div key={s.label} className="px-3 sm:px-4 py-3 border-r border-b sm:border-b-0" style={{ borderColor: "#21262D" }}>
              <div className="text-xs mb-1 truncate" style={{ color: "#6E7681" }}>{s.label}</div>
              <div className="text-sm font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: "#484F58" }} />
          <Input
            placeholder="Search description, category, account…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 28, fontSize: 12, height: 30, background: "#161B22", border: "1px solid #30363D", borderRadius: 2, color: "#C9D1D9" }}
          />
        </div>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as "all" | TxType)}>
          <SelectTrigger style={{ width: 110, height: 30, fontSize: 12, background: "#161B22", border: "1px solid #30363D", borderRadius: 2 }}>
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={filterDateFrom}
          onChange={(e) => setFilterDateFrom(e.target.value)}
          style={{ width: 130, height: 30, fontSize: 12, background: "#161B22", border: "1px solid #30363D", borderRadius: 2, color: "#C9D1D9" }}
        />
        <span style={{ color: "#484F58", fontSize: 11 }}>to</span>
        <Input
          type="date"
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
          style={{ width: 130, height: 30, fontSize: 12, background: "#161B22", border: "1px solid #30363D", borderRadius: 2, color: "#C9D1D9" }}
        />
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearch(""); setFilterType("all"); setFilterDateFrom(""); setFilterDateTo(""); }}
            style={{ height: 30, fontSize: 11, color: "#8B949E", padding: "0 8px" }}
          >
            <X className="w-3 h-3 mr-1" />Clear
          </Button>
        )}
        <span className="ml-auto text-xs" style={{ color: "#484F58" }}>
          {filtered.length}{hasFilters ? ` of ${transactions?.length ?? 0}` : ""} transaction{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Transactions spreadsheet table */}
      <div className="border" style={{ borderColor: "#21262D" }}>
        <div className="flex items-center px-3 py-1.5 text-xs font-bold border-b" style={{ background: "#58A6FF22", borderColor: "#58A6FF44", color: "#58A6FF" }}>
          ▼ TRANSACTION LEDGER — {hasFilters ? `Filtered (${filtered.length})` : "All Entries"}
        </div>

        <div className="overflow-x-auto">
          {/* Column headers */}
          <div className="flex" style={{ marginLeft: 36 }}>
            {[["DATE", "90px"], ["DESCRIPTION", "1"], ["CATEGORY", "120px"], ["ACCOUNT", "150px"], ["TYPE", "90px"], ["AMOUNT", "130px"], ["GBP", "110px"], ["", "68px"]].map(([h, w]) => (
              <div key={h as string} style={{ ...TH, flex: w === "1" ? 1 : undefined, width: w !== "1" ? w as string : undefined, minWidth: w !== "1" ? w as string : undefined, textAlign: ["AMOUNT", "GBP", ""].includes(h as string) ? "right" : "left" }}>
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          {filtered.map((tx, i) => (
            <div
              key={tx.id}
              className="flex items-center border-b xls-row"
              style={{ borderColor: "rgba(33,38,45,0.5)", background: "#0D1117" }}
            >
              <div className="flex-shrink-0 flex items-center justify-center text-xs border-r" style={{ width: 36, color: "#484F58", borderColor: "#21262D", alignSelf: "stretch" }}>
                {i + 2}
              </div>
              <div style={{ width: 90, minWidth: 90, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#8B949E", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                {formatDate(tx.date)}
              </div>
              <div style={{ flex: 1, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#C9D1D9", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {tx.description}
              </div>
              <div style={{ width: 120, minWidth: 120, padding: "7px 12px", borderRight: "1px solid #21262D" }}>
                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 2, background: "#21262D", color: "#8B949E" }}>
                  {tx.category}
                </span>
              </div>
              <div style={{ width: 150, minWidth: 150, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#8B949E", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {tx.accountName}
              </div>
              <div style={{ width: 90, minWidth: 90, padding: "7px 12px", borderRight: "1px solid #21262D" }}>
                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 2, background: TX_TYPE_COLOR[tx.type as TxType] + "22", color: TX_TYPE_COLOR[tx.type as TxType], textTransform: "uppercase", letterSpacing: "0.3px" }}>
                  {tx.type}
                </span>
              </div>
              <div style={{ width: 130, minWidth: 130, padding: "7px 12px", borderRight: "1px solid #21262D", textAlign: "right", color: tx.type === "income" ? "#3FB950" : "#F85149", fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums", background: tx.type === "income" ? "rgba(63,185,80,0.04)" : tx.type === "expense" ? "rgba(248,81,73,0.04)" : "transparent" }}>
                {tx.type === "income" ? "+" : tx.type === "expense" ? "-" : ""}
                {formatNative(Math.abs(tx.nativeAmount), tx.currency)}
              </div>
              <div style={{ width: 110, minWidth: 110, padding: "7px 12px", borderRight: "1px solid #21262D", textAlign: "right", color: tx.type === "income" ? "#3FB950" : "#F85149", fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {tx.type === "income" ? "+" : tx.type === "expense" ? "-" : ""}
                {formatGbp(Math.abs(tx.gbpValue))}
              </div>
              <div style={{ width: 68, minWidth: 68, padding: "4px 4px", display: "flex", justifyContent: "flex-end", gap: 2 }}>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(tx.id)}>
                  <Edit2 className="w-3.5 h-3.5" style={{ color: "#8B949E" }} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(tx.id)}>
                  <Trash2 className="w-3.5 h-3.5" style={{ color: "#F85149" }} />
                </Button>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="flex items-center border-b" style={{ borderColor: "rgba(33,38,45,0.5)" }}>
              <div style={{ width: 36, borderRight: "1px solid #21262D", alignSelf: "stretch" }} />
              <div className="flex-1 text-center py-8 text-xs" style={{ color: "#484F58" }}>
                {hasFilters ? "No transactions match the current filters." : "No transactions yet — add one to get started."}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
