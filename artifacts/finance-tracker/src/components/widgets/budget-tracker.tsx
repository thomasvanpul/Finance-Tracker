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
import { formatGbp } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";
import type { Budget } from "@workspace/api-client-react";

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
  const dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const { data: txs } = useListTransactions({ type: "expense", dateFrom });

  const spent = (txs ?? []).reduce<Record<string, number>>((acc, tx) => {
    const key = tx.category?.toLowerCase();
    acc[key] = (acc[key] ?? 0) + tx.gbpValue;
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
  const totalPct = totalLimit > 0 ? Math.min((totalSpent / totalLimit) * 100, 100) : 0;
  const totalOver = totalSpent > totalLimit;
  const totalBarColor = totalOver ? "var(--ft-red)" : totalPct > 75 ? "var(--ft-amber)" : "var(--ft-green)";

  const gridCols = isExpanded ? "1fr 1fr 1fr" : "1fr 1fr";

  const budgetCard = (budget: Budget, i: number) => {
    const s = getSpent(budget.category);
    const pct = Math.min((s / budget.monthlyLimit) * 100, 100);
    const over = s > budget.monthlyLimit;
    const barColor = over ? "var(--ft-red)" : pct > 75 ? "var(--ft-amber)" : "var(--ft-green)";
    const cols = isExpanded ? 3 : 2;
    const isLastInRow = (i + 1) % cols === 0;

    return (
      <div key={budget.id} style={{
        padding: "10px 12px",
        borderBottom: "1px solid var(--ft-border)",
        borderRight: !isLastInRow ? "1px solid var(--ft-border)" : undefined,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>
            {budget.category}
          </span>
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {over && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.06em", color: "var(--ft-red)", textTransform: "uppercase" }}>
                OVER
              </span>
            )}
            <button
              onClick={() => removeBudget(budget)}
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              ×
            </button>
          </span>
        </div>

        <div style={{ height: 2, background: "var(--ft-border)", borderRadius: 2, marginBottom: 4 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 2, transition: "width 0.3s ease" }} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: over ? "var(--ft-red)" : "var(--ft-muted)" }}>
            {formatGbp(s)}
          </span>
          <span
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", cursor: "pointer" }}
            onClick={() => startEdit(budget.category, budget.monthlyLimit)}
          >
            {editing === budget.category ? (
              <input
                autoFocus
                type="number"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => commitEdit(budget)}
                onKeyDown={e => e.key === "Enter" && commitEdit(budget)}
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
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="pnum" title="Click to edit">/ {formatGbp(budget.monthlyLimit)}</span>
            )}
          </span>
        </div>
      </div>
    );
  };

  return (
    <WidgetShell title="Budget Tracker" accent="var(--ft-cyan)">
      <div>
        {/* Month + add button */}
        <div style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--ft-border)" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {monthLabel}
          </span>
          <button
            onClick={() => setAdding(a => !a)}
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

        {/* Expanded: total budget health bar */}
        {isExpanded && budgets.length > 0 && (
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-raised)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                Total Budget Health
              </span>
              <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: totalOver ? "var(--ft-red)" : "var(--ft-dim)" }}>
                {formatGbp(totalSpent)} / {formatGbp(totalLimit)} · {totalPct.toFixed(0)}%
              </span>
            </div>
            <div style={{ height: 4, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${totalPct}%`, background: totalBarColor, borderRadius: 2, transition: "width 0.3s ease" }} />
            </div>
            {totalOver && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-red)", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 4 }}>
                Over budget by <span className="pnum">{formatGbp(totalSpent - totalLimit)}</span>
              </div>
            )}
          </div>
        )}

        {/* Add row */}
        {adding && (
          <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--ft-border)", alignItems: "center" }}>
            <input
              placeholder="Category"
              value={newCat}
              onChange={e => setNewCat(e.target.value)}
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
              onChange={e => setNewLimit(e.target.value)}
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

        {/* Budget grid */}
        <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 0 }}>
          {budgets.map((budget, i) => budgetCard(budget, i))}
        </div>

        {budgets.length === 0 && (
          <div style={{ padding: "20px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center" }}>
            No budgets set — click + Add to create one
          </div>
        )}
      </div>
    </WidgetShell>
  );
}
