import { useState, useEffect, useRef } from "react";
import { Target, Trophy, Check, AlertTriangle, X as XIcon, ChevronDown, ChevronRight } from "lucide-react";
import { formatGbp } from "@/lib/utils";
import { useGetDashboard } from "@workspace/api-client-react";

interface HistoryEntry {
  date: string;
  amount: number;
}

interface Goal {
  id: string;
  name: string;
  target: number;
  current: number;
  deadline?: string;
  emoji?: string;
  color?: string;
  image?: string;
  monthlyContribution?: number;
  history?: HistoryEntry[];
}

const PRESET_COLORS = [
  "#F4A21E",
  "#56D364",
  "#79C0FF",
  "#E6B450",
  "#FF7B72",
  "#D2A8FF",
];

function GoalIcon({ emoji, color, size = 18 }: { emoji?: string; color?: string; size?: number }) {
  if (emoji) return <span style={{ fontSize: size, lineHeight: 1 }}>{emoji}</span>;
  return <Target size={size} color={color ?? "var(--ft-accent)"} />;
}

function loadGoals(): Goal[] {
  try {
    const raw = localStorage.getItem("ft-savings-goals");
    if (raw) return JSON.parse(raw) as Goal[];
  } catch {}
  return [];
}

function saveGoals(goals: Goal[]) {
  try {
    localStorage.setItem("ft-savings-goals", JSON.stringify(goals));
  } catch {}
}

function deadlineLabel(deadline: string): { text: string; isOverdue: boolean } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dl = new Date(deadline);
  dl.setHours(0, 0, 0, 0);
  const diffMs = dl.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { text: "OVERDUE", isOverdue: true };
  if (diffDays === 0) return { text: "Due today", isOverdue: false };
  if (diffDays <= 31) return { text: `${diffDays} day${diffDays !== 1 ? "s" : ""} left`, isOverdue: false };
  const months = Math.round(diffDays / 30);
  return { text: `${months} month${months !== 1 ? "s" : ""} left`, isOverdue: false };
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Math.round(months));
  return d;
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function daysUntil(deadline: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dl = new Date(deadline);
  dl.setHours(0, 0, 0, 0);
  return Math.round((dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/** Future value of current amount + monthly contributions with compound growth */
function calcFV(current: number, monthlyContrib: number, r: number, n: number): number {
  if (r === 0) return current + monthlyContrib * n;
  return current * Math.pow(1 + r, n) + monthlyContrib * ((Math.pow(1 + r, n) - 1) / r);
}

/** Months needed to reach target with compound growth */
function calcMonthsWithGrowth(current: number, target: number, monthly: number, annualRate: number): number {
  if (current >= target) return 0;
  const r = annualRate / 12;
  if (r === 0 || monthly <= 0) {
    if (monthly <= 0) return Infinity;
    return Math.ceil((target - current) / monthly);
  }
  let n = 1;
  while (n < 1200) {
    if (calcFV(current, monthly, r, n) >= target) return n;
    n++;
  }
  return Infinity;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function priorityScore(goal: Goal, now: Date): number {
  const remaining = Math.max(goal.target - goal.current, 0);
  if (remaining === 0) return -1;
  if (!goal.deadline) return remaining;
  const days = daysUntil(goal.deadline);
  if (days <= 0) return Infinity;
  return remaining / days;
}

const EMPTY_FORM = {
  name: "",
  target: "",
  current: "",
  deadline: "",
  emoji: "",
  color: PRESET_COLORS[0],
  monthlyContribution: "",
  image: "",
};

export default function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [addFunds, setAddFunds] = useState<Record<string, string>>({});
  const [expandedAnalytics, setExpandedAnalytics] = useState<Record<string, boolean>>({});
  const [compoundToggles, setCompoundToggles] = useState<Record<string, boolean>>({});
  const imageInputRef = useRef<HTMLInputElement>(null);

  function handleGoalImageFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new window.Image();
      img.onload = () => {
        const MAX = 256;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        setForm((f) => ({ ...f, image: canvas.toDataURL("image/jpeg", 0.88) }));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }

  const { data: dashData, isLoading: dashLoading } = useGetDashboard();
  const dashboard = dashData as
    | { thisMonth?: { income?: number; expenses?: number; savingsRate?: number } }
    | undefined;

  useEffect(() => {
    setGoals(loadGoals());
  }, []);

  function updateGoals(next: Goal[]) {
    setGoals(next);
    saveGoals(next);
  }

  function handleSave() {
    const target = parseFloat(form.target);
    const current = parseFloat(form.current) || 0;
    if (!form.name.trim() || isNaN(target) || target <= 0) return;
    const monthlyContrib = parseFloat(form.monthlyContribution);
    const next: Goal[] = [
      ...goals,
      {
        id: Date.now().toString(),
        name: form.name.trim(),
        target,
        current,
        deadline: form.deadline || undefined,
        emoji: form.emoji.trim() || undefined,
        color: form.color || PRESET_COLORS[0],
        image: form.image || undefined,
        monthlyContribution: !isNaN(monthlyContrib) && monthlyContrib > 0 ? monthlyContrib : undefined,
        history: current > 0 ? [{ date: todayStr(), amount: current }] : [],
      },
    ];
    updateGoals(next);
    setForm({ ...EMPTY_FORM });
    setShowForm(false);
  }

  function handleAddFunds(id: string) {
    const amount = parseFloat(addFunds[id] ?? "");
    if (isNaN(amount) || amount <= 0) return;
    const today = todayStr();
    const next = goals.map((g) => {
      if (g.id !== id) return g;
      const newTotal = g.current + amount;
      const history: HistoryEntry[] = [...(g.history ?? []), { date: today, amount: newTotal }];
      return { ...g, current: newTotal, history };
    });
    updateGoals(next);
    setAddFunds((prev) => ({ ...prev, [id]: "" }));
  }

  function handleDelete(id: string) {
    updateGoals(goals.filter((g) => g.id !== id));
  }

  function handleSetDeadline(id: string, deadline: string) {
    updateGoals(goals.map((g) => (g.id === id ? { ...g, deadline } : g)));
  }

  // Dashboard derived values
  const monthlyIncome = dashboard?.thisMonth?.income ?? 0;
  const monthlyExpenses = dashboard?.thisMonth?.expenses ?? 0;
  const monthlySurplus = monthlyIncome - monthlyExpenses;

  const unachievedGoals = goals.filter((g) => g.current < g.target);
  const achievedGoals = goals.filter((g) => g.current >= g.target);

  // Total goals gap
  const totalGoalsNeeded = unachievedGoals.reduce((s, g) => s + Math.max(g.target - g.current, 0), 0);

  // Combined monthly needed across all unachieved goals that have deadlines
  const now = new Date();
  const combinedMonthlyNeeded = unachievedGoals.reduce((s, g) => {
    if (!g.deadline) return s;
    const months = monthsBetween(now, new Date(g.deadline));
    if (months <= 0) return s;
    const remaining = Math.max(g.target - g.current, 0);
    return s + remaining / months;
  }, 0);

  // Priority ranking
  const rankedGoalIds = [...unachievedGoals]
    .sort((a, b) => priorityScore(b, now) - priorityScore(a, now))
    .map((g) => g.id);

  // Per goal monthly share at surplus rate
  const sharedMonthlyRate = unachievedGoals.length > 0 ? monthlySurplus / unachievedGoals.length : 0;

  // Feasibility
  const shortfall = combinedMonthlyNeeded - monthlySurplus;
  type FeasibilityStatus = "on-track" | "tight" | "shortfall" | "none";
  let feasibilityStatus: FeasibilityStatus = "none";
  if (combinedMonthlyNeeded > 0) {
    if (monthlySurplus >= combinedMonthlyNeeded) {
      feasibilityStatus = "on-track";
    } else if (shortfall / combinedMonthlyNeeded <= 0.2) {
      feasibilityStatus = "tight";
    } else {
      feasibilityStatus = "shortfall";
    }
  }

  const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  const totalSaved = goals.reduce((s, g) => s + g.current, 0);
  const totalPct = totalTarget > 0 ? Math.min((totalSaved / totalTarget) * 100, 100) : 0;

  // Insights
  const mostUrgent = unachievedGoals
    .filter((g) => g.deadline)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())[0];
  const biggestGap = unachievedGoals.reduce<Goal | null>(
    (best, g) => {
      if (!best) return g;
      return g.target - g.current > best.target - best.current ? g : best;
    },
    null
  );
  const closestToDone = unachievedGoals.reduce<Goal | null>(
    (best, g) => {
      const pct = g.current / g.target;
      if (!best) return g;
      return pct > best.current / best.target ? g : best;
    },
    null
  );

  const inputStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    background: "var(--ft-raised)",
    border: "1px solid var(--ft-border2)",
    color: "var(--ft-text)",
    padding: "6px 10px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    color: "var(--ft-dim)",
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    display: "block",
    marginBottom: 4,
  };

  return (
    <div>
      {/* ── Page Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
            <span style={{ color: "var(--ft-accent)" }}>·</span> Savings Goals
          </div>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            background: showForm ? "var(--ft-raised)" : "var(--ft-accent)",
            color: showForm ? "var(--ft-text)" : "var(--ft-base)",
            border: showForm ? "1px solid var(--ft-border2)" : "none",
            padding: "6px 16px",
            cursor: "pointer",
          }}
        >
          {showForm ? "Cancel" : "+ Add Goal"}
        </button>
      </div>

      {/* ── Section 1: Dashboard Analytics Banner ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
        marginBottom: 16,
      }}>
        {/* Tile 1: Monthly Surplus */}
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "14px 16px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Monthly Surplus</div>
          {dashLoading ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, color: "var(--ft-border2)" }}>—</div>
          ) : (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: monthlySurplus >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
              {formatGbp(Math.abs(monthlySurplus))}
              {monthlySurplus < 0 && <span style={{ fontSize: 10, marginLeft: 4, color: "var(--ft-red)" }}>deficit</span>}
            </div>
          )}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>
            {formatGbp(monthlyIncome)} in · {formatGbp(monthlyExpenses)} out
          </div>
        </div>

        {/* Tile 2: Total Goals Needed */}
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "14px 16px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Total Goals Needed</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--ft-text)" }}>
            {formatGbp(totalGoalsNeeded)}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>
            {unachievedGoals.length} goal{unachievedGoals.length !== 1 ? "s" : ""} in progress
          </div>
        </div>

        {/* Tile 3: Combined Monthly Needed */}
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "14px 16px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Monthly Needed</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--ft-accent)" }}>
            {combinedMonthlyNeeded > 0 ? formatGbp(combinedMonthlyNeeded) : "—"}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>
            to hit all deadlines
          </div>
        </div>

        {/* Tile 4: Feasibility */}
        <div style={{
          background: "var(--ft-surface)",
          border: `1px solid ${feasibilityStatus === "on-track" ? "rgba(86,211,100,0.3)" : feasibilityStatus === "tight" ? "rgba(230,180,80,0.3)" : feasibilityStatus === "shortfall" ? "rgba(255,123,114,0.3)" : "var(--ft-border)"}`,
          padding: "14px 16px",
        }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Feasibility</div>
          {feasibilityStatus === "none" ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-dim)" }}>No deadlines set</div>
          ) : feasibilityStatus === "on-track" ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-green)", letterSpacing: "0.05em" }}>ON TRACK</div>
          ) : feasibilityStatus === "tight" ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-amber)", letterSpacing: "0.05em" }}>TIGHT</div>
          ) : (
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-red)", letterSpacing: "0.04em" }}>SHORTFALL</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-red)", marginTop: 2 }}>{formatGbp(shortfall)}/mo short</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 3: Goal Insights Summary (between banner and grid) ── */}
      {goals.length >= 2 && (mostUrgent || biggestGap || closestToDone) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto" }}>
          {mostUrgent && (
            <div style={{
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border)",
              borderLeft: `3px solid ${mostUrgent.color ?? PRESET_COLORS[0]}`,
              padding: "12px 14px",
              minWidth: 180,
              flexShrink: 0,
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Most Urgent</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <GoalIcon emoji={mostUrgent.emoji} color={mostUrgent.color ?? PRESET_COLORS[0]} size={13} /> {mostUrgent.name}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-amber)", fontWeight: 600 }}>
                {Math.max(daysUntil(mostUrgent.deadline!), 0)}d remaining
              </div>
            </div>
          )}
          {biggestGap && (
            <div style={{
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border)",
              borderLeft: `3px solid ${biggestGap.color ?? PRESET_COLORS[0]}`,
              padding: "12px 14px",
              minWidth: 180,
              flexShrink: 0,
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Biggest Gap</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <GoalIcon emoji={biggestGap.emoji} color={biggestGap.color ?? PRESET_COLORS[0]} size={13} /> {biggestGap.name}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-red)", fontWeight: 600 }}>
                {formatGbp(biggestGap.target - biggestGap.current)} gap
              </div>
            </div>
          )}
          {closestToDone && (
            <div style={{
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border)",
              borderLeft: `3px solid ${closestToDone.color ?? PRESET_COLORS[0]}`,
              padding: "12px 14px",
              minWidth: 180,
              flexShrink: 0,
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Closest to Done</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <GoalIcon emoji={closestToDone.emoji} color={closestToDone.color ?? PRESET_COLORS[0]} size={13} /> {closestToDone.name}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-green)", fontWeight: 600 }}>
                {((closestToDone.current / closestToDone.target) * 100).toFixed(0)}% — almost there!
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Overall progress bar ── */}
      {goals.length > 0 && (
        <div style={{
          background: "var(--ft-surface)",
          border: "1px solid var(--ft-border)",
          padding: "14px 20px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
        }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)", marginBottom: 4 }}>
              <span style={{ color: "var(--ft-green)", fontWeight: 700, fontSize: 18 }}>{formatGbp(totalSaved)}</span>
              <span style={{ color: "var(--ft-dim)" }}> saved towards </span>
              <span style={{ color: "var(--ft-text)", fontWeight: 700, fontSize: 18 }}>{formatGbp(totalTarget)}</span>
              <span style={{ color: "var(--ft-dim)" }}> total targets</span>
            </div>
            <div style={{ height: 4, background: "var(--ft-border)", borderRadius: 2, marginTop: 8, width: 280 }}>
              <div style={{ height: "100%", width: `${totalPct}%`, background: "var(--ft-green)", borderRadius: 2 }} />
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>
              {totalPct.toFixed(1)}% overall
            </div>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", textAlign: "right" }}>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: "var(--ft-text)", fontWeight: 600 }}>{goals.length}</span> goal{goals.length !== 1 ? "s" : ""}
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: "var(--ft-green)", fontWeight: 600 }}>{achievedGoals.length}</span> achieved
            </div>
            <div>
              <span style={{ color: "var(--ft-accent)", fontWeight: 600 }}>{unachievedGoals.length}</span> in progress
            </div>
          </div>
        </div>
      )}

      {/* ── Add Goal Form ── */}
      {showForm && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: 20, marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>
            New Goal
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Goal Name</label>
              <input type="text" placeholder="e.g. Holiday Fund" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Emoji</label>
              <input type="text" placeholder="✈️" value={form.emoji} onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))} style={{ ...inputStyle, width: "auto" }} />
            </div>
            <div>
              <label style={labelStyle}>Target Amount (£)</label>
              <input type="number" placeholder="5000" value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Already Saved (£)</label>
              <input type="number" placeholder="0" value={form.current} onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Monthly Contribution (£, optional)</label>
              <input type="number" placeholder="200" value={form.monthlyContribution} onChange={(e) => setForm((f) => ({ ...f, monthlyContribution: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Deadline (optional)</label>
              <input type="date" value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} style={{ ...inputStyle, color: form.deadline ? "var(--ft-text)" : "var(--ft-dim)" }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Accent Color</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: c,
                      border: form.color === c ? "2px solid var(--ft-text)" : "2px solid transparent",
                      cursor: "pointer",
                      outline: form.color === c ? "1px solid var(--ft-accent)" : "none",
                    }}
                  />
                ))}
              </div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Goal Image (optional)</label>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => handleGoalImageFile(e.target.files?.[0])}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  onClick={() => imageInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); handleGoalImageFile(e.dataTransfer.files[0]); }}
                  style={{
                    width: 52, height: 52, borderRadius: "50%",
                    border: "1px dashed var(--ft-border2)",
                    background: "var(--ft-raised)",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden", flexShrink: 0,
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--ft-accent)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--ft-border2)")}
                >
                  {form.image ? (
                    <img src={form.image} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textAlign: "center", lineHeight: 1.4, padding: "0 4px" }}>CLICK<br />DROP</span>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 4 }}>Displayed in the goal ring · max 5 MB</div>
                  {form.image && (
                    <button
                      onClick={() => setForm((f) => ({ ...f, image: "" }))}
                      style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-red)", background: "none", border: "1px solid var(--ft-red)", padding: "2px 8px", cursor: "pointer", letterSpacing: "0.04em" }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSave}
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", background: "var(--ft-green)", color: "var(--ft-base)", border: "none", padding: "7px 20px", cursor: "pointer" }}
            >
              Save Goal
            </button>
            <button
              onClick={() => { setShowForm(false); setForm({ ...EMPTY_FORM }); }}
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", background: "transparent", color: "var(--ft-muted)", border: "1px solid var(--ft-border)", padding: "7px 16px", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Empty State ── */}
      {goals.length === 0 && !showForm && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 40px", border: "1px dashed var(--ft-border)", background: "var(--ft-surface)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 32, color: "var(--ft-border2)", letterSpacing: "0.02em", marginBottom: 16, lineHeight: 1, userSelect: "none" }}>
            {"┌─────────────┐"}<br />
            {"│  £  ●  ○  ○  │"}<br />
            {"│  TARGET     │"}<br />
            {"│  ──────     │"}<br />
            {"│  SAVINGS    │"}<br />
            {"└─────────────┘"}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ft-muted)", marginBottom: 6, textAlign: "center" }}>
            Start your first savings goal
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", textAlign: "center", marginBottom: 20 }}>
            Track progress toward a holiday, emergency fund, or any financial milestone.
          </div>
          <button
            onClick={() => setShowForm(true)}
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", background: "var(--ft-accent)", color: "var(--ft-base)", border: "none", padding: "8px 24px", cursor: "pointer" }}
          >
            + Create First Goal
          </button>
        </div>
      )}

      {/* ── Goal Cards Grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {goals.map((goal) => {
          const pct = Math.min((goal.current / goal.target) * 100, 100);
          const done = goal.current >= goal.target;
          const color = goal.color ?? PRESET_COLORS[0];
          const remaining = Math.max(goal.target - goal.current, 0);
          const dlInfo = goal.deadline ? deadlineLabel(goal.deadline) : null;
          const isAnalyticsOpen = expandedAnalytics[goal.id] ?? false;
          const useCompound = compoundToggles[goal.id] ?? false;
          const priorityRank = rankedGoalIds.indexOf(goal.id) + 1;

          // Determine which monthly rate to use for this goal
          const goalMonthlyRate = goal.monthlyContribution ?? sharedMonthlyRate;

          // Projected completion (no returns)
          let projectedMonths = Infinity;
          if (!done && goalMonthlyRate > 0) {
            projectedMonths = Math.ceil(remaining / goalMonthlyRate);
          }
          const projectedDate = projectedMonths < Infinity ? addMonths(now, projectedMonths) : null;

          // Required monthly to hit deadline
          let requiredMonthly = 0;
          let deadlineMonthsRemaining = 0;
          if (goal.deadline) {
            deadlineMonthsRemaining = monthsBetween(now, new Date(goal.deadline));
            if (deadlineMonthsRemaining > 0) {
              requiredMonthly = remaining / deadlineMonthsRemaining;
            }
          }

          // Deadline feasibility
          type DeadlineFeasibility = "achievable" | "stretch" | "notfeasible" | null;
          let deadlineFeasibility: DeadlineFeasibility = null;
          const surplusForGoal = goal.monthlyContribution ?? monthlySurplus;
          if (goal.deadline && deadlineMonthsRemaining > 0 && !done) {
            if (requiredMonthly <= surplusForGoal) {
              deadlineFeasibility = "achievable";
            } else {
              const overPct = (requiredMonthly - surplusForGoal) / surplusForGoal;
              deadlineFeasibility = overPct <= 0.5 ? "stretch" : "notfeasible";
            }
          }

          // Compound growth projections
          const ANNUAL_RATE = 0.06;
          const monthlyR = ANNUAL_RATE / 12;
          let compoundMonths = Infinity;
          if (!done && goalMonthlyRate > 0) {
            compoundMonths = calcMonthsWithGrowth(goal.current, goal.target, goalMonthlyRate, ANNUAL_RATE);
          }
          const compoundDate = compoundMonths < Infinity ? addMonths(now, compoundMonths) : null;
          const interestEarned =
            compoundMonths < Infinity && goalMonthlyRate > 0
              ? calcFV(goal.current, goalMonthlyRate, monthlyR, compoundMonths) -
                (goal.current + goalMonthlyRate * compoundMonths)
              : 0;

          // Sparkline (last 6 history entries, 2+ needed)
          const history = goal.history ?? [];
          const recentHistory = history.slice(-6);
          const maxHistory = recentHistory.reduce((m, h) => Math.max(m, h.amount), goal.target);

          // Projected year for ring label
          const projYear = projectedDate ? projectedDate.getFullYear() : null;

          return (
            <div
              key={goal.id}
              style={{
                background: "var(--ft-surface)",
                border: `1px solid ${done ? "rgba(86,211,100,0.3)" : "var(--ft-border)"}`,
                padding: 20,
                position: "relative",
                boxShadow: done ? `0 0 24px rgba(86,211,100,0.08), 0 0 8px rgba(86,211,100,0.12)` : undefined,
              }}
            >
              {/* Priority badge */}
              {!done && priorityRank > 0 && (
                <div style={{
                  position: "absolute",
                  top: 10,
                  left: 10,
                  background: "var(--ft-raised)",
                  border: "1px solid var(--ft-border2)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  fontWeight: 700,
                  color: "var(--ft-dim)",
                  padding: "2px 5px",
                  letterSpacing: "0.05em",
                }}>
                  #{priorityRank}
                </div>
              )}

              {/* Delete button */}
              <button
                onClick={() => handleDelete(goal.id)}
                style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", color: "var(--ft-dim)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 14, lineHeight: 1, padding: 2 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ft-red)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ft-dim)"; }}
              >
                ×
              </button>

              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12, paddingTop: !done && priorityRank > 0 ? 14 : 0 }}>
                {/* Progress ring */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <div style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    background: `conic-gradient(${done ? "#56D364" : color} ${pct}%, var(--ft-border) 0)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    boxShadow: done ? `0 0 12px rgba(86,211,100,0.35)` : undefined,
                  }}>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--ft-surface)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                      {goal.image ? (
                        <img src={goal.image} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <GoalIcon emoji={goal.emoji} color={color} size={18} />
                      )}
                    </div>
                  </div>
                  {!done && projYear && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 3, letterSpacing: "0.04em" }}>
                      ~{projYear}
                    </div>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)", marginBottom: 4, paddingRight: 24, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {goal.name}
                  </div>
                  {done ? (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(86,211,100,0.12)", border: "1px solid rgba(86,211,100,0.3)", padding: "2px 8px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-green)" }}>
                      ACHIEVED <Trophy size={9} style={{ display: "inline", verticalAlign: "middle" }} />
                    </div>
                  ) : dlInfo ? (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: dlInfo.isOverdue ? "var(--ft-red)" : "var(--ft-dim)", fontWeight: dlInfo.isOverdue ? 700 : 400, letterSpacing: dlInfo.isOverdue ? "0.08em" : undefined }}>
                      {dlInfo.text}
                    </div>
                  ) : null}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: done ? "var(--ft-green)" : color }}>
                    {formatGbp(goal.current)}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", marginLeft: 6 }}>
                    / {formatGbp(goal.target)}
                  </span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: done ? "var(--ft-green)" : "var(--ft-muted)" }}>
                  {pct.toFixed(0)}%
                </div>
              </div>

              <div style={{ height: 6, background: "var(--ft-border)", borderRadius: 3, marginBottom: 8, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: done ? "#56D364" : color, borderRadius: 3, transition: "width 0.4s ease" }} />
              </div>

              {!done && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 12 }}>
                  {formatGbp(remaining)} remaining
                  {goal.monthlyContribution && (
                    <span style={{ color: "var(--ft-accent)", marginLeft: 8 }}>· {formatGbp(goal.monthlyContribution)}/mo allocated</span>
                  )}
                </div>
              )}

              {!done && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>Add £</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={addFunds[goal.id] ?? ""}
                    onChange={(e) => setAddFunds((prev) => ({ ...prev, [goal.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && handleAddFunds(goal.id)}
                    style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "4px 8px", outline: "none", minWidth: 0 }}
                  />
                  <button
                    onClick={() => handleAddFunds(goal.id)}
                    style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", background: "transparent", color: color, border: `1px solid ${color}`, padding: "4px 10px", cursor: "pointer", flexShrink: 0 }}
                  >
                    Add
                  </button>
                </div>
              )}

              {/* ── Section 2: Per-goal Analytics Panel ── */}
              {!done && (
                <div style={{ marginTop: 12 }}>
                  <button
                    onClick={() => setExpandedAnalytics((prev) => ({ ...prev, [goal.id]: !prev[goal.id] }))}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: isAnalyticsOpen ? "var(--ft-accent)" : "var(--ft-dim)",
                    }}
                  >
                    {isAnalyticsOpen ? <ChevronDown size={8} /> : <ChevronRight size={8} />}
                    Analytics
                  </button>

                  {isAnalyticsOpen && (
                    <div style={{ marginTop: 10, borderTop: "1px solid var(--ft-border)", paddingTop: 10 }}>
                      {/* Projections row */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                        <div style={{ background: "var(--ft-raised)", padding: "8px 10px", border: "1px solid var(--ft-border)" }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>Months to Complete</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)" }}>
                            {projectedMonths < Infinity ? projectedMonths : "—"}
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>
                            at {formatGbp(goalMonthlyRate)}/mo
                          </div>
                        </div>

                        {goal.deadline && deadlineMonthsRemaining > 0 && (
                          <div style={{ background: "var(--ft-raised)", padding: "8px 10px", border: "1px solid var(--ft-border)" }}>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>Required Monthly</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)" }}>
                              {formatGbp(requiredMonthly)}
                            </div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>
                              to hit deadline
                            </div>
                          </div>
                        )}

                        {projectedDate && (
                          <div style={{ background: "var(--ft-raised)", padding: "8px 10px", border: "1px solid var(--ft-border)" }}>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>Projected Date</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: color }}>
                              {formatMonthYear(projectedDate)}
                            </div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>
                              at current rate
                            </div>
                          </div>
                        )}

                        {deadlineFeasibility && (
                          <div style={{ background: "var(--ft-raised)", padding: "8px 10px", border: "1px solid var(--ft-border)" }}>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>Deadline Status</div>
                            {deadlineFeasibility === "achievable" && (
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-green)", display: "flex", alignItems: "center", gap: 4 }}><Check size={10} /> Achievable</div>
                            )}
                            {deadlineFeasibility === "stretch" && (
                              <div>
                                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-amber)", display: "flex", alignItems: "center", gap: 4 }}><AlertTriangle size={10} /> Stretch</div>
                                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-amber)", marginTop: 2 }}>
                                  need {formatGbp(requiredMonthly - surplusForGoal)}/mo more
                                </div>
                              </div>
                            )}
                            {deadlineFeasibility === "notfeasible" && (
                              <div>
                                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-red)", display: "flex", alignItems: "center", gap: 4 }}><XIcon size={10} /> Not feasible</div>
                                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-red)", marginTop: 2 }}>
                                  need {formatGbp(requiredMonthly - surplusForGoal)}/mo more
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Suggest Deadline */}
                      {!goal.deadline && projectedDate && (
                        <div style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "8px 10px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                            At current rate: done ~{formatMonthYear(projectedDate)}
                          </div>
                          <button
                            onClick={() => handleSetDeadline(goal.id, projectedDate.toISOString().slice(0, 10))}
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 8,
                              letterSpacing: "0.05em",
                              textTransform: "uppercase",
                              background: "transparent",
                              color: "var(--ft-accent)",
                              border: "1px solid var(--ft-accent)",
                              padding: "3px 8px",
                              cursor: "pointer",
                              flexShrink: 0,
                            }}
                          >
                            Set as deadline
                          </button>
                        </div>
                      )}

                      {/* Compound Growth toggle */}
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)", letterSpacing: "0.05em" }}>
                          <input
                            type="checkbox"
                            checked={useCompound}
                            onChange={(e) => setCompoundToggles((prev) => ({ ...prev, [goal.id]: e.target.checked }))}
                            style={{ accentColor: color, width: 11, height: 11 }}
                          />
                          Include 6% investment returns
                        </label>

                        {useCompound && goalMonthlyRate > 0 && (
                          <div style={{ marginTop: 8, background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "8px 10px" }}>
                            <div style={{ display: "flex", gap: 12, marginBottom: 6 }}>
                              <div>
                                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginBottom: 2 }}>Without returns</div>
                                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--ft-muted)" }}>
                                  {projectedDate ? formatMonthYear(projectedDate) : "—"}
                                </div>
                              </div>
                              <div style={{ color: "var(--ft-border2)", fontFamily: "var(--font-mono)", fontSize: 10, alignSelf: "flex-end" }}>→</div>
                              <div>
                                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginBottom: 2 }}>With 6% returns</div>
                                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-green)" }}>
                                  {compoundDate ? formatMonthYear(compoundDate) : "—"}
                                </div>
                              </div>
                            </div>
                            {interestEarned > 0 && (
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-green)" }}>
                                +{formatGbp(interestEarned)} total interest earned
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Savings History Sparkline */}
                      {recentHistory.length >= 2 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>History</div>
                          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 30, width: 80 }}>
                            {recentHistory.map((h, i) => {
                              const barH = maxHistory > 0 ? Math.max((h.amount / maxHistory) * 28, 2) : 2;
                              return (
                                <div
                                  key={i}
                                  title={`${h.date}: ${formatGbp(h.amount)}`}
                                  style={{
                                    flex: 1,
                                    height: barH,
                                    background: i === recentHistory.length - 1 ? color : `${color}66`,
                                    borderRadius: 1,
                                  }}
                                />
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
