import { useState } from "react";
import { useGetDashboard } from "@workspace/api-client-react";
import { formatBaseMoney } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";
import { Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart, ReferenceLine, Cell } from "recharts";

type Period = "3M" | "6M" | "12M" | "ALL";
const PERIODS: Period[] = ["3M", "6M", "12M", "ALL"];
const PERIOD_MONTHS: Record<Period, number | null> = { "3M": 3, "6M": 6, "12M": 12, "ALL": null };

function momDelta(current: number, prev: number | null | undefined): { label: string; color: string } | null {
  if (prev == null || prev === 0) return null;
  const pct = ((current - prev) / Math.abs(prev)) * 100;
  const sign = pct >= 0 ? "+" : "";
  return { label: `${sign}${pct.toFixed(0)}% MoM`, color: pct >= 0 ? "var(--ft-green)" : "var(--ft-red)" };
}

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Average over CONVERTIBLE months only. Null months (FX miss) are
// omitted — including them as 0 would drag the mean down and mislabel
// the "avg income" reference line on the chart. See the dashboard
// monthly-fold test for why null means unknown, not zero.
function avgNonNull(values: (number | null)[]): number {
  const known = values.filter((v): v is number => v != null);
  if (!known.length) return 0;
  return known.reduce((s, v) => s + v, 0) / known.length;
}

type MonthEntry = { month: string; income: number | null; expenses: number | null; netSavings: number | null };
// net is null if either side is null — matches the fold's "one null
// poisons the month" invariant. Recharts drops null values from bars
// and lines, so the visual is a gap where the month would sit.
type ChartEntry = MonthEntry & { net: number | null };

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
  // A null value here means the month had unconvertible transactions —
  // fabricating "£0" in the tooltip would be the exact defect this
  // whole change guards against. Show a "—" and skip the vs-avg
  // comparison for the null field.
  const incomeRaw = payload.find(p => p.name === "income")?.value;
  const expensesRaw = payload.find(p => p.name === "expenses")?.value;
  const income: number | null = typeof incomeRaw === "number" ? incomeRaw : null;
  const expenses: number | null = typeof expensesRaw === "number" ? expensesRaw : null;
  const net: number | null = income != null && expenses != null ? income - expenses : null;
  const vsIncome = income != null ? income - avgIncome : null;
  const vsExpense = expenses != null ? expenses - avgExpense : null;
  const parts = label.split("-");
  const monthLabel = new Date(parseInt(parts[0] ?? "0"), parseInt(parts[1] ?? "1") - 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "8px 10px", fontFamily: "var(--font-mono)", minWidth: 160, boxShadow: "none" }}>
      <div style={{ fontSize: 9, color: "var(--ft-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {monthLabel}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "2px 8px", alignItems: "center" }}>
        <span style={{ fontSize: 9, color: "var(--ft-dim)" }}>Income</span>
        <span className="pnum" style={{ fontSize: 10, fontWeight: 700, color: income == null ? "var(--ft-dim)" : "var(--ft-green)", textAlign: "right" }}>
          {income == null ? "—" : formatBaseMoney(income)}
        </span>
        <span className="pnum" style={{ fontSize: 9, color: vsIncome != null && vsIncome >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
          {vsIncome == null ? "" : `${vsIncome >= 0 ? "+" : ""}${formatBaseMoney(Math.abs(vsIncome))} avg`}
        </span>
        <span style={{ fontSize: 9, color: "var(--ft-dim)" }}>Expenses</span>
        <span className="pnum" style={{ fontSize: 10, fontWeight: 700, color: expenses == null ? "var(--ft-dim)" : "var(--ft-red)", textAlign: "right" }}>
          {expenses == null ? "—" : formatBaseMoney(expenses)}
        </span>
        <span className="pnum" style={{ fontSize: 9, color: vsExpense != null && vsExpense <= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
          {vsExpense == null ? "" : `${vsExpense >= 0 ? "+" : ""}${formatBaseMoney(Math.abs(vsExpense))} avg`}
        </span>
        <span style={{ fontSize: 9, color: "var(--ft-dim)" }}>Net</span>
        <span className="pnum" style={{ fontSize: 10, fontWeight: 700, color: net == null ? "var(--ft-dim)" : (net >= 0 ? "var(--ft-green)" : "var(--ft-red)"), textAlign: "right" }}>
          {net == null ? "—" : `${net >= 0 ? "+" : ""}${formatBaseMoney(net)}`}
        </span>
        <span />
      </div>
    </div>
  );
}

// ── Summary strip item sub-component ─────────────────────────────────────────

type SummaryItemProps = {
  label: string;
  value: string;
  color: string;
  delta: { label: string; color: string } | null;
};

function SummaryItem({ label, value, color, delta }: SummaryItemProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        padding: "10px 12px",
        borderTop: `2px solid ${color}`,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3 }}>
        {label}
      </div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color }}>
        {value}
      </div>
      {delta && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: delta.color, marginTop: 2, opacity: 0.8 }}>
          {delta.label}
        </div>
      )}
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

  // net is null when either side is null (FX-miss month) — Recharts
  // drops null-valued datapoints, so those months render as a gap.
  const historyWithNet: ChartEntry[] = history.map(m => ({
    ...m,
    net: m.income != null && m.expenses != null ? m.income - m.expenses : null,
  }));

  const avgIncome = avgNonNull(history.map(m => m.income));
  const avgExpense = avgNonNull(history.map(m => m.expenses));

  // momDelta already handles null/undefined prev — passing `?? 0` here forces
  // it onto a fabricated zero baseline and turns "no previous month" into
  // "+∞% MoM" instead of the honest "—".
  const summaryItems = d ? [
    { label: "Income",      value: `+${formatBaseMoney(d.thisMonth.income)}`,   color: d.thisMonth.income > 0 ? "var(--ft-green)" : "var(--ft-muted)", delta: momDelta(d.thisMonth.income, prevMonth?.income) },
    { label: "Expenses",    value: `−${formatBaseMoney(d.thisMonth.expenses)}`, color: d.thisMonth.expenses > 0 ? "var(--ft-red)" : "var(--ft-muted)",   delta: momDelta(d.thisMonth.expenses, prevMonth?.expenses) },
    { label: "Net Savings", value: `${d.thisMonth.netSavings >= 0 ? "+" : ""}${formatBaseMoney(d.thisMonth.netSavings)}`, color: d.thisMonth.netSavings !== 0 ? (d.thisMonth.netSavings >= 0 ? "var(--ft-green)" : "var(--ft-red)") : "var(--ft-muted)", delta: null },
  ] : [];

  // Border-as-gap KPI strip: 1px gap background = border, each cell bg = surface
  const summaryStrip = d && (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "var(--ft-border)", borderBottom: "1px solid var(--ft-border)" }}>
      {summaryItems.map((item) => (
        <SummaryItem
          key={item.label}
          label={item.label}
          value={item.value}
          color={item.color}
          delta={item.delta}
        />
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
