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
import { PrivDesc } from "@/contexts/privacy-context";
import { convertWithOverride } from "@/lib/currency-store";
import { applyAutoCategory } from "@/lib/auto-cat";
import { loadTemplates, saveTemplate, deleteTemplate, type TxTemplate } from "@/lib/tx-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Plus, Trash2, Edit2, Search, X, ArrowLeftRight, Save, FileText, Sparkles, Tag } from "lucide-react";
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
import { Skeleton as FtSkeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
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

interface TxFormErrors {
  date?: string;
  description?: string;
  category?: string;
  accountId?: string;
  nativeAmount?: string;
}

const EMPTY_ERRORS: TxFormErrors = {};

function validateTxField(field: keyof TxFormErrors, value: string, isEdit: boolean): string | undefined {
  switch (field) {
    case "date":
      if (!value) return "Date is required";
      return undefined;
    case "description":
      if (!value.trim()) return "Description is required";
      return undefined;
    case "category":
      if (!value.trim()) return "Category is required";
      return undefined;
    case "accountId":
      if (!isEdit && !value) return "Account is required";
      return undefined;
    case "nativeAmount": {
      if (!value) return "Amount is required";
      const n = parseFloat(value);
      if (isNaN(n) || n <= 0) return "Enter a positive amount";
      return undefined;
    }
    default:
      return undefined;
  }
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
  gbpValue?: number;
}>) {
  const header = ["Date", "Description", "Category", "Type", "Amount", "Currency", "Account", "GBP Value"];
  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [r.date, r.description, r.category, r.type, Math.abs(r.nativeAmount), r.currency, r.accountName, r.gbpValue != null ? Math.abs(r.gbpValue).toFixed(2) : ""]
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

function exportJson(rows: Array<{ date: string; description: string; category: string; type: string; nativeAmount: number; currency: string; gbpValue: number; accountName: string }>) {
  const data = rows.map((r) => ({ date: r.date, description: r.description, category: r.category, type: r.type, amount: Math.abs(r.nativeAmount), currency: r.currency, gbpValue: Math.abs(r.gbpValue), account: r.accountName }));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `transactions-${new Date().toISOString().slice(0, 10)}.json`;
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
  const [formErrors, setFormErrors] = useState<TxFormErrors>(EMPTY_ERRORS);
  const [submitting, setSubmitting] = useState(false);

  // ── filters ─────────────────────────────────────────────────────────────
  const [search, setSearch] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("q") ?? "";
    } catch { return ""; }
  });
  const [filterType, setFilterType] = useState<"all" | TxType>("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterAccount, setFilterAccount] = useState("all");
  const [sortBy, setSortBy] = useState<"date-desc" | "date-asc" | "amount-high" | "amount-low">("date-desc");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");

  // ── bulk selection ───────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkFormCat, setBulkFormCat] = useState("");
  const [bulkFormType, setBulkFormType] = useState<"" | TxType>("");

  // ── per-transaction notes (localStorage) ─────────────────────────────────
  const [notes, setNotes] = useState<Record<number, string>>(() => {
    try {
      const raw = localStorage.getItem("ft-tx-notes");
      return raw ? (JSON.parse(raw) as Record<number, string>) : {};
    } catch { return {}; }
  });
  const [openNoteId, setOpenNoteId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  // ── per-transaction tags (localStorage) ──────────────────────────────────
  const [tags, setTags] = useState<Record<number, string[]>>(() => {
    try {
      const raw = localStorage.getItem("ft-tx-tags");
      return raw ? (JSON.parse(raw) as Record<number, string[]>) : {};
    } catch { return {}; }
  });
  const [openTagId, setOpenTagId] = useState<number | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [filterTag, setFilterTag] = useState("");

  // ── merchant grouping ────────────────────────────────────────────────────
  const [groupByMerchant, setGroupByMerchant] = useState(false);
  const [expandedMerchants, setExpandedMerchants] = useState<Set<string>>(new Set());

  // ── group by day ─────────────────────────────────────────────────────────
  const [groupByDay, setGroupByDay] = useState(false);

  // ── pagination ────────────────────────────────────────────────────────────
  const PAGE_SIZE = 75;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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

  // ── AI batch categorize ──────────────────────────────────────────────────
  const [aiCatConfirmOpen, setAiCatConfirmOpen] = useState(false);
  const [aiCatRunning, setAiCatRunning] = useState(false);

  // ── keyboard navigation ──────────────────────────────────────────────────
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const hasFilters = search || filterType !== "all" || filterCategory !== "all" || filterAccount !== "all" || filterDateFrom || filterDateTo || amountMin || amountMax || filterTag;

  // Reset pagination when filters change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search, filterType, filterCategory, filterAccount, filterDateFrom, filterDateTo, amountMin, amountMax, filterTag]);

  // Reset row selection when filters change
  useEffect(() => { setSelectedRowIndex(null); }, [search, filterType, filterCategory, filterAccount, filterDateFrom, filterDateTo, amountMin, amountMax, sortBy, filterTag]);

  // Scroll selected row into view
  useEffect(() => {
    if (selectedRowIndex === null || !tableContainerRef.current) return;
    const rows = tableContainerRef.current.querySelectorAll<HTMLElement>("[data-tx-row]");
    const el = rows[selectedRowIndex];
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedRowIndex]);

  const allCategories = [...new Set((transactions ?? []).map(tx => tx.category).filter(Boolean))].sort();
  const allAccounts = [...new Set((transactions ?? []).map(tx => tx.accountName).filter(Boolean))].sort();

  const filtered = (() => {
    const base = (transactions ?? []).filter((tx) => {
      if (filterType !== "all" && tx.type !== filterType) return false;
      if (filterCategory !== "all" && tx.category !== filterCategory) return false;
      if (filterAccount !== "all" && tx.accountName !== filterAccount) return false;
      if (filterDateFrom && tx.date < filterDateFrom) return false;
      if (filterDateTo && tx.date > filterDateTo) return false;
      if (amountMin !== "" && Math.abs(tx.gbpValue) < parseFloat(amountMin)) return false;
      if (amountMax !== "" && Math.abs(tx.gbpValue) > parseFloat(amountMax)) return false;
      if (search) {
        const q = search.toLowerCase();
        const desc = (tx.description ?? "").toLowerCase();
        const cat = (tx.category ?? "").toLowerCase();
        const acct = (tx.accountName ?? "").toLowerCase();
        if (!desc.includes(q) && !cat.includes(q) && !acct.includes(q)) return false;
      }
      if (filterTag) {
        const txTags = tags[tx.id] ?? [];
        const q = filterTag.toLowerCase();
        if (!txTags.some((t) => t.toLowerCase().includes(q))) return false;
      }
      return true;
    });
    if (sortBy === "date-asc") return [...base].sort((a, b) => a.date.localeCompare(b.date));
    if (sortBy === "amount-high") return [...base].sort((a, b) => Math.abs(b.gbpValue) - Math.abs(a.gbpValue));
    if (sortBy === "amount-low") return [...base].sort((a, b) => Math.abs(a.gbpValue) - Math.abs(b.gbpValue));
    return base; // date-desc is server default
  })();

  const filteredAvg = filtered.length > 0
    ? filtered.reduce((acc, tx) => acc + tx.gbpValue, 0) / filtered.length
    : 0;

  // ── keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const inInput = () => { const t = document.activeElement?.tagName; return t === "INPUT" || t === "TEXTAREA" || t === "SELECT"; };
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSelectedIds(new Set()); setBulkFormCat(""); setBulkFormType(""); setOpenNoteId(null); setOpenTagId(null); return; }
      if (e.key === "/" && !inInput()) { e.preventDefault(); searchInputRef.current?.focus(); }
      if (e.key === "n" && !inInput() && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setForm(EMPTY_FORM); setAutoCatFilled(false); setAddOpen(true); }
      if (e.key === "e" && !inInput() && !e.metaKey && !e.ctrlKey) { e.preventDefault(); exportCsv(filtered); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [filtered]);

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

  // Paginated slices
  const visibleFiltered = filtered.slice(0, visibleCount);
  const hasMoreFlat = filtered.length > visibleCount;
  const visibleDayGroups = (() => {
    if (!groupByDay) return [];
    let shown = 0;
    const groups: typeof dayGroups = [];
    for (const g of dayGroups) {
      if (shown >= visibleCount) break;
      groups.push({ ...g, txs: g.txs.slice(0, visibleCount - shown) });
      shown += g.txs.length;
    }
    return groups;
  })();
  const hasMoreDayGroups = (() => {
    if (!groupByDay) return false;
    let total = 0;
    for (const g of dayGroups) total += g.txs.length;
    return total > visibleCount;
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
    setFormErrors(EMPTY_ERRORS);
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
    setFormErrors(EMPTY_ERRORS);
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

  const handleBulkApply = async () => {
    if (!bulkFormCat && !bulkFormType) return;
    setBulkSubmitting(true);
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(
        ids.map((id) => {
          const tx = transactions?.find((t) => t.id === id);
          if (!tx) return Promise.resolve();
          return updateTx.mutateAsync({
            id,
            data: {
              date: tx.date,
              description: tx.description ?? "",
              type: (bulkFormType || tx.type) as TxType,
              category: bulkFormCat || tx.category || "",
              nativeAmount: tx.nativeAmount,
              currency: tx.currency,
            },
          });
        })
      );
      await invalidate();
      setSelectedIds(new Set());
      setBulkFormCat("");
      setBulkFormType("");
      toast({ title: `Updated ${ids.length} transaction${ids.length !== 1 ? "s" : ""}` });
    } catch {
      toast({ title: "Failed to update some transactions", variant: "destructive" });
    } finally {
      setBulkSubmitting(false);
    }
  };

  // ── note helpers ─────────────────────────────────────────────────────────
  const saveNote = (id: number, text: string) => {
    setNotes((prev) => {
      const next = { ...prev, [id]: text };
      try { localStorage.setItem("ft-tx-notes", JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const clearNote = (id: number) => {
    setNotes((prev) => {
      const next = { ...prev };
      delete next[id];
      try { localStorage.setItem("ft-tx-notes", JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const openNote = (id: number) => {
    setOpenNoteId(id);
    setNoteDraft(notes[id] ?? "");
  };

  // ── tag helpers ──────────────────────────────────────────────────────────
  const addTag = (id: number, tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    setTags((prev) => {
      const existing = prev[id] ?? [];
      if (existing.includes(trimmed)) return prev;
      const next = { ...prev, [id]: [...existing, trimmed] };
      try { localStorage.setItem("ft-tx-tags", JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const removeTag = (id: number, tag: string) => {
    setTags((prev) => {
      const existing = prev[id] ?? [];
      const next = { ...prev, [id]: existing.filter((t) => t !== tag) };
      if (next[id].length === 0) delete next[id];
      try { localStorage.setItem("ft-tx-tags", JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  // All unique tags across all transactions for autocomplete
  const allTagSuggestions = [...new Set(Object.values(tags).flat())].sort();

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

  // ── AI batch categorize ──────────────────────────────────────────────────
  const uncategorizedTxs = (transactions ?? []).filter((tx) => {
    const cat = (tx.category ?? "").trim();
    return !cat || cat === "Other" || cat === "Uncategorized";
  });

  const handleAiCategorize = async () => {
    if (uncategorizedTxs.length === 0) return;
    setAiCatRunning(true);
    setAiCatConfirmOpen(false);

    const CHUNK = 50;
    let categorized = 0;
    let failed = 0;

    try {
      for (let i = 0; i < uncategorizedTxs.length; i += CHUNK) {
        const batch = uncategorizedTxs.slice(i, i + CHUNK).map((tx) => ({
          id: tx.id,
          description: tx.description,
          amount: Math.abs(tx.nativeAmount),
          type: tx.type,
        }));

        let suggestions: Array<{ id: number; category: string }> = [];
        try {
          const res = await fetch("/api/ai/batch-categorize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transactions: batch }),
          });
          if (res.ok) {
            const data = (await res.json()) as { suggestions?: Array<{ id: number; category: string }> };
            suggestions = data.suggestions ?? [];
          } else {
            failed += batch.length;
            continue;
          }
        } catch {
          failed += batch.length;
          continue;
        }

        await Promise.all(
          suggestions.map(async ({ id, category }) => {
            const tx = transactions?.find((t) => t.id === id);
            if (!tx) return;
            try {
              await updateTx.mutateAsync({
                id,
                data: {
                  date: tx.date,
                  description: tx.description ?? "",
                  type: tx.type as TxType,
                  category,
                  nativeAmount: tx.nativeAmount,
                  currency: tx.currency,
                },
              });
              categorized++;
            } catch {
              failed++;
            }
          })
        );
      }

      await invalidate();

      if (failed === 0) {
        toast({ title: `${categorized} transaction${categorized !== 1 ? "s" : ""} categorized` });
      } else {
        toast({ title: `${categorized} categorized, ${failed} failed`, variant: "destructive" });
      }
    } catch {
      toast({ title: "AI categorize failed", variant: "destructive" });
    } finally {
      setAiCatRunning(false);
    }
  };

  // ── keyboard navigation handler ──────────────────────────────────────────
  const handleTableKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const visibleRows = groupByDay
        ? visibleDayGroups.flatMap((g) => g.txs)
        : groupByMerchant
        ? []
        : visibleFiltered;

      if (visibleRows.length === 0) return;

      const inInput = () => {
        const t = document.activeElement?.tagName;
        return t === "INPUT" || t === "TEXTAREA" || t === "SELECT";
      };

      if (e.key === "ArrowDown" || (e.key === "j" && !inInput())) {
        e.preventDefault();
        setSelectedRowIndex((prev) =>
          prev === null ? 0 : Math.min(prev + 1, visibleRows.length - 1)
        );
      } else if (e.key === "ArrowUp" || (e.key === "k" && !inInput())) {
        e.preventDefault();
        setSelectedRowIndex((prev) =>
          prev === null ? 0 : Math.max(prev - 1, 0)
        );
      } else if (e.key === "Escape") {
        setSelectedRowIndex(null);
      } else if (e.key === "Enter" && selectedRowIndex !== null) {
        e.preventDefault();
        const tx = visibleRows[selectedRowIndex];
        if (tx) {
          if (openNoteId === tx.id) {
            setOpenNoteId(null);
          } else {
            openNote(tx.id);
          }
        }
      }
    },
    [visibleFiltered, visibleDayGroups, groupByDay, groupByMerchant, selectedRowIndex, openNoteId, openNote]
  );

  if (isLoading || isSummaryLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Header skeleton */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <FtSkeleton width={180} height={16} />
          <FtSkeleton width={240} height={28} />
        </div>
        {/* Summary bar skeleton */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ padding: "12px 16px", borderRight: "1px solid var(--ft-border)" }}>
              <FtSkeleton width="60%" height={9} />
              <div style={{ marginTop: 6 }}><FtSkeleton width="80%" height={14} /></div>
            </div>
          ))}
        </div>
        {/* Table skeleton */}
        <div style={{ border: "1px solid var(--ft-border)" }}>
          <div style={{ padding: "6px 12px", background: "var(--ft-surface)", borderBottom: "1px solid var(--ft-border)" }}>
            <FtSkeleton width={200} height={10} />
          </div>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "9px 12px", borderBottom: "1px solid var(--ft-raised)", alignItems: "center" }}>
              <FtSkeleton width={14} height={14} />
              <FtSkeleton width={76} height={11} />
              <FtSkeleton width="30%" height={12} />
              <FtSkeleton width={90} height={11} />
              <FtSkeleton width={120} height={11} />
              <FtSkeleton width={60} height={10} />
              <FtSkeleton width={80} height={12} />
              <FtSkeleton width={70} height={12} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-5">
        <ErrorState message={(error as Error)?.message ?? "Could not load transactions. Check your connection and try again."} />
      </div>
    );
  }

  // ── split modal data ────────────────────────────────────────────────────
  const splitTx = splitTxId !== null ? transactions?.find((t) => t.id === splitTxId) : null;
  const splitTotal = splitLines.reduce((acc, l) => acc + (parseFloat(l.amount) || 0), 0);
  const splitOriginal = splitTx ? Math.abs(splitTx.nativeAmount) : 0;
  const splitRemaining = parseFloat((splitOriginal - splitTotal).toFixed(2));

  // ── inline field blur/change validation ──────────────────────────────────
  const blurField = (field: keyof TxFormErrors, value: string, isEdit: boolean) => {
    const err = validateTxField(field, value, isEdit);
    setFormErrors((prev) => ({ ...prev, [field]: err }));
  };

  const clearFieldError = (field: keyof TxFormErrors) => {
    setFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const ERR_STYLE: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    color: "var(--ft-red)",
    marginTop: 2,
  };

  const errBorder = (field: keyof TxFormErrors): React.CSSProperties | undefined =>
    formErrors[field] ? { border: "1px solid var(--ft-red)" } : undefined;

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
          <Input
            id="tx-date"
            type="date"
            value={form.date}
            onChange={(e) => { setField("date", e.target.value); if (e.target.value) clearFieldError("date"); }}
            onBlur={(e) => blurField("date", e.target.value, isEdit)}
            required
            style={errBorder("date")}
          />
          {formErrors.date && <div style={ERR_STYLE}>{formErrors.date}</div>}
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
          <Input
            id="tx-desc"
            placeholder="e.g. Monthly Salary"
            value={form.description}
            onChange={(e) => { setField("description", e.target.value); if (e.target.value.trim()) clearFieldError("description"); }}
            onBlur={(e) => blurField("description", e.target.value, isEdit)}
            required
            style={{ flex: 1, ...errBorder("description") }}
          />
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
        {formErrors.description && <div style={ERR_STYLE}>{formErrors.description}</div>}
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
        <Input
          id="tx-cat"
          list="tx-categories"
          placeholder="e.g. Groceries, Salary…"
          value={form.category}
          onChange={(e) => { setField("category", e.target.value); if (e.target.value.trim()) clearFieldError("category"); }}
          onBlur={(e) => blurField("category", e.target.value, isEdit)}
          required
          style={errBorder("category")}
        />
        {formErrors.category && <div style={ERR_STYLE}>{formErrors.category}</div>}
      </div>
      {!isEdit && (
        <div className="space-y-1.5">
          <Label>Account</Label>
          <Select value={form.accountId} onValueChange={(v) => {
            const acct = accounts?.find((a) => String(a.id) === v);
            setForm((f) => ({ ...f, accountId: v, currency: (acct?.currency as Currency) ?? f.currency }));
            if (v) clearFieldError("accountId");
          }}>
            <SelectTrigger style={errBorder("accountId")}>
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts?.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name} ({a.currency})</SelectItem>)}
            </SelectContent>
          </Select>
          {formErrors.accountId && <div style={ERR_STYLE}>{formErrors.accountId}</div>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="tx-amount">Amount</Label>
          <Input
            id="tx-amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={form.nativeAmount}
            onChange={(e) => {
              setField("nativeAmount", e.target.value);
              const err = validateTxField("nativeAmount", e.target.value, isEdit);
              setFormErrors((prev) => ({ ...prev, nativeAmount: err }));
            }}
            onBlur={(e) => blurField("nativeAmount", e.target.value, isEdit)}
            required
            style={errBorder("nativeAmount")}
          />
          {formErrors.nativeAmount && <div style={ERR_STYLE}>{formErrors.nativeAmount}</div>}
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

  const TAG_CHIP_STYLE: React.CSSProperties = {
    background: "rgba(245,158,11,0.15)",
    color: "var(--ft-amber)",
    border: "1px solid rgba(245,158,11,0.3)",
    borderRadius: 2,
    padding: "0 4px",
    fontSize: 9,
    fontFamily: "var(--font-mono)",
    whiteSpace: "nowrap" as const,
    lineHeight: "16px",
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
  };

  const TxRow = ({ tx, indented = false, isKeyboardSelected = false }: { tx: typeof filtered[number]; indented?: boolean; isKeyboardSelected?: boolean }) => {
    const fxGbp = tx.currency !== "GBP" ? convertWithOverride(Math.abs(tx.nativeAmount), tx.currency, "GBP") : null;
    const hasOverride = fxGbp != null;
    const displayGbp = hasOverride ? fxGbp : Math.abs(tx.gbpValue);
    const hasNote = Boolean(notes[tx.id]);
    const isNoteOpen = openNoteId === tx.id;
    const txTags = tags[tx.id] ?? [];
    const hasTags = txTags.length > 0;
    const isTagOpen = openTagId === tx.id;
    const visibleTags = txTags.slice(0, 2);
    const hiddenTagCount = txTags.length - 2;
    const tagSuggestionsFiltered = tagInput
      ? allTagSuggestions.filter((s) => s.toLowerCase().includes(tagInput.toLowerCase()) && !txTags.includes(s))
      : allTagSuggestions.filter((s) => !txTags.includes(s));
    return (
    <div style={{ position: "relative" }} data-tx-row>
      <div
        key={tx.id}
        className="flex items-center border-b xls-row"
        style={{
          borderColor: "rgba(33,38,45,0.5)",
          background: selectedIds.has(tx.id) ? "#1F3A5F55" : isKeyboardSelected ? "var(--ft-raised)" : "var(--ft-base)",
          borderLeft: isKeyboardSelected ? "2px solid var(--ft-amber)" : "2px solid transparent",
          opacity: pendingDeleteIds.has(tx.id) ? 0.4 : 1,
          textDecoration: pendingDeleteIds.has(tx.id) ? "line-through" : "none",
          transition: "opacity 0.2s, background 0.1s, border-left 0.1s",
        }}
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
        <div style={{ flex: 1, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", color: "var(--ft-text)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            <PrivDesc>{tx.description}</PrivDesc>
          </span>
          {hasTags && (
            <span style={{ display: "flex", gap: 3, flexShrink: 0, alignItems: "center" }}>
              {visibleTags.map((t) => (
                <span key={t} style={TAG_CHIP_STYLE}>{t}</span>
              ))}
              {hiddenTagCount > 0 && (
                <span style={{ ...TAG_CHIP_STYLE, background: "rgba(245,158,11,0.08)" }}>+{hiddenTagCount}</span>
              )}
            </span>
          )}
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
          {formatGbp(displayGbp)}
          {hasOverride && <span title="Custom FX rate applied" style={{ fontSize: 8, color: "var(--ft-amber)", marginLeft: 2, verticalAlign: "super" }}>★</span>}
        </div>
        {/* Note icon column */}
        <div style={{ width: 36, minWidth: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid var(--ft-raised)", alignSelf: "stretch" }}>
          <button
            type="button"
            onClick={() => { if (isNoteOpen) { setOpenNoteId(null); } else { openNote(tx.id); setOpenTagId(null); } }}
            title={hasNote ? "View/edit note" : "Add note"}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center", justifyContent: "center" }}
            aria-label={hasNote ? `Note for ${tx.description}` : `Add note for ${tx.description}`}
          >
            <FileText
              className="w-3.5 h-3.5"
              style={{ color: hasNote ? "var(--ft-amber)" : "var(--ft-border2)", transition: "color 0.1s" }}
            />
          </button>
        </div>
        {/* Tag icon column */}
        <div style={{ width: 36, minWidth: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid var(--ft-raised)", alignSelf: "stretch", position: "relative" }}>
          <button
            type="button"
            onClick={() => { if (isTagOpen) { setOpenTagId(null); } else { setOpenTagId(tx.id); setTagInput(""); setOpenNoteId(null); } }}
            title={hasTags ? `Tags: ${txTags.join(", ")}` : "Add tag"}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}
            aria-label={hasTags ? `Tags for ${tx.description}` : `Add tag for ${tx.description}`}
          >
            <Tag
              className="w-3.5 h-3.5"
              style={{ color: hasTags ? "var(--ft-amber)" : "var(--ft-border2)", transition: "color 0.1s" }}
            />
            {hasTags && (
              <span style={{ position: "absolute", top: -1, right: -1, background: "var(--ft-amber)", color: "#000", borderRadius: 2, fontSize: 7, fontWeight: 700, fontFamily: "var(--font-mono)", lineHeight: 1, padding: "1px 2px", minWidth: 10, textAlign: "center" }}>
                {txTags.length}
              </span>
            )}
          </button>
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
      {/* Note popover — inline below the row */}
      {isNoteOpen && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            zIndex: 60,
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-border2)",
            borderRadius: 2,
            padding: "10px 12px",
            width: 280,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6, fontFamily: "var(--font-mono)" }}>
            NOTE — <span style={{ color: "var(--ft-muted)" }}>{tx.description}</span>
          </div>
          <textarea
            autoFocus
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={3}
            placeholder="Add a note…"
            style={{
              width: "100%",
              background: "var(--ft-base)",
              border: "1px solid var(--ft-border2)",
              borderRadius: 2,
              color: "var(--ft-text)",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              padding: "6px 8px",
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => { clearNote(tx.id); setOpenNoteId(null); }}
              style={{ fontSize: 11, padding: "3px 10px", background: "none", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-dim)", cursor: "pointer", fontFamily: "var(--font-mono)" }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => { saveNote(tx.id, noteDraft); setOpenNoteId(null); }}
              style={{ fontSize: 11, padding: "3px 10px", background: "var(--ft-accent)", border: "1px solid var(--ft-accent)", borderRadius: 2, color: "#000", cursor: "pointer", fontFamily: "var(--font-mono)", fontWeight: 600 }}
            >
              Save
            </button>
          </div>
        </div>
      )}
      {/* Tag popover — inline below the row */}
      {isTagOpen && (
        <div
          style={{
            position: "absolute",
            right: 100,
            top: "100%",
            zIndex: 60,
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-border2)",
            borderRadius: 2,
            padding: "10px 12px",
            width: 300,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8, fontFamily: "var(--font-mono)" }}>
            TAGS — <span style={{ color: "var(--ft-muted)" }}>{tx.description}</span>
          </div>
          {/* Existing tag chips */}
          {txTags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
              {txTags.map((t) => (
                <span key={t} style={{ ...TAG_CHIP_STYLE, cursor: "pointer" }} onClick={() => removeTag(tx.id, t)} title="Click to remove">
                  {t}
                  <span style={{ marginLeft: 2, opacity: 0.7 }}>×</span>
                </span>
              ))}
            </div>
          )}
          {/* Tag input */}
          <div style={{ position: "relative" }}>
            <input
              autoFocus
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  const parts = tagInput.split(",").map((s) => s.trim()).filter(Boolean);
                  parts.forEach((p) => addTag(tx.id, p));
                  setTagInput("");
                } else if (e.key === "Escape") {
                  setOpenTagId(null);
                }
              }}
              placeholder="Add tag… (Enter or comma)"
              style={{
                width: "100%",
                background: "var(--ft-base)",
                border: "1px solid var(--ft-border2)",
                borderRadius: 2,
                color: "var(--ft-text)",
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                padding: "5px 8px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {/* Autocomplete suggestions */}
            {tagSuggestionsFiltered.length > 0 && tagInput && (
              <div style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                background: "var(--ft-surface)",
                border: "1px solid var(--ft-border2)",
                borderTop: "none",
                borderRadius: "0 0 2px 2px",
                zIndex: 70,
                maxHeight: 120,
                overflowY: "auto",
              }}>
                {tagSuggestionsFiltered.slice(0, 8).map((s) => (
                  <div
                    key={s}
                    onClick={() => { addTag(tx.id, s); setTagInput(""); }}
                    style={{ padding: "5px 8px", fontSize: 11, color: "var(--ft-muted)", cursor: "pointer", fontFamily: "var(--font-mono)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--ft-raised)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Existing tag suggestions (not typing) */}
          {!tagInput && tagSuggestionsFiltered.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, color: "var(--ft-dim)", fontFamily: "var(--font-mono)", marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>Suggestions</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {tagSuggestionsFiltered.slice(0, 10).map((s) => (
                  <span
                    key={s}
                    onClick={() => addTag(tx.id, s)}
                    style={{ ...TAG_CHIP_STYLE, cursor: "pointer", opacity: 0.65 }}
                  >
                    + {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setOpenTagId(null)}
              style={{ fontSize: 11, padding: "3px 10px", background: "none", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-dim)", cursor: "pointer", fontFamily: "var(--font-mono)" }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
  };

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

      {/* ── AI Categorize confirmation modal ── */}
      <Dialog open={aiCatConfirmOpen} onOpenChange={setAiCatConfirmOpen}>
        <DialogContent style={{ maxWidth: 420 }}>
          <DialogHeader>
            <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles className="w-4 h-4" style={{ color: "var(--ft-amber)" }} />
              AI Auto-Categorize
            </DialogTitle>
          </DialogHeader>
          <div style={{ padding: "8px 0 16px" }}>
            {uncategorizedTxs.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ft-muted)" }}>
                All transactions already have categories assigned.
              </p>
            ) : (
              <p style={{ fontSize: 13, color: "var(--ft-muted)", lineHeight: 1.6 }}>
                Found <span style={{ color: "var(--ft-amber)", fontWeight: 700 }}>{uncategorizedTxs.length}</span>{" "}
                transaction{uncategorizedTxs.length !== 1 ? "s" : ""} without a category.
                Use AI to suggest categories for all of them?
              </p>
            )}
            <div style={{ marginTop: 12, fontSize: 11, color: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}>
              Categories: Food & Drink, Transport, Shopping, Entertainment, Bills & Utilities, Health, Travel, Income, Savings, Other
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              type="button"
              disabled={uncategorizedTxs.length === 0}
              onClick={handleAiCategorize}
              style={{ background: "var(--ft-amber)", color: "#000", border: "none", borderRadius: 2, fontWeight: 700 }}
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Proceed
            </Button>
          </DialogFooter>
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
              onClick={() => setAiCatConfirmOpen(true)}
              disabled={aiCatRunning}
              size="sm"
              style={{ background: aiCatRunning ? "var(--ft-raised)" : "rgba(245,158,11,0.12)", color: aiCatRunning ? "var(--ft-dim)" : "var(--ft-amber)", border: `1px solid ${aiCatRunning ? "var(--ft-border)" : "var(--ft-amber)"}`, borderRadius: 2, fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
              title="Auto-categorize uncategorized transactions using AI"
            >
              <Sparkles className="w-3 h-3" />
              {aiCatRunning ? "Categorizing…" : "AI Categorize"}
            </Button>
            <Button
              onClick={() => exportCsv(filtered)}
              size="sm"
              style={{ background: "var(--ft-raised)", color: "var(--ft-muted)", border: "1px solid var(--ft-border)", borderRadius: 2, fontSize: 12 }}
            >
              ↓ CSV
            </Button>
            <Button
              onClick={() => exportJson(filtered)}
              size="sm"
              style={{ background: "var(--ft-raised)", color: "var(--ft-muted)", border: "1px solid var(--ft-border)", borderRadius: 2, fontSize: 12 }}
            >
              ↓ JSON
            </Button>
            <Button
              onClick={() => window.print()}
              size="sm"
              className="ft-no-print"
              style={{ background: "var(--ft-raised)", color: "var(--ft-muted)", border: "1px solid var(--ft-border)", borderRadius: 2, fontSize: 12 }}
            >
              ↓ Export PDF
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

      {isSummaryError && !isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Summary unavailable</AlertTitle>
          <AlertDescription>Could not load the transaction summary. Transactions are still shown below.</AlertDescription>
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
              onClick={() => { setSearch(""); setFilterType("all"); setFilterCategory("all"); setFilterAccount("all"); setFilterDateFrom(""); setFilterDateTo(""); setAmountMin(""); setAmountMax(""); setSortBy("date-desc"); setFilterTag(""); }}
              style={{ height: 30, fontSize: 11, color: "var(--ft-muted)", padding: "0 8px" }}
            >
              <X className="w-3 h-3 mr-1" />Clear
            </Button>
          )}
          <span className="ml-auto text-xs" style={{ color: "var(--ft-dim)" }}>
            {filtered.length}{hasFilters ? ` of ${transactions?.length ?? 0}` : ""} transaction{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Row 1b: category + account + sort */}
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger style={{ width: 148, height: 30, fontSize: 12, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", borderRadius: 2 }}>
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {allCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterAccount} onValueChange={setFilterAccount}>
            <SelectTrigger style={{ width: 148, height: 30, fontSize: 12, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", borderRadius: 2 }}>
              <SelectValue placeholder="All accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {allAccounts.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <div style={{ width: 1, height: 20, background: "var(--ft-border2)", margin: "0 2px" }} />
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger style={{ width: 138, height: 30, fontSize: 12, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", borderRadius: 2 }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date-desc">Date: Newest first</SelectItem>
              <SelectItem value="date-asc">Date: Oldest first</SelectItem>
              <SelectItem value="amount-high">Amount: High → Low</SelectItem>
              <SelectItem value="amount-low">Amount: Low → High</SelectItem>
            </SelectContent>
          </Select>
          <div style={{ width: 1, height: 20, background: "var(--ft-border2)", margin: "0 2px" }} />
          {/* Tag filter */}
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <Tag className="w-3 h-3" style={{ position: "absolute", left: 7, color: filterTag ? "var(--ft-amber)" : "var(--ft-dim)", pointerEvents: "none" }} />
            <input
              type="text"
              placeholder="TAG"
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              style={{
                paddingLeft: 22,
                paddingRight: filterTag ? 22 : 8,
                height: 30,
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                background: filterTag ? "rgba(245,158,11,0.06)" : "var(--ft-surface)",
                border: `1px solid ${filterTag ? "var(--ft-amber)" : "var(--ft-border2)"}`,
                borderRadius: 2,
                color: filterTag ? "var(--ft-amber)" : "var(--ft-muted)",
                outline: "none",
                width: 90,
                letterSpacing: "0.04em",
              }}
            />
            {filterTag && (
              <button
                type="button"
                onClick={() => setFilterTag("")}
                style={{ position: "absolute", right: 5, background: "none", border: "none", cursor: "pointer", color: "var(--ft-dim)", padding: 0, display: "flex", alignItems: "center" }}
                aria-label="Clear tag filter"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
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

      {/* ── Floating bulk action bar (bottom-center) ── */}
      {selectedIds.size > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 16px",
            background: "#0d1117",
            border: "1px solid var(--ft-blue)",
            borderRadius: 4,
            boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
            fontFamily: "var(--font-mono)",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--ft-blue)", fontWeight: 700, minWidth: 70 }}>
            {selectedIds.size} selected
          </span>
          <div style={{ width: 1, height: 18, background: "var(--ft-border2)" }} />
          {/* Category dropdown */}
          <div style={{ position: "relative" }}>
            <select
              value={bulkFormCat}
              onChange={(e) => setBulkFormCat(e.target.value)}
              disabled={bulkSubmitting}
              style={{
                fontSize: 11,
                padding: "4px 8px",
                background: "var(--ft-surface)",
                border: "1px solid var(--ft-border2)",
                borderRadius: 2,
                color: bulkFormCat ? "var(--ft-text)" : "var(--ft-dim)",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                minWidth: 130,
              }}
            >
              <option value="">Category (unchanged)</option>
              {allCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
              {BULK_CATEGORIES.filter((c) => !allCategories.includes(c)).map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          {/* Type dropdown */}
          <select
            value={bulkFormType}
            onChange={(e) => setBulkFormType(e.target.value as "" | TxType)}
            disabled={bulkSubmitting}
            style={{
              fontSize: 11,
              padding: "4px 8px",
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border2)",
              borderRadius: 2,
              color: bulkFormType ? "var(--ft-text)" : "var(--ft-dim)",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              minWidth: 110,
            }}
          >
            <option value="">Type (unchanged)</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
            <option value="transfer">Transfer</option>
          </select>
          {/* Apply */}
          <button
            type="button"
            onClick={handleBulkApply}
            disabled={bulkSubmitting || (!bulkFormCat && !bulkFormType)}
            style={{
              fontSize: 11,
              padding: "4px 14px",
              background: bulkSubmitting || (!bulkFormCat && !bulkFormType) ? "var(--ft-raised)" : "var(--ft-accent)",
              border: "1px solid var(--ft-accent)",
              borderRadius: 2,
              color: bulkSubmitting || (!bulkFormCat && !bulkFormType) ? "var(--ft-dim)" : "#000",
              cursor: bulkSubmitting || (!bulkFormCat && !bulkFormType) ? "not-allowed" : "pointer",
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
            }}
          >
            {bulkSubmitting ? "Applying…" : "Apply"}
          </button>
          <div style={{ width: 1, height: 18, background: "var(--ft-border2)" }} />
          {/* Delete */}
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={bulkSubmitting}
            style={{ fontSize: 11, padding: "4px 10px", background: "var(--ft-red)22", border: "1px solid var(--ft-red)", borderRadius: 2, color: "var(--ft-red)", cursor: "pointer", fontFamily: "var(--font-mono)" }}
          >
            Delete
          </button>
          {/* Clear */}
          <button
            type="button"
            onClick={() => { setSelectedIds(new Set()); setBulkFormCat(""); setBulkFormType(""); }}
            style={{ fontSize: 11, padding: "4px 8px", background: "none", border: "none", color: "var(--ft-muted)", cursor: "pointer" }}
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

        <div
          className="overflow-x-auto"
          ref={tableContainerRef}
          tabIndex={0}
          onKeyDown={handleTableKeyDown}
          style={{ outline: "none" }}
          aria-label="Transaction table — use ↑↓ or j/k to navigate, Enter to open note, Escape to clear"
        >
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
            {[["DATE", "90px"], ["DESCRIPTION", "1"], ["CATEGORY", "120px"], ["ACCOUNT", "150px"], ["TYPE", "90px"], ["AMOUNT", "130px"], ["GBP", "110px"], ["NOTE", "36px"], ["TAG", "36px"], ["", "100px"]].map(([h, w]) => (
              <div key={h as string} style={{ ...TH, flex: w === "1" ? 1 : undefined, width: w !== "1" ? w as string : undefined, minWidth: w !== "1" ? w as string : undefined, textAlign: ["AMOUNT", "GBP"].includes(h as string) ? "right" : "center", padding: h === "NOTE" || h === "TAG" ? "6px 0" : undefined }}>
                {h}
              </div>
            ))}
          </div>

          {/* Rows — flat, grouped by day, or grouped by merchant */}
          {!groupByMerchant && !groupByDay && (
            <>
              {visibleFiltered.map((tx, idx) => <TxRow key={tx.id} tx={tx} isKeyboardSelected={selectedRowIndex === idx} />)}
              {filtered.length === 0 && (
                <EmptyState
                  title={hasFilters ? "No matches" : "No data"}
                  description={hasFilters ? "No transactions match the current filters." : "No transactions yet — add one to get started."}
                  action={!hasFilters ? { label: "+ Add Transaction", onClick: openAdd } : undefined}
                />
              )}
              {hasMoreFlat && (
                <div className="flex items-center justify-center py-3 border-b" style={{ borderColor: "rgba(33,38,45,0.5)" }}>
                  <button
                    type="button"
                    onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                    style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)", background: "none", border: "1px solid var(--ft-border2)", padding: "4px 14px", cursor: "pointer", letterSpacing: "0.06em" }}
                  >
                    LOAD MORE · showing {visibleCount} of {filtered.length}
                  </button>
                </div>
              )}
            </>
          )}

          {groupByDay && !groupByMerchant && (
            <>
              {(() => {
                let flatIdx = 0;
                return visibleDayGroups.map((group) => (
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
                    {group.txs.map((tx) => {
                      const rowIdx = flatIdx++;
                      return <TxRow key={tx.id} tx={tx} indented isKeyboardSelected={selectedRowIndex === rowIdx} />;
                    })}
                  </div>
                ));
              })()}
              {dayGroups.length === 0 && (
                <EmptyState
                  title={hasFilters ? "No matches" : "No data"}
                  description={hasFilters ? "No transactions match the current filters." : "No transactions yet — add one to get started."}
                  action={!hasFilters ? { label: "+ Add Transaction", onClick: openAdd } : undefined}
                />
              )}
              {hasMoreDayGroups && (
                <div className="flex items-center justify-center py-3 border-b" style={{ borderColor: "rgba(33,38,45,0.5)" }}>
                  <button
                    type="button"
                    onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                    style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)", background: "none", border: "1px solid var(--ft-border2)", padding: "4px 14px", cursor: "pointer", letterSpacing: "0.06em" }}
                  >
                    LOAD MORE · showing {Math.min(visibleCount, filtered.length)} of {filtered.length}
                  </button>
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
                        <PrivDesc>{group.description}</PrivDesc>
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
                      <div style={{ width: 36, minWidth: 36, borderRight: "1px solid var(--ft-raised)" }} />
                      <div style={{ width: 36, minWidth: 36, borderRight: "1px solid var(--ft-raised)" }} />
                      <div style={{ width: 100, minWidth: 100 }} />
                    </div>

                    {group.expanded && groupTxs.map((tx) => <TxRow key={tx.id} tx={tx} indented />)}
                  </div>
                );
              })}

              {merchantGroups.length === 0 && (
                <EmptyState
                  title={hasFilters ? "No matches" : "No data"}
                  description={hasFilters ? "No transactions match the current filters." : "No transactions yet — add one to get started."}
                  action={!hasFilters ? { label: "+ Add Transaction", onClick: openAdd } : undefined}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
