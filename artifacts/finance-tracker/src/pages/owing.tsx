import { useState, useEffect, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDebts,
  useGetDebtSummary,
  useCreateDebt,
  useSettleDebt,
  useDeleteDebt,
  useListAccounts,
  useListReceivedDebts,
  useRejectDebt,
  userLookup,
  getListDebtsQueryKey,
  getGetDebtSummaryQueryKey,
  getListAccountsQueryKey,
  getGetDashboardQueryKey,
  getListReceivedDebtsQueryKey,
  type UserLookupResult,
} from "@workspace/api-client-react";
import { formatGbp, formatNative, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Plus, Trash2, CheckCheck, HandCoins, TrendingDown, TrendingUp, RefreshCw, SplitSquareHorizontal, Mail, X, Check } from "lucide-react";
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
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type Direction = "i_owe_them" | "they_owe_me";
type Currency = "GBP" | "USD" | "EUR" | "MYR" | "CNY" | "JPY" | "AUD" | "CAD" | "SGD" | "HKD" | "THB" | "INR";
type SplitType = "equal" | "custom";
type LinkStatus = "idle" | "checking" | "found" | "not_found" | "invalid";
type DirectionFilter = "all" | "i-owe" | "owed-to-me";
type SortOption = "date-newest" | "date-oldest" | "amount-high" | "amount-low" | "name-az";
type AgeBucket = "fresh" | "aging" | "old" | "overdue";
type StrategyMode = "snowball" | "avalanche";

interface DebtForm {
  personName: string;
  description: string;
  date: string;
  nativeAmount: string;
  currency: Currency;
  direction: Direction;
  notes: string;
  accountId: string;
  linkedEmail: string;
}

interface SplitPerson {
  name: string;
  customAmount: string;
  linkedEmail: string;
}

interface SplitBillForm {
  total: string;
  currency: Currency;
  description: string;
  splitType: SplitType;
  people: SplitPerson[];
}

interface SettleFormState {
  debtId: number;
  fullAmount: number;
  inputValue: string;
  mode: "full" | "partial";
}

// Debt for strategy calculations (internal, not from API — those have no APR)
interface StrategyDebt {
  id: number;
  name: string;
  balance: number;
  apr: number; // user-overrideable, stored in localStorage
  minimumPayment: number; // 2% of balance default
}

interface AmortRow {
  month: number;
  [key: string]: number; // debtId -> remaining balance
  total: number;
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
  linkedEmail: "",
};

const EMPTY_SPLIT_FORM: SplitBillForm = {
  total: "",
  currency: "GBP",
  description: "",
  splitType: "equal",
  people: [
    { name: "", customAmount: "", linkedEmail: "" },
    { name: "", customAmount: "", linkedEmail: "" },
  ],
};

const CURRENCIES: Currency[] = ["GBP", "USD", "EUR", "MYR", "CNY", "JPY", "AUD", "CAD", "SGD", "HKD", "THB", "INR"];

const TH: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 10,
  fontWeight: 600,
  color: "var(--ft-dim)",
  background: "var(--ft-surface)",
  borderBottom: "2px solid var(--ft-border2)",
  borderRight: "1px solid var(--ft-border)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  whiteSpace: "nowrap" as const,
};
const TD: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 12,
  borderBottom: "1px solid var(--ft-border)",
  borderRight: "1px solid var(--ft-border)",
  color: "var(--ft-text)",
  whiteSpace: "nowrap" as const,
};

const INPUT_STYLE: React.CSSProperties = {
  background: "var(--ft-base)",
  border: "1px solid var(--ft-border2)",
  color: "var(--ft-text)",
  height: 32,
  fontSize: 12,
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

function looksLikeEmail(val: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
}

function getAgeBucket(createdAt: string): AgeBucket {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 7) return "fresh";
  if (days < 30) return "aging";
  if (days < 90) return "old";
  return "overdue";
}

function getDaysOld(createdAt: string): number {
  const created = new Date(createdAt);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

function getCardBorderStyle(direction: Direction, age: AgeBucket): React.CSSProperties {
  if (age === "overdue") {
    return { borderLeft: "3px solid var(--ft-red)" };
  }
  if (direction === "i_owe_them") {
    return { borderLeft: "3px solid var(--ft-red)" };
  }
  return { borderLeft: "3px solid var(--ft-green)" };
}

function getCardBackground(age: AgeBucket): string {
  if (age === "overdue") return "rgba(248,81,73,0.04)";
  if (age === "old") return "rgba(255,166,0,0.04)";
  return "var(--ft-surface)";
}

// ── APR localStorage helpers ───────────────────────────────────────────────────

function loadAprOverrides(): Record<number, number> {
  try {
    const raw = localStorage.getItem("nr-debt-aprs");
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveAprOverrides(overrides: Record<number, number>): void {
  try {
    localStorage.setItem("nr-debt-aprs", JSON.stringify(overrides));
  } catch {}
}

// ── Payoff strategy calculator ─────────────────────────────────────────────────

interface PayoffResult {
  months: number;
  totalInterest: number;
  payoffOrder: { id: number; name: string; month: number; interestPaid: number }[];
  chart: { month: number; total: number }[];
  amortization: AmortRow[]; // first 12 months
}

function runPayoffStrategy(
  debts: StrategyDebt[],
  monthlyBudget: number,
  mode: StrategyMode
): PayoffResult {
  const MAX_MONTHS = 360;

  // Work with mutable copies
  const state = debts.map(d => ({
    ...d,
    remaining: d.balance,
    interestAccrued: 0,
    paidOffMonth: null as number | null,
  }));

  const payoffOrder: PayoffResult["payoffOrder"] = [];
  const chart: PayoffResult["chart"] = [];
  const amortRows: AmortRow[] = [];

  for (let month = 1; month <= MAX_MONTHS; month++) {
    const alive = state.filter(d => d.remaining > 0);
    if (alive.length === 0) break;

    // 1. Apply monthly interest
    for (const d of alive) {
      const monthlyRate = d.apr / 100 / 12;
      d.remaining += d.remaining * monthlyRate;
      d.interestAccrued += d.remaining * monthlyRate;
    }

    // 2. Pay minimums first
    let budgetLeft = monthlyBudget;
    for (const d of alive) {
      const minPay = Math.min(d.minimumPayment, d.remaining);
      d.remaining -= minPay;
      d.remaining = Math.max(d.remaining, 0);
      budgetLeft -= minPay;
    }

    // 3. Apply extra to target debt
    if (budgetLeft > 0) {
      const stillAlive = state.filter(d => d.remaining > 0);
      let target: typeof state[number] | undefined;
      if (mode === "snowball") {
        target = stillAlive.slice().sort((a, b) => a.remaining - b.remaining)[0];
      } else {
        target = stillAlive.slice().sort((a, b) => b.apr - a.apr)[0];
      }
      if (target) {
        const extra = Math.min(budgetLeft, target.remaining);
        target.remaining -= extra;
        target.remaining = Math.max(target.remaining, 0);
      }
    }

    // 4. Track paid-off debts
    for (const d of state) {
      if (d.remaining <= 0.005 && d.paidOffMonth === null) {
        d.remaining = 0;
        d.paidOffMonth = month;
        payoffOrder.push({ id: d.id, name: d.name, month, interestPaid: d.interestAccrued });
      }
    }

    // 5. Chart data point
    const totalRemaining = state.reduce((s, d) => s + d.remaining, 0);
    chart.push({ month, total: Math.round(totalRemaining * 100) / 100 });

    // 6. Amortization for first 12 months
    if (month <= 12) {
      const row: AmortRow = { month, total: Math.round(totalRemaining * 100) / 100 };
      for (const d of state) {
        row[d.id] = Math.round(d.remaining * 100) / 100;
      }
      amortRows.push(row);
    }
  }

  // Remaining debts not yet paid off (shouldn't happen within 360 months but defensive)
  for (const d of state) {
    if (d.paidOffMonth === null && d.remaining <= 0.005) {
      d.paidOffMonth = MAX_MONTHS;
      payoffOrder.push({ id: d.id, name: d.name, month: MAX_MONTHS, interestPaid: d.interestAccrued });
    }
  }

  const totalMonths = payoffOrder.length > 0
    ? Math.max(...payoffOrder.map(p => p.month))
    : MAX_MONTHS;

  const totalInterest = state.reduce((s, d) => s + d.interestAccrued, 0);

  return {
    months: totalMonths,
    totalInterest,
    payoffOrder: [...payoffOrder].sort((a, b) => a.month - b.month),
    chart,
    amortization: amortRows,
  };
}

// ── Strategy tab component ─────────────────────────────────────────────────────

function StrategyTab() {
  const { data: rawDebts, isLoading } = useListDebts();

  const pendingDebts = useMemo(
    () => (rawDebts ?? []).filter(d => d.status === "pending"),
    [rawDebts]
  );

  const [aprOverrides, setAprOverrides] = useState<Record<number, number>>(() => loadAprOverrides());
  const [mode, setMode] = useState<StrategyMode>("avalanche");
  const [monthlyBudget, setMonthlyBudget] = useState(500);
  const [budgetInput, setBudgetInput] = useState("500");

  // Persist APR overrides whenever they change
  useEffect(() => {
    saveAprOverrides(aprOverrides);
  }, [aprOverrides]);

  function setApr(id: number, val: number) {
    setAprOverrides(prev => ({ ...prev, [id]: val }));
  }

  const strategyDebts = useMemo<StrategyDebt[]>(() => {
    return pendingDebts.map(d => {
      const apr = aprOverrides[d.id] ?? 20;
      const balance = d.gbpEquivalent;
      const minimumPayment = Math.max(balance * 0.02, 1);
      return {
        id: d.id,
        name: `${d.personName} — ${d.description}`,
        balance,
        apr,
        minimumPayment,
      };
    });
  }, [pendingDebts, aprOverrides]);

  const totalBalance = useMemo(() => strategyDebts.reduce((s, d) => s + d.balance, 0), [strategyDebts]);
  const totalMinimums = useMemo(() => strategyDebts.reduce((s, d) => s + d.minimumPayment, 0), [strategyDebts]);
  const extraAvailable = Math.max(monthlyBudget - totalMinimums, 0);

  const result = useMemo(() => {
    if (strategyDebts.length === 0) return null;
    if (monthlyBudget < totalMinimums) return null;
    return runPayoffStrategy(strategyDebts, monthlyBudget, mode);
  }, [strategyDebts, monthlyBudget, mode, totalMinimums]);

  // Comparison (other mode)
  const altResult = useMemo(() => {
    if (strategyDebts.length === 0) return null;
    if (monthlyBudget < totalMinimums) return null;
    const altMode: StrategyMode = mode === "snowball" ? "avalanche" : "snowball";
    return runPayoffStrategy(strategyDebts, monthlyBudget, altMode);
  }, [strategyDebts, monthlyBudget, mode, totalMinimums]);

  const savingsVsAlt = result && altResult ? altResult.totalInterest - result.totalInterest : 0;

  function handleBudgetChange(val: string) {
    setBudgetInput(val);
    const n = parseFloat(val);
    if (!isNaN(n) && n > 0) setMonthlyBudget(n);
  }

  if (isLoading) {
    return (
      <div style={{ padding: "40px 0", display: "flex", justifyContent: "center" }}>
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  if (pendingDebts.length === 0) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-dim)" }}>
          No pending debts to analyse. Add IOUs to use the payoff strategy planner.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Mode toggle + budget input */}
      <div style={{
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        padding: "14px 16px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 16,
      }}>

        {/* Mode toggle */}
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 6 }}>
            Strategy
          </div>
          <div style={{ display: "flex" }}>
            {(["snowball", "avalanche"] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: "5px 14px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  border: "1px solid var(--ft-border2)",
                  borderRight: m === "snowball" ? "none" : "1px solid var(--ft-border2)",
                  background: mode === m ? "var(--ft-accent)" : "transparent",
                  color: mode === m ? "var(--ft-base)" : "var(--ft-dim)",
                  cursor: "pointer",
                  transition: "all 0.1s",
                }}
              >
                {m === "snowball" ? "⬤ Snowball" : "▲ Avalanche"}
              </button>
            ))}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4, lineHeight: 1.5 }}>
            {mode === "snowball"
              ? "Pay smallest balance first — motivational wins"
              : "Pay highest APR first — minimises total interest"}
          </div>
        </div>

        {/* Budget slider */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 6 }}>
            Monthly Budget
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="range"
              min={Math.ceil(totalMinimums)}
              max={Math.max(Math.ceil(totalBalance * 0.3), monthlyBudget * 2, 2000)}
              step={10}
              value={monthlyBudget}
              onChange={e => { setMonthlyBudget(Number(e.target.value)); setBudgetInput(String(e.target.value)); }}
              style={{ flex: 1, accentColor: "var(--ft-accent)" }}
            />
            <input
              type="number"
              value={budgetInput}
              onChange={e => handleBudgetChange(e.target.value)}
              style={{
                background: "var(--ft-base)",
                border: "1px solid var(--ft-border2)",
                color: "var(--ft-text)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                height: 28,
                width: 90,
                padding: "0 8px",
                outline: "none",
              }}
            />
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>
            Min payments: {formatGbp(totalMinimums)} · Extra available: {formatGbp(extraAvailable)}
          </div>
        </div>

        {/* Total balance */}
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 6 }}>
            Total Balance
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--ft-red)" }}>
            {formatGbp(totalBalance)}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 2 }}>
            {pendingDebts.length} debt{pendingDebts.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {monthlyBudget < totalMinimums && (
        <div style={{
          background: "rgba(248,81,73,0.08)",
          border: "1px solid rgba(248,81,73,0.3)",
          padding: "10px 14px",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ft-red)",
        }}>
          Budget ({formatGbp(monthlyBudget)}) is less than total minimum payments ({formatGbp(totalMinimums)}). Increase the budget to run a strategy.
        </div>
      )}

      {/* Summary strip */}
      {result && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          <div style={{
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-border)",
            borderTop: "2px solid var(--ft-green)",
            padding: "12px 14px",
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 4 }}>
              Debt-free in
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--ft-green)", lineHeight: 1 }}>
              {result.months}
              <span style={{ fontSize: 11, fontWeight: 400, color: "var(--ft-dim)", marginLeft: 3 }}>mo</span>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>
              {Math.floor(result.months / 12)}y {result.months % 12}m
            </div>
          </div>

          <div style={{
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-border)",
            borderTop: "2px solid var(--ft-amber)",
            padding: "12px 14px",
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 4 }}>
              Total Interest
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--ft-amber)", lineHeight: 1 }}>
              {formatGbp(result.totalInterest)}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>
              over {result.months} months
            </div>
          </div>

          <div style={{
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-border)",
            borderTop: `2px solid ${savingsVsAlt >= 0 ? "var(--ft-cyan)" : "var(--ft-red)"}`,
            padding: "12px 14px",
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 4 }}>
              vs {mode === "snowball" ? "Avalanche" : "Snowball"}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: savingsVsAlt >= 0 ? "var(--ft-cyan)" : "var(--ft-red)", lineHeight: 1 }}>
              {savingsVsAlt >= 0 ? "saves " : "costs "}{formatGbp(Math.abs(savingsVsAlt))}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>
              {savingsVsAlt >= 0 ? "this strategy is better" : "other strategy saves more"}
            </div>
          </div>
        </div>
      )}

      {/* Debt cards with APR inputs + payoff order */}
      {result && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)" }}>
          <div style={{
            padding: "8px 14px",
            background: "var(--ft-surface)",
            borderBottom: "1px solid var(--ft-border)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ft-dim)",
          }}>
            Payoff Order · APR per Debt
          </div>
          <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {result.payoffOrder.map((po, i) => {
              const debt = strategyDebts.find(d => d.id === po.id);
              if (!debt) return null;
              const apr = aprOverrides[po.id] ?? 20;
              return (
                <div
                  key={po.id}
                  style={{
                    background: "var(--ft-base)",
                    border: "1px solid var(--ft-border)",
                    borderLeft: `3px solid var(--ft-accent)`,
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{
                    width: 22,
                    height: 22,
                    background: "rgba(244,162,30,0.15)",
                    color: "var(--ft-accent)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>

                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--ft-text)", marginBottom: 2 }}>
                      {debt.name}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                      Balance: {formatGbp(debt.balance)} · Min: {formatGbp(debt.minimumPayment)}/mo
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>APR</span>
                    <input
                      type="number"
                      value={apr}
                      min={0}
                      max={100}
                      step={0.1}
                      onChange={e => setApr(po.id, parseFloat(e.target.value) || 0)}
                      style={{
                        background: "var(--ft-surface)",
                        border: "1px solid var(--ft-border2)",
                        color: "var(--ft-amber)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        height: 24,
                        width: 60,
                        padding: "0 6px",
                        outline: "none",
                        textAlign: "right",
                      }}
                    />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>%</span>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-green)" }}>
                      Month {po.month}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                      +{formatGbp(po.interestPaid)} interest
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chart: Total debt over time */}
      {result && result.chart.length > 0 && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)" }}>
          <div style={{
            padding: "8px 14px",
            borderBottom: "1px solid var(--ft-border)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ft-dim)",
          }}>
            Total Debt Remaining
          </div>
          <div style={{ padding: "12px 0 8px" }}>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={result.chart} margin={{ top: 4, right: 20, left: 10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ft-border)" />
                <XAxis
                  dataKey="month"
                  tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
                  tickFormatter={v => `M${v}`}
                  interval={Math.floor(result.chart.length / 8)}
                />
                <YAxis
                  tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
                  tickFormatter={v => `£${(v / 1000).toFixed(0)}k`}
                  width={44}
                />
                <Tooltip
                  contentStyle={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", fontFamily: "var(--font-mono)", fontSize: 10 }}
                  formatter={(v: number) => [formatGbp(v), "Remaining"]}
                  labelFormatter={l => `Month ${l}`}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="var(--ft-accent)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3, fill: "var(--ft-accent)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Amortization table — first 12 months */}
      {result && result.amortization.length > 0 && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", overflow: "hidden" }}>
          <div style={{
            padding: "8px 14px",
            borderBottom: "1px solid var(--ft-border)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ft-dim)",
          }}>
            Amortization · First 12 Months
          </div>
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={TH}>Month</th>
                  {strategyDebts.map(d => (
                    <th key={d.id} style={{ ...TH, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {d.name.split(" — ")[0]}
                    </th>
                  ))}
                  <th style={{ ...TH, borderRight: "none" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {result.amortization.map(row => (
                  <tr key={row.month}>
                    <td style={TD}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>M{row.month}</span>
                    </td>
                    {strategyDebts.map(d => (
                      <td key={d.id} style={{ ...TD, fontFamily: "var(--font-mono)", color: (row[d.id] ?? 0) === 0 ? "var(--ft-green)" : "var(--ft-text)" }}>
                        {(row[d.id] ?? 0) === 0
                          ? <span style={{ color: "var(--ft-green)", fontSize: 9 }}>PAID</span>
                          : formatGbp(row[d.id] as number)}
                      </td>
                    ))}
                    <td style={{ ...TD, borderRight: "none", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ft-text)" }}>
                      {formatGbp(row.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Owing page ────────────────────────────────────────────────────────────

export default function Owing() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: debts, isLoading, error } = useListDebts();
  const { data: summary } = useGetDebtSummary();
  const { data: receivedDebts, isLoading: receivedLoading } = useListReceivedDebts();
  const createDebt = useCreateDebt();
  const settleDebt = useSettleDebt();
  const deleteDebt = useDeleteDebt();
  const rejectDebt = useRejectDebt();

  const { data: accounts } = useListAccounts();
  const [open, setOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [form, setForm] = useState<DebtForm>(EMPTY_FORM);
  const [splitForm, setSplitForm] = useState<SplitBillForm>(EMPTY_SPLIT_FORM);
  const [filter, setFilter] = useState<"all" | "pending" | "settled">("pending");
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("date-newest");
  const [splitSubmitting, setSplitSubmitting] = useState(false);
  const [settleForm, setSettleForm] = useState<SettleFormState | null>(null);
  const [mainTab, setMainTab] = useState<"debts" | "strategy">("debts");

  const [linkStatus, setLinkStatus] = useState<LinkStatus>("idle");
  const [linkedUser, setLinkedUser] = useState<UserLookupResult | null>(null);
  const lookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListDebtsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDebtSummaryQueryKey() });
    qc.invalidateQueries({ queryKey: getListAccountsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    qc.invalidateQueries({ queryKey: getListReceivedDebtsQueryKey() });
  }

  useEffect(() => {
    const email = form.linkedEmail.trim();
    if (!email) {
      setLinkStatus("idle");
      setLinkedUser(null);
      return;
    }
    if (!looksLikeEmail(email)) {
      setLinkStatus("invalid");
      setLinkedUser(null);
      return;
    }

    setLinkStatus("checking");
    setLinkedUser(null);

    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    lookupTimerRef.current = setTimeout(async () => {
      try {
        const user = await userLookup(email);
        setLinkedUser(user);
        setLinkStatus("found");
      } catch {
        setLinkStatus("not_found");
        setLinkedUser(null);
      }
    }, 600);

    return () => {
      if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    };
  }, [form.linkedEmail]);

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
          linkedEmail: form.linkedEmail.trim() || undefined,
        },
      });
      invalidate();
      setOpen(false);
      setForm(EMPTY_FORM);
      setLinkStatus("idle");
      setLinkedUser(null);
      const linkedMsg = linkedUser ? ` — ${linkedUser.name} will receive this IOU` : "";
      toast({ title: "Added", description: `${form.direction === "i_owe_them" ? "You owe" : form.personName} recorded.${linkedMsg}` });
    } catch {
      toast({ title: "Error", description: "Failed to add entry.", variant: "destructive" });
    }
  }

  function openSettleForm(id: number, name: string, amount: number) {
    setSettleForm({ debtId: id, fullAmount: amount, inputValue: amount.toFixed(2), mode: "full" });
  }

  async function confirmSettle() {
    if (!settleForm) return;
    try {
      await settleDebt.mutateAsync({ id: settleForm.debtId });
      invalidate();
      toast({ title: "Settled!", description: "Debt marked as settled." });
      setSettleForm(null);
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

  async function handleReject(id: number, personName: string) {
    try {
      await rejectDebt.mutateAsync({ id });
      invalidate();
      toast({ title: "Rejected", description: `IOU from ${personName} rejected.` });
    } catch {
      toast({ title: "Error", description: "Failed to reject.", variant: "destructive" });
    }
  }

  async function handleAcceptReceived(personName: string) {
    toast({ title: "Acknowledged", description: `IOU from ${personName} acknowledged. It's in your active list.` });
  }

  const splitTotal = parseFloat(splitForm.total) || 0;
  const validPeople = splitForm.people.filter((p) => p.name.trim());
  const perPersonEqual = splitForm.people.length > 0 ? splitTotal / splitForm.people.length : 0;
  const customAssigned = splitForm.people.reduce((sum, p) => sum + (parseFloat(p.customAmount) || 0), 0);
  const customRemaining = splitTotal - customAssigned;
  const customBalanced = splitTotal > 0 && Math.abs(customRemaining) < 0.005;

  function updateSplitPerson(index: number, field: keyof SplitPerson, value: string) {
    setSplitForm((f) => {
      const updated = f.people.map((p, i) => (i === index ? { ...p, [field]: value } : p));
      return { ...f, people: updated };
    });
  }

  function addSplitPerson() {
    if (splitForm.people.length >= 8) return;
    setSplitForm((f) => ({ ...f, people: [...f.people, { name: "", customAmount: "", linkedEmail: "" }] }));
  }

  function removeSplitPerson(index: number) {
    if (splitForm.people.length <= 2) return;
    setSplitForm((f) => ({ ...f, people: f.people.filter((_, i) => i !== index) }));
  }

  async function handleSplitSubmit() {
    if (!splitForm.description.trim()) {
      toast({ title: "Missing description", description: "Add a description for the bill.", variant: "destructive" });
      return;
    }
    if (splitTotal <= 0) {
      toast({ title: "Invalid amount", description: "Enter a valid total amount.", variant: "destructive" });
      return;
    }
    const namedPeople = splitForm.people.filter((p) => p.name.trim() && p.name.trim().toLowerCase() !== "me");
    if (namedPeople.length === 0) {
      toast({ title: "No participants", description: "Add at least one person (not 'Me') to create IOUs.", variant: "destructive" });
      return;
    }

    if (splitForm.splitType === "custom") {
      const customTotal = namedPeople.reduce((sum, p) => sum + (parseFloat(p.customAmount) || 0), 0);
      if (customTotal <= 0) {
        toast({ title: "Missing amounts", description: "Enter a custom amount for each person.", variant: "destructive" });
        return;
      }
    }

    setSplitSubmitting(true);
    let successCount = 0;
    try {
      for (const person of namedPeople) {
        const amount =
          splitForm.splitType === "equal"
            ? perPersonEqual
            : parseFloat(person.customAmount) || 0;

        if (amount <= 0) continue;

        await createDebt.mutateAsync({
          data: {
            personName: person.name.trim(),
            description: splitForm.description.trim(),
            date: today,
            nativeAmount: Math.round(amount * 100) / 100,
            currency: splitForm.currency,
            direction: "they_owe_me",
            linkedEmail: person.linkedEmail.trim() || undefined,
          },
        });
        successCount++;
      }

      invalidate();
      setSplitOpen(false);
      setSplitForm(EMPTY_SPLIT_FORM);
      toast({
        title: "Split bill created",
        description: `${successCount} IOU${successCount !== 1 ? "s" : ""} added — they owe you.`,
      });
    } catch {
      toast({ title: "Error", description: "Some entries could not be created.", variant: "destructive" });
    } finally {
      setSplitSubmitting(false);
    }
  }

  const pending = (debts ?? []).filter((d) => d.status === "pending");
  const iOwe = pending.filter((d) => d.direction === "i_owe_them");
  const theyOwe = pending.filter((d) => d.direction === "they_owe_me");
  const pendingReceived = (receivedDebts ?? []).filter((d) => d.status === "pending");

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const settledThisMonth = (debts ?? []).filter((d) => {
    if (d.status !== "settled") return false;
    const created = new Date(d.createdAt);
    return created >= startOfMonth;
  }).length;

  const owedToMeTotal = summary?.totalOwedToMe ?? 0;
  const iOweTotal = summary?.totalIOwe ?? 0;
  const netPosition = owedToMeTotal - iOweTotal;

  const filtered = useMemo(() => {
    let list = (debts ?? []).filter((d) => {
      if (filter === "all") return true;
      return d.status === filter;
    });

    if (directionFilter === "i-owe") {
      list = list.filter((d) => d.direction === "i_owe_them");
    } else if (directionFilter === "owed-to-me") {
      list = list.filter((d) => d.direction === "they_owe_me");
    }

    return [...list].sort((a, b) => {
      switch (sortOption) {
        case "date-newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "date-oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "amount-high":
          return b.gbpEquivalent - a.gbpEquivalent;
        case "amount-low":
          return a.gbpEquivalent - b.gbpEquivalent;
        case "name-az":
          return a.personName.localeCompare(b.personName);
        default:
          return 0;
      }
    });
  }, [debts, filter, directionFilter, sortOption]);

  const SORT_LABELS: Record<SortOption, string> = {
    "date-newest": "Date (newest)",
    "date-oldest": "Date (oldest)",
    "amount-high": "Amount (high)",
    "amount-low": "Amount (low)",
    "name-az": "Name (A–Z)",
  };

  return (
    <div className="space-y-5">
      <PageHeader
        icon={HandCoins}
        title="Owing"
        subtitle="Track who owes who — split bills, IOUs, shared expenses"
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setSplitOpen(true)}
              style={{ background: "var(--ft-raised)", color: "var(--ft-text)", border: "1px solid var(--ft-border2)", height: 30, fontSize: 12, gap: 6 }}
            >
              <SplitSquareHorizontal className="w-3.5 h-3.5" /> Split Bill
            </Button>
            <Button
              size="sm"
              onClick={() => setOpen(true)}
              style={{ background: "var(--ft-blue)", color: "#fff", height: 30, fontSize: 12, gap: 6 }}
            >
              <Plus className="w-3.5 h-3.5" /> Add IOU
            </Button>
          </div>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to load debts.</AlertDescription>
        </Alert>
      )}

      {/* ── Summary stat bar ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {/* Owed to me */}
        <div style={{
          background: "var(--ft-raised)",
          border: "1px solid var(--ft-border)",
          borderTop: "2px solid var(--ft-green)",
          padding: "12px 14px",
          borderRadius: 3,
        }}>
          <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            Owed to Me
          </div>
          {summary ? (
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--ft-green)", lineHeight: 1 }}>
              {formatGbp(owedToMeTotal)}
            </div>
          ) : (
            <Skeleton className="h-5 w-20" />
          )}
          <div style={{ fontSize: 10, color: "var(--ft-dim)", marginTop: 4 }}>{theyOwe.length} open</div>
        </div>

        {/* I owe */}
        <div style={{
          background: "var(--ft-raised)",
          border: "1px solid var(--ft-border)",
          borderTop: "2px solid var(--ft-red)",
          padding: "12px 14px",
          borderRadius: 3,
        }}>
          <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            I Owe
          </div>
          {summary ? (
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--ft-red)", lineHeight: 1 }}>
              {formatGbp(iOweTotal)}
            </div>
          ) : (
            <Skeleton className="h-5 w-20" />
          )}
          <div style={{ fontSize: 10, color: "var(--ft-dim)", marginTop: 4 }}>{iOwe.length} open</div>
        </div>

        {/* Net position */}
        <div style={{
          background: "var(--ft-raised)",
          border: "1px solid var(--ft-border)",
          borderTop: `2px solid ${netPosition >= 0 ? "var(--ft-green)" : "var(--ft-red)"}`,
          padding: "12px 14px",
          borderRadius: 3,
        }}>
          <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            Net Position
          </div>
          {summary ? (
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)", color: netPosition >= 0 ? "var(--ft-green)" : "var(--ft-red)", lineHeight: 1 }}>
              {netPosition >= 0 ? "+" : ""}{formatGbp(netPosition)}
            </div>
          ) : (
            <Skeleton className="h-5 w-20" />
          )}
          <div style={{ fontSize: 10, color: "var(--ft-dim)", marginTop: 4 }}>{summary?.pendingCount ?? 0} total open</div>
        </div>

        {/* Settled this month */}
        <div style={{
          background: "var(--ft-raised)",
          border: "1px solid var(--ft-border)",
          borderTop: "2px solid var(--ft-blue)",
          padding: "12px 14px",
          borderRadius: 3,
        }}>
          <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            Settled
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--ft-blue)", lineHeight: 1 }}>
            {isLoading ? <Skeleton className="h-5 w-12 inline-block" /> : settledThisMonth}
          </div>
          <div style={{ fontSize: 10, color: "var(--ft-dim)", marginTop: 4 }}>this month</div>
        </div>
      </div>

      {/* ── Main tab bar: DEBTS / STRATEGY ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        borderBottom: "2px solid var(--ft-border)",
        gap: 0,
      }}>
        {(["debts", "strategy"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setMainTab(tab)}
            style={{
              padding: "8px 18px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: mainTab === tab ? "var(--ft-accent)" : "var(--ft-dim)",
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${mainTab === tab ? "var(--ft-accent)" : "transparent"}`,
              marginBottom: -2,
              cursor: "pointer",
              transition: "color 0.1s",
            }}
          >
            {tab === "debts" ? "IOUs" : "Strategy"}
          </button>
        ))}
      </div>

      {/* ── Strategy tab ── */}
      {mainTab === "strategy" && <StrategyTab />}

      {/* ── Debts tab ── */}
      {mainTab === "debts" && (
        <>
          {/* ── Received IOUs section ── */}
          {(receivedLoading || (receivedDebts && receivedDebts.length > 0)) && (
            <div
              className="rounded-sm border overflow-hidden"
              style={{ borderColor: "var(--ft-border)", borderLeft: "3px solid var(--ft-cyan, #56b6c2)" }}
            >
              <div
                className="px-3 py-2 flex items-center justify-between border-b"
                style={{ background: "var(--ft-surface)", borderColor: "var(--ft-border)" }}
              >
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5" style={{ color: "var(--ft-cyan, #56b6c2)" }} />
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ft-cyan, #56b6c2)" }}>
                    Received — IOUs from others
                  </span>
                  {pendingReceived.length > 0 && (
                    <span
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold"
                      style={{ background: "var(--ft-cyan, #56b6c2)", color: "var(--ft-base)" }}
                    >
                      {pendingReceived.length}
                    </span>
                  )}
                </div>
                <span className="text-xs" style={{ color: "var(--ft-dim)" }}>
                  Someone else created these and linked them to your account
                </span>
              </div>

              <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 580 }}>
                  <thead>
                    <tr>
                      <th style={TH}>From</th>
                      <th style={TH}>Description</th>
                      <th style={TH}>Date</th>
                      <th style={TH}>Direction</th>
                      <th style={{ ...TH, textAlign: "right" }}>Amount</th>
                      <th style={{ ...TH, borderRight: "none" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receivedLoading && (
                      Array.from({ length: 2 }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 6 }).map((_, j) => (
                            <td key={j} style={TD}><Skeleton className="h-3 w-full" /></td>
                          ))}
                        </tr>
                      ))
                    )}
                    {!receivedLoading && (receivedDebts ?? []).length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ ...TD, textAlign: "center", padding: "20px 12px", color: "var(--ft-dim)", borderRight: "none" }}>
                          No received IOUs
                        </td>
                      </tr>
                    )}
                    {!receivedLoading && (receivedDebts ?? []).map((d) => (
                      <tr key={d.id}>
                        <td style={TD}>
                          <div className="flex items-center gap-2">
                            <span
                              className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                              style={{ background: "rgba(86,182,194,0.15)", color: "var(--ft-cyan, #56b6c2)" }}
                            >
                              {d.personName[0]?.toUpperCase() ?? "?"}
                            </span>
                            <span style={{ color: "var(--ft-text)" }}>{d.personName}</span>
                          </div>
                        </td>
                        <td style={{ ...TD, color: "var(--ft-text)" }}>
                          {d.description}
                          {d.notes && (
                            <span className="ml-1.5 text-xs" style={{ color: "var(--ft-dim)" }}>· {d.notes}</span>
                          )}
                        </td>
                        <td style={{ ...TD, fontFamily: "monospace" }}>{formatDate(d.date)}</td>
                        <td style={TD}>
                          {d.direction === "i_owe_them" ? (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-xs"
                              style={{ background: "rgba(248,81,73,0.1)", color: "var(--ft-red)", border: "1px solid rgba(248,81,73,0.2)" }}
                            >
                              <TrendingDown className="w-3 h-3" /> I owe
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-xs"
                              style={{ background: "rgba(63,185,80,0.1)", color: "var(--ft-green)", border: "1px solid rgba(63,185,80,0.2)" }}
                            >
                              <TrendingUp className="w-3 h-3" /> They owe
                            </span>
                          )}
                        </td>
                        <td style={{ ...TD, textAlign: "right", fontFamily: "monospace" }}>
                          {formatNative(d.nativeAmount, d.currency)}
                        </td>
                        <td style={{ ...TD, borderRight: "none" }}>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleAcceptReceived(d.personName)}
                              className="flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs transition-colors"
                              style={{ background: "rgba(63,185,80,0.1)", color: "var(--ft-green)", border: "1px solid rgba(63,185,80,0.2)" }}
                              title="Acknowledge this IOU"
                            >
                              <Check className="w-3 h-3" /> Accept
                            </button>
                            <button
                              onClick={() => handleReject(d.id, d.personName)}
                              className="flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs transition-colors"
                              style={{ background: "rgba(248,81,73,0.08)", color: "var(--ft-red)", border: "1px solid rgba(248,81,73,0.2)" }}
                              title="Reject this IOU"
                            >
                              <X className="w-3 h-3" /> Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── People summary for pending ── */}
          {pending.length > 0 && (
            <div className="rounded-sm border overflow-hidden" style={{ borderColor: "var(--ft-border)" }}>
              <div
                className="px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b flex items-center gap-2"
                style={{ background: "var(--ft-surface)", borderColor: "var(--ft-border)", color: "var(--ft-dim)" }}
              >
                <span style={{ color: "var(--ft-blue)" }}>⬡</span> Open balances by person
              </div>
              <div className="flex flex-wrap gap-2 p-3" style={{ background: "var(--ft-base)" }}>
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
                      background: "var(--ft-surface)",
                      borderColor: net >= 0 ? "rgba(63,185,80,0.3)" : "rgba(248,81,73,0.3)",
                    }}
                  >
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: "var(--ft-raised)", color: "var(--ft-blue)" }}
                    >
                      {name[0].toUpperCase()}
                    </span>
                    <span style={{ color: "var(--ft-text)" }}>{name}</span>
                    <span className="font-mono font-semibold" style={{ color: net >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                      {net >= 0 ? "+" : ""}{formatGbp(net)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Debt cards list ── */}
          <div className="rounded-sm border overflow-hidden" style={{ borderColor: "var(--ft-border)" }}>
            {/* Filter + sort bar */}
            <div
              style={{ background: "var(--ft-surface)", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0 }}
            >
              {/* Status tabs */}
              <div style={{ display: "flex", alignItems: "center", borderRight: "1px solid var(--ft-border)" }}>
                {(["pending", "settled", "all"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      padding: "8px 14px",
                      fontSize: 11,
                      fontWeight: 500,
                      textTransform: "capitalize",
                      color: filter === f ? "var(--ft-blue)" : "var(--ft-dim)",
                      background: "transparent",
                      cursor: "pointer",
                      border: "none",
                      borderBottom: `2px solid ${filter === f ? "var(--ft-blue)" : "transparent"}`,
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {/* Direction filter */}
              <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRight: "1px solid var(--ft-border)" }}>
                {(["all", "i-owe", "owed-to-me"] as const).map((df) => {
                  const labels: Record<DirectionFilter, string> = { all: "All", "i-owe": "I Owe", "owed-to-me": "Owed to Me" };
                  const isActive = directionFilter === df;
                  return (
                    <button
                      key={df}
                      onClick={() => setDirectionFilter(df)}
                      style={{
                        padding: "3px 8px",
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        borderRadius: 2,
                        border: `1px solid ${isActive ? (df === "i-owe" ? "rgba(248,81,73,0.5)" : df === "owed-to-me" ? "rgba(63,185,80,0.5)" : "rgba(88,166,255,0.5)") : "var(--ft-border2)"}`,
                        background: isActive ? (df === "i-owe" ? "rgba(248,81,73,0.1)" : df === "owed-to-me" ? "rgba(63,185,80,0.1)" : "rgba(88,166,255,0.1)") : "transparent",
                        color: isActive ? (df === "i-owe" ? "var(--ft-red)" : df === "owed-to-me" ? "var(--ft-green)" : "var(--ft-blue)") : "var(--ft-dim)",
                        cursor: "pointer",
                      }}
                    >
                      {labels[df]}
                    </button>
                  );
                })}
              </div>

              <div style={{ flex: 1 }} />

              {/* Sort selector */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px" }}>
                <span style={{ fontSize: 10, color: "var(--ft-dim)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Sort</span>
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as SortOption)}
                  style={{
                    background: "var(--ft-base)",
                    border: "1px solid var(--ft-border2)",
                    color: "var(--ft-text)",
                    fontSize: 11,
                    padding: "3px 6px",
                    borderRadius: 2,
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  {(Object.keys(SORT_LABELS) as SortOption[]).map((k) => (
                    <option key={k} value={k}>{SORT_LABELS[k]}</option>
                  ))}
                </select>
                <span style={{ fontSize: 10, color: "var(--ft-dim)", paddingLeft: 4 }}>
                  {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
                </span>
              </div>
            </div>

            {/* Debt cards */}
            <div style={{ background: "var(--ft-base)", padding: filtered.length > 0 ? "10px" : 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {isLoading && (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderLeft: "3px solid var(--ft-border2)", borderRadius: 3, padding: "12px 14px" }}>
                    <Skeleton className="h-4 w-40 mb-2" />
                    <Skeleton className="h-3 w-64 mb-2" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                ))
              )}
              {!isLoading && filtered.length === 0 && (
                <div style={{ padding: "32px 12px", textAlign: "center", color: "var(--ft-dim)", fontSize: 12 }}>
                  No entries — add one with <strong style={{ color: "var(--ft-blue)" }}>Add IOU</strong>
                </div>
              )}
              {!isLoading && filtered.map((d) => {
                const age = getAgeBucket(d.createdAt);
                const daysOld = getDaysOld(d.createdAt);
                const isIowe = d.direction === "i_owe_them";
                const amountColor = isIowe ? "var(--ft-red)" : "var(--ft-green)";
                const isSettling = settleForm?.debtId === d.id;

                return (
                  <div
                    key={d.id}
                    style={{
                      background: d.status === "settled" ? "transparent" : getCardBackground(age),
                      border: "1px solid var(--ft-border)",
                      borderRadius: 3,
                      overflow: "hidden",
                      opacity: d.status === "settled" ? 0.65 : 1,
                      ...(d.status === "settled" ? { borderLeft: "3px solid var(--ft-border2)" } : getCardBorderStyle(d.direction as Direction, age)),
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 14px" }}>
                      {/* Avatar */}
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: isIowe ? "rgba(248,81,73,0.12)" : "rgba(63,185,80,0.12)",
                        color: isIowe ? "var(--ft-red)" : "var(--ft-green)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: 13,
                        flexShrink: 0,
                      }}>
                        {d.personName[0]?.toUpperCase() ?? "?"}
                      </div>

                      {/* Main content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ft-text)" }}>{d.personName}</span>
                          {d.linkedUserId && (
                            <span style={{
                              fontSize: 9,
                              fontFamily: "var(--font-mono)",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              padding: "1px 5px",
                              borderRadius: 2,
                              background: "rgba(86,182,194,0.12)",
                              color: "var(--ft-cyan, #56b6c2)",
                              border: "1px solid rgba(86,182,194,0.25)",
                            }}>
                              Linked
                            </span>
                          )}
                          {age === "overdue" && d.status === "pending" && (
                            <span style={{
                              fontSize: 9,
                              fontFamily: "var(--font-mono)",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              padding: "1px 5px",
                              borderRadius: 2,
                              background: "rgba(248,81,73,0.12)",
                              color: "var(--ft-red)",
                              border: "1px solid rgba(248,81,73,0.25)",
                            }}>
                              Overdue
                            </span>
                          )}
                          {d.status === "settled" && (
                            <span style={{
                              fontSize: 9,
                              fontFamily: "var(--font-mono)",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              padding: "1px 5px",
                              borderRadius: 2,
                              background: "rgba(63,185,80,0.08)",
                              color: "var(--ft-green)",
                              border: "1px solid rgba(63,185,80,0.15)",
                            }}>
                              Settled
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--ft-muted)", marginBottom: 4 }}>
                          {d.description}
                          {d.notes && (
                            <span style={{ color: "var(--ft-dim)", marginLeft: 6 }}>· {d.notes}</span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 10, color: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}>
                            {formatDate(d.date)}
                          </span>
                          <span style={{ fontSize: 10, color: age === "overdue" ? "var(--ft-red)" : age === "old" ? "var(--ft-amber)" : "var(--ft-dim)" }}>
                            {daysOld === 0 ? "today" : `${daysOld}d old`}
                          </span>
                          <span style={{ fontSize: 10, color: "var(--ft-dim)" }}>
                            {isIowe ? `→ You → ${d.personName}` : `${d.personName} → You →`}
                          </span>
                        </div>
                      </div>

                      {/* Amount + actions */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-mono)", color: amountColor }}>
                          {isIowe ? "-" : "+"}{formatGbp(d.gbpEquivalent)}
                        </div>
                        {d.currency !== "GBP" && (
                          <div style={{ fontSize: 10, color: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}>
                            {formatNative(d.nativeAmount, d.currency)}
                          </div>
                        )}
                        {d.status === "pending" && !isSettling && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <button
                              onClick={() => openSettleForm(d.id, d.personName, d.gbpEquivalent)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                                padding: "3px 8px",
                                fontSize: 11,
                                borderRadius: 2,
                                background: "rgba(63,185,80,0.1)",
                                color: "var(--ft-green)",
                                border: "1px solid rgba(63,185,80,0.2)",
                                cursor: "pointer",
                              }}
                            >
                              <CheckCheck className="w-3 h-3" /> Settle
                            </button>
                            <button
                              onClick={() => handleDelete(d.id)}
                              style={{ padding: 4, color: "var(--ft-dim)", background: "transparent", border: "none", cursor: "pointer" }}
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        {d.status === "settled" && (
                          <button
                            onClick={() => handleDelete(d.id)}
                            style={{ padding: 4, color: "var(--ft-dim)", background: "transparent", border: "none", cursor: "pointer" }}
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline settle form */}
                    {isSettling && settleForm && (
                      <div style={{
                        padding: "10px 14px",
                        background: "rgba(63,185,80,0.05)",
                        borderTop: "1px solid rgba(63,185,80,0.15)",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <button
                            onClick={() => setSettleForm((s) => s ? { ...s, mode: "full", inputValue: s.fullAmount.toFixed(2) } : s)}
                            style={{
                              padding: "3px 8px",
                              fontSize: 10,
                              fontFamily: "var(--font-mono)",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              borderRadius: 2,
                              border: `1px solid ${settleForm.mode === "full" ? "rgba(63,185,80,0.5)" : "var(--ft-border2)"}`,
                              background: settleForm.mode === "full" ? "rgba(63,185,80,0.12)" : "transparent",
                              color: settleForm.mode === "full" ? "var(--ft-green)" : "var(--ft-dim)",
                              cursor: "pointer",
                            }}
                          >
                            Full
                          </button>
                          <button
                            onClick={() => setSettleForm((s) => s ? { ...s, mode: "partial", inputValue: "" } : s)}
                            style={{
                              padding: "3px 8px",
                              fontSize: 10,
                              fontFamily: "var(--font-mono)",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              borderRadius: 2,
                              border: `1px solid ${settleForm.mode === "partial" ? "rgba(255,166,0,0.5)" : "var(--ft-border2)"}`,
                              background: settleForm.mode === "partial" ? "rgba(255,166,0,0.1)" : "transparent",
                              color: settleForm.mode === "partial" ? "var(--ft-amber)" : "var(--ft-dim)",
                              cursor: "pointer",
                            }}
                          >
                            Partial
                          </button>
                        </div>
                        <input
                          type="number"
                          value={settleForm.inputValue}
                          onChange={(e) => setSettleForm((s) => s ? { ...s, inputValue: e.target.value } : s)}
                          placeholder="Amount"
                          style={{
                            background: "var(--ft-base)",
                            border: "1px solid var(--ft-border2)",
                            color: "var(--ft-text)",
                            fontSize: 12,
                            fontFamily: "var(--font-mono)",
                            height: 28,
                            width: 100,
                            padding: "0 8px",
                            borderRadius: 2,
                            outline: "none",
                          }}
                        />
                        <span style={{ fontSize: 10, color: "var(--ft-dim)" }}>
                          of {formatGbp(settleForm.fullAmount)}
                        </span>
                        <button
                          onClick={confirmSettle}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 3,
                            padding: "4px 10px",
                            fontSize: 11,
                            borderRadius: 2,
                            background: "rgba(63,185,80,0.15)",
                            color: "var(--ft-green)",
                            border: "1px solid rgba(63,185,80,0.3)",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          <Check className="w-3 h-3" /> Confirm
                        </button>
                        <button
                          onClick={() => setSettleForm(null)}
                          style={{
                            padding: "4px 8px",
                            fontSize: 11,
                            borderRadius: 2,
                            background: "transparent",
                            color: "var(--ft-dim)",
                            border: "1px solid var(--ft-border2)",
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Add IOU Dialog ── */}
      <Dialog open={open} onOpenChange={(o) => { if (!o) { setLinkStatus("idle"); setLinkedUser(null); } setOpen(o); }}>
        <DialogContent style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", maxWidth: 500 }}>
          <DialogHeader>
            <DialogTitle style={{ color: "var(--ft-text)", fontSize: 14 }}>Add IOU</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setForm((f) => ({ ...f, direction: "i_owe_them" }))}
                className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-sm border text-xs font-medium transition-all"
                style={{
                  background: form.direction === "i_owe_them" ? "rgba(248,81,73,0.12)" : "var(--ft-base)",
                  borderColor: form.direction === "i_owe_them" ? "rgba(248,81,73,0.5)" : "var(--ft-border2)",
                  color: form.direction === "i_owe_them" ? "var(--ft-red)" : "var(--ft-dim)",
                }}
              >
                <TrendingDown className="w-5 h-5" />
                I owe them
              </button>
              <button
                onClick={() => setForm((f) => ({ ...f, direction: "they_owe_me" }))}
                className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-sm border text-xs font-medium transition-all"
                style={{
                  background: form.direction === "they_owe_me" ? "rgba(63,185,80,0.12)" : "var(--ft-base)",
                  borderColor: form.direction === "they_owe_me" ? "rgba(63,185,80,0.5)" : "var(--ft-border2)",
                  color: form.direction === "they_owe_me" ? "var(--ft-green)" : "var(--ft-dim)",
                }}
              >
                <TrendingUp className="w-5 h-5" />
                They owe me
              </button>
            </div>

            <div className="space-y-1.5">
              <Label style={{ color: "var(--ft-muted)", fontSize: 11 }}>Person</Label>
              <Input
                placeholder="e.g. Alice"
                value={form.personName}
                onChange={(e) => setForm((f) => ({ ...f, personName: e.target.value }))}
                style={INPUT_STYLE}
              />
            </div>

            <div className="space-y-1.5">
              <Label style={{ color: "var(--ft-muted)", fontSize: 11 }}>Description</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setForm((f) => ({ ...f, description: `${p.icon} ${p.label}` }))}
                    className="px-2 py-0.5 rounded-sm text-xs border transition-colors"
                    style={{
                      background: form.description === `${p.icon} ${p.label}` ? "rgba(31,111,235,0.15)" : "var(--ft-base)",
                      borderColor: form.description === `${p.icon} ${p.label}` ? "rgba(31,111,235,0.5)" : "var(--ft-border2)",
                      color: form.description === `${p.icon} ${p.label}` ? "var(--ft-blue)" : "var(--ft-muted)",
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
                style={INPUT_STYLE}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label style={{ color: "var(--ft-muted)", fontSize: 11 }}>Amount</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={form.nativeAmount}
                  onChange={(e) => setForm((f) => ({ ...f, nativeAmount: e.target.value }))}
                  style={INPUT_STYLE}
                />
              </div>
              <div className="space-y-1.5">
                <Label style={{ color: "var(--ft-muted)", fontSize: 11 }}>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v as Currency }))}>
                  <SelectTrigger style={{ ...INPUT_STYLE }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)" }}>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c} style={{ color: "var(--ft-text)", fontSize: 12 }}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label style={{ color: "var(--ft-muted)", fontSize: 11 }}>Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  style={INPUT_STYLE}
                />
              </div>
              <div className="space-y-1.5">
                <Label style={{ color: "var(--ft-muted)", fontSize: 11 }}>Notes <span style={{ color: "var(--ft-dim)" }}>(optional)</span></Label>
                <Input
                  placeholder="extra detail..."
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  style={INPUT_STYLE}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label style={{ color: "var(--ft-muted)", fontSize: 11 }}>
                Link to user <span style={{ color: "var(--ft-dim)" }}>(optional — creates a mirror IOU in their account)</span>
              </Label>
              <div className="relative">
                <Input
                  type="email"
                  placeholder="their@email.com"
                  value={form.linkedEmail}
                  onChange={(e) => setForm((f) => ({ ...f, linkedEmail: e.target.value }))}
                  style={{ ...INPUT_STYLE, paddingRight: 120 }}
                />
                {form.linkedEmail.trim() && (
                  <div
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs flex items-center gap-1"
                    style={{
                      color: linkStatus === "found"
                        ? "var(--ft-green)"
                        : linkStatus === "not_found" || linkStatus === "invalid"
                        ? "var(--ft-red)"
                        : "var(--ft-dim)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {linkStatus === "checking" && (
                      <span style={{ color: "var(--ft-dim)" }}>checking...</span>
                    )}
                    {linkStatus === "found" && linkedUser && (
                      <>
                        <Check className="w-3 h-3" />
                        <span>{linkedUser.name}</span>
                      </>
                    )}
                    {linkStatus === "not_found" && (
                      <span>not registered</span>
                    )}
                    {linkStatus === "invalid" && form.linkedEmail.trim() && (
                      <span style={{ color: "var(--ft-dim)" }}>enter full email</span>
                    )}
                  </div>
                )}
              </div>
              {linkStatus === "found" && linkedUser && (
                <p className="text-xs" style={{ color: "var(--ft-green)" }}>
                  {linkedUser.name} will receive this IOU in their account.
                </p>
              )}
              {linkStatus === "not_found" && (
                <p className="text-xs" style={{ color: "var(--ft-dim)" }}>
                  User not registered — IOU will be local only.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label style={{ color: "var(--ft-muted)", fontSize: 11 }}>
                Account <span style={{ color: "var(--ft-dim)" }}>(optional — adjusts balance when settled)</span>
              </Label>
              <Select
                value={form.accountId || "__none__"}
                onValueChange={(v) => setForm((f) => ({ ...f, accountId: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger style={{ ...INPUT_STYLE }}>
                  <SelectValue placeholder="No account linked" />
                </SelectTrigger>
                <SelectContent style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)" }}>
                  <SelectItem value="__none__" style={{ color: "var(--ft-dim)", fontSize: 12 }}>No account</SelectItem>
                  {accounts?.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)} style={{ color: "var(--ft-text)", fontSize: 12 }}>
                      {a.name} ({a.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm" style={{ color: "var(--ft-dim)", fontSize: 12 }}>Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={createDebt.isPending}
              style={{ background: "var(--ft-blue)", color: "#fff", fontSize: 12 }}
            >
              {createDebt.isPending ? "Adding…" : "Add IOU"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Split Bill Dialog ── */}
      <Dialog open={splitOpen} onOpenChange={(o) => { if (!o) setSplitForm(EMPTY_SPLIT_FORM); setSplitOpen(o); }}>
        <DialogContent style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", maxWidth: 540 }}>
          <DialogHeader>
            <DialogTitle style={{ color: "var(--ft-text)", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <SplitSquareHorizontal className="w-4 h-4" style={{ color: "var(--ft-blue)" }} />
              Split Bill Calculator
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label style={{ color: "var(--ft-muted)", fontSize: 11 }}>Total Amount</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={splitForm.total}
                  onChange={(e) => setSplitForm((f) => ({ ...f, total: e.target.value }))}
                  style={INPUT_STYLE}
                />
              </div>
              <div className="space-y-1.5">
                <Label style={{ color: "var(--ft-muted)", fontSize: 11 }}>Currency</Label>
                <Select value={splitForm.currency} onValueChange={(v) => setSplitForm((f) => ({ ...f, currency: v as Currency }))}>
                  <SelectTrigger style={{ ...INPUT_STYLE }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)" }}>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c} style={{ color: "var(--ft-text)", fontSize: 12 }}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label style={{ color: "var(--ft-muted)", fontSize: 11 }}>Description</Label>
              <Input
                placeholder='e.g. "Dinner at Nobu"'
                value={splitForm.description}
                onChange={(e) => setSplitForm((f) => ({ ...f, description: e.target.value }))}
                style={INPUT_STYLE}
              />
            </div>

            <div className="space-y-1.5">
              <Label style={{ color: "var(--ft-muted)", fontSize: 11 }}>Split Type</Label>
              <div className="flex gap-2">
                {(["equal", "custom"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setSplitForm((f) => ({ ...f, splitType: t }))}
                    className="px-3 py-1 rounded-sm border text-xs font-medium transition-all capitalize"
                    style={{
                      background: splitForm.splitType === t ? "rgba(31,111,235,0.15)" : "var(--ft-base)",
                      borderColor: splitForm.splitType === t ? "rgba(31,111,235,0.5)" : "var(--ft-border2)",
                      color: splitForm.splitType === t ? "var(--ft-blue)" : "var(--ft-dim)",
                    }}
                  >
                    {t === "equal" ? "Equal Split" : "Custom Amounts"}
                  </button>
                ))}
              </div>
            </div>

            {splitForm.splitType === "equal" && splitTotal > 0 && (
              <div
                className="flex items-center justify-between px-3 py-2 rounded-sm border text-xs"
                style={{ background: "rgba(88,166,255,0.06)", borderColor: "rgba(88,166,255,0.2)" }}
              >
                <span style={{ color: "var(--ft-muted)" }}>
                  {splitForm.currency} {splitTotal.toFixed(2)} ÷ {splitForm.people.length} people
                </span>
                <span className="font-mono font-bold" style={{ color: "var(--ft-blue)" }}>
                  = {splitForm.currency} {perPersonEqual.toFixed(2)} / person
                </span>
              </div>
            )}

            {splitForm.splitType === "custom" && splitTotal > 0 && (
              <div
                className="flex items-center justify-between px-3 py-2 rounded-sm border text-xs"
                style={{
                  background: customBalanced ? "rgba(74,222,128,0.06)" : customRemaining < 0 ? "rgba(248,113,113,0.06)" : "rgba(88,166,255,0.06)",
                  borderColor: customBalanced ? "rgba(74,222,128,0.25)" : customRemaining < 0 ? "rgba(248,113,113,0.25)" : "rgba(88,166,255,0.2)",
                }}
              >
                <span style={{ color: "var(--ft-muted)" }}>
                  Assigned: {splitForm.currency} {customAssigned.toFixed(2)} / {splitForm.currency} {splitTotal.toFixed(2)}
                </span>
                <span className="font-mono font-bold" style={{
                  color: customBalanced ? "var(--ft-green)" : customRemaining < 0 ? "var(--ft-red)" : "var(--ft-blue)",
                }}>
                  {customBalanced ? "✓ Balanced" : customRemaining > 0 ? `− ${splitForm.currency} ${customRemaining.toFixed(2)} remaining` : `+ ${splitForm.currency} ${Math.abs(customRemaining).toFixed(2)} over`}
                </span>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label style={{ color: "var(--ft-muted)", fontSize: 11 }}>Split Between</Label>
                <span className="text-xs" style={{ color: "var(--ft-dim)" }}>
                  {splitForm.people.length}/8 people
                </span>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {splitForm.people.map((person, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: "var(--ft-raised)", color: "var(--ft-blue)" }}
                      >
                        {idx + 1}
                      </div>
                      <Input
                        placeholder={`Person ${idx + 1} name`}
                        value={person.name}
                        onChange={(e) => updateSplitPerson(idx, "name", e.target.value)}
                        style={{ ...INPUT_STYLE, flex: 1 }}
                      />
                      {splitForm.splitType === "custom" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={person.customAmount}
                            onChange={(e) => updateSplitPerson(idx, "customAmount", e.target.value)}
                            style={{ ...INPUT_STYLE, width: 80 }}
                          />
                          {!person.customAmount && customRemaining > 0 && splitTotal > 0 && (
                            <button
                              type="button"
                              title={`Fill ${splitForm.currency} ${customRemaining.toFixed(2)}`}
                              onClick={() => updateSplitPerson(idx, "customAmount", customRemaining.toFixed(2))}
                              style={{
                                fontSize: 9,
                                fontFamily: "var(--font-mono)",
                                color: "var(--ft-blue)",
                                background: "rgba(88,166,255,0.1)",
                                border: "1px solid rgba(88,166,255,0.25)",
                                padding: "2px 5px",
                                whiteSpace: "nowrap",
                                lineHeight: 1.4,
                              }}
                            >
                              ← {customRemaining.toFixed(2)}
                            </button>
                          )}
                        </div>
                      )}
                      {splitForm.splitType === "equal" && splitTotal > 0 && (
                        <span className="text-xs font-mono flex-shrink-0" style={{ color: "var(--ft-green)", minWidth: 70, textAlign: "right" }}>
                          {splitForm.currency} {perPersonEqual.toFixed(2)}
                        </span>
                      )}
                      {splitForm.people.length > 2 && (
                        <button
                          onClick={() => removeSplitPerson(idx)}
                          style={{ color: "var(--ft-dim)", flexShrink: 0 }}
                          title="Remove person"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div style={{ paddingLeft: 32 }}>
                      <input
                        type="email"
                        placeholder="link to account email (optional)"
                        value={person.linkedEmail}
                        onChange={(e) => updateSplitPerson(idx, "linkedEmail", e.target.value)}
                        style={{
                          width: "100%",
                          background: "transparent",
                          border: "none",
                          borderBottom: `1px solid ${person.linkedEmail && looksLikeEmail(person.linkedEmail) ? "var(--ft-cyan, #56b6c2)" : "var(--ft-border2)"}`,
                          color: person.linkedEmail && looksLikeEmail(person.linkedEmail) ? "var(--ft-cyan, #56b6c2)" : "var(--ft-dim)",
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          height: 20,
                          outline: "none",
                          paddingBottom: 2,
                          letterSpacing: "0.03em",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {splitForm.people.length < 8 && (
                <button
                  onClick={addSplitPerson}
                  className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-sm border transition-colors"
                  style={{ color: "var(--ft-blue)", borderColor: "rgba(88,166,255,0.2)", background: "rgba(88,166,255,0.05)" }}
                >
                  <Plus className="w-3 h-3" /> Add person
                </button>
              )}
            </div>

            <p className="text-xs" style={{ color: "var(--ft-dim)" }}>
              IOUs are created for everyone except "Me". Each person will owe you their share.
            </p>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm" style={{ color: "var(--ft-dim)", fontSize: 12 }}>Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleSplitSubmit}
              disabled={splitSubmitting}
              style={{ background: "var(--ft-blue)", color: "#fff", fontSize: 12 }}
            >
              {splitSubmitting ? "Creating…" : `Create ${validPeople.filter((p) => p.name.toLowerCase() !== "me").length} IOU${validPeople.filter((p) => p.name.toLowerCase() !== "me").length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
