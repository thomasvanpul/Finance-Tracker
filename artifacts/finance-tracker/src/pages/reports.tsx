import { useState, useMemo } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { useListTransactions, useGetDashboard } from "@workspace/api-client-react";
import { formatGbp, formatDate } from "@/lib/utils";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function firstOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

function formatMonthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleString("en-GB", { month: "short", year: "numeric" });
}

function formatMonthAbbr(yyyyMM: string): string {
  const [year, month] = yyyyMM.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleString("en-GB", { month: "short" });
}

function exportCsv(rows: Array<{
  date: string;
  description: string;
  type: string;
  category: string;
  nativeAmount: number;
  currency: string;
  gbpValue: number;
}>) {
  const header = ["Date", "Description", "Type", "Category", "Amount (Native)", "Currency", "Amount (GBP)"];
  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.date,
        r.description,
        r.type,
        r.category,
        Math.abs(r.nativeAmount).toFixed(2),
        r.currency,
        Math.abs(r.gbpValue).toFixed(2),
      ]
        .map(escape)
        .join(",")
    ),
  ];
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const filename = `reports-${new Date().toISOString().slice(0, 10)}.csv`;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const SECTION_LABEL: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  color: "var(--ft-dim)",
  marginBottom: 10,
};

const CARD: React.CSSProperties = {
  background: "var(--ft-surface)",
  border: "1px solid var(--ft-border)",
};

const TH: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 10,
  fontWeight: 600,
  color: "var(--ft-dim)",
  background: "var(--ft-surface)",
  borderBottom: "2px solid var(--ft-border2)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.4px",
  whiteSpace: "nowrap" as const,
  fontFamily: "var(--font-mono)",
};

const TD: React.CSSProperties = {
  padding: "7px 12px",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  borderBottom: "1px solid var(--ft-raised)",
  color: "var(--ft-text)",
  whiteSpace: "nowrap" as const,
};

const PALETTE = [
  "var(--ft-accent)",
  "var(--ft-amber)",
  "var(--ft-cyan)",
  "#56D364",
  "#79C0FF",
  "#E6B450",
  "var(--ft-red)",
  "var(--ft-blue)",
];

const QUICK_RANGES = [
  { label: "This month", getRange: () => ({ from: firstOfMonth(), to: today() }) },
  {
    label: "Last month", getRange: () => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const to = `${y}-${String(m + 1).padStart(2, "0")}-${String(new Date(y, m + 1, 0).getDate()).padStart(2, "0")}`;
      return { from, to };
    }
  },
  { label: "Last 3M", getRange: () => ({ from: monthsAgo(3), to: today() }) },
  { label: "Last 6M", getRange: () => ({ from: monthsAgo(6), to: today() }) },
  { label: "YTD", getRange: () => ({ from: firstOfYear(), to: today() }) },
  { label: "All time", getRange: () => ({ from: "", to: "" }) },
];

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function TrendTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{
      background: "var(--ft-raised)",
      border: "1px solid var(--ft-border2)",
      padding: "10px 14px",
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      minWidth: 160,
    }}>
      <div style={{ color: "var(--ft-muted)", marginBottom: 6, fontSize: 10 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: "flex", justifyContent: "space-between", gap: 16, color: p.color, marginBottom: 2 }}>
          <span style={{ color: "var(--ft-dim)" }}>{p.name}</span>
          <span>{p.value < 0 ? "−" : ""}{formatGbp(Math.abs(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

function DonutTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0];
  return (
    <div style={{
      background: "var(--ft-raised)",
      border: "1px solid var(--ft-border2)",
      padding: "8px 12px",
      fontFamily: "var(--font-mono)",
      fontSize: 11,
    }}>
      <span style={{ color: "var(--ft-muted)" }}>{p.name}: </span>
      <span style={{ color: "var(--ft-text)" }}>{formatGbp(p.value)}</span>
    </div>
  );
}

export default function Reports() {
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(today());
  const [activeQuick, setActiveQuick] = useState("This month");

  const applyQuick = (qr: typeof QUICK_RANGES[number]) => {
    const { from, to } = qr.getRange();
    setDateFrom(from);
    setDateTo(to);
    setActiveQuick(qr.label);
  };

  const apiParams = useMemo(() => {
    const p: { dateFrom?: string; dateTo?: string } = {};
    if (dateFrom) p.dateFrom = dateFrom;
    if (dateTo) p.dateTo = dateTo;
    return p;
  }, [dateFrom, dateTo]);

  const { data: transactions, isLoading } = useListTransactions(apiParams);
  const { data: dashboard } = useGetDashboard();

  const { income, expenses, txList } = useMemo(() => {
    const list = transactions ?? [];
    let inc = 0;
    let exp = 0;
    for (const tx of list) {
      if (tx.type === "income") inc += tx.gbpValue;
      else if (tx.type === "expense") exp += tx.gbpValue;
    }
    return { income: inc, expenses: exp, txList: list };
  }, [transactions]);

  const netSavings = income - expenses;
  const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : null;

  const topCategories = useMemo(() => {
    const expenseTxs = txList.filter((tx) => tx.type === "expense");
    const totals: Record<string, number> = {};
    for (const tx of expenseTxs) {
      const cat = tx.category || "Other";
      totals[cat] = (totals[cat] ?? 0) + tx.gbpValue;
    }
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [txList]);

  const totalExpenses = topCategories.reduce((s, [, v]) => s + v, 0);

  const monthlyHistory = useMemo(() => {
    const all = dashboard?.monthlyHistory ?? [];
    if (!dateFrom && !dateTo) return all;
    return all.filter((m) => {
      if (dateFrom && m.month < dateFrom.slice(0, 7)) return false;
      if (dateTo && m.month > dateTo.slice(0, 7)) return false;
      return true;
    });
  }, [dashboard, dateFrom, dateTo]);

  const biggestTxs = useMemo(() => {
    return [...txList]
      .sort((a, b) => b.gbpValue - a.gbpValue)
      .slice(0, 10);
  }, [txList]);

  const kpiTiles = [
    {
      label: "Total Income",
      value: `+${formatGbp(income)}`,
      color: "var(--ft-green)",
      bg: "rgba(63,185,80,0.06)",
    },
    {
      label: "Total Expenses",
      value: `-${formatGbp(expenses)}`,
      color: "var(--ft-red)",
      bg: "rgba(248,81,73,0.06)",
    },
    {
      label: "Net Savings",
      value: `${netSavings >= 0 ? "+" : ""}${formatGbp(netSavings)}`,
      color: netSavings >= 0 ? "var(--ft-green)" : "var(--ft-red)",
      bg: netSavings >= 0 ? "rgba(63,185,80,0.06)" : "rgba(248,81,73,0.06)",
    },
    {
      label: "Savings Rate",
      value: savingsRate !== null ? `${savingsRate.toFixed(1)}%` : "—",
      color: savingsRate !== null && savingsRate >= 0 ? "var(--ft-cyan)" : "var(--ft-red)",
      bg: "rgba(96,165,250,0.06)",
    },
  ];

  const trendChartData = useMemo(() => {
    return monthlyHistory.map((m) => ({
      month: formatMonthAbbr(m.month),
      income: m.income,
      expenses: m.expenses,
      net: m.netSavings,
    }));
  }, [monthlyHistory]);

  const donutData = useMemo(() => [
    { name: "Income", value: income },
    { name: "Expenses", value: expenses },
  ], [income, expenses]);

  const dowSpend = useMemo(() => {
    const sums = [0, 0, 0, 0, 0, 0, 0];
    for (const tx of txList) {
      if (tx.type !== "expense") continue;
      const d = new Date(tx.date);
      let dow = d.getDay();
      dow = dow === 0 ? 6 : dow - 1;
      sums[dow] += tx.gbpValue;
    }
    return sums;
  }, [txList]);

  const dowMax = Math.max(...dowSpend, 1);
  const dowHighestIdx = dowSpend.indexOf(Math.max(...dowSpend));

  const last3Months = useMemo(() => {
    const all = dashboard?.monthlyHistory ?? [];
    return all.slice(-3);
  }, [dashboard]);

  const categorySparklines = useMemo(() => {
    const result: Record<string, number[]> = {};
    for (const [cat] of topCategories) {
      result[cat] = last3Months.map((m) => {
        let sum = 0;
        for (const tx of txList) {
          if (tx.type !== "expense") continue;
          if ((tx.category || "Other") !== cat) continue;
          if (tx.date.slice(0, 7) !== m.month) continue;
          sum += tx.gbpValue;
        }
        return sum;
      });
    }
    return result;
  }, [topCategories, last3Months, txList]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 20px",
        borderBottom: "1px solid var(--ft-border)",
        background: "var(--ft-surface)",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: "var(--ft-text)",
          }}>
            REPORTS
          </span>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ft-dim)",
            letterSpacing: "0.04em",
          }}>
            income · expenses · trends
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {QUICK_RANGES.map((qr) => (
              <button
                key={qr.label}
                onClick={() => applyQuick(qr)}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  background: activeQuick === qr.label ? "rgba(244,162,30,0.12)" : "var(--ft-raised)",
                  color: activeQuick === qr.label ? "var(--ft-accent)" : "var(--ft-muted)",
                  border: `1px solid ${activeQuick === qr.label ? "rgba(244,162,30,0.4)" : "var(--ft-border2)"}`,
                  borderRadius: 2,
                  cursor: "pointer",
                }}
              >
                {qr.label}
              </button>
            ))}
          </div>
          <div style={{ width: 1, height: 24, background: "var(--ft-border2)", margin: "0 4px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}>From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setActiveQuick(""); }}
              style={{
                height: 28,
                padding: "0 8px",
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                background: "var(--ft-raised)",
                border: "1px solid var(--ft-border2)",
                borderRadius: 2,
                color: "var(--ft-text)",
                outline: "none",
              }}
            />
            <span style={{ fontSize: 11, color: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}>To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setActiveQuick(""); }}
              style={{
                height: 28,
                padding: "0 8px",
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                background: "var(--ft-raised)",
                border: "1px solid var(--ft-border2)",
                borderRadius: 2,
                color: "var(--ft-text)",
                outline: "none",
              }}
            />
          </div>
          <div style={{ width: 1, height: 24, background: "var(--ft-border2)", margin: "0 4px" }} />
          <button
            onClick={() => exportCsv(txList)}
            style={{
              background: "var(--ft-raised)",
              color: "var(--ft-muted)",
              border: "1px solid var(--ft-border)",
              borderRadius: 2,
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              padding: "5px 12px",
              cursor: "pointer",
            }}
          >
            ↓ Export CSV
          </button>
          <button
            onClick={() => window.print()}
            className="ft-no-print"
            style={{
              background: "var(--ft-raised)",
              color: "var(--ft-muted)",
              border: "1px solid var(--ft-border)",
              borderRadius: 2,
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              padding: "5px 12px",
              cursor: "pointer",
            }}
          >
            ↓ Export PDF
          </button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--ft-border)" }}>
        <div className="ft-four-col" style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          flex: 1,
        }}>
          {kpiTiles.map((tile, i) => (
            <div
              key={tile.label}
              style={{
                background: tile.bg,
                borderRight: i < 3 ? "1px solid var(--ft-border)" : undefined,
                padding: "16px 20px",
              }}
            >
              <div style={{ ...SECTION_LABEL, marginBottom: 6 }}>{tile.label}</div>
              {isLoading ? (
                <div style={{ height: 24, width: 80, background: "var(--ft-raised)", borderRadius: 2 }} />
              ) : (
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 20,
                    fontWeight: 700,
                    color: tile.color,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {tile.value}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{
          width: 200,
          borderLeft: "1px solid var(--ft-border)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "12px 0",
          background: "var(--ft-surface)",
          position: "relative",
        }}>
          <div style={{ ...SECTION_LABEL, position: "absolute", top: 12, left: 16, marginBottom: 0 }}>
            Income vs Expenses
          </div>
          <PieChart width={180} height={140}>
            <Pie
              data={donutData}
              cx={90}
              cy={70}
              innerRadius={45}
              outerRadius={62}
              dataKey="value"
              strokeWidth={0}
            >
              <Cell fill="var(--ft-green)" fillOpacity={0.85} />
              <Cell fill="var(--ft-red)" fillOpacity={0.85} />
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
          <div style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
            pointerEvents: "none",
            marginTop: 6,
          }}>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 14,
              fontWeight: 700,
              color: savingsRate !== null && savingsRate >= 0 ? "var(--ft-green)" : "var(--ft-red)",
              lineHeight: 1,
            }}>
              {savingsRate !== null ? `${savingsRate.toFixed(0)}%` : "—"}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>
              SAVED
            </div>
          </div>
        </div>
      </div>

      <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>

        <div style={{ borderRight: "1px solid var(--ft-border)", borderBottom: "1px solid var(--ft-border)" }}>
          <div style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--ft-border)",
            background: "var(--ft-surface)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Top Categories by Spend
            </span>
          </div>
          {isLoading ? (
            <div style={{ padding: 16, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>
              Loading…
            </div>
          ) : topCategories.length === 0 ? (
            <div style={{ padding: 20, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center" }}>
              No expense transactions in this range
            </div>
          ) : (
            <div style={{ padding: "12px 16px 14px" }}>
              {topCategories.map(([cat, amount], i) => {
                const pct = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0;
                const color = PALETTE[i % PALETTE.length];
                const sparkVals = categorySparklines[cat] ?? [];
                const sparkMax = Math.max(...sparkVals, 1);
                return (
                  <div key={cat} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>
                        {cat}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {sparkVals.length > 0 && (
                          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 18 }}>
                            {sparkVals.map((v, si) => (
                              <div
                                key={si}
                                title={`${last3Months[si]?.month ?? ""}: ${formatGbp(v)}`}
                                style={{
                                  width: 5,
                                  height: sparkMax > 0 ? `${Math.max(2, (v / sparkMax) * 18)}px` : "2px",
                                  background: color,
                                  opacity: 0.5 + (si / sparkVals.length) * 0.5,
                                  borderRadius: 1,
                                }}
                              />
                            ))}
                          </div>
                        )}
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
                          {pct.toFixed(1)}%
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color }}>
                          −{formatGbp(amount)}
                        </span>
                      </div>
                    </div>
                    <div style={{ height: 3, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          background: color,
                          borderRadius: 2,
                          transition: "width 0.4s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ borderBottom: "1px solid var(--ft-border)" }}>
          <div style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--ft-border)",
            background: "var(--ft-surface)",
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Monthly Trend
            </span>
          </div>

          {trendChartData.length > 0 && (
            <div style={{ padding: "12px 8px 0" }}>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={trendChartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--ft-green)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--ft-green)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--ft-red)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--ft-red)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="month"
                    tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`}
                    tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip content={<TrendTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="income"
                    name="Income"
                    stroke="var(--ft-green)"
                    strokeWidth={1.5}
                    fill="url(#incomeGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    name="Expenses"
                    stroke="var(--ft-red)"
                    strokeWidth={1.5}
                    fill="url(#expenseGrad)"
                  />
                  <Line
                    type="monotone"
                    dataKey="net"
                    name="Net"
                    stroke="var(--ft-accent)"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {monthlyHistory.length === 0 ? (
            <div style={{ padding: 20, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center" }}>
              No monthly data available
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Month", "Income", "Expenses", "Net", "Rate"].map((h) => (
                      <th
                        key={h}
                        style={{
                          ...TH,
                          textAlign: h === "Month" ? "left" : "right",
                          borderRight: "1px solid var(--ft-raised)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...monthlyHistory].reverse().map((m) => {
                    const rate = m.income > 0 ? ((m.income - m.expenses) / m.income) * 100 : 0;
                    const isNegative = rate < 0;
                    return (
                      <tr
                        key={m.month}
                        style={{
                          background: isNegative ? "rgba(248,81,73,0.04)" : "transparent",
                        }}
                      >
                        <td style={{ ...TD, borderRight: "1px solid var(--ft-raised)", color: "var(--ft-muted)" }}>
                          {formatMonthLabel(m.month)}
                        </td>
                        <td style={{ ...TD, textAlign: "right", borderRight: "1px solid var(--ft-raised)", color: "var(--ft-green)" }}>
                          +{formatGbp(m.income)}
                        </td>
                        <td style={{ ...TD, textAlign: "right", borderRight: "1px solid var(--ft-raised)", color: "var(--ft-red)" }}>
                          −{formatGbp(m.expenses)}
                        </td>
                        <td
                          style={{
                            ...TD,
                            textAlign: "right",
                            borderRight: "1px solid var(--ft-raised)",
                            color: m.netSavings >= 0 ? "var(--ft-green)" : "var(--ft-red)",
                            fontWeight: 600,
                          }}
                        >
                          {m.netSavings >= 0 ? "+" : ""}{formatGbp(m.netSavings)}
                        </td>
                        <td
                          style={{
                            ...TD,
                            textAlign: "right",
                            color: isNegative ? "var(--ft-red)" : "var(--ft-cyan)",
                            fontWeight: 600,
                          }}
                        >
                          {m.income > 0 ? `${rate.toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div style={{ borderBottom: "1px solid var(--ft-border)" }}>
        <div style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--ft-border)",
          background: "var(--ft-surface)",
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Spending by Day of Week
          </span>
        </div>
        <div style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 80 }}>
            {DOW_LABELS.map((label, i) => {
              const val = dowSpend[i];
              const barHeight = dowMax > 0 ? Math.max(4, (val / dowMax) * 64) : 4;
              const isWeekend = i >= 5;
              const isHighest = i === dowHighestIdx && val > 0;
              const barColor = isWeekend ? "var(--ft-amber)" : "var(--ft-accent)";
              return (
                <div
                  key={label}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <div style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--ft-dim)",
                    marginBottom: 2,
                    opacity: val > 0 ? 1 : 0.4,
                  }}>
                    {formatGbp(val)}
                  </div>
                  <div style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "center",
                    height: 64,
                  }}>
                    <div
                      style={{
                        width: "70%",
                        height: barHeight,
                        background: isHighest
                          ? barColor
                          : `${barColor}99`,
                        borderRadius: "2px 2px 0 0",
                        boxShadow: isHighest ? `0 0 8px ${barColor}66` : undefined,
                        transition: "height 0.3s ease",
                      }}
                    />
                  </div>
                  <div style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: isHighest ? 700 : 400,
                    color: isHighest ? barColor : "var(--ft-muted)",
                    letterSpacing: "0.04em",
                  }}>
                    {label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <div
          style={{
            padding: "8px 16px",
            background: "rgba(96,165,250,0.06)",
            borderBottom: "1px solid rgba(96,165,250,0.15)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-blue)", letterSpacing: "0.04em" }}>
            ▼ BIGGEST TRANSACTIONS
          </span>
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
            Top 10 by GBP value
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "flex" }}>
            {[
              ["Date", "100px"],
              ["Description", "1"],
              ["Category", "130px"],
              ["Type", "90px"],
              ["Amount (GBP)", "140px"],
            ].map(([h, w]) => (
              <div
                key={h}
                style={{
                  ...TH,
                  flex: w === "1" ? 1 : undefined,
                  width: w !== "1" ? w : undefined,
                  minWidth: w !== "1" ? w : undefined,
                  textAlign: h === "Amount (GBP)" ? "right" : "left",
                  borderRight: "1px solid var(--ft-raised)",
                }}
              >
                {h}
              </div>
            ))}
          </div>

          {isLoading ? (
            <div style={{ padding: 20, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>
              Loading…
            </div>
          ) : biggestTxs.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>
              No transactions in this range
            </div>
          ) : (
            biggestTxs.map((tx) => {
              const typeColor =
                tx.type === "income"
                  ? "var(--ft-green)"
                  : tx.type === "expense"
                  ? "var(--ft-red)"
                  : "var(--ft-blue)";
              return (
                <div
                  key={tx.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    borderBottom: "1px solid var(--ft-raised)",
                    background: "var(--ft-base)",
                  }}
                >
                  <div
                    style={{
                      width: 100,
                      minWidth: 100,
                      padding: "7px 12px",
                      borderRight: "1px solid var(--ft-raised)",
                      color: "var(--ft-muted)",
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatDate(tx.date)}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      padding: "7px 12px",
                      borderRight: "1px solid var(--ft-raised)",
                      color: "var(--ft-text)",
                      fontSize: 12,
                      fontFamily: "var(--font-mono)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tx.description}
                  </div>
                  <div
                    style={{
                      width: 130,
                      minWidth: 130,
                      padding: "7px 12px",
                      borderRight: "1px solid var(--ft-raised)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        padding: "1px 6px",
                        borderRadius: 2,
                        background: "var(--ft-raised)",
                        color: "var(--ft-muted)",
                      }}
                    >
                      {tx.category}
                    </span>
                  </div>
                  <div
                    style={{
                      width: 90,
                      minWidth: 90,
                      padding: "7px 12px",
                      borderRight: "1px solid var(--ft-raised)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        padding: "1px 6px",
                        borderRadius: 2,
                        background: typeColor + "22",
                        color: typeColor,
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.3px",
                      }}
                    >
                      {tx.type}
                    </span>
                  </div>
                  <div
                    style={{
                      width: 140,
                      minWidth: 140,
                      padding: "7px 12px",
                      textAlign: "right",
                      color: typeColor,
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {tx.type === "income" ? "+" : tx.type === "expense" ? "−" : ""}
                    {formatGbp(Math.abs(tx.gbpValue))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
