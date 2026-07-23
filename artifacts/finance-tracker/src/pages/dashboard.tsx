import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { useWidgets, WIDGET_REGISTRY, type WidgetId } from "@/contexts/widgets-context";
import { NetWorthWidget } from "@/components/widgets/net-worth";
import { AccountsSummaryWidget } from "@/components/widgets/accounts-summary";
import { RecentTransactionsWidget } from "@/components/widgets/recent-transactions";
import { SpendingBreakdownWidget } from "@/components/widgets/spending-breakdown";
import { CashFlowWidget } from "@/components/widgets/cash-flow";
import { BudgetTrackerWidget } from "@/components/widgets/budget-tracker";
import { SavingsGoalsWidget } from "@/components/widgets/savings-goals";
import { SubscriptionTrackerWidget } from "@/components/widgets/subscription-tracker";
import { MarketSnapshotWidget } from "@/components/widgets/market-snapshot";
import { RecurringDetectorWidget } from "@/components/widgets/recurring-detector";
import { FinancialHealthWidget } from "@/components/widgets/financial-health";
import { TransactionCalendarWidget } from "@/components/widgets/transaction-calendar";
import { CashFlowSankeyWidget } from "@/components/widgets/cash-flow-sankey";
import { MonthComparisonWidget } from "@/components/widgets/month-comparison";
import { SpendingForecastWidget } from "@/components/widgets/spending-forecast";
import { DailySpendWidget } from "@/components/widgets/daily-spend";
import { TopMerchantsWidget } from "@/components/widgets/top-merchants";
import { SmartAlertsWidget } from "@/components/widgets/smart-alerts";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { useListAccounts, useListTransactions, useListUpcoming, useGetDashboard } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { useState, useMemo, useEffect } from "react";
import type { ComponentType } from "react";
import { createPortal } from "react-dom";
import { useCountUp } from "@/hooks/use-count-up";

function AnimatedNet({ value }: { value: number }) {
  const animated = useCountUp(value);
  return <>{animated >= 0 ? "+" : ""}{formatGbp(animated)}</>;
}

function AnimatedSpendRate({ value }: { value: number }) {
  const animated = useCountUp(value);
  return <>{formatGbp(animated)}</>;
}

// Widget wrappers — delegate to panel components defined later in this file.
// function declarations are hoisted, so forward references are safe here.
function CashFlowPreviewWidgetProxy(_props: { isExpanded?: boolean }) {
  return <CashFlowPreviewPanel />;
}
function SpendingVelocityWidgetProxy(_props: { isExpanded?: boolean }) {
  return <SpendingVelocityPanel />;
}

// ── Savings Rate KPI ───────────────────────────────────────────────────────────

const SAVINGS_TARGET_KEY = "ft-savings-target";
const SAVINGS_TARGET_DEFAULT = 20;

function loadSavingsTarget(): number {
  try {
    const raw = localStorage.getItem(SAVINGS_TARGET_KEY);
    if (raw === null) return SAVINGS_TARGET_DEFAULT;
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? SAVINGS_TARGET_DEFAULT : Math.max(0, Math.min(100, parsed));
  } catch { return SAVINGS_TARGET_DEFAULT; }
}

function SavingsRateKpi() {
  const { data: dashData } = useGetDashboard();
  const target = useMemo(() => loadSavingsTarget(), []);

  const savingsRate = dashData?.thisMonth?.savingsRate ?? null;

  if (savingsRate === null) return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
      No data yet
    </div>
  );

  const rate = Math.round(savingsRate);
  const pct = Math.min(100, (rate / target) * 100);
  const diff = rate - target;

  const barColor =
    diff >= 0
      ? "var(--ft-green)"
      : diff >= -5
      ? "var(--ft-amber)"
      : "var(--ft-red)";

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "14px 16px", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--ft-dim)" }}>SAVINGS RATE</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>{target}% TARGET</span>
      </div>

      {/* Big number */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 32, fontWeight: 700, color: barColor, letterSpacing: "-0.02em", lineHeight: 1 }}>
          {rate}%
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: diff >= 0 ? "var(--ft-green)" : barColor, fontWeight: 600 }}>
          {diff >= 0 ? `+${diff}pp` : `${diff}pp`}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 6 }}>
        <div style={{ height: 6, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: barColor, transition: "width 0.4s ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
          <span>0%</span>
          <span>{target}% goal</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}

// ── Emergency Fund Widget ──────────────────────────────────────────────────────

function EmergencyFundWidget() {
  const { data: accounts } = useListAccounts({});
  const { data: allTxs } = useListTransactions({});

  // Sum all accounts as liquid savings (the Account schema has no type field)
  const liquidSavings = useMemo(() => {
    return (accounts ?? []).reduce((s, a) => s + a.gbpEquivalent, 0);
  }, [accounts]);

  const avgMonthlyExpenses = useMemo(() => {
    const txs = (allTxs ?? []) as { type: string; gbpValue: number; date: string }[];
    const expenses = txs.filter(t => t.type === "expense");
    if (expenses.length === 0) return 0;

    // Last 3 calendar months
    const now = new Date();
    const monthTotals: number[] = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const total = expenses
        .filter(t => t.date.startsWith(ym))
        .reduce((s, t) => s + t.gbpValue, 0);
      monthTotals.push(total);
    }
    const nonZero = monthTotals.filter(v => v > 0);
    if (nonZero.length === 0) return 0;
    return nonZero.reduce((s, v) => s + v, 0) / nonZero.length;
  }, [allTxs]);

  const monthsCovered = avgMonthlyExpenses > 0 ? liquidSavings / avgMonthlyExpenses : 0;
  const TARGET_MONTHS = 6;
  const pct = Math.min(100, (monthsCovered / TARGET_MONTHS) * 100);

  const valueColor =
    monthsCovered < 3 ? "var(--ft-red)" :
    monthsCovered < 6 ? "var(--ft-amber)" :
    "var(--ft-green)";

  const barColor = valueColor;

  if (accounts === undefined) return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
      Loading…
    </div>
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "14px 16px", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--ft-dim)" }}>EMERGENCY FUND</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>{TARGET_MONTHS}MO TARGET</span>
      </div>

      {/* Big number */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 32, fontWeight: 700, color: valueColor, letterSpacing: "-0.02em", lineHeight: 1 }}>
          {monthsCovered > 0 ? `${monthsCovered.toFixed(1)}` : "—"}
        </span>
        {monthsCovered > 0 && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--ft-muted)", fontWeight: 600 }}>months</span>
        )}
      </div>

      {/* Meta */}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
        {formatGbp(liquidSavings)} liquid
        {avgMonthlyExpenses > 0 && ` · ${formatGbp(avgMonthlyExpenses)}/mo avg`}
      </div>

      {/* Progress bar */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 6 }}>
        <div style={{ height: 6, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: barColor, transition: "width 0.4s ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
          <span>0 mo</span>
          <span>{TARGET_MONTHS} mo goal</span>
        </div>
      </div>
    </div>
  );
}

const WIDGET_COMPONENTS: Record<WidgetId, ComponentType<{ isExpanded?: boolean }>> = {
  "net-worth": NetWorthWidget,
  "accounts-summary": AccountsSummaryWidget,
  "recent-transactions": RecentTransactionsWidget,
  "spending-breakdown": SpendingBreakdownWidget,
  "cash-flow": CashFlowWidget,
  "budget-tracker": BudgetTrackerWidget,
  "savings-goals": SavingsGoalsWidget,
  "subscription-tracker": SubscriptionTrackerWidget,
  "market-snapshot": MarketSnapshotWidget,
  "recurring-detector": RecurringDetectorWidget,
  "financial-health": FinancialHealthWidget,
  "transaction-calendar": TransactionCalendarWidget,
  "cash-flow-sankey": CashFlowSankeyWidget,
  "month-comparison": MonthComparisonWidget,
  "spending-forecast": SpendingForecastWidget,
  "daily-spend": DailySpendWidget,
  "top-merchants": TopMerchantsWidget,
  "cash-flow-preview": CashFlowPreviewWidgetProxy,
  "spending-velocity": SpendingVelocityWidgetProxy,
  "savings-rate": SavingsRateKpi,
  "emergency-fund": EmergencyFundWidget,
};

const WIDGET_DEF_MAP = Object.fromEntries(WIDGET_REGISTRY.map(w => [w.id, w]));

// ── Utility helpers ────────────────────────────────────────────────────────────

function getMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function getPrevMonthBounds(): { from: string; to: string } {
  const now = new Date();
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastOfPrev = new Date(firstOfThisMonth.getTime() - 1);
  const firstOfPrev = new Date(lastOfPrev.getFullYear(), lastOfPrev.getMonth(), 1);
  return {
    from: firstOfPrev.toISOString().slice(0, 10),
    to: lastOfPrev.toISOString().slice(0, 10),
  };
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()}`;
}

// ── Cash Flow Preview widget ───────────────────────────────────────────────────

function CashFlowPreviewPanel() {
  const { data: accounts } = useListAccounts({});
  const { data: upcoming } = useListUpcoming();

  const startingBalance = useMemo(
    () => (accounts ?? []).reduce((sum, a) => sum + a.gbpEquivalent, 0),
    [accounts]
  );

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const { inflows, outflows } = useMemo(() => {
    const items = (upcoming ?? []).filter(item => {
      const due = new Date(item.dueDate);
      return due >= now && due <= in30Days && item.status === "pending";
    });
    const inflows = items
      .filter(i => i.type === "income")
      .reduce((s, i) => s + i.gbpEquivalent, 0);
    const outflows = items
      .filter(i => i.type === "expense")
      .reduce((s, i) => s + i.gbpEquivalent, 0);
    return { inflows, outflows };
  }, [upcoming]);

  const net = inflows - outflows;
  const netColor = net >= 0 ? "var(--ft-green)" : "var(--ft-red)";

  return (
    <div style={{
      background: "var(--ft-surface)",
      border: "1px solid var(--ft-border)",
      borderTop: "2px solid var(--ft-cyan)",
      padding: "14px 16px",
    }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 12 }}>
        Cash Flow · 30 Days
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 20, marginBottom: 14 }}>
        <div>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: netColor, lineHeight: 1 }}>
            <AnimatedNet value={net} />
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>projected net</div>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", paddingBottom: 2 }}>
          from <span className="pnum">{formatGbp(startingBalance)}</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Inflows</span>
          <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--ft-green)" }}>+{formatGbp(inflows)}</span>
        </div>
        <div style={{ width: 1, background: "var(--ft-border2)", flexShrink: 0 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Outflows</span>
          <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--ft-red)" }}>-{formatGbp(outflows)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Spending Velocity widget ───────────────────────────────────────────────────

function SpendingVelocityPanel() {
  const monthStart = useMemo(() => getMonthStart(), []);
  const prevBounds = useMemo(() => getPrevMonthBounds(), []);

  const { data: thisTxs } = useListTransactions({ type: "expense", dateFrom: monthStart });
  const { data: prevTxs } = useListTransactions({ type: "expense", dateFrom: prevBounds.from, dateTo: prevBounds.to });

  const now = new Date();
  const dayOfMonth = now.getDate();

  const avgDailyThis = useMemo(() => {
    const total = (thisTxs ?? []).reduce((s, t) => s + t.gbpValue, 0);
    return dayOfMonth > 0 ? total / dayOfMonth : 0;
  }, [thisTxs, dayOfMonth]);

  const avgDailyPrev = useMemo(() => {
    const daysInPrev = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    const total = (prevTxs ?? []).reduce((s, t) => s + t.gbpValue, 0);
    return daysInPrev > 0 ? total / daysInPrev : 0;
  }, [prevTxs]);

  // Last 14 days daily spend bars
  const last14 = useMemo(() => {
    const result: { label: string; amount: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const dayTotal = (thisTxs ?? [])
        .filter(t => t.date === ds)
        .reduce((s, t) => s + t.gbpValue, 0);
      result.push({ label: formatDayLabel(ds), amount: dayTotal });
    }
    return result;
  }, [thisTxs]);

  const maxBar = Math.max(...last14.map(d => d.amount), 1);
  const pctChange = avgDailyPrev > 0 ? ((avgDailyThis - avgDailyPrev) / avgDailyPrev) * 100 : 0;
  const onTrack = pctChange <= 5;

  return (
    <div style={{
      background: "var(--ft-surface)",
      border: "1px solid var(--ft-border)",
      borderTop: `2px solid ${onTrack ? "var(--ft-green)" : "var(--ft-amber)"}`,
      padding: "14px 16px",
    }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 12 }}>
        Spend Rate
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "var(--ft-text)", lineHeight: 1 }}>
            <AnimatedSpendRate value={avgDailyThis} /><span style={{ fontSize: 11, fontWeight: 400, color: "var(--ft-dim)" }}>/day</span>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>
            vs <span className="pnum">{formatGbp(avgDailyPrev)}</span>/day last month
          </div>
        </div>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: onTrack ? "var(--ft-green)" : "var(--ft-amber)",
          border: `1px solid ${onTrack ? "rgba(63,185,80,0.3)" : "rgba(255,166,0,0.3)"}`,
          background: onTrack ? "rgba(63,185,80,0.08)" : "rgba(255,166,0,0.08)",
          padding: "3px 8px",
        }}>
          {onTrack ? "On Track" : "Over Pace"}
          {avgDailyPrev > 0 && (
            <span style={{ fontWeight: 400, marginLeft: 4, opacity: 0.8 }}>
              {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(0)}%
            </span>
          )}
        </div>
      </div>

      {/* Sparkline bars — last 14 days */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 32 }}>
        {last14.map((d, i) => {
          const h = Math.round((d.amount / maxBar) * 28);
          return (
            <div
              key={i}
              title={`Day ${d.label}: ${formatGbp(d.amount)}`}
              style={{
                flex: 1,
                height: Math.max(h, d.amount > 0 ? 2 : 1),
                background: d.amount > avgDailyThis * 1.3 ? "var(--ft-amber)" : "var(--ft-accent)",
                opacity: 0.7,
                transition: "height 0.2s",
              }}
            />
          );
        })}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 3, textAlign: "right" }}>
        last 14 days
      </div>
    </div>
  );
}

// ── AI Insights strip ──────────────────────────────────────────────────────────

function AiInsightsStrip() {
  const monthStart = useMemo(() => getMonthStart(), []);
  const prevBounds = useMemo(() => getPrevMonthBounds(), []);

  const { data: thisTxs } = useListTransactions({ type: "expense", dateFrom: monthStart });
  const { data: prevTxs } = useListTransactions({ type: "expense", dateFrom: prevBounds.from, dateTo: prevBounds.to });
  const { data: upcoming } = useListUpcoming();

  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const insight1 = useMemo(() => {
    if (!thisTxs || !prevTxs) return null;

    // Top category this month
    const catMap: Record<string, number> = {};
    for (const t of thisTxs) {
      catMap[t.category] = (catMap[t.category] ?? 0) + t.gbpValue;
    }
    const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
    if (!topCat) return null;

    const prevCatMap: Record<string, number> = {};
    for (const t of prevTxs) {
      prevCatMap[t.category] = (prevCatMap[t.category] ?? 0) + t.gbpValue;
    }

    const prevAmt = prevCatMap[topCat[0]] ?? 0;
    if (prevAmt === 0) return `Top spend category this month: ${topCat[0]} at ${formatGbp(topCat[1])}.`;

    const pct = Math.round(((topCat[1] - prevAmt) / prevAmt) * 100);
    return `Spent ${pct >= 0 ? pct + "% more" : Math.abs(pct) + "% less"} on ${topCat[0]} this month vs last (${formatGbp(topCat[1])} vs ${formatGbp(prevAmt)}).`;
  }, [thisTxs, prevTxs]);

  const insight2 = useMemo(() => {
    if (!thisTxs || thisTxs.length === 0) return null;

    const dayMap: Record<string, number> = {};
    for (const t of thisTxs) {
      dayMap[t.date] = (dayMap[t.date] ?? 0) + t.gbpValue;
    }
    const best = Object.entries(dayMap).sort((a, b) => b[1] - a[1])[0];
    if (!best) return null;

    const d = new Date(best[0]);
    const label = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return `Biggest spend day this month: ${label} — ${formatGbp(best[1])}.`;
  }, [thisTxs]);

  const insight3 = useMemo(() => {
    const bills = (upcoming ?? []).filter(item => {
      const due = new Date(item.dueDate);
      return item.type === "expense" && item.status === "pending" && due >= now && due <= sevenDays;
    });
    if (bills.length === 0) return "No upcoming bills due in the next 7 days.";
    const total = bills.reduce((s, b) => s + b.gbpEquivalent, 0);
    return `${bills.length} recurring bill${bills.length !== 1 ? "s" : ""} totalling ${formatGbp(total)} due in the next 7 days.`;
  }, [upcoming]);

  const insights = [insight1, insight2, insight3].filter(Boolean) as string[];

  if (insights.length === 0) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8 }}>
        <span style={{ color: "var(--ft-accent)" }}>·</span> Insights
      </div>
      <div className="ft-dashboard-insights">
        {insights.map((text, i) => (
          <div
            key={i}
            style={{
              background: "var(--ft-surface)",
              borderLeft: "2px solid rgba(244,162,30,0.4)",
              padding: "10px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ft-muted)",
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-accent)", marginBottom: 4 }}>
              {i === 0 ? "Category Trend" : i === 1 ? "Peak Day" : "Upcoming"}
            </div>
            {text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Widget left-rail button ────────────────────────────────────────────────────

function RailBtn({ icon, title, onClick, danger }: {
  icon: string;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      onPointerDown={e => e.stopPropagation()}
      style={{
        background: "none",
        border: "none",
        color: "var(--ft-dim)",
        cursor: "pointer",
        fontFamily: "var(--font-mono)",
        fontSize: 13,
        width: 30,
        height: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        transition: "color 0.1s, background 0.1s",
        lineHeight: 1,
        borderRadius: 0,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color = danger ? "var(--ft-red)" : "var(--ft-accent)";
        e.currentTarget.style.background = "rgba(255,255,255,0.07)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = "var(--ft-dim)";
        e.currentTarget.style.background = "none";
      }}
    >
      {icon}
    </button>
  );
}

// ── Expanded widget modal ──────────────────────────────────────────────────────

function WidgetModal({ id, onClose }: { id: WidgetId; onClose: () => void }) {
  const Component = WIDGET_COMPONENTS[id];
  const def = WIDGET_DEF_MAP[id];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.78)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        backdropFilter: "blur(2px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--ft-bg)",
          border: "1px solid var(--ft-border)",
          width: "min(95vw, 1400px)",
          height: "min(90vh, 900px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid var(--ft-border2)",
          padding: "0 16px",
          height: 40,
          flexShrink: 0,
          background: "var(--ft-raised)",
          gap: 12,
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em" }}>⤢</span>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ft-accent)",
          }}>
            {def?.label ?? id}
          </span>
          {def?.description && (
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--ft-dim)",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              — {def.description}
            </span>
          )}
          {!def?.description && <span style={{ flex: 1 }} />}
          <button
            onClick={onClose}
            title="Close (Esc)"
            style={{
              background: "none",
              border: "1px solid var(--ft-border2)",
              color: "var(--ft-dim)",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 14,
              lineHeight: 1,
              padding: "3px 8px",
              transition: "color 0.1s, border-color 0.1s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--ft-red)"; e.currentTarget.style.borderColor = "var(--ft-red)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--ft-dim)"; e.currentTarget.style.borderColor = "var(--ft-border2)"; }}
          >
            ×
          </button>
        </div>
        {/* Widget content */}
        <div style={{ flex: 1, overflow: "auto" }}>
          <Component isExpanded={true} />
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Sortable widget wrapper ────────────────────────────────────────────────────

interface SortableWidgetProps {
  id: WidgetId;
  span: "half" | "full";
  index: number;
  onToggleSpan: () => void;
  onRemove: () => void;
  onExpand: () => void;
}

function SortableWidget({ id, span, index, onToggleSpan, onRemove, onExpand }: SortableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const [hovered, setHovered] = useState(false);

  const outerStyle = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform ? { ...transform, scaleX: 1, scaleY: 1 } : null),
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0 : 1,
    position: "relative" as const,
    "--widget-stagger": `${index * 40}ms`,
  } as React.CSSProperties;

  const Component = WIDGET_COMPONENTS[id];

  return (
    <div
      ref={setNodeRef}
      style={outerStyle}
      className="widget-container"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Flex row: rail + widget side by side — rail pushes content, never overlays it */}
      <div style={{ display: "flex", alignItems: "stretch" }}>

        {/* Left rail */}
        <div
          style={{
            width: hovered ? 30 : 0,
            minWidth: 0,
            overflow: "hidden",
            flexShrink: 0,
            background: "var(--ft-raised)",
            borderRight: hovered ? "1px solid var(--ft-border2)" : "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            transition: "width 0.16s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          <button
            {...attributes}
            {...listeners}
            title="Drag to reorder"
            style={{
              background: "none",
              border: "none",
              color: "var(--ft-dim)",
              cursor: isDragging ? "grabbing" : "grab",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              width: 30,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "color 0.1s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--ft-accent)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--ft-dim)"; }}
          >
            ⠿
          </button>

          <div style={{ width: 14, height: 1, background: "var(--ft-border2)", flexShrink: 0 }} />

          <RailBtn icon="⤢" title="Expand to fullscreen" onClick={onExpand} />
          <RailBtn
            icon={span === "full" ? "⊟" : "⊞"}
            title={span === "full" ? "Make half-width" : "Make full-width"}
            onClick={onToggleSpan}
          />
          <RailBtn icon="×" title="Remove widget" onClick={onRemove} danger />
        </div>

        {/* Widget fills remaining width */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Component isExpanded={span === "full"} />
        </div>
      </div>
    </div>
  );
}

function WidgetPicker({ disabledIds, onAdd }: { disabledIds: WidgetId[]; onAdd: (id: WidgetId) => void }) {
  const [open, setOpen] = useState(false);

  if (disabledIds.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: "none",
          border: "1px dashed var(--ft-border2)",
          color: open ? "var(--ft-accent)" : "var(--ft-dim)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          padding: "6px 14px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          transition: "all 0.1s",
          width: "100%",
          justifyContent: "center",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ft-accent)"; e.currentTarget.style.color = "var(--ft-accent)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--ft-border2)"; e.currentTarget.style.color = open ? "var(--ft-accent)" : "var(--ft-dim)"; }}
      >
        <span style={{ fontSize: 12, lineHeight: 1 }}>{open ? "−" : "+"}</span>
        {open ? "Hide widget picker" : `Add widget (${disabledIds.length} available)`}
      </button>

      {open && (
        <div style={{
          marginTop: 8,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 8,
        }}>
          {disabledIds.map(id => {
            const def = WIDGET_DEF_MAP[id];
            return (
              <button
                key={id}
                onClick={() => { onAdd(id); }}
                style={{
                  background: "var(--ft-surface)",
                  border: "1px solid var(--ft-border)",
                  padding: "10px 12px",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  transition: "border-color 0.1s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ft-accent)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--ft-border)"; }}
              >
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-accent)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  + {def?.label ?? id}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", lineHeight: 1.5 }}>
                  {def?.description ?? ""}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Dashboard page ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { order, isEnabled, setOrder, toggle, toggleSpan, getSpan } = useWidgets();
  const [activeId, setActiveId] = useState<WidgetId | null>(null);
  const [expandedWidgetId, setExpandedWidgetId] = useState<WidgetId | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () =>
      localStorage.getItem("nr-onboarding-complete") === "1" ||
      localStorage.getItem("ft-onboarding-dismissed") === "1"
  );
  // Show the wizard whenever the user hasn't completed/dismissed it, regardless of account count.
  // This ensures returning users who reset onboarding also see it.
  const showOnboarding = !onboardingDismissed;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const enabledIds = order.filter(id => isEnabled(id as WidgetId)) as WidgetId[];
  const disabledIds = order.filter(id => !isEnabled(id as WidgetId)) as WidgetId[];

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as WidgetId);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = enabledIds.indexOf(active.id as WidgetId);
    const newIndex = enabledIds.indexOf(over.id as WidgetId);
    if (oldIndex === -1 || newIndex === -1) return;

    const newEnabled = [...enabledIds];
    newEnabled.splice(oldIndex, 1);
    newEnabled.splice(newIndex, 0, active.id as WidgetId);

    setOrder([...newEnabled, ...disabledIds]);
  }

  return (
    <div>
      {/* Expanded widget modal */}
      {expandedWidgetId && (
        <WidgetModal id={expandedWidgetId} onClose={() => setExpandedWidgetId(null)} />
      )}

      {/* Smart alerts — renders nothing when no active alerts */}
      <SmartAlertsWidget />

      {/* First-run onboarding wizard */}
      <OnboardingWizard
        open={showOnboarding}
        onClose={() => {
          localStorage.setItem("nr-onboarding-complete", "1");
          setOnboardingDismissed(true);
        }}
      />

      {/* Page label */}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
        <span><span style={{ color: "var(--ft-accent)" }}>·</span> Portfolio Overview</span>
        <span style={{ color: "var(--ft-border2)" }}>
          {enabledIds.length} widget{enabledIds.length !== 1 ? "s" : ""}
        </span>
        <span style={{ color: "var(--ft-border2)", fontSize: 9 }}>· drag to reorder · hover for controls</span>
      </div>

      {enabledIds.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "60px 0" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-muted)" }}>
            No widgets enabled — add one below
          </div>
        </div>
      ) : (
        /* Drag-and-drop grid */
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveId(null)}>
          <SortableContext items={enabledIds} strategy={rectSortingStrategy}>
            {(() => {
              const fullIds = enabledIds.filter(id => getSpan(id) === "full");
              const halfIds = enabledIds.filter(id => getSpan(id) !== "full");
              const leftIds = halfIds.filter((_, i) => i % 2 === 0);
              const rightIds = halfIds.filter((_, i) => i % 2 === 1);
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {fullIds.map((id, idx) => (
                    <SortableWidget key={id} id={id} span="full" index={idx} onToggleSpan={() => toggleSpan(id)} onRemove={() => toggle(id)} onExpand={() => setExpandedWidgetId(id)} />
                  ))}
                  <div className="ft-dashboard-two-col">
                    <div>
                      {leftIds.map((id, idx) => (
                        <SortableWidget key={id} id={id} span="half" index={fullIds.length + idx * 2} onToggleSpan={() => toggleSpan(id)} onRemove={() => toggle(id)} onExpand={() => setExpandedWidgetId(id)} />
                      ))}
                    </div>
                    <div>
                      {rightIds.map((id, idx) => (
                        <SortableWidget key={id} id={id} span="half" index={fullIds.length + idx * 2 + 1} onToggleSpan={() => toggleSpan(id)} onRemove={() => toggle(id)} onExpand={() => setExpandedWidgetId(id)} />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </SortableContext>
          <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
            {activeId ? (
              <div style={{
                background: "var(--ft-surface)",
                border: "1px solid var(--ft-accent)",
                boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "grabbing",
                minHeight: 48,
              }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-dim)" }}>⠿</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
                  {WIDGET_DEF_MAP[activeId]?.label ?? activeId}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* AI Insights strip — full width below grid */}
      <AiInsightsStrip />

      {/* Inline widget picker */}
      <WidgetPicker disabledIds={disabledIds} onAdd={id => toggle(id)} />
    </div>
  );
}
