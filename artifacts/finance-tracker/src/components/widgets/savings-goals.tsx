import { useState, useEffect } from "react";
import { formatGbp } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";

interface Goal {
  id: string;
  name: string;
  target: number;
  current: number;
  deadline?: string;
}

function loadGoals(): Goal[] {
  try {
    const raw = localStorage.getItem("ft-savings-goals");
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveGoals(goals: Goal[]) {
  try { localStorage.setItem("ft-savings-goals", JSON.stringify(goals)); } catch {}
}

const GOAL_COLORS = [
  "var(--ft-accent)",
  "#56D364",
  "#79C0FF",
  "var(--ft-amber)",
  "var(--ft-cyan)",
  "#E6B450",
];

export function SavingsGoalsWidget() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", target: "", current: "", deadline: "" });

  useEffect(() => { setGoals(loadGoals()); }, []);

  function addGoal() {
    const target = parseFloat(form.target);
    const current = parseFloat(form.current) || 0;
    if (!form.name.trim() || isNaN(target) || target <= 0) return;
    const next = [...goals, {
      id: Date.now().toString(),
      name: form.name.trim(),
      target,
      current,
      deadline: form.deadline || undefined,
    }];
    setGoals(next);
    saveGoals(next);
    setForm({ name: "", target: "", current: "", deadline: "" });
    setAdding(false);
  }

  function updateCurrent(id: string, value: string) {
    const amount = parseFloat(value);
    if (isNaN(amount) || amount < 0) return;
    const next = goals.map(g => g.id === id ? { ...g, current: amount } : g);
    setGoals(next);
    saveGoals(next);
  }

  function removeGoal(id: string) {
    const next = goals.filter(g => g.id !== id);
    setGoals(next);
    saveGoals(next);
  }

  const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  const totalSaved = goals.reduce((s, g) => s + g.current, 0);

  return (
    <WidgetShell title="Savings Goals" accent="#56D364">
      <div>
        {/* Header row */}
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
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.06em",
              color: "var(--ft-green)",
              background: "transparent",
              border: "1px solid var(--ft-green)",
              padding: "2px 8px",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {adding ? "Cancel" : "+ Goal"}
          </button>
        </div>

        {/* Add form */}
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
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    background: "var(--ft-raised)",
                    border: "1px solid var(--ft-border2)",
                    color: "var(--ft-text)",
                    padding: "5px 8px",
                    outline: "none",
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="date"
                placeholder="Deadline (optional)"
                value={form.deadline}
                onChange={e => setForm(prev => ({ ...prev, deadline: e.target.value }))}
                style={{
                  flex: 1,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  background: "var(--ft-raised)",
                  border: "1px solid var(--ft-border2)",
                  color: form.deadline ? "var(--ft-text)" : "var(--ft-dim)",
                  padding: "5px 8px",
                  outline: "none",
                }}
              />
              <button
                onClick={addGoal}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--ft-base)",
                  background: "var(--ft-green)",
                  border: "none",
                  padding: "5px 14px",
                  cursor: "pointer",
                }}
              >
                Add Goal
              </button>
            </div>
          </div>
        )}

        {/* Goals grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
          {goals.map((goal, i) => {
            const pct = Math.min((goal.current / goal.target) * 100, 100);
            const done = goal.current >= goal.target;
            const color = GOAL_COLORS[i % GOAL_COLORS.length];
            const remaining = Math.max(goal.target - goal.current, 0);

            return (
              <div key={goal.id} style={{
                padding: "12px",
                borderBottom: "1px solid var(--ft-border)",
                borderRight: (i % 3) < 2 ? "1px solid var(--ft-border)" : undefined,
                position: "relative",
              }}>
                {/* Remove button */}
                <button
                  onClick={() => removeGoal(goal.id)}
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--ft-dim)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>

                {/* Goal name */}
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--ft-text)", marginBottom: 2, paddingRight: 16 }}>
                  {goal.name}
                </div>

                {/* Done badge or deadline */}
                {done ? (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-green)", marginBottom: 6 }}>
                    ✓ Achieved
                  </div>
                ) : goal.deadline ? (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 6 }}>
                    By {new Date(goal.deadline).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                  </div>
                ) : (
                  <div style={{ marginBottom: 6 }} />
                )}

                {/* Circular progress (simple arc with css) - use a bar instead */}
                <div style={{ height: 3, background: "var(--ft-border)", borderRadius: 2, marginBottom: 8 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: done ? "var(--ft-green)" : color, borderRadius: 2 }} />
                </div>

                {/* Numbers */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div>
                    <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: done ? "var(--ft-green)" : color }}>
                      {formatGbp(goal.current)}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                      of <span className="pnum">{formatGbp(goal.target)}</span>
                    </div>
                  </div>
                  {!done && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
                        {pct.toFixed(0)}%
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                        <span className="pnum">{formatGbp(remaining)}</span> left
                      </div>
                    </div>
                  )}
                </div>

                {/* Edit current saved */}
                <div style={{ marginTop: 8, display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Update:</span>
                  <input
                    type="number"
                    defaultValue={goal.current}
                    onBlur={e => updateCurrent(goal.id, e.target.value)}
                    onKeyDown={e => e.key === "Enter" && updateCurrent(goal.id, (e.target as HTMLInputElement).value)}
                    style={{
                      flex: 1,
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      background: "var(--ft-raised)",
                      border: "1px solid var(--ft-border2)",
                      color: "var(--ft-text)",
                      padding: "2px 5px",
                      outline: "none",
                      minWidth: 0,
                    }}
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
