import { useState, useMemo, useCallback, useEffect } from "react";
import { Skeleton as FtSkeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import {
  useListTransactions,
  useGetDashboard,
  useListBudgets,
  useCreateBudget,
  useUpdateBudget,
  useDeleteBudget,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListBudgetsQueryKey } from "@workspace/api-client-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { formatGbp } from "@/lib/utils";
import type { Transaction } from "@workspace/api-client-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Budget {
  id: number;
  category: string;
  limit: number;
}

interface CopyCandidate {
  category: string;
  total: number;
  confirmed: boolean;
}

// ── Rollover types ───────────────────────────────────────────────────────────

interface RolloverEntry {
  enabled: boolean;
  accumulated: number;
}

type RolloverMap = Record<string, RolloverEntry>;

const ROLLOVER_KEY = "ft-budget-rollover";
const ROLLOVER_MONTH_KEY = "ft-budget-rollover-month";

function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function loadRolloverMap(): RolloverMap {
  try {
    const raw = localStorage.getItem(ROLLOVER_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as RolloverMap;
  } catch {
    return {};
  }
}

function saveRolloverMap(map: RolloverMap): void {
  localStorage.setItem(ROLLOVER_KEY, JSON.stringify(map));
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getFirstOfMonth(year: number, month: number): string {
  return toDateStr(year, month, 1);
}

function getLastOfMonth(year: number, month: number): string {
  const lastDay = new Date(year, month, 0).getDate();
  return toDateStr(year, month, lastDay);
}

// ── Bar colour helper ─────────────────────────────────────────────────────────

function barColor(pct: number): string {
  if (pct >= 1) return "var(--ft-red)";
  if (pct >= 0.9) return "var(--ft-red)";
  if (pct >= 0.7) return "var(--ft-amber)";
  return "var(--ft-green)";
}

function progressBg(pct: number): string {
  if (pct >= 0.9) return "var(--ft-red)";
  if (pct >= 0.7) return "var(--ft-amber)";
  return "var(--ft-green)";
}

// ── Shared style constants ────────────────────────────────────────────────────

const INPUT_STYLE: React.CSSProperties = {
  background: "var(--ft-base)",
  border: "1px solid var(--ft-border2)",
  color: "var(--ft-text)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  height: 28,
  padding: "0 8px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const BTN_ACCENT: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  background: "var(--ft-accent)",
  color: "var(--ft-base)",
  border: "none",
  padding: "6px 16px",
  cursor: "pointer",
};

const BTN_GHOST: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  background: "transparent",
  color: "var(--ft-muted)",
  border: "1px solid var(--ft-border2)",
  padding: "6px 12px",
  cursor: "pointer",
};

// ── Custom recharts tooltip ───────────────────────────────────────────────────

function BudgetTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; fill: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        background: "var(--ft-raised)",
        border: "1px solid var(--ft-border2)",
        padding: "8px 12px",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
      }}
    >
      <div
        style={{
          color: "var(--ft-accent)",
          fontWeight: 700,
          marginBottom: 4,
          textTransform: "uppercase" as const,
          letterSpacing: "0.05em",
          fontSize: 9,
        }}
      >
        {label}
      </div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.fill, marginBottom: 2 }}>
          {p.name}: {formatGbp(p.value)}
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Budget() {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  // budgets from API
  const { data: rawBudgets = [], isLoading: budgetsLoading, isError: budgetsError, error: budgetsErrorObj } = useListBudgets();
  const budgets: Budget[] = rawBudgets.map(b => ({ id: b.id, category: b.category, limit: b.monthlyLimit }));
  const createBudget = useCreateBudget();
  const updateBudget = useUpdateBudget();
  const deleteBudget = useDeleteBudget();
  const queryClient = useQueryClient();

  // add/edit form
  const [formCategory, setFormCategory] = useState("");
  const [formLimit, setFormLimit] = useState("");
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingLimit, setEditingLimit] = useState("");

  // zero-based budgeting toggle
  const [zbEnabled, setZbEnabled] = useState(false);

  // copy-last-month panel
  const [showCopyPanel, setShowCopyPanel] = useState(false);
  const [copyCandidates, setCopyCandidates] = useState<CopyCandidate[]>([]);

  // ── Rollover state ───────────────────────────────────────────────────────────

  const [rolloverMap, setRolloverMapState] = useState<RolloverMap>(() => loadRolloverMap());

  // Persist rollover map whenever it changes
  const setRolloverMap = useCallback((updater: (prev: RolloverMap) => RolloverMap) => {
    setRolloverMapState(prev => {
      const next = updater(prev);
      saveRolloverMap(next);
      return next;
    });
  }, []);

  // ── Date strings for API calls ──────────────────────────────────────────────

  const dateFrom = useMemo(
    () => getFirstOfMonth(selectedYear, selectedMonth),
    [selectedYear, selectedMonth]
  );

  const lastMonthYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
  const lastMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
  const lastMonthFrom = useMemo(
    () => getFirstOfMonth(lastMonthYear, lastMonth),
    [lastMonthYear, lastMonth]
  );
  const lastMonthTo = useMemo(
    () => getLastOfMonth(lastMonthYear, lastMonth),
    [lastMonthYear, lastMonth]
  );

  // ── Hooks ───────────────────────────────────────────────────────────────────

  const { data: expenseTxs } = useListTransactions({
    type: "expense",
    dateFrom,
  });

  const { data: lastMonthTxs } = useListTransactions({
    type: "expense",
    dateFrom: lastMonthFrom,
  });

  const { data: allTxs } = useListTransactions({});

  const { data: dashboard } = useGetDashboard();

  // ── Month-rollover accumulation logic ────────────────────────────────────────
  // Runs once on mount (and whenever budgets/spentByCategory loads) to check
  // if we've crossed into a new calendar month and need to accumulate unused budget.

  const spentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    if (!expenseTxs) return map;
    expenseTxs.forEach((tx: Transaction) => {
      const key = tx.category.toLowerCase();
      map[key] = (map[key] ?? 0) + tx.gbpValue;
    });
    return map;
  }, [expenseTxs]);

  // Accumulate rollover when month changes — use a separate query for last month's spend
  const lastMonthSpentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    if (!lastMonthTxs) return map;
    lastMonthTxs.forEach((tx: Transaction) => {
      const key = tx.category.toLowerCase();
      map[key] = (map[key] ?? 0) + tx.gbpValue;
    });
    return map;
  }, [lastMonthTxs]);

  useEffect(() => {
    // Only run accumulation logic when we're viewing the current month
    const isCurrentMonthView =
      selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1;
    if (!isCurrentMonthView) return;
    if (budgets.length === 0) return;

    const thisMonth = currentMonthStr();
    const storedMonth = localStorage.getItem(ROLLOVER_MONTH_KEY);

    if (storedMonth === thisMonth) return; // already processed this month

    // We've entered a new month: accumulate unused budget for enabled categories
    setRolloverMap(prev => {
      const next = { ...prev };
      for (const budget of budgets) {
        const entry = next[budget.category];
        if (!entry?.enabled) continue;
        const spent = lastMonthSpentByCategory[budget.category.toLowerCase()] ?? 0;
        const unused = Math.max(budget.limit - spent, 0);
        next[budget.category] = {
          ...entry,
          accumulated: (entry.accumulated ?? 0) + unused,
        };
      }
      return next;
    });

    localStorage.setItem(ROLLOVER_MONTH_KEY, thisMonth);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgets.length, selectedYear, selectedMonth]);

  // ── Rollover helpers ─────────────────────────────────────────────────────────

  function toggleRollover(category: string) {
    setRolloverMap(prev => {
      const entry = prev[category];
      return {
        ...prev,
        [category]: {
          enabled: !entry?.enabled,
          accumulated: entry?.accumulated ?? 0,
        },
      };
    });
  }

  function resetRollover(category: string) {
    setRolloverMap(prev => ({
      ...prev,
      [category]: {
        enabled: prev[category]?.enabled ?? false,
        accumulated: 0,
      },
    }));
  }

  // ── Derive category suggestions from all transactions ───────────────────────

  const categorySuggestions = useMemo(() => {
    if (!allTxs) return [];
    const cats = new Set<string>();
    allTxs.forEach((tx: Transaction) => {
      if (tx.type === "expense") cats.add(tx.category);
    });
    return Array.from(cats).sort();
  }, [allTxs]);

  // ── Total spent (all expense transactions in selected month) ─────────────────

  const totalSpent = useMemo(
    () => expenseTxs?.reduce((s: number, tx: Transaction) => s + tx.gbpValue, 0) ?? 0,
    [expenseTxs]
  );

  // ── Summary row values ───────────────────────────────────────────────────────

  const totalBudgeted = useMemo(
    () => budgets.reduce((s, b) => {
      const entry = rolloverMap[b.category];
      const effective = b.limit + (entry?.enabled ? (entry.accumulated ?? 0) : 0);
      return s + effective;
    }, 0),
    [budgets, rolloverMap]
  );

  const overBudgetCount = useMemo(
    () =>
      budgets.filter((b) => {
        const spent = spentByCategory[b.category.toLowerCase()] ?? 0;
        const entry = rolloverMap[b.category];
        const effective = b.limit + (entry?.enabled ? (entry.accumulated ?? 0) : 0);
        return spent >= effective;
      }).length,
    [budgets, spentByCategory, rolloverMap]
  );

  const overallPct = totalBudgeted > 0 ? totalSpent / totalBudgeted : 0;

  // ── Monthly income (for zero-based) ─────────────────────────────────────────

  const monthlyIncome = dashboard?.thisMonth?.income ?? 0;
  const zbRemaining = monthlyIncome - totalBudgeted;

  // ── Sort budgets by % used descending (for chart + list) ────────────────────

  const sortedBudgets = useMemo(
    () =>
      [...budgets].sort((a, b) => {
        const entryA = rolloverMap[a.category];
        const effectiveA = a.limit + (entryA?.enabled ? (entryA.accumulated ?? 0) : 0);
        const pA = (spentByCategory[a.category.toLowerCase()] ?? 0) / (effectiveA || 1);

        const entryB = rolloverMap[b.category];
        const effectiveB = b.limit + (entryB?.enabled ? (entryB.accumulated ?? 0) : 0);
        const pB = (spentByCategory[b.category.toLowerCase()] ?? 0) / (effectiveB || 1);

        return pB - pA;
      }),
    [budgets, spentByCategory, rolloverMap]
  );

  // ── Chart data ───────────────────────────────────────────────────────────────

  const chartData = useMemo(
    () =>
      sortedBudgets.map((b) => {
        const spent = spentByCategory[b.category.toLowerCase()] ?? 0;
        const entry = rolloverMap[b.category];
        const effective = b.limit + (entry?.enabled ? (entry.accumulated ?? 0) : 0);
        return { category: b.category, Budget: effective, Actual: spent };
      }),
    [sortedBudgets, spentByCategory, rolloverMap]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleAddBudget() {
    const trimmed = formCategory.trim();
    const limit = parseFloat(formLimit);
    if (!trimmed || isNaN(limit) || limit <= 0) return;
    if (budgets.some((b) => b.category.toLowerCase() === trimmed.toLowerCase())) return;
    await createBudget.mutateAsync({ data: { category: trimmed, monthlyLimit: limit } });
    queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
    setFormCategory("");
    setFormLimit("");
  }

  async function handleDeleteBudget(id: number) {
    await deleteBudget.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
  }

  function startEdit(category: string, currentLimit: number) {
    setEditingCategory(category);
    setEditingLimit(String(currentLimit));
  }

  async function commitEdit(category: string) {
    const newLimit = parseFloat(editingLimit);
    const budget = budgets.find(b => b.category === category);
    if (!isNaN(newLimit) && newLimit > 0 && budget) {
      await updateBudget.mutateAsync({ id: budget.id, data: { monthlyLimit: newLimit } });
      queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
    }
    setEditingCategory(null);
    setEditingLimit("");
  }

  // ── Copy last month ───────────────────────────────────────────────────────────

  const buildCopyCandidates = useCallback(() => {
    if (!lastMonthTxs) return;
    const map: Record<string, number> = {};
    lastMonthTxs.forEach((tx: Transaction) => {
      if (!tx.date.startsWith(`${lastMonthYear}-${String(lastMonth).padStart(2, "0")}`)) return;
      const key = tx.category;
      map[key] = (map[key] ?? 0) + tx.gbpValue;
    });
    const candidates: CopyCandidate[] = Object.entries(map)
      .filter(([, total]) => total > 0)
      .map(([category, total]) => ({ category, total, confirmed: true }));
    setCopyCandidates(candidates);
    setShowCopyPanel(true);
  }, [lastMonthTxs, lastMonthYear, lastMonth]);

  async function applyLastMonthActuals() {
    const toAdd = copyCandidates.filter((c) => c.confirmed);
    for (const c of toAdd) {
      const existing = budgets.find(b => b.category.toLowerCase() === c.category.toLowerCase());
      const limit = Math.ceil(c.total);
      if (existing) {
        await updateBudget.mutateAsync({ id: existing.id, data: { monthlyLimit: limit } });
      } else {
        await createBudget.mutateAsync({ data: { category: c.category, monthlyLimit: limit } });
      }
    }
    queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
    setShowCopyPanel(false);
    setCopyCandidates([]);
  }

  // ── Month navigation ─────────────────────────────────────────────────────────

  const MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  function prevMonth() {
    if (selectedMonth === 1) {
      setSelectedYear((y) => y - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (selectedMonth === 12) {
      setSelectedYear((y) => y + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  }

  const isCurrentMonth =
    selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1;

  // ─────────────────────────────────────────────────────────────────────────────
  // Loading / Error guards
  // ─────────────────────────────────────────────────────────────────────────────

  if (budgetsLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header skeleton */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <FtSkeleton width={160} height={14} />
          <FtSkeleton width={220} height={28} />
        </div>
        {/* Summary tiles skeleton */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderTop: "2px solid var(--ft-border2)", padding: "12px 14px" }}>
              <FtSkeleton width="60%" height={9} />
              <div style={{ marginTop: 8 }}><FtSkeleton width="80%" height={20} /></div>
              <div style={{ marginTop: 6 }}><FtSkeleton width="50%" height={9} /></div>
            </div>
          ))}
        </div>
        {/* Budget rows skeleton */}
        <div style={{ border: "1px solid var(--ft-border)", display: "flex", flexDirection: "column", gap: 1, background: "var(--ft-border)" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 140px 180px 90px 80px 120px 80px", padding: "10px 14px", gap: 8, background: "var(--ft-surface)", alignItems: "center", borderLeft: "3px solid var(--ft-border)" }}>
              <FtSkeleton width="70%" height={12} />
              <FtSkeleton width={70} height={12} />
              <FtSkeleton width={90} height={12} />
              <FtSkeleton width="90%" height={6} />
              <FtSkeleton width={40} height={11} />
              <FtSkeleton width={60} height={11} />
              <FtSkeleton width={80} height={11} />
              <FtSkeleton width={20} height={14} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (budgetsError) {
    return (
      <ErrorState message={(budgetsErrorObj as Error)?.message ?? "Could not load budget data. Check your connection and try again."} />
    );
  }

  // ── First-time / empty state ──────────────────────────────────────────────────
  if (sortedBudgets.length === 0 && !showCopyPanel) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 2 }}>
            <span style={{ color: "var(--ft-accent)" }}>·</span> Budget Manager
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>Set monthly limits · track spending · allocate every pound</div>
        </div>
        <div style={{ border: "1px dashed var(--ft-border)", background: "var(--ft-surface)", padding: "52px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ft-border2)", lineHeight: 1.55, userSelect: "none", marginBottom: 20, whiteSpace: "pre", textAlign: "left" }}>
            {"┌─────────────────────────┐\n│  CATEGORY    LIMIT  PCT │\n│  ─────────────────────  │\n│  Groceries   £400   ███ │\n│  Transport   £150   ██░ │\n│  Eating Out  £200   █░░ │\n│                         │\n│  0 of 3 over budget     │\n└─────────────────────────┘"}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-text)", marginBottom: 6, textAlign: "center" }}>Set your first budget</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", textAlign: "center", marginBottom: 28, maxWidth: 380 }}>Define monthly spending limits by category. The app tracks your actual spending and shows progress in real time.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", width: "100%", maxWidth: 480 }}>
            <input
              list="budget-category-suggestions"
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddBudget()}
              placeholder="Category (e.g. Groceries)"
              style={{ ...INPUT_STYLE, flex: 2, minWidth: 180 }}
            />
            <datalist id="budget-category-suggestions">
              {categorySuggestions.map(c => <option key={c} value={c} />)}
            </datalist>
            <input
              type="number" min={1} placeholder="Monthly limit"
              value={formLimit}
              onChange={(e) => setFormLimit(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddBudget()}
              style={{ ...INPUT_STYLE, width: 150 }}
            />
            <button onClick={handleAddBudget} style={BTN_ACCENT}>+ Add Budget</button>
          </div>
          <div style={{ marginTop: 20, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", textAlign: "center" }}>
            Already tracking spending?{" "}
            <span
              style={{ color: "var(--ft-accent)", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
              onClick={buildCopyCandidates}
            >
              Import last month's categories →
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Page header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ft-dim)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 2,
            }}
          >
            <span style={{ color: "var(--ft-accent)" }}>·</span> Budget Manager
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--ft-dim)",
            }}
          >
            Set monthly limits · track spending · allocate every pound
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Month selector */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 0,
              border: "1px solid var(--ft-border2)",
              background: "var(--ft-raised)",
            }}
          >
            <button
              onClick={prevMonth}
              style={{
                background: "none",
                border: "none",
                color: "var(--ft-muted)",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                padding: "4px 8px",
                lineHeight: 1,
              }}
            >
              ‹
            </button>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: isCurrentMonth ? "var(--ft-accent)" : "var(--ft-text)",
                padding: "4px 10px",
                minWidth: 80,
                textAlign: "center",
                letterSpacing: "0.04em",
              }}
            >
              {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
            </span>
            <button
              onClick={nextMonth}
              style={{
                background: "none",
                border: "none",
                color: "var(--ft-muted)",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                padding: "4px 8px",
                lineHeight: 1,
              }}
            >
              ›
            </button>
          </div>

          {/* Zero-based toggle */}
          <button
            onClick={() => setZbEnabled((v) => !v)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.05em",
              textTransform: "uppercase" as const,
              padding: "5px 12px",
              border: `1px solid ${zbEnabled ? "var(--ft-cyan)" : "var(--ft-border2)"}`,
              background: zbEnabled ? "rgba(86,182,194,0.1)" : "transparent",
              color: zbEnabled ? "var(--ft-cyan)" : "var(--ft-dim)",
              cursor: "pointer",
            }}
          >
            {zbEnabled ? "ZBB On" : "ZBB"}
          </button>
        </div>
      </div>

      {/* ── Summary strip ── */}
      <div
        className="ft-four-col"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
        }}
      >
        {[
          {
            label: "Total Budgeted",
            value: formatGbp(totalBudgeted),
            color: "var(--ft-accent)",
            sub: `${budgets.length} categories`,
          },
          {
            label: "Total Spent",
            value: formatGbp(totalSpent),
            color:
              totalSpent > totalBudgeted ? "var(--ft-red)" : "var(--ft-green)",
            sub: `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`,
          },
          {
            label: "Utilisation",
            value: `${Math.round(overallPct * 100)}%`,
            color:
              overallPct >= 1
                ? "var(--ft-red)"
                : overallPct >= 0.9
                ? "var(--ft-amber)"
                : "var(--ft-green)",
            sub: "overall",
          },
          {
            label: "Over Budget",
            value: String(overBudgetCount),
            color:
              overBudgetCount > 0 ? "var(--ft-red)" : "var(--ft-green)",
            sub: "categories",
            badge: overBudgetCount > 0,
          },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border)",
              borderTop: `2px solid ${item.color}`,
              padding: "12px 14px",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--ft-dim)",
                letterSpacing: "0.08em",
                textTransform: "uppercase" as const,
                marginBottom: 6,
              }}
            >
              {item.label}
            </div>
            <div
              className={item.value.includes("£") ? "pnum" : undefined}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 20,
                fontWeight: 700,
                color: item.color,
                lineHeight: 1,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {item.value}
              {"badge" in item && item.badge && overBudgetCount > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "var(--ft-red)",
                    color: "#fff",
                    fontSize: 9,
                    fontWeight: 700,
                  }}
                >
                  {overBudgetCount}
                </span>
              )}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--ft-dim)",
                marginTop: 4,
              }}
            >
              {item.sub}
            </div>
          </div>
        ))}
      </div>

      {/* ── Zero-based budgeting panel ── */}
      {zbEnabled && (
        <div
          style={{
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-border)",
            borderLeft: "3px solid var(--ft-cyan)",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 20,
            fontFamily: "var(--font-mono)",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 9,
              color: "var(--ft-cyan)",
              textTransform: "uppercase" as const,
              letterSpacing: "0.08em",
              fontWeight: 700,
            }}
          >
            Zero-Based Budget
          </span>
          <span style={{ fontSize: 11, color: "var(--ft-text)" }}>
            Monthly Income:{" "}
            <strong className="pnum" style={{ color: "var(--ft-green)" }}>
              {formatGbp(monthlyIncome)}
            </strong>
          </span>
          <span style={{ fontSize: 11, color: "var(--ft-text)" }}>
            Budgeted:{" "}
            <strong className="pnum" style={{ color: "var(--ft-accent)" }}>
              {formatGbp(totalBudgeted)}
            </strong>
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: zbRemaining < 0 ? "var(--ft-red)" : "var(--ft-green)",
            }}
          >
            <span className="pnum">
              {zbRemaining < 0
                ? `Over-allocated by ${formatGbp(Math.abs(zbRemaining))}`
                : zbRemaining === 0
                ? "Every £ allocated!"
                : `${formatGbp(zbRemaining)} remaining to allocate`}
            </span>
          </span>
          {zbRemaining > 0 && (
            <div
              style={{
                height: 4,
                flex: 1,
                minWidth: 120,
                background: "var(--ft-border)",
                borderRadius: 2,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.min((totalBudgeted / Math.max(monthlyIncome, 1)) * 100, 100)}%`,
                  background: "var(--ft-cyan)",
                  borderRadius: 2,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Add budget form ── */}
      <div
        style={{
          background: "var(--ft-surface)",
          border: "1px solid var(--ft-border)",
          padding: "14px 16px",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--ft-accent)",
            letterSpacing: "0.08em",
            textTransform: "uppercase" as const,
            marginBottom: 10,
          }}
        >
          Add Budget Category
        </div>
        <div
          style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}
        >
          <div style={{ flex: 2, minWidth: 180 }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                color: "var(--ft-dim)",
                textTransform: "uppercase" as const,
                letterSpacing: "0.06em",
                marginBottom: 4,
              }}
            >
              Category
            </div>
            <input
              list="category-suggestions"
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddBudget()}
              placeholder="e.g. Groceries"
              style={INPUT_STYLE}
            />
            <datalist id="category-suggestions">
              {categorySuggestions.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                color: "var(--ft-dim)",
                textTransform: "uppercase" as const,
                letterSpacing: "0.06em",
                marginBottom: 4,
              }}
            >
              Monthly Limit (£)
            </div>
            <input
              type="number"
              value={formLimit}
              onChange={(e) => setFormLimit(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddBudget()}
              placeholder="0.00"
              min="0"
              style={INPUT_STYLE}
            />
          </div>
          <button onClick={handleAddBudget} style={BTN_ACCENT}>
            + Add
          </button>
          <button
            onClick={buildCopyCandidates}
            style={{
              ...BTN_GHOST,
              borderColor: "var(--ft-accent)",
              color: "var(--ft-accent)",
            }}
            title={`Copy ${MONTH_NAMES[lastMonth - 1]} actuals as budget suggestions`}
          >
            Copy Last Month
          </button>
        </div>
      </div>

      {/* ── Copy-last-month panel ── */}
      {showCopyPanel && copyCandidates.length > 0 && (
        <div
          style={{
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-border)",
            borderLeft: "3px solid var(--ft-accent)",
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--ft-accent)",
              letterSpacing: "0.08em",
              textTransform: "uppercase" as const,
              marginBottom: 10,
            }}
          >
            {MONTH_NAMES[lastMonth - 1]} {lastMonthYear} actuals — confirm to import
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              marginBottom: 12,
            }}
          >
            {copyCandidates.map((c, i) => (
              <label
                key={c.category}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: c.confirmed ? "var(--ft-text)" : "var(--ft-dim)",
                }}
              >
                <input
                  type="checkbox"
                  checked={c.confirmed}
                  onChange={(e) => {
                    const updated = copyCandidates.map((x, idx) =>
                      idx === i ? { ...x, confirmed: e.target.checked } : x
                    );
                    setCopyCandidates(updated);
                  }}
                  style={{ accentColor: "var(--ft-accent)", width: 12, height: 12 }}
                />
                <span style={{ flex: 1 }}>{c.category}</span>
                <span
                  className="pnum"
                  style={{
                    fontWeight: 700,
                    color: "var(--ft-accent)",
                    minWidth: 80,
                    textAlign: "right",
                  }}
                >
                  {formatGbp(Math.ceil(c.total))}
                </span>
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={applyLastMonthActuals} style={BTN_ACCENT}>
              Apply Selected
            </button>
            <button
              onClick={() => {
                setShowCopyPanel(false);
                setCopyCandidates([]);
              }}
              style={BTN_GHOST}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Budget list ── */}
      {sortedBudgets.length === 0 ? (
        <EmptyState
          title="No budgets"
          description="Add a budget category above to start tracking your spending limits."
        />
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            border: "1px solid var(--ft-border)",
            background: "var(--ft-border)",
          }}
        >
          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 100px 140px 180px 90px 80px 120px 80px",
              background: "var(--ft-surface)",
              padding: "6px 14px",
              gap: 8,
              alignItems: "center",
            }}
          >
            {[
              "Category",
              "Limit",
              "Spent",
              "Progress",
              "% Used",
              "Remaining",
              "Rollover",
              "",
            ].map((h) => (
              <div
                key={h}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  color: "var(--ft-dim)",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.08em",
                }}
              >
                {h}
              </div>
            ))}
          </div>

          {sortedBudgets.map((budget) => {
            const spent = spentByCategory[budget.category.toLowerCase()] ?? 0;
            const rolloverEntry = rolloverMap[budget.category];
            const rolloverEnabled = rolloverEntry?.enabled ?? false;
            const rolloverAccumulated = rolloverEntry?.accumulated ?? 0;
            const effectiveLimit = budget.limit + (rolloverEnabled ? rolloverAccumulated : 0);
            const pct = effectiveLimit > 0 ? spent / effectiveLimit : 0;
            const remaining = effectiveLimit - spent;
            const isOver = spent >= effectiveLimit;
            const isEditing = editingCategory === budget.category;
            const color = progressBg(pct);

            return (
              <div
                key={budget.category}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1fr 100px 140px 180px 90px 80px 120px 80px",
                  background: isOver
                    ? "rgba(248,81,73,0.04)"
                    : "var(--ft-surface)",
                  padding: "10px 14px",
                  gap: 8,
                  alignItems: "center",
                  borderLeft: `3px solid ${color}`,
                }}
              >
                {/* Category */}
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--ft-text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap" as const,
                    }}
                  >
                    {budget.category}
                  </div>
                  {rolloverEnabled && rolloverAccumulated > 0 && (
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        color: "var(--ft-cyan)",
                        marginTop: 2,
                        whiteSpace: "nowrap" as const,
                      }}
                    >
                      ↻ +{formatGbp(rolloverAccumulated)} carried over
                    </div>
                  )}
                </div>

                {/* Limit (inline edit) */}
                <div>
                  {isEditing ? (
                    <input
                      type="number"
                      value={editingLimit}
                      onChange={(e) => setEditingLimit(e.target.value)}
                      onBlur={() => commitEdit(budget.category)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit(budget.category);
                        if (e.key === "Escape") {
                          setEditingCategory(null);
                          setEditingLimit("");
                        }
                      }}
                      autoFocus
                      style={{
                        ...INPUT_STYLE,
                        height: 24,
                        width: "100%",
                        fontSize: 11,
                      }}
                    />
                  ) : (
                    <div>
                      <button
                        title="Click to edit"
                        onClick={() => startEdit(budget.category, budget.limit)}
                        className="pnum"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontFamily: "var(--font-mono)",
                          fontSize: 12,
                          fontWeight: 700,
                          color: "var(--ft-text)",
                          padding: 0,
                          textAlign: "left" as const,
                          width: "100%",
                          display: "block",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "var(--ft-accent)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "var(--ft-text)";
                        }}
                      >
                        {rolloverEnabled
                          ? formatGbp(effectiveLimit)
                          : formatGbp(budget.limit)}
                      </button>
                      {rolloverEnabled && rolloverAccumulated > 0 && (
                        <div
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 8,
                            color: "var(--ft-dim)",
                            marginTop: 1,
                          }}
                        >
                          base {formatGbp(budget.limit)}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Spent */}
                <div
                  className="pnum"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    fontWeight: 700,
                    color: isOver ? "var(--ft-red)" : "var(--ft-text)",
                  }}
                >
                  {formatGbp(spent)}
                </div>

                {/* Progress bar */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div
                    style={{
                      flex: 1,
                      height: 6,
                      background: "var(--ft-border)",
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(pct * 100, 100)}%`,
                        background: color,
                        borderRadius: 3,
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                </div>

                {/* % Used */}
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontWeight: 700,
                    color,
                  }}
                >
                  {Math.round(pct * 100)}%
                </div>

                {/* Remaining / Overspent */}
                <div
                  className="pnum"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: isOver ? "var(--ft-red)" : "var(--ft-green)",
                    fontWeight: 600,
                  }}
                >
                  {isOver ? (
                    <>
                      <span style={{ fontSize: 9, color: "var(--ft-red)" }}>
                        OVER
                      </span>{" "}
                      {formatGbp(Math.abs(remaining))}
                    </>
                  ) : (
                    formatGbp(remaining)
                  )}
                </div>

                {/* Rollover controls */}
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <button
                    onClick={() => toggleRollover(budget.category)}
                    title={rolloverEnabled ? "Disable rollover for this category" : "Enable rollover — unused budget carries to next month"}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      letterSpacing: "0.04em",
                      padding: "3px 6px",
                      border: `1px solid ${rolloverEnabled ? "var(--ft-cyan)" : "var(--ft-border2)"}`,
                      background: rolloverEnabled ? "rgba(86,182,194,0.12)" : "transparent",
                      color: rolloverEnabled ? "var(--ft-cyan)" : "var(--ft-dim)",
                      cursor: "pointer",
                      whiteSpace: "nowrap" as const,
                      textAlign: "left" as const,
                    }}
                  >
                    ↻ {rolloverEnabled ? "On" : "Rollover"}
                  </button>
                  {rolloverEnabled && rolloverAccumulated > 0 && (
                    <button
                      onClick={() => resetRollover(budget.category)}
                      title="Reset accumulated rollover to zero"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        letterSpacing: "0.04em",
                        padding: "2px 6px",
                        border: "1px solid var(--ft-border2)",
                        background: "transparent",
                        color: "var(--ft-dim)",
                        cursor: "pointer",
                        whiteSpace: "nowrap" as const,
                        textAlign: "left" as const,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--ft-red)";
                        e.currentTarget.style.borderColor = "var(--ft-red)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--ft-dim)";
                        e.currentTarget.style.borderColor = "var(--ft-border2)";
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Delete */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => handleDeleteBudget(budget.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--ft-dim)",
                      cursor: "pointer",
                      fontFamily: "var(--font-mono)",
                      fontSize: 14,
                      lineHeight: 1,
                      padding: 4,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "var(--ft-red)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--ft-dim)";
                    }}
                    aria-label={`Delete ${budget.category} budget`}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Budget vs Actuals chart ── */}
      {chartData.length > 0 && (
        <div
          style={{
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-border)",
            padding: "16px",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--ft-dim)",
              letterSpacing: "0.08em",
              textTransform: "uppercase" as const,
              marginBottom: 14,
            }}
          >
            Budget vs Actuals — sorted by utilisation
          </div>
          <ResponsiveContainer width="100%" height={Math.max(chartData.length * 36, 120)}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
              barCategoryGap="28%"
              barGap={3}
            >
              <XAxis
                type="number"
                tick={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fill: "var(--ft-dim)",
                }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `£${v}`}
              />
              <YAxis
                type="category"
                dataKey="category"
                width={100}
                tick={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fill: "var(--ft-muted)",
                }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<BudgetTooltip />} />
              <Bar dataKey="Budget" fill="var(--ft-dim)" radius={0} opacity={0.4} />
              <Bar dataKey="Actual" radius={0}>
                {chartData.map((entry) => {
                  const pctVal =
                    entry.Budget > 0 ? entry.Actual / entry.Budget : 0;
                  return (
                    <Cell
                      key={entry.category}
                      fill={barColor(pctVal)}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div
            style={{
              display: "flex",
              gap: 16,
              marginTop: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--ft-dim)",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  background: "var(--ft-dim)",
                  opacity: 0.4,
                }}
              />
              Budget
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  background: "var(--ft-green)",
                }}
              />
              Actual (&lt;70%)
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  background: "var(--ft-amber)",
                }}
              />
              Amber (70–90%)
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  background: "var(--ft-red)",
                }}
              />
              Over (&gt;90%)
            </span>
          </div>
        </div>
      )}

      {/* ── Unbudgeted categories notice ── */}
      {(() => {
        const budgetedLower = new Set(budgets.map((b) => b.category.toLowerCase()));
        const unbudgeted = Object.keys(spentByCategory).filter(
          (k) => !budgetedLower.has(k) && spentByCategory[k] > 0
        );
        if (unbudgeted.length === 0) return null;
        return (
          <div
            style={{
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border)",
              borderLeft: "3px solid var(--ft-amber)",
              padding: "10px 14px",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--ft-amber)",
                textTransform: "uppercase" as const,
                letterSpacing: "0.07em",
                marginBottom: 6,
              }}
            >
              Unbudgeted spending this month
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
              }}
            >
              {unbudgeted.map((cat) => {
                const displayCat = Object.keys(spentByCategory).find(
                  (k) => k.toLowerCase() === cat
                ) ?? cat;
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      setFormCategory(
                        (expenseTxs ?? []).find(
                          (tx: Transaction) =>
                            tx.category.toLowerCase() === cat
                        )?.category ?? cat
                      );
                    }}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      padding: "3px 8px",
                      border: "1px solid var(--ft-border2)",
                      background: "var(--ft-raised)",
                      color: "var(--ft-muted)",
                      cursor: "pointer",
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    <span>{displayCat}</span>
                    <span
                      className="pnum"
                      style={{
                        color: "var(--ft-amber)",
                        fontWeight: 600,
                      }}
                    >
                      {formatGbp(spentByCategory[cat])}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
