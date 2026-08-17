import { useState } from "react";
import { useListTransactions, useListBudgets } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";

// ─── Types & helpers ──────────────────────────────────────────────────────────

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

// ─── Sub-components ───────────────────────────────────────────────────────────

type StatusChipProps = { status: ForecastStatus };
function StatusChip({ status }: StatusChipProps) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        padding: "2px 6px",
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        background: getStatusBg(status),
        color: getStatusColor(status),
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {status}
    </span>
  );
}

// Dual-track progress bar: month elapsed (amber) vs spend consumed (colored)
type DualProgressProps = {
  timeElapsed: number;     // 0–1
  spendElapsed: number;    // 0–1, relative to budget or projected
  budgetColor: string;
};

function DualProgress({ timeElapsed, spendElapsed, budgetColor }: DualProgressProps) {
  const timeWidth = Math.min(timeElapsed * 100, 100);
  const spendWidth = Math.min(spendElapsed * 100, 100);

  return (
    <div style={{ position: "relative", height: 6, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
      {/* Time track (subtle, underneath) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: "100%",
          width: `${timeWidth}%`,
          background: "var(--ft-border)",
          borderRight: "1px solid var(--ft-amber)",
          borderRadius: 0,
        }}
      />
      {/* Spend track (above) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: "100%",
          width: `${spendWidth}%`,
          background: budgetColor,
          borderRadius: 2,
          opacity: 0.85,
          transition: "width 0.12s ease",
        }}
      />
      {/* Time marker (tick at elapsed%) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${timeWidth}%`,
          width: 1,
          background: "var(--ft-amber)",
          transform: "translateX(-50%)",
        }}
      />
    </div>
  );
}

interface CatRow {
  category: string;
  spent: number;
  projected: number;
  budget: number | null;
  status: ForecastStatus | null;
}

type CategoryForecastRowExpandedProps = {
  row: CatRow;
};

function CategoryForecastRowExpanded({ row }: CategoryForecastRowExpandedProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 72px 72px 72px 64px",
        gap: 6,
        padding: "5px 4px",
        borderBottom: "1px solid var(--ft-border)",
        alignItems: "center",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--ft-text)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {row.category}
      </div>
      <div
        className="pnum"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--ft-muted)",
          textAlign: "right",
        }}
      >
        {formatGbp(row.spent)}
      </div>
      <div
        className="pnum"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--ft-amber)",
          textAlign: "right",
        }}
      >
        {formatGbp(row.projected)}
      </div>
      <div
        className="pnum"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: row.budget ? "var(--ft-muted)" : "var(--ft-dim)",
          textAlign: "right",
        }}
      >
        {row.budget ? formatGbp(row.budget) : "—"}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        {row.status ? (
          <StatusChip status={row.status} />
        ) : (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--ft-dim)",
            }}
          >
            —
          </span>
        )}
      </div>
    </div>
  );
}

type CategoryForecastRowCompactProps = {
  row: CatRow;
  timeElapsed: number;
};

function CategoryForecastRowCompact({ row, timeElapsed }: CategoryForecastRowCompactProps) {
  const [hov, setHov] = useState(false);
  const budgetPct =
    row.budget
      ? Math.min((row.projected / row.budget) * 100, 100)
      : null;
  const barColor =
    row.status === "OVER"
      ? "var(--ft-red)"
      : row.status === "AT RISK"
        ? "var(--ft-amber)"
        : "var(--ft-green)";

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        marginBottom: 9,
        padding: "3px 4px",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 3,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ft-text)",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}
        >
          {row.category}
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            flexShrink: 0,
          }}
        >
          <span
            className="pnum"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ft-muted)",
            }}
          >
            {formatGbp(row.projected)}
          </span>
          {row.budget && (
            <span
              className="pnum"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--ft-dim)",
              }}
            >
              /{formatGbp(row.budget)}
            </span>
          )}
          {row.budget && budgetPct !== null && (
            <span
              className="pnum"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                color: barColor,
                background: `color-mix(in srgb, ${barColor} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${barColor} 30%, transparent)`,
                padding: "1px 4px",
              }}
            >
              {budgetPct.toFixed(0)}%
            </span>
          )}
          {row.status && <StatusChip status={row.status} />}
        </div>
      </div>
      {budgetPct !== null && (
        <div
          style={{
            position: "relative",
            height: 3,
            background: "var(--ft-border)",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${budgetPct}%`,
              background: barColor,
              borderRadius: 2,
              transition: "width 0.25s ease",
            }}
          />
          {/* Time tick */}
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${timeElapsed * 100}%`,
              width: 1,
              background: "var(--ft-amber)",
              transform: "translateX(-50%)",
              opacity: 0.7,
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Widget ───────────────────────────────────────────────────────────────────

export function SpendingForecastWidget({ isExpanded }: { isExpanded?: boolean }) {
  const { data: budgets = [] } = useListBudgets();

  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const today = now.toISOString().slice(0, 10);
  const timeElapsed = dayOfMonth / daysInMonth;

  const { data: txs, isLoading } = useListTransactions({ dateFrom: thisMonthStart, dateTo: today });

  const expenses = (txs ?? []).filter((tx) => tx.type === "expense");
  const totalSpentSoFar = expenses.reduce((s, tx) => s + (tx.gbpValue ?? 0), 0);
  const dailyRate = dayOfMonth > 0 ? totalSpentSoFar / dayOfMonth : 0;
  const projectedTotal = dailyRate * daysInMonth;

  const totalBudget = budgets.reduce((s, b) => s + b.monthlyLimit, 0);
  const hasBudgets = budgets.length > 0;

  // Variance vs budget (or vs pace if no budget)
  const budgetVariance = hasBudgets && totalBudget > 0 ? projectedTotal - totalBudget : null;
  const spendPace = hasBudgets && totalBudget > 0
    ? totalSpentSoFar / totalBudget
    : totalSpentSoFar / Math.max(projectedTotal, 1);

  // Category breakdown
  const catSpent = expenses.reduce<Record<string, number>>((acc, tx) => {
    const cat = tx.category || "Other";
    acc[cat] = (acc[cat] ?? 0) + (tx.gbpValue ?? 0);
    return acc;
  }, {});

  const catKeys = Array.from(new Set([
    ...Object.keys(catSpent),
    ...budgets.map((b) => b.category),
  ]));

  const catRows: CatRow[] = catKeys.map((cat) => {
    const spent = catSpent[cat] ?? 0;
    const projectedCat = dayOfMonth > 0 ? (spent / dayOfMonth) * daysInMonth : 0;
    const budget = budgets.find((b) => b.category.toLowerCase() === cat.toLowerCase());
    const status = budget ? calcStatus(projectedCat, budget.monthlyLimit) : null;
    return {
      category: cat,
      spent,
      projected: projectedCat,
      budget: budget ? budget.monthlyLimit : null,
      status,
    };
  }).sort((a, b) => b.spent - a.spent);

  const overallStatus =
    hasBudgets && totalBudget > 0 ? calcStatus(projectedTotal, totalBudget) : null;
  const projectedColor = overallStatus
    ? getStatusColor(overallStatus)
    : "var(--ft-amber)";

  const daysRemaining = daysInMonth - dayOfMonth;

  return (
    <WidgetShell
      title="Spending Forecast"
      href="/transactions"
      linkLabel="→ Transactions"
      isLoading={isLoading}
      accent="var(--ft-amber)"
    >
      {!isLoading && (
        <div style={{ padding: "12px 14px 14px" }}>

          {/* ── Hero: projected amount + status ── */}
          <div
            style={{
              background: "var(--ft-raised)",
              border: "1px solid var(--ft-border)",
              padding: "10px 12px 12px",
              marginBottom: 12,
            }}
          >
            {/* Label row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 2,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--ft-dim)",
                }}
              >
                Projected Month-End Spend
              </span>
              {overallStatus && <StatusChip status={overallStatus} />}
            </div>

            {/* Big hero number */}
            <div
              className="pnum"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 18,
                fontWeight: 700,
                color: projectedColor,
                letterSpacing: "-0.03em",
                lineHeight: 1,
                marginBottom: 10,
                whiteSpace: "nowrap",
              }}
            >
              {formatGbp(projectedTotal)}
            </div>

            {/* Dual progress: spend vs time */}
            <DualProgress
              timeElapsed={timeElapsed}
              spendElapsed={spendPace}
              budgetColor={projectedColor}
            />

            {/* Progress labels */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 5,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--ft-amber)",
                  letterSpacing: "0.02em",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                Day {dayOfMonth}/{daysInMonth}
                <span style={{ color: "var(--ft-dim)" }}> · {daysRemaining}d left</span>
              </span>
              <span
                className="pnum"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--ft-dim)",
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {formatGbp(totalSpentSoFar)} spent
              </span>
            </div>

            {/* Budget row */}
            {hasBudgets && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 7,
                  paddingTop: 7,
                  borderTop: "1px solid var(--ft-border)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--ft-dim)",
                  }}
                >
                  Budget
                </span>
                <span
                  className="pnum"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--ft-muted)",
                  }}
                >
                  {formatGbp(totalBudget)}
                </span>
              </div>
            )}

            {/* Variance vs budget */}
            {budgetVariance !== null && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 4,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--ft-dim)",
                  }}
                >
                  Variance vs budget
                </span>
                <span
                  className="pnum"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    color:
                      budgetVariance > 0
                        ? "var(--ft-red)"
                        : "var(--ft-green)",
                  }}
                >
                  {budgetVariance > 0 ? "+" : ""}
                  {formatGbp(budgetVariance)}
                </span>
              </div>
            )}

            {/* Daily run-rate */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 4,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--ft-dim)",
                }}
              >
                Daily run-rate
              </span>
              <span
                className="pnum"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--ft-muted)",
                }}
              >
                {formatGbp(dailyRate)}/day
              </span>
            </div>
          </div>

          {/* ── Category breakdown ── */}
          {isExpanded ? (
            <>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--ft-dim)",
                  marginBottom: 8,
                  borderLeft: "3px solid var(--ft-amber)",
                  paddingLeft: 8,
                }}
              >
                Category Forecast
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 72px 72px 72px 64px",
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                {["Category", "Spent", "Forecast", "Budget", "Status"].map((h) => (
                  <div
                    key={h}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      color: "var(--ft-dim)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      textAlign: h === "Category" ? "left" : "right",
                    }}
                  >
                    {h}
                  </div>
                ))}
              </div>
              {catRows.map((row) => (
                <CategoryForecastRowExpanded key={row.category} row={row} />
              ))}
            </>
          ) : (
            <>
              {catRows.length === 0 ? (
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--ft-dim)",
                    textAlign: "center",
                    padding: "16px 0",
                  }}
                >
                  No expenses this month yet
                </div>
              ) : (
                catRows.slice(0, 5).map((row) => (
                  <CategoryForecastRowCompact key={row.category} row={row} timeElapsed={timeElapsed} />
                ))
              )}
            </>
          )}
        </div>
      )}
    </WidgetShell>
  );
}
