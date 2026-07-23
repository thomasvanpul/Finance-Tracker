import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useListTransactions } from "@workspace/api-client-react";
import { Skeleton as FtSkeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { formatGbp } from "@/lib/utils";
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from "recharts";

// ─── shared tooltip style ────────────────────────────────────────────────────

const monoTooltipStyle: React.CSSProperties = {
  background: "var(--ft-surface)",
  border: "1px solid var(--ft-border)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  boxShadow: "none",
  padding: "6px 10px",
};

type TooltipEntry = { name?: string | number; value?: number | string | (number | string)[]; color?: string };

function MonoTooltip({ active, payload, label, formatter }: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  formatter?: (value: number, name: string) => [string, string];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={monoTooltipStyle}>
      {label && (
        <div style={{ fontSize: 9, color: "var(--ft-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {label}
        </div>
      )}
      {payload.map((entry, i) => {
        const rawVal = typeof entry.value === "number" ? entry.value : 0;
        const name = String(entry.name ?? "");
        const [displayVal, displayName] = formatter ? formatter(rawVal, name) : [formatGbp(rawVal), name];
        return (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {entry.color && (
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: entry.color, flexShrink: 0 }} />
            )}
            {displayName && <span style={{ color: "var(--ft-dim)", fontSize: 9 }}>{displayName}</span>}
            <span style={{ color: "var(--ft-text)", fontWeight: 700 }}>{displayVal}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── custom dot renderer for line charts ─────────────────────────────────────

function LineDot(props: { cx?: number; cy?: number; stroke?: string }) {
  const { cx, cy, stroke } = props;
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={3} fill={stroke ?? "var(--ft-accent)"} stroke="none" />;
}

// ─── helpers ────────────────────────────────────────────────────────────────

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getYYYYMM(d: string) { return d.slice(0, 7); }
function getDOW(d: string) { const w = new Date(d).getDay(); return w === 0 ? 6 : w - 1; }
function getWeekOfMonth(d: string) { return Math.min(Math.floor((new Date(d).getDate() - 1) / 7), 4); }

function monthsAgoStr(n: number): string {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function pctChange(prev: number, curr: number) {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
}

function cutoffDate(range: Range): Date {
  const now = new Date();
  if (range === "30d") { const d = new Date(now); d.setDate(d.getDate() - 30); return d; }
  if (range === "3m") { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d; }
  if (range === "6m") { const d = new Date(now); d.setMonth(d.getMonth() - 6); return d; }
  if (range === "12m") { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d; }
  return new Date(0);
}

// ─── shared style atoms ──────────────────────────────────────────────────────

const mono: React.CSSProperties = { fontFamily: "var(--font-mono)" };
const label: React.CSSProperties = { ...mono, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase" };
const secTitle: React.CSSProperties = { ...mono, fontSize: 10, fontWeight: 700, color: "var(--ft-accent)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 };
const secSub: React.CSSProperties = { ...mono, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em", marginBottom: 14 };
const card: React.CSSProperties = { background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: 20, marginBottom: 16 };
const th: React.CSSProperties = { ...mono, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "left", padding: "4px 10px", fontWeight: 400, borderBottom: "1px solid var(--ft-border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { ...mono, fontSize: 11, color: "var(--ft-text)", padding: "7px 10px", borderBottom: "1px solid var(--ft-border)", whiteSpace: "nowrap" };

// ─── sub-components ──────────────────────────────────────────────────────────

type Range = "30d" | "3m" | "6m" | "12m" | "all";

interface Tx { id: number; date: string; description: string; type: string; category: string; gbpValue: number; accountName: string; currency: string; nativeAmount: number; }

// ─── Category Drill-Through Drawer ───────────────────────────────────────────

interface DrillDrawerProps {
  category: string | null;
  expenses: Tx[];
  range: Range;
  onClose: () => void;
}

function CategoryDrillDrawer({ category, expenses, range, onClose }: DrillDrawerProps) {
  const [, setLocation] = useLocation();
  const isOpen = category !== null;

  const cutoff = cutoffDate(range);
  const rangedExpenses = useMemo(() => {
    if (!category) return [];
    return expenses
      .filter(t => t.category === category && new Date(t.date) >= cutoff)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [category, expenses, cutoff, range]);

  const totalForCategory = useMemo(
    () => rangedExpenses.reduce((s, t) => s + t.gbpValue, 0),
    [rangedExpenses]
  );

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 199,
            background: "rgba(0,0,0,0.35)",
          }}
        />
      )}

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          right: 0,
          top: 48,
          bottom: 0,
          width: 400,
          zIndex: 200,
          background: "var(--ft-surface)",
          borderLeft: "1px solid var(--ft-border)",
          display: "flex",
          flexDirection: "column",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1)",
          overflowY: "auto",
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            borderBottom: "1px solid var(--ft-border)",
            padding: "14px 16px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexShrink: 0,
            background: "var(--ft-raised)",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--ft-dim)",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                marginBottom: 3,
              }}
            >
              Category
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 14,
                fontWeight: 700,
                color: "var(--ft-accent)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                lineHeight: 1,
              }}
            >
              {category ?? ""}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--ft-muted)",
                marginTop: 5,
              }}
            >
              {rangedExpenses.length} transaction{rangedExpenses.length !== 1 ? "s" : ""} · {formatGbp(totalForCategory)}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--ft-dim)",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 18,
              lineHeight: 1,
              padding: "2px 4px",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ft-text)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ft-dim)"; }}
            aria-label="Close drawer"
          >
            ×
          </button>
        </div>

        {/* Transaction list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {rangedExpenses.length === 0 ? (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--ft-dim)",
                padding: "32px 16px",
                textAlign: "center",
              }}
            >
              No transactions in selected range
            </div>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, background: "var(--ft-raised)", zIndex: 1 }}>
                  {["Date", "Description", "Amount", "Account"].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        ...th,
                        textAlign: i === 2 ? "right" : "left",
                        padding: "6px 12px",
                        fontSize: 8,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rangedExpenses.map(t => (
                  <tr
                    key={t.id}
                    style={{ borderBottom: "1px solid var(--ft-border)" }}
                  >
                    <td
                      style={{
                        ...td,
                        fontSize: 10,
                        color: "var(--ft-dim)",
                        padding: "8px 12px",
                        whiteSpace: "nowrap",
                        minWidth: 80,
                      }}
                    >
                      {t.date}
                    </td>
                    <td
                      style={{
                        ...td,
                        fontSize: 11,
                        padding: "8px 12px",
                        maxWidth: 140,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {t.description || "—"}
                    </td>
                    <td
                      style={{
                        ...td,
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--ft-red)",
                        textAlign: "right",
                        padding: "8px 12px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatGbp(t.gbpValue)}
                    </td>
                    <td
                      style={{
                        ...td,
                        fontSize: 9,
                        color: "var(--ft-muted)",
                        padding: "8px 12px",
                        maxWidth: 100,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {t.accountName || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer nav link */}
        <div
          style={{
            borderTop: "1px solid var(--ft-border)",
            padding: "12px 16px",
            flexShrink: 0,
            background: "var(--ft-raised)",
          }}
        >
          <button
            onClick={() => setLocation("/transactions")}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.05em",
              background: "none",
              border: "none",
              color: "var(--ft-accent)",
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            → View in Transactions
          </button>
        </div>
      </div>
    </>
  );
}

function RangeSelector({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const opts: { label: string; value: Range }[] = [
    { label: "30d", value: "30d" }, { label: "3M", value: "3m" },
    { label: "6M", value: "6m" }, { label: "12M", value: "12m" },
    { label: "All", value: "all" },
  ];
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {opts.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          ...mono, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase",
          padding: "4px 8px", cursor: "pointer", border: "1px solid var(--ft-border)",
          background: value === o.value ? "var(--ft-accent)" : "var(--ft-surface)",
          color: value === o.value ? "var(--ft-base)" : "var(--ft-muted)",
          fontWeight: value === o.value ? 700 : 400,
        }}>{o.label}</button>
      ))}
    </div>
  );
}

// Section 1: KPI strip
function KpiStrip({ expenses, range }: { expenses: Tx[]; range: Range }) {
  const now = new Date();
  const thisM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(now); prevDate.setMonth(prevDate.getMonth() - 1);
  const lastM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const cutoff = cutoffDate(range);
  const ranged = expenses.filter(t => new Date(t.date) >= cutoff);

  const thisMonthSpend = ranged.filter(t => getYYYYMM(t.date) === thisM).reduce((s, t) => s + t.gbpValue, 0);
  const lastMonthSpend = expenses.filter(t => getYYYYMM(t.date) === lastM).reduce((s, t) => s + t.gbpValue, 0);
  const delta = thisMonthSpend - lastMonthSpend;

  const days = range === "all" ? 365 : range === "12m" ? 365 : range === "6m" ? 180 : range === "3m" ? 90 : 30;
  const dailyAvg = ranged.reduce((s, t) => s + t.gbpValue, 0) / days;

  const largest = ranged.reduce<Tx | null>((top, t) => !top || t.gbpValue > top.gbpValue ? t : top, null);

  const catMap: Record<string, number> = {};
  for (const t of ranged) catMap[t.category || "Other"] = (catMap[t.category || "Other"] || 0) + t.gbpValue;
  const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];

  const tiles = [
    {
      label: "This Month",
      value: formatGbp(thisMonthSpend),
      sub: delta !== 0 ? (
        <span style={{ color: delta > 0 ? "var(--ft-red)" : "var(--ft-green)", fontSize: 10 }}>
          {delta > 0 ? "▲" : "▼"} {formatGbp(Math.abs(delta))} vs last
        </span>
      ) : null,
    },
    { label: "Daily Average", value: formatGbp(dailyAvg), sub: <span style={{ ...label }}>over {days}d</span> },
    { label: "Largest Single", value: largest ? formatGbp(largest.gbpValue) : "—", sub: <span style={{ ...label, fontSize: 9, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{largest?.description ?? "—"}</span> },
    { label: "Top Category", value: topCat ? formatGbp(topCat[1]) : "—", sub: <span style={{ ...label }}>{topCat?.[0] ?? "—"}</span> },
    { label: "Transactions", value: String(ranged.length), sub: <span style={{ ...label }}>in range</span> },
  ];

  return (
    <div className="ft-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 16 }}>
      {tiles.map(t => (
        <div key={t.label} style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "12px 14px" }}>
          <div style={{ ...label, marginBottom: 6 }}>{t.label}</div>
          <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "-0.02em", marginBottom: 4 }}>{t.value}</div>
          <div>{t.sub}</div>
        </div>
      ))}
    </div>
  );
}

// Section 2: Spending velocity
function SpendingVelocity({ allExpenses }: { allExpenses: Tx[] }) {
  const data = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 11; i >= 0; i--) {
      const ym = monthsAgoStr(i);
      const [y, m] = ym.split("-");
      map[ym] = 0;
      void y; void m;
    }
    for (const t of allExpenses) {
      const ym = getYYYYMM(t.date);
      if (ym in map) map[ym] += t.gbpValue;
    }
    return Object.entries(map).map(([ym, total]) => {
      const [, m] = ym.split("-");
      return { month: MONTH_SHORT[parseInt(m) - 1], total: Math.round(total) };
    });
  }, [allExpenses]);

  const avg = data.reduce((s, d) => s + d.total, 0) / (data.length || 1);

  return (
    <div style={card}>
      <div style={secTitle}>SPENDING VELOCITY</div>
      <div style={secSub}>Monthly expenses — last 12 months · dashed line = 12M average</div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 8, right: 0, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="velGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ft-red)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--ft-red)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="month" tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} />
          <Tooltip content={(p) => <MonoTooltip active={p.active} payload={p.payload as TooltipEntry[]} label={String(p.label ?? "")} formatter={(v) => [formatGbp(v), "Spend"]} />} />
          <ReferenceLine y={avg} stroke="var(--ft-accent)" strokeDasharray="4 3" strokeWidth={1} />
          <Area type="monotone" dataKey="total" stroke="var(--ft-red)" strokeWidth={1.5} fill="url(#velGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Section 3: Income vs Expense split
function IncomeExpenseSplit({ allTxs }: { allTxs: Tx[] }) {
  const bars = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const ym = monthsAgoStr(5 - i);
      const [, m] = ym.split("-");
      const income = allTxs.filter(t => t.type === "income" && getYYYYMM(t.date) === ym).reduce((s, t) => s + t.gbpValue, 0);
      const expense = allTxs.filter(t => t.type === "expense" && getYYYYMM(t.date) === ym).reduce((s, t) => s + t.gbpValue, 0);
      return { month: MONTH_SHORT[parseInt(m) - 1], income: Math.round(income), expense: Math.round(expense), net: Math.round(income - expense) };
    });
  }, [allTxs]);

  const now = new Date();
  const thisM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const curIncome = allTxs.filter(t => t.type === "income" && getYYYYMM(t.date) === thisM).reduce((s, t) => s + t.gbpValue, 0);
  const curExpense = allTxs.filter(t => t.type === "expense" && getYYYYMM(t.date) === thisM).reduce((s, t) => s + t.gbpValue, 0);
  const savingsPct = curIncome > 0 ? Math.round(((curIncome - curExpense) / curIncome) * 100) : 0;
  const pieData = [
    { name: "Income", value: Math.max(curIncome, 0) },
    { name: "Expense", value: Math.max(curExpense, 0) },
  ];

  return (
    <div className="ft-chart-sidebar" style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 16, marginBottom: 16 }}>
      <div style={{ ...card, marginBottom: 0 }}>
        <div style={secTitle}>INCOME VS EXPENSE</div>
        <div style={secSub}>Last 6 months — bars + net savings line</div>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={bars} margin={{ top: 8, right: 0, left: -10, bottom: 0 }}>
            <XAxis dataKey="month" tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={(p) => <MonoTooltip active={p.active} payload={p.payload as TooltipEntry[]} label={String(p.label ?? "")} formatter={(v, n) => [formatGbp(v), n]} />} />
            <Bar dataKey="income" fill="var(--ft-green)" opacity={0.8} radius={[2, 2, 0, 0]} maxBarSize={24} />
            <Bar dataKey="expense" fill="var(--ft-red)" opacity={0.8} radius={[2, 2, 0, 0]} maxBarSize={24} />
            <Line type="monotone" dataKey="net" stroke="var(--ft-accent)" strokeWidth={1.5} dot={<LineDot stroke="var(--ft-accent)" />} activeDot={{ r: 4, fill: "var(--ft-accent)", strokeWidth: 0 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div style={{ ...card, marginBottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={secTitle}>THIS MONTH SPLIT</div>
        <div style={{ position: "relative", width: 160, height: 160 }}>
          <PieChart width={160} height={160}>
            <Pie data={pieData} cx={75} cy={75} innerRadius={52} outerRadius={72} dataKey="value" strokeWidth={0}>
              <Cell fill="var(--ft-green)" opacity={0.85} />
              <Cell fill="var(--ft-red)" opacity={0.85} />
            </Pie>
          </PieChart>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
            <div style={{ ...mono, fontSize: 20, fontWeight: 700, color: savingsPct >= 0 ? "var(--ft-green)" : "var(--ft-red)", lineHeight: 1 }}>{savingsPct}%</div>
            <div style={{ ...label, fontSize: 8, marginTop: 2 }}>saved</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
          {[{ color: "var(--ft-green)", label: "Income" }, { color: "var(--ft-red)", label: "Expense" }].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 8, height: 8, background: l.color, borderRadius: 1 }} />
              <span style={{ ...label, fontSize: 9 }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Section 4: Category intelligence — now with drill-through
interface CategoryIntelligenceProps {
  expenses: Tx[];
  range: Range;
  onCategoryClick: (category: string) => void;
}

function CategoryIntelligence({ expenses, range, onCategoryClick }: CategoryIntelligenceProps) {
  const [sortBy, setSortBy] = useState<"total" | "count" | "change">("total");
  const now = new Date();
  const thisM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(now); prevDate.setMonth(prevDate.getMonth() - 1);
  const lastM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  const cutoff = cutoffDate(range);
  const ranged = expenses.filter(t => new Date(t.date) >= cutoff);
  const totalSpend = ranged.reduce((s, t) => s + t.gbpValue, 0);

  const rows = useMemo(() => {
    const map: Record<string, { total: number; count: number; thisM: number; lastM: number }> = {};
    for (const t of ranged) {
      const c = t.category || "Other";
      if (!map[c]) map[c] = { total: 0, count: 0, thisM: 0, lastM: 0 };
      map[c].total += t.gbpValue; map[c].count += 1;
      if (getYYYYMM(t.date) === thisM) map[c].thisM += t.gbpValue;
      if (getYYYYMM(t.date) === lastM) map[c].lastM += t.gbpValue;
    }
    return Object.entries(map).map(([cat, v]) => ({
      cat, ...v, avg: v.total / v.count,
      pctOfTotal: totalSpend > 0 ? (v.total / totalSpend) * 100 : 0,
      change: pctChange(v.lastM, v.thisM),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, range, thisM, lastM]);

  const sorted = [...rows].sort((a, b) =>
    sortBy === "total" ? b.total - a.total :
    sortBy === "count" ? b.count - a.count :
    b.change - a.change
  );

  const sortBtn = (key: typeof sortBy, btnLabel: string) => (
    <button onClick={() => setSortBy(key)} style={{ ...mono, fontSize: 9, padding: "2px 6px", background: sortBy === key ? "var(--ft-accent)" : "transparent", color: sortBy === key ? "var(--ft-base)" : "var(--ft-muted)", border: "1px solid var(--ft-border)", cursor: "pointer", letterSpacing: "0.04em" }}>{btnLabel}</button>
  );

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={secTitle}>CATEGORY INTELLIGENCE</div>
          <div style={secSub}>Spending breakdown by category · click a row to drill through</div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>{sortBtn("total","Total")} {sortBtn("count","Count")} {sortBtn("change","Change")}</div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {["Category","Total","% of Spend","Count","Avg/Tx","This Month","Last Month","Change"].map(h => (
                <th key={h} style={{ ...th, textAlign: h === "Category" ? "left" : "right" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const chgColor = r.change > 10 ? "var(--ft-red)" : r.change < -10 ? "var(--ft-green)" : "var(--ft-muted)";
              const arrow = r.change > 10 ? "▲" : r.change < -10 ? "▼" : "→";
              return (
                <tr
                  key={r.cat}
                  onClick={() => onCategoryClick(r.cat)}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = "var(--ft-raised)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = "";
                  }}
                >
                  <td style={{ ...td, fontWeight: 600 }}>
                    <span style={{ color: "var(--ft-accent)", marginRight: 4, fontSize: 9 }}>→</span>
                    {r.cat}
                  </td>
                  <td style={{ ...td, textAlign: "right", color: "var(--ft-accent)" }}>{formatGbp(r.total)}</td>
                  <td style={{ ...td, textAlign: "right", color: "var(--ft-muted)" }}>{r.pctOfTotal.toFixed(1)}%</td>
                  <td style={{ ...td, textAlign: "right", color: "var(--ft-muted)" }}>{r.count}</td>
                  <td style={{ ...td, textAlign: "right", color: "var(--ft-dim)" }}>{formatGbp(r.avg)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{r.thisM > 0 ? formatGbp(r.thisM) : "—"}</td>
                  <td style={{ ...td, textAlign: "right", color: "var(--ft-dim)" }}>{r.lastM > 0 ? formatGbp(r.lastM) : "—"}</td>
                  <td style={{ ...td, textAlign: "right", color: chgColor, fontWeight: 700 }}>{arrow} {r.change !== 0 ? `${Math.abs(r.change).toFixed(0)}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Section 5: Spending heatmap
function SpendingHeatmap({ expenses }: { expenses: Tx[] }) {
  const WEEK_LABELS = ["Wk 1","Wk 2","Wk 3","Wk 4","Wk 5"];
  const heatmap = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => Array(5).fill(0));
    for (const t of expenses) { grid[getDOW(t.date)][getWeekOfMonth(t.date)] += t.gbpValue; }
    return grid;
  }, [expenses]);
  const maxVal = Math.max(...heatmap.flat(), 0.01);
  const rowTotals = heatmap.map(r => r.reduce((s, v) => s + v, 0));
  const colTotals = Array.from({ length: 5 }, (_, wi) => heatmap.reduce((s, r) => s + r[wi], 0));

  return (
    <div style={card}>
      <div style={secTitle}>SPENDING HEATMAP · Day × Week</div>
      <div style={secSub}>Total expenses by day-of-week and week-of-month — all time</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", minWidth: 400 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 44 }}></th>
              {WEEK_LABELS.map(w => <th key={w} style={{ ...th, textAlign: "center", minWidth: 72 }}>{w}</th>)}
              <th style={{ ...th, textAlign: "right", paddingLeft: 16 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {DOW_LABELS.map((day, di) => (
              <tr key={day}>
                <td style={{ ...td, color: "var(--ft-dim)", fontSize: 9, paddingRight: 10 }}>{day}</td>
                {heatmap[di].map((val, wi) => {
                  const intensity = maxVal > 0 ? val / maxVal : 0;
                  const opacity = val === 0 ? 0.04 : Math.max(0.08, intensity * 0.7);
                  const isMax = val === maxVal && val > 0;
                  return (
                    <td key={wi} style={{ padding: "4px 4px" }}>
                      <div title={formatGbp(val)} style={{
                        background: `rgba(255, 90, 90, ${opacity})`,
                        border: isMax ? "1px solid var(--ft-amber)" : `1px solid rgba(255,90,90,${opacity * 0.5})`,
                        height: 36, display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: "var(--font-mono)", fontSize: val === 0 ? 9 : 10,
                        color: intensity > 0.5 ? "var(--ft-text)" : "var(--ft-muted)", minWidth: 60, cursor: "default",
                      }}>{val === 0 ? "—" : formatGbp(val)}</div>
                    </td>
                  );
                })}
                <td style={{ ...td, textAlign: "right", color: "var(--ft-accent)", paddingLeft: 16 }}>{formatGbp(rowTotals[di])}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...td, color: "var(--ft-dim)", fontSize: 9 }}>Total</td>
              {colTotals.map((v, wi) => <td key={wi} style={{ ...td, textAlign: "center", color: "var(--ft-accent)" }}>{formatGbp(v)}</td>)}
              <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formatGbp(expenses.reduce((s, t) => s + t.gbpValue, 0))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Section 6: Day-of-week patterns
function DayOfWeekPatterns({ expenses }: { expenses: Tx[] }) {
  const data = useMemo(() => {
    const totals = Array(7).fill(0);
    const counts = Array(7).fill(0);
    for (const t of expenses) { const d = getDOW(t.date); totals[d] += t.gbpValue; counts[d] += 1; }
    return DOW_LABELS.map((name, i) => ({ name, total: Math.round(totals[i]), count: counts[i], weekend: i >= 5 }));
  }, [expenses]);

  return (
    <div style={card}>
      <div style={secTitle}>WHEN DO YOU SPEND?</div>
      <div style={secSub}>Total spend and transaction count by day of week</div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 4, right: 0, left: -10, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} />
          <Tooltip content={(p) => <MonoTooltip active={p.active} payload={p.payload as TooltipEntry[]} label={String(p.label ?? "")} formatter={(v) => [formatGbp(v), "Spend"]} />} />
          <Bar dataKey="total" radius={[2, 2, 0, 0]} maxBarSize={32}>
            {data.map((d, i) => <Cell key={i} fill={d.weekend ? "var(--ft-amber)" : "var(--ft-accent)"} opacity={0.85} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", justifyContent: "space-around", marginTop: 4 }}>
        {data.map(d => (
          <div key={d.name} style={{ textAlign: "center" }}>
            <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>{d.count}x</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Section 7: Top merchants
function TopMerchants({ expenses }: { expenses: Tx[] }) {
  const now = new Date();
  const thisM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(now); prevDate.setMonth(prevDate.getMonth() - 1);
  const lastM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const merchants = useMemo(() => {
    const map: Record<string, { total: number; count: number; thisM: number; lastM: number }> = {};
    for (const t of expenses) {
      const d = t.description?.trim() || "(No description)";
      if (!map[d]) map[d] = { total: 0, count: 0, thisM: 0, lastM: 0 };
      map[d].total += t.gbpValue; map[d].count += 1;
      if (getYYYYMM(t.date) === thisM) map[d].thisM += t.gbpValue;
      if (getYYYYMM(t.date) === lastM) map[d].lastM += t.gbpValue;
    }
    return Object.entries(map)
      .map(([desc, v]) => ({ desc, ...v, avg: v.total / v.count, change: pctChange(v.lastM, v.thisM) }))
      .sort((a, b) => b.total - a.total).slice(0, 15);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, thisM, lastM]);

  const maxTotal = merchants[0]?.total ?? 1;

  return (
    <div style={card}>
      <div style={secTitle}>TOP MERCHANTS / PAYEES</div>
      <div style={secSub}>By all-time spend · top 15</div>
      {merchants.length === 0 ? (
        <div style={{ ...label, textAlign: "center", padding: "24px 0" }}>No expense data yet</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {["#","Merchant","","Times","Total","Avg/Visit","This Month","vs Last"].map((h, i) => (
                  <th key={i} style={{ ...th, textAlign: i <= 1 ? "left" : "right" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {merchants.map((m, i) => {
                const barW = Math.round((m.total / maxTotal) * 100);
                const chgColor = m.change > 10 ? "var(--ft-red)" : m.change < -10 ? "var(--ft-green)" : "var(--ft-dim)";
                return (
                  <tr key={m.desc}>
                    <td style={{ ...td, color: "var(--ft-dim)", fontSize: 9, width: 24 }}>{i + 1}</td>
                    <td style={{ ...td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{m.desc}</td>
                    <td style={{ ...td, width: 80, padding: "7px 6px" }}>
                      <div style={{ height: 4, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${barW}%`, background: "var(--ft-accent)", borderRadius: 2 }} />
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: "right", color: "var(--ft-muted)" }}>{m.count}</td>
                    <td style={{ ...td, textAlign: "right", color: "var(--ft-accent)", fontWeight: 600 }}>{formatGbp(m.total)}</td>
                    <td style={{ ...td, textAlign: "right", color: "var(--ft-muted)" }}>{formatGbp(m.avg)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{m.thisM > 0 ? formatGbp(m.thisM) : "—"}</td>
                    <td style={{ ...td, textAlign: "right", color: chgColor, fontSize: 10 }}>
                      {m.change !== 0 ? `${m.change > 0 ? "▲" : "▼"}${Math.abs(m.change).toFixed(0)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Section 8: Monthly day pattern (Recharts bar)
function MonthDayPattern({ expenses }: { expenses: Tx[] }) {
  const data = useMemo(() => {
    const bars = Array(31).fill(0);
    for (const t of expenses) bars[new Date(t.date).getDate() - 1] += t.gbpValue;
    return bars.map((v, i) => ({ day: i + 1, total: Math.round(v) }));
  }, [expenses]);

  return (
    <div style={card}>
      <div style={secTitle}>MONTH DAY SPENDING PATTERN</div>
      <div style={secSub}>All-time average spend per calendar day · reveals pay-cycle behaviour</div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ top: 4, right: 0, left: -10, bottom: 0 }}>
          <XAxis dataKey="day" tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} interval={4} />
          <YAxis tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} />
          <Tooltip content={(p) => <MonoTooltip active={p.active} payload={p.payload as TooltipEntry[]} label={p.label != null ? `Day ${p.label}` : ""} formatter={(v) => [formatGbp(v), "Day total"]} />} />
          <Bar dataKey="total" radius={[1, 1, 0, 0]} maxBarSize={14}>
            {data.map((d, i) => {
              const max = Math.max(...data.map(x => x.total), 1);
              const intensity = d.total / max;
              return <Cell key={i} fill={`rgba(${intensity > 0.7 ? "244,162,30" : "100,160,240"}, ${0.3 + intensity * 0.7})`} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Section 9: Biggest transactions
function BiggestTransactions({ expenses }: { expenses: Tx[] }) {
  const top8 = useMemo(() =>
    [...expenses].sort((a, b) => b.gbpValue - a.gbpValue).slice(0, 8)
  , [expenses]);
  const max = top8[0]?.gbpValue ?? 1;

  return (
    <div style={card}>
      <div style={secTitle}>BIGGEST TRANSACTIONS · ALL TIME</div>
      <div style={secSub}>Top 8 largest single expenses on record</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {["#","Description","Category","Date","Amount"].map((h, i) => (
                <th key={h} style={{ ...th, textAlign: i >= 4 ? "right" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {top8.map((t, i) => (
              <tr key={t.id} style={{ position: "relative" }}>
                <td style={{ ...td, color: "var(--ft-dim)", fontSize: 9, width: 24 }}>{i + 1}</td>
                <td style={{ ...td, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", paddingLeft: 0, position: "relative" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(t.gbpValue / max) * 3}px`, background: "var(--ft-red)", opacity: 0.5 }} />
                  <span style={{ paddingLeft: 8 }}>{t.description || "—"}</span>
                </td>
                <td style={{ ...td, color: "var(--ft-muted)" }}>{t.category || "Other"}</td>
                <td style={{ ...td, color: "var(--ft-dim)" }}>{t.date}</td>
                <td style={{ ...td, textAlign: "right", color: "var(--ft-red)", fontWeight: 700 }}>{formatGbp(t.gbpValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Section 10: Recurring vs one-off
function RecurringVsOneOff({ expenses }: { expenses: Tx[] }) {
  const { recurring, oneOff, recurringList } = useMemo(() => {
    const descMap: Record<string, { total: number; months: Set<string>; count: number }> = {};
    for (const t of expenses) {
      const d = t.description?.trim() || "(No description)";
      if (!descMap[d]) descMap[d] = { total: 0, months: new Set(), count: 0 };
      descMap[d].total += t.gbpValue; descMap[d].count += 1; descMap[d].months.add(getYYYYMM(t.date));
    }
    let rec = 0, one = 0;
    const recList: { desc: string; total: number; count: number }[] = [];
    for (const [desc, v] of Object.entries(descMap)) {
      if (v.count >= 3 && v.months.size >= 2) { rec += v.total; recList.push({ desc, total: v.total, count: v.count }); }
      else one += v.total;
    }
    return { recurring: rec, oneOff: one, recurringList: recList.sort((a, b) => b.total - a.total).slice(0, 12) };
  }, [expenses]);

  const total = recurring + oneOff || 1;
  const recPct = Math.round((recurring / total) * 100);

  return (
    <div style={card}>
      <div style={secTitle}>RECURRING VS ONE-OFF</div>
      <div style={secSub}>Descriptions appearing 3+ times across 2+ months = recurring</div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ ...mono, fontSize: 11, color: "var(--ft-amber)" }}>Recurring {formatGbp(recurring)} ({recPct}%)</span>
          <span style={{ ...mono, fontSize: 11, color: "var(--ft-muted)" }}>One-off {formatGbp(oneOff)} ({100 - recPct}%)</span>
        </div>
        <div style={{ height: 20, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden", display: "flex" }}>
          <div style={{ width: `${recPct}%`, background: "var(--ft-amber)", opacity: 0.85, transition: "width 0.4s ease" }} />
          <div style={{ flex: 1, background: "var(--ft-surface)" }} />
        </div>
      </div>
      {recurringList.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={th}>Recurring Description</th>
                <th style={{ ...th, textAlign: "right" }}>Times</th>
                <th style={{ ...th, textAlign: "right" }}>All-time Total</th>
              </tr>
            </thead>
            <tbody>
              {recurringList.map(r => (
                <tr key={r.desc}>
                  <td style={{ ...td, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>{r.desc}</td>
                  <td style={{ ...td, textAlign: "right", color: "var(--ft-muted)" }}>{r.count}</td>
                  <td style={{ ...td, textAlign: "right", color: "var(--ft-amber)", fontWeight: 600 }}>{formatGbp(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { data: txs, isLoading, isError, error } = useListTransactions({});
  const [range, setRange] = useState<Range>("3m");
  const [drillCategory, setDrillCategory] = useState<string | null>(null);

  const allTxs = (txs ?? []) as Tx[];
  const expenses = useMemo(() => allTxs.filter(t => t.type === "expense"), [allTxs]);

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header + range selector skeleton */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <FtSkeleton width={140} height={18} />
            <FtSkeleton width={200} height={10} />
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            {[30, 30, 30, 36, 30].map((w, i) => <FtSkeleton key={i} width={w} height={26} />)}
          </div>
        </div>
        {/* KPI tiles skeleton */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "12px 14px" }}>
              <FtSkeleton width="60%" height={9} />
              <div style={{ marginTop: 8 }}><FtSkeleton width="85%" height={18} /></div>
              <div style={{ marginTop: 6 }}><FtSkeleton width="50%" height={9} /></div>
            </div>
          ))}
        </div>
        {/* Chart area skeleton */}
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: 20 }}>
          <FtSkeleton width={200} height={10} />
          <div style={{ marginTop: 16 }}><FtSkeleton width="100%" height={180} /></div>
        </div>
        {/* Table skeleton */}
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: 20 }}>
          <FtSkeleton width={240} height={10} />
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <FtSkeleton width="20%" height={11} />
                <FtSkeleton width="12%" height={11} />
                <FtSkeleton width="8%" height={11} />
                <FtSkeleton width="6%" height={11} />
                <FtSkeleton width="10%" height={11} />
                <FtSkeleton width="10%" height={11} />
                <FtSkeleton width="10%" height={11} />
                <FtSkeleton width="8%" height={11} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState message={(error as Error)?.message ?? "Could not load transaction data. Check your connection and try again."} />
    );
  }

  if (allTxs.length === 0) {
    return (
      <EmptyState
        title="No data"
        description="Add transactions first to see spending patterns and analytics."
      />
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1 }}>
            ANALYTICS
          </div>
          <div style={{ ...mono, fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.04em", marginTop: 4 }}>
            spending patterns &amp; behavioural insights
          </div>
        </div>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      {/* Section 1 */}
      <KpiStrip expenses={expenses} range={range} />

      {/* Section 2 */}
      <SpendingVelocity allExpenses={expenses} />

      {/* Section 3 */}
      <IncomeExpenseSplit allTxs={allTxs} />

      {/* Section 4 — clickable category rows */}
      <CategoryIntelligence
        expenses={expenses}
        range={range}
        onCategoryClick={(cat) => setDrillCategory(cat)}
      />

      {/* Sections 5 + 6 side by side */}
      <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 0 }}>
        <SpendingHeatmap expenses={expenses} />
        <DayOfWeekPatterns expenses={expenses} />
      </div>

      {/* Section 7 */}
      <TopMerchants expenses={expenses} />

      {/* Section 8 */}
      <MonthDayPattern expenses={expenses} />

      {/* Sections 9 + 10 side by side */}
      <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <BiggestTransactions expenses={expenses} />
        <RecurringVsOneOff expenses={expenses} />
      </div>

      {/* Category drill-through drawer */}
      <CategoryDrillDrawer
        category={drillCategory}
        expenses={expenses}
        range={range}
        onClose={() => setDrillCategory(null)}
      />
    </div>
  );
}
