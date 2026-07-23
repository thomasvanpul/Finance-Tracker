import { useMemo, useState } from "react";
import { useListTransactions, useGetDashboard } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ─── types ───────────────────────────────────────────────────────────────────

interface Tx {
  id: number;
  date: string;
  description: string;
  type: string;
  category: string;
  gbpValue: number;
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
const secTitle: React.CSSProperties = {
  ...mono,
  fontSize: 10,
  fontWeight: 700,
  color: "var(--ft-amber)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  marginBottom: 2,
};
const secSub: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  color: "var(--ft-dim)",
  letterSpacing: "0.04em",
  marginBottom: 14,
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
};
const td: React.CSSProperties = {
  ...mono,
  fontSize: 11,
  color: "var(--ft-text)",
  padding: "7px 10px",
  borderBottom: "1px solid var(--ft-border)",
};

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function getYYYYMM(d: string) { return d.slice(0, 7); }
function getDOWIdx(d: string) { return new Date(d).getDay(); }

// ─── sub-components ──────────────────────────────────────────────────────────

function KpiStrip({ income, expenses, txCount, year }: {
  income: number;
  expenses: number;
  txCount: number;
  year: number;
}) {
  const net = income - expenses;
  const savingsRate = income > 0 ? (net / income) * 100 : 0;
  return (
    <div className="ft-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 16 }}>
      {[
        { label: "Total Income", value: formatGbp(income), color: "var(--ft-green)" },
        { label: "Total Expenses", value: formatGbp(expenses), color: "var(--ft-red)" },
        { label: "Net Savings", value: formatGbp(net), color: net >= 0 ? "var(--ft-green)" : "var(--ft-red)" },
        { label: "Savings Rate", value: `${savingsRate.toFixed(1)}%`, color: savingsRate >= 20 ? "var(--ft-green)" : savingsRate >= 10 ? "var(--ft-amber)" : "var(--ft-red)" },
        { label: "Transactions", value: String(txCount), color: "var(--ft-text)" },
      ].map((tile) => (
        <div key={tile.label} style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "12px 14px" }}>
          <div style={{ ...label, marginBottom: 6 }}>{tile.label} · {year}</div>
          <div style={{ ...mono, fontSize: 20, fontWeight: 700, color: tile.color, letterSpacing: "-0.02em" }}>{tile.value}</div>
        </div>
      ))}
    </div>
  );
}

function BiggestMoments({ txs }: { txs: Tx[] }) {
  const expenses = txs.filter((t) => t.type === "expense");
  const incomes = txs.filter((t) => t.type === "income");

  const biggestExpense = expenses.reduce<Tx | null>((top, t) => !top || t.gbpValue > top.gbpValue ? t : top, null);
  const biggestIncome = incomes.reduce<Tx | null>((top, t) => !top || t.gbpValue > top.gbpValue ? t : top, null);

  // Best month = most saved (income - expense)
  const monthlyNet: Record<string, number> = {};
  for (const t of txs) {
    const ym = getYYYYMM(t.date);
    if (!monthlyNet[ym]) monthlyNet[ym] = 0;
    monthlyNet[ym] += t.type === "income" ? t.gbpValue : -t.gbpValue;
  }
  const bestMonthEntry = Object.entries(monthlyNet).sort((a, b) => b[1] - a[1])[0];
  const worstMonthEntry = Object.entries(monthlyNet).sort((a, b) => a[1] - b[1])[0];

  const fmtYM = (ym: string) => {
    const [y, m] = ym.split("-");
    return `${MONTH_SHORT[parseInt(m) - 1]} ${y}`;
  };

  return (
    <div style={card}>
      <div style={secTitle}>BIGGEST MOMENTS</div>
      <div style={secSub}>The standout transactions and months of the year</div>
      <div className="ft-four-col" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          {
            icon: "↓",
            label: "Largest Single Expense",
            value: biggestExpense ? formatGbp(biggestExpense.gbpValue) : "—",
            sub: biggestExpense ? `${biggestExpense.date} · ${biggestExpense.description}` : "—",
            color: "var(--ft-red)",
          },
          {
            icon: "↑",
            label: "Largest Single Income",
            value: biggestIncome ? formatGbp(biggestIncome.gbpValue) : "—",
            sub: biggestIncome ? `${biggestIncome.date} · ${biggestIncome.description}` : "—",
            color: "var(--ft-green)",
          },
          {
            icon: "★",
            label: "Best Month",
            value: bestMonthEntry ? fmtYM(bestMonthEntry[0]) : "—",
            sub: bestMonthEntry ? `Saved ${formatGbp(bestMonthEntry[1])}` : "—",
            color: "var(--ft-amber)",
          },
          {
            icon: "▼",
            label: "Worst Month",
            value: worstMonthEntry ? fmtYM(worstMonthEntry[0]) : "—",
            sub: worstMonthEntry
              ? worstMonthEntry[1] < 0
                ? `Deficit ${formatGbp(Math.abs(worstMonthEntry[1]))}`
                : `Low savings ${formatGbp(worstMonthEntry[1])}`
              : "—",
            color: "var(--ft-red)",
          },
        ].map((item) => (
          <div key={item.label} style={{
            background: "var(--ft-base)",
            border: `1px solid ${item.color}33`,
            padding: "14px 16px",
          }}>
            <div style={{ ...mono, fontSize: 16, color: item.color, marginBottom: 6 }}>{item.icon}</div>
            <div style={{ ...label, marginBottom: 4 }}>{item.label}</div>
            <div style={{ ...mono, fontSize: 15, fontWeight: 700, color: item.color, marginBottom: 4, letterSpacing: "-0.01em" }}>
              {item.value}
            </div>
            <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.sub}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryBreakdown({ expenses }: { expenses: Tx[] }) {
  const total = expenses.reduce((s, t) => s + t.gbpValue, 0) || 1;
  const catMap: Record<string, number> = {};
  for (const t of expenses) {
    const c = t.category || "Other";
    catMap[c] = (catMap[c] || 0) + t.gbpValue;
  }
  const top5 = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, val]) => ({ cat, val, pct: (val / total) * 100 }));

  const PALETTE = [
    "var(--ft-accent)",
    "var(--ft-amber)",
    "var(--ft-green)",
    "var(--ft-cyan)",
    "var(--ft-blue)",
  ];

  return (
    <div style={card}>
      <div style={secTitle}>TOP SPENDING CATEGORIES</div>
      <div style={secSub}>Top 5 categories by total spend · % of annual expenses</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {top5.map((row, i) => (
          <div key={row.cat} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", width: 16, textAlign: "right" }}>{i + 1}</div>
            <div style={{ ...mono, fontSize: 11, color: "var(--ft-text)", width: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.cat}
            </div>
            <div style={{ flex: 1, height: 16, background: "var(--ft-border)", position: "relative" }}>
              <div style={{
                position: "absolute", left: 0, top: 0, bottom: 0,
                width: `${row.pct}%`,
                background: PALETTE[i % PALETTE.length],
                opacity: 0.8,
                transition: "width 0.6s ease",
              }} />
            </div>
            <div style={{ ...mono, fontSize: 10, color: PALETTE[i % PALETTE.length], width: 50, textAlign: "right", fontWeight: 700 }}>
              {row.pct.toFixed(1)}%
            </div>
            <div style={{ ...mono, fontSize: 11, color: "var(--ft-muted)", width: 80, textAlign: "right" }}>
              {formatGbp(row.val)}
            </div>
          </div>
        ))}
        {top5.length === 0 && (
          <div style={{ ...label, textAlign: "center", padding: "16px 0" }}>No expense data for this year</div>
        )}
      </div>
    </div>
  );
}

function MonthByMonth({ txs, year }: { txs: Tx[]; year: number }) {
  const data = useMemo(() => {
    return MONTH_SHORT.map((month, i) => {
      const ym = `${year}-${String(i + 1).padStart(2, "0")}`;
      const income = txs.filter((t) => t.type === "income" && getYYYYMM(t.date) === ym)
        .reduce((s, t) => s + t.gbpValue, 0);
      const expenses = txs.filter((t) => t.type === "expense" && getYYYYMM(t.date) === ym)
        .reduce((s, t) => s + t.gbpValue, 0);
      return { month, income: Math.round(income), expenses: Math.round(expenses) };
    });
  }, [txs, year]);

  return (
    <div style={card}>
      <div style={secTitle}>MONTH-BY-MONTH</div>
      <div style={secSub}>Income vs expenses — all 12 months</div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 0, left: -10, bottom: 0 }} barGap={2}>
          <XAxis
            dataKey="month"
            tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 11 }}
            formatter={(v: number, name: string) => [formatGbp(v), name]}
          />
          <Bar dataKey="income" fill="var(--ft-green)" opacity={0.8} radius={[2, 2, 0, 0]} maxBarSize={18} />
          <Bar dataKey="expenses" fill="var(--ft-red)" opacity={0.8} radius={[2, 2, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
        {[{ color: "var(--ft-green)", label: "Income" }, { color: "var(--ft-red)", label: "Expenses" }].map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, background: l.color, borderRadius: 1 }} />
            <span style={{ ...label, fontSize: 9 }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StreaksAndFacts({ txs, year }: { txs: Tx[]; year: number }) {
  const totalTxs = txs.length;

  // Most active day of week
  const dowCounts = Array(7).fill(0);
  for (const t of txs) dowCounts[getDOWIdx(t.date)]++;
  const maxDowIdx = dowCounts.indexOf(Math.max(...dowCounts));
  const mostActiveDay = DOW_LABELS[maxDowIdx];

  // Favourite category (most frequent)
  const catCounts: Record<string, number> = {};
  for (const t of txs.filter((t) => t.type === "expense")) {
    const c = t.category || "Other";
    catCounts[c] = (catCounts[c] || 0) + 1;
  }
  const favCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  // Average per transaction
  const allExpenses = txs.filter((t) => t.type === "expense");
  const avgExpense = allExpenses.length > 0
    ? allExpenses.reduce((s, t) => s + t.gbpValue, 0) / allExpenses.length
    : 0;

  // Most expensive month
  const monthExpenses: Record<string, number> = {};
  for (const t of allExpenses) {
    const ym = getYYYYMM(t.date);
    monthExpenses[ym] = (monthExpenses[ym] || 0) + t.gbpValue;
  }
  const priceyMonthEntry = Object.entries(monthExpenses).sort((a, b) => b[1] - a[1])[0];
  const priceyMonthStr = priceyMonthEntry
    ? (() => {
        const [y, m] = priceyMonthEntry[0].split("-");
        return `${MONTH_SHORT[parseInt(m) - 1]} ${y}`;
      })()
    : "—";

  const facts = [
    { icon: "🧾", text: `You logged ${totalTxs} transactions in ${year}` },
    { icon: "📅", text: `Most active day of the week: ${mostActiveDay}` },
    { icon: "🛒", text: `Favourite spending category: ${favCat}` },
    { icon: "💸", text: `Average expense per transaction: ${formatGbp(avgExpense)}` },
    { icon: "📈", text: `Most expensive month: ${priceyMonthStr}` },
  ];

  return (
    <div style={card}>
      <div style={secTitle}>STREAKS &amp; FACTS</div>
      <div style={secSub}>Fun data points from your year</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {facts.map((f) => (
          <div key={f.text} style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 12px",
            background: "var(--ft-base)",
            border: "1px solid var(--ft-border)",
          }}>
            <span style={{ fontSize: 14 }}>{f.icon}</span>
            <span style={{ ...mono, fontSize: 12, color: "var(--ft-text)" }}>{f.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NetWorthDelta({ txs }: { txs: Tx[] }) {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;

  // Approximate net worth delta: sum of income minus sum of expenses
  const totalIncome = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.gbpValue, 0);
  const totalExpenses = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.gbpValue, 0);
  const delta = totalIncome - totalExpenses;

  return (
    <div style={{ ...card, padding: "16px 20px", display: "flex", alignItems: "center", gap: 24 }}>
      <div>
        <div style={{ ...label, marginBottom: 4 }}>NET WORTH DELTA THIS YEAR</div>
        <div style={{
          ...mono,
          fontSize: 28,
          fontWeight: 700,
          color: delta >= 0 ? "var(--ft-green)" : "var(--ft-red)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}>
          {delta >= 0 ? "+" : ""}{formatGbp(delta)}
        </div>
        <div style={{ ...mono, fontSize: 10, color: "var(--ft-dim)", marginTop: 4 }}>
          Based on income vs expenses tracked in Numeris
        </div>
      </div>
      <div style={{
        marginLeft: "auto",
        background: delta >= 0 ? "var(--ft-green)10" : "var(--ft-red)10",
        border: `1px solid ${delta >= 0 ? "var(--ft-green)" : "var(--ft-red)"}33`,
        padding: "8px 16px",
      }}>
        <div style={{ ...label, marginBottom: 4 }}>
          {delta >= 0 ? "YEAR IN THE GREEN" : "YEAR IN THE RED"}
        </div>
        <div style={{ ...mono, fontSize: 11, color: delta >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
          {delta >= 0
            ? "Your finances grew this year."
            : "Expenses outpaced income this year."}
        </div>
      </div>
    </div>
  );
}

function ShareableCard({ income, expenses, txCount, year }: {
  income: number;
  expenses: number;
  txCount: number;
  year: number;
}) {
  const net = income - expenses;
  const savingsRate = income > 0 ? (net / income) * 100 : 0;

  return (
    <div style={{
      background: "var(--ft-base)",
      border: "2px solid var(--ft-accent)",
      padding: "24px 28px",
      marginBottom: 16,
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background decoration */}
      <div style={{
        position: "absolute",
        top: -40,
        right: -40,
        width: 180,
        height: 180,
        borderRadius: "50%",
        background: "var(--ft-accent)",
        opacity: 0.04,
      }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ ...mono, fontSize: 9, color: "var(--ft-accent)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
              NUMERIS · MY YEAR IN NUMBERS
            </div>
            <div style={{ ...mono, fontSize: 24, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.04em" }}>
              {year}
            </div>
          </div>
          <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>
            {txCount} transactions tracked
          </div>
        </div>
        <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>
          {[
            { label: "Earned", value: formatGbp(income), color: "var(--ft-green)" },
            { label: "Spent", value: formatGbp(expenses), color: "var(--ft-red)" },
            { label: "Saved", value: formatGbp(net), color: net >= 0 ? "var(--ft-amber)" : "var(--ft-red)" },
          ].map((s) => (
            <div key={s.label}>
              <div style={{ ...label, marginBottom: 4 }}>{s.label}</div>
              <div style={{ ...mono, fontSize: 20, fontWeight: 700, color: s.color, letterSpacing: "-0.01em" }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
        <div style={{
          height: 4,
          background: "var(--ft-border)",
          borderRadius: 2,
          overflow: "hidden",
          marginBottom: 8,
        }}>
          <div style={{
            height: "100%",
            width: `${Math.min(100, Math.max(0, savingsRate))}%`,
            background: savingsRate >= 20 ? "var(--ft-green)" : savingsRate >= 10 ? "var(--ft-amber)" : "var(--ft-red)",
            transition: "width 0.6s ease",
          }} />
        </div>
        <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>
          Savings rate: {savingsRate.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

// ─── export ──────────────────────────────────────────────────────────────────

function exportYearCSV(txs: Tx[], year: number) {
  const header = ["Date", "Description", "Type", "Category", "GBP"];
  const escape = (v: string | number) => { const s = String(v ?? ""); return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [header.join(","), ...txs.map((t) => [t.date, t.description, t.type, t.category ?? "", t.gbpValue.toFixed(2)].map(escape).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `year-review-${year}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function YearReviewPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const { data: rawTxs, isLoading } = useListTransactions({});
  const { data: dashboard } = useGetDashboard();

  const allTxs = (rawTxs ?? []) as Tx[];
  void dashboard;

  const yearTxs = useMemo(
    () => allTxs.filter((t) => t.date.startsWith(String(year))),
    [allTxs, year]
  );

  const totalIncome = useMemo(
    () => yearTxs.filter((t) => t.type === "income").reduce((s, t) => s + t.gbpValue, 0),
    [yearTxs]
  );
  const totalExpenses = useMemo(
    () => yearTxs.filter((t) => t.type === "expense").reduce((s, t) => s + t.gbpValue, 0),
    [yearTxs]
  );

  // Build year options from transaction data
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const t of allTxs) {
      const y = parseInt(t.date.slice(0, 4));
      if (!isNaN(y)) years.add(y);
    }
    years.add(currentYear);
    return [...years].sort((a, b) => b - a);
  }, [allTxs, currentYear]);

  if (isLoading) {
    return (
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", padding: "40px 0", textAlign: "center" }}>
        Loading year data…
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="ft-yr-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1 }}>
            YEAR IN REVIEW · {year}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.04em", marginTop: 4 }}>
            your financial year — wrapped
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {/* Year selector */}
        <div style={{ display: "flex", gap: 2 }}>
          {availableYears.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: "4px 8px",
                cursor: "pointer",
                border: "1px solid var(--ft-border)",
                background: year === y ? "var(--ft-amber)" : "var(--ft-surface)",
                color: year === y ? "var(--ft-base)" : "var(--ft-muted)",
                fontWeight: year === y ? 700 : 400,
              }}
            >
              {y}
            </button>
          ))}
        </div>
        {yearTxs.length > 0 && (
          <button
            onClick={() => exportYearCSV(yearTxs, year)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "4px 10px",
              cursor: "pointer",
              border: "1px solid var(--ft-border)",
              background: "var(--ft-surface)",
              color: "var(--ft-muted)",
            }}
          >
            ↓ CSV
          </button>
        )}
        </div>
      </div>

      {yearTxs.length === 0 ? (
        <div style={{
          background: "var(--ft-surface)",
          border: "1px solid var(--ft-border)",
          padding: "48px 24px",
          textAlign: "center",
        }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>
            No transactions recorded for {year}
          </div>
        </div>
      ) : (
        <>
          <KpiStrip
            income={totalIncome}
            expenses={totalExpenses}
            txCount={yearTxs.length}
            year={year}
          />

          <BiggestMoments txs={yearTxs} />

          <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <CategoryBreakdown expenses={yearTxs.filter((t) => t.type === "expense")} />
            <MonthByMonth txs={yearTxs} year={year} />
          </div>

          <StreaksAndFacts txs={yearTxs} year={year} />

          <NetWorthDelta txs={yearTxs} />

          {/* Shareable card */}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-amber)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
            SHAREABLE SUMMARY CARD
          </div>
          <ShareableCard
            income={totalIncome}
            expenses={totalExpenses}
            txCount={yearTxs.length}
            year={year}
          />
        </>
      )}
    </div>
  );
}
