import { useMemo, useState, useEffect, useRef } from "react";
import {
  useListUpcoming,
  useListTransactions,
  useListAccounts,
} from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
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

type Horizon = 30 | 60 | 90 | 180;
type Scenario = "optimistic" | "base" | "pessimistic";

interface ScenarioMultipliers {
  optimisticIncomeBoost: number;   // e.g. 20 means +20% income
  optimisticExpenseCut: number;    // e.g. 10 means -10% expenses
  pessimisticIncomeCut: number;    // e.g. 10 means -10% income
  pessimisticExpenseBoost: number; // e.g. 15 means +15% expenses
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
const label: React.CSSProperties = {
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

/**
 * Compute the average monthly income and expense from the last 3 months of
 * transaction history. Returns daily averages.
 */
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

function buildProjection(
  startingBalance: number,
  upcomingItems: UpcomingItem[],
  allTxs: Tx[],
  horizonDays: Horizon,
  scenario: Scenario,
  multipliers: ScenarioMultipliers,
): { date: string; balance: number; events: string[] }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Derive base daily income/expense from last 3 months of real data
  const { dailyIncome: baseDailyIncome, dailyExpense: baseDailyExpense } =
    computeBaseTrend(allTxs);

  // Apply scenario adjustments
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
    default: // base
      dailyIncome = baseDailyIncome;
      dailyExpense = baseDailyExpense;
  }

  const dailyNetFlow = dailyIncome - dailyExpense;

  // Index upcoming items by date within horizon
  const endDate = addDays(today, horizonDays);
  const endStr = toDateStr(endDate);
  const upcomingByDate: Record<string, UpcomingItem[]> = {};
  for (const item of upcomingItems) {
    if (item.status !== "pending") continue;
    if (item.dueDate > endStr) continue;
    if (item.dueDate < toDateStr(today)) continue;
    if (!upcomingByDate[item.dueDate]) upcomingByDate[item.dueDate] = [];
    upcomingByDate[item.dueDate].push(item);
  }

  // Build day-by-day
  const points: { date: string; balance: number; events: string[] }[] = [];
  let balance = startingBalance;

  for (let i = 0; i <= horizonDays; i++) {
    const d = addDays(today, i);
    const dateStr = toDateStr(d);
    const events: string[] = [];

    if (i > 0) {
      // Apply daily net trend (income - expenses)
      balance += dailyNetFlow;

      // Apply scheduled items
      const scheduled = upcomingByDate[dateStr] ?? [];
      for (const item of scheduled) {
        const impact =
          item.type === "income" ? item.gbpEquivalent : -item.gbpEquivalent;
        balance += impact;
        events.push(
          `${item.description} ${item.type === "income" ? "+" : "-"}${formatGbp(Math.abs(item.gbpEquivalent))}`
        );
      }
    }

    points.push({ date: dateStr, balance: Math.round(balance * 100) / 100, events });
  }

  return points;
}

/**
 * Find the first date index where balance crosses zero (from positive to negative).
 * Returns null if the balance never goes negative.
 */
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

// ─── editable multiplier input ────────────────────────────────────────────────

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
      <span style={{ ...label, fontSize: 8 }}>{labelText}</span>
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

// ─── custom tooltip ──────────────────────────────────────────────────────────

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
      <div style={{ color: bal >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 700, fontSize: 13 }}>
        {formatGbp(bal)}
      </div>
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

  const isLoading = loadingUp || loadingTx || loadingAcc;

  const upcoming = (rawUpcoming ?? []) as UpcomingItem[];
  const allTxs = (rawTxs ?? []) as Tx[];
  const accounts = (rawAccounts ?? []) as Account[];

  const startingBalance = useMemo(
    () => accounts.reduce((s, a) => s + (a.gbpEquivalent ?? 0), 0),
    [accounts]
  );

  const projection = useMemo(
    () => buildProjection(startingBalance, upcoming, allTxs, horizon, scenario, multipliers),
    [startingBalance, upcoming, allTxs, horizon, scenario, multipliers]
  );

  // Compute base trend stats for display
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

  // Break-even date (only relevant when pessimistic or balance trends negative)
  const breakEvenDate = useMemo(() => findBreakEvenDate(projection), [projection]);

  // Events table: only days with scheduled items
  const eventRows = projection.filter((p) => p.events.length > 0);

  const scenarioColor = SCENARIO_COLORS[scenario];

  // Persist multipliers to localStorage whenever they change
  useEffect(() => {
    saveMultipliers(multipliers);
  }, [multipliers]);

  const updateMultiplier = (key: keyof ScenarioMultipliers) => (v: number) => {
    setMultipliers((prev) => ({ ...prev, [key]: v }));
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
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "48px 32px", textAlign: "center" }}>
          <div style={{ ...mono, fontSize: 11, color: "var(--ft-accent)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
            NO ACCOUNTS FOUND
          </div>
          <div style={{ ...mono, fontSize: 13, color: "var(--ft-text)", fontWeight: 700, marginBottom: 8 }}>
            Add an account to see your cash flow forecast
          </div>
          <div style={{ ...mono, fontSize: 10, color: "var(--ft-dim)", maxWidth: 380, margin: "0 auto" }}>
            Cash flow projections are based on your current account balances, upcoming bills, and your average income/spending over the last 3 months.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1 }}>
            CASH FLOW FORECAST
          </div>
          <div style={{ ...mono, fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.04em", marginTop: 4 }}>
            projected balances · based on 3-month avg income/expense trend + scheduled bills
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Horizon selector */}
          <div style={{ display: "flex", gap: 2 }}>
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
          <div style={{ display: "flex", gap: 2 }}>
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
        </div>
      </div>

      {/* Editable scenario multipliers panel */}
      {showSettings && (
        <div
          ref={settingsRef}
          style={{
            ...card,
            marginBottom: 12,
            padding: "14px 20px",
            borderColor: "rgba(244,162,30,0.3)",
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
                <MultiplierInput
                  label="Income boost"
                  value={multipliers.optimisticIncomeBoost}
                  onChange={updateMultiplier("optimisticIncomeBoost")}
                />
                <MultiplierInput
                  label="Expense cut"
                  value={multipliers.optimisticExpenseCut}
                  onChange={updateMultiplier("optimisticExpenseCut")}
                />
              </div>
            </div>
            <div style={{ width: 1, background: "var(--ft-border)", alignSelf: "stretch" }} />
            <div>
              <div style={{ ...mono, fontSize: 9, color: "var(--ft-red)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                Pessimistic
              </div>
              <div style={{ display: "flex", gap: 20 }}>
                <MultiplierInput
                  label="Income cut"
                  value={multipliers.pessimisticIncomeCut}
                  onChange={updateMultiplier("pessimisticIncomeCut")}
                />
                <MultiplierInput
                  label="Expense boost"
                  value={multipliers.pessimisticExpenseBoost}
                  onChange={updateMultiplier("pessimisticExpenseBoost")}
                />
              </div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>
                Base: 3-month avg net/day = <span style={{ color: baseMonthlyNet >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                  {baseMonthlyNet >= 0 ? "+" : ""}{formatGbp(baseMonthlyNet)}/mo
                </span>
              </div>
              <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>
                Avg income: <span style={{ color: "var(--ft-green)" }}>+{formatGbp(baseDailyIncome * 30)}/mo</span>
              </div>
              <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>
                Avg expense: <span style={{ color: "var(--ft-red)" }}>-{formatGbp(baseDailyExpense * 30)}/mo</span>
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

      {/* KPI strip */}
      <div className="ft-four-col" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
        {[
          {
            label: "Starting Balance",
            value: formatGbp(startingBalance),
            color: "var(--ft-text)",
          },
          {
            label: `Projected (${horizon}d)`,
            value: formatGbp(finalBalance),
            color: finalBalance >= 0 ? "var(--ft-green)" : "var(--ft-red)",
          },
          {
            label: "Lowest Point",
            value: formatGbp(lowestPoint === Infinity ? 0 : lowestPoint),
            color: lowestPoint < 0 ? "var(--ft-red)" : "var(--ft-muted)",
          },
          {
            label: "Highest Point",
            value: formatGbp(highestPoint === -Infinity ? 0 : highestPoint),
            color: "var(--ft-green)",
          },
        ].map((tile) => (
          <div
            key={tile.label}
            style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "12px 14px" }}
          >
            <div style={{ ...label, marginBottom: 6 }}>{tile.label}</div>
            <div className="pnum" style={{ ...mono, fontSize: 18, fontWeight: 700, color: tile.color, letterSpacing: "-0.02em" }}>
              {tile.value}
            </div>
          </div>
        ))}
      </div>

      {/* Projected final balance — big number */}
      <div style={{
        ...card,
        display: "flex",
        alignItems: "center",
        gap: 24,
        padding: "16px 20px",
      }}>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>PROJECTED FINAL BALANCE · {horizon}D · {scenario.toUpperCase()}</div>
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
            padding: "10px 16px",
          }}>
            <div style={{ ...label, color: "var(--ft-red)", marginBottom: 4 }}>BREAK-EVEN DATE</div>
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
            padding: "10px 16px",
            marginLeft: breakEvenDate ? 0 : "auto",
          }}>
            <div style={{ ...label, color: "var(--ft-red)", marginBottom: 4 }}>WARNING — BALANCE GOES NEGATIVE</div>
            <div style={{ ...mono, fontSize: 12, color: "var(--ft-red)" }}>
              Lowest projected: <span className="pnum">{formatGbp(lowestPoint)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Area chart */}
      <div style={card}>
        <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--ft-accent)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>
          BALANCE PROJECTION
        </div>
        <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em", marginBottom: 14 }}>
          Day-by-day projected cumulative balance · based on 3-month avg trend
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
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--ft-border)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
              axisLine={false}
              tickLine={false}
              interval={Math.floor(horizon / 6)}
            />
            <YAxis
              tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
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
        <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--ft-accent)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>
          SCHEDULED EVENTS
        </div>
        <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em", marginBottom: 14 }}>
          Upcoming bills and income within the {horizon}-day horizon
        </div>
        {eventRows.length === 0 ? (
          <div style={{ ...label, textAlign: "center", padding: "24px 0" }}>
            No scheduled events in this period
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {["Date", "Description", "Balance After"].map((h, i) => (
                    <th key={h} style={{ ...th, textAlign: i === 2 ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eventRows.map((row) => (
                  <tr key={row.date}>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Scenario legend */}
      <div style={{ ...card, padding: "12px 16px", display: "flex", gap: 24, alignItems: "center" }}>
        <div style={{ ...label }}>SCENARIOS:</div>
        {(["optimistic", "base", "pessimistic"] as Scenario[]).map((s) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 24, height: 2, background: SCENARIO_COLORS[s] }} />
            <span style={{ ...mono, fontSize: 10, color: SCENARIO_COLORS[s] }}>
              {s === "optimistic"
                ? `Optimistic (income +${multipliers.optimisticIncomeBoost}%, spend -${multipliers.optimisticExpenseCut}%)`
                : s === "pessimistic"
                ? `Pessimistic (income -${multipliers.pessimisticIncomeCut}%, spend +${multipliers.pessimisticExpenseBoost}%)`
                : "Base (3-month avg trend)"}
            </span>
          </div>
        ))}
        <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", marginLeft: "auto" }}>
          Variable trend based on 3-month avg · scheduled items use exact amounts
        </div>
      </div>
    </div>
  );
}
