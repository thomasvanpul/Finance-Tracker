import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CsvImportModal } from "@/components/csv-import";
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
import { applyAutoCategory } from "@/lib/auto-cat";
import { loadTemplates, saveTemplate, deleteTemplate, type TxTemplate } from "@/lib/tx-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Plus, Trash2, Edit2, Search, X, ArrowLeftRight, Save } from "lucide-react";
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

interface SplitLine {
  id: string;
  category: string;
  amount: string;
}

interface MerchantGroup {
  description: string;
  count: number;
  total: number;
  txIds: number[];
  expanded: boolean;
}

const today = new Date().toISOString().slice(0, 10);
const EMPTY_FORM: TxForm = { date: today, description: "", type: "expense", category: "", accountId: "", nativeAmount: "", currency: "GBP" };

const BULK_CATEGORIES = [
  "Food & Drink", "Transport", "Shopping", "Bills & Utilities",
  "Entertainment", "Health", "Travel", "Income", "Transfer", "Other",
];

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

const TH: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 10,
  fontWeight: 600,
  color: "var(--ft-dim)",
  background: "var(--ft-surface)",
  borderBottom: "2px solid var(--ft-border2)",
  borderRight: "1px solid var(--ft-raised)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.4px",
  whiteSpace: "nowrap" as const,
};

const TX_TYPE_COLOR: Record<TxType, string> = {
  income: "var(--ft-green)",
  expense: "var(--ft-red)",
  transfer: "var(--ft-blue)",
};

function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function getMonthStart(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  return d.toISOString().slice(0, 10);
}

function getMonthEnd(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset + 1, 0);
  return d.toISOString().slice(0, 10);
}

function get3MonthsAgo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

// ── CSV export ──────────────────────────────────────────────────────────────

function exportCsv(rows: Array<{
  date: string;
  description: string;
  category: string;
  type: string;
  nativeAmount: number;
  currency: string;
  accountName: string;
}>) {
  const header = ["Date", "Description", "Category", "Type", "Amount", "Currency", "Account"];
  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [r.date, r.description, r.category, r.type, Math.abs(r.nativeAmount), r.currency, r.accountName]
        .map(escape)
        .join(",")
    ),
  ];
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const filename = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Transactions() {
  const { data: transactions, isLoading, isError, error } = useListTransactions();
  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError } = useGetTransactionSummary();
  const { data: accounts } = useListAccounts();
  const createTx = useCreateTransaction();
  const updateTx = useUpdateTransaction();
  const deleteTx = useDeleteTransaction();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── core dialog state ───────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [form, setForm] = useState<TxForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // ── filters ─────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | TxType>("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");

  // ── bulk selection ───────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkCatOpen, setBulkCatOpen] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // ── merchant grouping ────────────────────────────────────────────────────
  const [groupByMerchant, setGroupByMerchant] = useState(false);
  const [expandedMerchants, setExpandedMerchants] = useState<Set<string>>(new Set());

  // ── group by day ─────────────────────────────────────────────────────────
  const [groupByDay, setGroupByDay] = useState(false);

  // ── split transaction ─────────────────────────────────────────────────────
  const [splitTxId, setSplitTxId] = useState<number | null>(null);
  const [splitLines, setSplitLines] = useState<SplitLine[]>([]);
  const [splitSubmitting, setSplitSubmitting] = useState(false);

  // ── templates ─────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<TxTemplate[]>(() => loadTemplates());
  const [autoCatFilled, setAutoCatFilled] = useState(false);

  // ── pending delete (soft-delete with 3s undo window) ─────────────────────
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // ── search input ref for / shortcut ─────────────────────────────────────
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── escape key deselects + / focuses search ──────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedIds(new Set());
        setBulkCatOpen(false);
        return;
      }
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const hasFilters = search || filterType !== "all" || filterDateFrom || filterDateTo || amountMin || amountMax;

  const filtered = (transactions ?? []).filter((tx) => {
    if (filterType !== "all" && tx.type !== filterType) return false;
    if (filterDateFrom && tx.date < filterDateFrom) return false;
    if (filterDateTo && tx.date > filterDateTo) return false;
    if (amountMin !== "" && tx.gbpValue < parseFloat(amountMin)) return false;
    if (amountMax !== "" && tx.gbpValue > parseFloat(amountMax)) return false;
    if (search) {
      const q = search.toLowerCase();
      const desc = (tx.description ?? "").toLowerCase();
      const cat = (tx.category ?? "").toLowerCase();
      const acct = (tx.accountName ?? "").toLowerCase();
      if (!desc.includes(q) && !cat.includes(q) && !acct.includes(q)) return false;
    }
    return true;
  });

  const filteredAvg = filtered.length > 0
    ? filtered.reduce((acc, tx) => acc + tx.gbpValue, 0) / filtered.length
    : 0;

  // ── quick date range helpers ─────────────────────────────────────────────
  const activeQuickRange = (() => {
    if (!filterDateFrom && !filterDateTo) return "all";
    if (filterDateFrom === today && filterDateTo === today) return "today";
    if (filterDateFrom === getWeekStart() && !filterDateTo) return "week";
    if (filterDateFrom === getMonthStart() && !filterDateTo) return "month";
    if (filterDateFrom === getMonthStart(-1) && filterDateTo === getMonthEnd(-1)) return "lastmonth";
    if (filterDateFrom === get3MonthsAgo() && !filterDateTo) return "3m";
    return null;
  })();

  const applyQuickRange = (range: string) => {
    switch (range) {
      case "today":
        setFilterDateFrom(today);
        setFilterDateTo(today);
        break;
      case "week":
        setFilterDateFrom(getWeekStart());
        setFilterDateTo("");
        break;
      case "month":
        setFilterDateFrom(getMonthStart());
        setFilterDateTo("");
        break;
      case "lastmonth":
        setFilterDateFrom(getMonthStart(-1));
        setFilterDateTo(getMonthEnd(-1));
        break;
      case "3m":
        setFilterDateFrom(get3MonthsAgo());
        setFilterDateTo("");
        break;
      case "all":
        setFilterDateFrom("");
        setFilterDateTo("");
        break;
    }
  };

  // ── merchant groups ──────────────────────────────────────────────────────
  const merchantGroups: MerchantGroup[] = (() => {
    if (!groupByMerchant) return [];
    const map = new Map<string, MerchantGroup>();
    for (const tx of filtered) {
      const key = tx.description ?? "(no description)";
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.total += tx.type === "income" ? tx.gbpValue : -tx.gbpValue;
        existing.txIds.push(tx.id);
      } else {
        map.set(key, {
          description: key,
          count: 1,
          total: tx.type === "income" ? tx.gbpValue : -tx.gbpValue,
          txIds: [tx.id],
          expanded: expandedMerchants.has(key),
        });
      }
    }
    return Array.from(map.values()).map((g) => ({ ...g, expanded: expandedMerchants.has(g.description) }));
  })();

  // ── day groups ───────────────────────────────────────────────────────────
  const dayGroups: Array<{ date: string; txs: typeof filtered; net: number }> = (() => {
    if (!groupByDay) return [];
    const map = new Map<string, typeof filtered>();
    for (const tx of filtered) {
      const key = tx.date;
      const existing = map.get(key);
      if (existing) {
        existing.push(tx);
      } else {
        map.set(key, [tx]);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, txs]) => ({
        date,
        txs,
        net: txs.reduce((acc, tx) => acc + (tx.type === "income" ? tx.gbpValue : tx.type === "expense" ? -tx.gbpValue : 0), 0),
      }));
  })();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetTransactionSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  }, [queryClient]);

  const openAdd = () => {
    const first = accounts?.[0];
    setForm({ ...EMPTY_FORM, accountId: first ? String(first.id) : "", currency: (first?.currency as Currency) ?? "GBP" });
    setAutoCatFilled(false);
    setTemplates(loadTemplates());
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

  const openSplit = (id: number) => {
    const tx = transactions?.find((t) => t.id === id);
    if (!tx) return;
    const half = (Math.abs(tx.nativeAmount) / 2).toFixed(2);
    setSplitLines([
      { id: crypto.randomUUID(), category: tx.category, amount: half },
      { id: crypto.randomUUID(), category: "", amount: half },
    ]);
    setSplitTxId(id);
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

  const commitDelete = useCallback(async (id: number) => {
    deleteTimers.current.delete(id);
    setPendingDeleteIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    try {
      await deleteTx.mutateAsync({ id });
      invalidate();
    } catch {
      toast({ title: "Failed to delete transaction", variant: "destructive" });
    }
  }, [deleteTx, invalidate, toast]);

  const handleDelete = useCallback((id: number) => {
    setPendingDeleteIds((prev) => new Set([...prev, id]));
    const { id: toastId, dismiss } = toast({
      title: "Deleting in 3s",
      description: (
        <button
          type="button"
          onClick={() => {
            const timer = deleteTimers.current.get(id);
            if (timer) clearTimeout(timer);
            deleteTimers.current.delete(id);
            setPendingDeleteIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
            dismiss();
          }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-accent)", fontFamily: "var(--font-mono)", fontSize: 12, padding: 0, fontWeight: 700 }}
        >
          Undo
        </button>
      ),
    });
    void toastId;
    const timer = setTimeout(() => { commitDelete(id); dismiss(); }, 3000);
    deleteTimers.current.set(id, timer);
  }, [toast, commitDelete]);

  // ── bulk actions ─────────────────────────────────────────────────────────
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const isAllSelected = filtered.length > 0 && filtered.every((tx) => selectedIds.has(tx.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((tx) => tx.id)));
    }
  };

  const handleBulkDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    const count = ids.length;
    ids.forEach((id) => {
      setPendingDeleteIds((prev) => new Set([...prev, id]));
    });
    setSelectedIds(new Set());
    const { dismiss } = toast({
      title: `Deleting ${count} transaction${count !== 1 ? "s" : ""} in 3s`,
      description: (
        <button
          type="button"
          onClick={() => {
            ids.forEach((id) => {
              const timer = deleteTimers.current.get(id);
              if (timer) clearTimeout(timer);
              deleteTimers.current.delete(id);
            });
            setPendingDeleteIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
            dismiss();
          }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-accent)", fontFamily: "var(--font-mono)", fontSize: 12, padding: 0, fontWeight: 700 }}
        >
          Undo
        </button>
      ),
    });
    const timer = setTimeout(async () => {
      dismiss();
      setBulkSubmitting(true);
      ids.forEach((id) => deleteTimers.current.delete(id));
      setPendingDeleteIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
      try {
        await Promise.all(ids.map((id) => deleteTx.mutateAsync({ id })));
        invalidate();
      } catch {
        toast({ title: "Failed to delete some transactions", variant: "destructive" });
      } finally {
        setBulkSubmitting(false);
      }
    }, 3000);
    ids.forEach((id) => deleteTimers.current.set(id, timer));
  }, [selectedIds, toast, deleteTx, invalidate]);

  const handleBulkRecategorise = async (category: string) => {
    setBulkCatOpen(false);
    setBulkSubmitting(true);
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(
        ids.map((id) => {
          const tx = transactions?.find((t) => t.id === id);
          if (!tx) return Promise.resolve();
          return updateTx.mutateAsync({ id, data: { date: tx.date, description: tx.description, type: tx.type, category, nativeAmount: tx.nativeAmount, currency: tx.currency } });
        })
      );
      invalidate();
      setSelectedIds(new Set());
      toast({ title: `Re-categorised ${ids.length} transaction${ids.length !== 1 ? "s" : ""} to "${category}"` });
    } catch {
      toast({ title: "Failed to re-categorise some transactions", variant: "destructive" });
    } finally {
      setBulkSubmitting(false);
    }
  };

  // ── split submit ─────────────────────────────────────────────────────────
  const handleSplitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (splitTxId === null) return;
    const tx = transactions?.find((t) => t.id === splitTxId);
    if (!tx) return;
    setSplitSubmitting(true);
    try {
      const [first, ...rest] = splitLines;
      await updateTx.mutateAsync({
        id: splitTxId,
        data: {
          date: tx.date,
          description: tx.description,
          type: tx.type,
          category: first.category,
          nativeAmount: tx.type === "income" ? parseFloat(first.amount) : -parseFloat(first.amount),
          currency: tx.currency,
        },
      });
      await Promise.all(
        rest.map((line) =>
          createTx.mutateAsync({
            data: {
              date: tx.date,
              description: `[Split] ${tx.description}`,
              type: tx.type,
              category: line.category,
              accountId: tx.accountId,
              nativeAmount: tx.type === "income" ? parseFloat(line.amount) : -parseFloat(line.amount),
              currency: tx.currency,
            },
          })
        )
      );
      invalidate();
      setSplitTxId(null);
      toast({ title: "Transaction split successfully" });
    } catch {
      toast({ title: "Failed to split transaction", variant: "destructive" });
    } finally {
      setSplitSubmitting(false);
    }
  };

  const setField = <K extends keyof TxForm>(k: K, v: TxForm[K]) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "description" && typeof v === "string") {
        const suggested = applyAutoCategory(v);
        if (suggested && !f.category) {
          setAutoCatFilled(true);
          return { ...next, category: suggested };
        }
      }
      if (k === "category") {
        setAutoCatFilled(false);
      }
      return next;
    });
  };

  const applyTemplate = (t: TxTemplate) => {
    setAutoCatFilled(false);
    setForm((f) => ({
      ...f,
      type: t.type as TxForm["type"],
      category: t.category,
      description: t.description,
      currency: t.currency as TxForm["currency"],
    }));
  };

  const handleSaveTemplate = () => {
    if (!form.description) return;
    const name = form.description.trim().slice(0, 40);
    const t: TxTemplate = {
      id: crypto.randomUUID(),
      name,
      type: form.type,
      category: form.category,
      description: form.description,
      currency: form.currency,
    };
    saveTemplate(t);
    setTemplates(loadTemplates());
    toast({ title: `Template "${name}" saved` });
  };

  const handleDeleteTemplate = (id: string) => {
    deleteTemplate(id);
    setTemplates(loadTemplates());
  };

  if (isLoading || isSummaryLoading) {
    return <div className="space-y-4"><Skeleton className="h-6 w-48" /><Skeleton className="h-8 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  // ── split modal data ────────────────────────────────────────────────────
  const splitTx = splitTxId !== null ? transactions?.find((t) => t.id === splitTxId) : null;
  const splitTotal = splitLines.reduce((acc, l) => acc + (parseFloat(l.amount) || 0), 0);
  const splitOriginal = splitTx ? Math.abs(splitTx.nativeAmount) : 0;
  const splitRemaining = parseFloat((splitOriginal - splitTotal).toFixed(2));

  // ── shared form fields ───────────────────────────────────────────────────
  const FormFields = (isEdit: boolean) => (
    <div className="space-y-4">
      {!isEdit && templates.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Templates</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {templates.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                <button
                  type="button"
                  onClick={() => applyTemplate(t)}
                  style={{
                    fontSize: 10,
                    padding: "3px 8px",
                    background: "var(--ft-raised)",
                    border: "1px solid var(--ft-border2)",
                    borderRight: "none",
                    borderRadius: "2px 0 0 2px",
                    color: "var(--ft-muted)",
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {t.name}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteTemplate(t.id)}
                  aria-label={`Delete template ${t.name}`}
                  style={{
                    fontSize: 10,
                    padding: "3px 5px",
                    background: "var(--ft-raised)",
                    border: "1px solid var(--ft-border2)",
                    borderRadius: "0 2px 2px 0",
                    color: "var(--ft-dim)",
                    cursor: "pointer",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
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
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Input id="tx-desc" placeholder="e.g. Monthly Salary" value={form.description} onChange={(e) => setField("description", e.target.value)} required style={{ flex: 1 }} />
          {!isEdit && form.description && (
            <button
              type="button"
              onClick={handleSaveTemplate}
              title="Save as template"
              style={{ flexShrink: 0, background: "none", border: "1px solid var(--ft-border2)", borderRadius: 2, padding: "4px 6px", cursor: "pointer", color: "var(--ft-muted)" }}
            >
              <Save className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Label htmlFor="tx-cat">Category</Label>
          {autoCatFilled && (
            <span
              style={{
                fontSize: 9,
                padding: "1px 5px",
                background: "rgba(6,182,212,0.12)",
                border: "1px solid var(--ft-cyan)",
                borderRadius: 2,
                color: "var(--ft-cyan)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.06em",
                cursor: "pointer",
              }}
              onClick={() => { setField("category", ""); setAutoCatFilled(false); }}
              title="Auto-filled — click to clear"
            >
              auto ×
            </span>
          )}
        </div>
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

  const quickRangeBtn = (label: string, key: string) => (
    <button
      key={key}
      type="button"
      onClick={() => applyQuickRange(key)}
      style={{
        height: 22,
        padding: "0 7px",
        fontSize: 10,
        fontFamily: "var(--font-mono)",
        background: activeQuickRange === key ? "rgba(245,158,11,0.12)" : "var(--ft-surface)",
        border: `1px solid ${activeQuickRange === key ? "var(--ft-amber)" : "var(--ft-border2)"}`,
        borderRadius: 2,
        color: activeQuickRange === key ? "var(--ft-amber)" : "var(--ft-dim)",
        cursor: "pointer",
        whiteSpace: "nowrap" as const,
        transition: "all 0.1s",
      }}
    >
      {label}
    </button>
  );

  const TxRow = ({ tx, indented = false }: { tx: typeof filtered[number]; indented?: boolean }) => (
    <div
      key={tx.id}
      className="flex items-center border-b xls-row"
      style={{ borderColor: "rgba(33,38,45,0.5)", background: selectedIds.has(tx.id) ? "#1F3A5F55" : "var(--ft-base)", opacity: pendingDeleteIds.has(tx.id) ? 0.4 : 1, textDecoration: pendingDeleteIds.has(tx.id) ? "line-through" : "none", transition: "opacity 0.2s" }}
    >
      <div style={{ width: 36, minWidth: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid var(--ft-raised)", alignSelf: "stretch" }}>
        <input
          type="checkbox"
          checked={selectedIds.has(tx.id)}
          onChange={() => toggleSelect(tx.id)}
          style={{ cursor: "pointer", accentColor: "var(--ft-blue)" }}
          aria-label={`Select transaction ${tx.description}`}
        />
      </div>
      <div style={{ width: 90, minWidth: 90, padding: indented ? "7px 12px 7px 20px" : "7px 12px", borderRight: "1px solid var(--ft-raised)", color: "var(--ft-muted)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
        {formatDate(tx.date)}
      </div>
      <div style={{ flex: 1, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", color: "var(--ft-text)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {tx.description}
      </div>
      <div style={{ width: 120, minWidth: 120, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)" }}>
        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 2, background: "var(--ft-raised)", color: "var(--ft-muted)" }}>
          {tx.category}
        </span>
      </div>
      <div style={{ width: 150, minWidth: 150, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", color: "var(--ft-muted)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {tx.accountName}
      </div>
      <div style={{ width: 90, minWidth: 90, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)" }}>
        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 2, background: TX_TYPE_COLOR[tx.type as TxType] + "22", color: TX_TYPE_COLOR[tx.type as TxType], textTransform: "uppercase", letterSpacing: "0.3px" }}>
          {tx.type}
        </span>
      </div>
      <div style={{ width: 130, minWidth: 130, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", textAlign: "right", color: tx.type === "income" ? "var(--ft-green)" : "var(--ft-red)", fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums", background: tx.type === "income" ? "rgba(63,185,80,0.04)" : tx.type === "expense" ? "rgba(248,81,73,0.04)" : "transparent" }}>
        {tx.type === "income" ? "+" : tx.type === "expense" ? "-" : ""}
        {formatNative(Math.abs(tx.nativeAmount), tx.currency)}
      </div>
      <div className="pnum" style={{ width: 110, minWidth: 110, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", textAlign: "right", color: tx.type === "income" ? "var(--ft-green)" : "var(--ft-red)", fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        {tx.type === "income" ? "+" : tx.type === "expense" ? "-" : ""}
        {formatGbp(Math.abs(tx.gbpValue))}
      </div>
      <div style={{ width: 100, minWidth: 100, padding: "4px 4px", display: "flex", justifyContent: "flex-end", gap: 2 }}>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openSplit(tx.id)} title="Split transaction">
          <span style={{ color: "var(--ft-muted)", fontSize: 13 }}>⊕</span>
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(tx.id)}>
          <Edit2 className="w-3.5 h-3.5" style={{ color: "var(--ft-muted)" }} />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(tx.id)}>
          <Trash2 className="w-3.5 h-3.5" style={{ color: "var(--ft-red)" }} />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <CsvImportModal
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onSuccess={() => { invalidate(); setCsvOpen(false); }}
      />

      <datalist id="tx-categories">
        {CATEGORIES.map((c) => <option key={c} value={c} />)}
      </datalist>

      {/* ── Add dialog ── */}
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

      {/* ── Edit dialog ── */}
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

      {/* ── Split dialog ── */}
      <Dialog open={splitTxId !== null} onOpenChange={(o) => !o && setSplitTxId(null)}>
        <DialogContent style={{ maxWidth: 520 }}>
          <DialogHeader><DialogTitle>Split Transaction</DialogTitle></DialogHeader>
          {splitTx && (
            <form onSubmit={handleSplitSubmit}>
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", borderRadius: 2, padding: "10px 14px", marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "var(--ft-dim)", marginBottom: 4 }}>ORIGINAL TRANSACTION</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, color: "var(--ft-text)", fontWeight: 600 }}>{splitTx.description}</div>
                    <div style={{ fontSize: 11, color: "var(--ft-muted)", marginTop: 2 }}>{formatDate(splitTx.date)} · {splitTx.category}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: splitTx.type === "income" ? "var(--ft-green)" : "var(--ft-red)", fontVariantNumeric: "tabular-nums" }}>
                    {formatNative(Math.abs(splitTx.nativeAmount), splitTx.currency)}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "var(--ft-dim)", marginBottom: 8, letterSpacing: "0.4px", textTransform: "uppercase" }}>Split Lines</div>
                <div className="space-y-2">
                  {splitLines.map((line, idx) => (
                    <div key={line.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Input
                        list="tx-categories"
                        placeholder="Category"
                        value={line.category}
                        onChange={(e) => setSplitLines((prev) => prev.map((l) => l.id === line.id ? { ...l, category: e.target.value } : l))}
                        required
                        style={{ flex: 1, fontSize: 12, height: 32, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-text)" }}
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0.00"
                        value={line.amount}
                        onChange={(e) => setSplitLines((prev) => prev.map((l) => l.id === line.id ? { ...l, amount: e.target.value } : l))}
                        required
                        style={{ width: 100, fontSize: 12, height: 32, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-text)", textAlign: "right" }}
                      />
                      {splitLines.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setSplitLines((prev) => prev.filter((l) => l.id !== line.id))}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-red)", padding: "0 4px", fontSize: 14, lineHeight: 1 }}
                          aria-label={`Remove split line ${idx + 1}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--ft-raised)", borderBottom: "1px solid var(--ft-raised)", marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "var(--ft-muted)" }}>
                  Total split: <span style={{ color: "var(--ft-text)", fontVariantNumeric: "tabular-nums" }}>{splitTx.currency} {splitTotal.toFixed(2)}</span>
                </div>
                <div style={{ fontSize: 11, color: splitRemaining === 0 ? "var(--ft-green)" : splitRemaining < 0 ? "var(--ft-red)" : "#F0A030" }}>
                  {splitRemaining === 0 ? "Balanced" : splitRemaining > 0 ? `Remaining: ${splitTx.currency} ${splitRemaining.toFixed(2)}` : `Over by: ${splitTx.currency} ${Math.abs(splitRemaining).toFixed(2)}`}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSplitLines((prev) => [...prev, { id: crypto.randomUUID(), category: "", amount: "" }])}
                style={{ background: "none", border: "1px dashed var(--ft-border2)", borderRadius: 2, color: "var(--ft-muted)", fontSize: 11, cursor: "pointer", padding: "5px 10px", marginBottom: 16, width: "100%" }}
              >
                + Add line
              </button>

              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                <Button
                  type="submit"
                  disabled={splitSubmitting || splitRemaining !== 0}
                  title={splitRemaining !== 0 ? "Split amounts must sum to original" : undefined}
                >
                  {splitSubmitting ? "Splitting…" : "Split Transaction"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Page header ── */}
      <PageHeader
        icon={ArrowLeftRight}
        title="Transactions"
        subtitle="Every flow of capital, tracked and categorised"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              onClick={() => exportCsv(filtered)}
              size="sm"
              style={{ background: "var(--ft-raised)", color: "var(--ft-muted)", border: "1px solid var(--ft-border)", borderRadius: 2, fontSize: 12 }}
            >
              ↓ Export CSV
            </Button>
            <Button
              onClick={() => setCsvOpen(true)}
              size="sm"
              style={{ background: "var(--ft-raised)", color: "var(--ft-muted)", border: "1px solid var(--ft-border)", borderRadius: 2, fontSize: 12 }}
            >
              ↑ Import CSV
            </Button>
            <Button onClick={openAdd} size="sm" style={{ background: "var(--ft-blue)", color: "white", border: "none", borderRadius: 2, fontSize: 12 }}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Transaction
            </Button>
          </div>
        }
      />

      {(isError || isSummaryError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load transactions</AlertTitle>
          <AlertDescription>{(error as Error)?.message ?? "Could not reach the server."}</AlertDescription>
        </Alert>
      )}

      {/* ── Summary bar ── */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-6 border" style={{ borderColor: "var(--ft-border)", background: "var(--ft-surface)" }}>
          {[
            { label: `Income (${summary.month})`, value: `+${formatGbp(summary.totalIncome)}`, color: "var(--ft-green)" },
            { label: "Expenses", value: `-${formatGbp(summary.totalExpenses)}`, color: "var(--ft-red)" },
            { label: "Net", value: `${summary.netSavings > 0 ? "+" : ""}${formatGbp(summary.netSavings)}`, color: summary.netSavings >= 0 ? "var(--ft-green)" : "var(--ft-red)" },
            { label: "Savings Rate", value: `${summary.savingsRate.toFixed(1)}%`, color: "var(--ft-blue)" },
            { label: `Filtered (${filtered.length} of ${transactions?.length ?? 0})`, value: `${filtered.length} tx`, color: "var(--ft-cyan)" },
            { label: "Avg / Tx", value: formatGbp(Math.abs(filteredAvg)), color: "var(--ft-amber)" },
          ].map((s) => (
            <div key={s.label} className="px-3 sm:px-4 py-3 border-r border-b sm:border-b-0" style={{ borderColor: "var(--ft-border)" }}>
              <div className="text-xs mb-1 truncate" style={{ color: "var(--ft-dim)" }}>{s.label}</div>
              <div className={`text-sm font-bold font-mono${s.value.includes("£") ? " pnum" : ""}`} style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filter bar ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Row 1: search + type */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: "var(--ft-dim)" }} />
            <Input
              ref={searchInputRef}
              placeholder="Search description, category, account… ( / )"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 28, fontSize: 12, height: 30, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-text)" }}
            />
          </div>
          <Select value={filterType} onValueChange={(v) => setFilterType(v as "all" | TxType)}>
            <SelectTrigger style={{ width: 110, height: 30, fontSize: 12, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", borderRadius: 2 }}>
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(""); setFilterType("all"); setFilterDateFrom(""); setFilterDateTo(""); setAmountMin(""); setAmountMax(""); }}
              style={{ height: 30, fontSize: 11, color: "var(--ft-muted)", padding: "0 8px" }}
            >
              <X className="w-3 h-3 mr-1" />Clear
            </Button>
          )}
          <span className="ml-auto text-xs" style={{ color: "var(--ft-dim)" }}>
            {filtered.length}{hasFilters ? ` of ${transactions?.length ?? 0}` : ""} transaction{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Row 2: quick date ranges + date inputs + amount range */}
        <div className="flex flex-wrap gap-2 items-center">
          <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
            {quickRangeBtn("Today", "today")}
            {quickRangeBtn("This Week", "week")}
            {quickRangeBtn("This Month", "month")}
            {quickRangeBtn("Last Month", "lastmonth")}
            {quickRangeBtn("Last 3M", "3m")}
            {quickRangeBtn("All", "all")}
          </div>
          <div style={{ width: 1, height: 20, background: "var(--ft-border2)", margin: "0 2px" }} />
          <Input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            style={{ width: 130, height: 30, fontSize: 12, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-text)" }}
          />
          <span style={{ color: "var(--ft-dim)", fontSize: 11 }}>to</span>
          <Input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            style={{ width: 130, height: 30, fontSize: 12, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-text)" }}
          />
          <div style={{ width: 1, height: 20, background: "var(--ft-border2)", margin: "0 2px" }} />
          <Input
            type="number"
            placeholder="Min £"
            value={amountMin}
            min="0"
            step="0.01"
            onChange={(e) => setAmountMin(e.target.value)}
            style={{ width: 80, height: 30, fontSize: 12, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-text)" }}
          />
          <span style={{ color: "var(--ft-dim)", fontSize: 11 }}>–</span>
          <Input
            type="number"
            placeholder="Max £"
            value={amountMax}
            min="0"
            step="0.01"
            onChange={(e) => setAmountMax(e.target.value)}
            style={{ width: 80, height: 30, fontSize: 12, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-text)" }}
          />
        </div>
      </div>

      {/* ── Bulk action bar ── */}
      {selectedIds.size > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            background: "#1F3A5F",
            border: "1px solid var(--ft-blue)",
            borderRadius: 2,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--ft-blue)", fontWeight: 600, minWidth: 80 }}>
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={bulkSubmitting}
            style={{ fontSize: 11, padding: "3px 10px", background: "var(--ft-red)22", border: "1px solid var(--ft-red)", borderRadius: 2, color: "var(--ft-red)", cursor: "pointer", fontFamily: "var(--font-mono)" }}
          >
            {bulkSubmitting ? "Deleting…" : "Delete selected"}
          </button>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setBulkCatOpen((v) => !v)}
              disabled={bulkSubmitting}
              style={{ fontSize: 11, padding: "3px 10px", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-text)", cursor: "pointer", fontFamily: "var(--font-mono)" }}
            >
              Re-categorise ▾
            </button>
            {bulkCatOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  zIndex: 50,
                  background: "var(--ft-surface)",
                  border: "1px solid var(--ft-border2)",
                  borderRadius: 2,
                  minWidth: 180,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                }}
              >
                {BULK_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleBulkRecategorise(cat)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "6px 12px",
                      fontSize: 12,
                      color: "var(--ft-text)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "var(--font-mono)",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--ft-raised)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setSelectedIds(new Set()); setBulkCatOpen(false); }}
            style={{ marginLeft: "auto", fontSize: 11, padding: "3px 8px", background: "none", border: "none", color: "var(--ft-muted)", cursor: "pointer" }}
          >
            ✕ Clear
          </button>
        </div>
      )}

      {/* ── Transaction ledger ── */}
      <div className="border" style={{ borderColor: "var(--ft-border)" }}>
        <div className="flex items-center px-3 py-1.5 text-xs font-bold border-b" style={{ background: "var(--ft-blue)22", borderColor: "var(--ft-blue)44", color: "var(--ft-blue)" }}>
          <span>▼ TRANSACTION LEDGER — {hasFilters ? `Filtered (${filtered.length})` : "All Entries"}</span>
          {groupByMerchant && <span style={{ marginLeft: 8, fontWeight: 400, color: "var(--ft-muted)" }}>· grouped by merchant</span>}
          {groupByDay && !groupByMerchant && <span style={{ marginLeft: 8, fontWeight: 400, color: "var(--ft-muted)" }}>· grouped by day</span>}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => { setGroupByDay((v) => !v); if (groupByMerchant) setGroupByMerchant(false); }}
              style={{
                height: 22,
                padding: "0 8px",
                fontSize: 10,
                background: groupByDay ? "rgba(96,165,250,0.08)" : "transparent",
                border: `1px solid ${groupByDay ? "var(--ft-blue)" : "var(--ft-border2)"}`,
                borderRadius: 2,
                color: groupByDay ? "var(--ft-blue)" : "var(--ft-dim)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontFamily: "var(--font-mono)",
              }}
            >
              {groupByDay ? "⊞ By Day" : "⊟ By Day"}
            </button>
            <button
              type="button"
              onClick={() => { setGroupByMerchant((v) => !v); setExpandedMerchants(new Set()); if (groupByDay) setGroupByDay(false); }}
              style={{
                height: 22,
                padding: "0 8px",
                fontSize: 10,
                background: groupByMerchant ? "rgba(96,165,250,0.08)" : "transparent",
                border: `1px solid ${groupByMerchant ? "var(--ft-blue)" : "var(--ft-border2)"}`,
                borderRadius: 2,
                color: groupByMerchant ? "var(--ft-blue)" : "var(--ft-dim)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontFamily: "var(--font-mono)",
              }}
            >
              {groupByMerchant ? "⊞ By Merchant" : "⊟ By Merchant"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {/* Column headers */}
          <div style={{ display: "flex" }}>
            <div style={{ ...TH, width: 36, minWidth: 36, display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 0" }}>
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={toggleSelectAll}
                style={{ cursor: "pointer", accentColor: "var(--ft-blue)" }}
                aria-label="Select all"
              />
            </div>
            {[["DATE", "90px"], ["DESCRIPTION", "1"], ["CATEGORY", "120px"], ["ACCOUNT", "150px"], ["TYPE", "90px"], ["AMOUNT", "130px"], ["GBP", "110px"], ["", "100px"]].map(([h, w]) => (
              <div key={h as string} style={{ ...TH, flex: w === "1" ? 1 : undefined, width: w !== "1" ? w as string : undefined, minWidth: w !== "1" ? w as string : undefined, textAlign: ["AMOUNT", "GBP", ""].includes(h as string) ? "right" : "left" }}>
                {h}
              </div>
            ))}
          </div>

          {/* Rows — flat, grouped by day, or grouped by merchant */}
          {!groupByMerchant && !groupByDay && (
            <>
              {filtered.map((tx) => <TxRow key={tx.id} tx={tx} />)}
              {filtered.length === 0 && (
                <div className="flex items-center border-b" style={{ borderColor: "rgba(33,38,45,0.5)" }}>
                  <div style={{ width: 36, borderRight: "1px solid var(--ft-raised)", alignSelf: "stretch" }} />
                  <div className="flex-1 text-center py-8 text-xs" style={{ color: "var(--ft-dim)" }}>
                    {hasFilters ? "No transactions match the current filters." : "No transactions yet — add one to get started."}
                  </div>
                </div>
              )}
            </>
          )}

          {groupByDay && !groupByMerchant && (
            <>
              {dayGroups.map((group) => (
                <div key={group.date}>
                  <div style={{ display: "flex", alignItems: "center", background: "var(--ft-raised)", borderBottom: "1px solid var(--ft-border2)", padding: "6px 12px 6px 48px", gap: 12 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ft-text)", fontFamily: "var(--font-mono)" }}>
                      {new Date(group.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--ft-muted)" }}>{group.txs.length} transaction{group.txs.length !== 1 ? "s" : ""}</span>
                    <span className="pnum" style={{ fontSize: 11, fontWeight: 600, color: group.net >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontVariantNumeric: "tabular-nums", marginLeft: "auto" }}>
                      net {group.net >= 0 ? "+" : ""}{formatGbp(group.net)}
                    </span>
                  </div>
                  {group.txs.map((tx) => <TxRow key={tx.id} tx={tx} indented />)}
                </div>
              ))}
              {dayGroups.length === 0 && (
                <div className="flex items-center border-b" style={{ borderColor: "rgba(33,38,45,0.5)" }}>
                  <div style={{ width: 36, borderRight: "1px solid var(--ft-raised)", alignSelf: "stretch" }} />
                  <div className="flex-1 text-center py-8 text-xs" style={{ color: "var(--ft-dim)" }}>
                    {hasFilters ? "No transactions match the current filters." : "No transactions yet — add one to get started."}
                  </div>
                </div>
              )}
            </>
          )}

          {groupByMerchant && (
            <>
              {merchantGroups.map((group) => {
                const groupTxs = filtered.filter((tx) => tx.description === group.description);
                return (
                  <div key={group.description}>
                    <div
                      className="flex items-center border-b"
                      style={{ borderColor: "rgba(33,38,45,0.5)", background: "var(--ft-base)", cursor: "pointer" }}
                      onClick={() => {
                        setExpandedMerchants((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.description)) next.delete(group.description);
                          else next.add(group.description);
                          return next;
                        });
                      }}
                    >
                      <div style={{ width: 36, minWidth: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid var(--ft-raised)", alignSelf: "stretch", color: "var(--ft-dim)", fontSize: 10 }}>
                        {group.expanded ? "▼" : "▶"}
                      </div>
                      <div style={{ width: 90, minWidth: 90, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", color: "var(--ft-dim)", fontSize: 11 }} />
                      <div style={{ flex: 1, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", color: "var(--ft-text)", fontSize: 12, fontWeight: 600 }}>
                        {group.description}
                      </div>
                      <div style={{ width: 120, minWidth: 120, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)" }}>
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 2, background: "var(--ft-raised)", color: "var(--ft-muted)" }}>
                          {group.count} tx
                        </span>
                      </div>
                      <div style={{ width: 150, minWidth: 150, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)" }} />
                      <div style={{ width: 90, minWidth: 90, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)" }} />
                      <div style={{ width: 130, minWidth: 130, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)" }} />
                      <div className="pnum" style={{ width: 110, minWidth: 110, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", textAlign: "right", color: group.total >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {group.total >= 0 ? "+" : ""}{formatGbp(group.total)}
                      </div>
                      <div style={{ width: 100, minWidth: 100 }} />
                    </div>

                    {group.expanded && groupTxs.map((tx) => <TxRow key={tx.id} tx={tx} indented />)}
                  </div>
                );
              })}

              {merchantGroups.length === 0 && (
                <div className="flex items-center border-b" style={{ borderColor: "rgba(33,38,45,0.5)" }}>
                  <div style={{ width: 36, borderRight: "1px solid var(--ft-raised)", alignSelf: "stretch" }} />
                  <div className="flex-1 text-center py-8 text-xs" style={{ color: "var(--ft-dim)" }}>
                    {hasFilters ? "No transactions match the current filters." : "No transactions yet — add one to get started."}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
