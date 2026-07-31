import { useMemo, useState, useEffect, useRef } from "react";
import {
  useListUpcoming,
  useListTransactions,
  useListAccounts,
  useListSubscriptions,
} from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { loadPersonaIds, PERSONA_COLORS } from "@/lib/persona";
import { PageHeader } from "@/components/page-header";
import { TrendingUp } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// ─── types ───────────────────────────────────────────────────────────────────

interface Tx {
  date: string;
  type: string;
  category: string;
  gbpValue: number;
}

interface UpcomingItem {
  dueDate: string;
  description: string;
  category: string;
  type: string;
  gbpEquivalent: number;
  status: string;
}

interface Account {
  gbpEquivalent: number;
}

interface SubForCashflow {
  name: string;
  amount: number;
  frequency: string;
  nextDue?: string;
  active: boolean;
}

type Horizon = 30 | 60 | 90 | 180;
type Scenario = "optimistic" | "base" | "pessimistic";

interface ScenarioMultipliers {
  optimisticIncomeBoost: number;
  optimisticExpenseCut: number;
  pessimisticIncomeCut: number;
  pessimisticExpenseBoost: number;
}

const DEFAULT_MULTIPLIERS: ScenarioMultipliers = {
  optimisticIncomeBoost: 20,
  optimisticExpenseCut: 10,
  pessimisticIncomeCut: 10,
  pessimisticExpenseBoost: 15,
};

const LS_KEY = "numeris:cashflow:multipliers";

function loadMultipliers(): ScenarioMultipliers {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_MULTIPLIERS;
    const parsed = JSON.parse(raw) as Partial<ScenarioMultipliers>;
    return {
      optimisticIncomeBoost: parsed.optimisticIncomeBoost ?? DEFAULT_MULTIPLIERS.optimisticIncomeBoost,
      optimisticExpenseCut: parsed.optimisticExpenseCut ?? DEFAULT_MULTIPLIERS.optimisticExpenseCut,
      pessimisticIncomeCut: parsed.pessimisticIncomeCut ?? DEFAULT_MULTIPLIERS.pessimisticIncomeCut,
      pessimisticExpenseBoost: parsed.pessimisticExpenseBoost ?? DEFAULT_MULTIPLIERS.pessimisticExpenseBoost,
    };
  } catch {
    return DEFAULT_MULTIPLIERS;
  }
}

function saveMultipliers(m: ScenarioMultipliers): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(m));
  } catch {
    // ignore storage errors
  }
}

// ─── style atoms ─────────────────────────────────────────────────────────────

const mono: React.CSSProperties = { fontFamily: "var(--font-mono)" };
const labelStyle: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  color: "var(--ft-dim)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
const card: React.CSSProperties = {
  background: "var(--ft-surface)",
  border: "1px solid var(--ft-border)",
  padding: 20,
  marginBottom: 16,
};
const th: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  color: "var(--ft-dim)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  textAlign: "left",
  padding: "4px 10px",
  fontWeight: 400,
  borderBottom: "1px solid var(--ft-border)",
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  ...mono,
  fontSize: 11,
  color: "var(--ft-text)",
  padding: "7px 10px",
  borderBottom: "1px solid var(--ft-border)",
  whiteSpace: "nowrap",
};

const SCENARIO_COLORS: Record<Scenario, string> = {
  optimistic: "var(--ft-green)",
  base: "var(--ft-accent)",
  pessimistic: "var(--ft-red)",
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatShortDate(str: string): string {
  const d = new Date(str);
  return `${d.getDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]}`;
}

function computeBaseTrend(allTxs: Tx[]): { dailyIncome: number; dailyExpense: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = addDays(today, -90);

  let totalIncome = 0;
  let totalExpense = 0;

  for (const tx of allTxs) {
    const d = new Date(tx.date);
    if (d < cutoff || d > today) continue;
    if (tx.type === "income") totalIncome += Math.abs(tx.gbpValue);
    else if (tx.type === "expense") totalExpense += Math.abs(tx.gbpValue);
  }

  return {
    dailyIncome: totalIncome / 90,
    dailyExpense: totalExpense / 90,
  };
}

// ─── projection engine ───────────────────────────────────────────────────────

const SUB_FREQ_DAYS: Record<string, number> = {
  weekly: 7,
  monthly: 30,
  quarterly: 91,
  annual: 365,
};

function buildProjection(
  startingBalance: number,
  upcomingItems: UpcomingItem[],
  allTxs: Tx[],
  horizonDays: Horizon,
  scenario: Scenario,
  multipliers: ScenarioMultipliers,
  subs: SubForCashflow[],
): { date: string; balance: number; events: string[] }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { dailyIncome: baseDailyIncome, dailyExpense: baseDailyExpense } =
    computeBaseTrend(allTxs);

  let dailyIncome: number;
  let dailyExpense: number;

  switch (scenario) {
    case "optimistic":
      dailyIncome = baseDailyIncome * (1 + multipliers.optimisticIncomeBoost / 100);
      dailyExpense = baseDailyExpense * (1 - multipliers.optimisticExpenseCut / 100);
      break;
    case "pessimistic":
      dailyIncome = baseDailyIncome * (1 - multipliers.pessimisticIncomeCut / 100);
      dailyExpense = baseDailyExpense * (1 + multipliers.pessimisticExpenseBoost / 100);
      break;
    default:
      dailyIncome = baseDailyIncome;
      dailyExpense = baseDailyExpense;
  }

  const dailyNetFlow = dailyIncome - dailyExpense;

  const endDate = addDays(today, horizonDays);
  const endStr = toDateStr(endDate);
  const todayStr = toDateStr(today);
  const upcomingByDate: Record<string, UpcomingItem[]> = {};
  for (const item of upcomingItems) {
    if (item.status !== "pending") continue;
    if (item.dueDate > endStr) continue;
    if (item.dueDate < todayStr) continue;
    if (!upcomingByDate[item.dueDate]) upcomingByDate[item.dueDate] = [];
    upcomingByDate[item.dueDate].push(item);
  }

  const subsByDate: Record<string, Array<{ name: string; amount: number }>> = {};
  for (const sub of subs) {
    if (!sub.active || !sub.nextDue) continue;
    const intervalDays = SUB_FREQ_DAYS[sub.frequency] ?? 30;
    let d = new Date(sub.nextDue);
    d.setHours(0, 0, 0, 0);
    while (toDateStr(d) <= endStr) {
      const ds = toDateStr(d);
      if (ds >= todayStr) {
        if (!subsByDate[ds]) subsByDate[ds] = [];
        subsByDate[ds].push({ name: sub.name, amount: sub.amount });
      }
      d = addDays(d, intervalDays);
    }
  }

  const points: { date: string; balance: number; events: string[] }[] = [];
  let balance = startingBalance;

  for (let i = 0; i <= horizonDays; i++) {
    const d = addDays(today, i);
    const dateStr = toDateStr(d);
    const events: string[] = [];

    if (i > 0) {
      balance += dailyNetFlow;

      const scheduled = upcomingByDate[dateStr] ?? [];
      for (const item of scheduled) {
        const impact =
          item.type === "income" ? item.gbpEquivalent : -item.gbpEquivalent;
        balance += impact;
        events.push(
          `${item.description} ${item.type === "income" ? "+" : "-"}${formatGbp(Math.abs(item.gbpEquivalent))}`
        );
      }

      const subsOnDay = subsByDate[dateStr] ?? [];
      for (const sub of subsOnDay) {
        balance -= sub.amount;
        events.push(`${sub.name} (sub) -${formatGbp(sub.amount)}`);
      }
    }

    points.push({ date: dateStr, balance: Math.round(balance * 100) / 100, events });
  }

  return points;
}

function findBreakEvenDate(
  projection: { date: string; balance: number }[],
): string | null {
  for (let i = 1; i < projection.length; i++) {
    const prev = projection[i - 1];
    const curr = projection[i];
    if (prev && curr && prev.balance >= 0 && curr.balance < 0) {
      return curr.date;
    }
  }
  return null;
}

// ─── module-level sub-components ─────────────────────────────────────────────

interface KpiTileProps {
  label: string;
  value: string;
  color: string;
  accentTop?: string;
  sub?: string | null;
}

function KpiTile({ label, value, color, accentTop, sub }: KpiTileProps) {
  return (
    <div style={{
      background: "var(--ft-surface)",
      padding: "10px 14px",
      borderTop: accentTop ? `2px solid ${accentTop}` : "2px solid transparent",
    }}>
      <div style={{ ...labelStyle, marginBottom: 4 }}>{label}</div>
      <div className="pnum" style={{ ...mono, fontSize: 17, fontWeight: 700, color, letterSpacing: "-0.02em", lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>{sub}</div>
      )}
    </div>
  );
}

interface EventRowProps {
  row: { date: string; balance: number; events: string[] };
}

function EventRow({ row }: EventRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
      style={{
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <td style={{ ...td, color: "var(--ft-dim)", width: 100 }}>
        {formatShortDate(row.date)}
      </td>
      <td style={{ ...td }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {row.events.map((ev, i) => {
            const isIncome = ev.includes("+");
            return (
              <span
                key={i}
                className="pnum"
                style={{
                  color: isIncome ? "var(--ft-green)" : "var(--ft-red)",
                  fontSize: 10,
                }}
              >
                {ev}
              </span>
            );
          })}
        </div>
      </td>
      <td className="pnum" style={{
        ...td,
        textAlign: "right",
        fontWeight: 700,
        color: row.balance >= 0 ? "var(--ft-green)" : "var(--ft-red)",
      }}>
        {formatGbp(row.balance)}
      </td>
    </tr>
  );
}

function MultiplierInput({
  label: labelText,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [localVal, setLocalVal] = useState(String(value));

  useEffect(() => {
    setLocalVal(String(value));
  }, [value]);

  const commit = () => {
    const n = parseFloat(localVal);
    if (!isNaN(n) && n >= 0 && n <= 100) {
      onChange(n);
    } else {
      setLocalVal(String(value));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ ...labelStyle, fontSize: 8 }}>{labelText}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={localVal}
          onChange={(e) => setLocalVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
          style={{
            ...mono,
            width: 48,
            padding: "3px 6px",
            fontSize: 11,
            background: "var(--ft-raised)",
            border: "1px solid var(--ft-border2)",
            borderRadius: 2,
            color: "var(--ft-text)",
            outline: "none",
            textAlign: "right",
          }}
        />
        <span style={{ ...mono, fontSize: 10, color: "var(--ft-dim)" }}>%</span>
      </div>
    </div>
  );
}

function CfTooltip({ active, payload, label: dateLbl }: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const bal = payload[0].value;
  return (
    <div style={{
      background: "var(--ft-raised)",
      border: "1px solid var(--ft-border)",
      padding: "8px 12px",
      fontFamily: "var(--font-mono)",
      fontSize: 11,
    }}>
      <div style={{ color: "var(--ft-dim)", fontSize: 9, marginBottom: 4 }}>{dateLbl}</div>
      <div className="pnum" style={{ color: bal >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 700, fontSize: 13 }}>
        {formatGbp(bal)}
      </div>
    </div>
  );
}

interface ScenarioLegendItemProps {
  s: Scenario;
  multipliers: ScenarioMultipliers;
}

function ScenarioLegendItem({ s, multipliers }: ScenarioLegendItemProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 24, height: 2, background: SCENARIO_COLORS[s] }} />
      <span style={{ ...mono, fontSize: 10, color: SCENARIO_COLORS[s] }}>
        {s === "optimistic"
          ? `Optimistic (income +${multipliers.optimisticIncomeBoost}%, spend -${multipliers.optimisticExpenseCut}%)`
          : s === "pessimistic"
          ? `Pessimistic (income -${multipliers.pessimisticIncomeCut}%, spend +${multipliers.pessimisticExpenseBoost}%)`
          : "Base (3-month avg trend)"}
      </span>
    </div>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function CashflowPage() {
  const [horizon, setHorizon] = useState<Horizon>(30);
  const [scenario, setScenario] = useState<Scenario>("base");
  const [showSettings, setShowSettings] = useState(false);
  const [multipliers, setMultipliers] = useState<ScenarioMultipliers>(loadMultipliers);
  const settingsRef = useRef<HTMLDivElement>(null);

  const { data: rawUpcoming, isLoading: loadingUp } = useListUpcoming();
  const { data: rawTxs, isLoading: loadingTx } = useListTransactions({});
  const { data: rawAccounts, isLoading: loadingAcc } = useListAccounts();
  const { data: rawSubs = [] } = useListSubscriptions();

  const isLoading = loadingUp || loadingTx || loadingAcc;

  const upcoming = (rawUpcoming ?? []) as UpcomingItem[];
  const allTxs = (rawTxs ?? []) as Tx[];
  const accounts = (rawAccounts ?? []) as Account[];
  const activeSubs = useMemo(
    () => (rawSubs as SubForCashflow[]).filter((s) => s.active && s.nextDue),
    [rawSubs]
  );

  const startingBalance = useMemo(
    () => accounts.reduce((s, a) => s + (a.gbpEquivalent ?? 0), 0),
    [accounts]
  );

  const projection = useMemo(
    () => buildProjection(startingBalance, upcoming, allTxs, horizon, scenario, multipliers, activeSubs),
    [startingBalance, upcoming, allTxs, horizon, scenario, multipliers, activeSubs]
  );

  const { dailyIncome: baseDailyIncome, dailyExpense: baseDailyExpense } = useMemo(
    () => computeBaseTrend(allTxs),
    [allTxs]
  );
  const baseMonthlyNet = (baseDailyIncome - baseDailyExpense) * 30;

  const finalBalance = projection[projection.length - 1]?.balance ?? startingBalance;
  const lowestPoint = projection.reduce(
    (min, p) => Math.min(min, p.balance),
    Infinity
  );
  const highestPoint = projection.reduce(
    (max, p) => Math.max(max, p.balance),
    -Infinity
  );

  const breakEvenDate = useMemo(() => findBreakEvenDate(projection), [projection]);

  const eventRows = projection.filter((p) => p.events.length > 0);

  const scenarioColor = SCENARIO_COLORS[scenario];

  useEffect(() => {
    saveMultipliers(multipliers);
  }, [multipliers]);

  const updateMultiplier = (key: keyof ScenarioMultipliers) => (v: number) => {
    setMultipliers((prev) => ({ ...prev, [key]: Math.max(0, Math.min(100, v)) }));
  };

  if (isLoading) {
    return (
      <div style={{ ...mono, fontSize: 11, color: "var(--ft-dim)", padding: "40px 0", textAlign: "center" }}>
        Loading cash flow data…
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div>
        <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 20 }}>
          CASH FLOW FORECAST
        </div>
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderLeft: "3px solid var(--ft-accent)", padding: "48px 24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 16, minHeight: "calc(100vh - 160px)", justifyContent: "center" }}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ opacity: 0.25 }}>
            <path d="M8 36L18 24l8 8 8-12 6 6" stroke="var(--ft-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="8" cy="36" r="2" fill="var(--ft-text)" />
            <circle cx="18" cy="24" r="2" fill="var(--ft-text)" />
            <circle cx="26" cy="32" r="2" fill="var(--ft-text)" />
            <circle cx="34" cy="20" r="2" fill="var(--ft-text)" />
            <circle cx="40" cy="26" r="2" fill="var(--ft-text)" />
          </svg>
          <div>
            <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: "var(--ft-text)", marginBottom: 8 }}>
              Add an account to see your cash flow forecast
            </div>
            <div style={{ ...mono, fontSize: 10, color: "var(--ft-dim)", maxWidth: 340, lineHeight: 1.7, margin: "0 auto" }}>
              Cash flow projections use your account balances, upcoming bills, and 3-month spending average to show where your money is headed.
            </div>
          </div>
          <a
            href="/accounts"
            style={{ display: "inline-block", padding: "10px 20px", background: "var(--ft-accent)", color: "var(--ft-base)", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textDecoration: "none", minHeight: 44, lineHeight: "24px" }}
          >
            + ADD ACCOUNT
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        icon={TrendingUp}
        title="Cash Flow Forecast"
        subtitle="projected balances · 3-month avg income/expense trend + scheduled bills"
        actions={
          <div className="ft-filter-bar" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Horizon selector */}
          <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {([30, 60, 90, 180] as Horizon[]).map((h) => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                style={{
                  ...mono,
                  fontSize: 9,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "4px 8px",
                  cursor: "pointer",
                  border: "1px solid var(--ft-border)",
                  background: horizon === h ? "var(--ft-accent)" : "var(--ft-surface)",
                  color: horizon === h ? "var(--ft-base)" : "var(--ft-muted)",
                  fontWeight: horizon === h ? 700 : 400,
                }}
              >
                {h}d
              </button>
            ))}
          </div>
          {/* Scenario selector */}
          <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {(["optimistic", "base", "pessimistic"] as Scenario[]).map((s) => (
              <button
                key={s}
                onClick={() => setScenario(s)}
                style={{
                  ...mono,
                  fontSize: 9,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "4px 8px",
                  cursor: "pointer",
                  border: `1px solid ${scenario === s ? SCENARIO_COLORS[s] : "var(--ft-border)"}`,
                  background: scenario === s ? SCENARIO_COLORS[s] + "22" : "var(--ft-surface)",
                  color: scenario === s ? SCENARIO_COLORS[s] : "var(--ft-muted)",
                  fontWeight: scenario === s ? 700 : 400,
                }}
              >
                {s === "optimistic"
                  ? `OPT +${multipliers.optimisticIncomeBoost}%/-${multipliers.optimisticExpenseCut}%`
                  : s === "pessimistic"
                  ? `PESS -${multipliers.pessimisticIncomeCut}%/+${multipliers.pessimisticExpenseBoost}%`
                  : "BASE"}
              </button>
            ))}
          </div>
          {/* Scenario settings toggle */}
          <button
            onClick={() => setShowSettings((v) => !v)}
            style={{
              ...mono,
              fontSize: 9,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "4px 8px",
              cursor: "pointer",
              border: `1px solid ${showSettings ? "rgba(244,162,30,0.4)" : "var(--ft-border)"}`,
              background: showSettings ? "rgba(244,162,30,0.1)" : "var(--ft-surface)",
              color: showSettings ? "var(--ft-accent)" : "var(--ft-muted)",
            }}
          >
            ⚙ Multipliers
          </button>
        </div>}
      />

      {/* Editable scenario multipliers panel */}
      {showSettings && (
        <div
          ref={settingsRef}
          style={{
            ...card,
            marginBottom: 12,
            padding: "14px 20px",
            borderColor: "rgba(244,162,30,0.3)",
            borderLeft: "3px solid var(--ft-amber)",
            background: "rgba(244,162,30,0.04)",
          }}
        >
          <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--ft-accent)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>
            SCENARIO MULTIPLIERS
          </div>
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div>
              <div style={{ ...mono, fontSize: 9, color: "var(--ft-green)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                Optimistic
              </div>
              <div style={{ display: "flex", gap: 20 }}>
                <MultiplierInput label="Income boost" value={multipliers.optimisticIncomeBoost} onChange={updateMultiplier("optimisticIncomeBoost")} />
                <MultiplierInput label="Expense cut" value={multipliers.optimisticExpenseCut} onChange={updateMultiplier("optimisticExpenseCut")} />
              </div>
            </div>
            <div style={{ width: 1, background: "var(--ft-border)", alignSelf: "stretch" }} />
            <div>
              <div style={{ ...mono, fontSize: 9, color: "var(--ft-red)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                Pessimistic
              </div>
              <div style={{ display: "flex", gap: 20 }}>
                <MultiplierInput label="Income cut" value={multipliers.pessimisticIncomeCut} onChange={updateMultiplier("pessimisticIncomeCut")} />
                <MultiplierInput label="Expense boost" value={multipliers.pessimisticExpenseBoost} onChange={updateMultiplier("pessimisticExpenseBoost")} />
              </div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>
                Base: 3-month avg net/day = <span className="pnum" style={{ color: baseMonthlyNet >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                  {baseMonthlyNet >= 0 ? "+" : ""}{formatGbp(baseMonthlyNet)}/mo
                </span>
              </div>
              <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>
                Avg income: <span className="pnum" style={{ color: "var(--ft-green)" }}>+{formatGbp(baseDailyIncome * 30)}/mo</span>
              </div>
              <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>
                Avg expense: <span className="pnum" style={{ color: "var(--ft-red)" }}>-{formatGbp(baseDailyExpense * 30)}/mo</span>
              </div>
              <button
                onClick={() => setMultipliers(DEFAULT_MULTIPLIERS)}
                style={{
                  ...mono,
                  fontSize: 9,
                  color: "var(--ft-dim)",
                  background: "var(--ft-raised)",
                  border: "1px solid var(--ft-border)",
                  borderRadius: 2,
                  padding: "3px 8px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                Reset to defaults
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persona context strip */}
      {(() => {
        const pid = loadPersonaIds()[0];
        if (!pid || pid === "full") return null;
        const isNegativeTrend = baseMonthlyNet < 0;
        const msgs: Record<string, string> = {
          market:  isNegativeTrend
            ? `Monthly net is negative — shore up cash flow before deploying to investment positions.`
            : `Monthly net +${formatGbp(baseMonthlyNet)}: ${horizon}d forecast shows investable surplus trajectory.`,
          budget:  isNegativeTrend
            ? `Spending exceeds income on trend — use the scenario toggles to model expense cuts.`
            : `On track. Use pessimistic scenario to stress-test your budget against unexpected costs.`,
          wealth:  `Model optimistic and pessimistic scenarios to understand your savings rate range over the forecast period.`,
          social:  `Upcoming shared expenses (trips, gifts, deposits) are captured in the events table below.`,
        };
        const msg = msgs[pid];
        if (!msg) return null;
        const color = PERSONA_COLORS[pid as keyof typeof PERSONA_COLORS] ?? "var(--ft-accent)";
        return (
          <div style={{ ...mono, fontSize: 10, color: "var(--ft-dim)", border: "1px solid var(--ft-border)", borderLeft: `3px solid ${color}`, background: "var(--ft-surface)", padding: "7px 14px 7px 10px", marginBottom: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color, fontWeight: 700, flexShrink: 0 }}>·</span>
            <span>{msg}</span>
          </div>
        );
      })()}

      {/* KPI strip section header */}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", borderLeft: "3px solid var(--ft-cyan)", paddingLeft: 8, marginBottom: 8 }}>
        Balance Metrics
      </div>

      {/* KPI strip (border-as-gap grid) */}
      <div
        className="ft-kpi-bar"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 1,
          marginBottom: 16,
          background: "var(--ft-border)",
        }}
      >
        <KpiTile
          label="Today's Balance"
          value={formatGbp(startingBalance)}
          color="var(--ft-text)"
          accentTop="var(--ft-cyan)"
        />
        <KpiTile
          label={`Projected (${horizon}d)`}
          value={formatGbp(finalBalance)}
          color={finalBalance >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
          accentTop={finalBalance >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
          sub={finalBalance !== startingBalance ? `${finalBalance >= startingBalance ? "+" : ""}${formatGbp(finalBalance - startingBalance)} change` : null}
        />
        <KpiTile
          label="Avg Net / Month"
          value={`${baseMonthlyNet >= 0 ? "+" : ""}${formatGbp(Math.abs(baseMonthlyNet))}`}
          color={baseMonthlyNet >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
          accentTop={baseMonthlyNet >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
          sub={`${baseDailyIncome > 0 ? `in ${formatGbp(baseDailyIncome * 30)}/mo` : "no income"} · out ${formatGbp(baseDailyExpense * 30)}/mo`}
        />
        <KpiTile
          label="Lowest Point"
          value={formatGbp(lowestPoint === Infinity ? 0 : lowestPoint)}
          color={lowestPoint < 0 ? "var(--ft-red)" : "var(--ft-muted)"}
          accentTop={lowestPoint < 0 ? "var(--ft-red)" : undefined}
          sub={lowestPoint < 0 ? "dips below zero" : null}
        />
        <KpiTile
          label="Highest Point"
          value={formatGbp(highestPoint === -Infinity ? 0 : highestPoint)}
          color="var(--ft-green)"
          accentTop="var(--ft-green)"
        />
      </div>

      {/* Projected final balance — big number */}
      <div style={{
        ...card,
        display: "flex",
        alignItems: "center",
        gap: 24,
        padding: "16px 20px",
        flexWrap: "wrap",
        borderLeft: `3px solid ${scenarioColor}`,
      }}>
        <div>
          <div style={{ ...labelStyle, marginBottom: 4 }}>PROJECTED FINAL BALANCE · {horizon}D · {scenario.toUpperCase()}</div>
          <div className="pnum" style={{
            ...mono,
            fontSize: 36,
            fontWeight: 700,
            color: finalBalance >= 0 ? "var(--ft-green)" : "var(--ft-red)",
            letterSpacing: "-0.03em",
            lineHeight: 1,
          }}>
            {formatGbp(finalBalance)}
          </div>
          <div style={{ ...mono, fontSize: 10, color: "var(--ft-dim)", marginTop: 4 }}>
            <span className="pnum">{finalBalance >= startingBalance
              ? `+${formatGbp(finalBalance - startingBalance)}`
              : `${formatGbp(finalBalance - startingBalance)}`}</span> vs today
          </div>
        </div>

        {breakEvenDate && (
          <div style={{
            background: "var(--ft-red)15",
            border: "1px solid var(--ft-red)44",
            borderLeft: "3px solid var(--ft-red)",
            padding: "10px 16px",
          }}>
            <div style={{ ...labelStyle, color: "var(--ft-red)", marginBottom: 4 }}>BREAK-EVEN DATE</div>
            <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: "var(--ft-red)" }}>
              {formatShortDate(breakEvenDate)}
            </div>
            <div style={{ ...mono, fontSize: 9, color: "var(--ft-red)", marginTop: 2, opacity: 0.75 }}>
              Balance crosses zero
            </div>
          </div>
        )}

        {lowestPoint < 0 && (
          <div style={{
            background: "var(--ft-red)15",
            border: "1px solid var(--ft-red)44",
            borderLeft: "3px solid var(--ft-red)",
            padding: "10px 16px",
            marginLeft: breakEvenDate ? 0 : "auto",
          }}>
            <div style={{ ...labelStyle, color: "var(--ft-red)", marginBottom: 4 }}>WARNING — BALANCE GOES NEGATIVE</div>
            <div style={{ ...mono, fontSize: 12, color: "var(--ft-red)" }}>
              Lowest projected: <span className="pnum">{formatGbp(lowestPoint)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Area chart */}
      <div style={card}>
        <div style={{ ...mono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", borderLeft: "3px solid var(--ft-accent)", paddingLeft: 8, marginBottom: 12 }}>
          <span style={{ fontWeight: 700, color: "var(--ft-accent)" }}>BALANCE PROJECTION</span>
          <span style={{ color: "var(--ft-dim)", marginLeft: 12, fontSize: 8 }}>Day-by-day projected cumulative balance · based on 3-month avg trend</span>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={projection} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="cfGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={scenarioColor} stopOpacity={0.3} />
                <stop offset="100%" stopColor={scenarioColor} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="dangerGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--ft-red)" stopOpacity={0.15} />
                <stop offset="100%" stopColor="var(--ft-red)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ft-border)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
              axisLine={false}
              tickLine={false}
              interval={Math.floor(horizon / 6)}
            />
            <YAxis
              tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)", className: "pnum" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CfTooltip />} />
            <ReferenceLine
              y={0}
              stroke="var(--ft-red)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              label={{
                value: "£0",
                position: "right",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fill: "var(--ft-red)",
                className: "pnum",
              }}
            />
            {breakEvenDate && (
              <ReferenceLine
                x={breakEvenDate}
                stroke="var(--ft-red)"
                strokeWidth={1}
                strokeDasharray="2 4"
                label={{
                  value: `Break-even: ${formatShortDate(breakEvenDate)}`,
                  position: "top",
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  fill: "var(--ft-red)",
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="balance"
              stroke={scenarioColor}
              strokeWidth={2}
              fill="url(#cfGrad)"
              dot={false}
              activeDot={{ r: 4, fill: scenarioColor, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Events table */}
      <div style={card}>
        <div style={{ ...mono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", borderLeft: "3px solid var(--ft-blue)", paddingLeft: 8, marginBottom: 12 }}>
          <span style={{ fontWeight: 700, color: "var(--ft-accent)" }}>SCHEDULED EVENTS</span>
          <span style={{ color: "var(--ft-dim)", marginLeft: 12, fontSize: 8 }}>Upcoming bills and income within the {horizon}-day horizon</span>
        </div>
        {eventRows.length === 0 ? (
          <div style={{
            border: "1px solid var(--ft-border)",
            borderLeft: "3px solid var(--ft-border2)",
            background: "var(--ft-surface)",
            padding: "24px 20px",
            fontFamily: "var(--font-mono)",
          }}>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 4 }}>
              NO SCHEDULED EVENTS
            </div>
            <div style={{ fontSize: 10, color: "var(--ft-muted)", lineHeight: 1.6 }}>
              No bills, income, or subscription renewals detected in this {horizon}-day window.
            </div>
          </div>
        ) : (
          <div className="ft-scroll-x">
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 360 }}>
              <thead>
                <tr>
                  {["Date", "Description", "Balance After"].map((h, i) => (
                    <th key={h} style={{ ...th, textAlign: i === 2 ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eventRows.map((row) => (
                  <EventRow key={row.date} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Scenario legend */}
      <div style={{ ...card, padding: "12px 16px", display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ ...labelStyle, borderLeft: "3px solid var(--ft-border2)", paddingLeft: 6 }}>SCENARIOS:</div>
        {(["optimistic", "base", "pessimistic"] as Scenario[]).map((s) => (
          <ScenarioLegendItem key={s} s={s} multipliers={multipliers} />
        ))}
        <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", marginLeft: "auto" }}>
          Variable trend based on 3-month avg · scheduled items use exact amounts
        </div>
      </div>
    </div>
  );
}
