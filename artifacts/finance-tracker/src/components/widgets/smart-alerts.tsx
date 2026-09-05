import { useState, useEffect, useMemo } from "react";
import { useGetDashboard, useListTransactions, useListUpcoming, useListDebts, useListGoals, useListBudgets } from "@workspace/api-client-react";
import { formatBaseMoney } from "@/lib/utils";
import { PanelHeader } from "@/components/primitives";

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
  success: "OK  ",
};

const LEVEL_ICON: Record<Alert["level"], string> = {
  info: "ℹ",
  warn: "⚠",
  critical: "✕",
  success: "✓",
};

const LEVEL_ORDER: Alert["level"][] = ["critical", "warn", "info", "success"];

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

// ─── Sub-components ───────────────────────────────────────────────────────────

type AlertCountChipProps = {
  count: number;
  level: Alert["level"];
  label: string;
};

function AlertCountChip({ count, level, label }: AlertCountChipProps) {
  const color = LEVEL_COLOR[level];
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

function AlertRow({ alert, onDismiss }: { alert: Alert; onDismiss: (id: string) => void }) {
  const [hov, setHov] = useState(false);
  const color = LEVEL_COLOR[alert.level];

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "start",
        gap: "10px",
        background: hov
          ? `color-mix(in srgb, ${color} 8%, var(--ft-raised))`
          : `color-mix(in srgb, ${color} 4%, var(--ft-raised))`,
        borderBottom: "1px solid var(--ft-border)",
        padding: "8px 10px",
        fontFamily: "var(--font-mono)",
        transition: "background 0.1s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 1 }}>
        <span style={{ fontSize: 12, color, lineHeight: 1 }}>
          {LEVEL_ICON[alert.level]}
        </span>
        <span style={{
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color,
          background: `color-mix(in srgb, ${color} 15%, transparent)`,
          border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
          padding: "1px 4px",
          lineHeight: "14px",
        }}>
          {LEVEL_LABEL[alert.level].trim()}
        </span>
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ft-text)", marginBottom: 2, lineHeight: 1.3 }}>
          {alert.title}
        </div>
        <div className="pnum" style={{ fontSize: 9, color: "var(--ft-muted)", whiteSpace: "nowrap", letterSpacing: "0.02em" }}>
          {alert.detail}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onDismiss(alert.id)}
        style={{
          background: "none",
          border: "none",
          color: "var(--ft-dim)",
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          padding: "0 2px",
          lineHeight: 1,
          flexShrink: 0,
          opacity: hov ? 0.9 : 0.4,
          transition: "opacity 0.1s",
          paddingTop: 1,
        }}
        aria-label="Dismiss alert"
      >
        ×
      </button>
    </div>
  );
}

// ─── Widget ───────────────────────────────────────────────────────────────────

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
        spent[key] = (spent[key] ?? 0) + (tx.baseEquivalent ?? 0);
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
            detail: `${formatBaseMoney(total)} spent of ${formatBaseMoney(budget.monthlyLimit)} limit (${Math.round(pct * 100)}%)`,
          });
        } else if (pct >= alertRules.budgetWarningPct / 100) {
          result.push({
            id: `budget-warn-${key}`,
            level: "warn",
            title: `${budget.category} budget at ${Math.round(pct * 100)}%`,
            detail: `${formatBaseMoney(total)} of ${formatBaseMoney(budget.monthlyLimit)} used`,
          });
        }
      }
    }

    if (recentTxs) {
      for (const tx of recentTxs) {
        if (tx.baseEquivalent == null) continue;
        if (tx.baseEquivalent > alertRules.largeTxThreshold) {
          result.push({
            id: `large-tx-${tx.id}`,
            level: "info",
            title: `Large transaction: ${tx.description}`,
            detail: `${formatBaseMoney(tx.baseEquivalent)} on ${tx.date} — ${tx.accountName}`,
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
            detail: item.baseEquivalent == null
              ? `Due ${item.dueDate} — GBP not available`
              : `${formatBaseMoney(item.baseEquivalent)} due ${item.dueDate}`,
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
        const total = overdueDebts.reduce((s, d) => s + (d.baseEquivalent ?? 0), 0);
        result.push({
          id: `overdue-debts-${overdueDebts.length}`,
          level: "warn",
          title: `${overdueDebts.length} IOU${overdueDebts.length > 1 ? "s" : ""} older than 90 days`,
          detail: `${formatBaseMoney(total)} in long-outstanding debts — consider settling`,
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
          detail: `${formatBaseMoney(current)} saved — target of ${formatBaseMoney(target)} reached`,
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

    return result.sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level));
  }, [dashboard, monthTxs, recentTxs, upcoming, debts, goals, budgets, alertRules]);

  const visible = useMemo(
    () => alerts.filter((a) => !dismissed.includes(a.id)),
    [alerts, dismissed]
  );

  useEffect(() => {
    saveDismissed(dismissed);
  }, [dismissed]);

  if (visible.length === 0) return null;

  const shown = visible.slice(0, 6);
  const extra = visible.length - shown.length;

  const critCount = visible.filter(a => a.level === "critical").length;
  const warnCount = visible.filter(a => a.level === "warn").length;
  const successCount = visible.filter(a => a.level === "success").length;
  const infoCount = visible.filter(a => a.level === "info").length;

  function dismiss(id: string) {
    setDismissed((prev) => [...prev, id]);
  }

  function dismissAll() {
    setDismissed((prev) => [...prev, ...visible.map(a => a.id)]);
  }

  return (
    <div style={{
      background: "var(--ft-surface)",
      border: "1px solid var(--ft-border)",
    }}>
      <PanelHeader
        right={
          <button
            onClick={dismissAll}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              letterSpacing: "0.06em",
              padding: "2px 6px",
              background: "transparent",
              color: "var(--ft-dim)",
              border: "1px solid var(--ft-border2)",
              cursor: "pointer",
            }}
          >
            DISMISS ALL
          </button>
        }
      >
        Smart Alerts
        <div style={{ display: "flex", gap: 3 }}>
          {critCount > 0 && <AlertCountChip count={critCount} level="critical" label="CRIT" />}
          {warnCount > 0 && <AlertCountChip count={warnCount} level="warn" label="WARN" />}
          {infoCount > 0 && <AlertCountChip count={infoCount} level="info" label="INFO" />}
          {successCount > 0 && <AlertCountChip count={successCount} level="success" label="OK" />}
        </div>
      </PanelHeader>

      {/* Alert rows */}
      {shown.map((alert) => (
        <AlertRow key={alert.id} alert={alert} onDismiss={dismiss} />
      ))}

      {extra > 0 && (
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--ft-dim)",
          padding: "6px 14px",
          background: "var(--ft-raised)",
          letterSpacing: "0.04em",
        }}>
          +{extra} more alert{extra > 1 ? "s" : ""} — dismiss above to reveal
        </div>
      )}
    </div>
  );
}

export default SmartAlertsWidget;
