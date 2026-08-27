import { useState } from "react";
import {
  useListGoals,
  useCreateGoal,
  useUpdateGoal,
  useDeleteGoal,
  getListGoalsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatBaseMoney } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";
import type { Goal } from "@workspace/api-client-react";

// --- palette -----------------------------------------------------------

const GOAL_COLORS = [
  "var(--ft-accent)",
  "#56D364",
  "#79C0FF",
  "var(--ft-amber)",
  "var(--ft-cyan)",
  "#E6B450",
];

// --- helpers -----------------------------------------------------------

/** Arc progress indicator drawn as an SVG circle */
function ArcProgress({
  pct,
  color,
  done,
  size = 64,
}: {
  pct: number;
  color: string;
  done: boolean;
  size?: number;
}) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const clampedPct = Math.min(pct, 100);
  const dashOffset = circ - (clampedPct / 100) * circ;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--ft-border)" strokeWidth={6} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={done ? "var(--ft-green)" : color}
        strokeWidth={6}
        strokeDasharray={`${circ} ${circ}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="butt"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "none" }}
      />
    </svg>
  );
}

/** Thick progress bar with coloured fill */
function ThickBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div
      style={{
        height: 6,
        background: "var(--ft-border)",
        borderRadius: 3,
        overflow: "hidden",
        marginBottom: 8,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.min(pct, 100)}%`,
          background: color,
          borderRadius: 3,
          transition: "none",
        }}
      />
    </div>
  );
}

/** Velocity chip: on track / ahead / behind based on deadline + monthly contribution */
function velocityStatus(goal: Goal): { label: string; color: string } | null {
  const target = parseFloat(String(goal.target));
  const current = parseFloat(String(goal.current));
  if (current >= target) return null;
  if (!goal.deadline) return null;

  const now = new Date();
  const dl = new Date(goal.deadline);
  const monthsLeft = Math.max(
    (dl.getFullYear() - now.getFullYear()) * 12 + (dl.getMonth() - now.getMonth()),
    0
  );
  if (monthsLeft === 0) return { label: "DUE", color: "var(--ft-red)" };

  const remaining = target - current;
  const required = remaining / monthsLeft;

  if (!goal.monthlyContribution || goal.monthlyContribution <= 0) return null;

  const contrib = goal.monthlyContribution;
  const ratio = contrib / required;

  if (ratio >= 1.1) return { label: "AHEAD", color: "var(--ft-green)" };
  if (ratio >= 0.9) return { label: "ON TRACK", color: "var(--ft-green)" };
  if (ratio >= 0.6) return { label: "BEHIND", color: "var(--ft-amber)" };
  return { label: "AT RISK", color: "var(--ft-red)" };
}

/** Projected completion date based on monthly contribution */
function projectedCompletion(goal: Goal): string | null {
  const target = parseFloat(String(goal.target));
  const current = parseFloat(String(goal.current));
  if (current >= target) return null;
  if (!goal.monthlyContribution || goal.monthlyContribution <= 0) return null;

  const monthsNeeded = Math.ceil((target - current) / goal.monthlyContribution);
  const now = new Date();
  const projDate = new Date(now.getFullYear(), now.getMonth() + monthsNeeded, 1);
  return projDate.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

/** Days until deadline with urgency coloring */
function deadlineInfo(deadline: string): { text: string; color: string } {
  const now = new Date();
  const dl = new Date(deadline);
  const diffMs = dl.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { text: "OVERDUE", color: "var(--ft-red)" };
  if (diffDays === 0) return { text: "DUE TODAY", color: "var(--ft-red)" };
  if (diffDays <= 14) return { text: `${diffDays}d left`, color: "var(--ft-red)" };
  if (diffDays <= 60) return { text: `${diffDays}d left`, color: "var(--ft-amber)" };

  const months = Math.floor(diffDays / 30);
  if (months < 12) return { text: `${months}mo left`, color: "var(--ft-dim)" };
  const yrs = (months / 12).toFixed(1);
  return { text: `${yrs}yr left`, color: "var(--ft-dim)" };
}

// ─── Goal card sub-component ──────────────────────────────────────────────────

type GoalCardProps = {
  goal: Goal;
  index: number;
  onRemove: (id: number) => void;
  onUpdateCurrent: (id: number, value: string) => void;
};

function GoalCard({ goal, index, onRemove, onUpdateCurrent }: GoalCardProps) {
  const [hov, setHov] = useState(false);

  const target = parseFloat(String(goal.target));
  const current = parseFloat(String(goal.current));
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const done = current >= target;
  const color = goal.color ?? GOAL_COLORS[index % GOAL_COLORS.length];
  const remaining = Math.max(target - current, 0);

  const velocity = velocityStatus(goal);
  const projected = projectedCompletion(goal);
  const dlInfo = goal.deadline && !done ? deadlineInfo(goal.deadline) : null;

  // Monthly contribution as % of remaining
  const monthlyPct = goal.monthlyContribution && remaining > 0
    ? Math.min((goal.monthlyContribution / remaining) * 100, 100)
    : 0;

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "12px",
        borderBottom: "1px solid var(--ft-border)",
        borderRight: (index % 3) < 2 ? "1px solid var(--ft-border)" : undefined,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
    >
      {/* delete button */}
      <button
        onClick={() => onRemove(goal.id)}
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

      {/* top row: arc + title area */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, paddingRight: 16 }}>
        {/* arc progress */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <ArcProgress pct={pct} color={color} done={done} size={52} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
            }}
          >
            {done ? (
              <span style={{ fontSize: 14, lineHeight: 1 }}>✓</span>
            ) : (
              <span
                className="pnum"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  color,
                  lineHeight: 1,
                }}
              >
                {pct.toFixed(0)}%
              </span>
            )}
          </div>
        </div>

        {/* title + status chips */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--ft-text)",
              marginBottom: 3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {goal.emoji ? `${goal.emoji} ` : ""}
            {goal.name}
          </div>

          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            {done ? (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--ft-green)",
                  background: "color-mix(in srgb, var(--ft-green) 12%, transparent)",
                  padding: "1px 5px",
                  borderRadius: 2,
                }}
              >
                ACHIEVED
              </span>
            ) : (
              <>
                {velocity && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: velocity.color,
                      background: `color-mix(in srgb, ${velocity.color} 12%, transparent)`,
                      padding: "1px 5px",
                      borderRadius: 2,
                    }}
                  >
                    {velocity.label}
                  </span>
                )}
                {dlInfo && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      letterSpacing: "0.04em",
                      color: dlInfo.color,
                    }}
                  >
                    {dlInfo.text}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* thick progress bar */}
      <ThickBar pct={pct} color={done ? "var(--ft-green)" : color} />

      {/* amount row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, minWidth: 0 }}>
        <div style={{ minWidth: 0, overflow: "hidden" }}>
          <div
            className="pnum"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: 700,
              color: done ? "var(--ft-green)" : color,
              whiteSpace: "nowrap",
            }}
          >
            {formatBaseMoney(current)}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", whiteSpace: "nowrap" }}>
            of <span className="pnum">{formatBaseMoney(target)}</span>
          </div>
        </div>
        {!done && (
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div
              className="pnum"
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", whiteSpace: "nowrap" }}
            >
              {formatBaseMoney(remaining)} left
            </div>
            {/* projected completion */}
            {projected && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 1 }}>
                proj <span style={{ color: "var(--ft-muted)" }}>{projected}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* monthly contribution mini-bar (data density) */}
      {!done && goal.monthlyContribution && goal.monthlyContribution > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Monthly
            </span>
            <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)" }}>
              {formatBaseMoney(goal.monthlyContribution)}
            </span>
          </div>
          <div style={{ height: 3, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${monthlyPct}%`,
              background: `color-mix(in srgb, ${color} 70%, var(--ft-dim))`,
              borderRadius: 2,
            }} />
          </div>
        </div>
      )}

      {/* update input */}
      <div style={{ marginTop: 4, display: "flex", gap: 4, alignItems: "center" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--ft-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            flexShrink: 0,
          }}
        >
          Saved:
        </span>
        <input
          type="number"
          defaultValue={current}
          key={current}
          onBlur={(e) => onUpdateCurrent(goal.id, e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && onUpdateCurrent(goal.id, (e.target as HTMLInputElement).value)
          }
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
}

// ─── Summary header strip sub-component ──────────────────────────────────────

type GoalsSummaryProps = {
  totalSaved: number;
  totalTarget: number;
  totalPct: number;
  onAdd: () => void;
  adding: boolean;
};

function GoalsSummary({ totalSaved, totalTarget, totalPct, onAdd, adding }: GoalsSummaryProps) {
  return (
    <div
      style={{
        padding: "8px 12px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "1px solid var(--ft-border)",
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "center", flex: 1, minWidth: 0, overflow: "hidden" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, flexShrink: 0, whiteSpace: "nowrap" }}>
          <span style={{ color: "var(--ft-dim)", marginRight: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 9 }}>
            Saved
          </span>
          <span className="pnum" style={{ color: "var(--ft-green)", fontWeight: 700 }}>
            {formatBaseMoney(totalSaved)}
          </span>
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, flexShrink: 0, whiteSpace: "nowrap" }}>
          <span style={{ color: "var(--ft-dim)", marginRight: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 9 }}>
            Target
          </span>
          <span className="pnum" style={{ color: "var(--ft-text)", fontWeight: 700 }}>
            {formatBaseMoney(totalTarget)}
          </span>
        </span>
        {totalTarget > 0 && (
          <span
            className="pnum"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: totalPct >= 100 ? "var(--ft-green)" : "var(--ft-dim)",
            }}
          >
            {totalPct.toFixed(0)}%
          </span>
        )}
        {/* overall progress mini-bar */}
        {totalTarget > 0 && (
          <div style={{ flex: 1, height: 3, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden", maxWidth: 80 }}>
            <div style={{
              height: "100%",
              width: `${Math.min(totalPct, 100)}%`,
              background: totalPct >= 100 ? "var(--ft-green)" : "var(--ft-accent)",
              borderRadius: 2,
            }} />
          </div>
        )}
      </div>
      <button
        onClick={onAdd}
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
          flexShrink: 0,
        }}
      >
        {adding ? "Cancel" : "+ Goal"}
      </button>
    </div>
  );
}

// --- main component ----------------------------------------------------

export function SavingsGoalsWidget() {
  const qc = useQueryClient();
  const { data: goals = [], isLoading } = useListGoals();
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    name: "",
    target: "",
    current: "",
    deadline: "",
    monthlyContribution: "",
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: getListGoalsQueryKey() });

  async function addGoal() {
    const target = parseFloat(form.target);
    const current = parseFloat(form.current) || 0;
    const monthlyContribution = parseFloat(form.monthlyContribution) || undefined;
    if (!form.name.trim() || isNaN(target) || target <= 0) return;
    await createGoal.mutateAsync({
      data: {
        name: form.name.trim(),
        target,
        current,
        deadline: form.deadline || undefined,
        monthlyContribution,
      },
    });
    await invalidate();
    setForm({ name: "", target: "", current: "", deadline: "", monthlyContribution: "" });
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
  const totalPct = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

  // --- render -----------------------------------------------------------
  return (
    <WidgetShell title="Savings Goals" accent="#56D364" isLoading={isLoading}>
      <div>
        {/* summary header */}
        <GoalsSummary
          totalSaved={totalSaved}
          totalTarget={totalTarget}
          totalPct={totalPct}
          onAdd={() => setAdding((a) => !a)}
          adding={adding}
        />

        {/* add form */}
        {adding && (
          <div
            style={{
              padding: "10px 12px",
              borderBottom: "1px solid var(--ft-border)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: "var(--ft-raised)",
            }}
          >
            {/* row 1: name + target + saved so far */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {(
                [
                  { key: "name", placeholder: "Goal name" },
                  { key: "target", placeholder: "Target £", type: "number" },
                  { key: "current", placeholder: "Saved so far £", type: "number" },
                ] as { key: keyof typeof form; placeholder: string; type?: string }[]
              ).map((f) => (
                <input
                  key={f.key}
                  type={f.type ?? "text"}
                  placeholder={f.placeholder}
                  value={form[f.key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    background: "var(--ft-surface)",
                    border: "1px solid var(--ft-border2)",
                    color: "var(--ft-text)",
                    padding: "5px 8px",
                    outline: "none",
                  }}
                />
              ))}
            </div>
            {/* row 2: deadline + monthly contribution + submit */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="date"
                value={form.deadline}
                onChange={(e) => setForm((prev) => ({ ...prev, deadline: e.target.value }))}
                style={{
                  flex: 1,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  background: "var(--ft-surface)",
                  border: "1px solid var(--ft-border2)",
                  color: form.deadline ? "var(--ft-text)" : "var(--ft-dim)",
                  padding: "5px 8px",
                  outline: "none",
                }}
              />
              <input
                type="number"
                placeholder="Monthly £"
                value={form.monthlyContribution}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, monthlyContribution: e.target.value }))
                }
                style={{
                  width: 90,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  background: "var(--ft-surface)",
                  border: "1px solid var(--ft-border2)",
                  color: "var(--ft-text)",
                  padding: "5px 8px",
                  outline: "none",
                }}
              />
              <button
                onClick={addGoal}
                disabled={createGoal.isPending}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--ft-base)",
                  background: "var(--ft-green)",
                  border: "none",
                  padding: "5px 14px",
                  cursor: "pointer",
                  opacity: createGoal.isPending ? 0.6 : 1,
                  flexShrink: 0,
                }}
              >
                Add Goal
              </button>
            </div>
          </div>
        )}

        {/* goals grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
          {goals.map((goal, i) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              index={i}
              onRemove={removeGoal}
              onUpdateCurrent={updateCurrent}
            />
          ))}
        </div>

        {/* empty state */}
        {goals.length === 0 && !adding && (
          <div
            style={{
              padding: "28px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ opacity: 0.25 }}>
              <circle cx="16" cy="16" r="11" stroke="var(--ft-muted)" strokeWidth="1.5" />
              <path
                d="M16 9v7l4 2"
                stroke="var(--ft-muted)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
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
              No savings goals
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
              Click + Goal to set a savings target
            </span>
          </div>
        )}
      </div>
    </WidgetShell>
  );
}
