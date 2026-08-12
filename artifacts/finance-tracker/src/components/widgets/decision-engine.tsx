import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListAccounts,
  useListTransactions,
  useListInvestments,
  useGetInvestmentSummary,
  useListGoals,
  useListBudgets,
  useListSubscriptions,
  useListDebts,
} from "@workspace/api-client-react";
import type { Account, Transaction, Investment, InvestmentSummary, Goal, Budget, Subscription, Debt } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { Zap, ChevronRight } from "lucide-react";

type DecisionPriority = "critical" | "high" | "medium" | "low";
interface MiniDecision {
  id: string;
  priority: DecisionPriority;
  title: string;
  annualCost?: number;
  href: string;
}

const PRIORITY_COLOR: Record<DecisionPriority, string> = {
  critical: "var(--ft-red)",
  high: "var(--ft-amber)",
  medium: "var(--ft-blue)",
  low: "var(--ft-dim)",
};

const PRIORITY_LABEL: Record<DecisionPriority, string> = {
  critical: "CRIT",
  high: "HIGH",
  medium: "MED",
  low: "LOW",
};

const PRIORITY_ORDER: Record<DecisionPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function subsAnnual(s: Subscription): number {
  const mul: Record<string, number> = { weekly: 52, monthly: 12, quarterly: 4, annual: 1 };
  return s.amount * (mul[s.frequency] ?? 12);
}

function buildMiniDecisions(
  accounts: Account[],
  transactions: Transaction[],
  investments: Investment[],
  summary: InvestmentSummary | undefined,
  goals: Goal[],
  budgets: Budget[],
  subscriptions: Subscription[],
  debts: Debt[],
): MiniDecision[] {
  const out: MiniDecision[] = [];
  const totalCashGbp = accounts.reduce((s, a) => s + a.gbpEquivalent, 0);
  const portfolioGbp = summary?.totalValueGbp ?? 0;
  const totalWealth = totalCashGbp + portfolioGbp;
  const cashRatio = totalWealth > 0 ? totalCashGbp / totalWealth : 1;

  if (totalCashGbp > 5000 && cashRatio > 0.6) {
    const idleGbp = totalCashGbp - portfolioGbp * 0.4;
    const annualCost = Math.max(0, idleGbp) * 0.045;
    out.push({ id: "idle-cash", priority: idleGbp > 20000 ? "critical" : idleGbp > 10000 ? "high" : "medium", title: `${formatGbp(totalCashGbp)} idle cash — ${formatGbp(annualCost)}/yr lost`, annualCost, href: "/accounts" });
  }
  if (investments.length === 0 && totalCashGbp > 1000) {
    out.push({ id: "no-investments", priority: "high", title: "Not invested yet", annualCost: totalCashGbp * 0.05, href: "/portfolio" });
  }
  if (portfolioGbp > 500) {
    investments.forEach((inv) => {
      const pct = portfolioGbp > 0 ? inv.gbpValue / portfolioGbp : 0;
      if (pct > 0.35) out.push({ id: `conc-${inv.id}`, priority: pct > 0.6 ? "high" : "medium", title: `${inv.ticker} is ${Math.round(pct * 100)}% of portfolio`, href: "/portfolio" });
    });
  }
  const now = new Date();
  const thisYear = now.getFullYear();
  const isaDeadline = new Date(`${now.getMonth() < 3 || (now.getMonth() === 3 && now.getDate() <= 5) ? thisYear : thisYear + 1}-04-05`);
  const daysToISA = Math.ceil((isaDeadline.getTime() - now.getTime()) / 86_400_000);
  if (daysToISA <= 90) {
    out.push({ id: "isa-deadline", priority: daysToISA <= 30 ? "critical" : "high", title: `ISA deadline in ${daysToISA} days`, href: "/portfolio" });
  }
  goals.forEach((g) => {
    if (!g.deadline) return;
    const days = Math.ceil((new Date(g.deadline).getTime() - now.getTime()) / 86_400_000);
    if (days < 0 && g.current < g.target) {
      out.push({ id: `goal-overdue-${g.id}`, priority: "high", title: `"${g.name}" goal overdue`, href: "/goals" });
    } else if (days > 0 && days < 180 && g.target > 0 && g.current / g.target < 0.5) {
      out.push({ id: `goal-behind-${g.id}`, priority: days < 60 ? "high" : "medium", title: `"${g.name}" underfunded — ${days}d left`, href: "/goals" });
    }
  });
  subscriptions.filter((s) => !s.active).forEach((s) => {
    const annual = subsAnnual(s);
    out.push({ id: `sub-${s.id}`, priority: annual > 100 ? "high" : "medium", title: `Cancel ${s.name} — save ${formatGbp(annual)}/yr`, annualCost: annual, href: "/subscriptions" });
  });
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const spendByCategory: Record<string, number> = {};
  transactions.filter((t) => t.date >= monthStart && t.type === "expense").forEach((t) => {
    spendByCategory[t.category] = (spendByCategory[t.category] ?? 0) + Math.abs(t.gbpValue);
  });
  budgets.forEach((b) => {
    const over = (spendByCategory[b.category] ?? 0) - b.monthlyLimit;
    if (over > 0) out.push({ id: `budget-${b.id}`, priority: over > b.monthlyLimit * 0.5 ? "high" : "medium", title: `${b.category} budget exceeded by ${formatGbp(over)}`, annualCost: over * 12, href: "/budget" });
  });
  const debtsPending = debts.filter((d) => d.direction === "they_owe_me" && d.status === "pending");
  const totalOwed = debtsPending.reduce((s, d) => s + d.gbpEquivalent, 0);
  if (totalOwed > 50) out.push({ id: "debts-owed", priority: totalOwed > 500 ? "high" : "medium", title: `${formatGbp(totalOwed)} owed to you`, href: "/owing" });

  return out.sort((a, b) => {
    const po = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (po !== 0) return po;
    return (b.annualCost ?? 0) - (a.annualCost ?? 0);
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type PriorityCountChipProps = {
  count: number;
  color: string;
  label: string;
};

function PriorityCountChip({ count, color, label }: PriorityCountChipProps) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)",
      fontSize: 8,
      fontWeight: 700,
      color,
      background: `color-mix(in srgb, ${color} 15%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      padding: "1px 5px",
      letterSpacing: "0.06em",
    }}>
      {count} {label}
    </span>
  );
}

type StatsKpiCellProps = {
  label: string;
  value: React.ReactNode;
  accentColor: string;
  hasBorderRight?: boolean;
};

function StatsKpiCell({ label, value, accentColor, hasBorderRight }: StatsKpiCellProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "7px 12px",
        borderTop: `2px solid ${accentColor}`,
        borderRight: hasBorderRight ? "1px solid var(--ft-border)" : undefined,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 2 }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

function DecisionRow({ d, rank }: { d: MiniDecision; rank: number }) {
  const [hov, setHov] = useState(false);
  const color = PRIORITY_COLOR[d.priority];
  return (
    <Link
      key={d.id}
      href={d.href}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
          display: "grid",
          gridTemplateColumns: "14px 4px auto 1fr auto auto",
          alignItems: "center",
          gap: 8,
          padding: "7px 12px",
          borderBottom: "1px solid var(--ft-border)",
          background: hov ? `color-mix(in srgb, ${color} 5%, var(--ft-raised))` : "transparent",
          textDecoration: "none",
          cursor: "pointer",
          transition: "background 0.1s",
        }}
      >
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-border2)", fontWeight: 700, textAlign: "right" }}>
          {rank}
        </span>
        <div style={{ width: 4, height: 28, background: color, borderRadius: 1 }} />
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          fontWeight: 700,
          color,
          background: `color-mix(in srgb, ${color} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
          padding: "1px 4px",
          letterSpacing: "0.06em",
          whiteSpace: "nowrap",
        }}>
          {PRIORITY_LABEL[d.priority]}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {d.title}
        </span>
        {d.annualCost && d.annualCost > 0 ? (
          <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", flexShrink: 0, whiteSpace: "nowrap" }}>
            {formatGbp(d.annualCost)}/yr
          </span>
        ) : <span />}
        <ChevronRight size={9} style={{ color: "var(--ft-dim)", flexShrink: 0 }} />
    </Link>
  );
}

// ─── Widget ───────────────────────────────────────────────────────────────────

export function DecisionEngineWidget() {
  const { data: accounts = [] } = useListAccounts();
  const { data: transactions = [] } = useListTransactions({ type: "expense" });
  const { data: investments = [] } = useListInvestments();
  const { data: summary } = useGetInvestmentSummary();
  const { data: goals = [] } = useListGoals();
  const { data: budgets = [] } = useListBudgets();
  const { data: subscriptions = [] } = useListSubscriptions();
  const { data: debts = [] } = useListDebts();

  const decisions = useMemo(
    () => buildMiniDecisions(
      accounts as Account[], transactions as Transaction[], investments as Investment[],
      summary as InvestmentSummary | undefined, goals as Goal[], budgets as Budget[],
      subscriptions as Subscription[], debts as Debt[],
    ),
    [accounts, transactions, investments, summary, goals, budgets, subscriptions, debts],
  );

  const top = decisions.slice(0, 6);
  const totalAnnualCost = decisions.reduce((s, d) => s + (d.annualCost ?? 0), 0);
  const critCount = decisions.filter((d) => d.priority === "critical").length;
  const highCount = decisions.filter((d) => d.priority === "high").length;

  const headerAccent = critCount > 0 ? "var(--ft-red)" : highCount > 0 ? "var(--ft-amber)" : "var(--ft-blue)";

  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderLeft: `2px solid ${headerAccent}`, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", height: 34, background: "var(--ft-raised)", borderBottom: "1px solid var(--ft-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Zap size={11} style={{ color: headerAccent, flexShrink: 0 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--ft-muted)", letterSpacing: "0.08em" }}>
            Decision Engine
          </span>
          {decisions.length > 0 && (
            <div style={{ display: "flex", gap: 3 }}>
              {critCount > 0 && <PriorityCountChip count={critCount} color="var(--ft-red)" label="CRIT" />}
              {highCount > 0 && <PriorityCountChip count={highCount} color="var(--ft-amber)" label="HIGH" />}
            </div>
          )}
        </div>
        <Link href="/decisions" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-blue)", textDecoration: "none", display: "flex", alignItems: "center", gap: 2, letterSpacing: "0.04em" }}>
          ALL <ChevronRight size={9} />
        </Link>
      </div>

      {/* Stats strip — border-as-gap KPI pattern */}
      {decisions.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: totalAnnualCost > 0 ? "1fr 1fr" : "1fr", gap: 1, background: "var(--ft-border)", borderBottom: "1px solid var(--ft-border)" }}>
          <StatsKpiCell
            label="Actions pending"
            accentColor={headerAccent}
            hasBorderRight={false}
            value={<div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: headerAccent, lineHeight: 1 }}>{decisions.length}</div>}
          />
          {totalAnnualCost > 0 && (
            <StatsKpiCell
              label="Opp. cost / yr"
              accentColor="var(--ft-amber)"
              value={<div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--ft-amber)", lineHeight: 1 }}>{formatGbp(totalAnnualCost)}</div>}
            />
          )}
        </div>
      )}

      {/* Decisions list */}
      {top.length === 0 ? (
        <div style={{ padding: "28px 16px", textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, color: "var(--ft-green)", marginBottom: 6 }}>✓</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-green)" }}>ALL CLEAR</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>No actions needed right now</div>
        </div>
      ) : (
        <>
          {top.map((d, i) => <DecisionRow key={d.id} d={d} rank={i + 1} />)}
          {decisions.length > 6 && (
            <Link href="/decisions" style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textDecoration: "none", textAlign: "center", padding: "7px 0", background: "var(--ft-raised)", letterSpacing: "0.04em" }}>
              +{decisions.length - 6} more →
            </Link>
          )}
        </>
      )}
    </div>
  );
}
