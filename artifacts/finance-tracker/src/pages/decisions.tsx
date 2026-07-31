import { useMemo, useState } from "react";
import { Link } from "wouter";
import { loadPersonaIds, PERSONAS } from "@/lib/persona";
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
import type {
  Account,
  Transaction,
  Investment,
  InvestmentSummary,
  Goal,
  Budget,
  Subscription,
  Debt,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/page-header";
import { formatGbp } from "@/lib/utils";
import { Zap, X, ChevronRight, RefreshCw } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type DecisionCategory = "cash" | "portfolio" | "goals" | "subscriptions" | "budget" | "debt" | "tax";
type DecisionPriority = "critical" | "high" | "medium" | "low";

interface Decision {
  id: string;
  category: DecisionCategory;
  priority: DecisionPriority;
  title: string;
  detail: string;
  action: string;
  href: string;
  annualCost?: number;
  daysUntilDeadline?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<DecisionPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const PERSONA_BOOST: Record<string, DecisionCategory[]> = {
  market:  ["portfolio", "cash"],
  budget:  ["budget", "subscriptions", "cash"],
  wealth:  ["goals", "cash", "tax"],
  social:  ["debt", "cash"],
  full:    [],
};
const PRIORITY_COLOR: Record<DecisionPriority, string> = {
  critical: "var(--ft-red)",
  high: "var(--ft-amber)",
  medium: "var(--ft-blue)",
  low: "var(--ft-dim)",
};
const CATEGORY_LABEL: Record<DecisionCategory, string> = {
  cash: "CASH",
  portfolio: "PORT",
  goals: "GOAL",
  subscriptions: "SUBS",
  budget: "BUDG",
  debt: "DEBT",
  tax: "TAX·",
};

const DISMISSED_KEY = "ft-decisions-dismissed";
function loadDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function saveDismissed(ids: Set<string>): void {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

// ── Decision engine ───────────────────────────────────────────────────────────

function daysUntilDate(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function subsAnnualAmount(s: Subscription): number {
  const mul: Record<string, number> = { weekly: 52, monthly: 12, quarterly: 4, annual: 1 };
  return s.amount * (mul[s.frequency] ?? 12);
}

function buildDecisions(
  accounts: Account[],
  transactions: Transaction[],
  investments: Investment[],
  summary: InvestmentSummary | undefined,
  goals: Goal[],
  budgets: Budget[],
  subscriptions: Subscription[],
  debts: Debt[],
): Decision[] {
  const out: Decision[] = [];

  const totalCashGbp = accounts.reduce((s, a) => s + a.gbpEquivalent, 0);
  const portfolioGbp = summary?.totalValueGbp ?? 0;
  const totalWealth = totalCashGbp + portfolioGbp;
  const cashRatio = totalWealth > 0 ? totalCashGbp / totalWealth : 1;

  if (totalCashGbp > 5000 && cashRatio > 0.6) {
    const idleGbp = totalCashGbp - portfolioGbp * 0.4;
    const annualCost = Math.max(0, idleGbp) * 0.045;
    out.push({
      id: "idle-cash",
      category: "cash",
      priority: idleGbp > 20000 ? "critical" : idleGbp > 10000 ? "high" : "medium",
      title: "Large cash balance — money losing value",
      detail: `${formatGbp(totalCashGbp)} sitting in accounts (${Math.round(cashRatio * 100)}% of net worth). At 4.5% HYSA rate you're leaving ~${formatGbp(annualCost)}/yr on the table.`,
      action: "Move to high-yield savings or invest",
      href: "/accounts",
      annualCost,
    });
  }

  accounts.forEach((a) => {
    if (a.gbpEquivalent > 10000) {
      const annualCost = a.gbpEquivalent * 0.045;
      out.push({
        id: `idle-account-${a.id}`,
        category: "cash",
        priority: "medium",
        title: `${a.name}: large balance with no yield`,
        detail: `${formatGbp(a.gbpEquivalent)} held in ${a.currency}. Could earn ~${formatGbp(annualCost)}/yr at 4.5% HYSA.`,
        action: "Open a high-yield savings account",
        href: "/accounts",
        annualCost,
      });
    }
  });

  if (investments.length === 0 && totalCashGbp > 1000) {
    out.push({
      id: "no-investments",
      category: "portfolio",
      priority: "high",
      title: "Not invested yet",
      detail: `You have ${formatGbp(totalCashGbp)} in accounts but no investments. Long-term equity returns average 7-10%/yr vs 4-5% cash.`,
      action: "Start building your portfolio",
      href: "/portfolio",
      annualCost: totalCashGbp * 0.05,
    });
  }

  if (portfolioGbp > 500) {
    investments.forEach((inv) => {
      const pct = portfolioGbp > 0 ? inv.gbpValue / portfolioGbp : 0;
      if (pct > 0.35) {
        out.push({
          id: `concentration-${inv.id}`,
          category: "portfolio",
          priority: pct > 0.6 ? "high" : "medium",
          title: `${inv.ticker} is ${Math.round(pct * 100)}% of your portfolio`,
          detail: `${inv.name} (${formatGbp(inv.gbpValue)}) dominates your portfolio. Concentration risk increases volatility significantly.`,
          action: "Rebalance by diversifying",
          href: "/portfolio",
        });
      }
    });
  }

  investments.forEach((inv) => {
    if (inv.plPercent < -20 && inv.gbpValue > 200) {
      out.push({
        id: `loss-${inv.id}`,
        category: "portfolio",
        priority: inv.plPercent < -40 ? "high" : "medium",
        title: `${inv.ticker} down ${Math.abs(Math.round(inv.plPercent))}% — review position`,
        detail: `${inv.name}: cost ${formatGbp(inv.shares * inv.costPricePerShare)}, now ${formatGbp(inv.gbpValue)} (${formatGbp(inv.plGbp)} P&L). Consider averaging down, cutting losses, or holding.`,
        action: "Review or set a stop-loss",
        href: "/portfolio",
      });
    }
  });

  const now = new Date();
  const thisYear = now.getFullYear();
  const isaDeadline = new Date(`${now.getMonth() < 3 || (now.getMonth() === 3 && now.getDate() <= 5) ? thisYear : thisYear + 1}-04-05`);
  const daysToISA = Math.ceil((isaDeadline.getTime() - now.getTime()) / 86_400_000);
  if (daysToISA <= 90) {
    out.push({
      id: "isa-deadline",
      category: "tax",
      priority: daysToISA <= 30 ? "critical" : "high",
      title: `ISA deadline in ${daysToISA} days — use your £20,000 allowance`,
      detail: `UK Stocks & Shares ISA allowance: £20,000/yr. Any unused allowance is lost on April 5. Contributions inside an ISA grow tax-free.`,
      action: "Max out your ISA",
      href: "/portfolio",
      daysUntilDeadline: daysToISA,
      annualCost: 20000 * 0.08 * 0.2,
    });
  }

  goals.forEach((g) => {
    if (!g.deadline) return;
    const totalDays = (new Date(g.deadline).getTime() - new Date().getTime()) / 86_400_000;
    if (totalDays < 0) {
      if (g.current < g.target) {
        out.push({
          id: `goal-overdue-${g.id}`,
          category: "goals",
          priority: "high",
          title: `"${g.name}" is past deadline`,
          detail: `Target: ${formatGbp(g.target)}. Current: ${formatGbp(g.current)}. Shortfall: ${formatGbp(g.target - g.current)}.`,
          action: "Update goal or add funds",
          href: "/goals",
          daysUntilDeadline: Math.ceil(totalDays),
        });
      }
      return;
    }
    const pctComplete = g.target > 0 ? g.current / g.target : 1;
    if (pctComplete < 0.5 && totalDays < 180) {
      out.push({
        id: `goal-behind-${g.id}`,
        category: "goals",
        priority: totalDays < 60 ? "high" : "medium",
        title: `"${g.name}" is ${Math.round(pctComplete * 100)}% funded with ${Math.ceil(totalDays)} days left`,
        detail: `Need ${formatGbp(g.target - g.current)} more in ${Math.ceil(totalDays)} days. Monthly contrib needed: ${formatGbp((g.target - g.current) / Math.max(1, totalDays / 30))}.`,
        action: "Increase contributions",
        href: "/goals",
        daysUntilDeadline: Math.ceil(totalDays),
      });
    }
  });

  goals
    .filter((g) => !g.monthlyContribution && g.target > g.current)
    .slice(0, 2)
    .forEach((g) => {
      out.push({
        id: `goal-no-contrib-${g.id}`,
        category: "goals",
        priority: "low",
        title: `"${g.name}" has no monthly contribution set`,
        detail: `Target: ${formatGbp(g.target)}. Without a regular contribution you'll likely miss the goal.`,
        action: "Set a monthly contribution",
        href: "/goals",
      });
    });

  subscriptions
    .filter((s) => !s.active)
    .forEach((s) => {
      const annual = subsAnnualAmount(s);
      out.push({
        id: `sub-inactive-${s.id}`,
        category: "subscriptions",
        priority: annual > 100 ? "high" : "medium",
        title: `${s.name} is inactive — cancel to save ${formatGbp(annual)}/yr`,
        detail: `${formatGbp(s.amount)}/${s.frequency} subscription marked inactive. If you're not using it, cancel and save ${formatGbp(annual)} per year.`,
        action: "Cancel this subscription",
        href: "/subscriptions",
        annualCost: annual,
      });
    });

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const thisMonthTx = transactions.filter(
    (t) => t.date >= monthStart && t.type === "expense"
  );
  const spendByCategory: Record<string, number> = {};
  thisMonthTx.forEach((t) => {
    spendByCategory[t.category] = (spendByCategory[t.category] ?? 0) + Math.abs(t.gbpValue);
  });

  budgets.forEach((b) => {
    const spent = spendByCategory[b.category] ?? 0;
    const overspend = spent - b.monthlyLimit;
    if (overspend > 0) {
      out.push({
        id: `budget-over-${b.id}`,
        category: "budget",
        priority: overspend > b.monthlyLimit * 0.5 ? "high" : "medium",
        title: `${b.category} budget exceeded by ${formatGbp(overspend)}`,
        detail: `Budget: ${formatGbp(b.monthlyLimit)}/mo · Spent this month: ${formatGbp(spent)} · Overspend: ${formatGbp(overspend)} (${Math.round((overspend / b.monthlyLimit) * 100)}% over).`,
        action: "Review spending",
        href: "/budget",
        annualCost: overspend * 12,
      });
    }
  });

  const debtsPending = debts.filter((d) => d.direction === "they_owe_me" && d.status === "pending");
  const totalOwedToMe = debtsPending.reduce((s, d) => s + d.gbpEquivalent, 0);
  if (debtsPending.length > 0 && totalOwedToMe > 50) {
    const oldest = debtsPending.sort((a, b) => a.date.localeCompare(b.date))[0];
    const daysOld = daysUntilDate(oldest.date);
    out.push({
      id: "debts-owed",
      category: "debt",
      priority: totalOwedToMe > 500 ? "high" : "medium",
      title: `${debtsPending.length} debt${debtsPending.length > 1 ? "s" : ""} owed to you — ${formatGbp(totalOwedToMe)} outstanding`,
      detail: `${debtsPending.length} people owe you ${formatGbp(totalOwedToMe)}. Oldest: "${oldest.personName}" (${Math.abs(daysOld)}d ago).`,
      action: "Send a reminder",
      href: "/owing",
    });
  }

  const myDebts = debts.filter((d) => d.direction === "i_owe_them" && d.status === "pending");
  const totalIOwe = myDebts.reduce((s, d) => s + d.gbpEquivalent, 0);
  if (myDebts.length > 0 && totalIOwe > 100) {
    out.push({
      id: "my-debts",
      category: "debt",
      priority: totalIOwe > 1000 ? "high" : "medium",
      title: `You owe ${formatGbp(totalIOwe)} across ${myDebts.length} debt${myDebts.length > 1 ? "s" : ""}`,
      detail: `Outstanding: ${myDebts.map((d) => `${d.personName} (${formatGbp(d.gbpEquivalent)})`).slice(0, 3).join(", ")}${myDebts.length > 3 ? " +more" : ""}`,
      action: "Mark as settled or pay",
      href: "/owing",
    });
  }

  const activeSubs = subscriptions.filter((s) => s.active);
  const monthlySubCost = activeSubs.reduce((s, sub) => {
    const mul: Record<string, number> = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, annual: 1 / 12 };
    return s + sub.amount * (mul[sub.frequency] ?? 1);
  }, 0);
  const subCount = activeSubs.length;
  if (subCount >= 5 && monthlySubCost > 80) {
    out.push({
      id: "subscription-creep",
      category: "subscriptions",
      priority: monthlySubCost > 200 ? "high" : "medium",
      title: `${subCount} active subscriptions — ${formatGbp(monthlySubCost)}/mo`,
      detail: `${formatGbp(monthlySubCost * 12)}/yr across ${subCount} subscriptions. Review for duplicates or underused services — the average household can cut 2-3.`,
      action: "Audit your subscriptions",
      href: "/subscriptions",
      annualCost: monthlySubCost * 12 * 0.15,
    });
  }

  const fundedGoals = goals.filter((g) => g.target > g.current);
  if (investments.length === 0 && fundedGoals.length >= 2) {
    const totalTarget = fundedGoals.reduce((s, g) => s + (g.target - g.current), 0);
    out.push({
      id: "goals-no-invest",
      category: "portfolio",
      priority: "medium",
      title: `${fundedGoals.length} goals set but no investment account`,
      detail: `You have ${formatGbp(totalTarget)} in outstanding goal targets. Holding this in cash instead of a diversified portfolio costs ~${formatGbp(totalTarget * 0.04)}/yr in foregone growth at a conservative 4% real return.`,
      action: "Open an investment account",
      href: "/portfolio",
      annualCost: totalTarget * 0.04,
    });
  }

  return out.sort((a, b) => {
    const po = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (po !== 0) return po;
    return (b.annualCost ?? 0) - (a.annualCost ?? 0);
  });
}

// ── DecisionRow (module-level sub-component) ──────────────────────────────────

interface DecisionRowProps {
  decision: Decision;
  dismissed?: boolean;
  onDismiss?: () => void;
  onRestore?: () => void;
}

function DecisionRow({ decision: d, dismissed = false, onDismiss, onRestore }: DecisionRowProps) {
  const priorityColor = PRIORITY_COLOR[d.priority];
  const [hov, setHov] = useState(false);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "3px 56px 1fr auto",
        gap: 0,
        background: hov && !dismissed ? `color-mix(in srgb, ${priorityColor} 4%, var(--ft-surface))` : "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        opacity: dismissed ? 0.45 : 1,
        transition: "background 0.1s, opacity 0.15s",
      }}
    >
      {/* Priority stripe */}
      <div style={{ background: dismissed ? "var(--ft-border)" : priorityColor, width: 3 }} />

      {/* Category + priority badge */}
      <div
        style={{
          padding: "12px 10px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          borderRight: "1px solid var(--ft-border)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            color: dismissed ? "var(--ft-dim)" : priorityColor,
            letterSpacing: "0.06em",
          }}
        >
          {CATEGORY_LABEL[d.category]}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            color: "var(--ft-dim)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {d.priority}
        </span>
      </div>

      {/* Main content */}
      <div style={{ padding: "12px 14px", minWidth: 0 }}>
        <div
          className="pnum"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 700,
            color: "var(--ft-text)",
            marginBottom: 3,
            lineHeight: 1.3,
          }}
        >
          {d.title}
          {d.daysUntilDeadline !== undefined && d.daysUntilDeadline > 0 && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 9,
                fontWeight: 400,
                color: d.daysUntilDeadline < 30 ? "var(--ft-red)" : "var(--ft-amber)",
                background: d.daysUntilDeadline < 30 ? "rgba(248,81,73,0.12)" : "rgba(227,179,65,0.12)",
                padding: "1px 5px",
                border: `1px solid ${d.daysUntilDeadline < 30 ? "rgba(248,81,73,0.3)" : "rgba(227,179,65,0.3)"}`,
              }}
            >
              {d.daysUntilDeadline}d left
            </span>
          )}
        </div>
        <div
          className="pnum"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ft-dim)",
            lineHeight: 1.5,
            marginBottom: 6,
          }}
        >
          {d.detail}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Link href={d.href}>
            <a
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--ft-blue)",
                textDecoration: "none",
                padding: "2px 8px",
                border: "1px solid rgba(88,166,255,0.3)",
                background: "rgba(88,166,255,0.06)",
              }}
            >
              {d.action}
              <ChevronRight size={10} />
            </a>
          </Link>
          {d.annualCost !== undefined && d.annualCost > 0 && (
            <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-amber)", background: "color-mix(in srgb, var(--ft-amber) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--ft-amber) 25%, transparent)", padding: "1px 5px" }}>
              {formatGbp(d.annualCost)}/yr impact
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div
        style={{
          padding: "12px 10px",
          display: "flex",
          alignItems: "flex-start",
          borderLeft: "1px solid var(--ft-border)",
        }}
      >
        {dismissed ? (
          <button
            onClick={onRestore}
            title="Restore"
            style={{
              background: "none",
              border: "1px solid var(--ft-border)",
              color: "var(--ft-dim)",
              cursor: "pointer",
              padding: "2px 6px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <RefreshCw size={11} />
          </button>
        ) : (
          <button
            onClick={onDismiss}
            title="Dismiss"
            style={{
              background: "none",
              border: "none",
              color: "var(--ft-dim)",
              cursor: "pointer",
              padding: "2px 4px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── KPI summary cell (module-level) ───────────────────────────────────────────

interface SummaryKpiCellProps {
  label: string;
  value: string;
  valueColor: string;
}

function SummaryKpiCell({ label, value, valueColor }: SummaryKpiCellProps) {
  return (
    <div style={{ background: "var(--ft-surface)", padding: "12px 16px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 4, letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: valueColor }}>
        {value}
      </div>
    </div>
  );
}

// ── Page component ────────────────────────────────────────────────────────────

export default function Decisions() {
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);
  const [showDismissed, setShowDismissed] = useState(false);
  const [decisionsIntroSeen, setDecisionsIntroSeen] = useState(() => !!localStorage.getItem("ft-decisions-intro-seen"));

  const { data: accounts = [] } = useListAccounts();
  const { data: transactions = [] } = useListTransactions({ type: "expense" });
  const { data: investments = [] } = useListInvestments();
  const { data: summary } = useGetInvestmentSummary();
  const { data: goals = [] } = useListGoals();
  const { data: budgets = [] } = useListBudgets();
  const { data: subscriptions = [] } = useListSubscriptions();
  const { data: debts = [] } = useListDebts();

  const activePersonaId = useMemo(() => loadPersonaIds()[0] ?? "full", []);
  const activePersona = PERSONAS.find(p => p.id === activePersonaId);
  const personaBoostCategories = PERSONA_BOOST[activePersonaId] ?? [];

  const allDecisions = useMemo(() => {
    const base = buildDecisions(
      accounts as Account[],
      transactions as Transaction[],
      investments as Investment[],
      summary as InvestmentSummary | undefined,
      goals as Goal[],
      budgets as Budget[],
      subscriptions as Subscription[],
      debts as Debt[],
    );
    if (personaBoostCategories.length === 0) return base;
    return [...base].sort((a, b) => {
      const po = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (po !== 0) return po;
      const aBoost = personaBoostCategories.indexOf(a.category);
      const bBoost = personaBoostCategories.indexOf(b.category);
      const aRank = aBoost === -1 ? 999 : aBoost;
      const bRank = bBoost === -1 ? 999 : bBoost;
      if (aRank !== bRank) return aRank - bRank;
      return (b.annualCost ?? 0) - (a.annualCost ?? 0);
    });
  }, [accounts, transactions, investments, summary, goals, budgets, subscriptions, debts, personaBoostCategories]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = allDecisions.filter((d) => !dismissed.has(d.id));
  const dismissedList = allDecisions.filter((d) => dismissed.has(d.id));

  const totalAnnualCost = active.reduce((s, d) => s + (d.annualCost ?? 0), 0);
  const criticalCount = active.filter((d) => d.priority === "critical").length;
  const highCount = active.filter((d) => d.priority === "high").length;

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  }

  function restore(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      saveDismissed(next);
      return next;
    });
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 0 48px" }}>
      <PageHeader
        icon={Zap}
        title="Decision Engine"
        subtitle="Ranked, specific, time-sensitive financial actions derived from your data"
        actions={
          dismissedList.length > 0 ? (
            <button
              onClick={() => setShowDismissed((v) => !v)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                padding: "3px 10px",
                background: "var(--ft-raised)",
                border: "1px solid var(--ft-border)",
                color: "var(--ft-dim)",
                cursor: "pointer",
              }}
            >
              {showDismissed ? "HIDE" : "SHOW"} {dismissedList.length} DISMISSED
            </button>
          ) : null
        }
      />

      {/* Persona context strip */}
      {activePersona && personaBoostCategories.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "5px 12px", marginBottom: 16,
          background: "rgba(244,162,30,0.04)",
          border: "1px solid rgba(244,162,30,0.2)",
          borderLeft: "3px solid var(--ft-amber)",
          fontFamily: "var(--font-mono)", fontSize: 9,
        }}>
          <span style={{ color: "var(--ft-amber)", fontWeight: 700, letterSpacing: "0.1em" }}>
            {activePersona.code}
          </span>
          <span style={{ color: "var(--ft-dim)", letterSpacing: "0.04em" }}>
            Sorted for {activePersona.label} — {personaBoostCategories.join(", ")} actions surfaced first
          </span>
          <a href="/settings?panel=terminal-profile" style={{ marginLeft: "auto", color: "var(--ft-dim)", opacity: 0.55, textDecoration: "none", letterSpacing: "0.06em", fontSize: 8 }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = "1"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = "0.55"; }}>
            Change →
          </a>
        </div>
      )}

      {/* ── Summary bar (border-as-gap grid) ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", borderLeft: "3px solid var(--ft-cyan)", paddingLeft: 8, marginBottom: 8 }}>
          Overview
        </div>
        <div
          className="ft-three-col"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 1,
            background: "var(--ft-border)",
          }}
        >
          <SummaryKpiCell
            label="ANNUAL OPPORTUNITY COST"
            value={totalAnnualCost > 0 ? formatGbp(totalAnnualCost) + "/yr" : "—"}
            valueColor={totalAnnualCost > 5000 ? "var(--ft-red)" : totalAnnualCost > 1000 ? "var(--ft-amber)" : "var(--ft-text)"}
          />
          <SummaryKpiCell
            label="ACTIONS IDENTIFIED"
            value={active.length.toString()}
            valueColor={active.length > 5 ? "var(--ft-amber)" : "var(--ft-text)"}
          />
          <SummaryKpiCell
            label="CRITICAL / HIGH"
            value={`${criticalCount} / ${highCount}`}
            valueColor={criticalCount > 0 ? "var(--ft-red)" : highCount > 0 ? "var(--ft-amber)" : "var(--ft-green)"}
          />
        </div>
      </div>

      {/* ── How it works tip ── */}
      {!decisionsIntroSeen && (
        <div
          style={{
            border: "1px solid rgba(210,153,34,0.35)",
            borderLeft: "3px solid var(--ft-amber)",
            background: "rgba(210,153,34,0.04)",
            padding: "12px 14px",
            marginBottom: 16,
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-amber)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 7 }}>◈ How the Decision Engine works</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", lineHeight: 1.65 }}>
              <div>Reads across all your data — accounts, investments, goals, subscriptions, budgets &amp; debts — to surface specific, ranked actions.</div>
              <div><span style={{ color: "var(--ft-red)", fontWeight: 600 }}>CRITICAL</span> = time-sensitive or high opportunity cost &nbsp;·&nbsp; <span style={{ color: "var(--ft-amber)", fontWeight: 600 }}>HIGH</span> = significant impact &nbsp;·&nbsp; <span style={{ color: "var(--ft-blue)", fontWeight: 600 }}>MEDIUM</span> = worth doing</div>
              <div><span style={{ color: "var(--ft-accent)", fontWeight: 600 }}>Annual cost</span> is the estimated money left on the table per year if you don't act (e.g. idle cash missing out on 4.5% interest).</div>
              <div>Dismiss any item you've already acted on — it won't reappear unless conditions change. The engine re-evaluates every page load.</div>
            </div>
          </div>
          <button
            onClick={() => { localStorage.setItem("ft-decisions-intro-seen","1"); setDecisionsIntroSeen(true); }}
            title="Dismiss"
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", background: "transparent", border: "none", cursor: "pointer", padding: "0 4px", flexShrink: 0, lineHeight: 1 }}
          >✕</button>
        </div>
      )}

      {/* ── Decision list ── */}
      {active.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", borderLeft: "3px solid var(--ft-accent)", paddingLeft: 8, marginBottom: 8 }}>
            Actions · {active.length}
          </div>
        </div>
      )}
      {active.length === 0 ? (
        <div
          style={{
            border: "1px solid var(--ft-border)",
            borderLeft: "3px solid var(--ft-green)",
            background: "var(--ft-surface)",
            padding: "40px 32px",
            fontFamily: "var(--font-mono)",
          }}
        >
          <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-green)", fontWeight: 700, marginBottom: 6 }}>
            ALL CLEAR
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ft-text)", marginBottom: 6 }}>
            No active recommendations.
          </div>
          <div style={{ color: "var(--ft-dim)", fontSize: 10, lineHeight: 1.7, maxWidth: 420 }}>
            The engine scans your accounts, portfolio, goals, subscriptions, budgets, and debts every page load. Check back after your next transaction or when market conditions change.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {active.map((d) => (
            <DecisionRow key={d.id} decision={d} onDismiss={() => dismiss(d.id)} />
          ))}
        </div>
      )}

      {/* ── Dismissed ── */}
      {showDismissed && dismissedList.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--ft-dim)",
              letterSpacing: "0.08em",
              marginBottom: 8,
              borderLeft: "3px solid var(--ft-border2)",
              paddingLeft: 8,
            } as React.CSSProperties}
          >
            DISMISSED
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {dismissedList.map((d) => (
              <DecisionRow key={d.id} decision={d} dismissed onRestore={() => restore(d.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
