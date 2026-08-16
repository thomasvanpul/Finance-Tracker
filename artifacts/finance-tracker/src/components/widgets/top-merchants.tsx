import { useState } from "react";
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

function rankMerchants(expenses: { description: string; gbpValue: number | null }[]): { name: string; total: number }[] {
  const totals = expenses.reduce<Record<string, number>>((acc, tx) => {
    acc[tx.description] = (acc[tx.description] ?? 0) + (tx.gbpValue ?? 0);
    return acc;
  }, {});
  return Object.entries(totals)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
}

interface MerchantRowProps {
  merchant: { name: string; total: number };
  rank: number;
  isLast: boolean;
  isExpanded?: boolean;
  color: string;
  barWidth: number;
  pctOfTotal: number;
  isNew: boolean;
  rankDelta: number | null;
}

function MerchantRow({ merchant, rank, isLast, isExpanded: expanded, color, barWidth, pctOfTotal, isNew, rankDelta }: MerchantRowProps) {
  const [hov, setHov] = useState(false);
  const truncatedName = merchant.name.length > (expanded ? 24 : 20) ? merchant.name.slice(0, expanded ? 24 : 20) + "…" : merchant.name;
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "7px 0",
        borderBottom: !isLast ? "1px solid var(--ft-border)" : undefined,
        position: "relative",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 4%, transparent)" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, position: "relative", zIndex: 1 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", width: 14, flexShrink: 0, textAlign: "right" }}>
          {rank}
        </span>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {truncatedName}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", flexShrink: 0 }}>
          {pctOfTotal.toFixed(0)}%
        </span>
        {isNew ? (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--ft-amber)", background: "color-mix(in srgb, var(--ft-amber) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--ft-amber) 30%, transparent)", padding: "1px 4px", flexShrink: 0, letterSpacing: "0.04em" }}>
            NEW
          </span>
        ) : rankDelta !== null && rankDelta !== 0 ? (
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
            color: rankDelta > 0 ? "var(--ft-green)" : "var(--ft-red)",
            background: `color-mix(in srgb, ${rankDelta > 0 ? "var(--ft-green)" : "var(--ft-red)"} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${rankDelta > 0 ? "var(--ft-green)" : "var(--ft-red)"} 30%, transparent)`,
            padding: "1px 4px", flexShrink: 0, letterSpacing: "0.04em",
          }}>
            {rankDelta > 0 ? `▲${rankDelta}` : `▼${Math.abs(rankDelta)}`}
          </span>
        ) : (
          <span style={{ width: 28, flexShrink: 0 }} />
        )}
        <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color, flexShrink: 0, textAlign: "right", minWidth: 56 }}>
          {formatGbp(merchant.total)}
        </span>
      </div>
      <div style={{ marginLeft: 27, height: 4, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${barWidth}%`, background: color, opacity: 0.7, borderRadius: 2, transition: "width 0.12s ease" }} />
      </div>
    </div>
  );
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

  const monthlyTotal = thisMonthExpenses.reduce((s, tx) => s + (tx.gbpValue ?? 0), 0);
  const maxTotal = topMerchants[0]?.total ?? 0;

  const otherTotal = thisRanked.slice(8).reduce((s, m) => s + m.total, 0);

  const donutData = [
    ...topMerchants.map((m, i) => ({ name: m.name.slice(0, 16), value: m.total, color: DONUT_COLORS[i % DONUT_COLORS.length] })),
    ...(otherTotal > 0 ? [{ name: "Other", value: otherTotal, color: "var(--ft-border2)" }] : []),
  ];

  const prevMonthTotal = lastMonthExpenses.reduce((s, tx) => s + (tx.gbpValue ?? 0), 0);
  const totalDelta = monthlyTotal - prevMonthTotal;
  const totalDeltaColor = totalDelta <= 0 ? "var(--ft-green)" : "var(--ft-red)";

  const header = (
    <div style={{ padding: "10px 12px 8px", borderBottom: "1px solid var(--ft-border)" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 6 }}>
        Top Merchants · This Month
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, justifyContent: "space-between" }}>
        <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "-0.02em", lineHeight: 1 }}>
          {formatGbp(monthlyTotal)}
        </span>
        {prevMonthTotal > 0 && (
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            color: totalDeltaColor,
            background: `color-mix(in srgb, ${totalDeltaColor} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${totalDeltaColor} 30%, transparent)`,
            padding: "2px 6px",
            letterSpacing: "0.04em",
          }}>
            {totalDelta > 0 ? "▲" : "▼"} {formatGbp(Math.abs(totalDelta))} vs last
          </span>
        )}
      </div>
    </div>
  );

  const merchantRows = (
    <div style={{ padding: "4px 12px 12px" }}>
      {topMerchants.length === 0 ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center", paddingTop: 16 }}>
          No expenses this month
        </div>
      ) : (
        topMerchants.map((merchant, i) => {
          const barWidth = maxTotal > 0 ? (merchant.total / maxTotal) * 100 : 0;
          const pctOfTotal = monthlyTotal > 0 ? (merchant.total / monthlyTotal) * 100 : 0;
          const lastRank = lastRankMap.get(merchant.name);
          const rankDelta = lastRank !== undefined ? lastRank - (i + 1) : null;
          const isNew = lastRank === undefined && lastRanked.length > 0;
          const color = DONUT_COLORS[i % DONUT_COLORS.length];

          return (
            <MerchantRow
              key={merchant.name}
              merchant={merchant}
              rank={i + 1}
              isLast={i === topMerchants.length - 1}
              isExpanded={isExpanded}
              color={color}
              barWidth={barWidth}
              pctOfTotal={pctOfTotal}
              isNew={isNew}
              rankDelta={rankDelta}
            />
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
