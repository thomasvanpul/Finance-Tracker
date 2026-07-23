import { useState, useEffect, useMemo } from "react";
import { useGetDashboard, useListTransactions, useListUpcoming, useListDebts, useListGoals, useListBudgets } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";

interface Alert {
  id: string;
  level: "info" | "warn" | "critical" | "success";
  title: string;
  detail: string;
}

const LEVEL_COLOR: Record<Alert["level"], string> = {
  info: "var(--ft-accent)",
  warn: "var(--ft-amber)",
  critical: "var(--ft-red)",
  success: "var(--ft-green)",
};

const LEVEL_LABEL: Record<Alert["level"], string> = {
  info: "INFO",
  warn: "WARN",
  critical: "CRIT",
  success: "OK",
};

function loadDismissed(): string[] {
  try {
    const raw = sessionStorage.getItem("ft-dismissed-alerts");
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveDismissed(ids: string[]): void {
  try {
    sessionStorage.setItem("ft-dismissed-alerts", JSON.stringify(ids));
  } catch {}
}

function getMonthDateFrom(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function getLast7DaysFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function loadAlertRules() {
  const defaults = { largeTxThreshold: 500, budgetWarningPct: 80 };
  try {
    const raw = localStorage.getItem("nr-alert-rules");
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch { return defaults; }
}

export function SmartAlertsWidget() {
  const [dismissed, setDismissed] = useState<string[]>(() => loadDismissed());
  const alertRules = useMemo(() => loadAlertRules(), []);

  const dateFrom = useMemo(() => getMonthDateFrom(), []);
  const sevenDaysAgo = useMemo(() => getLast7DaysFrom(), []);

  const { data: dashboard } = useGetDashboard();
  const { data: monthTxs } = useListTransactions({ type: "expense", dateFrom });
  const { data: recentTxs } = useListTransactions({ dateFrom: sevenDaysAgo });
  const { data: upcoming } = useListUpcoming();
  const { data: debts } = useListDebts();
  const { data: goals = [] } = useListGoals();
  const { data: budgets = [] } = useListBudgets();

  const alerts = useMemo<Alert[]>(() => {
    const result: Alert[] = [];

    if (budgets.length > 0 && monthTxs) {
      const spent: Record<string, number> = {};
      for (const tx of monthTxs) {
        const key = tx.category.toLowerCase();
        spent[key] = (spent[key] ?? 0) + tx.gbpValue;
      }
      for (const budget of budgets) {
        const key = budget.category.toLowerCase();
        const total = spent[key] ?? 0;
        const pct = total / budget.monthlyLimit;
        if (pct >= 1) {
          result.push({
            id: `budget-critical-${key}`,
            level: "critical",
            title: `${budget.category} budget exceeded`,
            detail: `${formatGbp(total)} spent of ${formatGbp(budget.monthlyLimit)} limit (${Math.round(pct * 100)}%)`,
          });
        } else if (pct >= alertRules.budgetWarningPct / 100) {
          result.push({
            id: `budget-warn-${key}`,
            level: "warn",
            title: `${budget.category} budget at ${Math.round(pct * 100)}%`,
            detail: `${formatGbp(total)} of ${formatGbp(budget.monthlyLimit)} used`,
          });
        }
      }
    }

    if (recentTxs) {
      for (const tx of recentTxs) {
        if (tx.gbpValue > alertRules.largeTxThreshold) {
          result.push({
            id: `large-tx-${tx.id}`,
            level: "info",
            title: `Large transaction: ${tx.description}`,
            detail: `${formatGbp(tx.gbpValue)} on ${tx.date} — ${tx.accountName}`,
          });
        }
      }
    }

    if (upcoming) {
      const now = new Date();
      const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      for (const item of upcoming) {
        if (item.status === "paid") continue;
        const due = new Date(item.dueDate);
        if (due <= in3Days && due >= now) {
          result.push({
            id: `upcoming-${item.id}`,
            level: "warn",
            title: `Due soon: ${item.description}`,
            detail: `${formatGbp(item.gbpEquivalent)} due ${item.dueDate}`,
          });
        }
      }
    }

    if (debts) {
      const overdueDebts = debts.filter(d => {
        if (d.status !== "pending") return false;
        const created = new Date(d.createdAt);
        const daysSince = (Date.now() - created.getTime()) / 86400000;
        return daysSince > 90;
      });
      if (overdueDebts.length > 0) {
        const total = overdueDebts.reduce((s, d) => s + d.gbpEquivalent, 0);
        result.push({
          id: `overdue-debts-${overdueDebts.length}`,
          level: "warn",
          title: `${overdueDebts.length} IOU${overdueDebts.length > 1 ? "s" : ""} older than 90 days`,
          detail: `${formatGbp(total)} in long-outstanding debts — consider settling`,
        });
      }
    }

    for (const g of goals) {
      const current = parseFloat(String(g.current));
      const target = parseFloat(String(g.target));
      if (current >= target) {
        result.push({
          id: `goal-achieved-${g.id}`,
          level: "success",
          title: `Goal achieved: ${g.name}`,
          detail: `${formatGbp(current)} saved — target of ${formatGbp(target)} reached 🎉`,
        });
      }
    }

    const savingsRate = (dashboard as { thisMonth?: { savingsRate?: number } } | undefined)
      ?.thisMonth?.savingsRate;
    if (typeof savingsRate === "number" && savingsRate > 20) {
      result.push({
        id: "savings-positive",
        level: "success",
        title: "Savings on track",
        detail: `${Math.round(savingsRate)}% savings rate this month — great work`,
      });
    }

    return result;
  }, [dashboard, monthTxs, recentTxs, upcoming, debts, goals, budgets, alertRules]);

  const visible = useMemo(
    () => alerts.filter((a) => !dismissed.includes(a.id)),
    [alerts, dismissed]
  );

  useEffect(() => {
    saveDismissed(dismissed);
  }, [dismissed]);

  if (visible.length === 0) return null;

  const shown = visible.slice(0, 5);
  const extra = visible.length - shown.length;

  function dismiss(id: string) {
    setDismissed((prev) => [...prev, id]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      {shown.map((alert) => {
        const color = LEVEL_COLOR[alert.level];
        return (
          <div
            key={alert.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: "var(--ft-raised)",
              borderLeft: `3px solid ${color}`,
              padding: "6px 10px",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              lineHeight: "1.4",
              borderRadius: 0,
            }}
          >
            <span
              style={{
                color,
                fontWeight: 700,
                letterSpacing: "0.04em",
                flexShrink: 0,
                minWidth: "32px",
              }}
            >
              {LEVEL_LABEL[alert.level]}
            </span>
            <span
              style={{
                color: "var(--ft-text)",
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {alert.title}
            </span>
            <span
              style={{
                color: "var(--ft-muted)",
                flexGrow: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {alert.detail}
            </span>
            <button
              type="button"
              onClick={() => dismiss(alert.id)}
              style={{
                background: "none",
                border: "none",
                color: "var(--ft-dim)",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: "13px",
                padding: "0 2px",
                lineHeight: 1,
                flexShrink: 0,
              }}
              aria-label="Dismiss alert"
            >
              ×
            </button>
          </div>
        );
      })}
      {extra > 0 && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--ft-dim)",
            padding: "4px 13px",
            background: "var(--ft-raised)",
          }}
        >
          +{extra} more
        </div>
      )}
    </div>
  );
}

export default SmartAlertsWidget;
