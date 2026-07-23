import { useState } from "react";
import {
  useListGoals,
  useCreateGoal,
  useUpdateGoal,
  useDeleteGoal,
  getListGoalsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatGbp } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";

const GOAL_COLORS = [
  "var(--ft-accent)",
  "#56D364",
  "#79C0FF",
  "var(--ft-amber)",
  "var(--ft-cyan)",
  "#E6B450",
];

export function SavingsGoalsWidget() {
  const qc = useQueryClient();
  const { data: goals = [], isLoading } = useListGoals();
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", target: "", current: "", deadline: "" });

  const invalidate = () => qc.invalidateQueries({ queryKey: getListGoalsQueryKey() });

  async function addGoal() {
    const target = parseFloat(form.target);
    const current = parseFloat(form.current) || 0;
    if (!form.name.trim() || isNaN(target) || target <= 0) return;
    await createGoal.mutateAsync({
      data: {
        name: form.name.trim(),
        target,
        current,
        deadline: form.deadline || undefined,
      },
    });
    await invalidate();
    setForm({ name: "", target: "", current: "", deadline: "" });
    setAdding(false);
  }

  async function updateCurrent(id: number, value: string) {
    const current = parseFloat(value);
    if (isNaN(current) || current < 0) return;
    await updateGoal.mutateAsync({ id, data: { current } });
    await invalidate();
  }

  async function removeGoal(id: number) {
    await deleteGoal.mutateAsync({ id });
    await invalidate();
  }

  const totalTarget = goals.reduce((s, g) => s + parseFloat(String(g.target)), 0);
  const totalSaved = goals.reduce((s, g) => s + parseFloat(String(g.current)), 0);

  return (
    <WidgetShell title="Savings Goals" accent="#56D364" isLoading={isLoading}>
      <div>
        <div style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--ft-border)" }}>
          <div style={{ display: "flex", gap: 16 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>
              <span style={{ color: "var(--ft-dim)", marginRight: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 9 }}>Saved</span>
              <span className="pnum" style={{ color: "var(--ft-green)", fontWeight: 700 }}>{formatGbp(totalSaved)}</span>
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>
              <span style={{ color: "var(--ft-dim)", marginRight: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 9 }}>Target</span>
              <span className="pnum" style={{ color: "var(--ft-text)", fontWeight: 700 }}>{formatGbp(totalTarget)}</span>
            </span>
          </div>
          <button
            onClick={() => setAdding(a => !a)}
            style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", color: "var(--ft-green)", background: "transparent", border: "1px solid var(--ft-green)", padding: "2px 8px", cursor: "pointer", textTransform: "uppercase" }}
          >
            {adding ? "Cancel" : "+ Goal"}
          </button>
        </div>

        {adding && (
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--ft-border)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { key: "name", placeholder: "Goal name" },
                { key: "target", placeholder: "Target £", type: "number" },
                { key: "current", placeholder: "Saved so far £", type: "number" },
              ].map(f => (
                <input
                  key={f.key}
                  type={f.type ?? "text"}
                  placeholder={f.placeholder}
                  value={form[f.key as keyof typeof form]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "5px 8px", outline: "none" }}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="date"
                value={form.deadline}
                onChange={e => setForm(prev => ({ ...prev, deadline: e.target.value }))}
                style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: form.deadline ? "var(--ft-text)" : "var(--ft-dim)", padding: "5px 8px", outline: "none" }}
              />
              <button
                onClick={addGoal}
                disabled={createGoal.isPending}
                style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-base)", background: "var(--ft-green)", border: "none", padding: "5px 14px", cursor: "pointer", opacity: createGoal.isPending ? 0.6 : 1 }}
              >
                Add Goal
              </button>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
          {goals.map((goal, i) => {
            const target = parseFloat(String(goal.target));
            const current = parseFloat(String(goal.current));
            const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
            const done = current >= target;
            const color = GOAL_COLORS[i % GOAL_COLORS.length];
            const remaining = Math.max(target - current, 0);

            return (
              <div key={goal.id} style={{ padding: "12px", borderBottom: "1px solid var(--ft-border)", borderRight: (i % 3) < 2 ? "1px solid var(--ft-border)" : undefined, position: "relative" }}>
                <button
                  onClick={() => removeGoal(goal.id)}
                  style={{ position: "absolute", top: 8, right: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}
                >
                  ×
                </button>

                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--ft-text)", marginBottom: 2, paddingRight: 16 }}>
                  {goal.emoji ? `${goal.emoji} ` : ""}{goal.name}
                </div>

                {done ? (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-green)", marginBottom: 6 }}>✓ Achieved</div>
                ) : goal.deadline ? (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 6 }}>
                    By {new Date(goal.deadline).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                  </div>
                ) : (
                  <div style={{ marginBottom: 6 }} />
                )}

                <div style={{ height: 3, background: "var(--ft-border)", borderRadius: 2, marginBottom: 8 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: done ? "var(--ft-green)" : (goal.color ?? color), borderRadius: 2 }} />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div>
                    <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: done ? "var(--ft-green)" : (goal.color ?? color) }}>
                      {formatGbp(current)}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                      of <span className="pnum">{formatGbp(target)}</span>
                    </div>
                  </div>
                  {!done && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>{pct.toFixed(0)}%</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}><span className="pnum">{formatGbp(remaining)}</span> left</div>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 8, display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Update:</span>
                  <input
                    type="number"
                    defaultValue={current}
                    key={current}
                    onBlur={e => updateCurrent(goal.id, e.target.value)}
                    onKeyDown={e => e.key === "Enter" && updateCurrent(goal.id, (e.target as HTMLInputElement).value)}
                    style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "2px 5px", outline: "none", minWidth: 0 }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {goals.length === 0 && !adding && (
          <div style={{ padding: "24px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center" }}>
            No goals set — click + Goal to create a savings target
          </div>
        )}
      </div>
    </WidgetShell>
  );
}
