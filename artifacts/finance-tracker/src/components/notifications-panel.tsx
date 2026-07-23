import { useState, useEffect, useMemo, useCallback } from "react";
import {
  useGetDashboard,
  useListTransactions,
  useListUpcoming,
  useListDebts,
  useListGoals,
  useListBudgets,
} from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";

export interface Alert {
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

const LEVEL_ORDER: Alert["level"][] = ["critical", "warn", "info", "success"];

export function loadDismissed(): string[] {
  try {
    const raw = sessionStorage.getItem("ft-dismissed-alerts");
    if (raw) return JSON.parse(raw) as string[];
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
    return { ...defaults, ...(JSON.parse(raw) as Partial<typeof defaults>) };
  } catch {
    return defaults;
  }
}

export function useAlerts() {
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
      const overdueDebts = debts.filter((d) => {
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
          detail: `${formatGbp(current)} saved — target of ${formatGbp(target)} reached`,
        });
      }
    }

    const savingsRate = (
      dashboard as { thisMonth?: { savingsRate?: number } } | undefined
    )?.thisMonth?.savingsRate;
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

  return alerts;
}

interface NotificationsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationsPanel({ open, onClose }: NotificationsPanelProps) {
  const [dismissed, setDismissed] = useState<string[]>(() => loadDismissed());
  const alerts = useAlerts();

  // Sync dismissed state with sessionStorage when it changes
  useEffect(() => {
    saveDismissed(dismissed);
  }, [dismissed]);

  // Also re-read dismissed on open so it stays in sync with the widget
  useEffect(() => {
    if (open) {
      setDismissed(loadDismissed());
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = [...prev, id];
      saveDismissed(next);
      return next;
    });
  }, []);

  const visible = useMemo(
    () => alerts.filter((a) => !dismissed.includes(a.id)),
    [alerts, dismissed]
  );

  // Group by level in order: critical → warn → info → success
  const grouped = useMemo(() => {
    const groups: Partial<Record<Alert["level"], Alert[]>> = {};
    for (const level of LEVEL_ORDER) {
      const items = visible.filter((a) => a.level === level);
      if (items.length > 0) groups[level] = items;
    }
    return groups;
  }, [visible]);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          top: 48,
          zIndex: 199,
          background: "transparent",
          pointerEvents: open ? "auto" : "none",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 48,
          right: 0,
          width: 340,
          height: "calc(100vh - 48px)",
          zIndex: 200,
          background: "var(--ft-surface)",
          borderLeft: "1px solid var(--ft-border)",
          display: "flex",
          flexDirection: "column",
          fontFamily: "var(--font-mono)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Panel header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 14px",
            height: 40,
            borderBottom: "1px solid var(--ft-border)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              color: "var(--ft-text)",
              letterSpacing: "0.1em",
            }}
          >
            ALERTS
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {visible.length > 0 && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--ft-dim)",
                  letterSpacing: "0.06em",
                }}
              >
                {visible.length} ACTIVE
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close alerts panel"
              style={{
                background: "none",
                border: "none",
                color: "var(--ft-dim)",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 16,
                padding: "0 2px",
                lineHeight: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Alert list */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 0",
          }}
        >
          {visible.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                gap: 8,
                color: "var(--ft-dim)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.06em",
              }}
            >
              <span style={{ fontSize: 22, opacity: 0.4 }}>○</span>
              <span>NO ALERTS</span>
            </div>
          ) : (
            LEVEL_ORDER.map((level) => {
              const items = grouped[level];
              if (!items) return null;
              return (
                <div key={level} style={{ marginBottom: 8 }}>
                  {/* Group label */}
                  <div
                    style={{
                      padding: "4px 14px 4px",
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      color: LEVEL_COLOR[level],
                      letterSpacing: "0.12em",
                      fontWeight: 700,
                    }}
                  >
                    {LEVEL_LABEL[level]}
                  </div>
                  {/* Alert rows */}
                  {items.map((alert) => {
                    const color = LEVEL_COLOR[alert.level];
                    return (
                      <div
                        key={alert.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          background: "var(--ft-raised)",
                          borderLeft: `3px solid ${color}`,
                          borderBottom: "1px solid var(--ft-border)",
                          padding: "8px 12px 8px 10px",
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          lineHeight: "1.4",
                          marginBottom: 1,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              color: "var(--ft-text)",
                              fontWeight: 600,
                              marginBottom: 2,
                              lineHeight: "1.3",
                            }}
                          >
                            {alert.title}
                          </div>
                          <div
                            style={{
                              color: "var(--ft-muted)",
                              fontSize: 10,
                              lineHeight: "1.4",
                            }}
                          >
                            {alert.detail}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => dismiss(alert.id)}
                          aria-label="Dismiss alert"
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--ft-dim)",
                            cursor: "pointer",
                            fontFamily: "var(--font-mono)",
                            fontSize: 15,
                            padding: "0 2px",
                            lineHeight: 1,
                            flexShrink: 0,
                            marginTop: 1,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "var(--ft-text)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "var(--ft-dim)";
                          }}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {visible.length > 0 && (
          <div
            style={{
              borderTop: "1px solid var(--ft-border)",
              padding: "8px 14px",
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={() => {
                const allIds = alerts.map((a) => a.id);
                setDismissed((prev) => {
                  const next = Array.from(new Set([...prev, ...allIds]));
                  saveDismissed(next);
                  return next;
                });
              }}
              style={{
                background: "none",
                border: "1px solid var(--ft-border)",
                color: "var(--ft-dim)",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                padding: "4px 10px",
                borderRadius: 4,
                letterSpacing: "0.08em",
                width: "100%",
                transition: "all 0.1s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--ft-muted)";
                e.currentTarget.style.borderColor = "var(--ft-border2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--ft-dim)";
                e.currentTarget.style.borderColor = "var(--ft-border)";
              }}
            >
              DISMISS ALL
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export default NotificationsPanel;
