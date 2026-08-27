import { useState } from "react";
import {
  useListBudgets,
  useCreateBudget,
  useUpdateBudget,
  useDeleteBudget,
} from "@workspace/api-client-react";
import { getListBudgetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useListTransactions } from "@workspace/api-client-react";
import { formatBaseMoney } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";
import type { Budget } from "@workspace/api-client-react";

// --- helpers -----------------------------------------------------------

function usageColor(pct: number, over: boolean): string {
  if (over || pct > 90) return "var(--ft-red)";
  if (pct > 60) return "var(--ft-amber)";
  return "var(--ft-green)";
}

function usageLabel(pct: number, over: boolean): string {
  if (over) return "OVER";
  if (pct > 90) return "CRITICAL";
  if (pct > 60) return "CAUTION";
  return "OK";
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

// SVG donut ring for % used (radius 22, stroke-width 5, circumference ~138)
function DonutRing({ pct, color, size = 54 }: { pct: number; color: string; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dashOffset = circ - (Math.min(pct, 100) / 100) * circ;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      {/* track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--ft-border)" strokeWidth={5} />
      {/* fill */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeDasharray={`${circ} ${circ}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="butt"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "none" }}
      />
    </svg>
  );
}

// Compact inline mini-bar used in category rows
function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 4, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden", flex: 1 }}>
      <div
        style={{
          height: "100%",
          width: `${Math.min(pct, 100)}%`,
          background: color,
          borderRadius: 2,
          transition: "none",
        }}
      />
    </div>
  );
}

// Color-coded status dot
function StatusDot({ color }: { color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

// ─── Budget card sub-component ────────────────────────────────────────────────

type BudgetCardProps = {
  budget: Budget;
  index: number;
  isExpanded: boolean;
  spent: number;
  daysPassed: number;
  totalDays: number;
  onRemove: (budget: Budget) => void;
  onEdit: (cat: string, limit: number) => void;
  editing: string | null;
  editValue: string;
  setEditValue: (v: string) => void;
  onCommitEdit: (budget: Budget) => void;
};

function BudgetCard({
  budget,
  index,
  isExpanded,
  spent: s,
  daysPassed,
  totalDays,
  onRemove,
  onEdit,
  editing,
  editValue,
  setEditValue,
  onCommitEdit,
}: BudgetCardProps) {
  const [hov, setHov] = useState(false);

  const pct = budget.monthlyLimit > 0 ? (s / budget.monthlyLimit) * 100 : 0;
  const over = s > budget.monthlyLimit;
  const color = usageColor(pct, over);
  const cols = isExpanded ? 3 : 2;
  const isLastInRow = (index + 1) % cols === 0;

  const catDailyRate = daysPassed > 0 ? s / daysPassed : 0;
  const catProjected = catDailyRate * totalDays;
  const catProjOver = catProjected > budget.monthlyLimit;
  const remaining = Math.max(budget.monthlyLimit - s, 0);

  return (
    <div
      key={budget.id}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "10px 12px",
        borderBottom: "1px solid var(--ft-border)",
        borderRight: !isLastInRow ? "1px solid var(--ft-border)" : undefined,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
    >
      {/* row 1: dot + name + status label + delete */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
          <StatusDot color={color} />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ft-text)",
              textOverflow: "ellipsis",
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
          >
            {budget.category}
          </span>
        </div>
        <span style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              letterSpacing: "0.06em",
              color: color,
              textTransform: "uppercase",
            }}
          >
            {usageLabel(pct, over)}
          </span>
          <button
            onClick={() => onRemove(budget)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ft-dim)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            ×
          </button>
        </span>
      </div>

      {/* row 2: mini-bar + pct pill */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <MiniBar pct={pct} color={color} />
        <span
          className="pnum"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            color: color,
            flexShrink: 0,
            minWidth: 32,
            textAlign: "right",
          }}
        >
          {Math.min(pct, 999).toFixed(0)}%
        </span>
      </div>

      {/* row 3: spent / limit (click to edit) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, minWidth: 0 }}>
        <span
          className="pnum"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            color: over ? "var(--ft-red)" : "var(--ft-text)",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}
        >
          {formatBaseMoney(s)}
        </span>
        <span
          style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}
          onClick={() => onEdit(budget.category, budget.monthlyLimit)}
        >
          {editing === budget.category ? (
            <input
              autoFocus
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => onCommitEdit(budget)}
              onKeyDown={(e) => e.key === "Enter" && onCommitEdit(budget)}
              style={{
                width: 56,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                background: "var(--ft-raised)",
                border: "1px solid var(--ft-accent)",
                color: "var(--ft-text)",
                padding: "0 4px",
                outline: "none",
                textAlign: "right",
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="pnum" title="Click to edit">
              / {formatBaseMoney(budget.monthlyLimit)}
            </span>
          )}
        </span>
      </div>

      {/* row 4: remaining + projected spend warning */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {remaining > 0 && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
            rem <span className="pnum" style={{ color: over ? "var(--ft-red)" : "var(--ft-green)" }}>{formatBaseMoney(remaining)}</span>
          </span>
        )}
        {daysPassed > 2 && catProjected > 0 && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: catProjOver ? "var(--ft-red)" : "var(--ft-dim)",
              letterSpacing: "0.04em",
              marginLeft: "auto",
            }}
          >
            <span style={{ color: "var(--ft-dim)" }}>proj </span>
            <span className="pnum" style={{ color: catProjOver ? "var(--ft-red)" : "var(--ft-muted)" }}>
              {formatBaseMoney(catProjected)}
            </span>
            {catProjOver && (
              <span style={{ color: "var(--ft-red)", marginLeft: 3 }}>▲</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- main component ----------------------------------------------------

export function BudgetTrackerWidget({ isExpanded }: { isExpanded?: boolean }) {
  const queryClient = useQueryClient();
  const { data: budgets = [] } = useListBudgets();
  const createBudget = useCreateBudget();
  const updateBudget = useUpdateBudget();
  const deleteBudget = useDeleteBudget();

  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [newLimit, setNewLimit] = useState("");

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const dayOfMonth = now.getDate();
  const totalDays = daysInMonth(year, month);
  const daysLeft = totalDays - dayOfMonth;
  const daysPassed = dayOfMonth;

  const dateFrom = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const { data: txs } = useListTransactions({ type: "expense", dateFrom });

  const spent = (txs ?? []).reduce<Record<string, number>>((acc, tx) => {
    const key = tx.category?.toLowerCase();
    acc[key] = (acc[key] ?? 0) + (tx.gbpValue ?? 0);
    return acc;
  }, {});

  function getSpent(cat: string) {
    return spent[cat.toLowerCase()] ?? 0;
  }

  function startEdit(cat: string, limit: number) {
    setEditing(cat);
    setEditValue(String(limit));
  }

  async function commitEdit(budget: Budget) {
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed) && parsed > 0) {
      await updateBudget.mutateAsync({ id: budget.id, data: { monthlyLimit: parsed } });
      queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
    }
    setEditing(null);
  }

  async function removeBudget(budget: Budget) {
    await deleteBudget.mutateAsync({ id: budget.id });
    queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
  }

  async function addBudget() {
    const limit = parseFloat(newLimit);
    if (!newCat.trim() || isNaN(limit) || limit <= 0) return;
    await createBudget.mutateAsync({ data: { category: newCat.trim(), monthlyLimit: limit } });
    queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
    setNewCat("");
    setNewLimit("");
    setAdding(false);
  }

  const monthLabel = now.toLocaleString("en-GB", { month: "long", year: "numeric" });

  const totalLimit = budgets.reduce((s, b) => s + b.monthlyLimit, 0);
  const totalSpent = budgets.reduce((s, b) => s + getSpent(b.category), 0);
  const totalPct = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;
  const totalOver = totalSpent > totalLimit;
  const totalColor = usageColor(totalPct, totalOver);

  const dailyRate = daysPassed > 0 ? totalSpent / daysPassed : 0;
  const projectedSpend = dailyRate * totalDays;
  const projectedOver = projectedSpend > totalLimit;

  const gridCols = isExpanded ? "1fr 1fr 1fr" : "1fr 1fr";

  // --- render -----------------------------------------------------------
  return (
    <WidgetShell title="Budget Tracker" accent="var(--ft-cyan)">
      <div>
        {/* header bar: month + context + add button */}
        <div
          style={{
            padding: "8px 12px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid var(--ft-border)",
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--ft-dim)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {monthLabel}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: daysLeft <= 5 ? "var(--ft-amber)" : "var(--ft-dim)",
                letterSpacing: "0.04em",
              }}
            >
              {daysLeft}d left
            </span>
          </div>
          <button
            onClick={() => setAdding((a) => !a)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.06em",
              color: "var(--ft-accent)",
              background: "transparent",
              border: "1px solid var(--ft-accent)",
              padding: "2px 8px",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {adding ? "Cancel" : "+ Add"}
          </button>
        </div>

        {/* total budget health panel (always shown when budgets exist) */}
        {budgets.length > 0 && (
          <div
            style={{
              padding: "10px 12px",
              borderBottom: "1px solid var(--ft-border)",
              background: "var(--ft-raised)",
              display: "flex",
              gap: 12,
              alignItems: "center",
            }}
          >
            {/* donut ring */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <DonutRing pct={totalPct} color={totalColor} size={54} />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  className="pnum"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontWeight: 700,
                    color: totalColor,
                    lineHeight: 1,
                  }}
                >
                  {Math.min(totalPct, 999).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* text stats */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--ft-dim)",
                  marginBottom: 3,
                }}
              >
                Total Budget Health
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginBottom: 3, minWidth: 0 }}>
                <span
                  className="pnum"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    fontWeight: 700,
                    color: totalOver ? "var(--ft-red)" : "var(--ft-text)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatBaseMoney(totalSpent)}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", flexShrink: 0, whiteSpace: "nowrap" }}>
                  / <span className="pnum">{formatBaseMoney(totalLimit)}</span>
                </span>
                {totalOver && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      letterSpacing: "0.06em",
                      color: "var(--ft-red)",
                      textTransform: "uppercase",
                    }}
                  >
                    OVER <span className="pnum">{formatBaseMoney(totalSpent - totalLimit)}</span>
                  </span>
                )}
              </div>
              {/* projected vs remaining */}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                  rem{" "}
                  <span
                    className="pnum"
                    style={{ color: totalOver ? "var(--ft-red)" : "var(--ft-green)" }}
                  >
                    {formatBaseMoney(Math.max(totalLimit - totalSpent, 0))}
                  </span>
                </span>
                {daysPassed > 2 && projectedSpend > 0 && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                    proj{" "}
                    <span
                      className="pnum"
                      style={{ color: projectedOver ? "var(--ft-red)" : "var(--ft-muted)" }}
                    >
                      {formatBaseMoney(projectedSpend)}
                    </span>
                    {projectedOver && (
                      <span style={{ color: "var(--ft-red)", marginLeft: 2 }}>▲</span>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* add row */}
        {adding && (
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "8px 12px",
              borderBottom: "1px solid var(--ft-border)",
              alignItems: "center",
            }}
          >
            <input
              placeholder="Category"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              style={{
                flex: 1,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                background: "var(--ft-raised)",
                border: "1px solid var(--ft-border2)",
                color: "var(--ft-text)",
                padding: "4px 8px",
                outline: "none",
              }}
            />
            <input
              placeholder="Limit £"
              type="number"
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              style={{
                width: 80,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                background: "var(--ft-raised)",
                border: "1px solid var(--ft-border2)",
                color: "var(--ft-text)",
                padding: "4px 8px",
                outline: "none",
              }}
            />
            <button
              onClick={addBudget}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--ft-base)",
                background: "var(--ft-accent)",
                border: "none",
                padding: "4px 10px",
                cursor: "pointer",
              }}
            >
              Add
            </button>
          </div>
        )}

        {/* budget grid */}
        <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 0 }}>
          {budgets.map((budget, i) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              index={i}
              isExpanded={!!isExpanded}
              spent={getSpent(budget.category)}
              daysPassed={daysPassed}
              totalDays={totalDays}
              onRemove={removeBudget}
              onEdit={startEdit}
              editing={editing}
              editValue={editValue}
              setEditValue={setEditValue}
              onCommitEdit={commitEdit}
            />
          ))}
        </div>

        {/* empty state */}
        {budgets.length === 0 && (
          <div
            style={{
              padding: "28px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              borderTop: adding ? undefined : "none",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ opacity: 0.25 }}>
              <rect x="4" y="8" width="24" height="16" rx="2" stroke="var(--ft-muted)" strokeWidth="1.5" />
              <path d="M4 13h24" stroke="var(--ft-muted)" strokeWidth="1.5" />
              <rect x="8" y="17" width="6" height="3" rx="1" fill="var(--ft-muted)" />
            </svg>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--ft-dim)",
                textAlign: "center",
                letterSpacing: "0.04em",
              }}
            >
              No budgets set
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--ft-dim)",
                textAlign: "center",
                opacity: 0.6,
              }}
            >
              Click + Add to create a monthly spending limit
            </span>
          </div>
        )}
      </div>
    </WidgetShell>
  );
}
