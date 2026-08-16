import { useState } from "react";
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

// ── Today's transaction row sub-component ─────────────────────────────────────

type TodayTxRowProps = {
  description: string | undefined;
  category: string;
  gbpValue: number | null;
};

function TodayTxRow({ description, category, gbpValue }: TodayTxRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 4,
        padding: "2px 4px",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
        borderRadius: 1,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ minWidth: 0, flex: 1, marginRight: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
          {description || category || "Expense"}
        </span>
        {category && description && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
            {category}
          </span>
        )}
      </div>
      <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: gbpValue == null ? "var(--ft-dim)" : "var(--ft-red)", flexShrink: 0 }}>
        {gbpValue == null ? "—" : `−${formatGbp(gbpValue)}`}
      </span>
    </div>
  );
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
    .reduce((s, tx) => s + (tx.gbpValue ?? 0), 0);

  const thisMonthExpenses = allExpenses
    .filter(tx => tx.date.startsWith(monthPrefix))
    .reduce((s, tx) => s + (tx.gbpValue ?? 0), 0);

  const dailyAvg = dayOfMonth > 0 ? thisMonthExpenses / dayOfMonth : 0;
  const vsAvg = todayTotal - dailyAvg;
  const runRate = dailyAvg * daysInMonth;

  const isUnder = todayTotal <= dailyAvg;
  const totalColor = todayTotal === 0
    ? "var(--ft-green)"
    : isUnder
    ? "var(--ft-green)"
    : "var(--ft-accent)";

  const barOverflow = dailyAvg > 0 && todayTotal > dailyAvg;

  const todayDateLabel = now.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  const dailyChartData = Array.from({ length: dayOfMonth }, (_, i) => {
    const d = i + 1;
    const dayStr = `${monthPrefix}-${String(d).padStart(2, "0")}`;
    const total = allExpenses
      .filter(tx => tx.date === dayStr)
      .reduce((s, tx) => s + (tx.gbpValue ?? 0), 0);
    return { day: d, total };
  });

  // Today's transactions for the mini list
  const todayTxs = allExpenses
    .filter(tx => tx.date === today)
    .sort((a, b) => (b.gbpValue ?? -Infinity) - (a.gbpValue ?? -Infinity))
    .slice(0, 4);

  // Month pacing: days elapsed / total days
  const monthPacePct = (dayOfMonth / daysInMonth) * 100;
  const spendPacePct = thisMonthExpenses > 0 && runRate > 0 ? (thisMonthExpenses / runRate) * 100 : 0;
  const daysRemaining = daysInMonth - dayOfMonth;
  const projectedMonthEnd = thisMonthExpenses + (dailyAvg * daysRemaining);

  // Count all today expenses for "+N more" display
  const todayExpenseCount = allExpenses.filter(tx => tx.date === today).length;

  const compactView = (
    <div style={{ padding: "12px 14px" }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
          TODAY · {todayDateLabel}
        </span>
        {dailyAvg > 0 && (
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            letterSpacing: "0.06em",
            padding: "1px 5px",
            background: barOverflow ? "color-mix(in srgb, var(--ft-red) 12%, transparent)" : "color-mix(in srgb, var(--ft-green) 12%, transparent)",
            color: barOverflow ? "var(--ft-red)" : "var(--ft-green)",
            border: `1px solid ${barOverflow ? "color-mix(in srgb, var(--ft-red) 30%, transparent)" : "color-mix(in srgb, var(--ft-green) 30%, transparent)"}`,
          }}>
            {barOverflow ? "OVER" : "UNDER"} AVG
          </span>
        )}
      </div>

      {/* Big hero number */}
      {todayTotal === 0 ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--ft-green)", marginBottom: 4, letterSpacing: "-0.02em", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          £0.00
          <span style={{ fontSize: 11, fontWeight: 400, color: "var(--ft-dim)", marginLeft: 8 }}>clear day</span>
        </div>
      ) : (
        <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: totalColor, marginBottom: 4, letterSpacing: "-0.02em", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {formatGbp(todayTotal)}
        </div>
      )}

      {dailyAvg > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
              avg <span className="pnum">{formatGbp(dailyAvg)}</span>
            </span>
            <span style={{ color: "var(--ft-border2)" }}>·</span>
            <span className="pnum" style={{
              fontFamily: "var(--font-mono)", fontSize: 9,
              color: vsAvg > 0 ? "var(--ft-red)" : "var(--ft-green)",
            }}>
              {vsAvg > 0 ? "+" : ""}{formatGbp(vsAvg)} today
            </span>
          </div>

          {/* Dual progress bar: time elapsed + spend pace */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                Day {dayOfMonth}/{daysInMonth}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                {daysRemaining}d left
              </span>
            </div>
            {/* Time bar */}
            <div style={{ height: 3, background: "var(--ft-border)", borderRadius: 1, overflow: "hidden", marginBottom: 3 }}>
              <div style={{ height: "100%", width: `${monthPacePct}%`, background: "var(--ft-border2)", borderRadius: 1 }} />
            </div>
            {/* Spend pace bar */}
            <div style={{ height: 3, background: "var(--ft-border)", borderRadius: 1, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.min(100, spendPacePct)}%`,
                background: spendPacePct > monthPacePct + 10 ? "var(--ft-red)" : "var(--ft-accent)",
                borderRadius: 1,
                transition: "width 0.12s ease",
              }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 14, minWidth: 0 }}>
            <div style={{ minWidth: 0, overflow: "hidden" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", marginBottom: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>MTD SPEND</div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{formatGbp(thisMonthExpenses)}</div>
            </div>
            <div style={{ minWidth: 0, overflow: "hidden" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", marginBottom: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>PROJECTED</div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: projectedMonthEnd > runRate * 1.1 ? "var(--ft-red)" : "var(--ft-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{formatGbp(projectedMonthEnd)}</div>
            </div>
          </div>
        </>
      )}

      {dailyAvg === 0 && todayTotal === 0 && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>
          No expenses recorded this month yet
        </div>
      )}

      {/* Today's transactions mini list */}
      {todayTxs.length > 0 && (
        <div style={{ marginTop: 10, borderTop: "1px solid var(--ft-border)", paddingTop: 8 }}>
          {todayTxs.map(tx => (
            <TodayTxRow
              key={tx.id}
              description={tx.description ?? undefined}
              category={tx.category}
              gbpValue={tx.gbpValue}
            />
          ))}
          {todayExpenseCount > 4 && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>
              +{todayExpenseCount - 4} more
            </div>
          )}
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
