import { useState, useEffect } from "react";
import { useListTransactions } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";

interface Budget {
  category: string;
  limit: number;
}

function loadBudgets(): Budget[] {
  try {
    const raw = localStorage.getItem("ft-budgets");
    if (raw) return JSON.parse(raw) as Budget[];
  } catch {}
  return [];
}

type ForecastStatus = "ON TRACK" | "AT RISK" | "OVER";

function getStatusColor(status: ForecastStatus): string {
  if (status === "ON TRACK") return "var(--ft-green)";
  if (status === "AT RISK") return "var(--ft-amber)";
  return "var(--ft-red)";
}

function getStatusBg(status: ForecastStatus): string {
  if (status === "ON TRACK") return "rgba(63,185,80,0.12)";
  if (status === "AT RISK") return "rgba(240,160,48,0.12)";
  return "rgba(248,81,73,0.12)";
}

function calcStatus(projected: number, limit: number): ForecastStatus {
  if (projected > limit) return "OVER";
  if (projected > limit * 0.8) return "AT RISK";
  return "ON TRACK";
}

export function SpendingForecastWidget({ isExpanded }: { isExpanded?: boolean }) {
  const [budgets, setBudgets] = useState<Budget[]>([]);

  useEffect(() => {
    setBudgets(loadBudgets());
  }, []);

  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const today = now.toISOString().slice(0, 10);

  const { data: txs, isLoading } = useListTransactions({ dateFrom: thisMonthStart, dateTo: today });

  const expenses = (txs ?? []).filter((tx) => tx.type === "expense");

  const totalSpentSoFar = expenses.reduce((s, tx) => s + tx.gbpValue, 0);
  const dailyRate = dayOfMonth > 0 ? totalSpentSoFar / dayOfMonth : 0;
  const projectedTotal = dailyRate * daysInMonth;

  const totalBudget = budgets.reduce((s, b) => s + b.limit, 0);
  const hasBudgets = budgets.length > 0;

  // Category totals
  const catSpent = expenses.reduce<Record<string, number>>((acc, tx) => {
    const cat = tx.category || "Other";
    acc[cat] = (acc[cat] ?? 0) + tx.gbpValue;
    return acc;
  }, {});

  // Build rows for categories that appear in either txs or budgets
  const catKeys = Array.from(new Set([
    ...Object.keys(catSpent),
    ...budgets.map((b) => b.category),
  ]));

  interface CatRow {
    category: string;
    spent: number;
    projected: number;
    budget: number | null;
    status: ForecastStatus | null;
  }

  const catRows: CatRow[] = catKeys.map((cat) => {
    const spent = catSpent[cat] ?? 0;
    const projectedCat = dayOfMonth > 0 ? (spent / dayOfMonth) * daysInMonth : 0;
    const budget = budgets.find((b) => b.category.toLowerCase() === cat.toLowerCase());
    const status = budget ? calcStatus(projectedCat, budget.limit) : null;
    return { category: cat, spent, projected: projectedCat, budget: budget ? budget.limit : null, status };
  }).sort((a, b) => b.spent - a.spent);

  const overallStatus = hasBudgets && totalBudget > 0 ? calcStatus(projectedTotal, totalBudget) : null;

  return (
    <WidgetShell
      title="Spending Forecast"
      href="/transactions"
      linkLabel="→ Transactions"
      isLoading={isLoading}
      accent="var(--ft-amber)"
    >
      {!isLoading && (
        <div style={{ padding: "10px 12px 12px" }}>
          {/* Day indicator */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
                Day {dayOfMonth}/{daysInMonth}
              </span>
              <div style={{ width: 80, height: 3, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(dayOfMonth / daysInMonth) * 100}%`, background: "var(--ft-amber)", borderRadius: 2 }} />
              </div>
            </div>
            {overallStatus && (
              <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 2, background: getStatusBg(overallStatus), color: getStatusColor(overallStatus), fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                {overallStatus}
              </span>
            )}
          </div>

          {/* Overall projection */}
          <div style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "8px 10px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                Projected Month-End
              </span>
              <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-amber)" }}>
                {formatGbp(projectedTotal)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>Spent so far</span>
              <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)" }}>{formatGbp(totalSpentSoFar)}</span>
            </div>
            {hasBudgets && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>Total budget</span>
                <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)" }}>{formatGbp(totalBudget)}</span>
              </div>
            )}
          </div>

          {/* Category rows */}
          {isExpanded ? (
            /* Expanded: show all columns */
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px 70px", gap: 6, marginBottom: 4 }}>
                {["Category", "Spent", "Forecast", "Budget", "Status"].map((h) => (
                  <div key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em", textAlign: h === "Category" ? "left" : "right" }}>
                    {h}
                  </div>
                ))}
              </div>
              {catRows.map((row) => (
                <div key={row.category} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px 70px", gap: 6, padding: "5px 0", borderBottom: "1px solid var(--ft-border)" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.category}
                  </div>
                  <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", textAlign: "right" }}>{formatGbp(row.spent)}</div>
                  <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-amber)", textAlign: "right" }}>{formatGbp(row.projected)}</div>
                  <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: row.budget ? "var(--ft-muted)" : "var(--ft-border2)", textAlign: "right" }}>
                    {row.budget ? formatGbp(row.budget) : "—"}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    {row.status ? (
                      <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 2, background: getStatusBg(row.status), color: getStatusColor(row.status), fontFamily: "var(--font-mono)", letterSpacing: "0.03em", whiteSpace: "nowrap" }}>
                        {row.status}
                      </span>
                    ) : (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-border2)" }}>—</span>
                    )}
                  </div>
                </div>
              ))}
            </>
          ) : (
            /* Compact: category + projected + status chip */
            <>
              {catRows.slice(0, 5).map((row) => {
                const budgetPct = row.budget ? Math.min((row.projected / row.budget) * 100, 100) : null;
                const barColor = row.status === "OVER" ? "var(--ft-red)" : row.status === "AT RISK" ? "var(--ft-amber)" : "var(--ft-green)";
                return (
                  <div key={row.category} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
                        {row.category}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)" }}>{formatGbp(row.projected)}</span>
                        {row.status && (
                          <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 2, background: getStatusBg(row.status), color: getStatusColor(row.status), fontFamily: "var(--font-mono)", letterSpacing: "0.03em" }}>
                            {row.status}
                          </span>
                        )}
                      </div>
                    </div>
                    {budgetPct !== null && (
                      <div style={{ height: 3, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${budgetPct}%`, background: barColor, borderRadius: 2, transition: "width 0.4s ease" }} />
                      </div>
                    )}
                  </div>
                );
              })}
              {catRows.length === 0 && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center", padding: "16px 0" }}>
                  No expenses this month yet
                </div>
              )}
            </>
          )}
        </div>
      )}
    </WidgetShell>
  );
}
