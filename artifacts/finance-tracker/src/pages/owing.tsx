import { useState, useEffect, useRef, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { type StrategyMode, type StrategyDebt, type AmortRow, type PayoffResult, runPayoffStrategy } from "@/lib/payoff";
import { haptic } from "@/lib/haptics";
import { loadPersonaIds, PERSONA_COLORS } from "@/lib/persona";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Plus, Trash2, CheckCheck, HandCoins, TrendingDown, TrendingUp, RefreshCw, SplitSquareHorizontal, Mail, X, Check } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DataTD, DataTH, MonoLabel, PanelBox, PanelHeader, Text } from "@/components/primitives";
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

function makeEmptyDebtForm(): DebtForm {
  return {
    personName: "",
    description: "",
    date: new Date().toISOString().slice(0, 10),
    nativeAmount: "",
    currency: "GBP",
    direction: "i_owe_them",
    notes: "",
    accountId: "",
    linkedEmail: "",
  };
}

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

const INPUT_STYLE: React.CSSProperties = {
  background: "var(--ft-base)",
  border: "1px solid var(--ft-border2)",
  color: "var(--ft-text)",
  height: 32,
  fontSize: 12,
};

const PRESETS = [
  "Restaurant", "Cafe", "Entertainment", "Drinks",
  "Groceries", "Transport", "Travel", "Accommodation",
  "Shopping", "Medical",
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
      <PanelBox padding="14px 16px" row gap={16}>

        {/* Mode toggle */}
        <div>
          <MonoLabel mb={6}>Strategy</MonoLabel>
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
                  transition: "background 0.1s, color 0.1s, border-color 0.1s",
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
          <MonoLabel mb={6}>Monthly Budget</MonoLabel>
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
              min={0}
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
            Min payments: <span className="pnum">{formatGbp(totalMinimums)}</span> · Extra available: <span className="pnum">{formatGbp(extraAvailable)}</span>
          </div>
        </div>

        {/* Total balance */}
        <div>
          <MonoLabel mb={6}>Total Balance</MonoLabel>
          <Text as="div" mono size={18} weight={700} color="var(--ft-red)">
            <span className="pnum">{formatGbp(totalBalance)}</span>
          </Text>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 2 }}>
            {pendingDebts.length} debt{pendingDebts.length !== 1 ? "s" : ""}
          </div>
        </div>
      </PanelBox>

      {monthlyBudget < totalMinimums && (
        <div style={{
          background: "rgba(248,81,73,0.08)",
          border: "1px solid rgba(248,81,73,0.3)",
          padding: "10px 14px",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ft-red)",
        }}>
          Budget (<span className="pnum">{formatGbp(monthlyBudget)}</span>) is less than total minimum payments (<span className="pnum">{formatGbp(totalMinimums)}</span>) — increase by <span className="pnum">{formatGbp(totalMinimums - monthlyBudget)}</span> to run a strategy.
        </div>
      )}

      {/* Summary strip */}
      {result && (
        <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          <PanelBox borderTop="2px solid var(--ft-green)" padding="12px 14px">
            <MonoLabel mb={4}>Debt-free in</MonoLabel>
            <Text as="div" mono size={20} weight={700} color="var(--ft-green)" lineHeight={1}>
              {result.months}
              <span style={{ fontSize: 11, fontWeight: 400, color: "var(--ft-dim)", marginLeft: 3 }}>mo</span>
            </Text>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>
              {Math.floor(result.months / 12)}y {result.months % 12}m
            </div>
          </PanelBox>

          <PanelBox borderTop="2px solid var(--ft-amber)" padding="12px 14px">
            <MonoLabel mb={4}>Total Interest</MonoLabel>
            <Text as="div" mono size={20} weight={700} color="var(--ft-amber)" lineHeight={1}>
              <span className="pnum">{formatGbp(result.totalInterest)}</span>
            </Text>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>
              over {result.months} months
            </div>
          </PanelBox>

          <PanelBox borderTop={`2px solid ${savingsVsAlt >= 0 ? "var(--ft-cyan)" : "var(--ft-red)"}`} padding="12px 14px">
            <MonoLabel mb={4}>vs {mode === "snowball" ? "Avalanche" : "Snowball"}</MonoLabel>
            <Text as="div" mono size={20} weight={700} color={savingsVsAlt >= 0 ? "var(--ft-cyan)" : "var(--ft-red)"} lineHeight={1}>
              {savingsVsAlt >= 0 ? "saves " : "costs "}<span className="pnum">{formatGbp(Math.abs(savingsVsAlt))}</span>
            </Text>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>
              {savingsVsAlt >= 0 ? "this strategy is better" : "other strategy saves more"}
            </div>
          </PanelBox>
        </div>
      )}

      {/* Debt cards with APR inputs + payoff order */}
      {result && (
        <PanelBox>
          <PanelHeader>Payoff Order · APR per Debt</PanelHeader>
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
                    <Text as="div" mono size={9} color="var(--ft-dim)">
                      Balance: <span className="pnum">{formatGbp(debt.balance)}</span> · Min: <span className="pnum">{formatGbp(debt.minimumPayment)}</span>/mo
                    </Text>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <MonoLabel as="span" letterSpacing="0.06em">APR</MonoLabel>
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
                    <Text as="span" mono size={9} color="var(--ft-dim)">%</Text>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-green)" }}>
                      Month {po.month}
                    </div>
                    <Text as="div" mono size={9} color="var(--ft-dim)">
                      +<span className="pnum">{formatGbp(po.interestPaid)}</span> interest
                    </Text>
                  </div>
                </div>
              );
            })}
          </div>
        </PanelBox>
      )}

      {/* Chart: Total debt over time */}
      {result && result.chart.length > 0 && (
        <PanelBox>
          <PanelHeader>Total Debt Remaining</PanelHeader>
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
        </PanelBox>
      )}

      {/* Amortization table — first 12 months */}
      {result && result.amortization.length > 0 && (
        <PanelBox>
          <PanelHeader>Amortization · First 12 Months</PanelHeader>
          <div className="ft-scroll-x" style={{ WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <DataTH>Month</DataTH>
                  {strategyDebts.map(d => (
                    <DataTH key={d.id} style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {d.name.split(" — ")[0]}
                    </DataTH>
                  ))}
                  <DataTH noRightBorder>Total</DataTH>
                </tr>
              </thead>
              <tbody>
                {result.amortization.map(row => (
                  <tr key={row.month}>
                    <DataTD>
                      <Text as="span" mono size={10} color="var(--ft-dim)">M{row.month}</Text>
                    </DataTD>
                    {strategyDebts.map(d => (
                      <DataTD key={d.id} mono style={{ color: (row[d.id] ?? 0) === 0 ? "var(--ft-green)" : "var(--ft-text)" }}>
                        {(row[d.id] ?? 0) === 0
                          ? <Text as="span" size={9} color="var(--ft-green)">PAID</Text>
                          : <span className="pnum">{formatGbp(row[d.id] as number)}</span>}
                      </DataTD>
                    ))}
                    <DataTD noRightBorder mono bold>
                      <span className="pnum">{formatGbp(row.total)}</span>
                    </DataTD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelBox>
      )}
    </div>
  );
}

function csvField(val: string | number | undefined): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function exportDebtsCSV(debts: Array<{ personName: string; description: string; date: string; direction: string; nativeAmount: number; currency: string; gbpEquivalent: number; status: string; notes?: string | null }>) {
  const { shareOrDownload } = await import("@/lib/native-share");
  const header = ["Person", "Description", "Date", "Direction", "Amount", "Currency", "GBP", "Status", "Notes"];
  const lines = [
    header.map(csvField).join(","),
    ...debts.map(d => [
      d.personName,
      d.description,
      d.date,
      d.direction === "i_owe_them" ? "I Owe" : "Owed to Me",
      Math.abs(d.nativeAmount).toFixed(2),
      d.currency,
      d.gbpEquivalent.toFixed(2),
      d.status,
      d.notes ?? "",
    ].map(csvField).join(",")),
  ];
  const BOM = "﻿";
  await shareOrDownload({
    filename: `debts-${new Date().toISOString().slice(0, 10)}.csv`,
    content: BOM + lines.join("\n"),
    mimeType: "text/csv;charset=utf-8;",
    title: "Debts Export",
  });
}

// ── Main Owing page ────────────────────────────────────────────────────────────

export default function Owing() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isMobile = useIsMobile();

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
  const [form, setForm] = useState<DebtForm>(makeEmptyDebtForm);
  const [splitForm, setSplitForm] = useState<SplitBillForm>(EMPTY_SPLIT_FORM);
  const [filter, setFilter] = useState<"all" | "pending" | "settled">("pending");
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("date-newest");
  const [splitSubmitting, setSplitSubmitting] = useState(false);
  const [settleForm, setSettleForm] = useState<SettleFormState | null>(null);
  const [mainTab, setMainTab] = useState<"debts" | "strategy">("debts");

  const [personSearch, setPersonSearch] = useState("");
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
      setForm(makeEmptyDebtForm());
      setLinkStatus("idle");
      setLinkedUser(null);
      const linkedMsg = linkedUser ? ` — ${linkedUser.name} will receive this IOU` : "";
      toast({ title: "Added", description: `${form.direction === "i_owe_them" ? "You owe" : form.personName} recorded.${linkedMsg}` });
      haptic.success();
    } catch {
      toast({ title: "Error", description: "Failed to add entry.", variant: "destructive" });
      haptic.error();
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
      haptic.success();
    } catch {
      toast({ title: "Error", description: "Failed to settle.", variant: "destructive" });
      haptic.error();
    }
  }

  async function handleDelete(id: number) {
    haptic.warning();
    try {
      await deleteDebt.mutateAsync({ id });
      invalidate();
      toast({ title: "Deleted", description: "Entry removed." });
    } catch {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
      haptic.error();
    }
  }

  async function handleReject(id: number, personName: string) {
    try {
      await rejectDebt.mutateAsync(id);
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
            date: new Date().toISOString().slice(0, 10),
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

    if (personSearch.trim()) {
      const q = personSearch.trim().toLowerCase();
      list = list.filter((d) =>
        d.personName.toLowerCase().includes(q) ||
        (d.description ?? "").toLowerCase().includes(q)
      );
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
            <a href="/calendar" style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ft-muted)", textDecoration: "none", padding: "4px 8px", border: "1px solid var(--ft-border)", background: "transparent", whiteSpace: "nowrap" }}>
              → Calendar
            </a>
            <a href="/split" style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ft-muted)", textDecoration: "none", padding: "4px 8px", border: "1px solid var(--ft-border)", background: "transparent", whiteSpace: "nowrap" }}>
              → Group Split
            </a>
            <Button
              size="sm"
              onClick={() => exportDebtsCSV(debts ?? [])}
              disabled={!(debts && debts.length > 0)}
              style={{ background: "var(--ft-raised)", color: "var(--ft-muted)", border: "1px solid var(--ft-border)", height: 30, fontSize: 12, gap: 6 }}
            >
              ↓ CSV
            </Button>
            <Button
              size="sm"
              onClick={() => setSplitOpen(true)}
              style={{ background: "var(--ft-raised)", color: "var(--ft-text)", border: "1px solid var(--ft-border2)", height: 30, fontSize: 12, gap: 6 }}
            >
              <SplitSquareHorizontal className="w-3.5 h-3.5" /> Quick Split
            </Button>
            <Button
              size="sm"
              onClick={() => setOpen(true)}
              style={{ background: "var(--ft-blue)", color: "var(--ft-base)", height: 30, fontSize: 12, gap: 6 }}
            >
              <Plus className="w-3.5 h-3.5" /> Add IOU
            </Button>
          </div>
        }
        mobileActions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setSplitOpen(true)}
              style={{ background: "var(--ft-raised)", color: "var(--ft-text)", border: "1px solid var(--ft-border2)", height: 30, fontSize: 12, gap: 6 }}
            >
              <SplitSquareHorizontal className="w-3.5 h-3.5" /> Split
            </Button>
            <Button
              size="sm"
              onClick={() => setOpen(true)}
              style={{ background: "var(--ft-blue)", color: "var(--ft-base)", height: 30, fontSize: 12, gap: 6 }}
            >
              <Plus className="w-3.5 h-3.5" /> Add IOU
            </Button>
          </div>
        }
      />

      {/* Persona context strip */}
      {(() => {
        const pid = loadPersonaIds()[0];
        if (!pid || pid === "full") return null;
        const netOwed = owedToMeTotal - iOweTotal;
        const msgs: Record<string, string | null> = {
          social:  netOwed > 0
            ? `You're net owed ${formatGbp(netOwed)} — follow up on outstanding splits via Group Split.`
            : netOwed < 0
            ? `You owe ${formatGbp(Math.abs(netOwed))} net — settle soon to keep your social finances clean.`
            : `All square — net balance is zero. Great financial hygiene with your social circle.`,
          budget:  iOweTotal > 0 ? `Outstanding debts of ${formatGbp(iOweTotal)} should be factored into your budget until settled.` : null,
          wealth:  owedToMeTotal > 0 ? `${formatGbp(owedToMeTotal)} outstanding — uncollected debt reduces your effective liquid net worth.` : null,
          market:  null,
        };
        const msg = msgs[pid];
        if (!msg) return null;
        const color = PERSONA_COLORS[pid as keyof typeof PERSONA_COLORS] ?? "var(--ft-accent)";
        return (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", border: "1px solid var(--ft-border)", borderLeft: `3px solid ${color}`, background: "var(--ft-surface)", padding: "7px 14px 7px 10px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color, fontWeight: 700, flexShrink: 0 }}>·</span>
            <span>{msg}</span>
          </div>
        );
      })()}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to load debts.</AlertDescription>
        </Alert>
      )}

      {/* ── Net balance hero ── */}
      <PanelBox
        borderTop={`3px solid ${netPosition !== 0 ? (netPosition >= 0 ? "var(--ft-green)" : "var(--ft-red)") : "var(--ft-border2)"}`}
        padding="16px 20px"
        row
        gap={24}
      >
        <div>
          <MonoLabel letterSpacing="0.1em" mb={6}>Net Position</MonoLabel>
          {summary ? (
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: "-0.02em", color: netPosition !== 0 ? (netPosition >= 0 ? "var(--ft-green)" : "var(--ft-red)") : "var(--ft-muted)", lineHeight: 1 }}>
              <span className="pnum">{netPosition >= 0 ? "+" : ""}{formatGbp(netPosition)}</span>
            </div>
          ) : (
            <Skeleton className="h-8 w-28" />
          )}
          <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", marginTop: 5 }}>
            {netPosition >= 0 ? "net owed to you" : "net you owe"}
          </div>
        </div>

        {!isMobile && <div style={{ width: 1, height: 44, background: "var(--ft-border)", flexShrink: 0 }} />}

        {/* Owed to me */}
        <div>
          <MonoLabel mb={4}>Owed to Me</MonoLabel>
          {summary ? (
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)", color: owedToMeTotal > 0 ? "var(--ft-green)" : "var(--ft-muted)", lineHeight: 1 }}>
              <span className="pnum">{formatGbp(owedToMeTotal)}</span>
            </div>
          ) : (
            <Skeleton className="h-5 w-20" />
          )}
          <div style={{ fontSize: 9, color: "var(--ft-dim)", marginTop: 3, fontFamily: "var(--font-mono)" }}>{theyOwe.length} open</div>
        </div>

        {!isMobile && <div style={{ width: 1, height: 44, background: "var(--ft-border)", flexShrink: 0 }} />}

        {/* I owe */}
        <div>
          <MonoLabel mb={4}>I Owe</MonoLabel>
          {summary ? (
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)", color: iOweTotal > 0 ? "var(--ft-red)" : "var(--ft-muted)", lineHeight: 1 }}>
              <span className="pnum">{formatGbp(iOweTotal)}</span>
            </div>
          ) : (
            <Skeleton className="h-5 w-20" />
          )}
          <div style={{ fontSize: 9, color: "var(--ft-dim)", marginTop: 3, fontFamily: "var(--font-mono)" }}>{iOwe.length} open</div>
        </div>

        {!isMobile && <div style={{ width: 1, height: 44, background: "var(--ft-border)", flexShrink: 0 }} />}

        {/* Settled this month */}
        <div>
          <MonoLabel mb={4}>Settled</MonoLabel>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--ft-blue)", lineHeight: 1 }}>
            {isLoading ? <Skeleton className="h-5 w-12 inline-block" /> : settledThisMonth}
          </div>
          <div style={{ fontSize: 9, color: "var(--ft-dim)", marginTop: 3, fontFamily: "var(--font-mono)" }}>this month</div>
        </div>
      </PanelBox>

      {/* ── First-time empty state ── */}
      {!isLoading && (debts ?? []).length === 0 && (
        <PanelBox padding="40px 24px" style={{ textAlign: "center" }}>
          <pre style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", lineHeight: 1.6, marginBottom: 20 }}>{`  ┌─────────────────────────────────┐
  │   IOU LEDGER                    │
  │                                 │
  │   Person          Amount   Age  │
  │   ──────────────────────────── │
  │   (no entries yet)              │
  │                                 │
  └─────────────────────────────────┘`}</pre>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ft-text)", marginBottom: 6 }}>No IOUs yet</div>
          <div style={{ fontSize: 12, color: "var(--ft-dim)", marginBottom: 20 }}>Track who owes you, what you owe others, and split bills with the tools above.</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <Button size="sm" onClick={() => setSplitOpen(true)} style={{ background: "var(--ft-raised)", color: "var(--ft-text)", border: "1px solid var(--ft-border2)", fontSize: 12 }}>
              <SplitSquareHorizontal className="w-3.5 h-3.5 mr-1.5" /> Split a Bill
            </Button>
            <Button size="sm" onClick={() => setOpen(true)} style={{ background: "var(--ft-blue)", color: "var(--ft-base)", fontSize: 12 }}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add IOU
            </Button>
          </div>
        </PanelBox>
      )}

      {/* ── Main tab bar: DEBTS / STRATEGY ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        borderBottom: "2px solid var(--ft-border)",
        gap: 0,
      }}>
        <button
          onClick={() => { setMainTab("debts"); setDirectionFilter("i-owe"); }}
          style={{
            padding: "5px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: mainTab === "debts" && directionFilter === "i-owe" ? "var(--ft-red)" : "var(--ft-dim)",
            background: "transparent",
            border: "none",
            borderBottom: `2px solid ${mainTab === "debts" && directionFilter === "i-owe" ? "var(--ft-red)" : "transparent"}`,
            marginBottom: -2,
            cursor: "pointer",
            transition: "color 0.1s",
            whiteSpace: "nowrap",
          }}
        >
          I OWE{iOweTotal > 0 ? ` · ${formatGbp(iOweTotal)}` : ""}
        </button>
        <button
          onClick={() => { setMainTab("debts"); setDirectionFilter("owed-to-me"); }}
          style={{
            padding: "5px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: mainTab === "debts" && directionFilter === "owed-to-me" ? "var(--ft-green)" : "var(--ft-dim)",
            background: "transparent",
            border: "none",
            borderBottom: `2px solid ${mainTab === "debts" && directionFilter === "owed-to-me" ? "var(--ft-green)" : "transparent"}`,
            marginBottom: -2,
            cursor: "pointer",
            transition: "color 0.1s",
            whiteSpace: "nowrap",
          }}
        >
          OWED TO ME{owedToMeTotal > 0 ? ` · ${formatGbp(owedToMeTotal)}` : ""}
        </button>
        <button
          onClick={() => { setMainTab("debts"); setDirectionFilter("all"); }}
          style={{
            padding: "5px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: mainTab === "debts" && directionFilter === "all" ? "var(--ft-accent)" : "var(--ft-dim)",
            background: "transparent",
            border: "none",
            borderBottom: `2px solid ${mainTab === "debts" && directionFilter === "all" ? "var(--ft-accent)" : "transparent"}`,
            marginBottom: -2,
            cursor: "pointer",
            transition: "color 0.1s",
          }}
        >
          All IOUs
        </button>
        <button
          onClick={() => setMainTab("strategy")}
          style={{
            padding: "5px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: mainTab === "strategy" ? "var(--ft-accent)" : "var(--ft-dim)",
            background: "transparent",
            border: "none",
            borderBottom: `2px solid ${mainTab === "strategy" ? "var(--ft-accent)" : "transparent"}`,
            marginBottom: -2,
            cursor: "pointer",
            transition: "color 0.1s",
          }}
        >
          Strategy
        </button>
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
                <span className="text-xs ft-hide-mobile" style={{ color: "var(--ft-dim)", whiteSpace: "nowrap" }}>
                  linked by others · read-only
                </span>
              </div>

              <div className="ft-scroll-x" style={{ WebkitOverflowScrolling: "touch" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <DataTH>From</DataTH>
                      <DataTH>Description</DataTH>
                      <DataTH className="ft-hide-mobile">Date</DataTH>
                      <DataTH className="ft-hide-mobile">Direction</DataTH>
                      <DataTH align="right">Amount</DataTH>
                      <DataTH noRightBorder>Actions</DataTH>
                    </tr>
                  </thead>
                  <tbody>
                    {receivedLoading && (
                      Array.from({ length: 2 }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 6 }).map((_, j) => (
                            <DataTD key={j}><Skeleton className="h-3 w-full" /></DataTD>
                          ))}
                        </tr>
                      ))
                    )}
                    {!receivedLoading && (receivedDebts ?? []).length === 0 && (
                      <tr>
                        <DataTD colSpan={6} noRightBorder style={{ textAlign: "center", padding: "20px 12px", color: "var(--ft-dim)" }}>
                          No received IOUs
                        </DataTD>
                      </tr>
                    )}
                    {!receivedLoading && (receivedDebts ?? []).map((d) => (
                      <tr key={d.id}>
                        <DataTD>
                          <div className="flex items-center gap-2">
                            <span
                              className="flex items-center justify-center text-xs font-bold flex-shrink-0"
                              style={{ width: 22, height: 22, borderRadius: 3, background: "rgba(86,182,194,0.15)", color: "var(--ft-cyan, #56b6c2)" }}
                            >
                              {d.personName[0]?.toUpperCase() ?? "?"}
                            </span>
                            <span style={{ color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.personName}</span>
                          </div>
                        </DataTD>
                        <DataTD>
                          {d.description}
                          {d.notes && (
                            <span className="ml-1.5 text-xs" style={{ color: "var(--ft-dim)" }}>· {d.notes}</span>
                          )}
                        </DataTD>
                        <DataTD className="ft-hide-mobile" mono>{formatDate(d.date)}</DataTD>
                        <DataTD className="ft-hide-mobile">
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
                        </DataTD>
                        <DataTD numeric>
                          <span className="pnum">{formatNative(d.nativeAmount, d.currency)}</span>
                        </DataTD>
                        <DataTD noRightBorder>
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
                        </DataTD>
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
                <Text as="span" color="var(--ft-blue)">⬡</Text> Open balances by person
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
                      className="flex items-center justify-center text-xs font-bold"
                      style={{ width: 22, height: 22, borderRadius: 3, background: "var(--ft-raised)", color: "var(--ft-blue)", flexShrink: 0 }}
                    >
                      {name[0].toUpperCase()}
                    </span>
                    <Text as="span" color="var(--ft-text)">{name}</Text>
                    <span className="font-mono font-semibold pnum" style={{ color: net >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
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
            <div className="ft-filter-bar" style={{ background: "var(--ft-surface)", borderBottom: "1px solid var(--ft-border)" }}>
              {/* Row 1: status tabs + count */}
              <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--ft-border)" }}>
                {(["pending", "settled", "all"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      padding: isMobile ? "7px 12px" : "8px 14px",
                      fontSize: isMobile ? 10 : 11,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
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
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 9, color: "var(--ft-dim)", fontFamily: "var(--font-mono)", paddingRight: 10 }}>
                  {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
                </span>
              </div>
              {/* Row 2: direction pills + search + sort */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", flexWrap: isMobile ? "wrap" : "nowrap" }}>
                {/* Direction pills */}
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  {(["all", "i-owe", "owed-to-me"] as const).map((df) => {
                    const labels: Record<DirectionFilter, string> = { all: "All", "i-owe": "I Owe", "owed-to-me": "Owed" };
                    const isActive = directionFilter === df;
                    return (
                      <button
                        key={df}
                        onClick={() => setDirectionFilter(df)}
                        style={{
                          padding: "3px 8px",
                          fontSize: 9,
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
                {/* Person search */}
                <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 80 }}>
                  <input
                    type="search"
                    value={personSearch}
                    onChange={(e) => setPersonSearch(e.target.value)}
                    placeholder="Search person…"
                    className="ft-filter-input"
                    style={{ background: "var(--ft-base)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", fontSize: 10, padding: "3px 8px", borderRadius: 2, outline: "none", width: "100%", fontFamily: "var(--font-mono)" }}
                  />
                  {personSearch && (
                    <button onClick={() => setPersonSearch("")} style={{ background: "none", border: "none", color: "var(--ft-dim)", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1, flexShrink: 0 }}>×</button>
                  )}
                </div>
                {/* Sort */}
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as SortOption)}
                  className="ft-filter-input"
                  style={{ background: "var(--ft-base)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", fontSize: 9, padding: "3px 6px", borderRadius: 2, cursor: "pointer", outline: "none", flexShrink: 0 }}
                >
                  {(Object.keys(SORT_LABELS) as SortOption[]).map((k) => (
                    <option key={k} value={k}>{SORT_LABELS[k]}</option>
                  ))}
                </select>
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
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", minHeight: 44 }}>
                      {/* Avatar — square, not circle */}
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: 3,
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
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.personName}</span>
                          {/* Direction badge */}
                          {d.status === "pending" && (
                            <span style={{
                              fontSize: 8,
                              fontFamily: "var(--font-mono)",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              padding: "1px 5px",
                              borderRadius: 2,
                              fontWeight: 700,
                              background: isIowe ? "rgba(248,81,73,0.1)" : "rgba(63,185,80,0.1)",
                              color: isIowe ? "var(--ft-red)" : "var(--ft-green)",
                              border: isIowe ? "1px solid rgba(248,81,73,0.25)" : "1px solid rgba(63,185,80,0.25)",
                              flexShrink: 0,
                            }}>
                              {isIowe ? "I OWE" : "THEY OWE"}
                            </span>
                          )}
                          {d.linkedUserId && (
                            <span style={{
                              fontSize: 8,
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
                              fontSize: 8,
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
                              fontSize: 8,
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
                        <div style={{ fontSize: 11, color: "var(--ft-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                          {d.description}
                          {d.notes && (
                            <span style={{ color: "var(--ft-dim)", marginLeft: 6 }}>· {d.notes}</span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 1 }}>
                          <span style={{ fontSize: 9, color: "var(--ft-muted)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                            {formatDate(d.date)}
                          </span>
                          <span style={{ fontSize: 9, color: age === "overdue" ? "var(--ft-red)" : age === "old" ? "var(--ft-amber)" : "var(--ft-dim)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                            {daysOld === 0 ? "today" : `${daysOld}d`}
                          </span>
                        </div>
                      </div>

                      {/* Amount + actions */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-mono)", color: amountColor }}>
                          <span className="pnum">{isIowe ? "-" : "+"}{formatGbp(d.gbpEquivalent)}</span>
                        </div>
                        {d.currency !== "GBP" && (
                          <Text as="div" mono size={9} color="var(--ft-dim)">
                            <span className="pnum">{formatNative(d.nativeAmount, d.currency)}</span>
                          </Text>
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
                          of <span className="pnum">{formatGbp(settleForm.fullAmount)}</span>
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
                className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-sm border text-xs font-medium transition-colors"
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
                className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-sm border text-xs font-medium transition-colors"
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
                    key={p}
                    onClick={() => setForm((f) => ({ ...f, description: p }))}
                    className="px-2 py-0.5 rounded-sm text-xs border transition-colors"
                    style={{
                      background: form.description === p ? "rgba(31,111,235,0.15)" : "var(--ft-base)",
                      borderColor: form.description === p ? "rgba(31,111,235,0.5)" : "var(--ft-border2)",
                      color: form.description === p ? "var(--ft-blue)" : "var(--ft-muted)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {p}
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

            <div className="grid grid-cols-2 gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="space-y-1.5">
                <Label style={{ color: "var(--ft-muted)", fontSize: 11 }}>Amount</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={form.nativeAmount}
                  onChange={(e) => setForm((f) => ({ ...f, nativeAmount: e.target.value }))}
                  style={{ ...INPUT_STYLE, width: "100%" }}
                />
              </div>
              <div className="space-y-1.5">
                <Label style={{ color: "var(--ft-muted)", fontSize: 11 }}>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v as Currency }))}>
                  <SelectTrigger style={INPUT_STYLE}>
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
                Link to user <Text as="span" color="var(--ft-dim)">(optional — creates a mirror IOU in their account)</Text>
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
                      <Text as="span" color="var(--ft-dim)">checking...</Text>
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
                      <Text as="span" color="var(--ft-dim)">enter full email</Text>
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
                Account <Text as="span" color="var(--ft-dim)">(optional — adjusts balance when settled)</Text>
              </Label>
              <Select
                value={form.accountId || "__none__"}
                onValueChange={(v) => setForm((f) => ({ ...f, accountId: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger style={INPUT_STYLE}>
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
              style={{ background: "var(--ft-blue)", color: "var(--ft-base)", fontSize: 12 }}
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
                  <SelectTrigger style={INPUT_STYLE}>
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
                    className="px-3 py-1 rounded-sm border text-xs font-medium transition-colors capitalize"
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
                <Text as="span" color="var(--ft-muted)">
                  {splitForm.currency} {splitTotal.toFixed(2)} ÷ {splitForm.people.length} people
                </Text>
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
                <Text as="span" color="var(--ft-muted)">
                  Assigned: {splitForm.currency} {customAssigned.toFixed(2)} / {splitForm.currency} {splitTotal.toFixed(2)}
                </Text>
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
                              ← <span className="pnum">{customRemaining.toFixed(2)}</span>
                            </button>
                          )}
                        </div>
                      )}
                      {splitForm.splitType === "equal" && splitTotal > 0 && (
                        <span className="text-xs font-mono flex-shrink-0" style={{ color: "var(--ft-green)", minWidth: 70, textAlign: "right" }}>
                          {splitForm.currency} <span className="pnum">{perPersonEqual.toFixed(2)}</span>
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
              style={{ background: "var(--ft-blue)", color: "var(--ft-base)", fontSize: 12 }}
            >
              {splitSubmitting ? "Creating…" : `Create ${validPeople.filter((p) => p.name.toLowerCase() !== "me").length} IOU${validPeople.filter((p) => p.name.toLowerCase() !== "me").length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
