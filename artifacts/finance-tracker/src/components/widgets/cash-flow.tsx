import { useState } from "react";
import { useGetDashboard } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";
import { Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart, ReferenceLine, Cell } from "recharts";

type Period = "3M" | "6M" | "12M" | "ALL";
const PERIODS: Period[] = ["3M", "6M", "12M", "ALL"];
const PERIOD_MONTHS: Record<Period, number | null> = { "3M": 3, "6M": 6, "12M": 12, "ALL": null };

function momDelta(current: number, prev: number): { label: string; color: string } | null {
  if (!prev) return null;
  const pct = ((current - prev) / Math.abs(prev)) * 100;
  const sign = pct >= 0 ? "+" : "";
  return { label: `${sign}${pct.toFixed(0)}% MoM`, color: pct >= 0 ? "var(--ft-green)" : "var(--ft-red)" };
}

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

type MonthEntry = { month: string; income: number; expenses: number; netSavings: number };
type ChartEntry = MonthEntry & { net: number };

type PayloadEntry = { name?: string | number; value?: number | string | (number | string)[] };

type CustomTooltipProps = {
  active?: boolean;
  payload?: PayloadEntry[];
  label?: string;
  avgIncome: number;
  avgExpense: number;
};

function CashFlowTooltip({ active, payload, label, avgIncome, avgExpense }: CustomTooltipProps) {
  if (!active || !payload?.length || !label) return null;
  const income = (payload.find(p => p.name === "income")?.value as number) ?? 0;
  const expenses = (payload.find(p => p.name === "expenses")?.value as number) ?? 0;
  const net = income - expenses;
  const vsIncome = income - avgIncome;
  const vsExpense = expenses - avgExpense;
  const parts = label.split("-");
  const monthLabel = new Date(parseInt(parts[0] ?? "0"), parseInt(parts[1] ?? "1") - 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
  return (
    <div style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", padding: "8px 10px", fontFamily: "var(--font-mono)", minWidth: 160 }}>
      <div style={{ fontSize: 9, color: "var(--ft-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {monthLabel}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "2px 8px", alignItems: "center" }}>
        <span style={{ fontSize: 9, color: "var(--ft-dim)" }}>Income</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ft-green)", textAlign: "right" }}>{formatGbp(income)}</span>
        <span style={{ fontSize: 9, color: vsIncome >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
          {vsIncome >= 0 ? "+" : ""}{formatGbp(Math.abs(vsIncome))} avg
        </span>
        <span style={{ fontSize: 9, color: "var(--ft-dim)" }}>Expenses</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ft-red)", textAlign: "right" }}>{formatGbp(expenses)}</span>
        <span style={{ fontSize: 9, color: vsExpense <= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
          {vsExpense >= 0 ? "+" : ""}{formatGbp(Math.abs(vsExpense))} avg
        </span>
        <span style={{ fontSize: 9, color: "var(--ft-dim)" }}>Net</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: net >= 0 ? "var(--ft-green)" : "var(--ft-red)", textAlign: "right" }}>
          {net >= 0 ? "+" : ""}{formatGbp(net)}
        </span>
        <span />
      </div>
    </div>
  );
}

export function CashFlowWidget({ isExpanded }: { isExpanded?: boolean }) {
  const { data: d, isLoading } = useGetDashboard();
  const [period, setPeriod] = useState<Period>("6M");

  const allHistory: MonthEntry[] = d?.monthlyHistory ?? [];
  const months = PERIOD_MONTHS[period];
  const history = isExpanded ? allHistory : (months ? allHistory.slice(-months) : allHistory);
  const prevMonth = allHistory.length >= 2 ? allHistory[allHistory.length - 2] : null;
  const currentMonth = currentYearMonth();

  const chartHeight = isExpanded ? 220 : 150;

  const historyWithNet: ChartEntry[] = history.map(m => ({ ...m, net: m.income - m.expenses }));

  const avgIncome = avg(history.map(m => m.income));
  const avgExpense = avg(history.map(m => m.expenses));

  const summaryStrip = d && (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: "1px solid var(--ft-border)" }}>
      {[
        { label: "Income",     value: `+${formatGbp(d.thisMonth.income)}`,   color: "var(--ft-green)", delta: momDelta(d.thisMonth.income, prevMonth?.income ?? 0) },
        { label: "Expenses",   value: `−${formatGbp(d.thisMonth.expenses)}`, color: "var(--ft-red)",   delta: momDelta(d.thisMonth.expenses, prevMonth?.expenses ?? 0) },
        { label: "Net Savings",value: `${d.thisMonth.netSavings >= 0 ? "+" : ""}${formatGbp(d.thisMonth.netSavings)}`, color: d.thisMonth.netSavings >= 0 ? "var(--ft-green)" : "var(--ft-red)", delta: null },
      ].map((item, i) => (
        <div key={item.label} style={{ padding: "10px 12px", borderRight: i < 2 ? "1px solid var(--ft-border)" : undefined }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3 }}>
            {item.label}
          </div>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: item.color }}>
            {item.value}
          </div>
          {item.delta && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: item.delta.color, marginTop: 2, opacity: 0.8 }}>
              {item.delta.label}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const chartHeader = (
    <div style={{ padding: "8px 12px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {isExpanded ? `All ${allHistory.length} months` : `${history.length} month${history.length !== 1 ? "s" : ""}`}
      </span>
      {!isExpanded && (
        <div style={{ display: "flex", gap: 2 }}>
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.06em",
                padding: "2px 6px",
                background: period === p ? "var(--ft-green)" : "transparent",
                color: period === p ? "var(--ft-base)" : "var(--ft-dim)",
                border: `1px solid ${period === p ? "var(--ft-green)" : "var(--ft-border2)"}`,
                transition: "all 0.1s",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const chart = (
    <div style={{ padding: "8px 8px 8px" }}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <ComposedChart data={historyWithNet} margin={{ top: 4, right: 4, left: -10, bottom: 0 }} barCategoryGap="28%">
          <XAxis
            dataKey="month"
            tick={{ fill: "var(--ft-dim)", fontSize: 9, fontFamily: "var(--font-mono)" }}
            axisLine={false} tickLine={false}
            tickFormatter={(v: string) => {
              const parts = v.split("-");
              return new Date(parseInt(parts[0] ?? "0"), parseInt(parts[1] ?? "1") - 1).toLocaleString("en-GB", { month: "short" });
            }}
          />
          <YAxis
            tick={{ fill: "var(--ft-dim)", fontSize: 9, fontFamily: "var(--font-mono)" }}
            axisLine={false} tickLine={false}
            tickFormatter={(v: number) => v >= 1000 ? `£${(v / 1000).toFixed(0)}k` : `£${v}`}
          />
          <Tooltip
            content={(props) => (
              <CashFlowTooltip
                active={props.active}
                payload={props.payload as PayloadEntry[] | undefined}
                label={typeof props.label === "string" ? props.label : undefined}
                avgIncome={avgIncome}
                avgExpense={avgExpense}
              />
            )}
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
          />
          {avgIncome > 0 && (
            <ReferenceLine
              y={avgIncome}
              stroke="var(--ft-green)"
              strokeOpacity={0.5}
              strokeDasharray="4 2"
              label={{ value: "avg income", position: "insideTopRight", fill: "var(--ft-green)", fontSize: 8, fontFamily: "var(--font-mono)", opacity: 0.7 }}
            />
          )}
          {avgExpense > 0 && (
            <ReferenceLine
              y={avgExpense}
              stroke="var(--ft-red)"
              strokeOpacity={0.5}
              strokeDasharray="4 2"
              label={{ value: "avg exp", position: "insideBottomRight", fill: "var(--ft-red)", fontSize: 8, fontFamily: "var(--font-mono)", opacity: 0.7 }}
            />
          )}
          <Bar dataKey="income" maxBarSize={28} radius={[2, 2, 0, 0]}>
            {historyWithNet.map((entry) => (
              <Cell
                key={entry.month}
                fill="var(--ft-green)"
                fillOpacity={entry.month === currentMonth ? 1 : 0.55}
              />
            ))}
          </Bar>
          <Bar dataKey="expenses" maxBarSize={28} radius={[2, 2, 0, 0]}>
            {historyWithNet.map((entry) => (
              <Cell
                key={entry.month}
                fill="var(--ft-red)"
                fillOpacity={entry.month === currentMonth ? 1 : 0.55}
              />
            ))}
          </Bar>
          {isExpanded && (
            <Line
              type="monotone"
              dataKey="net"
              stroke="var(--ft-accent)"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: "var(--ft-accent)", strokeWidth: 0 }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <WidgetShell title="Cash Flow" isLoading={isLoading} accent="var(--ft-green)">
      {!isLoading && (
        <>
          {allHistory.length === 0 ? (
            <div style={{ padding: "20px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center" }}>
              No history yet — add transactions to see cash flow
            </div>
          ) : (
            <>
              {summaryStrip}
              {chartHeader}
              {chart}
            </>
          )}
        </>
      )}
    </WidgetShell>
  );
}
