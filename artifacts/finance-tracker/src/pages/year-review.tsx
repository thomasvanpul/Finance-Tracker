import { useMemo, useState, useCallback, useEffect } from "react";
import { useListTransactions, useGetDashboard } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { MonoTooltip, type TooltipEntry } from "@/components/mono-tooltip";
import { loadPersonaIds, PERSONA_COLORS } from "@/lib/persona";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Text, MonoLabel } from "@/components/primitives";

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
  fontSize: 9,
  fontWeight: 700,
  color: "var(--ft-dim)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  padding: "7px 16px",
  borderBottom: "1px solid var(--ft-border)",
  background: "var(--ft-base)",
};
const panel: React.CSSProperties = {
  background: "var(--ft-surface)",
  border: "1px solid var(--ft-border)",
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
const QUARTER_LABELS = ["Q1 Jan–Mar", "Q2 Apr–Jun", "Q3 Jul–Sep", "Q4 Oct–Dec"];

function getYYYYMM(d: string) { return d.slice(0, 7); }
function getDOWIdx(d: string) { return new Date(d).getDay(); }

function fmtYM(ym: string) {
  const [y, m] = ym.split("-");
  return `${MONTH_SHORT[parseInt(m) - 1]} ${y}`;
}

// ─── KPI Strip ────────────────────────────────────────────────────────────────

function KpiStrip({ income, expenses, txCount, year, prevIncome, prevExpenses }: {
  income: number;
  expenses: number;
  txCount: number;
  year: number;
  prevIncome?: number;
  prevExpenses?: number;
}) {
  const net = income - expenses;
  const savingsRate = income > 0 ? (net / income) * 100 : 0;
  const prevNet = prevIncome !== undefined && prevExpenses !== undefined ? prevIncome - prevExpenses : undefined;

  function yoyDelta(curr: number, prev?: number): string | null {
    if (prev === undefined || prev === 0) return null;
    const pct = ((curr - prev) / Math.abs(prev)) * 100;
    return (pct >= 0 ? "+" : "") + pct.toFixed(1) + "% yoy";
  }

  const tiles = [
    {
      label: `Total Income · ${year}`,
      value: formatGbp(income),
      color: "var(--ft-green)",
      sub: yoyDelta(income, prevIncome),
      subColor: prevIncome !== undefined && income >= prevIncome ? "var(--ft-green)" : "var(--ft-red)",
    },
    {
      label: `Total Expenses · ${year}`,
      value: formatGbp(expenses),
      color: "var(--ft-red)",
      sub: yoyDelta(expenses, prevExpenses),
      subColor: prevExpenses !== undefined && expenses <= prevExpenses ? "var(--ft-green)" : "var(--ft-red)",
    },
    {
      label: `Net Savings · ${year}`,
      value: (net >= 0 ? "+" : "") + formatGbp(net),
      color: net >= 0 ? "var(--ft-green)" : "var(--ft-red)",
      sub: yoyDelta(net, prevNet),
      subColor: prevNet !== undefined && net >= prevNet ? "var(--ft-green)" : "var(--ft-red)",
    },
    {
      label: "Savings Rate",
      value: `${savingsRate.toFixed(1)}%`,
      color: savingsRate >= 20 ? "var(--ft-green)" : savingsRate >= 10 ? "var(--ft-amber)" : "var(--ft-red)",
      sub: savingsRate >= 20 ? "on target" : savingsRate >= 10 ? "below 20%" : "below 10%",
      subColor: savingsRate >= 20 ? "var(--ft-green)" : "var(--ft-amber)",
    },
    {
      label: "Transactions",
      value: String(txCount),
      color: "var(--ft-text)",
      sub: null,
      subColor: "var(--ft-dim)",
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${tiles.length}, 1fr)`, gap: 1, background: "var(--ft-border)", border: "1px solid var(--ft-border)", marginBottom: 16, overflow: "hidden" }}>
      {tiles.map((tile) => (
        <div
          key={tile.label}
          style={{
            padding: "10px 16px",
            background: "var(--ft-surface)",
            minWidth: 0,
          }}
        >
          <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>{tile.label}</div>
          <div className="pnum" style={{ ...mono, fontSize: 20, fontWeight: 700, color: tile.color, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tile.value}</div>
          {tile.sub && (
            <div style={{ ...mono, fontSize: 9, color: tile.subColor, marginTop: 3 }}>{tile.sub}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Spending Heatmap ─────────────────────────────────────────────────────────

function SpendingHeatmap({ txs, year }: { txs: Tx[]; year: number }) {
  const monthData = useMemo(() => {
    return MONTH_SHORT.map((name, i) => {
      const ym = `${year}-${String(i + 1).padStart(2, "0")}`;
      const expenses = txs
        .filter((t) => t.type === "expense" && getYYYYMM(t.date) === ym)
        .reduce((s, t) => s + t.gbpValue, 0);
      const income = txs
        .filter((t) => t.type === "income" && getYYYYMM(t.date) === ym)
        .reduce((s, t) => s + t.gbpValue, 0);
      const txCount = txs.filter((t) => getYYYYMM(t.date) === ym).length;
      return { name, ym, expenses: Math.round(expenses), income: Math.round(income), txCount };
    });
  }, [txs, year]);

  const maxExpenses = Math.max(...monthData.map((d) => d.expenses), 1);

  return (
    <div style={panel}>
      <div style={{ ...secTitle, borderLeft: "3px solid var(--ft-red)" }}>Monthly Spend Heatmap</div>
      <div style={{ padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 3, marginBottom: 8 }}>
          {monthData.map((m) => {
            const intensity = m.expenses / maxExpenses;
            const hasData = m.txCount > 0;
            const alpha = hasData ? 0.08 + intensity * 0.72 : 0;
            return (
              <div
                key={m.ym}
                title={`${m.name}: £${m.expenses.toLocaleString()} spent, £${m.income.toLocaleString()} earned`}
                style={{
                  aspectRatio: "1",
                  background: hasData ? `color-mix(in srgb, var(--ft-red) ${Math.round(alpha * 100)}%, var(--ft-surface))` : "var(--ft-base)",
                  border: `1px solid color-mix(in srgb, var(--ft-red) ${hasData ? Math.round(alpha * 60 + 10) : 8}%, var(--ft-border))`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "6px 4px",
                  cursor: "default",
                  position: "relative",
                  transition: "filter 0.12s ease",
                }}
              >
                <div style={{ ...mono, fontSize: 8, color: hasData && intensity > 0.5 ? "var(--ft-text)" : "var(--ft-dim)", letterSpacing: "0.04em", textAlign: "center", lineHeight: 1.2 }}>{m.name}</div>
                {hasData && (
                  <div className="pnum" style={{ ...mono, fontSize: 7, color: "var(--ft-dim)", marginTop: 3, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                    £{m.expenses >= 1000 ? `${(m.expenses / 1000).toFixed(1)}k` : m.expenses}
                  </div>
                )}
                {!hasData && (
                  <div style={{ ...mono, fontSize: 7, color: "var(--ft-border2)", marginTop: 2 }}>—</div>
                )}
              </div>
            );
          })}
        </div>
        {/* Legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
          <span style={{ ...mono, fontSize: 8, color: "var(--ft-dim)" }}>Low spend</span>
          {[0.1, 0.3, 0.5, 0.7, 0.9].map((v) => (
            <div
              key={v}
              style={{
                width: 12,
                height: 12,
                background: `color-mix(in srgb, var(--ft-red) ${Math.round((0.08 + v * 0.72) * 100)}%, var(--ft-surface))`,
                border: "1px solid var(--ft-border)",
              }}
            />
          ))}
          <span style={{ ...mono, fontSize: 8, color: "var(--ft-dim)" }}>High spend</span>
        </div>
      </div>
    </div>
  );
}

// ─── Quarter Breakdown ────────────────────────────────────────────────────────

function QuarterBreakdown({ txs, year, prevTxs }: { txs: Tx[]; year: number; prevTxs?: Tx[] }) {
  const quarters = useMemo(() => {
    return [0, 1, 2, 3].map((q) => {
      const months = [0, 1, 2].map((m) => q * 3 + m + 1);
      const yms = months.map((m) => `${year}-${String(m).padStart(2, "0")}`);
      const qTxs = txs.filter((t) => yms.some((ym) => getYYYYMM(t.date) === ym));
      const income = qTxs.filter((t) => t.type === "income").reduce((s, t) => s + t.gbpValue, 0);
      const expenses = qTxs.filter((t) => t.type === "expense").reduce((s, t) => s + t.gbpValue, 0);
      const net = income - expenses;
      const savingsRate = income > 0 ? (net / income) * 100 : null;

      // Previous year same quarter
      let prevNet: number | undefined;
      if (prevTxs) {
        const prevYms = months.map((m) => `${year - 1}-${String(m).padStart(2, "0")}`);
        const prevQTxs = prevTxs.filter((t) => prevYms.some((ym) => getYYYYMM(t.date) === ym));
        const prevIncome = prevQTxs.filter((t) => t.type === "income").reduce((s, t) => s + t.gbpValue, 0);
        const prevExpenses = prevQTxs.filter((t) => t.type === "expense").reduce((s, t) => s + t.gbpValue, 0);
        prevNet = prevIncome - prevExpenses;
      }

      return { label: QUARTER_LABELS[q], income, expenses, net, savingsRate, txCount: qTxs.length, prevNet };
    });
  }, [txs, year, prevTxs]);

  const hasData = quarters.some((q) => q.txCount > 0);
  if (!hasData) return null;

  return (
    <div style={panel}>
      <div style={{ ...secTitle, borderLeft: "3px solid var(--ft-amber)" }}>Quarter-by-Quarter Breakdown</div>
      <div className="ft-kpi-bar" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "var(--ft-border)" }}>
        {quarters.map((q) => {
          const hasTx = q.txCount > 0;
          const accentColor = q.net >= 0 && hasTx ? "var(--ft-green)" : hasTx ? "var(--ft-red)" : "var(--ft-border)";
          return (
            <div
              key={q.label}
              style={{
                padding: "14px 16px",
                borderLeft: `3px solid ${accentColor}`,
                background: hasTx ? "var(--ft-surface)" : "var(--ft-base)",
                opacity: hasTx ? 1 : 0.5,
              }}
            >
              <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>{q.label}</div>
              {hasTx ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 0", marginBottom: 8 }}>
                    <div>
                      <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)" }}>INCOME</div>
                      <div className="pnum" style={{ ...mono, fontSize: 11, fontWeight: 600, color: "var(--ft-green)", fontVariantNumeric: "tabular-nums" }}>{formatGbp(q.income)}</div>
                    </div>
                    <div>
                      <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)" }}>EXPENSES</div>
                      <div className="pnum" style={{ ...mono, fontSize: 11, fontWeight: 600, color: "var(--ft-red)", fontVariantNumeric: "tabular-nums" }}>{formatGbp(q.expenses)}</div>
                    </div>
                  </div>
                  <div style={{ borderTop: "1px solid var(--ft-border)", paddingTop: 8 }}>
                    <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", marginBottom: 2 }}>NET</div>
                    <div className="pnum" style={{ ...mono, fontSize: 15, fontWeight: 700, color: q.net >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontVariantNumeric: "tabular-nums" }}>
                      {q.net >= 0 ? "+" : ""}{formatGbp(q.net)}
                    </div>
                    {q.savingsRate !== null && (
                      <div style={{ ...mono, fontSize: 9, color: q.savingsRate >= 20 ? "var(--ft-green)" : q.savingsRate >= 10 ? "var(--ft-amber)" : "var(--ft-red)", marginTop: 2 }}>
                        {q.savingsRate.toFixed(1)}% saved
                      </div>
                    )}
                    {q.prevNet !== undefined && (
                      <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", marginTop: 4 }}>
                        {q.net > q.prevNet
                          ? <span style={{ color: "var(--ft-green)" }}>▲ <span className="pnum">{formatGbp(q.net - q.prevNet)}</span> vs {year - 1}</span>
                          : q.net < q.prevNet
                          ? <span style={{ color: "var(--ft-red)" }}>▼ <span className="pnum">{formatGbp(q.prevNet - q.net)}</span> vs {year - 1}</span>
                          : <span>— flat vs {year - 1}</span>
                        }
                      </div>
                    )}
                    <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", marginTop: 4 }}>{q.txCount} transactions</div>
                  </div>
                </>
              ) : (
                <div style={{ ...mono, fontSize: 10, color: "var(--ft-border2)" }}>No data</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Biggest Moments ──────────────────────────────────────────────────────────

function MilestoneCard({ item, i, total }: { item: { icon: string; label: string; value: string; sub: string; color: string }; i: number; total: number }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "12px 16px",
        borderRight: "1px solid var(--ft-border)",
        borderBottom: i >= total - 3 ? "none" : "1px solid var(--ft-border)",
        borderLeft: `3px solid ${item.color}`,
        background: hovered ? `color-mix(in srgb, ${item.color} 5%, var(--ft-surface))` : "var(--ft-surface)",
        transition: "background 0.12s ease",
        cursor: "default",
      }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5 }}>
        <span style={{ ...{ fontFamily: "var(--font-mono)" }, fontSize: 10, color: item.color }}>{item.icon}</span>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>{item.label}</div>
      </div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: item.color, marginBottom: 3, fontVariantNumeric: "tabular-nums" }}>
        {item.value}
      </div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
        {item.sub}
      </div>
    </div>
  );
}

function BiggestMoments({ txs }: { txs: Tx[] }) {
  const expenses = txs.filter((t) => t.type === "expense");
  const incomes = txs.filter((t) => t.type === "income");

  const biggestExpense = expenses.reduce<Tx | null>((top, t) => !top || t.gbpValue > top.gbpValue ? t : top, null);
  const biggestIncome = incomes.reduce<Tx | null>((top, t) => !top || t.gbpValue > top.gbpValue ? t : top, null);

  const monthlyNet: Record<string, number> = {};
  for (const t of txs) {
    const ym = getYYYYMM(t.date);
    if (!monthlyNet[ym]) monthlyNet[ym] = 0;
    monthlyNet[ym] += t.type === "income" ? t.gbpValue : -t.gbpValue;
  }
  const monthlyEntries = Object.entries(monthlyNet);
  const bestMonthEntry = monthlyEntries.sort((a, b) => b[1] - a[1])[0];
  const worstMonthEntry = [...monthlyEntries].sort((a, b) => a[1] - b[1])[0];

  const highestIncomeMonthEntry = Object.entries(
    txs
      .filter((t) => t.type === "income")
      .reduce<Record<string, number>>((acc, t) => {
        const ym = getYYYYMM(t.date);
        acc[ym] = (acc[ym] ?? 0) + t.gbpValue;
        return acc;
      }, {})
  ).sort((a, b) => b[1] - a[1])[0];

  const lowestSpendMonthEntry = Object.entries(
    txs
      .filter((t) => t.type === "expense")
      .reduce<Record<string, number>>((acc, t) => {
        const ym = getYYYYMM(t.date);
        acc[ym] = (acc[ym] ?? 0) + t.gbpValue;
        return acc;
      }, {})
  ).sort((a, b) => a[1] - b[1])[0];

  const callouts = [
    {
      icon: "▲",
      label: "Largest Single Income",
      value: biggestIncome ? formatGbp(biggestIncome.gbpValue) : "—",
      sub: biggestIncome ? `${biggestIncome.date} · ${biggestIncome.description}` : "—",
      color: "var(--ft-green)",
    },
    {
      icon: "▼",
      label: "Largest Single Expense",
      value: biggestExpense ? formatGbp(biggestExpense.gbpValue) : "—",
      sub: biggestExpense ? `${biggestExpense.date} · ${biggestExpense.description}` : "—",
      color: "var(--ft-red)",
    },
    {
      icon: "★",
      label: "Best Month (net savings)",
      value: bestMonthEntry ? fmtYM(bestMonthEntry[0]) : "—",
      sub: bestMonthEntry ? `Saved ${formatGbp(bestMonthEntry[1])}` : "—",
      color: "var(--ft-amber)",
    },
    {
      icon: "◆",
      label: "Worst Month (net savings)",
      value: worstMonthEntry ? fmtYM(worstMonthEntry[0]) : "—",
      sub: worstMonthEntry
        ? worstMonthEntry[1] < 0 ? `Deficit ${formatGbp(Math.abs(worstMonthEntry[1]))}` : `Low savings ${formatGbp(worstMonthEntry[1])}`
        : "—",
      color: "var(--ft-red)",
    },
    {
      icon: "↑",
      label: "Highest Income Month",
      value: highestIncomeMonthEntry ? fmtYM(highestIncomeMonthEntry[0]) : "—",
      sub: highestIncomeMonthEntry ? formatGbp(highestIncomeMonthEntry[1]) + " earned" : "—",
      color: "var(--ft-cyan)",
    },
    {
      icon: "↓",
      label: "Lowest Spend Month",
      value: lowestSpendMonthEntry ? fmtYM(lowestSpendMonthEntry[0]) : "—",
      sub: lowestSpendMonthEntry ? formatGbp(lowestSpendMonthEntry[1]) + " spent" : "—",
      color: "var(--ft-blue)",
    },
  ];

  return (
    <div style={panel}>
      <div style={{ ...secTitle, borderLeft: "3px solid var(--ft-cyan)" }}>Notable Milestones &amp; Callouts</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 0 }}>
        {callouts.map((item, i) => (
          <MilestoneCard key={item.label} item={item} i={i} total={callouts.length} />
        ))}
      </div>
    </div>
  );
}

// ─── Category Breakdown ───────────────────────────────────────────────────────

const CAT_PALETTE = [
  "var(--ft-accent)",
  "var(--ft-amber)",
  "var(--ft-green)",
  "var(--ft-cyan)",
  "var(--ft-blue)",
];

interface CatRow {
  cat: string;
  val: number;
  pct: number;
}

interface CategoryRowProps {
  row: CatRow;
  rank: number;
}

function CategoryRow({ row, rank }: CategoryRowProps) {
  const [hov, setHov] = useState(false);
  const color = CAT_PALETTE[rank % CAT_PALETTE.length];
  return (
    <div
      key={row.cat}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "4px 6px",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
        borderRadius: 1,
      }}
    >
      <div style={{ ...mono, fontSize: 9, color: "var(--ft-border2)", width: 14, textAlign: "right", flexShrink: 0 }}>{rank + 1}</div>
      <div style={{ ...mono, fontSize: 11, color: "var(--ft-text)", width: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>
        {row.cat}
      </div>
      <div style={{ flex: 1, height: 12, background: "var(--ft-raised)", position: "relative", flexShrink: 1, border: "1px solid var(--ft-border)" }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${row.pct}%`,
          background: color,
          opacity: 0.75,
        }} />
      </div>
      <div className="pnum" style={{ ...mono, fontSize: 10, color, width: 46, textAlign: "right", fontWeight: 700, flexShrink: 0 }}>
        {row.pct.toFixed(1)}%
      </div>
      <div className="pnum" style={{ ...mono, fontSize: 11, color: "var(--ft-muted)", width: 76, textAlign: "right", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
        {formatGbp(row.val)}
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

  return (
    <div style={{ ...panel, marginBottom: 0 }}>
      <div style={{ ...secTitle, borderLeft: "3px solid var(--ft-accent)" }}>Top 5 Spending Categories</div>
      <div style={{ padding: "16px" }}>
        {top5.length === 0 ? (
          <div style={{ textAlign: "center", padding: "28px 0", border: "1px dashed var(--ft-border)" }}>
            <div style={{ ...mono, fontSize: 20, color: "var(--ft-border2)", marginBottom: 8 }}>—</div>
            <div style={{ ...label }}>No expense data for this year</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {top5.map((row, i) => (
              <CategoryRow key={row.cat} row={row} rank={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Legend items ────────────────────────────────────────────────────────────

interface LegendDotProps {
  color: string;
  opacity?: number;
  label_text: string;
}

function LegendDot({ color, opacity = 1, label_text }: LegendDotProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 8, height: 8, background: color, opacity, flexShrink: 0 }} />
      <span style={{ ...label, fontSize: 9 }}>{label_text}</span>
    </div>
  );
}

// ─── Month-by-Month chart ─────────────────────────────────────────────────────

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
    <div style={{ ...panel, marginBottom: 0 }}>
      <div style={{ ...secTitle, borderLeft: "3px solid var(--ft-blue)" }}>Month-by-Month Income vs Expenses</div>
      <div style={{ padding: "16px 8px 8px 8px" }}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 4, right: 0, left: -10, bottom: 0 }} barGap={2}>
            <XAxis
              dataKey="month"
              tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)", className: "pnum" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              content={(p) => (
                <MonoTooltip
                  active={p.active}
                  payload={p.payload as TooltipEntry[]}
                  label={String(p.label ?? "")}
                  formatter={(v, name) => [formatGbp(v), name]}
                />
              )}
            />
            <Bar dataKey="income" fill="var(--ft-green)" opacity={0.8} radius={0} maxBarSize={16} />
            <Bar dataKey="expenses" fill="var(--ft-red)" opacity={0.8} radius={0} maxBarSize={16} />
          </BarChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
          <LegendDot color="var(--ft-green)" label_text="Income" />
          <LegendDot color="var(--ft-red)" label_text="Expenses" />
        </div>
      </div>
    </div>
  );
}

// ─── Year-over-Year Comparison ────────────────────────────────────────────────

function YearOverYear({ currentTxs, prevTxs, year }: { currentTxs: Tx[]; prevTxs: Tx[]; year: number }) {
  const data = useMemo(() => {
    return MONTH_SHORT.map((month, i) => {
      const ym = `${year}-${String(i + 1).padStart(2, "0")}`;
      const prevYm = `${year - 1}-${String(i + 1).padStart(2, "0")}`;

      const currIncome = currentTxs.filter((t) => t.type === "income" && getYYYYMM(t.date) === ym).reduce((s, t) => s + t.gbpValue, 0);
      const currExpenses = currentTxs.filter((t) => t.type === "expense" && getYYYYMM(t.date) === ym).reduce((s, t) => s + t.gbpValue, 0);
      const prevIncome = prevTxs.filter((t) => t.type === "income" && getYYYYMM(t.date) === prevYm).reduce((s, t) => s + t.gbpValue, 0);
      const prevExpenses = prevTxs.filter((t) => t.type === "expense" && getYYYYMM(t.date) === prevYm).reduce((s, t) => s + t.gbpValue, 0);

      return {
        month,
        [`${year} expenses`]: Math.round(currExpenses) || null,
        [`${year - 1} expenses`]: Math.round(prevExpenses) || null,
        [`${year} income`]: Math.round(currIncome) || null,
        [`${year - 1} income`]: Math.round(prevIncome) || null,
      };
    });
  }, [currentTxs, prevTxs, year]);

  const currTotalIncome = currentTxs.filter((t) => t.type === "income").reduce((s, t) => s + t.gbpValue, 0);
  const currTotalExpenses = currentTxs.filter((t) => t.type === "expense").reduce((s, t) => s + t.gbpValue, 0);
  const prevTotalIncome = prevTxs.filter((t) => t.type === "income").reduce((s, t) => s + t.gbpValue, 0);
  const prevTotalExpenses = prevTxs.filter((t) => t.type === "expense").reduce((s, t) => s + t.gbpValue, 0);

  const incomeDiff = currTotalIncome - prevTotalIncome;
  const expensesDiff = currTotalExpenses - prevTotalExpenses;

  return (
    <div style={panel}>
      <div style={{ ...secTitle, borderLeft: "3px solid var(--ft-green)" }}>Year-over-Year Comparison — {year} vs {year - 1}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "var(--ft-border)", borderBottom: "1px solid var(--ft-border)" }}>
        {[
          { label: "Income", curr: currTotalIncome, prev: prevTotalIncome, diff: incomeDiff, positiveIsGood: true },
          { label: "Expenses", curr: currTotalExpenses, prev: prevTotalExpenses, diff: expensesDiff, positiveIsGood: false },
          { label: "Net Savings", curr: currTotalIncome - currTotalExpenses, prev: prevTotalIncome - prevTotalExpenses, diff: (currTotalIncome - currTotalExpenses) - (prevTotalIncome - prevTotalExpenses), positiveIsGood: true },
        ].map((item) => {
          const diffColor = item.diff === 0 ? "var(--ft-dim)" : (item.diff > 0) === item.positiveIsGood ? "var(--ft-green)" : "var(--ft-red)";
          const diffPct = item.prev !== 0 ? ((item.diff / Math.abs(item.prev)) * 100) : null;
          return (
            <div key={item.label} style={{ padding: "10px 14px", background: "var(--ft-surface)" }}>
              <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>{item.label}</div>
              <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                <div>
                  <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", marginBottom: 2 }}>{year}</div>
                  <div className="pnum" style={{ ...mono, fontSize: 14, fontWeight: 700, color: "var(--ft-text)", fontVariantNumeric: "tabular-nums" }}>{formatGbp(item.curr)}</div>
                </div>
                <div style={{ ...mono, fontSize: 8, color: "var(--ft-border2)" }}>vs</div>
                <div>
                  <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", marginBottom: 2 }}>{year - 1}</div>
                  <div className="pnum" style={{ ...mono, fontSize: 11, color: "var(--ft-muted)", fontVariantNumeric: "tabular-nums" }}>{formatGbp(item.prev)}</div>
                </div>
              </div>
              <div className="pnum" style={{ ...mono, fontSize: 10, color: diffColor, marginTop: 6, fontWeight: 600 }}>
                {item.diff >= 0 ? "+" : ""}{formatGbp(item.diff)}
                {diffPct !== null && <span style={{ fontWeight: 400, marginLeft: 5, fontSize: 9 }}>({diffPct >= 0 ? "+" : ""}{diffPct.toFixed(1)}%)</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "16px 8px 8px 8px", height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 0, left: -10, bottom: 0 }} barGap={1} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="2 4" stroke="var(--ft-border)" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)", className: "pnum" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              content={(p) => (
                <MonoTooltip
                  active={p.active}
                  payload={p.payload as TooltipEntry[]}
                  label={String(p.label ?? "")}
                  formatter={(v, name) => [formatGbp(v), name]}
                />
              )}
            />
            <Bar dataKey={`${year} expenses`} fill="var(--ft-red)" opacity={0.85} radius={0} maxBarSize={10} />
            <Bar dataKey={`${year - 1} expenses`} fill="var(--ft-red)" opacity={0.35} radius={0} maxBarSize={10} />
            <Bar dataKey={`${year} income`} fill="var(--ft-green)" opacity={0.85} radius={0} maxBarSize={10} />
            <Bar dataKey={`${year - 1} income`} fill="var(--ft-green)" opacity={0.35} radius={0} maxBarSize={10} />
          </BarChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <LegendDot color="var(--ft-red)" opacity={0.85} label_text={`${year} expenses`} />
          <LegendDot color="var(--ft-red)" opacity={0.35} label_text={`${year - 1} expenses`} />
          <LegendDot color="var(--ft-green)" opacity={0.85} label_text={`${year} income`} />
          <LegendDot color="var(--ft-green)" opacity={0.35} label_text={`${year - 1} income`} />
        </div>
      </div>
    </div>
  );
}

// ─── Savings Rate Chart ───────────────────────────────────────────────────────

function SavingsRateChart({ txs, year }: { txs: Tx[]; year: number }) {
  const data = useMemo(() => {
    return MONTH_SHORT.map((month, i) => {
      const ym = `${year}-${String(i + 1).padStart(2, "0")}`;
      const income = txs.filter((t) => t.type === "income" && getYYYYMM(t.date) === ym)
        .reduce((s, t) => s + t.gbpValue, 0);
      const expenses = txs.filter((t) => t.type === "expense" && getYYYYMM(t.date) === ym)
        .reduce((s, t) => s + t.gbpValue, 0);
      const rate = income > 0 ? Math.round(((income - expenses) / income) * 100) : null;
      return { month, rate, income: Math.round(income), expenses: Math.round(expenses) };
    });
  }, [txs, year]);

  const hasData = data.some((d) => d.rate !== null);
  if (!hasData) return null;

  return (
    <div style={panel}>
      <div style={{ ...secTitle, borderLeft: "3px solid var(--ft-amber)" }}>Monthly Savings Rate</div>
      <div style={{ padding: "16px 8px 8px 8px" }}>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ft-border)" vertical={false} />
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
              tickFormatter={(v: number) => `${v}%`}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 11 }}
              formatter={(v: number) => [`${v}%`, "Savings rate"]}
            />
            <ReferenceLine y={0} stroke="var(--ft-red)" strokeDasharray="4 2" strokeOpacity={0.6} />
            <ReferenceLine y={20} stroke="var(--ft-green)" strokeDasharray="4 2" strokeOpacity={0.35} label={{ value: "20% target", position: "insideTopRight", fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-green)" }} />
            <Line
              type="monotone"
              dataKey="rate"
              stroke="var(--ft-amber)"
              strokeWidth={2}
              dot={(props) => {
                const { cx, cy, payload } = props as { cx: number; cy: number; payload: { rate: number | null } };
                if (payload.rate === null) return <g key={`dot-null-${cx}`} />;
                const color = payload.rate >= 20 ? "var(--ft-green)" : payload.rate >= 0 ? "var(--ft-amber)" : "var(--ft-red)";
                return <circle key={`dot-${cx}`} cx={cx} cy={cy} r={3} fill={color} stroke="var(--ft-base)" strokeWidth={1.5} />;
              }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Hover Row ───────────────────────────────────────────────────────────────

function HoverRow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s ease",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Streaks & Facts ─────────────────────────────────────────────────────────

function StreaksAndFacts({ txs, year }: { txs: Tx[]; year: number }) {
  const totalTxs = txs.length;

  const dowCounts = Array(7).fill(0);
  for (const t of txs) dowCounts[getDOWIdx(t.date)]++;
  const maxDowIdx = dowCounts.indexOf(Math.max(...dowCounts));
  const mostActiveDay = DOW_LABELS[maxDowIdx];

  const catCounts: Record<string, number> = {};
  for (const t of txs.filter((t) => t.type === "expense")) {
    const c = t.category || "Other";
    catCounts[c] = (catCounts[c] || 0) + 1;
  }
  const favCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const allExpenses = txs.filter((t) => t.type === "expense");
  const avgExpense = allExpenses.length > 0
    ? allExpenses.reduce((s, t) => s + t.gbpValue, 0) / allExpenses.length
    : 0;

  const monthExpenses: Record<string, number> = {};
  for (const t of allExpenses) {
    const ym = getYYYYMM(t.date);
    monthExpenses[ym] = (monthExpenses[ym] || 0) + t.gbpValue;
  }
  const priceyMonthEntry = Object.entries(monthExpenses).sort((a, b) => b[1] - a[1])[0];
  const priceyMonthStr = priceyMonthEntry
    ? (() => { const [, m] = priceyMonthEntry[0].split("-"); return `${MONTH_SHORT[parseInt(m) - 1]}`; })()
    : "—";

  const facts = [
    { marker: "01", text: `${totalTxs} transactions logged in ${year}` },
    { marker: "02", text: `Most active spending day: ${mostActiveDay}` },
    { marker: "03", text: `Favourite spending category: ${favCat}` },
    { marker: "04", text: `Average expense per transaction: ${formatGbp(avgExpense)}` },
    { marker: "05", text: `Most expensive month: ${priceyMonthStr}` },
  ];

  return (
    <div style={panel}>
      <div style={{ ...secTitle, borderLeft: "3px solid var(--ft-blue)" }}>Data Points &amp; Habits</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {facts.map((f, i) => (
          <HoverRow
            key={f.text}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "10px 16px",
              borderBottom: i < facts.length - 1 ? "1px solid var(--ft-border)" : "none",
              cursor: "default",
            }}
          >
            <span style={{ ...mono, fontSize: 8, color: "var(--ft-border2)", letterSpacing: "0.06em", width: 18, flexShrink: 0 }}>{f.marker}</span>
            <span className="pnum" style={{ ...mono, fontSize: 11, color: "var(--ft-text)" }}>{f.text}</span>
          </HoverRow>
        ))}
      </div>
    </div>
  );
}

// ─── Net Worth Delta ─────────────────────────────────────────────────────────

function NetWorthDelta({ txs }: { txs: Tx[] }) {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;

  const totalIncome = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.gbpValue, 0);
  const totalExpenses = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.gbpValue, 0);
  const delta = totalIncome - totalExpenses;

  const accentCol = delta >= 0 ? "var(--ft-green)" : "var(--ft-red)";
  return (
    <div style={{ ...panel, overflow: "hidden", borderLeft: `3px solid ${accentCol}` }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 1, background: "var(--ft-border)" }}>
        <div style={{ padding: "18px 20px", background: "var(--ft-surface)" }}>
          <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Net Worth Delta This Year</div>
          <div className="pnum" style={{ ...mono, fontSize: 32, fontWeight: 700, color: accentCol, letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {delta >= 0 ? "+" : ""}{formatGbp(delta)}
          </div>
          <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", marginTop: 6 }}>
            Based on income vs expenses tracked
          </div>
        </div>
        <div style={{
          background: `color-mix(in srgb, ${accentCol} 6%, var(--ft-surface))`,
          padding: "18px 24px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          minWidth: 200,
        }}>
          <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
            {delta >= 0 ? "Year in the green" : "Year in the red"}
          </div>
          <div style={{ ...mono, fontSize: 13, fontWeight: 600, color: accentCol, lineHeight: 1.4 }}>
            {delta >= 0 ? "Your finances grew this year." : "Expenses outpaced income."}
          </div>
          <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>
            {delta >= 0 ? "Keep momentum going →" : "Review spending categories ↑"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shareable Card ───────────────────────────────────────────────────────────

interface ShareTileProps {
  text: string;
  value: string;
  color: string;
}

function ShareTile({ text, value, color }: ShareTileProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "12px 16px",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
    >
      <div style={{ ...label, marginBottom: 4 }}>{text}</div>
      <div className="pnum" style={{ ...mono, fontSize: 20, fontWeight: 700, color, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" }}>
        {value}
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

  const tiles = [
    { text: "Earned", value: formatGbp(income), color: "var(--ft-green)" },
    { text: "Spent", value: formatGbp(expenses), color: "var(--ft-red)" },
    { text: "Saved", value: formatGbp(net), color: net >= 0 ? "var(--ft-amber)" : "var(--ft-red)" },
  ];

  return (
    <div style={{
      background: "var(--ft-base)",
      border: "1px solid var(--ft-border)",
      borderLeft: "4px solid var(--ft-accent)",
      padding: "24px 28px",
      marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ ...mono, fontSize: 9, color: "var(--ft-accent)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
            NUMERIS · MY YEAR IN NUMBERS
          </div>
          <div style={{ ...mono, fontSize: 24, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.04em" }}>
            {year}
          </div>
        </div>
        <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", textAlign: "right" }}>
          <div>{txCount} transactions tracked</div>
          <div className="pnum" style={{ marginTop: 4, color: savingsRate >= 20 ? "var(--ft-green)" : savingsRate >= 10 ? "var(--ft-amber)" : "var(--ft-red)", fontWeight: 600 }}>
            {savingsRate.toFixed(1)}% savings rate
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "var(--ft-border)", marginBottom: 16 }}>
        {tiles.map((s) => (
          <ShareTile key={s.text} text={s.text} value={s.value} color={s.color} />
        ))}
      </div>
      <div style={{ height: 4, background: "var(--ft-raised)", border: "1px solid var(--ft-border)", overflow: "hidden", marginBottom: 6 }}>
        <div style={{
          height: "100%",
          width: `${Math.min(100, Math.max(0, savingsRate))}%`,
          background: savingsRate >= 20 ? "var(--ft-green)" : savingsRate >= 10 ? "var(--ft-amber)" : "var(--ft-red)",
        }} />
      </div>
      <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>
        Savings rate: <span className="pnum" style={{ color: savingsRate >= 20 ? "var(--ft-green)" : savingsRate >= 10 ? "var(--ft-amber)" : "var(--ft-red)", fontWeight: 600 }}>{savingsRate.toFixed(1)}%</span>
        <span style={{ marginLeft: 12 }}>
          {savingsRate >= 20 ? "· on target (≥20%)" : savingsRate >= 10 ? "· below target — aim for 20%" : "· below 10% — review spending"}
        </span>
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

  const prevYearTxs = useMemo(
    () => allTxs.filter((t) => t.date.startsWith(String(year - 1))),
    [allTxs, year]
  );

  const hasPrevYear = prevYearTxs.length > 0;

  const totalIncome = useMemo(
    () => yearTxs.filter((t) => t.type === "income").reduce((s, t) => s + t.gbpValue, 0),
    [yearTxs]
  );
  const totalExpenses = useMemo(
    () => yearTxs.filter((t) => t.type === "expense").reduce((s, t) => s + t.gbpValue, 0),
    [yearTxs]
  );

  const prevIncome = useMemo(
    () => prevYearTxs.filter((t) => t.type === "income").reduce((s, t) => s + t.gbpValue, 0),
    [prevYearTxs]
  );
  const prevExpenses = useMemo(
    () => prevYearTxs.filter((t) => t.type === "expense").reduce((s, t) => s + t.gbpValue, 0),
    [prevYearTxs]
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

  // ── Wrapped mode ─────────────────────────────────────────────────────────────
  const [wrappedActive, setWrappedActive] = useState(false);
  const [chapter, setChapter] = useState(0);
  const [chapFade, setChapFade] = useState(true);

  const wrappedData = useMemo(() => {
    const expenses = yearTxs.filter(t => t.type === "expense");
    const incomes = yearTxs.filter(t => t.type === "income");
    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

    const catMap: Record<string, number> = {};
    for (const t of expenses) catMap[t.category || "Other"] = (catMap[t.category || "Other"] ?? 0) + t.gbpValue;
    const topCatEntry = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];

    const biggestExpense = expenses.reduce<Tx | null>((top, t) => !top || t.gbpValue > top.gbpValue ? t : top, null);
    const biggestIncome = incomes.reduce<Tx | null>((top, t) => !top || t.gbpValue > top.gbpValue ? t : top, null);

    const monthlyNet: Record<string, number> = {};
    for (const t of yearTxs) {
      const ym = t.date.slice(0, 7);
      monthlyNet[ym] = (monthlyNet[ym] ?? 0) + (t.type === "income" ? t.gbpValue : -t.gbpValue);
    }
    const bestMonthEntry = Object.entries(monthlyNet).sort((a, b) => b[1] - a[1])[0];

    const dowCounts = new Array(7).fill(0);
    for (const t of yearTxs) dowCounts[getDOWIdx(t.date)]++;
    const topDow = DOW_LABELS[dowCounts.indexOf(Math.max(...dowCounts))];

    return { savingsRate, topCatEntry, biggestExpense, biggestIncome, bestMonthEntry, topDow };
  }, [yearTxs, totalIncome, totalExpenses]);

  const CHAPTER_COUNT = 8;

  const gotoChapter = useCallback((idx: number) => {
    if (idx < 0 || idx >= CHAPTER_COUNT) return;
    setChapFade(false);
    setTimeout(() => { setChapter(idx); setChapFade(true); }, 180);
  }, []);

  useEffect(() => {
    if (!wrappedActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); gotoChapter(chapter + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); gotoChapter(chapter - 1); }
      else if (e.key === "Escape") { setWrappedActive(false); setChapter(0); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [wrappedActive, chapter, gotoChapter]);

  const net = totalIncome - totalExpenses;
  const ACCENT_COLORS = ["var(--ft-accent)", "var(--ft-green)", "var(--ft-red)", "var(--ft-amber)", "var(--ft-cyan)", "var(--ft-accent)", "var(--ft-green)", "var(--ft-amber)"];

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Loading year data…
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Wrapped overlay */}
      {wrappedActive && yearTxs.length > 0 && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "var(--ft-base)",
          display: "flex", flexDirection: "column",
          fontFamily: "var(--font-mono)",
        }}>
          {/* Progress bar */}
          <div style={{ display: "flex", gap: 3, padding: "16px 24px 0" }}>
            {Array.from({ length: CHAPTER_COUNT }, (_, i) => (
              <div
                key={i}
                onClick={() => gotoChapter(i)}
                style={{
                  flex: 1, height: 3, cursor: "pointer",
                  background: i <= chapter ? "var(--ft-accent)" : "var(--ft-border2)",
                  transition: "background 0.1s",
                }}
              />
            ))}
          </div>

          {/* Close */}
          <button
            onClick={() => { setWrappedActive(false); setChapter(0); }}
            style={{ position: "absolute", top: 20, right: 24, background: "none", border: "none", cursor: "pointer", color: "var(--ft-muted)", fontSize: 20, lineHeight: 1, padding: 4 }}
            title="Exit Wrapped (Esc)"
          >
            ×
          </button>

          {/* Chapter content */}
          <div style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "40px 48px", textAlign: "center",
            opacity: chapFade ? 1 : 0, transform: chapFade ? "translateY(0)" : "translateY(12px)",
            transition: "opacity 0.18s ease, transform 0.18s ease",
          }}>
            <div style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: ACCENT_COLORS[chapter], marginBottom: 12, opacity: 0.8 }}>
              {["· INTRO ·", "· INCOME ·", "· SPENDING ·", "· SAVINGS ·", "· TOP CATEGORY ·", "· BIGGEST MOMENTS ·", "· HABITS ·", "· SUMMARY ·"][chapter]}
            </div>

            {chapter === 0 && (
              <>
                <div style={{ fontSize: 14, color: "var(--ft-dim)", letterSpacing: "0.1em", marginBottom: 6, textTransform: "uppercase" }}>Your</div>
                <div style={{ fontSize: 88, fontWeight: 900, color: "var(--ft-accent)", letterSpacing: "-0.04em", lineHeight: 0.9, marginBottom: 8 }}>{year}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 24 }}>Wrapped</div>
                <Text as="div" size={11} color="var(--ft-dim)" letterSpacing="0.04em">{yearTxs.length} transactions · press → to begin</Text>
              </>
            )}

            {chapter === 1 && (
              <>
                <div style={{ fontSize: 16, color: "var(--ft-dim)", letterSpacing: "0.06em", marginBottom: 16 }}>This year, you earned</div>
                <div className="pnum" style={{ fontSize: 72, fontWeight: 900, color: "var(--ft-green)", letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 12 }}>{formatGbp(totalIncome)}</div>
                <Text as="div" size={12} color="var(--ft-muted)">across {yearTxs.filter(t => t.type === "income").length} income transactions</Text>
                {wrappedData.biggestIncome && (
                  <div style={{ marginTop: 24, padding: "12px 20px", border: "1px solid var(--ft-border)", maxWidth: 360 }}>
                    <div style={{ fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.1em", marginBottom: 4 }}>LARGEST SINGLE INCOME</div>
                    <div className="pnum" style={{ fontSize: 18, fontWeight: 700, color: "var(--ft-green)" }}>{formatGbp(wrappedData.biggestIncome.gbpValue)}</div>
                    <div style={{ fontSize: 10, color: "var(--ft-muted)", marginTop: 2 }}>{wrappedData.biggestIncome.description} · {wrappedData.biggestIncome.date}</div>
                  </div>
                )}
              </>
            )}

            {chapter === 2 && (
              <>
                <div style={{ fontSize: 16, color: "var(--ft-dim)", letterSpacing: "0.06em", marginBottom: 16 }}>You spent</div>
                <div className="pnum" style={{ fontSize: 72, fontWeight: 900, color: "var(--ft-red)", letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 12 }}>{formatGbp(totalExpenses)}</div>
                <Text as="div" size={12} color="var(--ft-muted)">across {yearTxs.filter(t => t.type === "expense").length} expense transactions</Text>
                {wrappedData.topCatEntry && (
                  <div style={{ marginTop: 24, padding: "12px 20px", border: "1px solid var(--ft-border)", maxWidth: 360 }}>
                    <div style={{ fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.1em", marginBottom: 4 }}>TOP SPENDING CATEGORY</div>
                    <Text as="div" size={18} weight={700} color="var(--ft-red)">{wrappedData.topCatEntry[0]}</Text>
                    <div className="pnum" style={{ fontSize: 10, color: "var(--ft-muted)", marginTop: 2 }}>{formatGbp(wrappedData.topCatEntry[1])} total</div>
                  </div>
                )}
              </>
            )}

            {chapter === 3 && (
              <>
                <div style={{ fontSize: 16, color: "var(--ft-dim)", letterSpacing: "0.06em", marginBottom: 16 }}>
                  {net >= 0 ? "You saved" : "You overspent by"}
                </div>
                <div className="pnum" style={{ fontSize: 72, fontWeight: 900, color: net >= 0 ? "var(--ft-green)" : "var(--ft-red)", letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 12 }}>
                  {formatGbp(Math.abs(net))}
                </div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)", marginBottom: 20 }}>
                  Savings rate: {wrappedData.savingsRate.toFixed(1)}%
                </div>
                <div style={{ width: "100%", maxWidth: 320, height: 8, background: "var(--ft-border2)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.min(100, Math.max(0, wrappedData.savingsRate))}%`,
                    background: wrappedData.savingsRate >= 20 ? "var(--ft-green)" : wrappedData.savingsRate >= 10 ? "var(--ft-amber)" : "var(--ft-red)",
                    transition: "width 0.25s ease",
                  }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--ft-dim)", marginTop: 10 }}>
                  {wrappedData.savingsRate >= 20 ? "Excellent! You're saving over 20% of income." : wrappedData.savingsRate >= 10 ? "Good — you're above the 10% savings benchmark." : "Room to grow — aim for 10%+ savings rate."}
                </div>
              </>
            )}

            {chapter === 4 && (() => {
              const expenseList = yearTxs.filter(t => t.type === "expense");
              const catMap: Record<string, number> = {};
              for (const t of expenseList) catMap[t.category || "Other"] = (catMap[t.category || "Other"] ?? 0) + t.gbpValue;
              const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
              const maxVal = topCats[0]?.[1] ?? 1;
              return (
                <>
                  <div style={{ fontSize: 16, color: "var(--ft-dim)", letterSpacing: "0.06em", marginBottom: 28 }}>Where your money went</div>
                  <div style={{ width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", gap: 10 }}>
                    {topCats.map(([cat, amt], i) => (
                      <div key={cat}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <Text as="span" size={13} weight={i === 0 ? 700 : 400} color={i === 0 ? "var(--ft-accent)" : "var(--ft-text)"}>{i === 0 ? "★ " : ""}{cat}</Text>
                          <span className="pnum" style={{ fontSize: 13, color: "var(--ft-muted)" }}>{formatGbp(amt)}</span>
                        </div>
                        <div style={{ height: 4, background: "var(--ft-border2)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${(amt / maxVal) * 100}%`, background: i === 0 ? "var(--ft-accent)" : "var(--ft-border2)", transition: "width 0.25s ease" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}

            {chapter === 5 && (
              <>
                <div style={{ fontSize: 16, color: "var(--ft-dim)", letterSpacing: "0.06em", marginBottom: 28 }}>Your biggest moments</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, width: "100%", maxWidth: 520 }}>
                  {wrappedData.biggestExpense && (
                    <div style={{ padding: "16px", border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.05)", textAlign: "left" }}>
                      <div style={{ fontSize: 9, letterSpacing: "0.1em", color: "var(--ft-red)", marginBottom: 8 }}>BIGGEST EXPENSE</div>
                      <div className="pnum" style={{ fontSize: 22, fontWeight: 700, color: "var(--ft-red)", marginBottom: 4 }}>{formatGbp(wrappedData.biggestExpense.gbpValue)}</div>
                      <div style={{ fontSize: 10, color: "var(--ft-muted)", marginBottom: 2 }}>{wrappedData.biggestExpense.description}</div>
                      <Text as="div" size={9} color="var(--ft-dim)">{wrappedData.biggestExpense.date}</Text>
                    </div>
                  )}
                  {wrappedData.bestMonthEntry && (
                    <div style={{ padding: "16px", border: "1px solid rgba(63,185,80,0.3)", background: "rgba(63,185,80,0.05)", textAlign: "left" }}>
                      <div style={{ fontSize: 9, letterSpacing: "0.1em", color: "var(--ft-green)", marginBottom: 8 }}>BEST MONTH</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ft-green)", marginBottom: 4 }}>{fmtYM(wrappedData.bestMonthEntry[0])}</div>
                      <div className="pnum" style={{ fontSize: 10, color: "var(--ft-muted)" }}>Saved {formatGbp(wrappedData.bestMonthEntry[1])}</div>
                    </div>
                  )}
                </div>
              </>
            )}

            {chapter === 6 && (
              <>
                <div style={{ fontSize: 16, color: "var(--ft-dim)", letterSpacing: "0.06em", marginBottom: 16 }}>You spend most on</div>
                <div style={{ fontSize: 52, fontWeight: 900, color: "var(--ft-amber)", letterSpacing: "0.02em", marginBottom: 12 }}>{wrappedData.topDow}s</div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)", marginBottom: 28 }}>That's your most active spending day</div>
                {wrappedData.topCatEntry && (
                  <Text as="div" size={13} color="var(--ft-dim)">
                    Your go-to category: <Text as="span" weight={700} color="var(--ft-accent)">{wrappedData.topCatEntry[0]}</Text>
                  </Text>
                )}
              </>
            )}

            {chapter === 7 && (
              <>
                <div style={{ fontSize: 12, color: "var(--ft-dim)", letterSpacing: "0.08em", marginBottom: 24 }}>YOUR {year} IN NUMBERS</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, width: "100%", maxWidth: 480, marginBottom: 20 }}>
                  {[
                    { label: "Earned", value: formatGbp(totalIncome), color: "var(--ft-green)" },
                    { label: "Spent", value: formatGbp(totalExpenses), color: "var(--ft-red)" },
                    { label: "Saved", value: (net >= 0 ? "+" : "") + formatGbp(net), color: net >= 0 ? "var(--ft-green)" : "var(--ft-red)" },
                    { label: "Savings Rate", value: `${wrappedData.savingsRate.toFixed(1)}%`, color: "var(--ft-amber)" },
                    { label: "Transactions", value: String(yearTxs.length), color: "var(--ft-text)" },
                    { label: "Top Category", value: wrappedData.topCatEntry?.[0] ?? "—", color: "var(--ft-accent)" },
                  ].map(item => (
                    <div key={item.label} style={{ padding: "10px 12px", border: "1px solid var(--ft-border)", background: "var(--ft-surface)", textAlign: "left" }}>
                      <div style={{ fontSize: 8, letterSpacing: "0.1em", color: "var(--ft-dim)", marginBottom: 4, textTransform: "uppercase" }}>{item.label}</div>
                      <div className="pnum" style={{ fontSize: 14, fontWeight: 700, color: item.color }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => { setWrappedActive(false); setChapter(0); }}
                  style={{ fontFamily: "var(--font-mono)", fontSize: 11, padding: "8px 20px", border: "1px solid var(--ft-accent)", background: "transparent", color: "var(--ft-accent)", cursor: "pointer", letterSpacing: "0.06em" }}
                >
                  → See Full Report
                </button>
              </>
            )}
          </div>

          {/* Navigation */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, padding: "16px 24px 24px" }}>
            <button
              onClick={() => gotoChapter(chapter - 1)}
              disabled={chapter === 0}
              style={{ background: "none", border: "1px solid var(--ft-border)", color: chapter === 0 ? "var(--ft-border2)" : "var(--ft-muted)", width: 36, height: 36, cursor: chapter === 0 ? "default" : "pointer", fontFamily: "var(--font-mono)", fontSize: 16 }}
            >←</button>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em" }}>
              {chapter + 1} / {CHAPTER_COUNT}
            </div>
            <button
              onClick={() => gotoChapter(chapter + 1)}
              disabled={chapter === CHAPTER_COUNT - 1}
              style={{ background: "none", border: "1px solid var(--ft-border)", color: chapter === CHAPTER_COUNT - 1 ? "var(--ft-border2)" : "var(--ft-muted)", width: 36, height: 36, cursor: chapter === CHAPTER_COUNT - 1 ? "default" : "pointer", fontFamily: "var(--font-mono)", fontSize: 16 }}
            >→</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1 }}>
            YEAR IN REVIEW · {year}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.04em", marginTop: 4 }}>
            your financial year — wrapped
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {yearTxs.length > 0 && (
            <button
              onClick={() => { setChapter(0); setChapFade(true); setWrappedActive(true); }}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "4px 12px",
                cursor: "pointer",
                border: "1px solid var(--ft-accent)",
                background: "var(--ft-accent)",
                color: "var(--ft-base)",
                fontWeight: 700,
              }}
            >
              ▶ Play Wrapped
            </button>
          )}
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
            <>
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
              <button
                onClick={() => window.print()}
                className="ft-no-print"
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
                ⎙ Print
              </button>
            </>
          )}
        </div>
      </div>

      {/* Persona context strip */}
      {(() => {
        const pid = loadPersonaIds()[0];
        if (!pid || pid === "full") return null;
        const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : null;
        const msgs: Record<string, string | null> = {
          wealth:  savingsRate !== null ? `${year} savings rate: ${savingsRate.toFixed(1)}%. This annual view is your benchmark — track year-on-year improvements to your accumulation velocity.` : `Run your year-in-review to track savings rate trends and validate your wealth accumulation pace.`,
          budget:  `Use this annual view to spot category drift year-on-year — categories that crept up expose where budget discipline has slipped.`,
          market:  net > 0 ? `${year} net surplus: ${formatGbp(net)}. Each surplus year adds to your deployable capital — cross-reference with Investments to see how it was allocated.` : null,
          social:  null,
        };
        const msg = msgs[pid];
        if (!msg) return null;
        const color = PERSONA_COLORS[pid as keyof typeof PERSONA_COLORS] ?? "var(--ft-accent)";
        return (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", border: "1px solid var(--ft-border)", borderLeft: `3px solid ${color}`, background: "var(--ft-surface)", padding: "7px 14px 7px 10px", marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color, fontWeight: 700, flexShrink: 0 }}>·</span>
            <span className="pnum">{msg}</span>
          </div>
        );
      })()}

      {yearTxs.length === 0 ? (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "48px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, minHeight: "calc(100vh - 200px)", justifyContent: "center" }}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ opacity: 0.25 }}>
            <rect x="6" y="10" width="36" height="30" rx="2" stroke="var(--ft-text)" strokeWidth="2" />
            <path d="M6 18h36" stroke="var(--ft-text)" strokeWidth="2" />
            <path d="M14 6v8M34 6v8" stroke="var(--ft-text)" strokeWidth="2" strokeLinecap="round" />
            <path d="M13 27h8M13 33h14" stroke="var(--ft-text)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ft-muted)", marginBottom: 6, fontWeight: 700 }}>
              No transactions recorded for {year}
            </div>
            <Text as="div" mono size={10} color="var(--ft-dim)" letterSpacing="0.06em">
              Import or add transactions to unlock your {year} wrapped report — top categories, biggest moments, and month-by-month breakdown.
            </Text>
          </div>
          <a
            href="/transactions"
            style={{ display: "inline-block", padding: "10px 20px", background: "var(--ft-accent)", color: "var(--ft-base)", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", border: "none", cursor: "pointer", textDecoration: "none", minHeight: 44, lineHeight: "24px" }}
          >
            + ADD TRANSACTIONS
          </a>
        </div>
      ) : (
        <>
          {/* KPI Bar */}
          <KpiStrip
            income={totalIncome}
            expenses={totalExpenses}
            txCount={yearTxs.length}
            year={year}
            prevIncome={hasPrevYear ? prevIncome : undefined}
            prevExpenses={hasPrevYear ? prevExpenses : undefined}
          />

          {/* Notable Milestones */}
          <BiggestMoments txs={yearTxs} />

          {/* Spending Heatmap */}
          <SpendingHeatmap txs={yearTxs} year={year} />

          {/* Two-column: Categories + Month-by-Month */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <CategoryBreakdown expenses={yearTxs.filter((t) => t.type === "expense")} />
            <MonthByMonth txs={yearTxs} year={year} />
          </div>

          {/* Quarter Breakdown */}
          <QuarterBreakdown txs={yearTxs} year={year} prevTxs={hasPrevYear ? prevYearTxs : undefined} />

          {/* YoY Comparison — only show when prior year has data */}
          {hasPrevYear && (
            <YearOverYear currentTxs={yearTxs} prevTxs={prevYearTxs} year={year} />
          )}

          {/* Savings Rate Line */}
          <SavingsRateChart txs={yearTxs} year={year} />

          {/* Habits */}
          <StreaksAndFacts txs={yearTxs} year={year} />

          {/* Net Worth Delta */}
          <NetWorthDelta txs={yearTxs} />

          {/* Shareable card */}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
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
