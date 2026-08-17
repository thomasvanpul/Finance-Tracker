import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  PointerSensor,
  TouchSensor,
  MouseSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { useWidgets, WIDGET_REGISTRY, type WidgetId, type WidgetSpan } from "@/contexts/widgets-context";
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
import { DecisionEngineWidget } from "@/components/widgets/decision-engine";
import { CashRunwayWidget } from "@/components/widgets/cash-runway";
import { COMPACT_WIDGET_COMPONENTS, COMPACT_WIDGET_FULL_WIDTH } from "@/components/widgets/compact-tiles";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { useListAccounts, useListTransactions, useListUpcoming, useGetDashboard } from "@workspace/api-client-react";
import { Link } from "wouter";
import { formatGbp, formatNative } from "@/lib/utils";
import { loadPersonaIds, PERSONAS, type PersonaId } from "@/lib/persona";
import { useActivePersona } from "@/lib/persona-hook";
import { useLocation } from "wouter";
import { PersonaQuickStart } from "@/components/persona-quick-start";
import { Zap, RefreshCw } from "lucide-react";
import { useState, useMemo, useEffect, useRef, memo } from "react";
import type { ComponentType } from "react";
import { createPortal } from "react-dom";
import { useCountUp } from "@/hooks/use-count-up";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { HStack, MonoLabel, PanelBox, Text, VStack } from "@/components/primitives";

// ── Saved Views ───────────────────────────────────────────────────────────────

interface DashboardView {
  id: string;
  name: string;
  enabled: string[];
  order: string[];
  spans: Record<string, string>;
  createdAt: string;
}

const VIEWS_KEY = "ft-dashboard-views";

function loadViews(): DashboardView[] {
  try {
    const raw = localStorage.getItem(VIEWS_KEY);
    return raw ? (JSON.parse(raw) as DashboardView[]) : [];
  } catch { return []; }
}

function saveViews(views: DashboardView[]): void {
  try { localStorage.setItem(VIEWS_KEY, JSON.stringify(views)); } catch {}
}

function layoutFingerprint(enabled: string[], order: string[], spans: Record<string, string>): string {
  return JSON.stringify({ e: [...enabled].sort(), o: order, s: spans });
}

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
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderTop: "2px solid var(--ft-green)", minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
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
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderTop: `2px solid ${barColor}`, minHeight: 160, display: "flex", flexDirection: "column", padding: "14px 16px", gap: 14 }}>
      {/* Header */}
      <HStack align="baseline" justify="between" minWidth0>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--ft-dim)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>SAVINGS RATE</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", flexShrink: 0, whiteSpace: "nowrap" }}>{target}% TARGET</span>
      </HStack>

      {/* Big number */}
      <HStack gap={8} align="baseline" minWidth0>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: barColor, letterSpacing: "-0.02em", lineHeight: 1, flexShrink: 0, whiteSpace: "nowrap" }}>
          {rate}%
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: diff >= 0 ? "var(--ft-green)" : barColor, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>
          {diff >= 0 ? `+${diff}pp` : `${diff}pp`}
        </span>
      </HStack>

      {/* Progress bar */}
      <VStack gap={6} justify="end" grow>
        <div style={{ height: 6, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: barColor, transition: "width 0.15s ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
          <span>0%</span>
          <span>{target}% goal</span>
          <span>100%</span>
        </div>
      </VStack>
    </div>
  );
}

// ── Emergency Fund Widget ──────────────────────────────────────────────────────

function EmergencyFundWidget() {
  const { data: accounts } = useListAccounts({});
  const { data: allTxs } = useListTransactions({});

  // Sum all accounts as liquid savings (the Account schema has no type
  // field). Unconvertible accounts fall out — the dashboard's own
  // netWorth already reports the honest total; this local sum drives
  // secondary widgets that consume liquidSavings as an input.
  const liquidSavings = useMemo(() => {
    return (accounts ?? []).reduce((s, a) => s + (a.gbpEquivalent ?? 0), 0);
  }, [accounts]);

  const avgMonthlyExpenses = useMemo(() => {
    const txs = (allTxs ?? []) as { type: string; gbpValue: number | null; date: string }[];
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
        .reduce((s, t) => s + (t.gbpValue ?? 0), 0);
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
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderTop: "2px solid var(--ft-amber)", minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
      Loading…
    </div>
  );

  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderTop: `2px solid ${valueColor}`, minHeight: 180, display: "flex", flexDirection: "column", padding: "14px 16px", gap: 14 }}>
      {/* Header */}
      <HStack align="baseline" justify="between" minWidth0>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--ft-dim)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>EMERGENCY FUND</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", flexShrink: 0, whiteSpace: "nowrap" }}>{TARGET_MONTHS}MO TARGET</span>
      </HStack>

      {/* Big number */}
      <HStack gap={8} align="baseline" minWidth0>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: valueColor, letterSpacing: "-0.02em", lineHeight: 1, flexShrink: 0, whiteSpace: "nowrap" }}>
          {monthsCovered > 0 ? `${monthsCovered.toFixed(1)}` : "—"}
        </span>
        {monthsCovered > 0 && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--ft-muted)", fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>months</span>
        )}
      </HStack>

      {/* Meta */}
      <Text as="div" mono size={9} color="var(--ft-dim)">
        <span className="pnum">{formatGbp(liquidSavings)}</span> liquid
        {avgMonthlyExpenses > 0 && ` · ${formatGbp(avgMonthlyExpenses)}/mo avg`}
      </Text>

      {/* Progress bar */}
      <VStack gap={6} justify="end" grow>
        <div style={{ height: 6, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: barColor, transition: "width 0.15s ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
          <span>0 mo</span>
          <span>{TARGET_MONTHS} mo goal</span>
        </div>
      </VStack>
    </div>
  );
}

// ── Net Worth Milestones widget ────────────────────────────────────────────────

const MILESTONES_GBP = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];

function formatMilestone(n: number): string {
  if (n >= 1_000_000) return `£${n / 1_000_000}M`;
  if (n >= 1_000) return `£${n / 1_000}K`;
  return `£${n}`;
}

function loadReachedMilestones(): number[] {
  try {
    const raw = localStorage.getItem("ft-nw-milestones");
    if (raw) return JSON.parse(raw) as number[];
  } catch {}
  return [];
}

function saveReachedMilestones(ms: number[]): void {
  try { localStorage.setItem("ft-nw-milestones", JSON.stringify(ms)); } catch {}
}

export function NetWorthMilestonesWidget() {
  const { data: dash } = useGetDashboard();
  const { toast } = useToast();
  const netWorth = dash?.netWorth ?? 0;

  const reached = useMemo(() => MILESTONES_GBP.filter(m => netWorth >= m), [netWorth]);

  useEffect(() => {
    if (!dash) return;
    const stored = loadReachedMilestones();
    const storedSet = new Set(stored);
    const newlyReached = reached.filter(m => !storedSet.has(m));
    if (newlyReached.length > 0) {
      const top = newlyReached[newlyReached.length - 1];
      toast({
        title: "MILESTONE REACHED",
        description: `Net worth has crossed ${formatMilestone(top)}`,
      });
      saveReachedMilestones([...stored, ...newlyReached]);
    }
  }, [dash, reached, toast]);

  const next = MILESTONES_GBP.find(m => netWorth < m);
  const progress = next ? Math.min((netWorth / next) * 100, 100) : 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 140 }}>
      <div style={{ padding: "10px 14px 6px", borderBottom: "1px solid var(--ft-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Text as="span" mono upper size={9} weight={700} color="var(--ft-dim)" letterSpacing="0.12em">NET WORTH MILESTONES</Text>
        <Text as="span" mono size={9} color="var(--ft-muted)">{reached.length} / {MILESTONES_GBP.length}</Text>
      </div>
      <VStack gap={8} padding="10px 14px" grow>
        <HStack gap={4} wrap>
          {MILESTONES_GBP.map(m => {
            const done = netWorth >= m;
            return (
              <div key={m} style={{
                fontFamily: "var(--font-mono)", fontSize: 9, padding: "2px 7px",
                border: `1px solid ${done ? "var(--ft-green)" : "var(--ft-border)"}`,
                color: done ? "var(--ft-green)" : "var(--ft-dim)",
                background: done ? "color-mix(in srgb, var(--ft-green) 6%, transparent)" : "transparent",
                letterSpacing: "0.04em",
              }}>
                {done ? "✓ " : ""}{formatMilestone(m)}
              </div>
            );
          })}
        </HStack>
        {next && (
          <>
            <Text as="div" mono size={9} color="var(--ft-muted)">
              Next: {formatMilestone(next)} · {formatMilestone(Math.round(next - netWorth))} to go
            </Text>
            <div style={{ height: 4, background: "var(--ft-border)", marginTop: 2 }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "var(--ft-green)", transition: "width 0.15s ease" }} />
            </div>
          </>
        )}
        {!next && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-green)", display: "flex", alignItems: "center", gap: 5 }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 1h7v5a3.5 3.5 0 01-7 0V1z"/><path d="M2 3H.5a1 1 0 000 2H2M9 3h1.5a1 1 0 010 2H9M5.5 9.5v1M3.5 10.5h4"/></svg>
            All milestones reached!
          </div>
        )}
      </VStack>
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
  "nw-milestones": NetWorthMilestonesWidget,
  "decision-engine": DecisionEngineWidget,
  "cash-runway": CashRunwayWidget,
};

const WIDGET_DEF_MAP = Object.fromEntries(WIDGET_REGISTRY.map(w => [w.id, w]));

const WIDGET_NAV: Partial<Record<WidgetId, { label: string; href: string }[]>> = {
  "spending-breakdown":  [{ label: "→ Analytics", href: "/analytics" }, { label: "→ Transactions", href: "/transactions" }],
  "cash-flow":           [{ label: "→ Analytics", href: "/analytics" }],
  "recent-transactions": [{ label: "→ All transactions", href: "/transactions" }],
  "accounts-summary":    [{ label: "→ Accounts", href: "/accounts" }],
  "net-worth":           [{ label: "→ Net Worth", href: "/net-worth" }],
  "budget-tracker":      [{ label: "→ Budget", href: "/budget" }],
  "savings-goals":       [{ label: "→ Goals", href: "/goals" }],
  "market-snapshot":     [{ label: "→ Markets", href: "/markets" }],
  "transaction-calendar":[{ label: "→ Analytics", href: "/analytics" }],
  "month-comparison":    [{ label: "→ Analytics", href: "/analytics" }],
  "spending-forecast":   [{ label: "→ Budget", href: "/budget" }],
  "daily-spend":         [{ label: "→ Transactions", href: "/transactions" }],
  "top-merchants":       [{ label: "→ Transactions", href: "/transactions" }],
  "cash-flow-preview":   [{ label: "→ Analytics", href: "/analytics" }],
  "spending-velocity":   [{ label: "→ Transactions", href: "/transactions" }],
  "savings-rate":        [{ label: "→ Goals", href: "/goals" }],
  "cash-runway":         [{ label: "→ Accounts", href: "/accounts" }],
  "emergency-fund":      [{ label: "→ Goals", href: "/goals" }],
  "decision-engine":     [{ label: "→ Decisions", href: "/decisions" }],
  "financial-health":    [{ label: "→ Analytics", href: "/analytics" }],
  "nw-milestones":       [{ label: "→ Net Worth", href: "/net-worth" }],
};

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
    () => (accounts ?? []).reduce((sum, a) => sum + (a.gbpEquivalent ?? 0), 0),
    [accounts]
  );

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const { inflows, outflows } = useMemo(() => {
    const items = (upcoming ?? []).filter(item => {
      const due = new Date(item.dueDate);
      return due >= now && due <= in30Days && item.status === "pending";
    });
    // Skip FX-unavailable upcoming items in the 30d roll-up; the
    // native-column detail views elsewhere still show the row.
    const inflows = items
      .filter(i => i.type === "income")
      .reduce((s, i) => s + (i.gbpEquivalent ?? 0), 0);
    const outflows = items
      .filter(i => i.type === "expense")
      .reduce((s, i) => s + (i.gbpEquivalent ?? 0), 0);
    return { inflows, outflows };
  }, [upcoming]);

  const net = inflows - outflows;
  const netColor = net > 0 ? "var(--ft-green)" : net < 0 ? "var(--ft-red)" : "var(--ft-muted)";

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

      <HStack gap={20} align="end" marginBottom={14} minWidth0>
        <div style={{ minWidth: 0 }}>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: netColor, lineHeight: 1, whiteSpace: "nowrap" }}>
            <AnimatedNet value={net} />
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>projected net</div>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", paddingBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>
          from <span className="pnum">{formatGbp(startingBalance)}</span>
        </div>
      </HStack>

      <HStack gap={16} minWidth0>
        <HStack gap={6} align="center" minWidth0>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ft-dim)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>Inflows</span>
          <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--ft-green)", flexShrink: 0, whiteSpace: "nowrap" }}>+{formatGbp(inflows)}</span>
        </HStack>
        <div style={{ width: 1, background: "var(--ft-border2)", flexShrink: 0 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ft-dim)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>Outflows</span>
          <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--ft-red)", flexShrink: 0, whiteSpace: "nowrap" }}>-{formatGbp(outflows)}</span>
        </div>
      </HStack>
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
    const total = (thisTxs ?? []).reduce((s, t) => s + (t.gbpValue ?? 0), 0);
    return dayOfMonth > 0 ? total / dayOfMonth : 0;
  }, [thisTxs, dayOfMonth]);

  const avgDailyPrev = useMemo(() => {
    const daysInPrev = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    const total = (prevTxs ?? []).reduce((s, t) => s + (t.gbpValue ?? 0), 0);
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
        .reduce((s, t) => s + (t.gbpValue ?? 0), 0);
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

      <HStack gap={8} align="end" justify="between" marginBottom={14} minWidth0>
        <div style={{ minWidth: 0 }}>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--ft-text)", lineHeight: 1, whiteSpace: "nowrap" }}>
            <AnimatedSpendRate value={avgDailyThis} /><Text as="span" size={11} weight={400} color="var(--ft-dim)">/day</Text>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
          border: `1px solid ${onTrack ? "color-mix(in srgb, var(--ft-green) 30%, transparent)" : "color-mix(in srgb, var(--ft-amber) 30%, transparent)"}`,
          background: onTrack ? "color-mix(in srgb, var(--ft-green) 8%, transparent)" : "color-mix(in srgb, var(--ft-amber) 8%, transparent)",
          padding: "3px 8px",
        }}>
          {onTrack ? "On Track" : "Over Pace"}
          {avgDailyPrev > 0 && (
            <span style={{ fontWeight: 400, marginLeft: 4, opacity: 0.8 }}>
              {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(0)}%
            </span>
          )}
        </div>
      </HStack>

      {/* Sparkline bars — last 14 days */}
      <HStack gap={2} align="end" height={32}>
        {last14.map((d) => {
          const h = Math.round((d.amount / maxBar) * 28);
          return (
            <div
              key={d.label}
              title={`Day ${d.label}: ${formatGbp(d.amount)}`}
              style={{
                flex: 1,
                height: Math.max(h, d.amount > 0 ? 2 : 1),
                background: d.amount > avgDailyThis * 1.3 ? "var(--ft-amber)" : "var(--ft-accent)",
                opacity: 0.7,
              }}
            />
          );
        })}
      </HStack>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 3, textAlign: "right" }}>
        last 14 days
      </div>
    </div>
  );
}

// ── AI Insights strip ──────────────────────────────────────────────────────────

function InsightRow({ label, text }: { label: string; text: string }) {
  const [hovered, setHovered] = useState<boolean>(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "var(--ft-raised)" : "var(--ft-surface)",
        borderLeft: "2px solid color-mix(in srgb, var(--ft-accent) 40%, transparent)",
        padding: "10px 12px",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: "var(--ft-muted)",
        lineHeight: 1.6,
        transition: "background 0.1s",
      }}
    >
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-accent)", marginBottom: 4 }}>
        {label}
      </div>
      {text}
    </div>
  );
}

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

    // Top category this month. Skip unconvertible rows — a "top
    // category" produced by fabricated zeros would be nonsense.
    const catMap: Record<string, number> = {};
    for (const t of thisTxs) {
      if (t.gbpValue == null) continue;
      catMap[t.category] = (catMap[t.category] ?? 0) + t.gbpValue;
    }
    const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
    if (!topCat) return null;

    const prevCatMap: Record<string, number> = {};
    for (const t of prevTxs) {
      if (t.gbpValue == null) continue;
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
      if (t.gbpValue == null) continue;
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
    // Sum only bills whose FX we have; the sentence still cites all N
    // bills so nothing vanishes from the count.
    const total = bills.reduce((s, b) => s + (b.gbpEquivalent ?? 0), 0);
    return `${bills.length} recurring bill${bills.length !== 1 ? "s" : ""} totalling ${formatGbp(total)} due in the next 7 days.`;
  }, [upcoming]);

  const insightRows = [
    { label: "Category Trend", text: insight1 },
    { label: "Peak Day",       text: insight2 },
    { label: "Upcoming",       text: insight3 },
  ].filter(r => r.text !== null) as { label: string; text: string }[];

  if (insightRows.length === 0) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8 }}>
        <Text as="span" color="var(--ft-accent)">·</Text> Insights
      </div>
      <div className="ft-dashboard-insights">
        {insightRows.map(({ label, text }) => (
          <InsightRow key={label} label={label} text={text} />
        ))}
      </div>
    </div>
  );
}

// ── AI Insights Panel (AI-powered, sessionStorage-cached) ─────────────────────

const AI_INSIGHTS_CACHE_KEY = "ft-dashboard-ai-insights";
const AI_INSIGHTS_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface AiInsightsCacheEntry {
  insights: string[];
  ts: number;
}

function loadCachedInsights(): string[] | null {
  try {
    const raw = sessionStorage.getItem(AI_INSIGHTS_CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as AiInsightsCacheEntry;
    if (Date.now() - entry.ts > AI_INSIGHTS_TTL_MS) return null;
    return entry.insights;
  } catch { return null; }
}

function saveCachedInsights(insights: string[]): void {
  try {
    const entry: AiInsightsCacheEntry = { insights, ts: Date.now() };
    sessionStorage.setItem(AI_INSIGHTS_CACHE_KEY, JSON.stringify(entry));
  } catch {}
}

interface AiInsightsPanelProps {
  netWorth: number;
  income: number;
  expenses: number;
  savingsRate: number;
  topCategories: { name: string; amount: number }[];
  budgetStatus: string;
}

function AiInsightsPanel({ netWorth, income, expenses, savingsRate, topCategories, budgetStatus }: AiInsightsPanelProps) {
  const [insights, setInsights] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  const contextStr = useMemo(() => {
    const top3 = topCategories.slice(0, 3).map(c => `${c.name}:${formatGbp(c.amount)}`).join(", ");
    return `NW:${formatGbp(netWorth)} Inc:${formatGbp(income)} Exp:${formatGbp(expenses)} SR:${Math.round(savingsRate)}% Top:${top3} ${budgetStatus}`.slice(0, 400);
  }, [netWorth, income, expenses, savingsRate, topCategories, budgetStatus]);

  const fetchInsights = async (ctx: string) => {
    try {
      const statusRes = await fetch("/api/ai/status", { credentials: "include" });
      if (!statusRes.ok) return; // no skeleton flash — AI unavailable
      const { available } = await statusRes.json() as { available: boolean };
      if (!available) return; // confirmed unavailable — stay hidden, no flash

      setLoading(true); // only show skeleton after confirming AI is reachable
      const prompt = `You are a concise personal finance analyst. Given this dashboard snapshot: ${ctx}\n\nWrite exactly 3 short, punchy, data-specific insight sentences (1 sentence each). Each should be actionable and reference actual numbers from the context. Respond with only the 3 sentences, one per line, no numbering, no extra text.`;
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: [{ role: "user", text: prompt }],
          context: ctx,
        }),
      });
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json() as { text: string };
      const lines = data.text
        .split("\n")
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0)
        .slice(0, 3);
      if (lines.length > 0) {
        saveCachedInsights(lines);
        setInsights(lines);
      }
    } catch {
      // silently hide on error
    }
    setLoading(false);
  };

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const cached = loadCachedInsights();
    if (cached) { setInsights(cached); return; }
    const timer = setTimeout(() => fetchInsights(contextStr), 500);
    return () => clearTimeout(timer);
  // contextStr is built from stable props — intentionally only run on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    try { sessionStorage.removeItem(AI_INSIGHTS_CACHE_KEY); } catch {}
    setInsights(null);
    setLoading(false);
    fetchedRef.current = false;
    void fetchInsights(contextStr);
  };

  // Don't render anything until we know the result (avoids layout shift)
  if (!loading && insights === null) return null;

  return (
    <div style={{
      background: "var(--ft-surface)",
      border: "1px solid var(--ft-border)",
      marginBottom: 6,
    }}>
      {/* Terminal panel header */}
      <div style={{
        background: "var(--ft-raised)",
        borderBottom: "1px solid var(--ft-border)",
        padding: "0 12px",
        height: "var(--ft-panel-header-h)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span className="ft-panel-label">
          <span className="accent-dot">·</span> AI INSIGHTS
        </span>
        <button
          onClick={handleRefresh}
          title="Refresh AI insights"
          disabled={loading}
          style={{
            background: "none",
            border: "none",
            padding: "2px 4px",
            cursor: loading ? "default" : "pointer",
            color: "var(--ft-dim)",
            display: "flex",
            alignItems: "center",
            opacity: loading ? 0.4 : 1,
            transition: "opacity 0.15s, color 0.15s",
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.color = "var(--ft-accent)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--ft-dim)"; }}
        >
          <RefreshCw size={10} />
        </button>
      </div>

      {/* Content grid */}
      <div className="ft-dashboard-insights" style={{ padding: 8, gap: 6 }}>
        {loading && insights === null
          ? [0, 1, 2].map(i => (
              <div
                key={i}
                style={{
                  background: "var(--ft-raised)",
                  border: "1px solid var(--ft-border)",
                  borderLeft: "2px solid var(--ft-accent)",
                  padding: "8px 10px",
                  minHeight: 52,
                }}
              />
            ))
          : (insights ?? []).map((text, i) => (
              <div
                key={i}
                style={{
                  background: "var(--ft-raised)",
                  border: "1px solid var(--ft-border)",
                  borderLeft: "2px solid var(--ft-accent)",
                  padding: "8px 10px",
                  display: "flex",
                  gap: 6,
                  alignItems: "flex-start",
                }}
              >
                <Zap size={10} style={{ color: "var(--ft-accent)", flexShrink: 0, marginTop: 1, opacity: 0.8 }} />
                <Text as="span" mono size={10} color="var(--ft-muted)" lineHeight={1.6}>
                  {text}
                </Text>
              </div>
            ))
        }
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
        fontSize: 11,
        width: 30,
        height: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        transition: "color 0.1s, background 0.1s",
        lineHeight: 1,
        borderRadius: 0,
        userSelect: "none" as const,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color = danger ? "var(--ft-red)" : "var(--ft-accent)";
        e.currentTarget.style.background = "color-mix(in srgb, var(--ft-text) 7%, transparent)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = "var(--ft-dim)";
        e.currentTarget.style.background = "none";
      }}
    >
      <span style={{ pointerEvents: "none" }}>{icon}</span>
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
        background: "color-mix(in srgb, var(--ft-base) 88%, transparent)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--ft-surface)",
          border: "1px solid var(--ft-border2)",
          width: "min(95vw, 1400px)",
          height: "min(90vh, 900px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
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
          <Text as="span" mono size={8} color="var(--ft-dim)" letterSpacing="0.08em">⤢</Text>
          <Text as="span" mono upper size={10} weight={700} color="var(--ft-accent)" letterSpacing="0.12em">
            {def?.label ?? id}
          </Text>
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
        {/* Widget content — flex: 1 so widget can fill height */}
        <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1 }}>
            <Component isExpanded={true} />
          </div>
          {/* Nav strip — quick links to related pages */}
          {WIDGET_NAV[id] && (
            <div style={{
              display: "flex",
              gap: 0,
              borderTop: "1px solid var(--ft-border)",
              background: "var(--ft-raised)",
              flexShrink: 0,
            }}>
              {WIDGET_NAV[id]!.map(link => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={onClose}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--ft-dim)",
                    padding: "8px 14px",
                    borderRight: "1px solid var(--ft-border)",
                    textDecoration: "none",
                    letterSpacing: "0.04em",
                    transition: "color 0.1s, background 0.1s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = "var(--ft-accent)"; e.currentTarget.style.background = "var(--ft-surface)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "var(--ft-dim)"; e.currentTarget.style.background = "var(--ft-raised)"; }}
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── View-mode widget (read-only, no DnD, just expand on hover) ────────────────

function ViewModeWidget({ id, onExpand }: { id: WidgetId; onExpand: () => void }) {
  const [hovered, setHovered] = useState(false);
  const isMobile = useIsMobile();

  // On mobile use compact tiles — purpose-built for ~183px columns
  if (isMobile) {
    const CompactComponent = COMPACT_WIDGET_COMPONENTS[id];
    if (CompactComponent) return <CompactComponent />;
  }

  const Component = WIDGET_COMPONENTS[id];
  if (!Component) return null;

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Component />
      {hovered && (
        <button
          onClick={onExpand}
          title="Expand widget"
          style={{
            position: "absolute",
            top: 7,
            right: 8,
            zIndex: 5,
            background: "var(--ft-raised)",
            border: "1px solid var(--ft-border)",
            color: "var(--ft-dim)",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = "var(--ft-accent)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--ft-dim)"; }}
        >
          ⤢
        </button>
      )}
    </div>
  );
}

// ── View-mode widget with long-press drag (desktop only, no editing controls) ──

function LongPressDraggableWidget({ id, anyDragging, onExpand }: { id: WidgetId; anyDragging: boolean; onExpand: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id, animateLayoutChanges: () => false });
  const [hovered, setHovered] = useState(false);
  const [holding, setHolding] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const Component = WIDGET_COMPONENTS[id];
  if (!Component) return null;

  function onMouseDown() {
    holdTimerRef.current = setTimeout(() => setHolding(true), 150);
  }

  function clearHold() {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    setHolding(false);
  }

  const outerStyle: React.CSSProperties = {
    position: "relative",
    transform: CSS.Transform.toString(
      transform ? { ...transform, scaleX: 1, scaleY: 1 } : { x: 0, y: 0, scaleX: 1, scaleY: 1 }
    ),
    transition: isDragging ? "none" : "transform 0.12s ease",
    opacity: isDragging ? 0 : anyDragging ? 0.8 : 1,
    outline: holding && !isDragging ? "1px solid var(--ft-accent)" : "none",
    cursor: isDragging ? "grabbing" : holding ? "grab" : "default",
    userSelect: "none",
  };

  return (
    <div
      ref={setNodeRef}
      style={outerStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); clearHold(); }}
      onMouseDown={onMouseDown}
      onMouseUp={clearHold}
      {...attributes}
      {...listeners}
    >
      <Component />
      {hovered && !isDragging && !anyDragging && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={onExpand}
          title="Expand widget"
          style={{
            position: "absolute",
            top: 7,
            right: 8,
            zIndex: 5,
            background: "var(--ft-raised)",
            border: "1px solid var(--ft-border)",
            color: "var(--ft-dim)",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = "var(--ft-accent)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--ft-dim)"; }}
        >
          ⤢
        </button>
      )}
    </div>
  );
}

// ── Mobile compact tile with drag handle (used in customize mode on mobile) ───

function SortableCompactTile({ id, onRemove, isFullWidth, activeId }: { id: WidgetId; onRemove: () => void; isFullWidth?: boolean; activeId?: WidgetId | null }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id, animateLayoutChanges: () => false });
  const CompactComponent = COMPACT_WIDGET_COMPONENTS[id];
  const def = WIDGET_DEF_MAP[id];
  const anyDragging = activeId != null;

  // gridColumn is on the setNodeRef element so dnd-kit measures the actual grid cell
  const outerStyle: React.CSSProperties = {
    gridColumn: isFullWidth ? "1 / -1" : "auto",
    minWidth: 0,
    overflow: "hidden",
    position: "relative",
    transform: CSS.Transform.toString(
      transform ? { ...transform, scaleX: 1, scaleY: 1 } : { x: 0, y: 0, scaleX: 1, scaleY: 1 }
    ),
    transition: isDragging ? "none" : "transform 0.12s ease",
    opacity: isDragging ? 0 : anyDragging ? 0.8 : 1,
    willChange: isDragging ? "transform" : "auto",
    zIndex: isDragging ? 0 : "auto",
  };

  return (
    <div ref={setNodeRef} style={outerStyle}>
      {CompactComponent && <CompactComponent />}
      {/* Customize strip — the whole strip is the drag handle; remove button stops propagation */}
      <div
        {...attributes}
        {...listeners}
        style={{
          display: "flex",
          alignItems: "center",
          background: isDragging ? "var(--ft-surface)" : "var(--ft-raised)",
          borderTop: "1px solid var(--ft-border)",
          height: 36,
          cursor: "grab",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <span style={{
          flex: "0 0 auto",
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          color: "var(--ft-accent)",
          padding: "0 10px",
          display: "flex",
          alignItems: "center",
          opacity: 0.8,
        }}>
          ⠿
        </span>
        <span style={{
          flex: 1,
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          color: "var(--ft-muted)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          textAlign: "center",
          padding: "0 4px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}>
          {def?.label ?? id}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          onPointerDown={e => e.stopPropagation()}
          style={{
            flex: "0 0 auto",
            background: "transparent",
            border: "none",
            borderLeft: "1px solid var(--ft-border)",
            color: "var(--ft-red)",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            padding: "0 12px",
            height: "100%",
            display: "flex",
            alignItems: "center",
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Sortable widget wrapper ────────────────────────────────────────────────────

// Memoized shell so recharts never re-renders while the drag container moves
const StableWidgetContent = memo(function StableWidgetContent({
  Component,
  isExpanded,
}: {
  Component: React.ComponentType<{ isExpanded?: boolean }>;
  isExpanded: boolean;
}) {
  return <Component isExpanded={isExpanded} />;
});

// Prefer pointer-within so widgets are droppable as soon as the cursor enters them.
// Fall back to closestCenter for gaps between widgets (CSS columns).
const customCollisionDetection: CollisionDetection = (args) => {
  const pw = pointerWithin(args);
  if (pw.length > 0) return pw;
  return closestCenter(args);
};

interface SortableWidgetProps {
  id: WidgetId;
  span: "half" | "full";
  index: number;
  anyDragging: boolean;
  onToggleSpan: () => void;
  onRemove: () => void;
  onExpand: () => void;
}

function SortableWidget({ id, span, index, anyDragging, onToggleSpan, onRemove, onExpand }: SortableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, animateLayoutChanges: () => false });

  const [hovered, setHovered] = useState(false);
  // Once a drag has ever occurred, permanently disable the entrance animation so it
  // never re-runs and races against displacement transitions when anyDragging flips back.
  const entranceKilledRef = useRef(false);
  if (anyDragging) entranceKilledRef.current = true;

  const outerStyle = {
    transform: CSS.Transform.toString(
      transform
        ? { ...transform, scaleX: 1, scaleY: 1 }
        : { x: 0, y: 0, scaleX: 1, scaleY: 1 }
    ),
    transition: isDragging ? "none" : "transform 0.12s ease",
    opacity: isDragging ? 0 : 1,
    animationName: entranceKilledRef.current ? "none" : undefined,
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
      onMouseMove={() => { if (!hovered) setHovered(true); }}
    >
      {/* Relative wrapper: rail is absolutely positioned so it never inflates widget height */}
      <div style={{ position: "relative" }}>

        {/* Left rail — absolute so short widgets aren't forced to match button stack height */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: hovered ? 30 : 0,
            overflow: "hidden",
            background: "var(--ft-raised)",
            borderRight: hovered ? "1px solid var(--ft-border2)" : "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingTop: 6,
            gap: 1,
            transition: "width 0.1s ease",
            zIndex: 1,
            cursor: "pointer",
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
              fontSize: 11,
              width: 30,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "color 0.1s",
              userSelect: "none" as const,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--ft-accent)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--ft-dim)"; }}
          >
            <span style={{ pointerEvents: "none" }}>⠿</span>
          </button>

          <div style={{ width: 14, height: 1, background: "var(--ft-border2)", flexShrink: 0 }} />

          {/* × is second so it's always visible even on very short widgets */}
          <RailBtn icon="×" title="Remove widget" onClick={onRemove} danger />
          <RailBtn icon="⤢" title="Expand to fullscreen" onClick={onExpand} />
          <RailBtn
            icon={span === "full" ? "⊟" : "⊞"}
            title={span === "full" ? "Make half-width" : "Make full-width"}
            onClick={onToggleSpan}
          />
        </div>

        {/* Widget content — left padding slides in when rail appears */}
        <div style={{
          paddingLeft: hovered ? 30 : 0,
          transition: "padding-left 0.1s ease",
        }}>
          <StableWidgetContent Component={Component} isExpanded={span === "full"} />
        </div>
      </div>
    </div>
  );
}

// ── Widget Picker list row ─────────────────────────────────────────────────────

function WidgetPickerRow({ id, onAdd, onHover }: {
  id: WidgetId;
  onAdd: (id: WidgetId) => void;
  onHover: (id: WidgetId | null) => void;
}) {
  const [hovered, setHovered] = useState<boolean>(false);
  const def = WIDGET_DEF_MAP[id];
  return (
    <button
      onClick={() => onAdd(id)}
      onMouseEnter={() => { setHovered(true); onHover(id); }}
      onMouseLeave={() => { setHovered(false); onHover(null); }}
      style={{
        background: hovered ? "var(--ft-raised)" : "var(--ft-surface)",
        border: `1px solid ${hovered ? "var(--ft-accent)" : "var(--ft-border)"}`,
        padding: "9px 11px",
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        transition: "border-color 0.1s, background 0.1s",
        flexShrink: 0,
        width: "100%",
      }}
    >
      <Text as="div" mono upper size={10} weight={700} color={hovered ? "var(--ft-accent)" : "var(--ft-text)"} letterSpacing="0.06em">
        {def?.label ?? id}
      </Text>
      <Text as="div" mono size={9} color="var(--ft-dim)" lineHeight={1.5}>
        {def?.description ?? ""}
      </Text>
    </button>
  );
}

function WidgetPicker({ disabledIds, onAdd }: { disabledIds: WidgetId[]; onAdd: (id: WidgetId) => void }) {
  const [open, setOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<WidgetId | null>(null);
  const isMobile = useIsMobile();

  if (disabledIds.length === 0) return null;

  const previewId = hoveredId ?? disabledIds[0];
  const PreviewComponent = previewId ? WIDGET_COMPONENTS[previewId] : null;
  const previewDef = previewId ? WIDGET_DEF_MAP[previewId] : null;

  if (isMobile) {
    return (
      <div style={{ marginTop: 12 }}>
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
            padding: "8px 14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            justifyContent: "center",
            touchAction: "manipulation",
          }}
        >
          <Text as="span" size={14} lineHeight={1}>{open ? "−" : "+"}</Text>
          {open ? "Close" : `Add widgets (${disabledIds.length})`}
        </button>
        {open && (
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {disabledIds.map(id => {
              const def = WIDGET_DEF_MAP[id];
              const isFull = COMPACT_WIDGET_FULL_WIDTH.has(id);
              return (
                <button
                  key={id}
                  onClick={() => { onAdd(id); }}
                  style={{
                    background: "var(--ft-surface)",
                    border: "1px solid var(--ft-border)",
                    borderTop: `2px solid var(--ft-accent)`,
                    padding: "10px 10px 8px",
                    textAlign: "left",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    touchAction: "manipulation",
                    gridColumn: isFull ? "1 / -1" : "auto",
                    WebkitTapHighlightColor: "transparent",
                  }}
                  onTouchStart={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--ft-accent)"; }}
                  onTouchEnd={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--ft-border)"; }}
                >
                  <HStack align="center" justify="between">
                    <Text as="span" mono size={10} weight={700} color="var(--ft-text)" letterSpacing="0.04em">
                      {def?.label ?? id}
                    </Text>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-accent)", letterSpacing: "0.06em", border: "1px solid color-mix(in srgb, var(--ft-accent) 30%, transparent)", padding: "1px 4px" }}>
                      {isFull ? "FULL" : "HALF"}
                    </span>
                  </HStack>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                    {def?.description ?? ""}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-accent)", letterSpacing: "0.04em", marginTop: 2 }}>
                    ＋ Add
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

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
          transition: "border-color 0.1s, color 0.1s",
          width: "100%",
          justifyContent: "center",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ft-accent)"; e.currentTarget.style.color = "var(--ft-accent)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--ft-border2)"; e.currentTarget.style.color = open ? "var(--ft-accent)" : "var(--ft-dim)"; }}
      >
        <Text as="span" size={12} lineHeight={1}>{open ? "−" : "+"}</Text>
        {open ? "Hide widget picker" : `Add widget (${disabledIds.length} available)`}
      </button>

      {open && (
        <HStack gap={8} align="start" marginTop={8}>
          {/* Left — widget list */}
          <div style={{
            width: 220,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            maxHeight: 420,
            overflowY: "auto",
          }}>
            {disabledIds.map(id => (
              <WidgetPickerRow
                key={id}
                id={id}
                onAdd={(wid) => { onAdd(wid); setOpen(false); }}
                onHover={setHoveredId}
              />
            ))}
          </div>

          {/* Right — live preview */}
          <PanelBox><VStack grow minWidth0>
            <div style={{
              padding: "5px 10px",
              background: "var(--ft-raised)",
              borderBottom: "1px solid var(--ft-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <MonoLabel as="span" size={9} letterSpacing="0.06em">
                Preview — {previewDef?.label ?? "widget"}
              </MonoLabel>
              {previewId && (
                <button
                  onClick={() => { onAdd(previewId); setOpen(false); }}
                  style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", color: "var(--ft-accent)", background: "transparent", border: "1px solid var(--ft-accent)", padding: "2px 8px", cursor: "pointer" }}
                >
                  + Add
                </button>
              )}
            </div>
            <div style={{ overflow: "auto", maxHeight: 400, padding: 12 }}>
              {PreviewComponent ? <PreviewComponent /> : (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", padding: "20px 0", textAlign: "center" }}>
                  Hover a widget to preview it
                </div>
              )}
            </div>
          </VStack></PanelBox>
        </HStack>
      )}
    </div>
  );
}

// ── Persona quick start ────────────────────────────────────────────────────────

// ── Bloomberg KPI Bar ─────────────────────────────────────────────────────────

interface KpiCellData {
  label: string;
  value: string;
  delta?: string;
  deltaColor?: string;
  valueColor?: string;
}

// Persona-aware empty state for the desktop Dashboard. Same rules as
// MobileHome: a market-persona user is asked to add a holding, never
// to connect a bank. Every other persona lands on the connections
// panel. Rendered above the widget grid rather than replacing it, so
// a user with a legitimate zero-account state can still explore the
// widgets in-place.
function DashboardEmptyState() {
  const [, navigate] = useLocation();
  const persona: PersonaId = (loadPersonaIds()[0] as PersonaId) ?? "full";
  const isMarket = persona === "market";
  const title = isMarket ? "Add your first holding." : "No accounts yet.";
  const description = isMarket
    ? "Type a ticker and Numeris tracks it from the market. No bank connection needed — enter a few tickers once and the dashboard fills in whenever prices move."
    : "Connect a bank account or add one by hand. Once one is connected the dashboard fills in on its own.";
  const ctaLabel = isMarket ? "Add a holding →" : "Connect an account →";
  const ctaHref = isMarket ? "/investments" : "/settings?panel=connections";
  const label = isMarket ? "NO HOLDINGS" : "NO ACCOUNTS";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "18px 20px",
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        marginBottom: 8,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.18em",
          color: "var(--ft-accent)",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: "var(--ft-dim)", maxWidth: 640, lineHeight: 1.5 }}>
        {description}
      </div>
      <div>
        <button
          type="button"
          onClick={() => navigate(ctaHref)}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ft-accent)",
            background: "transparent",
            border: "1px solid var(--ft-accent)",
            padding: "8px 18px",
            cursor: "pointer",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}

function DashboardKpiBar({
  cells,
  onCustomize,
  isCustomizing,
  dashboardLabel,
  isMobile,
}: {
  cells: KpiCellData[];
  onCustomize: () => void;
  isCustomizing: boolean;
  dashboardLabel: string;
  isMobile: boolean;
}) {
  // Narrow-viewport layout picks by POSITION, not label. Each persona's
  // kpiCells array puts the primary figure at index 0 and two
  // secondary figures at [1] and [2]; the mobile hero renders those
  // three cells in that order. Prior code looked up cells by name
  // (NET WORTH / SAVINGS RATE / MONTHLY SPEND) which meant market and
  // social personas rendered an empty hero — those tuples do not
  // contain those labels. Position-based makes every persona render
  // whatever it declared its primary + secondary to be.
  //
  // Also drops the overflow:hidden + text-overflow:ellipsis on the
  // hero .pnum. That combination clips financial figures, which
  // CLAUDE.md and MOBILE-CONCEPT.md forbid: "A financial figure is
  // shown in full or not at all." A too-long hero should shrink via
  // clamp() or push the container width, not silently lose digits.
  const heroCell = cells[0];
  const secondary = cells.slice(1, 3);

  if (isMobile) {
    return (
      <div style={{
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        marginBottom: 6,
      }}>
        {/* Row 1: label + customize toggle */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--ft-border)",
          height: 32,
          paddingLeft: 12,
        }}>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ft-muted)",
          }}>
            <span style={{ color: "var(--ft-accent)", marginRight: 5 }}>·</span>{dashboardLabel}
          </span>
          <button
            onClick={onCustomize}
            style={{
              background: isCustomizing ? "color-mix(in srgb, var(--ft-accent) 12%, transparent)" : "transparent",
              border: "none",
              borderLeft: "1px solid var(--ft-border)",
              color: isCustomizing ? "var(--ft-accent)" : "var(--ft-dim)",
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "0 14px",
              height: "100%",
              cursor: "pointer",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {isCustomizing ? "EXIT" : "CUSTOMIZE"}
          </button>
        </div>
        {/* Row 2: hero + secondary stats */}
        <HStack align="stretch">
          {/* Hero — cells[0] */}
          <div style={{ flex: 1, padding: "12px 14px", borderRight: "1px solid var(--ft-border)", minHeight: 72, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 6 }}>
              {heroCell?.label ?? "—"}
            </div>
            <div className="pnum" style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(24px, 8vw, 34px)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: heroCell?.valueColor ?? "var(--ft-blue)",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}>
              {heroCell?.value ?? "—"}
            </div>
          </div>
          {/* Secondary stats — cells[1..2] */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-around", padding: "10px 12px 10px 14px", gap: 6, minHeight: 72, maxWidth: "48%", overflow: "hidden" }}>
            {secondary.map((c) => (
              <VStack key={c.label} gap={2} minWidth0>
                <MonoLabel as="span" size={7} letterSpacing="0.12em">{c.label}</MonoLabel>
                <span
                  className="pnum"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 16,
                    fontWeight: 700,
                    color: c.valueColor ?? "var(--ft-text)",
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.value}
                </span>
              </VStack>
            ))}
          </div>
        </HStack>
      </div>
    );
  }

  // Map label to accent color for borderTop per cell
  const KPI_ACCENT: Record<string, string> = {
    "NET WORTH":      "var(--ft-blue)",
    "MONTHLY INCOME": "var(--ft-green)",
    "MONTHLY SPEND":  "var(--ft-red)",
    "SAVINGS RATE":   "var(--ft-cyan)",
    "MoM SPEND":      "var(--ft-amber)",
    "PORTFOLIO":      "var(--ft-accent)",
  };

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `auto auto repeat(${cells.length}, 1fr)`,
      gap: 1,
      background: "var(--ft-border)",
      border: "1px solid var(--ft-border)",
      marginBottom: 6,
      overflowX: "auto",
      scrollbarWidth: "none",
    }}>
      {/* Customize button — first cell */}
      <button
        onClick={onCustomize}
        style={{
          background: isCustomizing ? "color-mix(in srgb, var(--ft-accent) 10%, transparent)" : "var(--ft-surface)",
          border: "none",
          borderTop: isCustomizing ? "2px solid var(--ft-accent)" : "2px solid transparent",
          color: isCustomizing ? "var(--ft-accent)" : "var(--ft-dim)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          padding: "0 14px",
          cursor: "pointer",
          flexShrink: 0,
          transition: "color 0.1s, background 0.1s",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={e => { if (!isCustomizing) e.currentTarget.style.color = "var(--ft-accent)"; }}
        onMouseLeave={e => { if (!isCustomizing) e.currentTarget.style.color = "var(--ft-dim)"; }}
        title={isCustomizing ? "Exit customize mode" : "Enter customize mode to drag & rearrange widgets"}
      >
        {isCustomizing ? "[EXIT CUSTOMIZE]" : "[CUSTOMIZE]"}
      </button>

      {/* Page identifier cell */}
      <div style={{
        display: "flex",
        alignItems: "center",
        padding: "0 14px",
        background: "var(--ft-surface)",
        borderTop: "2px solid transparent",
        flexShrink: 0,
        minWidth: 110,
        gap: 5,
      }}>
        <Text as="span" mono size={12} color="var(--ft-accent)" lineHeight={1}>·</Text>
        <Text as="span" mono upper size={9} weight={700} color="var(--ft-muted)" letterSpacing="0.12em" nowrap>
          {dashboardLabel}
        </Text>
      </div>

      {/* KPI cells */}
      {cells.map((cell) => (
        <div
          key={cell.label}
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "var(--ft-metric-py) 14px",
            background: "var(--ft-surface)",
            borderTop: `2px solid ${KPI_ACCENT[cell.label] ?? cell.valueColor ?? "var(--ft-accent)"}`,
            flexShrink: 0,
            minWidth: 90,
            minHeight: 52,
          }}
        >
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: "var(--ft-dim)",
            marginBottom: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {cell.label}
          </span>
          <span className="pnum" style={{
            fontFamily: "var(--font-mono)",
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            color: cell.valueColor ?? "var(--ft-text)",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {cell.value}
          </span>
          {cell.delta && (
            <span className="pnum" style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 600,
              color: cell.deltaColor ?? "var(--ft-dim)",
              marginTop: 2,
              fontVariantNumeric: "tabular-nums",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {cell.delta}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Terminal Section Header ───────────────────────────────────────────────────

function SectionHeader({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--ft-raised)",
      borderBottom: "1px solid var(--ft-border)",
      padding: "0 12px",
      height: "var(--ft-panel-header-h)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}>
      <span className="ft-panel-label">
        <span className="accent-dot">·</span>{label}
      </span>
      {right}
    </div>
  );
}

// ── Terminal Three-Zone Default Layout ────────────────────────────────────────

interface TerminalLayoutProps {
  aiInsightsProps: AiInsightsPanelProps;
}

function TerminalLayout({ aiInsightsProps }: TerminalLayoutProps) {
  return (
    <VStack gap={6}>
      {/* AI Insights — only shown if AI available */}
      <AiInsightsPanel {...aiInsightsProps} />

      {/* Row 1: Accounts (60%) + Transactions (40%) */}
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }} className="ft-dashboard-two-col">
        {/* Accounts panel — 60%: AccountsSummaryWidget has its own WidgetShell header */}
        <div style={{ flex: "3 1 0", minWidth: 0 }}>
          <AccountsSummaryWidget />
        </div>

        {/* Recent Transactions — 40%: custom compact inline table */}
        <div style={{ flex: "2 1 0", minWidth: 0, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", overflow: "hidden" }}>
          <SectionHeader
            label="RECENT TRANSACTIONS"
            right={
              <a href="/transactions" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-accent)", textDecoration: "none", letterSpacing: "0.04em" }}>
                → ALL
              </a>
            }
          />
          <RecentTransactionsWidgetInline />
        </div>
      </div>

      {/* Row 2: Cash Flow + Spending Breakdown + Smart Alerts (equal thirds) */}
      {/* CashFlowWidget and SpendingBreakdownWidget use WidgetShell (own headers) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }} className="ft-three-col">
        <div>
          <CashFlowWidget />
        </div>

        <div>
          <SpendingBreakdownWidget />
        </div>

        {/* Smart Alerts panel — SmartAlertsWidget renders flat rows, wrap in panel */}
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", overflow: "hidden" }}>
          <SectionHeader label="ALERTS" />
          <div style={{ padding: "6px 0", minHeight: 42 }}>
            <SmartAlertsWidget />
          </div>
        </div>
      </div>

      {/* AI Insights strip — rule-based insights below grid */}
      <AiInsightsStrip />
    </VStack>
  );
}

// ── Compact recent transactions for terminal layout (no filter bar, dense rows) ─

function RecentTransactionsWidgetInline() {
  const { data, isLoading } = useListTransactions({});
  const txs = (data ?? []).slice(0, 12);

  const TYPE_COLOR: Record<string, string> = {
    income: "var(--ft-green)",
    expense: "var(--ft-red)",
    transfer: "var(--ft-amber)",
  };
  const TYPE_PREFIX: Record<string, string> = {
    income: "+",
    expense: "−",
    transfer: "↔",
  };

  if (isLoading) {
    return (
      <VStack gap={6} padding="10px 12px">
        {[80, 60, 90, 70, 50].map(w => (
          <div key={w} style={{ height: 8, background: "var(--ft-border)", width: `${w}%` }} />
        ))}
      </VStack>
    );
  }

  if (txs.length === 0) {
    return (
      <div style={{ padding: "16px 12px" }}>
        <Text as="span" mono size={10} color="var(--ft-dim)">
          No transactions yet
        </Text>
      </div>
    );
  }

  return (
    <div>
      {/* Column headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "56px 1fr 60px",
        padding: "4px 10px",
        background: "var(--ft-raised)",
        borderBottom: "1px solid var(--ft-border)",
      }}>
        {["DATE", "DESCRIPTION", "AMOUNT"].map(h => (
          <span key={h} style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--ft-muted)",
            textAlign: h === "AMOUNT" ? "right" : "left",
          }}>
            {h}
          </span>
        ))}
      </div>

      {/* Transaction rows */}
      {txs.map(tx => (
        <div
          key={tx.id}
          style={{
            display: "grid",
            gridTemplateColumns: "56px 1fr 60px",
            padding: "var(--ft-cell-py) 10px",
            borderBottom: "1px solid var(--ft-border)",
            transition: "background 0.1s",
          }}
          className="ft-tx-row"
        >
          <Text as="span" mono size={9} color="var(--ft-dim)">
            {tx.date.slice(5).replace("-", "/")}
          </Text>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {tx.description}
          </span>
          <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: tx.gbpValue == null ? "var(--ft-dim)" : TYPE_COLOR[tx.type] ?? "var(--ft-muted)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {/* Native amount alone when FX unavailable; the row still
                shows its type + description on the left. */}
            {tx.gbpValue == null
              ? formatNative(Math.abs(tx.nativeAmount), tx.currency)
              : `${TYPE_PREFIX[tx.type]}${formatGbp(tx.gbpValue)}`}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Dashboard Overview (default view) ────────────────────────────────────────

const OV_MONO: React.CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };
const OV_LABEL: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.13em", textTransform: "uppercase" as const };
const OV_SURFACE: React.CSSProperties = { background: "var(--ft-surface)", border: "1px solid var(--ft-border)" };
const OV_CLIP: React.CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, minWidth: 0 };

const DEMO_ACCOUNTS = [
  { id: "d1", name: "Barclays Current",    currency: "GBP", gbpEquivalent: 3842.15 },
  { id: "d2", name: "Marcus Savings",      currency: "GBP", gbpEquivalent: 8120.00 },
  { id: "d3", name: "Wise USD Jar",        currency: "USD", gbpEquivalent: 1298.40 },
  { id: "d4", name: "Monzo Flex",          currency: "GBP", gbpEquivalent: -320.00 },
  { id: "d5", name: "Chase Saver",         currency: "GBP", gbpEquivalent: 2400.00 },
];

const DEMO_TX_ROWS = [
  { id: "t1", description: "Monthly Salary",    gbpValue: 3700,   type: "income",   date: "", category: "Income" },
  { id: "t2", description: "Rent",              gbpValue: 1100,   type: "expense",  date: "", category: "Housing" },
  { id: "t3", description: "Sainsbury's",       gbpValue: 67.4,   type: "expense",  date: "", category: "Groceries" },
  { id: "t4", description: "TfL Contactless",   gbpValue: 4.8,    type: "expense",  date: "", category: "Transport" },
  { id: "t5", description: "Pret A Manger",     gbpValue: 5.95,   type: "expense",  date: "", category: "Eating Out" },
  { id: "t6", description: "Spotify Premium",   gbpValue: 11.99,  type: "expense",  date: "", category: "Subscriptions" },
];

const DEMO_BILLS = [
  { id: "b1", description: "Council Tax",  gbpEquivalent: 142, dueDate: "2026-08-02", type: "expense" },
  { id: "b2", description: "Sky Broadband",gbpEquivalent: 39.99, dueDate: "2026-08-05", type: "expense" },
  { id: "b3", description: "Amazon Prime", gbpEquivalent: 8.99, dueDate: "2026-08-10", type: "expense" },
  { id: "b4", description: "Gym Membership",gbpEquivalent: 29.99, dueDate: "2026-08-15", type: "expense" },
];

function DashboardOverview() {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const { data: dash } = useGetDashboard();
  const { data: accounts = [] } = useListAccounts({});
  const now = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, [now]);
  const { data: recentTxs = [] } = useListTransactions({ dateFrom: monthStart } as Parameters<typeof useListTransactions>[0]);
  const { data: upcoming = [] } = useListUpcoming();

  const isDemo = accounts.length === 0 && recentTxs.length === 0;

  const netWorth = isDemo ? 15340.55 : (dash?.netWorth ?? null);
  const income = isDemo ? 3700 : (dash?.thisMonth?.income ?? 0);
  const expenses = isDemo ? 1514.14 : (dash?.thisMonth?.expenses ?? 0);
  const savingsRate = isDemo ? 59 : (dash?.thisMonth?.savingsRate ?? 0);
  const net = income - expenses;
  const netColor = net > 0 ? "var(--ft-green)" : net < 0 ? "var(--ft-red)" : "var(--ft-muted)";

  const sortedAccounts = useMemo(() =>
    isDemo
      ? DEMO_ACCOUNTS
      // Unconvertible accounts sort to the bottom (-Infinity) of the
      // desc sort — the top-6 slice still surfaces the largest real
      // holdings, without shuffling.
      : [...accounts].sort((a, b) => (b.gbpEquivalent ?? -Infinity) - (a.gbpEquivalent ?? -Infinity)).slice(0, 6),
    [accounts, isDemo]
  );
  const txRows = useMemo(() => (isDemo ? DEMO_TX_ROWS : recentTxs.slice(0, 6)) as Array<{ id: string | number; description: string; gbpValue: number | null; type: string; date: string; category?: string }>, [recentTxs, isDemo]);
  const upcomingBills = useMemo(() =>
    isDemo
      ? DEMO_BILLS
      : (upcoming as Array<{ id: string | number; description: string; gbpEquivalent: number; dueDate: string; type: string }>)
          .filter(u => u.type === "expense")
          .slice(0, 4),
    [upcoming, isDemo]
  );

  const C = (color: string) => ({ color });

  return (
    <VStack gap={8} marginTop={8}>

      {/* Demo mode banner */}
      {isDemo && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 12px", background: "var(--ft-raised)", border: "1px solid var(--ft-border)", borderLeft: "3px solid var(--ft-amber)" }}>
          <Text as="span" mono size={9} weight={700} color="var(--ft-amber)" letterSpacing="0.1em">DEMO</Text>
          <Text as="span" mono size={9} color="var(--ft-dim)">Sample data — add accounts and transactions to see your real dashboard</Text>
          <a href="/import" style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-accent)", fontWeight: 700, textDecoration: "none", letterSpacing: "0.06em", flexShrink: 0 }}>IMPORT →</a>
        </div>
      )}

      {/* ── Hero: Net Worth ── */}
      <Link href="/net-worth">
        <div
          style={{ ...OV_SURFACE, padding: "14px 16px", borderLeft: "3px solid var(--ft-accent)", cursor: "pointer" }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--ft-raised)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--ft-surface)"; }}
          onTouchStart={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--ft-raised)"; }}
          onTouchEnd={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--ft-surface)"; }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ ...OV_LABEL, marginBottom: 3 }}>NET WORTH</div>
              <div className="pnum" style={{ ...OV_MONO, fontSize: isMobile ? 34 : 36, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "-0.03em", lineHeight: 1 }}>
                {netWorth === null ? "—" : formatGbp(netWorth)}
              </div>
            </div>
            {income > 0 && (
              <HStack gap={14} align="start">
                <div>
                  <div style={{ ...OV_LABEL, marginBottom: 3 }}>THIS MONTH</div>
                  <div className="pnum" style={{ ...OV_MONO, fontSize: 13, fontWeight: 700, ...C(netColor) }}>
                    {net >= 0 ? "+" : ""}{formatGbp(net)}
                  </div>
                </div>
                {savingsRate > 0 && (
                  <div>
                    <div style={{ ...OV_LABEL, marginBottom: 3 }}>SAVED</div>
                    <div className="pnum" style={{ ...OV_MONO, fontSize: 13, fontWeight: 700, color: "var(--ft-green)" }}>
                      {savingsRate.toFixed(0)}%
                    </div>
                  </div>
                )}
              </HStack>
            )}
          </div>
          {income > 0 && (
            <div style={{ display: "flex", gap: 16, marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--ft-border)" }}>
              <span className="pnum" style={{ ...OV_MONO, fontSize: 10, ...C("var(--ft-green)") }}>▲ {formatGbp(income)} in</span>
              <span className="pnum" style={{ ...OV_MONO, fontSize: 10, ...C("var(--ft-red)") }}>▼ {formatGbp(expenses)} out</span>
            </div>
          )}
        </div>
      </Link>

      {/* ── Middle: Accounts + Recent Transactions ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>

        {/* Accounts */}
        <div style={{ ...OV_SURFACE, overflow: "hidden", borderLeft: "3px solid var(--ft-cyan)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--ft-border)", paddingLeft: isMobile ? 12 : 14, paddingRight: 4, height: 34 }}>
            <span style={{ ...OV_LABEL }}>ACCOUNTS</span>
            <Link href="/accounts" style={{ textDecoration: "none" }}>
              <span style={{ ...OV_MONO, fontSize: 9, ...C("var(--ft-cyan)"), fontWeight: 700, letterSpacing: "0.05em", padding: "0 12px", height: 34, display: "flex", alignItems: "center" }}>
                {accounts.length} LINKED →
              </span>
            </Link>
          </div>
          {sortedAccounts.length === 0 ? (
            <div style={{ ...OV_MONO, fontSize: 10, ...C("var(--ft-muted)"), padding: "12px 14px" }}>No accounts linked</div>
          ) : sortedAccounts.map((acc, i) => (
            <div key={acc.id ?? i} style={{ display: "flex", alignItems: "center", gap: 10, padding: isMobile ? "10px 12px" : "7px 14px", borderBottom: i < sortedAccounts.length - 1 ? "1px solid var(--ft-border)" : "none" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...OV_MONO, ...OV_CLIP, fontSize: isMobile ? 13 : 11, fontWeight: isMobile ? 500 : 400, ...C("var(--ft-text)") }}>{acc.name}</div>
                <div style={{ ...OV_MONO, fontSize: 9, ...C("var(--ft-dim)"), letterSpacing: "0.06em", textTransform: "uppercase" as const, marginTop: isMobile ? 2 : 0 }}>{(acc as any).currency ?? ""}</div>
              </div>
              <span className="pnum" style={{ ...OV_MONO, fontSize: isMobile ? 16 : 11, fontWeight: 700, letterSpacing: "-0.02em", ...C(acc.gbpEquivalent == null ? "var(--ft-dim)" : acc.gbpEquivalent >= 0 ? "var(--ft-text)" : "var(--ft-red)"), flexShrink: 0 }}>
                {/* "—" for unconvertible accounts; the currency label
                    above still names the account's own currency. */}
                {acc.gbpEquivalent == null ? "—" : formatGbp(acc.gbpEquivalent)}
              </span>
            </div>
          ))}
          {accounts.length > 6 && (
            <div style={{ ...OV_MONO, fontSize: 8, ...C("var(--ft-dim)"), textAlign: "right", padding: "5px 12px", borderTop: "1px solid var(--ft-border)" }}>
              +{accounts.length - 6} more →
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div style={{ ...OV_SURFACE, overflow: "hidden", borderLeft: "3px solid var(--ft-blue)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--ft-border)", paddingLeft: isMobile ? 12 : 14, paddingRight: 4, height: 34 }}>
            <span style={{ ...OV_LABEL }}>RECENT TRANSACTIONS</span>
            <Link href="/transactions" style={{ textDecoration: "none" }}>
              <span style={{ ...OV_MONO, fontSize: 9, ...C("var(--ft-blue)"), fontWeight: 700, letterSpacing: "0.05em", padding: "0 12px", height: 34, display: "flex", alignItems: "center" }}>VIEW ALL →</span>
            </Link>
          </div>
          {txRows.length === 0 ? (
            <div style={{ ...OV_MONO, fontSize: 10, ...C("var(--ft-muted)"), padding: "12px 14px" }}>No transactions this month</div>
          ) : txRows.map((tx, i) => {
            const txTypeColor = tx.type === "income" ? "var(--ft-green)" : tx.type === "expense" ? "var(--ft-red)" : "var(--ft-amber)";
            const today2 = new Date(); const yesterday2 = new Date(today2); yesterday2.setDate(today2.getDate() - 1);
            const txDate2 = tx.date ? new Date(tx.date + "T00:00:00") : null;
            const dateLabel = txDate2
              ? txDate2.toDateString() === today2.toDateString() ? "Today"
              : txDate2.toDateString() === yesterday2.toDateString() ? "Yesterday"
              : txDate2.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
              : tx.date?.slice(5).replace("-", "/") ?? "";
            if (isMobile) return (
              <div key={tx.id ?? i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: i < txRows.length - 1 ? "1px solid var(--ft-border)" : "none" }}>
                <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: "50%", background: `color-mix(in srgb, ${txTypeColor} 15%, var(--ft-raised))`, border: `1.5px solid ${txTypeColor}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ ...OV_MONO, fontSize: 13, fontWeight: 700, color: txTypeColor }}>{(tx.category ?? tx.type ?? "?")[0].toUpperCase()}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...OV_MONO, ...OV_CLIP, fontSize: 13, fontWeight: 500, ...C("var(--ft-text)"), marginBottom: 2 }}>{tx.description}</div>
                  <div style={{ ...OV_MONO, fontSize: 10, ...C("var(--ft-dim)") }}>{dateLabel}{tx.category ? ` · ${tx.category}` : ""}</div>
                </div>
                <span className="pnum" style={{ ...OV_MONO, fontSize: 14, fontWeight: 700, letterSpacing: "-0.02em", ...C(tx.gbpValue == null ? "var(--ft-dim)" : txTypeColor), flexShrink: 0 }}>
                  {tx.gbpValue == null
                    ? "—"
                    : `${tx.type === "income" ? "+" : tx.type === "expense" ? "−" : ""}${formatGbp(Math.abs(tx.gbpValue))}`}
                </span>
              </div>
            );
            return (
              <div key={tx.id ?? i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 14px", borderBottom: i < txRows.length - 1 ? "1px solid var(--ft-border)" : "none" }}>
                <VStack minWidth0>
                  <span style={{ ...OV_MONO, ...OV_CLIP, fontSize: 10, ...C("var(--ft-text)") }}>{tx.description}</span>
                  <span style={{ ...OV_MONO, fontSize: 9, ...C("var(--ft-dim)") }}>{dateLabel}{tx.category ? ` · ${tx.category}` : ""}</span>
                </VStack>
                <span className="pnum" style={{ ...OV_MONO, fontSize: 11, fontWeight: 700, ...C(tx.gbpValue == null ? "var(--ft-dim)" : txTypeColor), flexShrink: 0, paddingLeft: 8 }}>
                  {tx.gbpValue == null
                    ? "—"
                    : `${tx.type === "income" ? "+" : tx.type === "expense" ? "−" : ""}${formatGbp(Math.abs(tx.gbpValue))}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Upcoming Bills ── */}
      {upcomingBills.length > 0 && (
        <Link href="/upcoming">
          <div
            style={{ ...OV_SURFACE, padding: "12px 14px", cursor: "pointer" }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--ft-raised)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--ft-surface)"; }}
            onTouchStart={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--ft-raised)"; }}
            onTouchEnd={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--ft-surface)"; }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
              <span style={{ ...OV_LABEL, borderBottom: "1px solid var(--ft-border)", paddingBottom: 2 }}>UPCOMING BILLS</span>
              <span style={{ ...OV_MONO, fontSize: 9, ...C("var(--ft-amber)"), fontWeight: 700 }}>VIEW ALL →</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(upcomingBills.length, isMobile ? 2 : 4)}, 1fr)`, gap: 8 }}>
              {upcomingBills.map((bill, i) => (
                <div key={bill.id ?? i} style={{ padding: "9px 10px", background: "var(--ft-raised)", border: "1px solid var(--ft-border)", borderTop: "2px solid var(--ft-amber)" }}>
                  <div style={{ ...OV_MONO, ...OV_CLIP, fontSize: 8, ...C("var(--ft-dim)"), marginBottom: 4 }}>{bill.description}</div>
                  <div className="pnum" style={{ ...OV_MONO, fontSize: 14, fontWeight: 700, ...C("var(--ft-text)"), marginBottom: 3 }}>
                    {formatGbp(bill.gbpEquivalent)}
                  </div>
                  {bill.dueDate && (
                    <div style={{ ...OV_MONO, fontSize: 8, ...C("var(--ft-amber)") }}>
                      {bill.dueDate.slice(5).replace("-", "/")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Link>
      )}

    </VStack>
  );
}

// ── Saved View Row ────────────────────────────────────────────────────────────

function ViewRow({ view, onLoad, onDelete }: {
  view: DashboardView;
  onLoad: (v: DashboardView) => void;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState<boolean>(false);
  return (
    <div
      key={view.id}
      style={{ display: "flex", alignItems: "center", gap: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={() => onLoad(view)}
        style={{
          fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.05em",
          color: hovered ? "var(--ft-text)" : "var(--ft-accent)",
          background: hovered ? "var(--ft-raised)" : "transparent",
          border: `1px solid ${hovered ? "var(--ft-accent)" : "var(--ft-border)"}`,
          padding: "3px 9px",
          cursor: "pointer", borderRight: "none",
          transition: "color 0.1s, background 0.1s, border-color 0.1s",
        }}
      >
        {view.name}
      </button>
      <button
        onClick={() => onDelete(view.id)}
        style={{
          fontFamily: "var(--font-mono)", fontSize: 9,
          color: "var(--ft-red)", background: hovered ? "var(--ft-raised)" : "transparent",
          border: `1px solid ${hovered ? "var(--ft-accent)" : "var(--ft-border)"}`,
          padding: "3px 6px",
          cursor: "pointer",
          transition: "background 0.1s, border-color 0.1s",
        }}
      >
        ✕
      </button>
    </div>
  );
}

// ── Dashboard page ─────────────────────────────────────────────────────────────

const PERSONA_DASHBOARD_LABEL: Record<string, string> = {
  market: "MARKET TERMINAL",
  budget: "COMMAND CENTER",
  wealth: "WEALTH OVERVIEW",
  social: "FINANCE HUB",
  full: "PORTFOLIO OVERVIEW",
};

const CUSTOMIZE_MODE_KEY = "ft-dashboard-customize-mode";

export default function Dashboard() {
  const { order, enabled, spans, isEnabled, setOrder, toggle, toggleSpan, getSpan, restoreView } = useWidgets();
  const { data: dashData } = useGetDashboard();
  const monthStart = useMemo(() => getMonthStart(), []);
  const prevBounds = useMemo(() => getPrevMonthBounds(), []);
  const { data: monthTxs } = useListTransactions({ type: "expense", dateFrom: monthStart });
  const { data: prevMonthTxs } = useListTransactions({ type: "expense", dateFrom: prevBounds.from, dateTo: prevBounds.to });
  const [activeId, setActiveId] = useState<WidgetId | null>(null);
  const [expandedWidgetId, setExpandedWidgetId] = useState<WidgetId | null>(null);
  const [views, setViews] = useState<DashboardView[]>(() => loadViews());
  const [viewNameInput, setViewNameInput] = useState("");
  const [showViewSave, setShowViewSave] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () =>
      localStorage.getItem("nr-onboarding-complete") === "1" ||
      localStorage.getItem("ft-onboarding-dismissed") === "1"
  );
  // Bump-on-persona-change: useActivePersona re-renders this
  // component whenever the persona flips (see persona-hook.ts). The
  // downstream useMemo below reads loadPersonaIds() and needs a fresh
  // eval, so we key it off this value.
  const activePersonaId = useActivePersona();
  const [isCustomizing, setIsCustomizing] = useState(
    () => localStorage.getItem(CUSTOMIZE_MODE_KEY) === "1"
  );
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const dashboardLabel = useMemo(() => {
    const ids = loadPersonaIds();
    if (ids.length === 0) return "PORTFOLIO OVERVIEW";
    if (ids.length > 1) return ids.map(id => PERSONAS.find(p => p.id === id)?.code ?? id).join("+");
    return PERSONA_DASHBOARD_LABEL[ids[0]] ?? "PORTFOLIO OVERVIEW";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePersonaId]);

  // Show the wizard whenever the user hasn't completed/dismissed it, regardless of account count.
  // This ensures returning users who reset onboarding also see it.
  const showOnboarding = !onboardingDismissed;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const mobileSensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 8 } }),
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } })
  );

  // Long-press sensors for view-mode drag (hold 250ms anywhere on widget)
  const longPressDesktopSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const enabledIds = order.filter(id => isEnabled(id as WidgetId)) as WidgetId[];
  const disabledIds = order.filter(id => !isEnabled(id as WidgetId)) as WidgetId[];

  // Two-column layout: track which items are in the right column.
  // Left column = all enabled items NOT in rightSet (in enabledIds order).
  // Right column = enabled items IN rightSet (in enabledIds order).
  // Lazy-initialized from enabledIds so first render already shows two columns (no flash).
  const [rightSet, setRightSet] = useState<Set<WidgetId>>(
    () => new Set(enabledIds.filter((_, i) => i % 2 === 1))
  );
  // Prevent duplicate onDragOver commits for the same active→over pair
  const lastOverRef = useRef<string | null>(null);
  // Snapshots at drag-start so cancel can fully restore
  const preDragOrderRef = useRef<WidgetId[]>([]);
  const preDragRightSetRef = useRef<Set<WidgetId>>(new Set());

  const leftIds = useMemo(() => enabledIds.filter(id => !rightSet.has(id)), [enabledIds, rightSet]);
  const rightIds = useMemo(() => enabledIds.filter(id => rightSet.has(id)), [enabledIds, rightSet]);

  const isCurrentLayoutSaved = views.some(v =>
    layoutFingerprint(v.enabled, v.order, v.spans as Record<string, string>) ===
    layoutFingerprint([...enabled], order, spans as Record<string, string>)
  );

  function handleCustomizeToggle() {
    const next = !isCustomizing;
    setIsCustomizing(next);
    try { localStorage.setItem(CUSTOMIZE_MODE_KEY, next ? "1" : "0"); } catch {}
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as WidgetId);
    lastOverRef.current = null;
    preDragOrderRef.current = [...order];
    preDragRightSetRef.current = new Set(rightSet);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const aId = active.id as WidgetId;
    const oId = over.id as WidgetId;
    const aIsRight = rightSet.has(aId);
    const oIsRight = rightSet.has(oId);
    // Only handle cross-column moves here; same-column reorder is handled on drop
    if (aIsRight === oIsRight) return;
    const key = `${aId}→${oId}`;
    if (lastOverRef.current === key) return;
    lastOverRef.current = key;
    // Insert aId immediately AFTER oId in enabledIds so that oId keeps its DOM
    // position (index unchanged) and aId enters below it. Without this, aId's
    // lower enabledIds index causes it to appear before oId, teleporting oId down.
    const withoutA = enabledIds.filter(id => id !== aId);
    const oPos = withoutA.indexOf(oId);
    const reordered = [...withoutA];
    reordered.splice(oPos + 1, 0, aId);
    setOrder([...reordered, ...disabledIds]);
    setRightSet(prev => {
      const next = new Set(prev);
      if (oIsRight) next.add(aId);
      else next.delete(aId);
      return next;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    lastOverRef.current = null;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const aId = active.id as WidgetId;
    const oId = over.id as WidgetId;
    const aIsRight = rightSet.has(aId);
    const oIsRight = rightSet.has(oId);
    // Cross-column was already committed in onDragOver; nothing to do here
    if (aIsRight !== oIsRight) return;
    // Within-column reorder
    const colIds = aIsRight ? rightIds : leftIds;
    const oldIdx = colIds.indexOf(aId);
    const newIdx = colIds.indexOf(oId);
    if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;
    const newColIds = arrayMove(colIds, oldIdx, newIdx);
    // Reconstruct flat enabled order: left column first, then right column
    const newEnabled = aIsRight ? [...leftIds, ...newColIds] : [...newColIds, ...rightIds];
    setOrder([...newEnabled, ...disabledIds]);
  }

  function handleDragOverMobile(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const aId = active.id as WidgetId;
    const oId = over.id as WidgetId;
    const key = `${aId}→${oId}`;
    if (lastOverRef.current === key) return;
    lastOverRef.current = key;
    const oldIdx = enabledIds.indexOf(aId);
    const newIdx = enabledIds.indexOf(oId);
    if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;
    const newEnabled = arrayMove(enabledIds, oldIdx, newIdx);
    setOrder([...newEnabled, ...disabledIds]);
  }

  function handleDragEndMobile(event: DragEndEvent) {
    setActiveId(null);
    lastOverRef.current = null;
    // Order is fully managed by handleDragOverMobile (live reorder).
    // Only apply here if over fired a final position that wasn't caught by over.
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const aId = active.id as WidgetId;
    const oId = over.id as WidgetId;
    const oldIdx = enabledIds.indexOf(aId);
    const newIdx = enabledIds.indexOf(oId);
    if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;
    const newEnabled = arrayMove(enabledIds, oldIdx, newIdx);
    setOrder([...newEnabled, ...disabledIds]);
  }

  function handleSaveView() {
    if (!viewNameInput.trim()) return;
    const newView: DashboardView = {
      id: Date.now().toString(),
      name: viewNameInput.trim(),
      enabled: [...enabled],
      order: [...order],
      spans: { ...spans } as Record<string, string>,
      createdAt: new Date().toISOString(),
    };
    const updated = [...views, newView];
    setViews(updated);
    saveViews(updated);
    setViewNameInput("");
    setShowViewSave(false);
  }

  function handleLoadView(view: DashboardView) {
    restoreView(view.enabled as WidgetId[], view.order as WidgetId[], view.spans as Partial<Record<WidgetId, WidgetSpan>>);
  }

  function handleDeleteView(id: string) {
    const updated = views.filter(v => v.id !== id);
    setViews(updated);
    saveViews(updated);
  }

  // ── KPI Bar calculations ─────────────────────────────────────────────────────
  const kpiCells = useMemo((): KpiCellData[] => {
    if (!dashData) return [];

    const netWorth = dashData.netWorth ?? 0;
    const income = dashData.thisMonth?.income ?? 0;
    const expenses = dashData.thisMonth?.expenses ?? 0;
    const savingsRate = dashData.thisMonth?.savingsRate ?? 0;
    const netSavings = dashData.thisMonth?.netSavings ?? 0;
    const portfolioVal = dashData.portfolio?.totalValueGbp ?? 0;
    const portfolioPl  = dashData.portfolio?.totalPlGbp ?? 0;
    const portfolioPct = dashData.portfolio?.totalPlPercent ?? 0;
    const cash = dashData.totalCash ?? 0;
    const owedToMe = dashData.owing?.totalOwedToMe ?? 0;
    const iOwe = dashData.owing?.totalIOwe ?? 0;

    // MoM delta: compare current month expenses to previous. Skip
    // unconvertible rows from the prev-month sum; if enough rows drop
    // out the delta is understated, which the KPI accepts silently.
    const prevExpenses = (prevMonthTxs ?? []).reduce((s, t) => s + (t.gbpValue ?? 0), 0);
    const momDelta = prevExpenses > 0 ? ((expenses - prevExpenses) / prevExpenses) * 100 : 0;
    const momSign = momDelta >= 0 ? "+" : "";
    const momColor = momDelta > 5 ? "var(--ft-red)" : momDelta < -5 ? "var(--ft-green)" : "var(--ft-amber)";

    // Individual cells. Keeping each as a const so the persona table
    // below reads like a table, not a tangle of inline object literals.

    const NET_WORTH: KpiCellData = {
      label: "NET WORTH",
      value: formatGbp(netWorth),
      delta: netWorth > 0 ? undefined : "–",
      valueColor: "var(--ft-blue)",
    };
    const MONTHLY_INCOME: KpiCellData = {
      label: "MONTHLY INCOME",
      value: income > 0 ? formatGbp(income) : "–",
      valueColor: income > 0 ? "var(--ft-green)" : "var(--ft-dim)",
    };
    const MONTHLY_SPEND: KpiCellData = {
      label: "MONTHLY SPEND",
      value: expenses > 0 ? formatGbp(expenses) : "–",
      valueColor: expenses > 0 ? "var(--ft-red)" : "var(--ft-dim)",
    };
    const SAVINGS_RATE: KpiCellData = {
      label: "SAVINGS RATE",
      value: income > 0 ? `${Math.round(savingsRate)}%` : "–",
      delta: netSavings !== 0 ? `${netSavings >= 0 ? "+" : ""}${formatGbp(netSavings)}` : undefined,
      deltaColor: netSavings > 0 ? "var(--ft-green)" : "var(--ft-red)",
      valueColor: savingsRate >= 20
        ? "var(--ft-green)"
        : savingsRate >= 10
        ? "var(--ft-amber)"
        : savingsRate > 0
        ? "var(--ft-red)"
        : "var(--ft-dim)",
    };
    const MOM_SPEND: KpiCellData = {
      label: "MoM SPEND",
      value: prevExpenses > 0 ? `${momSign}${momDelta.toFixed(1)}%` : "–",
      valueColor: prevExpenses > 0 ? momColor : "var(--ft-dim)",
    };
    const PORTFOLIO: KpiCellData = {
      label: "PORTFOLIO",
      value: portfolioVal > 0 ? formatGbp(portfolioVal) : "–",
      // Delta here is total P&L, not 24h. The API does not yet return
      // an intraday delta on DashboardSummary; when it does, swap.
      delta: portfolioPl !== 0
        ? `${portfolioPl >= 0 ? "+" : ""}${formatGbp(portfolioPl)}`
        : undefined,
      deltaColor: portfolioPl >= 0 ? "var(--ft-green)" : "var(--ft-red)",
      valueColor: "var(--ft-text)",
    };
    const PORTFOLIO_RETURN: KpiCellData = {
      label: "RETURN",
      value: portfolioVal > 0 ? `${portfolioPct >= 0 ? "+" : ""}${portfolioPct.toFixed(2)}%` : "–",
      valueColor: portfolioPct >= 0 ? "var(--ft-green)" : "var(--ft-red)",
    };
    const CASH: KpiCellData = {
      label: "CASH",
      value: cash !== 0 ? formatGbp(cash) : "–",
      valueColor: cash > 0 ? "var(--ft-text)" : "var(--ft-dim)",
    };
    const OWED_TO_ME: KpiCellData = {
      label: "OWED TO ME",
      value: owedToMe > 0 ? formatGbp(owedToMe) : "–",
      valueColor: owedToMe > 0 ? "var(--ft-green)" : "var(--ft-dim)",
    };
    const I_OWE: KpiCellData = {
      label: "I OWE",
      value: iOwe > 0 ? formatGbp(iOwe) : "–",
      valueColor: iOwe > 0 ? "var(--ft-red)" : "var(--ft-dim)",
    };

    // Persona-driven KPI selection. Each entry names the cells that
    // appear on the KPI bar for that persona, left to right. "full"
    // preserves the pre-item-4 six-cell layout so no existing user's
    // dashboard shifts.
    //
    // Market: PORTFOLIO + P&L are the two most important numbers.
    // Return and Cash fill the row. The user brief asked for a "24h
    // portfolio delta" — the current API returns total P&L, not
    // intraday. Using total P&L until a 24h delta field exists is
    // honest (no fabrication) and matches what the market-persona
    // KpiBar orphan already did.
    switch (activePersonaId) {
      case "market":
        return [PORTFOLIO, PORTFOLIO_RETURN, NET_WORTH, CASH];
      case "budget":
        return [MONTHLY_SPEND, SAVINGS_RATE, MOM_SPEND, CASH];
      case "wealth":
        return [NET_WORTH, SAVINGS_RATE, PORTFOLIO, CASH];
      case "social":
        return [NET_WORTH, OWED_TO_ME, I_OWE, CASH];
      case "full":
      default:
        return [NET_WORTH, MONTHLY_INCOME, MONTHLY_SPEND, SAVINGS_RATE, MOM_SPEND, PORTFOLIO];
    }
  }, [dashData, prevMonthTxs, activePersonaId]);

  // ── AI Insights props ────────────────────────────────────────────────────────
  const aiInsightsProps = useMemo((): AiInsightsPanelProps => {
    const netWorth = dashData?.netWorth ?? 0;
    const income = dashData?.thisMonth?.income ?? 0;
    const expenses = dashData?.thisMonth?.expenses ?? 0;
    const savingsRate = dashData?.thisMonth?.savingsRate ?? 0;

    const catMap: Record<string, number> = {};
    for (const t of (monthTxs ?? [])) {
      if (t.gbpValue == null) continue;
      catMap[t.category] = (catMap[t.category] ?? 0) + t.gbpValue;
    }
    const topCategories = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, amount]) => ({ name, amount }));

    const budgetStatus = expenses > 0 && income > 0
      ? (expenses / income > 0.9 ? "OverBudget" : expenses / income > 0.7 ? "OnTrack" : "UnderBudget")
      : "";

    return { netWorth, income, expenses, savingsRate, topCategories, budgetStatus };
  }, [dashData, monthTxs]);

  return (
    <div>
      {/* Expanded widget modal */}
      {expandedWidgetId && (
        <WidgetModal id={expandedWidgetId} onClose={() => setExpandedWidgetId(null)} />
      )}

      {/* Smart alerts — renders nothing when no active alerts (shown inside terminal layout) */}

      {/* First-run onboarding wizard */}
      <OnboardingWizard
        open={showOnboarding}
        onClose={() => {
          localStorage.setItem("nr-onboarding-complete", "1");
          setOnboardingDismissed(true);
        }}
      />

      {/* Persona-aware empty state — desktop counterpart to
          MobileHome's "NO HOLDINGS / NO ACCOUNTS" card. Renders when
          the account breakdown comes back empty; widgets below still
          render (zeros) so a user in this state can still explore. */}
      {dashData && (dashData.accountBreakdown?.length ?? 0) === 0 && (
        <DashboardEmptyState />
      )}

      {/* ── Bloomberg KPI Bar ── */}
      <DashboardKpiBar
        cells={kpiCells}
        onCustomize={handleCustomizeToggle}
        isCustomizing={isCustomizing}
        dashboardLabel={dashboardLabel}
        isMobile={isMobile}
      />

      {/* Persona quick start — shown once, disappears when all steps done or dismissed */}
      <PersonaQuickStart />

      {/* ── Main Content ── */}
      {isCustomizing ? (
        /* ── CUSTOMIZE MODE: widget drag-and-drop grid ── */
        <div>
          {/* Customize mode header */}
          <div style={{
            background: "color-mix(in srgb, var(--ft-accent) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--ft-accent) 30%, transparent)",
            padding: "7px 12px",
            marginBottom: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-accent)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              <span style={{ color: "var(--ft-accent)" }}>·</span> CUSTOMIZE MODE — drag widgets to rearrange · hover for controls · click [EXIT CUSTOMIZE] when done
            </span>
            <Text as="span" mono size={9} color="var(--ft-dim)">
              {enabledIds.length} widget{enabledIds.length !== 1 ? "s" : ""} active
            </Text>
          </div>

          {/* Saved Views toolbar */}
          <HStack gap={8} align="center" wrap marginBottom={10}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", marginRight: 4 }}>
              VIEWS:
            </span>
            {views.map(v => (
              <ViewRow key={v.id} view={v} onLoad={handleLoadView} onDelete={handleDeleteView} />
            ))}
            {!isCurrentLayoutSaved && (showViewSave ? (
              <HStack gap={4} align="center">
                <input
                  className="ft-filter-input"
                  value={viewNameInput}
                  onChange={e => setViewNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSaveView(); if (e.key === "Escape") setShowViewSave(false); }}
                  placeholder="View name…"
                  autoFocus
                  style={{
                    fontFamily: "var(--font-mono)", fontSize: 10,
                    background: "var(--ft-raised)", border: "1px solid var(--ft-accent)",
                    color: "var(--ft-text)", padding: "3px 8px", outline: "none", width: 120,
                  }}
                />
                <button onClick={handleSaveView} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-green)", background: "transparent", border: "1px solid var(--ft-green)", padding: "3px 9px", cursor: "pointer" }}>Save</button>
                <button onClick={() => setShowViewSave(false)} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", background: "transparent", border: "1px solid var(--ft-border)", padding: "3px 9px", cursor: "pointer" }}>Cancel</button>
              </HStack>
            ) : (
              <button
                onClick={() => setShowViewSave(true)}
                style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.05em",
                  color: "var(--ft-dim)", background: "transparent",
                  border: "1px dashed var(--ft-border)", padding: "3px 9px", cursor: "pointer",
                }}
              >
                + Save current
              </button>
            ))}
          </HStack>

          {/* AI Insights panel in customize mode too */}
          <AiInsightsPanel {...aiInsightsProps} />

          {enabledIds.length === 0 ? (
            <VStack gap={12} align="center" justify="center" padding="60px 0">
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-muted)" }}>
                No widgets enabled — add one below
              </div>
            </VStack>
          ) : isMobile ? (
            /* Mobile: compact tile DnD — matches view mode exactly, just adds grip + remove strip */
            <DndContext sensors={mobileSensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragOver={handleDragOverMobile} onDragEnd={handleDragEndMobile} onDragCancel={() => { setActiveId(null); lastOverRef.current = null; if (preDragOrderRef.current.length) setOrder(preDragOrderRef.current); }}>
              <div className="ft-mobile-widget-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <SortableContext items={enabledIds} strategy={rectSortingStrategy}>
                  {enabledIds.map(id => (
                    <SortableCompactTile key={id} id={id} onRemove={() => toggle(id)} isFullWidth={COMPACT_WIDGET_FULL_WIDTH.has(id)} activeId={activeId} />
                  ))}
                </SortableContext>
              </div>
              <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}>
                {activeId ? (() => {
                  const CompactPreview = COMPACT_WIDGET_COMPONENTS[activeId];
                  return (
                    <div style={{
                      background: "var(--ft-surface)",
                      border: "1px solid var(--ft-accent)",
                      boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
                      cursor: "grabbing",
                      opacity: 0.92,
                      overflow: "hidden",
                      borderRadius: 1,
                    }}>
                      {CompactPreview && <CompactPreview />}
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        background: "var(--ft-raised)",
                        borderTop: "1px solid var(--ft-accent)",
                        height: 36,
                        paddingLeft: 10,
                        gap: 8,
                      }}>
                        <Text as="span" mono size={14} color="var(--ft-accent)">⠿</Text>
                        <MonoLabel as="span" size={8} color="var(--ft-accent)" letterSpacing="0.1em">
                          {WIDGET_DEF_MAP[activeId]?.label ?? activeId}
                        </MonoLabel>
                      </div>
                    </div>
                  );
                })() : null}
              </DragOverlay>
            </DndContext>
          ) : (
            /* Desktop: drag-and-drop two-column grid */
            <DndContext sensors={sensors} collisionDetection={customCollisionDetection} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={() => { setActiveId(null); lastOverRef.current = null; if (preDragOrderRef.current.length) { setOrder(preDragOrderRef.current); setRightSet(preDragRightSetRef.current); } }}>
              <div className="ft-dashboard-two-col" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                {/* Left column */}
                <VStack gap={10} grow>
                  <SortableContext items={leftIds} strategy={verticalListSortingStrategy}>
                    {leftIds.map((id, idx) => (
                      <SortableWidget key={id} id={id} span={getSpan(id)} index={idx} anyDragging={activeId !== null} onToggleSpan={() => toggleSpan(id)} onRemove={() => toggle(id)} onExpand={() => setExpandedWidgetId(id)} />
                    ))}
                  </SortableContext>
                </VStack>
                {/* Right column */}
                <VStack gap={10} grow>
                  <SortableContext items={rightIds} strategy={verticalListSortingStrategy}>
                    {rightIds.map((id, idx) => (
                      <SortableWidget key={id} id={id} span={getSpan(id)} index={idx} anyDragging={activeId !== null} onToggleSpan={() => toggleSpan(id)} onRemove={() => toggle(id)} onExpand={() => setExpandedWidgetId(id)} />
                    ))}
                  </SortableContext>
                </VStack>
              </div>
              <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
                {activeId ? (
                  <div style={{
                    background: "var(--ft-surface)",
                    border: "1px solid var(--ft-accent)",
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "grabbing",
                    minHeight: 48,
                  }}>
                    <Text as="span" mono size={12} color="var(--ft-dim)">⠿</Text>
                    <MonoLabel as="span" size={10} color="var(--ft-accent)" letterSpacing="0.08em">
                      {WIDGET_DEF_MAP[activeId]?.label ?? activeId}
                    </MonoLabel>
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
      ) : (
        /* ── DEFAULT VIEW: widget grid (mirrors customize mode, read-only) ── */
        <div>
          {enabledIds.length === 0 ? (
            /* No custom widgets — show terminal layout (desktop) or overview (mobile) */
            isMobile ? <DashboardOverview /> : <TerminalLayout aiInsightsProps={aiInsightsProps} />
          ) : isMobile ? (
            <>
              <AiInsightsPanel {...aiInsightsProps} />
              <div
                className="ft-mobile-widget-grid"
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}
              >
                {enabledIds.map(id => (
                  <div
                    key={id}
                    style={{
                      gridColumn: COMPACT_WIDGET_FULL_WIDTH.has(id) ? "1 / -1" : "auto",
                      minWidth: 0,
                      overflow: "hidden",
                    }}
                  >
                    <ViewModeWidget id={id} onExpand={() => setExpandedWidgetId(id)} />
                  </div>
                ))}
              </div>
              <AiInsightsStrip />
            </>
          ) : (
            <>
              <AiInsightsPanel {...aiInsightsProps} />
              <DndContext
                sensors={longPressDesktopSensors}
                collisionDetection={customCollisionDetection}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={() => {
                  setActiveId(null);
                  lastOverRef.current = null;
                  if (preDragOrderRef.current.length) {
                    setOrder(preDragOrderRef.current);
                    setRightSet(preDragRightSetRef.current);
                  }
                }}
              >
                <div className="ft-dashboard-two-col" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <VStack gap={10} grow>
                    <SortableContext items={leftIds} strategy={verticalListSortingStrategy}>
                      {leftIds.map(id => (
                        <LongPressDraggableWidget key={id} id={id} anyDragging={activeId !== null} onExpand={() => setExpandedWidgetId(id)} />
                      ))}
                    </SortableContext>
                  </VStack>
                  <VStack gap={10} grow>
                    <SortableContext items={rightIds} strategy={verticalListSortingStrategy}>
                      {rightIds.map(id => (
                        <LongPressDraggableWidget key={id} id={id} anyDragging={activeId !== null} onExpand={() => setExpandedWidgetId(id)} />
                      ))}
                    </SortableContext>
                  </VStack>
                </div>
                <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
                  {activeId ? (
                    <div style={{
                      background: "var(--ft-surface)",
                      border: "1px solid var(--ft-accent)",
                      padding: "10px 14px",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "grabbing",
                      minHeight: 48,
                    }}>
                      <Text as="span" mono size={12} color="var(--ft-dim)">⠿</Text>
                      <MonoLabel as="span" size={10} color="var(--ft-accent)" letterSpacing="0.08em">
                        {WIDGET_DEF_MAP[activeId]?.label ?? activeId}
                      </MonoLabel>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
              <AiInsightsStrip />
            </>
          )}
        </div>
      )}
    </div>
  );
}
