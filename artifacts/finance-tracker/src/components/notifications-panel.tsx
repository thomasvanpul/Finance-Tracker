import { useState, useEffect, useMemo, useCallback } from "react";
import {
  useGetDashboard,
  useListTransactions,
  useListUpcoming,
  useListDebts,
  useListGoals,
  useListBudgets,
  useListAccounts,
} from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { loadPersonaIds, PERSONAS, PERSONA_COLORS, PERSONA_GLYPHS, PERSONA_FOCUS } from "@/lib/persona";

const BALANCE_ALERTS_KEY = "ft-balance-alerts";

interface BalanceAlertRule {
  accountId: number;
  accountName: string;
  threshold: number; // GBP
  level: "warn" | "critical";
}

export function loadBalanceAlertRules(): BalanceAlertRule[] {
  try {
    const raw = localStorage.getItem(BALANCE_ALERTS_KEY);
    return raw ? (JSON.parse(raw) as BalanceAlertRule[]) : [];
  } catch {
    return [];
  }
}

export function saveBalanceAlertRules(rules: BalanceAlertRule[]): void {
  try {
    localStorage.setItem(BALANCE_ALERTS_KEY, JSON.stringify(rules));
  } catch {}
}

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
  const { data: allTxs } = useListTransactions({});
  const { data: upcoming } = useListUpcoming();
  const { data: debts } = useListDebts();
  const { data: goals = [] } = useListGoals();
  const { data: budgets = [] } = useListBudgets();
  const { data: accounts } = useListAccounts();

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

    // Anomaly detection: merchants charging more than their historical average
    if (allTxs && allTxs.length > 10) {
      const now = new Date();
      const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      // Group expense transactions by merchant (description)
      const byMerchant: Record<string, { amounts: number[]; thisMonthAmt: number | null }> = {};

      for (const tx of allTxs) {
        if (tx.type !== "expense") continue;
        const txMonth = tx.date.slice(0, 7);
        const key = tx.description.toLowerCase().trim();
        if (!byMerchant[key]) byMerchant[key] = { amounts: [], thisMonthAmt: null };

        if (txMonth === thisMonthStr) {
          byMerchant[key].thisMonthAmt = (byMerchant[key].thisMonthAmt ?? 0) + tx.gbpValue;
        } else {
          byMerchant[key].amounts.push(tx.gbpValue);
        }
      }

      let anomalyCount = 0;
      for (const [merchant, data] of Object.entries(byMerchant)) {
        if (anomalyCount >= 3) break;
        const { amounts, thisMonthAmt } = data;
        if (thisMonthAmt === null || amounts.length < 2) continue; // need history

        const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
        const diff = thisMonthAmt - avg;

        // Flag if current month is > 50% more than average AND difference > £10
        if (diff > 10 && thisMonthAmt > avg * 1.5) {
          const displayName = merchant.length > 30 ? merchant.slice(0, 30) + "…" : merchant;
          result.push({
            id: `anomaly-${merchant}`,
            level: "warn" as const,
            title: `Unusual charge: ${displayName}`,
            detail: `${formatGbp(thisMonthAmt)} this month vs avg ${formatGbp(avg)} (${Math.round((diff / avg) * 100)}% higher)`,
          });
          anomalyCount++;
        }
      }
    }

    // Account balance alerts
    const balanceRules = loadBalanceAlertRules();
    if (balanceRules.length > 0 && accounts) {
      for (const rule of balanceRules) {
        const acct = accounts.find((a) => a.id === rule.accountId);
        if (!acct) continue;
        const balance = acct.gbpEquivalent ?? 0;
        if (balance < rule.threshold) {
          result.push({
            id: `balance-alert-${rule.accountId}`,
            level: rule.level,
            title: `Low balance: ${rule.accountName}`,
            detail: `${formatGbp(balance)} — below your ${formatGbp(rule.threshold)} threshold`,
          });
        }
      }
    }

    return result;
  }, [dashboard, monthTxs, recentTxs, allTxs, upcoming, debts, goals, budgets, alertRules, accounts]);

  return alerts;
}

interface NotificationsPanelProps {
  open: boolean;
  onClose: () => void;
}

interface AlertRowProps {
  alert: Alert;
  onDismiss: (id: string) => void;
}

function AlertRow({ alert, onDismiss }: AlertRowProps) {
  const [hov, setHov] = useState(false);
  const color = LEVEL_COLOR[alert.level];
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        background: hov ? `color-mix(in srgb, ${color} 6%, var(--ft-raised))` : "var(--ft-raised)",
        borderLeft: `3px solid ${color}`,
        borderBottom: "1px solid var(--ft-border)",
        padding: "8px 12px 8px 10px",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        lineHeight: "1.4",
        marginBottom: 1,
        transition: "background 0.1s",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "var(--ft-text)", fontWeight: 600, marginBottom: 2, lineHeight: "1.3" }}>
          {alert.title}
        </div>
        <div style={{ color: "var(--ft-muted)", fontSize: 10, lineHeight: "1.4" }}>
          {alert.detail}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(alert.id)}
        aria-label="Dismiss alert"
        style={{
          background: "none", border: "none",
          color: "var(--ft-dim)", cursor: "pointer",
          fontFamily: "var(--font-mono)", fontSize: 15,
          padding: "0 2px", lineHeight: 1, flexShrink: 0, marginTop: 1,
          transition: "color 0.1s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ft-text)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ft-dim)"; }}
      >
        ×
      </button>
    </div>
  );
}

export function NotificationsPanel({ open, onClose }: NotificationsPanelProps) {
  const [dismissed, setDismissed] = useState<string[]>(() => loadDismissed());
  const alerts = useAlerts();
  const { data: accounts } = useListAccounts();

  const primaryPersona = useMemo(() => {
    const ids = loadPersonaIds();
    return ids.length > 0 ? PERSONAS.find((p) => p.id === ids[0]) ?? null : null;
  }, []);

  // Balance alerts config state
  const [balanceRules, setBalanceRules] = useState<BalanceAlertRule[]>(() =>
    loadBalanceAlertRules()
  );
  const [configOpen, setConfigOpen] = useState(false);
  const [newAccountId, setNewAccountId] = useState<string>("");
  const [newThreshold, setNewThreshold] = useState<string>("");
  const [newLevel, setNewLevel] = useState<"warn" | "critical">("warn");

  const addBalanceRule = useCallback(() => {
    const accountId = parseInt(newAccountId, 10);
    const threshold = parseFloat(newThreshold);
    if (!accountId || isNaN(threshold) || threshold <= 0 || !accounts) return;
    const acct = accounts.find((a) => a.id === accountId);
    if (!acct) return;
    const updated = [
      ...balanceRules.filter((r) => r.accountId !== accountId),
      { accountId, accountName: acct.name, threshold, level: newLevel },
    ];
    setBalanceRules(updated);
    saveBalanceAlertRules(updated);
    setNewAccountId("");
    setNewThreshold("");
    setNewLevel("warn");
  }, [newAccountId, newThreshold, newLevel, accounts, balanceRules]);

  const deleteBalanceRule = useCallback(
    (accountId: number) => {
      const updated = balanceRules.filter((r) => r.accountId !== accountId);
      setBalanceRules(updated);
      saveBalanceAlertRules(updated);
    },
    [balanceRules]
  );

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
          transition: "transform 0.12s ease",
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
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {primaryPersona && primaryPersona.id !== "full" && (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 9,
                color: PERSONA_COLORS[primaryPersona.id],
                fontWeight: 700, lineHeight: 1,
              }}>
                {PERSONA_GLYPHS[primaryPersona.id]}
              </span>
            )}
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
          </div>
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
          {/* Persona context strip */}
          {primaryPersona && primaryPersona.id !== "full" && (
            <div
              style={{
                margin: "0 0 8px",
                borderLeft: `3px solid ${PERSONA_COLORS[primaryPersona.id]}`,
                borderBottom: "1px solid var(--ft-border)",
                background: `${PERSONA_COLORS[primaryPersona.id]}08`,
                padding: "6px 12px 6px 10px",
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: "var(--font-mono)", fontSize: 8,
                color: PERSONA_COLORS[primaryPersona.id],
                letterSpacing: "0.1em", fontWeight: 700,
              }}>
                <span>{PERSONA_GLYPHS[primaryPersona.id]}</span>
                <span>{primaryPersona.code} — {primaryPersona.label.toUpperCase()}</span>
              </div>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 9,
                color: "var(--ft-dim)", lineHeight: "1.5",
              }}>
                {PERSONA_FOCUS[primaryPersona.id]}
              </div>
            </div>
          )}
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
                  {items.map((alert) => (
                    <AlertRow key={alert.id} alert={alert} onDismiss={dismiss} />
                  ))}
                </div>
              );
            })
          )}
        </div>

        {/* Balance Alerts Configuration */}
        <div
          style={{
            borderTop: "1px solid var(--ft-border)",
            flexShrink: 0,
          }}
        >
          {/* Toggle header */}
          <button
            type="button"
            onClick={() => setConfigOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "8px 14px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--ft-dim)",
              letterSpacing: "0.1em",
              fontWeight: 700,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--ft-muted)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--ft-dim)";
            }}
          >
            <span>BALANCE ALERTS</span>
            <span style={{ fontSize: 11, fontWeight: 400 }}>
              {configOpen ? "▲" : "▼"}
            </span>
          </button>

          {configOpen && (
            <div
              style={{
                borderTop: "1px solid var(--ft-border)",
                background: "var(--ft-raised)",
              }}
            >
              {/* Existing rules */}
              {balanceRules.length === 0 ? (
                <div
                  style={{
                    padding: "8px 14px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--ft-dim)",
                    letterSpacing: "0.06em",
                  }}
                >
                  NO RULES CONFIGURED
                </div>
              ) : (
                balanceRules.map((rule) => (
                  <div
                    key={rule.accountId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 12px",
                      borderBottom: "1px solid var(--ft-border)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 8,
                          color:
                            rule.level === "critical"
                              ? "var(--ft-red)"
                              : "var(--ft-amber)",
                          letterSpacing: "0.08em",
                          flexShrink: 0,
                        }}
                      >
                        {rule.level === "critical" ? "CRIT" : "WARN"}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          color: "var(--ft-text)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {rule.accountName} &lt; {formatGbp(rule.threshold)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteBalanceRule(rule.accountId)}
                      aria-label={`Remove balance alert for ${rule.accountName}`}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 13,
                        color: "var(--ft-dim)",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: "0 2px",
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--ft-red)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--ft-dim)";
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}

              {/* Add rule form */}
              <div
                style={{
                  padding: "8px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    color: "var(--ft-dim)",
                    letterSpacing: "0.1em",
                    marginBottom: 2,
                  }}
                >
                  ADD RULE
                </div>
                {/* Account selector */}
                <select
                  value={newAccountId}
                  onChange={(e) => setNewAccountId(e.target.value)}
                  aria-label="Select account"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--ft-text)",
                    background: "var(--ft-surface)",
                    border: "1px solid var(--ft-border)",
                    borderRadius: 3,
                    padding: "4px 6px",
                    width: "100%",
                    cursor: "pointer",
                  }}
                >
                  <option value="">— select account —</option>
                  {(accounts ?? []).map((a) => (
                    <option key={a.id} value={String(a.id)}>
                      {a.name} ({formatGbp(a.gbpEquivalent)})
                    </option>
                  ))}
                </select>

                {/* Threshold + level row */}
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="number"
                    value={newThreshold}
                    onChange={(e) => setNewThreshold(e.target.value)}
                    placeholder="Min £"
                    aria-label="Minimum balance threshold in GBP"
                    min="0"
                    step="1"
                    style={{
                      flex: 1,
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--ft-text)",
                      background: "var(--ft-surface)",
                      border: "1px solid var(--ft-border)",
                      borderRadius: 3,
                      padding: "4px 6px",
                    }}
                  />
                  <select
                    value={newLevel}
                    onChange={(e) =>
                      setNewLevel(e.target.value as "warn" | "critical")
                    }
                    aria-label="Alert severity"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--ft-text)",
                      background: "var(--ft-surface)",
                      border: "1px solid var(--ft-border)",
                      borderRadius: 3,
                      padding: "4px 6px",
                      cursor: "pointer",
                    }}
                  >
                    <option value="warn">WARN</option>
                    <option value="critical">CRIT</option>
                  </select>
                </div>

                {/* Add button */}
                <button
                  type="button"
                  onClick={addBalanceRule}
                  disabled={!newAccountId || !newThreshold}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color:
                      !newAccountId || !newThreshold
                        ? "var(--ft-dim)"
                        : "var(--ft-accent)",
                    background: "transparent",
                    border: "1px solid var(--ft-border)",
                    borderRadius: 3,
                    padding: "5px 10px",
                    cursor:
                      !newAccountId || !newThreshold
                        ? "not-allowed"
                        : "pointer",
                    letterSpacing: "0.08em",
                    transition: "all 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (!newAccountId || !newThreshold) return;
                    e.currentTarget.style.borderColor = "var(--ft-accent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--ft-border)";
                  }}
                >
                  + ADD
                </button>
              </div>
            </div>
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
