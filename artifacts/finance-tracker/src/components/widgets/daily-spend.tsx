import { useListTransactions } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getMonthBounds(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const dateFrom = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = getDaysInMonth(year, month);
  const dateTo = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { dateFrom, dateTo };
}

export function DailySpendWidget({ isExpanded }: { isExpanded?: boolean }) {
  const { data, isLoading } = useListTransactions({});

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const dayOfMonth = now.getDate();
  const daysInMonth = getDaysInMonth(now.getFullYear(), now.getMonth());
  const { dateFrom } = getMonthBounds();
  const monthPrefix = dateFrom.slice(0, 7);

  const allExpenses = (data ?? []).filter(tx => tx.type === "expense");

  const todayTotal = allExpenses
    .filter(tx => tx.date === today)
    .reduce((s, tx) => s + tx.gbpValue, 0);

  const thisMonthExpenses = allExpenses
    .filter(tx => tx.date.startsWith(monthPrefix))
    .reduce((s, tx) => s + tx.gbpValue, 0);

  const dailyAvg = dayOfMonth > 0 ? thisMonthExpenses / dayOfMonth : 0;
  const vsAvg = todayTotal - dailyAvg;
  const runRate = dailyAvg * daysInMonth;

  const isUnder = todayTotal <= dailyAvg;
  const totalColor = todayTotal === 0
    ? "var(--ft-green)"
    : isUnder
    ? "var(--ft-green)"
    : "var(--ft-accent)";

  const barFillPct = dailyAvg > 0 ? Math.min((todayTotal / dailyAvg) * 100, 100) : 0;
  const barOverflow = dailyAvg > 0 && todayTotal > dailyAvg;

  const todayDateLabel = now.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  const dailyChartData = Array.from({ length: dayOfMonth }, (_, i) => {
    const d = i + 1;
    const dayStr = `${monthPrefix}-${String(d).padStart(2, "0")}`;
    const total = allExpenses
      .filter(tx => tx.date === dayStr)
      .reduce((s, tx) => s + tx.gbpValue, 0);
    return { day: d, total };
  });

  const compactView = (
    <div style={{ padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
          TODAY
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
          {todayDateLabel}
        </span>
      </div>

      {todayTotal === 0 ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "var(--ft-green)", marginBottom: 8, letterSpacing: "-0.01em" }}>
          £0.00 · clear day
        </div>
      ) : (
        <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: totalColor, marginBottom: 8, letterSpacing: "-0.01em" }}>
          {formatGbp(todayTotal)}
        </div>
      )}

      {dailyAvg > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)" }}>
              vs <span className="pnum">{formatGbp(dailyAvg)}</span> daily avg
            </span>
            <span className="pnum" style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.06em",
              padding: "1px 5px",
              background: vsAvg > 0 ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
              color: vsAvg > 0 ? "var(--ft-red)" : "var(--ft-green)",
              border: `1px solid ${vsAvg > 0 ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
            }}>
              {vsAvg > 0 ? "▲" : "▼"} {formatGbp(Math.abs(vsAvg))}
            </span>
          </div>

          <div style={{ height: 4, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden", marginBottom: 8 }}>
            <div style={{
              height: "100%",
              width: `${barFillPct}%`,
              background: barOverflow ? "var(--ft-red)" : "var(--ft-accent)",
              borderRadius: 2,
              transition: "width 0.4s ease",
            }} />
          </div>

          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
            run-rate <span className="pnum">{formatGbp(runRate)}</span> / mo
          </div>
        </>
      )}

      {dailyAvg === 0 && todayTotal === 0 && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
          No expenses recorded this month yet
        </div>
      )}
    </div>
  );

  const expandedChart = (
    <div style={{ padding: "10px 8px 8px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8, paddingLeft: 4 }}>
        Daily spend — {now.toLocaleString("en-GB", { month: "long" })}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={dailyChartData} margin={{ top: 4, right: 4, left: -14, bottom: 0 }} barCategoryGap="20%">
          <XAxis
            dataKey="day"
            tick={{ fill: "var(--ft-dim)", fontSize: 8, fontFamily: "var(--font-mono)" }}
            axisLine={false}
            tickLine={false}
            interval={4}
          />
          <YAxis
            tick={{ fill: "var(--ft-dim)", fontSize: 8, fontFamily: "var(--font-mono)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => v >= 1000 ? `£${(v / 1000).toFixed(0)}k` : `£${v}`}
            width={40}
          />
          <Tooltip
            formatter={(value: number) => [formatGbp(value), "Spent"]}
            labelFormatter={(label: number) => `Day ${label}`}
            contentStyle={{
              background: "var(--ft-raised)",
              border: "1px solid var(--ft-border)",
              color: "var(--ft-text)",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
            }}
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
          />
          {dailyAvg > 0 && (
            <ReferenceLine
              y={dailyAvg}
              stroke="var(--ft-dim)"
              strokeDasharray="4 3"
              strokeWidth={1}
              label={{ value: "avg", position: "insideTopRight", fill: "var(--ft-dim)", fontSize: 8, fontFamily: "var(--font-mono)" }}
            />
          )}
          <Bar dataKey="total" radius={[2, 2, 0, 0]} maxBarSize={20}>
            {dailyChartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.day === dayOfMonth ? "var(--ft-accent)" : "var(--ft-border2)"}
                opacity={entry.day === dayOfMonth ? 1 : 0.7}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <WidgetShell title="Daily Spend" href="/transactions" linkLabel="→ Transactions" isLoading={isLoading} accent="var(--ft-accent)">
      {!isLoading && (
        isExpanded ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100%" }}>
            <div style={{ borderRight: "1px solid var(--ft-border)" }}>
              {compactView}
            </div>
            <div>
              {expandedChart}
            </div>
          </div>
        ) : (
          compactView
        )
      )}
    </WidgetShell>
  );
}
