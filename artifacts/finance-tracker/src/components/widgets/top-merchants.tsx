import { useListTransactions } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const DONUT_COLORS = [
  "var(--ft-accent)",
  "var(--ft-amber)",
  "var(--ft-cyan)",
  "#56D364",
  "#79C0FF",
  "#E6B450",
  "var(--ft-blue)",
  "var(--ft-red)",
];

function getMonthPrefix(offsetMonths: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function rankMerchants(expenses: { description: string; gbpValue: number }[]): { name: string; total: number }[] {
  const totals = expenses.reduce<Record<string, number>>((acc, tx) => {
    acc[tx.description] = (acc[tx.description] ?? 0) + tx.gbpValue;
    return acc;
  }, {});
  return Object.entries(totals)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
}

export function TopMerchantsWidget({ isExpanded }: { isExpanded?: boolean }) {
  const { data, isLoading } = useListTransactions({});

  const thisMonth = getMonthPrefix(0);
  const lastMonth = getMonthPrefix(-1);

  const allTx = data ?? [];

  const thisMonthExpenses = allTx.filter(tx => tx.type === "expense" && tx.date.startsWith(thisMonth));
  const lastMonthExpenses = allTx.filter(tx => tx.type === "expense" && tx.date.startsWith(lastMonth));

  const thisRanked = rankMerchants(thisMonthExpenses);
  const lastRanked = rankMerchants(lastMonthExpenses);

  const lastRankMap = new Map(lastRanked.map((m, i) => [m.name, i + 1]));

  const limit = isExpanded ? 8 : 5;
  const topMerchants = thisRanked.slice(0, limit);

  const monthlyTotal = thisMonthExpenses.reduce((s, tx) => s + tx.gbpValue, 0);
  const maxTotal = topMerchants[0]?.total ?? 0;

  const otherTotal = thisRanked.slice(8).reduce((s, m) => s + m.total, 0);

  const donutData = [
    ...topMerchants.map((m, i) => ({ name: m.name.slice(0, 16), value: m.total, color: DONUT_COLORS[i % DONUT_COLORS.length] })),
    ...(otherTotal > 0 ? [{ name: "Other", value: otherTotal, color: "var(--ft-border2)" }] : []),
  ];

  const header = (
    <div style={{ padding: "8px 12px 6px", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
      Top Merchants · This Month
    </div>
  );

  const merchantRows = (
    <div style={{ padding: "0 12px 12px" }}>
      {topMerchants.length === 0 ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center", paddingTop: 16 }}>
          No expenses this month
        </div>
      ) : (
        topMerchants.map((merchant, i) => {
          const barWidth = maxTotal > 0 ? (merchant.total / maxTotal) * 100 : 0;
          const pctOfTotal = monthlyTotal > 0 ? (merchant.total / monthlyTotal) * 100 : 0;
          const lastRank = lastRankMap.get(merchant.name);
          const rankDelta = lastRank ? lastRank - (i + 1) : null;
          const truncatedName = merchant.name.length > 20 ? merchant.name.slice(0, 20) + "…" : merchant.name;

          return (
            <div
              key={merchant.name}
              style={{
                padding: "6px 0",
                borderBottom: i < topMerchants.length - 1 ? "1px solid var(--ft-border)" : undefined,
                position: "relative",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, position: "relative", zIndex: 1 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", width: 14, flexShrink: 0, textAlign: "right" }}>
                  {i + 1}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {truncatedName}
                </span>
                {isExpanded && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", flexShrink: 0 }}>
                    {pctOfTotal.toFixed(0)}%
                  </span>
                )}
                {isExpanded && lastRank !== undefined && (
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    color: rankDelta !== null && rankDelta > 0 ? "var(--ft-green)" : rankDelta !== null && rankDelta < 0 ? "var(--ft-red)" : "var(--ft-dim)",
                    flexShrink: 0,
                    width: 28,
                    textAlign: "right",
                  }}>
                    {rankDelta !== null && rankDelta > 0 ? `▲${rankDelta}` : rankDelta !== null && rankDelta < 0 ? `▼${Math.abs(rankDelta)}` : "—"}
                  </span>
                )}
                <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--ft-text)", flexShrink: 0, textAlign: "right", minWidth: 60 }}>
                  {formatGbp(merchant.total)}
                </span>
              </div>
              <div style={{ marginLeft: 22, height: 3, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${barWidth}%`,
                  background: DONUT_COLORS[i % DONUT_COLORS.length],
                  opacity: 0.6,
                  borderRadius: 2,
                  transition: "width 0.4s ease",
                }} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  const donutPanel = (
    <div style={{ padding: "10px 12px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8 }}>
        Share of spend
      </div>
      {donutData.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={donutData}
                cx="50%"
                cy="50%"
                innerRadius={44}
                outerRadius={68}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
              >
                {donutData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [formatGbp(value), name]}
                contentStyle={{
                  background: "var(--ft-raised)",
                  border: "1px solid var(--ft-border)",
                  color: "var(--ft-text)",
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
            {donutData.map((entry, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: entry.color, flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.name}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", flexShrink: 0 }}>
                  {monthlyTotal > 0 ? ((entry.value / monthlyTotal) * 100).toFixed(0) : 0}%
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center", paddingTop: 20 }}>
          No data
        </div>
      )}
    </div>
  );

  return (
    <WidgetShell title="Top Merchants" href="/transactions" linkLabel="→ Transactions" isLoading={isLoading} accent="var(--ft-cyan)">
      {!isLoading && (
        isExpanded ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100%" }}>
            <div style={{ borderRight: "1px solid var(--ft-border)" }}>
              {header}
              {merchantRows}
            </div>
            <div>
              {donutPanel}
            </div>
          </div>
        ) : (
          <>
            {header}
            {merchantRows}
          </>
        )
      )}
    </WidgetShell>
  );
}
