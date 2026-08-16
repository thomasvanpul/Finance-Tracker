import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import { loadPersonaIds, PERSONA_COLORS } from "@/lib/persona";
import { PrivDesc } from "@/contexts/privacy-context";
import { convertWithOverride } from "@/lib/currency-store";
import { applyAutoCategory } from "@/lib/auto-cat";
import { loadTemplates, saveTemplate, deleteTemplate, type TxTemplate } from "@/lib/tx-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Plus, Trash2, Edit2, Search, X, Save, FileText, Sparkles, Tag, SlidersHorizontal } from "lucide-react";
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
import { haptic } from "@/lib/haptics";
import { MobileSheet } from "@/components/mobile-sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipeDelete } from "@/hooks/use-swipe-delete";
import { HStack, MonoLabel, PanelBox, Text, VStack } from "@/components/primitives";

import {
  type TxType, type Currency, type TxForm, type TxFormErrors,
  type SplitLine, type SplitEntry, type MerchantGroup,
  EMPTY_ERRORS, validateTxField, SPLITS_KEY, loadSplits, saveSplits,
  makeEmptyForm, BULK_CATEGORIES, CATEGORIES, TH, TX_TYPE_COLOR,
  getWeekStart, getMonthStart, getMonthEnd, get3MonthsAgo,
  exportCsv, exportJson,
} from "./transactions-helpers";

// ── SplitModal (localStorage-backed split view) ───────────────────────────────

type SplitModalTx = {
  id: number;
  description: string;
  date: string;
  gbpValue: number | null;
};

function SplitModal({ tx, onClose }: { tx: SplitModalTx; onClose: () => void }) {
  const existingSplits = loadSplits()[String(tx.id)] ?? [];
  // A split needs a total GBP amount to allocate against. If the FX
  // conversion is unavailable, refuse to open the split flow — this
  // is a genuine "can't total, don't total" case per the FX-honesty
  // rules. Caller sees a message and can retry once quotes refresh.
  if (tx.gbpValue == null) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent style={{ background: "var(--ft-base)", border: "1px solid var(--ft-border)" }}>
          <DialogHeader><DialogTitle>Split unavailable</DialogTitle></DialogHeader>
          <div style={{ padding: "12px 0", fontSize: 13, color: "var(--ft-muted)" }}>
            This transaction's FX conversion is not currently available, so
            the split total can't be computed. Try again once market data
            refreshes.
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  const total = Math.abs(tx.gbpValue);

  const [entries, setEntries] = useState<Array<{ id: string; category: string; amount: string; note: string }>>(
    () =>
      existingSplits.length > 0
        ? existingSplits.map((e) => ({ id: crypto.randomUUID(), category: e.category, amount: String(e.amount), note: e.note ?? "" }))
        : [
            { id: crypto.randomUUID(), category: "", amount: total.toFixed(2), note: "" },
          ]
  );

  const allocatedSum = entries.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
  const remaining = parseFloat((total - allocatedSum).toFixed(2));

  const addRow = () => {
    setEntries((prev) => [...prev, { id: crypto.randomUUID(), category: "", amount: "", note: "" }]);
  };

  const removeRow = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const updateEntry = (id: string, field: "category" | "amount" | "note", value: string) => {
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };

  const handleSave = () => {
    if (Math.abs(remaining) > 0.005) return;
    const splits = loadSplits();
    const newSplits: SplitEntry[] = entries.map((e) => ({
      category: e.category,
      amount: parseFloat(e.amount) || 0,
      ...(e.note ? { note: e.note } : {}),
    }));
    splits[String(tx.id)] = newSplits;
    saveSplits(splits);
    onClose();
  };

  const handleClear = () => {
    const splits = loadSplits();
    delete splits[String(tx.id)];
    saveSplits(splits);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--ft-surface)",
          border: "1px solid var(--ft-border)",
          borderRadius: 2,
          width: "min(540px, 95vw)",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", gap: 10 }}>
          <MonoLabel as="span" size={9} color="var(--ft-accent)" letterSpacing="0.08em">⊕ SPLIT</MonoLabel>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ft-text)" }}>{tx.description}</div>
            <Text as="div" mono size={10} color="var(--ft-muted)" mt={2}>
              {tx.date} · GBP {total.toFixed(2)}
            </Text>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-dim)", fontSize: 16, lineHeight: 1, padding: "0 4px" }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Entries */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 1fr 28px", gap: 6, marginBottom: 2 }}>
            {["CATEGORY", "AMOUNT", "NOTE", ""].map((h) => (
              <div key={h} style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>{h}</div>
            ))}
          </div>
          {entries.map((entry) => (
            <div key={entry.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 1fr 28px", gap: 6, alignItems: "center" }}>
              <input
                type="text"
                list="tx-categories"
                placeholder="Category"
                value={entry.category}
                onChange={(e) => updateEntry(entry.id, "category", e.target.value)}
                style={{
                  background: "var(--ft-base)",
                  border: "1px solid var(--ft-border)",
                  borderRadius: 2,
                  color: "var(--ft-text)",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  padding: "5px 8px",
                  outline: "none",
                  width: "100%",
                  boxSizing: "border-box" as const,
                }}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={entry.amount}
                onChange={(e) => updateEntry(entry.id, "amount", e.target.value)}
                style={{
                  background: "var(--ft-base)",
                  border: "1px solid var(--ft-border)",
                  borderRadius: 2,
                  color: "var(--ft-text)",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  padding: "5px 8px",
                  outline: "none",
                  width: "100%",
                  textAlign: "right" as const,
                  boxSizing: "border-box" as const,
                }}
              />
              <input
                type="text"
                placeholder="Note (optional)"
                value={entry.note}
                onChange={(e) => updateEntry(entry.id, "note", e.target.value)}
                style={{
                  background: "var(--ft-base)",
                  border: "1px solid var(--ft-border)",
                  borderRadius: 2,
                  color: "var(--ft-text)",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  padding: "5px 8px",
                  outline: "none",
                  width: "100%",
                  boxSizing: "border-box" as const,
                }}
              />
              <button
                type="button"
                onClick={() => removeRow(entry.id)}
                disabled={entries.length <= 1}
                style={{
                  background: "none",
                  border: "none",
                  cursor: entries.length <= 1 ? "not-allowed" : "pointer",
                  color: entries.length <= 1 ? "var(--ft-border)" : "var(--ft-red)",
                  fontSize: 15,
                  lineHeight: 1,
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-label="Remove row"
              >
                ×
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addRow}
            style={{
              marginTop: 4,
              background: "none",
              border: "1px dashed var(--ft-border)",
              borderRadius: 2,
              color: "var(--ft-muted)",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              cursor: "pointer",
              padding: "5px 0",
              width: "100%",
              textAlign: "center" as const,
              letterSpacing: "0.04em",
            }}
          >
            + Add Row
          </button>
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--ft-border)" }}>
          {/* Running total */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 10px",
            background: "var(--ft-base)",
            border: `1px solid ${Math.abs(remaining) <= 0.005 ? "var(--ft-green)" : remaining < 0 ? "var(--ft-red)" : "var(--ft-border)"}`,
            borderRadius: 2,
            marginBottom: 12,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
          }}>
            <span style={{ color: "var(--ft-muted)" }}>
              Allocated: <span style={{ color: "var(--ft-text)", fontWeight: 700 }}>£{allocatedSum.toFixed(2)}</span>
              {" "}of{" "}
              <Text as="span" color="var(--ft-text)">£{total.toFixed(2)}</Text>
            </span>
            <Text as="span" weight={700} color={Math.abs(remaining) <= 0.005 ? "var(--ft-green)" : remaining < 0 ? "var(--ft-red)" : "var(--ft-amber)"}>
              {Math.abs(remaining) <= 0.005
                ? "✓ Balanced"
                : remaining > 0
                ? `Remaining: £${remaining.toFixed(2)}`
                : `Over by: £${Math.abs(remaining).toFixed(2)}`}
            </Text>
          </div>

          <HStack gap={8} justify="between">
            <button
              type="button"
              onClick={handleClear}
              style={{
                fontSize: 11,
                padding: "5px 14px",
                background: "none",
                border: "1px solid var(--ft-border)",
                borderRadius: 2,
                color: "var(--ft-muted)",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
              }}
            >
              Clear Split
            </button>
            <HStack gap={8}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  fontSize: 11,
                  padding: "5px 14px",
                  background: "none",
                  border: "1px solid var(--ft-border)",
                  borderRadius: 2,
                  color: "var(--ft-dim)",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={Math.abs(remaining) > 0.005}
                title={Math.abs(remaining) > 0.005 ? "Allocated amounts must equal total" : undefined}
                style={{
                  fontSize: 11,
                  padding: "5px 16px",
                  background: Math.abs(remaining) <= 0.005 ? "var(--ft-accent)" : "var(--ft-raised)",
                  border: "1px solid var(--ft-accent)",
                  borderRadius: 2,
                  color: Math.abs(remaining) <= 0.005 ? "#000" : "var(--ft-dim)",
                  cursor: Math.abs(remaining) > 0.005 ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                }}
              >
                Save
              </button>
            </HStack>
          </HStack>
        </div>
      </div>
    </div>
  );
}

// ── Wise-style empty state preview ────────────────────────────────────────────

const PREVIEW_ICONS: Record<string, React.ReactNode> = {
  housing: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 6.5L7 1.5l5.5 5M3 5.5V12h3V9h2v3h3V5.5" />
    </svg>
  ),
  groceries: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 1.5h2l1.5 6.5h6l1-4H4.5" />
      <circle cx="6" cy="11.5" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="10" cy="11.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  ),
  income: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="4" width="11" height="8" rx="0.5" />
      <path d="M4.5 4V3a.5.5 0 01.5-.5h4a.5.5 0 01.5.5v1" />
      <path d="M1.5 7h11" />
    </svg>
  ),
  transport: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="1.5" width="9" height="8" rx="1" />
      <path d="M2.5 6.5h9M5 1.5V6.5M9 1.5V6.5" />
      <path d="M4 9.5L2 12M10 9.5l2 2.5" />
    </svg>
  ),
  eatingout: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 1.5v4a2.5 2.5 0 005 0v-4" />
      <path d="M6.5 5.5v7" />
      <path d="M4 3.5h5" />
    </svg>
  ),
  subscriptions: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="1" width="7" height="12" rx="1" />
      <path d="M5.5 10.5h3" />
      <circle cx="7" cy="3" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  ),
};

const PREVIEW_ROWS = [
  { iconKey: "housing",      label: "Rent",           category: "Housing",       amount: -1100,  income: false, date: "Today" },
  { iconKey: "groceries",    label: "Sainsbury's",    category: "Groceries",     amount: -67.4,  income: false, date: "Today" },
  { iconKey: "income",       label: "Monthly Salary", category: "Income",        amount: 3700,   income: true,  date: "Yesterday" },
  { iconKey: "transport",    label: "TfL Contactless",category: "Transport",     amount: -4.8,   income: false, date: "Yesterday" },
  { iconKey: "eatingout",    label: "Pret A Manger",  category: "Eating Out",    amount: -5.95,  income: false, date: "Tue 27 Jul" },
  { iconKey: "subscriptions",label: "Spotify",        category: "Subscriptions", amount: -11.99, income: false, date: "Mon 26 Jul" },
];

function TxFeedPreview({ openAdd }: { openAdd: () => void }) {
  const mono: React.CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };
  const grouped = PREVIEW_ROWS.reduce<Record<string, typeof PREVIEW_ROWS>>((acc, r) => {
    if (!acc[r.date]) acc[r.date] = [];
    acc[r.date].push(r);
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 260px)" }}>
      {/* Preview feed */}
      <div style={{ flex: 1, opacity: 0.45, pointerEvents: "none", userSelect: "none" }}>
        {Object.entries(grouped).map(([date, rows]) => (
          <div key={date}>
            {/* Date header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 16px 4px", background: "var(--ft-base)", borderBottom: "1px solid var(--ft-border)", borderTop: "1px solid var(--ft-border)" }}>
              <span style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>{date}</span>
              <span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", marginLeft: "auto" }}>
                {rows.reduce((s, r) => s + r.amount, 0) >= 0
                  ? `+£${Math.abs(rows.reduce((s, r) => s + r.amount, 0)).toFixed(2)}`
                  : `-£${Math.abs(rows.reduce((s, r) => s + r.amount, 0)).toFixed(2)}`}
              </span>
            </div>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 16px", borderBottom: "1px solid var(--ft-border)", background: i % 2 === 0 ? "transparent" : "var(--ft-raised)" }}>
                {/* Category icon */}
                <div style={{ width: 28, height: 28, borderRadius: 2, border: "1px solid var(--ft-border)", background: "var(--ft-surface)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ft-muted)", flexShrink: 0 }}>
                  {PREVIEW_ICONS[r.iconKey]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...mono, fontSize: 11, color: "var(--ft-text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</div>
                  <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", marginTop: 1 }}>{r.category}</div>
                </div>
                <div style={{ ...mono, fontSize: 12, fontWeight: 700, color: r.income ? "var(--ft-green)" : "var(--ft-text)", flexShrink: 0 }}>
                  {r.income ? "+" : "−"}£{Math.abs(r.amount).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* CTA overlay */}
      <div style={{ padding: "28px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, borderTop: "1px solid var(--ft-border)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Your transaction feed</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", textAlign: "center", maxWidth: 340, lineHeight: 1.7 }}>
          Transactions appear here as you add them. Import a bank CSV for instant history, or add manually.
        </div>
        <HStack gap={10}>
          <button onClick={openAdd} style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", background: "var(--ft-accent)", color: "var(--ft-base)", border: "none", padding: "8px 20px", cursor: "pointer" }}>
            + Add transaction
          </button>
          <a href="/import" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", background: "none", color: "var(--ft-accent)", border: "1px solid var(--ft-border2)", padding: "8px 20px", cursor: "pointer", textDecoration: "none", display: "inline-block" }}>
            Import CSV
          </a>
        </HStack>
      </div>
    </div>
  );
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
  const isMobile = useIsMobile();

  // Computed each render so it stays correct after midnight
  const today = new Date().toISOString().slice(0, 10);

  // ── core dialog state ───────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [form, setForm] = useState<TxForm>(makeEmptyForm);
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

  // ── group by day — always on for mobile (Monzo/Revolut pattern) ───────────
  const [groupByDay, setGroupByDay] = useState(false);
  React.useEffect(() => { if (isMobile) setGroupByDay(true); }, [isMobile]);

  // ── pagination ────────────────────────────────────────────────────────────
  const PAGE_SIZE = 75;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // ── split transaction (server-side) ─────────────────────────────────────────
  const [splitTxId, setSplitTxId] = useState<number | null>(null);
  const [splitLines, setSplitLines] = useState<SplitLine[]>([]);
  const [splitSubmitting, setSplitSubmitting] = useState(false);

  // ── localStorage split modal ──────────────────────────────────────────────
  const [splits, setSplits] = useState<Record<string, SplitEntry[]>>(() => loadSplits());
  const [splitModalTx, setSplitModalTx] = useState<SplitModalTx | null>(null);

  // ── templates ─────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<TxTemplate[]>(() => loadTemplates());
  const [autoCatFilled, setAutoCatFilled] = useState(false);

  // ── pending delete (soft-delete with 3s undo window) ─────────────────────
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Clear all pending delete timers on unmount to prevent firing after navigation
  useEffect(() => {
    return () => {
      deleteTimers.current.forEach((timer) => clearTimeout(timer));
      deleteTimers.current.clear();
    };
  }, []);

  // ── search input ref for / shortcut ─────────────────────────────────────
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── AI batch categorize ──────────────────────────────────────────────────
  const [aiCatConfirmOpen, setAiCatConfirmOpen] = useState(false);
  const [aiCatRunning, setAiCatRunning] = useState(false);

  // ── keyboard navigation ──────────────────────────────────────────────────
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const hasFilters = search || filterType !== "all" || filterCategory !== "all" || filterAccount !== "all" || filterDateFrom || filterDateTo || amountMin || amountMax || filterTag;
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const activeFilterCount = [filterType !== "all", filterCategory !== "all", filterAccount !== "all", !!(filterDateFrom || filterDateTo), !!(amountMin || amountMax), !!filterTag].filter(Boolean).length;

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

  const allCategories = useMemo(
    () => [...new Set((transactions ?? []).map(tx => tx.category).filter(Boolean))].sort(),
    [transactions],
  );
  const allAccounts = useMemo(
    () => [...new Set((transactions ?? []).map(tx => tx.accountName).filter(Boolean))].sort(),
    [transactions],
  );

  const filtered = useMemo(() => {
    const base = (transactions ?? []).filter((tx) => {
      if (filterType !== "all" && tx.type !== filterType) return false;
      if (filterCategory !== "all" && tx.category !== filterCategory) return false;
      if (filterAccount !== "all" && tx.accountName !== filterAccount) return false;
      if (filterDateFrom && tx.date < filterDateFrom) return false;
      if (filterDateTo && tx.date > filterDateTo) return false;
      // Amount range filter needs a GBP figure; transactions without
      // an FX conversion fall out of a bounded range but stay in an
      // open one.
      if (amountMin !== "" && (tx.gbpValue == null || Math.abs(tx.gbpValue) < parseFloat(amountMin))) return false;
      if (amountMax !== "" && (tx.gbpValue == null || Math.abs(tx.gbpValue) > parseFloat(amountMax))) return false;
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
    // Amount sorts: unconvertible rows sink to the bottom of a
    // descending sort (magnitude unknown) rather than shuffling above
    // real amounts.
    if (sortBy === "date-asc") return [...base].sort((a, b) => a.date.localeCompare(b.date));
    if (sortBy === "amount-high") return [...base].sort((a, b) => Math.abs(b.gbpValue ?? -Infinity) - Math.abs(a.gbpValue ?? -Infinity));
    if (sortBy === "amount-low") return [...base].sort((a, b) => Math.abs(a.gbpValue ?? Infinity) - Math.abs(b.gbpValue ?? Infinity));
    return base; // date-desc is server default
  }, [transactions, filterType, filterCategory, filterAccount, filterDateFrom, filterDateTo, amountMin, amountMax, search, filterTag, tags, sortBy]);

  // Filtered average: skips unconvertible rows; the denominator drops
  // to match, so this is a true average of what could be converted
  // rather than one padded with fabricated zeros.
  const filteredAvg = useMemo(() => {
    const withGbp = filtered.filter((tx): tx is typeof tx & { gbpValue: number } => tx.gbpValue != null);
    return withGbp.length > 0 ? withGbp.reduce((acc, tx) => acc + tx.gbpValue, 0) / withGbp.length : 0;
  }, [filtered]);

  // ── keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const inInput = () => { const t = document.activeElement?.tagName; return t === "INPUT" || t === "TEXTAREA" || t === "SELECT"; };
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSelectedIds(new Set()); setBulkFormCat(""); setBulkFormType(""); setOpenNoteId(null); setOpenTagId(null); return; }
      if (e.key === "/" && !inInput()) { e.preventDefault(); searchInputRef.current?.focus(); }
      if (e.key === "n" && !inInput() && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setForm(makeEmptyForm()); setAutoCatFilled(false); setAddOpen(true); }
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
  const merchantGroups: MerchantGroup[] = useMemo(() => {
    if (!groupByMerchant) return [];
    const map = new Map<string, MerchantGroup>();
    for (const tx of filtered) {
      // Merchant totals skip unconvertible transactions; the row
      // count still includes them so the merchant doesn't vanish,
      // but the total is honest about what was rolled up.
      if (tx.gbpValue == null) continue;
      const key = tx.description ?? "(no description)";
      const signed = tx.type === "income" ? tx.gbpValue : -tx.gbpValue;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.total += signed;
        existing.txIds.push(tx.id);
      } else {
        map.set(key, {
          description: key,
          count: 1,
          total: signed,
          txIds: [tx.id],
          expanded: expandedMerchants.has(key),
        });
      }
    }
    return Array.from(map.values()).map((g) => ({ ...g, expanded: expandedMerchants.has(g.description) }));
  }, [filtered, groupByMerchant, expandedMerchants]);

  // ── day groups ───────────────────────────────────────────────────────────
  const dayGroups: Array<{ date: string; txs: typeof filtered; net: number }> = useMemo(() => {
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
        // Day net: skip unconvertible rows; unconvertible income and
        // expense wash out of the daily net without fabrication.
        net: txs.reduce((acc, tx) => acc + (tx.gbpValue == null ? 0 : tx.type === "income" ? tx.gbpValue : tx.type === "expense" ? -tx.gbpValue : 0), 0),
      }));
  }, [filtered, groupByDay]);

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
    setForm({ ...makeEmptyForm(), accountId: first ? String(first.id) : "", currency: (first?.currency as Currency) ?? "GBP" });
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
      haptic.success();
    } catch { toast({ title: "Failed to add transaction", variant: "destructive" }); haptic.error(); }
    finally { setSubmitting(false); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (editId === null) return; setSubmitting(true);
    try {
      await updateTx.mutateAsync({ id: editId, data: { date: form.date, description: form.description, type: form.type, category: form.category, nativeAmount: parseFloat(form.nativeAmount), currency: form.currency } });
      invalidate(); setEditId(null); toast({ title: "Transaction updated" });
      haptic.success();
    } catch { toast({ title: "Failed to update", variant: "destructive" }); haptic.error(); }
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
    haptic.warning();
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
      <VStack gap="var(--ft-row-gap)">
        {/* KPI bar skeleton */}
        <div className="ft-scroll-x" style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", minWidth: 640 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ padding: "10px 14px", borderRight: "1px solid var(--ft-border)" }}>
                <FtSkeleton width="50%" height={8} />
                <div style={{ marginTop: 8 }}><FtSkeleton width="70%" height={18} /></div>
                <div style={{ marginTop: 5 }}><FtSkeleton width="40%" height={8} /></div>
              </div>
            ))}
          </div>
        </div>
        {/* Filter bar skeleton */}
        <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
          <div style={{ display: "flex", height: 28, alignItems: "center", gap: 0, borderBottom: "1px solid var(--ft-border)" }}>
            {[80, 120, 100, 120, 80, 80, 60].map((w, i) => (
              <div key={i} style={{ width: w, padding: "0 10px", borderRight: "1px solid var(--ft-border)", height: "100%", display: "flex", alignItems: "center" }}>
                <FtSkeleton width="80%" height={9} />
              </div>
            ))}
          </div>
          <HStack align="center" height={26}>
            {[80, 60, 60, 60, 60, 60, 60, 120, 120, 80, 80].map((w, i) => (
              <div key={i} style={{ width: w, padding: "0 8px", borderRight: "1px solid var(--ft-border)", height: "100%", display: "flex", alignItems: "center" }}>
                <FtSkeleton width="80%" height={8} />
              </div>
            ))}
          </HStack>
        </div>
        {/* Table skeleton */}
        <div style={{ border: "1px solid var(--ft-border)" }}>
          <div style={{ display: "flex", height: 34, alignItems: "center", background: "var(--ft-raised)", borderBottom: "1px solid var(--ft-border2)", padding: "0 12px" }}>
            <FtSkeleton width={160} height={10} />
          </div>
          {/* Column headers skeleton */}
          <div style={{ display: "flex", height: 28, background: "var(--ft-raised)", borderBottom: "1px solid var(--ft-border2)" }}>
            {[36, 90, 240, 120, 150, 90, 130, 110, 36, 36, 128].map((w, i) => (
              <div key={i} style={{ width: w, minWidth: w, borderRight: "1px solid var(--ft-border)", padding: "0 10px", display: "flex", alignItems: "center" }}>
                <FtSkeleton width="60%" height={8} />
              </div>
            ))}
          </div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} style={{ display: "flex", borderBottom: "1px solid var(--ft-border)", height: 32, alignItems: "center" }}>
              <div style={{ width: 36, minWidth: 36, borderRight: "1px solid var(--ft-border)", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <FtSkeleton width={12} height={12} />
              </div>
              <div style={{ width: 90, minWidth: 90, borderRight: "1px solid var(--ft-border)", padding: "0 12px" }}><FtSkeleton width={70} height={10} /></div>
              <div style={{ flex: 1, borderRight: "1px solid var(--ft-border)", padding: "0 12px" }}><FtSkeleton width="55%" height={11} /></div>
              <div style={{ width: 120, minWidth: 120, borderRight: "1px solid var(--ft-border)", padding: "0 12px" }}><FtSkeleton width={60} height={10} /></div>
              <div style={{ width: 150, minWidth: 150, borderRight: "1px solid var(--ft-border)", padding: "0 12px" }}><FtSkeleton width={90} height={10} /></div>
              <div style={{ width: 90, minWidth: 90, borderRight: "1px solid var(--ft-border)", padding: "0 12px" }}><FtSkeleton width={50} height={10} /></div>
              <div style={{ width: 130, minWidth: 130, borderRight: "1px solid var(--ft-border)", padding: "0 12px", display: "flex", justifyContent: "flex-end" }}><FtSkeleton width={70} height={11} /></div>
              <div style={{ width: 110, minWidth: 110, borderRight: "1px solid var(--ft-border)", padding: "0 12px", display: "flex", justifyContent: "flex-end" }}><FtSkeleton width={60} height={11} /></div>
              <div style={{ width: 36, minWidth: 36, borderRight: "1px solid var(--ft-border)" }} />
              <div style={{ width: 36, minWidth: 36, borderRight: "1px solid var(--ft-border)" }} />
              <div style={{ width: 128, minWidth: 128, padding: "0 8px" }}><FtSkeleton width={80} height={10} /></div>
            </div>
          ))}
        </div>
      </VStack>
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
          <Text as="div" upper size={9} color="var(--ft-dim)" letterSpacing="0.08em" mb={6}>Templates</Text>
          <HStack gap={4} wrap>
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
          </HStack>
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
        <HStack gap={6} align="center">
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
        </HStack>
        {formErrors.description && <div style={ERR_STYLE}>{formErrors.description}</div>}
      </div>
      <div className="space-y-1.5">
        <HStack gap={6} align="center">
          <Label htmlFor="tx-cat">Category</Label>
          {autoCatFilled && (
            <span
              style={{
                fontSize: 9,
                padding: "1px 5px",
                background: "color-mix(in srgb, var(--ft-cyan) 12%, transparent)",
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
        </HStack>
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
        background: activeQuickRange === key ? "color-mix(in srgb, var(--ft-amber) 12%, transparent)" : "var(--ft-surface)",
        border: `1px solid ${activeQuickRange === key ? "var(--ft-amber)" : "var(--ft-border2)"}`,
        borderRadius: 2,
        color: activeQuickRange === key ? "var(--ft-amber)" : "var(--ft-dim)",
        cursor: "pointer",
        whiteSpace: "nowrap" as const,
        transition: "background 0.1s, color 0.1s, border-color 0.1s",
      }}
    >
      {label}
    </button>
  );

  const TAG_CHIP_STYLE: React.CSSProperties = {
    background: "color-mix(in srgb, var(--ft-amber) 15%, transparent)",
    color: "var(--ft-amber)",
    border: "1px solid color-mix(in srgb, var(--ft-amber) 30%, transparent)",
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
    // displayGbp is null when neither an override nor a server-side
    // FX conversion is available; the row still shows the native
    // amount alone, never £0.
    const displayGbp: number | null = hasOverride ? fxGbp : tx.gbpValue == null ? null : Math.abs(tx.gbpValue);
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
    const [hovered, setHovered] = useState(false);
    const swipe = useSwipeDelete(() => handleDelete(tx.id));
    return (
    <div className="ft-swipe-row" data-tx-row>
      {isMobile && (
        <button
          type="button"
          className="ft-swipe-delete-action"
          onClick={swipe.handleDelete}
          aria-label={`Delete ${tx.description}`}
        >
          DELETE
        </button>
      )}
      <div
        key={tx.id}
        className={`flex items-center border-b xls-row${isMobile ? " ft-swipe-row-content" : ""}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        {...(isMobile ? swipe.touchHandlers : {})}
        style={{
          borderColor: "var(--ft-border)",
          background: selectedIds.has(tx.id) ? "color-mix(in srgb, var(--ft-blue) 8%, var(--ft-base))" : isKeyboardSelected ? "var(--ft-raised)" : hovered ? "var(--ft-raised)" : "var(--ft-surface)",
          borderLeft: isKeyboardSelected ? "2px solid var(--ft-accent)" : selectedIds.has(tx.id) ? "2px solid var(--ft-accent)" : "2px solid transparent",
          opacity: pendingDeleteIds.has(tx.id) ? 0.4 : 1,
          textDecoration: pendingDeleteIds.has(tx.id) ? "line-through" : "none",
          transition: isMobile ? "opacity 0.15s, background 0.1s, border-left-color 0.1s, transform 0.15s ease" : "opacity 0.15s, background 0.1s, border-left-color 0.1s",
          ...(isMobile ? { transform: `translateX(${swipe.offset}px)` } : {}),
        }}
      >
        {isMobile ? (
          <HStack gap={12} align="center" padding="11px 14px" grow minWidth0>
            {/* Category avatar circle */}
            <div style={{
              flexShrink: 0, width: 38, height: 38, borderRadius: "50%",
              background: `color-mix(in srgb, ${TX_TYPE_COLOR[tx.type as TxType]} 18%, var(--ft-raised))`,
              border: `1.5px solid ${TX_TYPE_COLOR[tx.type as TxType]}44`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 13, fontFamily: "var(--font-mono)", fontWeight: 700, color: TX_TYPE_COLOR[tx.type as TxType] }}>
                {(tx.category ?? tx.type ?? "?")[0].toUpperCase()}
              </span>
            </div>
            {/* Description + meta */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>
                <PrivDesc>{tx.description}</PrivDesc>
              </div>
              <div style={{ display: "flex", gap: 5, alignItems: "center", overflow: "hidden" }}>
                {tx.category && <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ft-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>{tx.category}</span>}
                {tx.category && tx.accountName && <span style={{ fontSize: 11, color: "var(--ft-border2)", flexShrink: 0 }}>·</span>}
                {tx.accountName && <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 90 }}>{tx.accountName}</span>}
                {hasNote && <span title="Has note" style={{ fontSize: 10, color: "var(--ft-amber)", flexShrink: 0 }}>✎</span>}
                {hasTags && <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-amber)", flexShrink: 0 }}>+{txTags.length}</span>}
              </div>
            </div>
            {/* Amount + edit */}
            <div style={{ flexShrink: 0, textAlign: "right" }}>
              <div className="pnum" style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono)", color: displayGbp == null ? "var(--ft-dim)" : TX_TYPE_COLOR[tx.type as TxType], whiteSpace: "nowrap" }}>
                {displayGbp == null
                  ? formatNative(Math.abs(tx.nativeAmount), tx.currency)
                  : `${tx.type === "income" ? "+" : tx.type === "expense" ? "−" : ""}${formatGbp(displayGbp)}`}
              </div>
              <HStack gap={6} align="center" justify="end" marginTop={3}>
                <Text as="span" mono size={10} color="var(--ft-dim)" nowrap>{formatDate(tx.date)}</Text>
                <button type="button" onClick={(e) => { e.stopPropagation(); openEdit(tx.id); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, lineHeight: 0, display: "flex", alignItems: "center" }}>
                  <Edit2 style={{ width: 12, height: 12, color: "var(--ft-muted)" }} />
                </button>
              </HStack>
            </div>
          </HStack>
        ) : (<>
        <div style={{ width: 36, minWidth: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid var(--ft-border)", alignSelf: "stretch" }}>
          <input
            type="checkbox"
            checked={selectedIds.has(tx.id)}
            onChange={() => toggleSelect(tx.id)}
            style={{ cursor: "pointer", accentColor: "var(--ft-blue)" }}
            aria-label={`Select transaction ${tx.description}`}
          />
        </div>
        <div style={{ width: 90, minWidth: 90, flexShrink: 0, padding: indented ? "6px 10px 6px 20px" : "6px 10px", borderRight: "1px solid var(--ft-border)", color: "var(--ft-dim)", fontSize: 10, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
          {formatDate(tx.date)}
        </div>
        <div style={{ flex: 1, minWidth: 0, padding: "6px 10px", borderRight: "1px solid var(--ft-border)", color: "var(--ft-text)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            <PrivDesc>{tx.description}</PrivDesc>
          </span>
          {hasTags && (
            <HStack gap={3} align="center" shrink={false}>
              {visibleTags.map((t) => (
                <span key={t} style={TAG_CHIP_STYLE}>{t}</span>
              ))}
              {hiddenTagCount > 0 && (
                <span style={{ ...TAG_CHIP_STYLE, background: "color-mix(in srgb, var(--ft-amber) 8%, transparent)" }}>+{hiddenTagCount}</span>
              )}
            </HStack>
          )}
        </div>
        <div style={{ width: 120, minWidth: 120, flexShrink: 0, padding: "6px 10px", borderRight: "1px solid var(--ft-border)", display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
          <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 2, border: "1px solid var(--ft-border2)", background: "var(--ft-raised)", color: "var(--ft-muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.05em", fontWeight: 700, whiteSpace: "nowrap" as const, lineHeight: "14px", flexShrink: 0, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis" }}>
            {tx.category}
          </span>
          {splits[String(tx.id)] && (
            <span style={{
              fontSize: 8,
              padding: "0 4px",
              borderRadius: 2,
              background: "transparent",
              color: "var(--ft-accent)",
              border: "1px solid var(--ft-accent)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.04em",
              whiteSpace: "nowrap" as const,
              lineHeight: "16px",
            }}>
              ⊕
            </span>
          )}
        </div>
        <div className="ft-hide-mobile" style={{ width: 150, minWidth: 150, flexShrink: 0, padding: "6px 10px", borderRight: "1px solid var(--ft-border)", color: "var(--ft-muted)", fontSize: 10, fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {tx.accountName}
        </div>
        <div className="ft-hide-mobile" style={{ width: 90, minWidth: 90, flexShrink: 0, padding: "6px 10px", borderRight: "1px solid var(--ft-border)", display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 2, border: `1px solid ${TX_TYPE_COLOR[tx.type as TxType]}`, background: "transparent", color: TX_TYPE_COLOR[tx.type as TxType], textTransform: "uppercase" as const, letterSpacing: "0.06em", fontFamily: "var(--font-mono)", fontWeight: 700, lineHeight: "14px" }}>
            {tx.type}
          </span>
        </div>
        <div style={{ width: 130, minWidth: 130, flexShrink: 0, padding: "6px 10px", borderRight: "1px solid var(--ft-border)", textAlign: "right", color: tx.type === "income" ? "var(--ft-green)" : tx.type === "expense" ? "var(--ft-red)" : "var(--ft-blue)", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {tx.type === "income" ? "+" : tx.type === "expense" ? "−" : ""}
          {formatNative(Math.abs(tx.nativeAmount), tx.currency)}
        </div>
        {/* GBP column: "—" when FX unavailable; the native column above
            still carries the honest amount. */}
        <div className="pnum" style={{ width: 110, minWidth: 110, flexShrink: 0, padding: "6px 10px", borderRight: "1px solid var(--ft-border)", textAlign: "right", color: displayGbp == null ? "var(--ft-dim)" : tx.type === "income" ? "var(--ft-green)" : tx.type === "expense" ? "var(--ft-red)" : "var(--ft-blue)", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {displayGbp == null
            ? "—"
            : (<>
                {tx.type === "income" ? "+" : tx.type === "expense" ? "−" : ""}
                {formatGbp(displayGbp)}
                {hasOverride && <span title="Custom FX rate applied" style={{ fontSize: 8, color: "var(--ft-amber)", marginLeft: 2, verticalAlign: "super" }}>★</span>}
              </>)}
        </div>
        {/* Note icon column */}
        <div style={{ width: 36, minWidth: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid var(--ft-border)", alignSelf: "stretch" }}>
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
        <div style={{ width: 36, minWidth: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid var(--ft-border)", alignSelf: "stretch", position: "relative" }}>
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
              <span style={{ position: "absolute", top: -1, right: -1, background: "var(--ft-amber)", color: "var(--ft-base)", borderRadius: 2, fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)", lineHeight: 1, padding: "1px 2px", minWidth: 10, textAlign: "center" }}>
                {txTags.length}
              </span>
            )}
          </button>
        </div>
        <div style={{ width: 128, minWidth: 128, flexShrink: 0, padding: "2px 4px", display: "flex", justifyContent: "flex-end", gap: 2, alignItems: "center" }}>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openSplit(tx.id)} title="Split transaction (creates new transactions)">
            <Text as="span" size={13} color="var(--ft-muted)">⊕</Text>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setSplitModalTx({ id: tx.id, description: tx.description, date: tx.date, gbpValue: tx.gbpValue })}
            title="Split view (local annotation)"
            style={{ color: splits[String(tx.id)] ? "var(--ft-accent)" : undefined }}
          >
            <Text as="span" mono size={9} weight={700} color={splits[String(tx.id)] ? "var(--ft-accent)" : "var(--ft-dim)"}>SL</Text>
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(tx.id)} title="Edit transaction">
            <Edit2 className="w-3.5 h-3.5" style={{ color: "var(--ft-muted)" }} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(tx.id)} title="Delete transaction (undo available)">
            <Trash2 className="w-3.5 h-3.5" style={{ color: "var(--ft-red)" }} />
          </Button>
        </div>
        </>)}
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
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
              NOTE — <Text as="span" color="var(--ft-muted)">{tx.description}</Text>
            </div>
            <span style={{ fontSize: 8, color: "var(--ft-dim)", fontFamily: "var(--font-mono)", border: "1px solid var(--ft-border2)", padding: "1px 5px", letterSpacing: "0.04em", background: "var(--ft-raised)" }} title="Notes are saved locally on this device only and will not sync across browsers or devices">
              device-local
            </span>
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
          <HStack gap={6} justify="end" marginTop={8}>
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
              style={{ fontSize: 11, padding: "3px 10px", background: "var(--ft-accent)", border: "1px solid var(--ft-accent)", borderRadius: 2, color: "var(--ft-base)", cursor: "pointer", fontFamily: "var(--font-mono)", fontWeight: 600 }}
            >
              Save
            </button>
          </HStack>
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
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
              TAGS — <span style={{ color: "var(--ft-muted)" }}>{tx.description}</span>
            </div>
            <span style={{ fontSize: 8, color: "var(--ft-dim)", fontFamily: "var(--font-mono)", border: "1px solid var(--ft-border2)", padding: "1px 5px", letterSpacing: "0.04em", background: "var(--ft-raised)" }} title="Tags are saved locally on this device only and will not sync across browsers or devices">
              device-local
            </span>
          </div>
          {/* Existing tag chips */}
          {txTags.length > 0 && (
            <HStack gap={4} wrap marginBottom={8}>
              {txTags.map((t) => (
                <span key={t} style={{ ...TAG_CHIP_STYLE, cursor: "pointer" }} onClick={() => removeTag(tx.id, t)} title="Click to remove">
                  {t}
                  <span style={{ marginLeft: 2, opacity: 0.7 }}>×</span>
                </span>
              ))}
            </HStack>
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
              <HStack gap={4} wrap>
                {tagSuggestionsFiltered.slice(0, 10).map((s) => (
                  <span
                    key={s}
                    onClick={() => addTag(tx.id, s)}
                    style={{ ...TAG_CHIP_STYLE, cursor: "pointer", opacity: 0.65 }}
                  >
                    + {s}
                  </span>
                ))}
              </HStack>
            </div>
          )}
          <HStack justify="end" marginTop={8}>
            <button
              type="button"
              onClick={() => setOpenTagId(null)}
              style={{ fontSize: 11, padding: "3px 10px", background: "none", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-dim)", cursor: "pointer", fontFamily: "var(--font-mono)" }}
            >
              Done
            </button>
          </HStack>
        </div>
      )}
    </div>
  );
  };

  // ── Derived KPI data ─────────────────────────────────────────────────────
  // Skip unconvertible transactions from all four KPIs; kpiUnconvertible
  // surfaces the count so the strip can say "N tx without FX".
  const kpiIncome = filtered.reduce((acc, tx) => acc + (tx.type === "income" && tx.gbpValue != null ? tx.gbpValue : 0), 0);
  const kpiExpenses = filtered.reduce((acc, tx) => acc + (tx.type === "expense" && tx.gbpValue != null ? Math.abs(tx.gbpValue) : 0), 0);
  const kpiNet = kpiIncome - kpiExpenses;
  const filteredWithGbp = filtered.filter((tx): tx is typeof tx & { gbpValue: number } => tx.gbpValue != null);
  const kpiAvg = filteredWithGbp.length > 0 ? filteredWithGbp.reduce((acc, tx) => acc + Math.abs(tx.gbpValue), 0) / filteredWithGbp.length : 0;
  const kpiUnconvertible = filtered.length - filteredWithGbp.length;
  const kpiDateFrom = filtered.length > 0 ? filtered.reduce((a, b) => a.date < b.date ? a : b).date : null;
  const kpiDateTo = filtered.length > 0 ? filtered.reduce((a, b) => a.date > b.date ? a : b).date : null;

  return (
    <VStack gap="var(--ft-row-gap)">
      <CsvImportModal
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onSuccess={() => { invalidate(); setCsvOpen(false); }}
      />

      <datalist id="tx-categories">
        {CATEGORIES.map((c) => <option key={c} value={c} />)}
      </datalist>

      {/* ── Add dialog ── */}
      <MobileSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add Transaction"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit" form="add-tx-form" disabled={submitting}>{submitting ? "Adding…" : "Add Transaction"}</Button>
          </>
        }
      >
        <form id="add-tx-form" onSubmit={handleAdd}>
          {FormFields(false)}
          {isMobile && <div style={{ height: 8 }} />}
        </form>
      </MobileSheet>

      {/* ── Edit dialog ── */}
      <MobileSheet
        open={editId !== null}
        onOpenChange={(o) => !o && setEditId(null)}
        title="Edit Transaction"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setEditId(null)}>Cancel</Button>
            <Button type="submit" form="edit-tx-form" disabled={submitting}>{submitting ? "Saving…" : "Save Changes"}</Button>
          </>
        }
      >
        <form id="edit-tx-form" onSubmit={handleEdit}>
          {FormFields(true)}
          {isMobile && <div style={{ height: 8 }} />}
        </form>
      </MobileSheet>

      {/* ── Split dialog ── */}
      <Dialog open={splitTxId !== null} onOpenChange={(o) => !o && setSplitTxId(null)}>
        <DialogContent style={{ maxWidth: 520 }}>
          <DialogHeader><DialogTitle>Split Transaction</DialogTitle></DialogHeader>
          {splitTx && (
            <form onSubmit={handleSplitSubmit}>
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", borderRadius: 2, padding: "10px 14px", marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "var(--ft-dim)", marginBottom: 4 }}>ORIGINAL TRANSACTION</div>
                <HStack align="center" justify="between">
                  <div>
                    <div style={{ fontSize: 13, color: "var(--ft-text)", fontWeight: 600 }}>{splitTx.description}</div>
                    <Text as="div" size={11} color="var(--ft-muted)" mt={2}>{formatDate(splitTx.date)} · {splitTx.category}</Text>
                  </div>
                  <Text as="div" size={14} weight={700} color={splitTx.type === "income" ? "var(--ft-green)" : "var(--ft-red)"} numeric>
                    {formatNative(Math.abs(splitTx.nativeAmount), splitTx.currency)}
                  </Text>
                </HStack>
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

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--ft-border)", borderBottom: "1px solid var(--ft-border)", marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "var(--ft-muted)" }}>
                  Total split: <Text as="span" color="var(--ft-text)" numeric>{splitTx.currency} {splitTotal.toFixed(2)}</Text>
                </div>
                <Text as="div" size={11} color={splitRemaining === 0 ? "var(--ft-green)" : splitRemaining < 0 ? "var(--ft-red)" : "var(--ft-amber)"}>
                  {splitRemaining === 0 ? "Balanced" : splitRemaining > 0 ? `Remaining: ${splitTx.currency} ${splitRemaining.toFixed(2)}` : `Over by: ${splitTx.currency} ${Math.abs(splitRemaining).toFixed(2)}`}
                </Text>
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
                Found <Text as="span" weight={700} color="var(--ft-amber)">{uncategorizedTxs.length}</Text>{" "}
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
              style={{ background: "var(--ft-amber)", color: "var(--ft-base)", border: "none", borderRadius: 2, fontWeight: 700 }}
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── KPI bar — Bloomberg-style 6-cell strip (desktop only) ── */}
      <div className="ft-hide-mobile" style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
        <div className="ft-kpi-bar" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)" }}>
          {/* TX COUNT */}
          <div style={{ padding: "10px 14px", borderRight: "1px solid var(--ft-border)", display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--ft-dim)" }}>TX COUNT</div>
            <Text as="div" mono size={16} weight={700} color="var(--ft-text)" lineHeight={1} numeric>
              {filtered.length}
            </Text>
            {hasFilters && (
              <Text as="div" mono size={10} color="var(--ft-muted)">
                of {transactions?.length ?? 0}
              </Text>
            )}
          </div>
          {/* TOTAL IN */}
          <div style={{ padding: "10px 14px", borderRight: "1px solid var(--ft-border)", display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--ft-dim)" }}>TOTAL IN</div>
            <div className="pnum" style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", color: kpiIncome > 0 ? "var(--ft-green)" : "var(--ft-muted)", lineHeight: 1 }}>
              {formatGbp(kpiIncome)}
            </div>
            {kpiUnconvertible > 0
              ? <Text as="div" mono size={9} color="var(--ft-amber)" letterSpacing="0.04em">income · {kpiUnconvertible} tx no FX</Text>
              : <Text as="div" mono size={9} color="var(--ft-dim)" letterSpacing="0.04em">income</Text>}
          </div>
          {/* TOTAL OUT */}
          <div style={{ padding: "10px 14px", borderRight: "1px solid var(--ft-border)", display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--ft-dim)" }}>TOTAL OUT</div>
            <div className="pnum" style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", color: kpiExpenses > 0 ? "var(--ft-red)" : "var(--ft-muted)", lineHeight: 1 }}>
              {formatGbp(kpiExpenses)}
            </div>
            <Text as="div" mono size={9} color="var(--ft-dim)" letterSpacing="0.04em">expenses</Text>
          </div>
          {/* NET */}
          <div style={{ padding: "10px 14px", borderRight: "1px solid var(--ft-border)", display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--ft-dim)" }}>NET</div>
            <div className="pnum" style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", color: kpiNet !== 0 ? (kpiNet >= 0 ? "var(--ft-green)" : "var(--ft-red)") : "var(--ft-muted)", lineHeight: 1 }}>
              {kpiNet >= 0 ? "+" : "−"}{formatGbp(Math.abs(kpiNet))}
            </div>
            <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: kpiNet !== 0 ? (kpiNet >= 0 ? "var(--ft-green)" : "var(--ft-red)") : "var(--ft-muted)", letterSpacing: "0.04em" }}>
              {kpiNet > 0 ? "▲ surplus" : kpiNet < 0 ? "▼ deficit" : "net"}
            </div>
          </div>
          {/* AVG / TX */}
          <div style={{ padding: "10px 14px", borderRight: "1px solid var(--ft-border)", display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--ft-dim)" }}>AVG / TX</div>
            <div className="pnum" style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", color: "var(--ft-text)", lineHeight: 1 }}>
              {filtered.length > 0 ? formatGbp(kpiAvg) : "—"}
            </div>
            <Text as="div" mono size={9} color="var(--ft-dim)" letterSpacing="0.04em">per transaction</Text>
          </div>
          {/* DATE RANGE + ACTIONS */}
          <VStack gap={3} padding="10px 14px">
            <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--ft-dim)" }}>DATE RANGE</div>
            <Text as="div" mono size={11} color="var(--ft-muted)" lineHeight={1.4} numeric>
              {kpiDateFrom && kpiDateTo
                ? kpiDateFrom === kpiDateTo
                  ? kpiDateFrom
                  : `${kpiDateFrom} → ${kpiDateTo}`
                : "—"}
            </Text>
            {/* Action buttons stacked — hidden on mobile (use FAB instead) */}
            <div className="ft-hide-mobile" style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
              <button
                type="button"
                onClick={openAdd}
                style={{ height: 20, padding: "0 8px", fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.06em", background: "var(--ft-accent)", border: "1px solid var(--ft-accent)", borderRadius: 2, color: "var(--ft-base)", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const }}
              >
                + ADD
              </button>
              <button
                type="button"
                onClick={() => exportCsv(filtered)}
                style={{ height: 20, padding: "0 7px", fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.06em", background: "transparent", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-muted)", cursor: "pointer", whiteSpace: "nowrap" as const }}
              >
                ↓ CSV
              </button>
              <button
                type="button"
                onClick={() => setCsvOpen(true)}
                style={{ height: 20, padding: "0 7px", fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.06em", background: "transparent", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-muted)", cursor: "pointer", whiteSpace: "nowrap" as const }}
              >
                ↑ CSV
              </button>
              <button
                type="button"
                onClick={() => setAiCatConfirmOpen(true)}
                disabled={aiCatRunning}
                style={{ height: 20, padding: "0 7px", fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.06em", background: "transparent", border: `1px solid ${aiCatRunning ? "var(--ft-border)" : "var(--ft-amber)"}`, borderRadius: 2, color: aiCatRunning ? "var(--ft-dim)" : "var(--ft-amber)", cursor: aiCatRunning ? "not-allowed" : "pointer", whiteSpace: "nowrap" as const }}
              >
                {aiCatRunning ? "AI…" : "AI CAT"}
              </button>
            </div>
          </VStack>
        </div>
      </div>

      {/* Persona context strip */}
      {(() => {
        const pid = loadPersonaIds()[0];
        if (!pid || pid === "full") return null;
        const sr = summary?.savingsRate;
        const msgs: Record<string, string | null> = {
          budget:  `Categorize every transaction for accurate budget tracking. Use the AI Categorize button to auto-tag uncategorized entries in bulk.`,
          market:  sr != null ? `Savings rate this month: ${sr.toFixed(1)}%. Track income transactions to identify your investable surplus after all expenses.` : `Ensure income transactions are correctly typed to accurately calculate your investable surplus.`,
          wealth:  sr != null && sr >= 20 ? `${sr.toFixed(1)}% savings rate this month — solid wealth accumulation pace. Keep categorization clean for accurate FIRE progress tracking.` : `Clean categorization feeds accurate analytics and cashflow projections — key inputs for your FIRE timeline.`,
          social:  `Tag shared expenses with the correct category so Bill Split and Group Split can identify them automatically.`,
        };
        const msg = msgs[pid];
        if (!msg) return null;
        const color = PERSONA_COLORS[pid as keyof typeof PERSONA_COLORS] ?? "var(--ft-accent)";
        return (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", border: "1px solid var(--ft-border)", borderLeft: `2px solid ${color}`, background: "var(--ft-surface)", padding: "7px 14px 7px 10px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color, fontWeight: 700, flexShrink: 0 }}>·</span>
            <span>{msg}</span>
          </div>
        );
      })()}

      {isSummaryError && !isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Summary unavailable</AlertTitle>
          <AlertDescription>Could not load the transaction summary. Transactions are still shown below.</AlertDescription>
        </Alert>
      )}

      {/* ── Mobile Wise-style summary strip ── */}
      {isMobile && (
        <div style={{ border: "1px solid var(--ft-border)", borderTop: "none", background: "var(--ft-surface)" }}>
          <div style={{ padding: "5px 12px", borderBottom: "1px solid var(--ft-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <MonoLabel as="span" size={9} letterSpacing="0.10em">
              {kpiDateFrom && kpiDateTo
                ? kpiDateFrom === kpiDateTo ? kpiDateFrom : `${kpiDateFrom} → ${kpiDateTo}`
                : "All Transactions"}
            </MonoLabel>
            <Text as="span" mono size={9} color="var(--ft-dim)">{filtered.length} TX</Text>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div style={{ padding: "10px 10px", borderRight: "1px solid var(--ft-border)" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.10em", marginBottom: 3 }}>In</div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: kpiIncome > 0 ? "var(--ft-green)" : "var(--ft-muted)", fontVariantNumeric: "tabular-nums", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                {formatGbp(kpiIncome)}
              </div>
            </div>
            <div style={{ padding: "10px 10px", borderRight: "1px solid var(--ft-border)" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.10em", marginBottom: 3 }}>Out</div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: kpiExpenses > 0 ? "var(--ft-red)" : "var(--ft-muted)", fontVariantNumeric: "tabular-nums", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                {formatGbp(kpiExpenses)}
              </div>
            </div>
            <div style={{ padding: "10px 10px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.10em", marginBottom: 3 }}>Net</div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: kpiNet !== 0 ? (kpiNet >= 0 ? "var(--ft-green)" : "var(--ft-red)") : "var(--ft-muted)", fontVariantNumeric: "tabular-nums", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                {kpiNet >= 0 ? "+" : "−"}{formatGbp(Math.abs(kpiNet))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile filter bar: search + bottom-sheet for all filters ── */}
      {isMobile && (
        <>
          <PanelBox padding="6px 10px" borderTop="none"><HStack gap={6} align="center">
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, background: "var(--ft-base)", border: "1px solid var(--ft-border2)", borderRadius: 2, padding: "0 8px", height: 32 }}>
              <Search style={{ width: 12, height: 12, color: "var(--ft-dim)", flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="ft-filter-input"
                style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--ft-text)", fontFamily: "var(--font-mono)", fontSize: 13 }}
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} style={{ background: "none", border: "none", color: "var(--ft-dim)", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
                  <X style={{ width: 13, height: 13 }} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setFilterSheetOpen(true)}
              style={{
                height: 32, minWidth: 60, padding: "0 10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                background: activeFilterCount > 0 ? "color-mix(in srgb, var(--ft-accent) 15%, transparent)" : "var(--ft-surface)",
                border: `1px solid ${activeFilterCount > 0 ? "var(--ft-accent)" : "var(--ft-border2)"}`,
                borderRadius: 2, cursor: "pointer", flexShrink: 0,
                color: activeFilterCount > 0 ? "var(--ft-accent)" : "var(--ft-muted)",
                fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.04em", fontWeight: 600,
              }}
            >
              <SlidersHorizontal style={{ width: 11, height: 11 }} />
              {activeFilterCount > 0 ? `·${activeFilterCount}` : "FILTER"}
            </button>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="ft-filter-input"
              style={{ height: 32, padding: "0 6px", fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", borderRadius: 2, outline: "none", color: "var(--ft-muted)", fontFamily: "var(--font-mono)", cursor: "pointer", flexShrink: 0 }}
            >
              <option value="date-desc">↓ Date</option>
              <option value="date-asc">↑ Date</option>
              <option value="amount-high">↓ Amt</option>
              <option value="amount-low">↑ Amt</option>
            </select>
          </HStack></PanelBox>
          {activeFilterCount > 0 && (
            <div style={{ display: "flex", gap: 6, padding: "5px 10px", flexWrap: "wrap" as const, borderBottom: "1px solid var(--ft-border)", background: "var(--ft-raised)", alignItems: "center" }}>
              {filterType !== "all" && <span style={{ padding: "2px 8px", background: "color-mix(in srgb, var(--ft-blue) 15%, transparent)", border: "1px solid color-mix(in srgb, var(--ft-blue) 40%, transparent)", borderRadius: 2, fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-blue)" }}>{filterType}</span>}
              {filterCategory !== "all" && <span style={{ padding: "2px 8px", background: "color-mix(in srgb, var(--ft-accent) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--ft-accent) 35%, transparent)", borderRadius: 2, fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-accent)" }}>{filterCategory}</span>}
              {filterAccount !== "all" && <span style={{ padding: "2px 8px", background: "color-mix(in srgb, var(--ft-green) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--ft-green) 35%, transparent)", borderRadius: 2, fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-green)" }}>{filterAccount}</span>}
              {(filterDateFrom || filterDateTo) && <span style={{ padding: "2px 8px", background: "color-mix(in srgb, var(--ft-amber) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--ft-amber) 35%, transparent)", borderRadius: 2, fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-amber)" }}>{filterDateFrom || "…"} → {filterDateTo || "…"}</span>}
              <button type="button" onClick={() => { setFilterType("all"); setFilterCategory("all"); setFilterAccount("all"); setFilterDateFrom(""); setFilterDateTo(""); setAmountMin(""); setAmountMax(""); setFilterTag(""); }} style={{ marginLeft: "auto", padding: "2px 8px", background: "transparent", border: "1px solid var(--ft-border2)", borderRadius: 2, fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-red)", cursor: "pointer" }}>✕ Clear</button>
            </div>
          )}
          <MobileSheet
            open={filterSheetOpen}
            onOpenChange={setFilterSheetOpen}
            title="Filter Transactions"
            footer={
              <HStack gap={8}>
                {(hasFilters) && (
                  <button type="button" onClick={() => { setSearch(""); setFilterType("all"); setFilterCategory("all"); setFilterAccount("all"); setFilterDateFrom(""); setFilterDateTo(""); setAmountMin(""); setAmountMax(""); setSortBy("date-desc"); setFilterTag(""); setFilterSheetOpen(false); }} style={{ flex: 1, padding: "11px", fontSize: 12, fontFamily: "var(--font-mono)", letterSpacing: "0.06em", background: "transparent", border: "1px solid var(--ft-border2)", borderRadius: 3, color: "var(--ft-red)", cursor: "pointer" }}>✕ Clear all</button>
                )}
                <button type="button" onClick={() => setFilterSheetOpen(false)} style={{ flex: 2, padding: "11px", fontSize: 13, fontFamily: "var(--font-mono)", letterSpacing: "0.06em", background: "var(--ft-accent)", border: "1px solid var(--ft-accent)", borderRadius: 3, color: "var(--ft-base)", fontWeight: 700, cursor: "pointer" }}>Show {filtered.length} results</button>
              </HStack>
            }
          >
            <VStack gap={22}>
              <div>
                <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.10em", color: "var(--ft-dim)", textTransform: "uppercase" as const, marginBottom: 8 }}>Type</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                  {(["all", "income", "expense", "transfer"] as const).map(t => (
                    <button key={t} type="button" onClick={() => setFilterType(t)} style={{ padding: "9px 4px", fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.04em", borderRadius: 3, cursor: "pointer", background: filterType === t ? "var(--ft-accent)" : "transparent", border: `1px solid ${filterType === t ? "var(--ft-accent)" : "var(--ft-border2)"}`, color: filterType === t ? "var(--ft-base)" : "var(--ft-muted)", fontWeight: filterType === t ? 700 : 400, textTransform: "capitalize" as const }}>
                      {t === "all" ? "All" : t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <MonoLabel as="div" size={10} letterSpacing="0.10em" mb={8}>Category</MonoLabel>
                <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ width: "100%", padding: "10px 12px", fontSize: 14, fontFamily: "var(--font-mono)", background: "var(--ft-base)", border: "1px solid var(--ft-border2)", borderRadius: 3, color: filterCategory !== "all" ? "var(--ft-text)" : "var(--ft-muted)", outline: "none", cursor: "pointer" }}>
                  <option value="all">All categories</option>
                  {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <MonoLabel as="div" size={10} letterSpacing="0.10em" mb={8}>Account</MonoLabel>
                <select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)} style={{ width: "100%", padding: "10px 12px", fontSize: 14, fontFamily: "var(--font-mono)", background: "var(--ft-base)", border: "1px solid var(--ft-border2)", borderRadius: 3, color: filterAccount !== "all" ? "var(--ft-text)" : "var(--ft-muted)", outline: "none", cursor: "pointer" }}>
                  <option value="all">All accounts</option>
                  {allAccounts.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <MonoLabel as="div" size={10} letterSpacing="0.10em" mb={8}>Date Range</MonoLabel>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 10 }}>
                  {(["Today", "Week", "Month", "Last Mo", "3M", "All"] as const).map((label, i) => {
                    const keys = ["today", "week", "month", "lastmonth", "3m", "all"] as const;
                    const k = keys[i];
                    return (
                      <button key={k} type="button" onClick={() => applyQuickRange(k)} style={{ padding: "9px 4px", fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.04em", borderRadius: 3, cursor: "pointer", background: activeQuickRange === k ? "color-mix(in srgb, var(--ft-accent) 15%, transparent)" : "transparent", border: `1px solid ${activeQuickRange === k ? "var(--ft-accent)" : "var(--ft-border2)"}`, color: activeQuickRange === k ? "var(--ft-accent)" : "var(--ft-muted)", textTransform: "uppercase" as const }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", marginBottom: 4 }}>FROM</div>
                    <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} style={{ width: "100%", padding: "9px", fontSize: 13, background: "var(--ft-base)", border: "1px solid var(--ft-border2)", borderRadius: 3, color: filterDateFrom ? "var(--ft-text)" : "var(--ft-muted)", outline: "none", fontFamily: "var(--font-mono)", boxSizing: "border-box" as const }} />
                  </div>
                  <div>
                    <Text as="div" mono size={10} color="var(--ft-dim)" mb={4}>TO</Text>
                    <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} style={{ width: "100%", padding: "9px", fontSize: 13, background: "var(--ft-base)", border: "1px solid var(--ft-border2)", borderRadius: 3, color: filterDateTo ? "var(--ft-text)" : "var(--ft-muted)", outline: "none", fontFamily: "var(--font-mono)", boxSizing: "border-box" as const }} />
                  </div>
                </div>
              </div>
              <div>
                <MonoLabel as="div" size={10} letterSpacing="0.10em" mb={8}>Amount Range</MonoLabel>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", marginBottom: 4 }}>MIN</div>
                    <input type="number" placeholder="0.00" value={amountMin} min="0" step="0.01" onChange={(e) => setAmountMin(e.target.value)} style={{ width: "100%", padding: "9px", fontSize: 13, background: "var(--ft-base)", border: "1px solid var(--ft-border2)", borderRadius: 3, color: amountMin ? "var(--ft-text)" : "var(--ft-muted)", outline: "none", fontFamily: "var(--font-mono)", boxSizing: "border-box" as const }} />
                  </div>
                  <div>
                    <Text as="div" mono size={10} color="var(--ft-dim)" mb={4}>MAX</Text>
                    <input type="number" placeholder="∞" value={amountMax} min="0" step="0.01" onChange={(e) => setAmountMax(e.target.value)} style={{ width: "100%", padding: "9px", fontSize: 13, background: "var(--ft-base)", border: "1px solid var(--ft-border2)", borderRadius: 3, color: amountMax ? "var(--ft-text)" : "var(--ft-muted)", outline: "none", fontFamily: "var(--font-mono)", boxSizing: "border-box" as const }} />
                  </div>
                </div>
              </div>
              <div>
                <MonoLabel as="div" size={10} letterSpacing="0.10em" mb={8}>Tag</MonoLabel>
                <input type="text" placeholder="Filter by tag…" value={filterTag} onChange={(e) => setFilterTag(e.target.value)} style={{ width: "100%", padding: "10px 12px", fontSize: 14, background: "var(--ft-base)", border: "1px solid var(--ft-border2)", borderRadius: 3, color: filterTag ? "var(--ft-amber)" : "var(--ft-muted)", outline: "none", fontFamily: "var(--font-mono)", boxSizing: "border-box" as const }} />
              </div>
            </VStack>
          </MobileSheet>
        </>
      )}

      {/* ── Desktop filter bar — compact single-row terminal style ── */}
      {!isMobile && (
      <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
        {/* Row A: search · type · category · account · sort · tag · clear */}
        <div className="ft-scroll-x" style={{ borderBottom: "1px solid var(--ft-border)" }}>
          <HStack align="stretch" minWidth="max-content">
          {/* SEARCH label */}
          <div style={{ display: "flex", alignItems: "center", padding: "0 10px", borderRight: "1px solid var(--ft-border)", background: "var(--ft-raised)", flexShrink: 0 }}>
            <MonoLabel as="span" size={9} letterSpacing="0.10em">SEARCH</MonoLabel>
          </div>
          <div style={{ position: "relative", flex: 1, minWidth: 160, display: "flex", alignItems: "center" }}>
            <Search className="absolute left-2.5 w-3 h-3" style={{ color: "var(--ft-dim)", pointerEvents: "none" }} />
            <input
              ref={searchInputRef}
              placeholder="description, category, account…  ( / )"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ft-filter-input"
              style={{ paddingLeft: 24, paddingRight: 8, fontSize: 11, height: 28, background: "transparent", border: "none", outline: "none", color: "var(--ft-text)", fontFamily: "var(--font-mono)", width: "100%" }}
            />
          </div>
          {/* TYPE */}
          <div style={{ display: "flex", alignItems: "center", padding: "0 8px", borderLeft: "1px solid var(--ft-border)", borderRight: "1px solid var(--ft-border)", background: "var(--ft-raised)", flexShrink: 0 }}>
            <MonoLabel as="span" size={9} letterSpacing="0.10em">TYPE</MonoLabel>
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as "all" | TxType)}
            style={{ height: 28, fontSize: 11, background: "transparent", border: "none", outline: "none", color: filterType !== "all" ? "var(--ft-text)" : "var(--ft-muted)", fontFamily: "var(--font-mono)", padding: "0 6px", cursor: "pointer", borderRight: "1px solid var(--ft-border)", minWidth: 80, flexShrink: 0 }}
          >
            <option value="all">all</option>
            <option value="income">income</option>
            <option value="expense">expense</option>
            <option value="transfer">transfer</option>
          </select>
          {/* CATEGORY */}
          <div style={{ display: "flex", alignItems: "center", padding: "0 8px", borderRight: "1px solid var(--ft-border)", background: "var(--ft-raised)", flexShrink: 0 }}>
            <MonoLabel as="span" size={9} letterSpacing="0.10em">CAT</MonoLabel>
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            style={{ height: 28, fontSize: 11, background: "transparent", border: "none", outline: "none", color: filterCategory !== "all" ? "var(--ft-text)" : "var(--ft-muted)", fontFamily: "var(--font-mono)", padding: "0 6px", cursor: "pointer", borderRight: "1px solid var(--ft-border)", minWidth: 100, flexShrink: 0 }}
          >
            <option value="all">all</option>
            {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {/* ACCOUNT */}
          <div style={{ display: "flex", alignItems: "center", padding: "0 8px", borderRight: "1px solid var(--ft-border)", background: "var(--ft-raised)", flexShrink: 0 }}>
            <MonoLabel as="span" size={9} letterSpacing="0.10em">ACCT</MonoLabel>
          </div>
          <select
            value={filterAccount}
            onChange={(e) => setFilterAccount(e.target.value)}
            style={{ height: 28, fontSize: 11, background: "transparent", border: "none", outline: "none", color: filterAccount !== "all" ? "var(--ft-text)" : "var(--ft-muted)", fontFamily: "var(--font-mono)", padding: "0 6px", cursor: "pointer", borderRight: "1px solid var(--ft-border)", minWidth: 100, flexShrink: 0 }}
          >
            <option value="all">all</option>
            {allAccounts.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {/* SORT */}
          <div style={{ display: "flex", alignItems: "center", padding: "0 8px", borderRight: "1px solid var(--ft-border)", background: "var(--ft-raised)", flexShrink: 0 }}>
            <MonoLabel as="span" size={9} letterSpacing="0.10em">SORT</MonoLabel>
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            style={{ height: 28, fontSize: 11, background: "transparent", border: "none", outline: "none", color: "var(--ft-muted)", fontFamily: "var(--font-mono)", padding: "0 6px", cursor: "pointer", borderRight: "1px solid var(--ft-border)", minWidth: 130, flexShrink: 0 }}
          >
            <option value="date-desc">date ↓</option>
            <option value="date-asc">date ↑</option>
            <option value="amount-high">amount ↓</option>
            <option value="amount-low">amount ↑</option>
          </select>
          {/* TAG */}
          <div style={{ display: "flex", alignItems: "center", padding: "0 8px", borderRight: "1px solid var(--ft-border)", background: "var(--ft-raised)", flexShrink: 0 }}>
            <MonoLabel as="span" size={9} letterSpacing="0.10em">TAG</MonoLabel>
          </div>
          <div style={{ position: "relative", display: "flex", alignItems: "center", flex: "0 0 90px" }}>
            <input
              type="text"
              placeholder="filter…"
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="ft-filter-input"
              style={{ height: 28, padding: "0 6px", fontSize: 11, background: "transparent", border: "none", outline: "none", color: filterTag ? "var(--ft-amber)" : "var(--ft-muted)", fontFamily: "var(--font-mono)", width: "100%" }}
            />
          </div>
          {/* Clear */}
          {hasFilters && (
            <button
              type="button"
              onClick={() => { setSearch(""); setFilterType("all"); setFilterCategory("all"); setFilterAccount("all"); setFilterDateFrom(""); setFilterDateTo(""); setAmountMin(""); setAmountMax(""); setSortBy("date-desc"); setFilterTag(""); }}
              style={{ height: 28, padding: "0 10px", fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.06em", background: "transparent", border: "none", borderLeft: "1px solid var(--ft-border)", color: "var(--ft-red)", cursor: "pointer", flexShrink: 0 }}
              aria-label="Clear all filters"
            >
              ✕ CLR
            </button>
          )}
          </HStack>
        </div>

        {/* Row B: quick date ranges · date from · date to · amount range */}
        <div className="ft-scroll-x">
          <div style={{ display: "flex", alignItems: "stretch", minWidth: "max-content" }}
        >
          {/* Quick ranges */}
          <div style={{ display: "flex", alignItems: "center", padding: "0 10px", borderRight: "1px solid var(--ft-border)", background: "var(--ft-raised)", flexShrink: 0 }}>
            <MonoLabel as="span" size={9} letterSpacing="0.10em">RANGE</MonoLabel>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 0, borderRight: "1px solid var(--ft-border)" }}>
            {(["Today", "Week", "Month", "Last Mo", "3M", "All"] as const).map((label, i) => {
              const keys = ["today", "week", "month", "lastmonth", "3m", "all"] as const;
              const k = keys[i];
              const isActive = activeQuickRange === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => applyQuickRange(k)}
                  style={{
                    height: 26,
                    padding: "0 8px",
                    fontSize: 9,
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.06em",
                    background: isActive ? "color-mix(in srgb, var(--ft-accent) 12%, transparent)" : "transparent",
                    border: "none",
                    borderRight: "1px solid var(--ft-border)",
                    color: isActive ? "var(--ft-accent)" : "var(--ft-dim)",
                    cursor: "pointer",
                    whiteSpace: "nowrap" as const,
                    textTransform: "uppercase" as const,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {/* DATE FROM label */}
          <div style={{ display: "flex", alignItems: "center", padding: "0 8px", borderRight: "1px solid var(--ft-border)", background: "var(--ft-raised)", flexShrink: 0 }}>
            <MonoLabel as="span" size={9} letterSpacing="0.10em">FROM</MonoLabel>
          </div>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            style={{ height: 26, padding: "0 6px", fontSize: 11, background: "transparent", border: "none", borderRight: "1px solid var(--ft-border)", outline: "none", color: filterDateFrom ? "var(--ft-text)" : "var(--ft-muted)", fontFamily: "var(--font-mono)", flexShrink: 0, width: 126 }}
          />
          {/* DATE TO label */}
          <div style={{ display: "flex", alignItems: "center", padding: "0 8px", borderRight: "1px solid var(--ft-border)", background: "var(--ft-raised)", flexShrink: 0 }}>
            <MonoLabel as="span" size={9} letterSpacing="0.10em">TO</MonoLabel>
          </div>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            style={{ height: 26, padding: "0 6px", fontSize: 11, background: "transparent", border: "none", borderRight: "1px solid var(--ft-border)", outline: "none", color: filterDateTo ? "var(--ft-text)" : "var(--ft-muted)", fontFamily: "var(--font-mono)", flexShrink: 0, width: 126 }}
          />
          {/* AMOUNT MIN */}
          <div style={{ display: "flex", alignItems: "center", padding: "0 8px", borderRight: "1px solid var(--ft-border)", background: "var(--ft-raised)", flexShrink: 0 }}>
            <MonoLabel as="span" size={9} letterSpacing="0.10em">£ MIN</MonoLabel>
          </div>
          <input
            type="number"
            placeholder="0.00"
            value={amountMin}
            min="0"
            step="0.01"
            onChange={(e) => setAmountMin(e.target.value)}
            style={{ height: 26, padding: "0 6px", fontSize: 11, background: "transparent", border: "none", borderRight: "1px solid var(--ft-border)", outline: "none", color: amountMin ? "var(--ft-text)" : "var(--ft-muted)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", width: 72, flexShrink: 0 }}
          />
          {/* AMOUNT MAX */}
          <div style={{ display: "flex", alignItems: "center", padding: "0 8px", borderRight: "1px solid var(--ft-border)", background: "var(--ft-raised)", flexShrink: 0 }}>
            <MonoLabel as="span" size={9} letterSpacing="0.10em">£ MAX</MonoLabel>
          </div>
          <input
            type="number"
            placeholder="∞"
            value={amountMax}
            min="0"
            step="0.01"
            onChange={(e) => setAmountMax(e.target.value)}
            style={{ height: 26, padding: "0 6px", fontSize: 11, background: "transparent", border: "none", outline: "none", color: amountMax ? "var(--ft-text)" : "var(--ft-muted)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", width: 72, flexShrink: 0 }}
          />
          </div>
        </div>
      </div>
      )}

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
            flexWrap: "wrap",
            gap: 8,
            padding: "10px 14px",
            background: "var(--ft-base)",
            border: "1px solid var(--ft-blue)",
            borderRadius: 2,
            fontFamily: "var(--font-mono)",
            maxWidth: "calc(100vw - 32px)",
            overflowX: "auto",
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

      {/* ── Transaction ledger ��─ */}
      <div style={{ border: "1px solid var(--ft-border)" }}>
        {/* Panel header — Bloomberg · SECTION NAME pattern */}
        <div className="ft-panel-header">
          <HStack gap={8} align="center">
            <span className="ft-panel-label">
              <span className="accent-dot">·</span>
              TRANSACTION LEDGER
            </span>
            <Text as="span" mono size={10} color="var(--ft-dim)">
              {hasFilters ? `${filtered.length} of ${transactions?.length ?? 0}` : `${filtered.length} entries`}
            </Text>
            {groupByMerchant && (
              <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-muted)", letterSpacing: "0.06em", border: "1px solid var(--ft-border2)", padding: "0 5px", borderRadius: 2, lineHeight: "18px" }}>BY MERCHANT</span>
            )}
            {groupByDay && !groupByMerchant && (
              <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-muted)", letterSpacing: "0.06em", border: "1px solid var(--ft-border2)", padding: "0 5px", borderRadius: 2, lineHeight: "18px" }}>BY DAY</span>
            )}
          </HStack>
          {!isMobile && <HStack gap={4}>
            <button
              type="button"
              onClick={() => { setGroupByDay((v) => !v); if (groupByMerchant) setGroupByMerchant(false); }}
              style={{
                height: 22,
                padding: "0 8px",
                fontSize: 9,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.06em",
                background: groupByDay ? "color-mix(in srgb, var(--ft-blue) 10%, transparent)" : "transparent",
                border: `1px solid ${groupByDay ? "var(--ft-blue)" : "var(--ft-border2)"}`,
                borderRadius: 2,
                color: groupByDay ? "var(--ft-blue)" : "var(--ft-dim)",
                cursor: "pointer",
                whiteSpace: "nowrap" as const,
              }}
            >
              {groupByDay ? "▣ DAY" : "□ DAY"}
            </button>
            <button
              type="button"
              onClick={() => { setGroupByMerchant((v) => !v); setExpandedMerchants(new Set()); if (groupByDay) setGroupByDay(false); }}
              style={{
                height: 22,
                padding: "0 8px",
                fontSize: 9,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.06em",
                background: groupByMerchant ? "color-mix(in srgb, var(--ft-blue) 10%, transparent)" : "transparent",
                border: `1px solid ${groupByMerchant ? "var(--ft-blue)" : "var(--ft-border2)"}`,
                borderRadius: 2,
                color: groupByMerchant ? "var(--ft-blue)" : "var(--ft-dim)",
                cursor: "pointer",
                whiteSpace: "nowrap" as const,
              }}
            >
              {groupByMerchant ? "▣ MERCHANT" : "□ MERCHANT"}
            </button>
            <button
              type="button"
              onClick={() => exportJson(filtered)}
              style={{ height: 22, padding: "0 8px", fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.06em", background: "transparent", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-dim)", cursor: "pointer", whiteSpace: "nowrap" as const }}
            >
              ↓ JSON
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              style={{ height: 22, padding: "0 8px", fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.06em", background: "transparent", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-dim)", cursor: "pointer", whiteSpace: "nowrap" as const }}
            >
              PDF
            </button>
          </HStack>}
        </div>

        <div
          className={isMobile ? undefined : "ft-scroll-x"}
          ref={tableContainerRef}
          tabIndex={0}
          onKeyDown={handleTableKeyDown}
          style={{ outline: "none" }}
          aria-label="Transaction table — use ↑↓ or j/k to navigate, Enter to open note, Escape to clear"
        >
          {/* Column headers — desktop only */}
          {!isMobile && <div style={{ display: "flex", background: "var(--ft-raised)", borderBottom: "1px solid var(--ft-border2)", minWidth: 760 }}>
            <div style={{ ...TH, width: 36, minWidth: 36, justifyContent: "center", padding: "0", borderRight: "1px solid var(--ft-border)" }}>
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={toggleSelectAll}
                style={{ cursor: "pointer", accentColor: "var(--ft-blue)" }}
                aria-label="Select all"
              />
            </div>
            {([
              ["DATE",        "90px",  "left",    ""],
              ["DESCRIPTION", "1",     "left",    ""],
              ["CATEGORY",    "120px", "left",    ""],
              ["ACCOUNT",     "150px", "left",    "ft-hide-mobile"],
              ["TYPE",        "90px",  "left",    "ft-hide-mobile"],
              ["AMOUNT",      "130px", "right",   ""],
              ["GBP",         "110px", "right",   ""],
              ["",            "36px",  "center",  ""],
              ["",            "36px",  "center",  ""],
              ["",            "128px", "right",   ""],
            ] as [string, string, string, string][]).map(([h, w, align, extraClass], i) => (
              <div
                key={`${h}-${i}`}
                className={extraClass || undefined}
                style={{
                  ...TH,
                  flex: w === "1" ? 1 : undefined,
                  width: w !== "1" ? w : undefined,
                  minWidth: w === "1" ? 0 : w,
                  flexShrink: w === "1" ? undefined : 0,
                  overflow: w === "1" ? "hidden" : undefined,
                  justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start",
                  padding: h === "" ? "0 3px" : "0 12px",
                }}
              >
                {h}
              </div>
            ))}
          </div>}

          {/* Rows — flat, grouped by day, or grouped by merchant */}
          {!groupByMerchant && !groupByDay && (
            <>
              {visibleFiltered.map((tx, idx) => <TxRow key={tx.id} tx={tx} isKeyboardSelected={selectedRowIndex === idx} />)}
              {filtered.length === 0 && (
                hasFilters
                  ? <EmptyState title="No matches" description="No transactions match the current filters." minHeight="calc(100vh - 260px)" />
                  : <TxFeedPreview openAdd={openAdd} />
              )}
              {hasMoreFlat && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 0", borderBottom: "1px solid var(--ft-border)" }}>
                  <button
                    type="button"
                    onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                    style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-accent)", background: "none", border: "1px solid var(--ft-border2)", padding: "3px 14px", cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase" as const, borderRadius: 2 }}
                  >
                    LOAD MORE · {visibleCount} of {filtered.length}
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
                    {(() => {
                      const gd = new Date(group.date + "T00:00:00");
                      const nowD = new Date(); nowD.setHours(0,0,0,0);
                      const yesD = new Date(nowD); yesD.setDate(nowD.getDate() - 1);
                      const isToday = gd.toDateString() === nowD.toDateString();
                      const isYesterday = gd.toDateString() === yesD.toDateString();
                      const mobileLabel = isToday ? "Today" : isYesterday ? "Yesterday" : gd.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
                      const desktopLabel = gd.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).toUpperCase();
                      return (
                        <div style={{ display: "flex", alignItems: "center", background: isMobile ? "color-mix(in srgb, var(--ft-raised) 80%, var(--ft-base))" : "var(--ft-base)", borderBottom: "1px solid var(--ft-border)", padding: isMobile ? "6px 14px" : "4px 10px 4px 48px", gap: 10, position: "sticky", top: 0, zIndex: 10 }}>
                          <Text as="span" mono size={isMobile ? 12 : 9} weight={700} color={isMobile && (isToday || isYesterday) ? "var(--ft-accent)" : "var(--ft-dim)"} letterSpacing={isMobile ? "0.02em" : "0.1em"}>
                            {isMobile ? mobileLabel : desktopLabel}
                          </Text>
                          <Text as="span" mono size={isMobile ? 11 : 9} color="var(--ft-dim)" letterSpacing="0.06em">{group.txs.length} tx</Text>
                          <span className="pnum" style={{ fontSize: isMobile ? 12 : 9, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", color: group.net >= 0 ? "var(--ft-green)" : "var(--ft-red)", marginLeft: "auto", letterSpacing: "0.04em" }}>
                            {group.net >= 0 ? "+" : "−"}{formatGbp(Math.abs(group.net))}
                          </span>
                        </div>
                      );
                    })()}

                    {group.txs.map((tx) => {
                      const rowIdx = flatIdx++;
                      return <TxRow key={tx.id} tx={tx} indented isKeyboardSelected={selectedRowIndex === rowIdx} />;
                    })}
                  </div>
                ));
              })()}
              {dayGroups.length === 0 && (
                hasFilters
                  ? <EmptyState title="No matches" description="No transactions match the current filters." minHeight="calc(100vh - 260px)" />
                  : <TxFeedPreview openAdd={openAdd} />
              )}
              {hasMoreDayGroups && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 0", borderBottom: "1px solid var(--ft-border)" }}>
                  <button
                    type="button"
                    onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                    style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-accent)", background: "none", border: "1px solid var(--ft-border2)", padding: "3px 14px", cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase" as const, borderRadius: 2 }}
                  >
                    LOAD MORE · {Math.min(visibleCount, filtered.length)} of {filtered.length}
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
                      className="flex items-center"
                      style={{ borderBottom: "1px solid var(--ft-border)", background: "var(--ft-raised)", cursor: "pointer" }}
                      onClick={() => {
                        setExpandedMerchants((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.description)) next.delete(group.description);
                          else next.add(group.description);
                          return next;
                        });
                      }}
                    >
                      <div style={{ width: 36, minWidth: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid var(--ft-border)", alignSelf: "stretch", color: "var(--ft-accent)", fontSize: 9, fontFamily: "var(--font-mono)" }}>
                        {group.expanded ? "▼" : "▶"}
                      </div>
                      <div style={{ width: 90, minWidth: 90, padding: "var(--ft-cell-py) 12px", borderRight: "1px solid var(--ft-border)", color: "var(--ft-dim)", fontSize: 10, fontFamily: "var(--font-mono)" }} />
                      <div style={{ flex: 1, padding: "var(--ft-cell-py) 12px", borderRight: "1px solid var(--ft-border)", color: "var(--ft-text)", fontSize: 11, fontWeight: 600, fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <PrivDesc>{group.description}</PrivDesc>
                      </div>
                      <div style={{ width: 120, minWidth: 120, padding: "var(--ft-cell-py) 12px", borderRight: "1px solid var(--ft-border)" }}>
                        <span style={{ fontSize: 9, padding: "0 5px", borderRadius: 2, border: "1px solid var(--ft-border2)", color: "var(--ft-muted)", fontFamily: "var(--font-mono)", lineHeight: "16px" }}>
                          {group.count} tx
                        </span>
                      </div>
                      <div className="ft-hide-mobile" style={{ width: 150, minWidth: 150, padding: "var(--ft-cell-py) 12px", borderRight: "1px solid var(--ft-border)" }} />
                      <div className="ft-hide-mobile" style={{ width: 90, minWidth: 90, padding: "var(--ft-cell-py) 12px", borderRight: "1px solid var(--ft-border)" }} />
                      <div style={{ width: 130, minWidth: 130, padding: "var(--ft-cell-py) 12px", borderRight: "1px solid var(--ft-border)" }} />
                      <div className="pnum" style={{ width: 110, minWidth: 110, padding: "var(--ft-cell-py) 12px", borderRight: "1px solid var(--ft-border)", textAlign: "right", color: group.total >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                        {group.total >= 0 ? "+" : "−"}{formatGbp(Math.abs(group.total))}
                      </div>
                      <div style={{ width: 36, minWidth: 36, borderRight: "1px solid var(--ft-border)" }} />
                      <div style={{ width: 36, minWidth: 36, borderRight: "1px solid var(--ft-border)" }} />
                      <div style={{ width: 128, minWidth: 128 }} />
                    </div>

                    {group.expanded && groupTxs.map((tx) => <TxRow key={tx.id} tx={tx} indented />)}
                  </div>
                );
              })}

              {merchantGroups.length === 0 && (
                hasFilters
                  ? <EmptyState title="No matches" description="No transactions match the current filters." minHeight="calc(100vh - 260px)" />
                  : <TxFeedPreview openAdd={openAdd} />
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Mobile FAB — add transaction ── */}
      {isMobile && (
        <button
          type="button"
          onClick={openAdd}
          aria-label="Add transaction"
          style={{
            position: "fixed",
            bottom: "calc(68px + env(safe-area-inset-bottom))",
            right: 20,
            zIndex: 50,
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "var(--ft-accent)",
            border: "none",
            color: "var(--ft-base)",
            fontSize: 26,
            fontWeight: 300,
            lineHeight: 1,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 16px color-mix(in srgb, var(--ft-accent) 40%, transparent)",
          }}
        >
          +
        </button>
      )}

      {/* ── localStorage SplitModal ── */}
      {splitModalTx && (
        <SplitModal
          tx={splitModalTx}
          onClose={() => {
            setSplits(loadSplits());
            setSplitModalTx(null);
          }}
        />
      )}
    </VStack>
  );
}
