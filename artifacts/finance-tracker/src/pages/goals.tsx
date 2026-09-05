import { useState, useRef, useMemo, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, Line, ResponsiveContainer, CartesianGrid } from "recharts";
import { Skeleton as FtSkeleton } from "@/components/skeleton";
import { ErrorState } from "@/components/error-state";
import { Target, Trophy, Check, AlertTriangle, X as XIcon, ChevronDown, ChevronRight } from "lucide-react";
import { formatBaseMoney } from "@/lib/utils";
import { loadPersonaIds, PERSONA_COLORS } from "@/lib/persona";
import { PageHeader } from "@/components/page-header";
import {
  useGetDashboard,
  useListGoals, useCreateGoal, useUpdateGoal, useDeleteGoal, useAddGoalFunds,
  getListGoalsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { oneShotInsight } from "@/lib/ai-chat-client";
import { HStack, MonoLabel, Panel, PanelBox, PanelHeader, Text, VStack } from "@/components/primitives";

interface HistoryEntry {
  date: string;
  amount: number;
}

interface Goal {
  id: number;
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

// ── Utility functions ─────────────────────────────────────────────────────────

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

function calcFV(current: number, monthlyContrib: number, r: number, n: number): number {
  if (r === 0) return current + monthlyContrib * n;
  return current * Math.pow(1 + r, n) + monthlyContrib * ((Math.pow(1 + r, n) - 1) / r);
}

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

// ── Sub-components (module level) ─────────────────────────────────────────────

function GoalIcon({ emoji, color, size = 18 }: { emoji?: string; color?: string; size?: number }) {
  if (emoji) return <span style={{ fontSize: size, lineHeight: 1 }}>{emoji}</span>;
  return <Target size={size} color={color ?? "var(--ft-accent)"} />;
}

interface KpiCellProps {
  label: string;
  children: React.ReactNode;
  sub?: React.ReactNode;
}

function KpiCell({ label, children, sub }: KpiCellProps) {
  return (
    <div className="ft-kpi-bar-cell" style={{
      background: "var(--ft-surface)",
      padding: "10px 16px",
      minWidth: 110,
    }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 4 }}>
        {label}
      </div>
      {children}
      {sub && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 3 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

interface InsightCardProps {
  label: string;
  name: React.ReactNode;
  value: React.ReactNode;
  accentColor: string;
}

function InsightCard({ label, name, value, accentColor }: InsightCardProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
      style={{
        background: hov ? `color-mix(in srgb, ${accentColor} 5%, var(--ft-surface))` : "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        padding: "12px 14px",
        minWidth: 180,
        flexShrink: 0,
        transition: "background 0.1s",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.07em", textTransform: "uppercase" as const, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
        <span style={{ color: accentColor, marginRight: 6 }}>■</span>{name}
      </div>
      <Text as="div" mono size={10} weight={600}>
        {value}
      </Text>
    </div>
  );
}

// ── VelocityBadge ─────────────────────────────────────────────────────────────

interface VelocityBadgeProps {
  goal: Goal;
  monthlyRate: number;
  now: Date;
}

function VelocityBadge({ goal, monthlyRate, now }: VelocityBadgeProps) {
  if (goal.current >= goal.target) return null;
  if (!goal.deadline) return null;

  const remaining = Math.max(goal.target - goal.current, 0);
  const monthsLeft = monthsBetween(now, new Date(goal.deadline));
  if (monthsLeft <= 0) return null;

  if (monthlyRate <= 0) {
    return (
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.07em", padding: "2px 6px", background: "rgba(255,123,114,0.12)", border: "1px solid rgba(255,123,114,0.3)", color: "var(--ft-red)" }}>
        NO CONTRIBUTIONS
      </span>
    );
  }

  const projectedMonths = Math.ceil(remaining / monthlyRate);
  const diffMonths = monthsLeft - projectedMonths;

  if (Math.abs(diffMonths) <= 1) {
    return (
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.07em", padding: "2px 6px", background: "rgba(86,211,100,0.12)", border: "1px solid rgba(86,211,100,0.3)", color: "var(--ft-green)" }}>
        ON TRACK ✓
      </span>
    );
  }

  if (diffMonths > 1) {
    return (
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.07em", padding: "2px 6px", background: "rgba(86,211,100,0.12)", border: "1px solid rgba(86,211,100,0.3)", color: "var(--ft-green)" }}>
        AHEAD +{diffMonths}mo ↑
      </span>
    );
  }

  const behindMonths = Math.abs(diffMonths);
  const badgeColor = behindMonths <= 3 ? "var(--ft-amber)" : "var(--ft-red)";
  const bg = behindMonths <= 3 ? "rgba(230,180,80,0.12)" : "rgba(255,123,114,0.12)";
  const border = behindMonths <= 3 ? "rgba(230,180,80,0.3)" : "rgba(255,123,114,0.3)";

  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.07em", padding: "2px 6px", background: bg, border: `1px solid ${border}`, color: badgeColor }}>
      BEHIND -{behindMonths}mo ↓
    </span>
  );
}

// ── GoalCard ──────────────────────────────────────────────────────────────────

interface GoalCardProps {
  goal: Goal;
  now: Date;
  sharedMonthlyRate: number;
  monthlySurplus: number;
  rankedGoalIds: number[];
  deleteConfirmId: number | null;
  addFundsValue: string;
  expandedAnalytics: boolean;
  useCompound: boolean;
  annualRate: number;
  whatIfMonthly: string;
  onAddFunds: (id: number) => void;
  onAddFundsChange: (id: number, val: string) => void;
  onDeleteClick: (id: number) => void;
  onToggleAnalytics: (id: number) => void;
  onToggleCompound: (id: number, val: boolean) => void;
  onCompoundRateChange: (id: number, val: number) => void;
  onWhatIfChange: (id: number, val: string) => void;
  onSetDeadline: (id: number, deadline: string) => void;
}

function GoalCard({
  goal, now, sharedMonthlyRate, monthlySurplus, rankedGoalIds,
  deleteConfirmId, addFundsValue, expandedAnalytics, useCompound,
  annualRate, whatIfMonthly, onAddFunds, onAddFundsChange,
  onDeleteClick, onToggleAnalytics, onToggleCompound,
  onCompoundRateChange, onWhatIfChange, onSetDeadline,
}: GoalCardProps) {
  const isMobile = useIsMobile();
  const [hov, setHov] = useState(false);

  const pct = Math.min((goal.current / goal.target) * 100, 100);
  const done = goal.current >= goal.target;
  const color = goal.color ?? PRESET_COLORS[0];
  const remaining = Math.max(goal.target - goal.current, 0);
  const dlInfo = goal.deadline ? deadlineLabel(goal.deadline) : null;
  const isAnalyticsOpen = expandedAnalytics;
  const priorityRank = rankedGoalIds.indexOf(goal.id) + 1;

  const goalMonthlyRate = goal.monthlyContribution ?? sharedMonthlyRate;

  let projectedMonths = Infinity;
  if (!done && goalMonthlyRate > 0) {
    projectedMonths = Math.ceil(remaining / goalMonthlyRate);
  }
  const projectedDate = projectedMonths < Infinity ? addMonths(now, projectedMonths) : null;

  let requiredMonthly = 0;
  let deadlineMonthsRemaining = 0;
  if (goal.deadline) {
    deadlineMonthsRemaining = monthsBetween(now, new Date(goal.deadline));
    if (deadlineMonthsRemaining > 0) {
      requiredMonthly = remaining / deadlineMonthsRemaining;
    }
  }

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

  const monthlyR = annualRate / 12;
  let compoundMonths = Infinity;
  if (!done && goalMonthlyRate > 0) {
    compoundMonths = calcMonthsWithGrowth(goal.current, goal.target, goalMonthlyRate, annualRate);
  }
  const compoundDate = compoundMonths < Infinity ? addMonths(now, compoundMonths) : null;
  const interestEarned =
    compoundMonths < Infinity && goalMonthlyRate > 0
      ? calcFV(goal.current, goalMonthlyRate, monthlyR, compoundMonths) -
        (goal.current + goalMonthlyRate * compoundMonths)
      : 0;

  const whatIfVal = parseFloat(whatIfMonthly);
  const whatIfMonthsNeeded =
    !isNaN(whatIfVal) && whatIfVal > 0 && !done
      ? calcMonthsWithGrowth(goal.current, goal.target, whatIfVal, useCompound ? annualRate : 0)
      : null;
  const whatIfDate =
    whatIfMonthsNeeded !== null && whatIfMonthsNeeded < Infinity
      ? addMonths(now, whatIfMonthsNeeded)
      : null;

  const history = goal.history ?? [];
  const projYear = projectedDate ? projectedDate.getFullYear() : null;
  const barColor = done ? "#56D364" : pct >= 75 ? "var(--ft-green)" : pct >= 40 ? "#e3b341" : "var(--ft-red)";
  const deadlineDays = goal.deadline ? daysUntil(goal.deadline) : null;
  const deadlineUrgencyColor = dlInfo?.isOverdue
    ? "var(--ft-red)"
    : deadlineDays !== null && deadlineDays < 90
    ? "var(--ft-amber)"
    : "var(--ft-dim)";

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
      style={{
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        padding: isMobile ? "12px 14px" : "14px 16px",
        position: "relative",
        opacity: done ? 0.7 : 1,
        transition: "background 0.1s",
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
        onClick={() => onDeleteClick(goal.id)}
        style={{ position: "absolute", top: 8, right: 8, background: deleteConfirmId === goal.id ? "var(--ft-red)" : "none", border: "none", color: deleteConfirmId === goal.id ? "#fff" : "var(--ft-dim)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: deleteConfirmId === goal.id ? 8 : 14, lineHeight: 1, padding: deleteConfirmId === goal.id ? "6px 8px" : "6px 6px", letterSpacing: "0.06em", minHeight: 44, minWidth: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
        onMouseEnter={(e) => { if (deleteConfirmId !== goal.id) e.currentTarget.style.color = "var(--ft-red)"; }}
        onMouseLeave={(e) => { if (deleteConfirmId !== goal.id) e.currentTarget.style.color = "var(--ft-dim)"; }}
        title={deleteConfirmId === goal.id ? "Click again to confirm delete" : "Delete goal"}
      >
        {deleteConfirmId === goal.id ? "DELETE?" : "×"}
      </button>

      {/* Goal Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14, paddingTop: !done && priorityRank > 0 ? 14 : 0 }}>
        <VStack align="center" shrink={false}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: `conic-gradient(${done ? "#56D364" : color} ${pct}%, var(--ft-border) 0)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
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
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 3, letterSpacing: "0.04em", textAlign: "center" }}>
              ~{projYear}
            </div>
          )}
          {!done && useCompound && compoundDate && compoundDate.getFullYear() !== projYear && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-green)", marginTop: 1, letterSpacing: "0.03em", textAlign: "center" }}>
              ~{compoundDate.getFullYear()} {(annualRate * 100).toFixed(0)}%↑
            </div>
          )}
        </VStack>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-text)", paddingRight: 28, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {goal.name}
          </div>
          <HStack gap={6} align="center" wrap marginTop={5}>
            {done ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(86,211,100,0.12)", border: "1px solid rgba(86,211,100,0.3)", padding: "2px 8px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-green)" }}>
                ACHIEVED <Trophy size={9} style={{ display: "inline", verticalAlign: "middle" }} />
              </span>
            ) : (
              <VelocityBadge goal={goal} monthlyRate={goalMonthlyRate} now={now} />
            )}
            {dlInfo && !done && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: deadlineUrgencyColor, fontWeight: dlInfo.isOverdue ? 700 : 400, letterSpacing: "0.04em" }}>
                {dlInfo.text}
              </span>
            )}
          </HStack>
        </div>
      </div>

      {/* Progress bar + percentage */}
      <div style={{ marginBottom: 10 }}>
        <HStack align="baseline" justify="between" marginBottom={6}>
          <div>
            <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: done ? "var(--ft-green)" : pct >= 75 ? "var(--ft-green)" : pct >= 40 ? "#e3b341" : "var(--ft-red)" }}>
              {pct.toFixed(0)}%
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginLeft: 4 }}>funded</span>
          </div>
          <div style={{ textAlign: "right" }}>
            <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: done ? "var(--ft-green)" : "var(--ft-text)" }}>
              {formatBaseMoney(goal.current)}
            </span>
            <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginLeft: 2 }}>
              / {formatBaseMoney(goal.target)}
            </span>
          </div>
        </HStack>
        <div style={{ height: 8, background: "var(--ft-border)", overflow: "hidden", position: "relative" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: barColor, transition: "width 0.25s ease" }} />
        </div>
        {!done && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5 }}>
            <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
              {formatBaseMoney(remaining)} remaining
            </span>
            {goal.monthlyContribution && (
              <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-accent)" }}>
                {formatBaseMoney(goal.monthlyContribution)}/mo
              </span>
            )}
          </div>
        )}
      </div>

      {/* Contribution form */}
      {!done && (
        <div style={{
          display: "flex",
          gap: 0,
          alignItems: "stretch",
          marginTop: 10,
          border: "1px solid var(--ft-border2)",
          background: "var(--ft-raised)",
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0, padding: "6px 8px", borderRight: "1px solid var(--ft-border2)", alignSelf: "center" }}>£</span>
          <input
            type="number"
            placeholder="Add funds…"
            value={addFundsValue}
            onChange={(e) => onAddFundsChange(goal.id, e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAddFunds(goal.id)}
            style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 12, background: "transparent", border: "none", color: "var(--ft-text)", padding: "6px 8px", outline: "none", minWidth: 0 }}
          />
          <button
            onClick={() => onAddFunds(goal.id)}
            style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", background: color, color: "var(--ft-base)", border: "none", padding: "6px 14px", cursor: "pointer", flexShrink: 0, fontWeight: 700 }}
          >
            Add
          </button>
        </div>
      )}

      {/* Analytics Panel */}
      {!done && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => onToggleAnalytics(goal.id)}
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
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                  marginBottom: 10,
                }}
              >
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "8px 10px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>Months to Complete</div>
                  <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)" }}>
                    {projectedMonths < Infinity ? projectedMonths : "—"}
                  </div>
                  <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>
                    at {formatBaseMoney(goalMonthlyRate)}/mo
                  </div>
                </div>

                {goal.deadline && deadlineMonthsRemaining > 0 && (
                  <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "8px 10px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>Required Monthly</div>
                    <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)" }}>
                      {formatBaseMoney(requiredMonthly)}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>
                      to hit deadline
                    </div>
                  </div>
                )}

                {projectedDate && (
                  <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "8px 10px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>Projected Date</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color }}>
                      {formatMonthYear(projectedDate)}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>
                      at current rate
                    </div>
                  </div>
                )}

                {deadlineFeasibility && (
                  <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "8px 10px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>Deadline Status</div>
                    {deadlineFeasibility === "achievable" && (
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-green)", display: "flex", alignItems: "center", gap: 4 }}><Check size={10} /> Achievable</div>
                    )}
                    {deadlineFeasibility === "stretch" && (
                      <div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-amber)", display: "flex", alignItems: "center", gap: 4 }}><AlertTriangle size={10} /> Stretch</div>
                        <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-amber)", marginTop: 2 }}>
                          need {formatBaseMoney(requiredMonthly - surplusForGoal)}/mo more
                        </div>
                      </div>
                    )}
                    {deadlineFeasibility === "notfeasible" && (
                      <div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-red)", display: "flex", alignItems: "center", gap: 4 }}><XIcon size={10} /> Not feasible</div>
                        <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-red)", marginTop: 2 }}>
                          need {formatBaseMoney(requiredMonthly - surplusForGoal)}/mo more
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
                    onClick={() => onSetDeadline(goal.id, projectedDate.toISOString().slice(0, 10))}
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
                <HStack gap={8} align="center" justify="between" wrap marginBottom={useCompound ? 8 : 0}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)", letterSpacing: "0.05em" }}>
                    <input
                      type="checkbox"
                      checked={useCompound}
                      onChange={(e) => onToggleCompound(goal.id, e.target.checked)}
                      style={{ accentColor: color, width: 11, height: 11 }}
                    />
                    Include investment returns
                  </label>
                  {useCompound && (
                    <HStack gap={3}>
                      {[0.04, 0.06, 0.08].map((r) => (
                        <button
                          key={r}
                          onClick={() => onCompoundRateChange(goal.id, r)}
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 8,
                            letterSpacing: "0.04em",
                            padding: "2px 6px",
                            border: `1px solid ${annualRate === r ? color : "var(--ft-border2)"}`,
                            background: annualRate === r ? `${color}20` : "transparent",
                            color: annualRate === r ? color : "var(--ft-dim)",
                            cursor: "pointer",
                          }}
                        >
                          {(r * 100).toFixed(0)}%
                        </button>
                      ))}
                    </HStack>
                  )}
                </HStack>

                {useCompound && goalMonthlyRate > 0 && (
                  <div style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "8px 10px" }}>
                    <HStack gap={12} marginBottom={6}>
                      <div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginBottom: 2 }}>Without returns</div>
                        <Text as="div" mono size={10} weight={600} color="var(--ft-muted)">
                          {projectedDate ? formatMonthYear(projectedDate) : "—"}
                        </Text>
                      </div>
                      <div style={{ color: "var(--ft-border2)", fontFamily: "var(--font-mono)", fontSize: 10, alignSelf: "flex-end" }}>→</div>
                      <div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginBottom: 2 }}>With {(annualRate * 100).toFixed(0)}% returns</div>
                        <Text as="div" mono size={10} weight={700} color="var(--ft-green)">
                          {compoundDate ? formatMonthYear(compoundDate) : "—"}
                        </Text>
                      </div>
                      {compoundMonths < Infinity && projectedMonths < Infinity && compoundMonths < projectedMonths && (
                        <div style={{ alignSelf: "flex-end" }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginBottom: 2 }}>Time saved</div>
                          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-green)" }}>
                            {projectedMonths - compoundMonths}mo
                          </div>
                        </div>
                      )}
                    </HStack>
                    {interestEarned > 0 && (
                      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-green)" }}>
                        +{formatBaseMoney(Math.abs(interestEarned))} total interest earned
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* What-if calculator */}
              {!done && (
                <div style={{ marginBottom: 10, background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "8px 10px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
                    What if I contributed…
                  </div>
                  <HStack gap={6} align="center">
                    <Text as="span" mono size={9} color="var(--ft-dim)">£</Text>
                    <input
                      type="number"
                      placeholder={String(Math.ceil(goalMonthlyRate) || "200")}
                      value={whatIfMonthly}
                      onChange={(e) => onWhatIfChange(goal.id, e.target.value)}
                      style={{
                        width: 80,
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        background: "var(--ft-base)",
                        border: "1px solid var(--ft-border2)",
                        color: "var(--ft-text)",
                        padding: "3px 6px",
                        outline: "none",
                      }}
                    />
                    <Text as="span" mono size={9} color="var(--ft-dim)">/mo</Text>
                    {whatIfDate && (
                      <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color, fontWeight: 700, marginLeft: 8 }}>
                        → {formatMonthYear(whatIfDate)}
                      </span>
                    )}
                    {!isNaN(whatIfVal) && whatIfVal > 0 && whatIfMonthsNeeded === Infinity && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-red)", marginLeft: 8 }}>
                        insufficient
                      </span>
                    )}
                  </HStack>
                  {whatIfDate && whatIfMonthsNeeded !== null && projectedMonths < Infinity && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 4 }}>
                      {whatIfMonthsNeeded < projectedMonths
                        ? `${projectedMonths - whatIfMonthsNeeded}mo faster than current rate`
                        : whatIfMonthsNeeded > projectedMonths
                        ? `${whatIfMonthsNeeded - projectedMonths}mo slower`
                        : "same as current rate"}
                    </div>
                  )}
                </div>
              )}

              {/* Savings History Chart */}
              {history.length >= 2 && (() => {
                const lastEntry = history[history.length - 1];
                const projectedPoints: { date: string; amount?: number; projected?: number }[] = [];
                if (goalMonthlyRate > 0 && lastEntry.amount < goal.target) {
                  let current = lastEntry.amount;
                  const lastDate = new Date(lastEntry.date);
                  for (let m = 1; m <= 36 && current < goal.target; m++) {
                    current = Math.min(current + goalMonthlyRate, goal.target);
                    const d = new Date(lastDate.getFullYear(), lastDate.getMonth() + m, 1);
                    const lbl = d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }).replace(" ", " '");
                    projectedPoints.push({ date: lbl, projected: Math.round(current) });
                  }
                }

                const chartData: { date: string; amount?: number; projected?: number }[] = [
                  ...history.map((h) => {
                    const d = new Date(h.date);
                    const lbl = d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }).replace(" ", " '");
                    return { date: lbl, amount: h.amount };
                  }),
                  ...projectedPoints,
                ];

                const yTickFormatter = (v: number) =>
                  v >= 1000 ? `£${(v / 1000).toFixed(1)}k` : `£${v}`;

                return (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
                      History
                    </div>
                    <div style={{ width: "100%", height: 120 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="2 4" stroke="var(--ft-border)" vertical={false} />
                          <XAxis dataKey="date" interval="preserveStartEnd" tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }} tickLine={false} axisLine={{ stroke: "var(--ft-border)" }} />
                          <YAxis width={44} tickFormatter={yTickFormatter} tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 0, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-text)", padding: "4px 8px" }} labelStyle={{ color: "var(--ft-muted)", marginBottom: 2, fontSize: 8 }} formatter={(value: number, name: string) => [formatBaseMoney(value), name === "amount" ? "Saved" : "Projected"]} />
                          <ReferenceLine y={goal.target} stroke="var(--ft-dim)" strokeDasharray="4 3" strokeWidth={1} label={{ value: "TARGET", position: "insideTopRight", fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} />
                          <Area type="monotone" dataKey="amount" stroke={color} strokeWidth={1.5} fill={`${color}22`} dot={false} activeDot={{ r: 3, fill: color, strokeWidth: 0 }} connectNulls={false} />
                          <Line type="monotone" dataKey="projected" stroke="var(--ft-amber)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={{ r: 3, fill: "var(--ft-amber)", strokeWidth: 0 }} connectNulls={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── AiCoachCard (module level) ────────────────────────────────────────────────

interface AiCoachCardProps {
  text: string | null;
  loading: boolean;
}

function AiCoachCard({ text, loading }: AiCoachCardProps) {
  return (
    <Panel title="Coach" padding="12px 14px">
      {loading || text === null ? (
        <div style={{ height: 28, background: "var(--ft-raised)", borderRadius: 2, opacity: 0.5 }} />
      ) : (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)", lineHeight: 1.6 }}>
          {text}
        </div>
      )}
    </Panel>
  );
}

// ── AiGoalCoach ───────────────────────────────────────────────────────────────

interface GoalCoachItem {
  name: string;
  pctFunded: number;
  daysRemaining: number | null;
  monthlyShortfall: number;
}

interface AiGoalCoachProps {
  goalItems: GoalCoachItem[];
}

const GOALS_AI_CACHE_KEY = "ft-goals-ai-coach";

function AiGoalCoach({ goalItems }: AiGoalCoachProps) {
  const [insights, setInsights] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  function parseInsights(text: string): string[] {
    const numbered = text.match(/\d+[\.\)]\s+(.+?)(?=\d+[\.\)]|$)/gs);
    if (numbered && numbered.length >= 2) {
      return numbered.slice(0, 2).map((s) => s.replace(/^\d+[\.\)]\s+/, "").trim());
    }
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2) return lines.slice(0, 2);
    const sentences = text.split(/\.\s+/);
    if (sentences.length >= 2) {
      const mid = Math.floor(sentences.length / 2);
      return [
        sentences.slice(0, mid).join(". ").trim() + ".",
        sentences.slice(mid).join(". ").trim(),
      ];
    }
    return [text.trim(), ""];
  }

  async function fetchInsights(force = false) {
    if (!force) {
      const cached = sessionStorage.getItem(GOALS_AI_CACHE_KEY);
      if (cached) {
        try {
          setInsights(JSON.parse(cached) as string[]);
          setLoading(false);
          return;
        } catch {
          // fall through
        }
      }
    }
    setLoading(true);
    try {
      // Server reads goals + their progress via buildChatContext(userId, "/goals").
      // Prompt describes WHAT we want; server has WHAT'S TRUE.
      const result = await oneShotInsight({
        path: "/goals",
        prompt: "Give me 2 specific actionable insights about my goals progress. Each insight should be one sentence with a concrete recommendation.",
      });
      const parsed = parseInsights(result.text);
      sessionStorage.setItem(GOALS_AI_CACHE_KEY, JSON.stringify(parsed));
      setInsights(parsed);
    } catch {
      setInsights(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const timer = setTimeout(() => fetchInsights(), 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loading && (insights === null || insights.every((s) => !s))) return null;

  const cards = loading ? [null, null] : insights!;

  return (
    <div
      className="ft-two-col"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 6,
        marginBottom: 6,
      }}
    >
      {cards.map((text, i) => (
        <AiCoachCard key={i} text={text} loading={loading} />
      ))}
    </div>
  );
}

// ── Persona templates ─────────────────────────────────────────────────────────

const PERSONA_GOAL_TEMPLATES: Record<string, Array<{ emoji: string; name: string; target: number; tip: string }>> = {
  market:  [
    { emoji: "", name: "Investment Capital", target: 5000, tip: "Dry powder for new positions" },
    { emoji: "", name: "Emergency Fund", target: 10000, tip: "3-6 months of living costs" },
  ],
  budget:  [
    { emoji: "", name: "Emergency Fund", target: 3000, tip: "3 months of essential expenses" },
    { emoji: "", name: "Holiday Fund", target: 2000, tip: "Annual trip savings target" },
  ],
  wealth:  [
    { emoji: "", name: "Emergency Fund", target: 15000, tip: "6 months of expenses — non-negotiable" },
    { emoji: "", name: "FIRE Number", target: 750000, tip: "Adjust to 25× your annual spend" },
    { emoji: "", name: "ISA Allowance", target: 20000, tip: "Max your annual ISA contribution" },
  ],
  social:  [
    { emoji: "", name: "Emergency Fund", target: 5000, tip: "Buffer for unexpected shared costs" },
    { emoji: "", name: "Rental Deposit", target: 3000, tip: "Typical deposit + moving costs" },
  ],
  full:    [
    { emoji: "", name: "Emergency Fund", target: 10000, tip: "3-6 months of living costs" },
  ],
};

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

// ── Goals page ────────────────────────────────────────────────────────────────

export default function Goals() {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { data: rawGoals = [], isLoading: goalsLoading, isError: goalsError, error: goalsErrorObj } = useListGoals();
  const goals: Goal[] = rawGoals.map(g => ({
    id: g.id,
    name: g.name,
    target: g.target,
    current: g.current,
    deadline: g.deadline ?? undefined,
    emoji: g.emoji ?? undefined,
    color: g.color ?? undefined,
    image: g.image ?? undefined,
    monthlyContribution: g.monthlyContribution ?? undefined,
    history: (g.history as HistoryEntry[] | undefined) ?? [],
  }));

  const createGoalMutation = useCreateGoal();
  const updateGoalMutation = useUpdateGoal();
  const deleteGoalMutation = useDeleteGoal();
  const addFundsMutation = useAddGoalFunds();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [addFunds, setAddFunds] = useState<Record<string, string>>({});
  const [expandedAnalytics, setExpandedAnalytics] = useState<Record<string, boolean>>({});
  const [compoundToggles, setCompoundToggles] = useState<Record<string, boolean>>({});
  const [compoundRates, setCompoundRates] = useState<Record<string, number>>({});
  const [whatIfMonthly, setWhatIfMonthly] = useState<Record<string, string>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
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

  async function handleSave() {
    const target = parseFloat(form.target);
    const current = parseFloat(form.current) || 0;
    if (!form.name.trim() || isNaN(target) || target <= 0) return;
    const monthlyContrib = parseFloat(form.monthlyContribution);
    await createGoalMutation.mutateAsync({
      data: {
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
    });
    queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
    setForm({ ...EMPTY_FORM });
    setShowForm(false);
  }

  async function handleAddFunds(id: number) {
    const amount = parseFloat(addFunds[String(id)] ?? "");
    if (isNaN(amount) || amount <= 0) return;
    await addFundsMutation.mutateAsync({ id, data: { amount } });
    queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
    setAddFunds((prev) => ({ ...prev, [String(id)]: "" }));
  }

  async function handleDelete(id: number) {
    await deleteGoalMutation.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
  }

  async function handleSetDeadline(id: number, deadline: string) {
    await updateGoalMutation.mutateAsync({ id, data: { deadline } });
    queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
  }

  const monthlyIncome = dashboard?.thisMonth?.income ?? 0;
  const monthlyExpenses = dashboard?.thisMonth?.expenses ?? 0;
  const monthlySurplus = monthlyIncome - monthlyExpenses;

  const unachievedGoals = goals.filter((g) => g.current < g.target);
  const achievedGoals = goals.filter((g) => g.current >= g.target);

  const totalGoalsNeeded = unachievedGoals.reduce((s, g) => s + Math.max(g.target - g.current, 0), 0);

  const now = new Date();
  const combinedMonthlyNeeded = unachievedGoals.reduce((s, g) => {
    if (!g.deadline) return s;
    const months = monthsBetween(now, new Date(g.deadline));
    if (months <= 0) return s;
    const remaining = Math.max(g.target - g.current, 0);
    return s + remaining / months;
  }, 0);

  const rankedGoalIds = [...unachievedGoals]
    .sort((a, b) => priorityScore(b, now) - priorityScore(a, now))
    .map((g) => g.id);

  const sharedMonthlyRate = unachievedGoals.length > 0 ? monthlySurplus / unachievedGoals.length : 0;

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

  const summaryMonthlyNeeded = useMemo(() => {
    return unachievedGoals.reduce((s, g) => {
      if (!g.deadline) {
        const rate = g.monthlyContribution ?? sharedMonthlyRate;
        return s + rate;
      }
      const months = monthsBetween(now, new Date(g.deadline));
      if (months <= 0) return s;
      const remaining = Math.max(g.target - g.current, 0);
      return s + remaining / months;
    }, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unachievedGoals, sharedMonthlyRate]);

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

  // KPI accent colors by column
  const kpiFeasibilityAccent =
    feasibilityStatus === "shortfall" ? "var(--ft-red)"
    : feasibilityStatus === "tight" ? "var(--ft-amber)"
    : feasibilityStatus === "on-track" ? "var(--ft-green)"
    : undefined;

  if (goalsLoading) {
    return (
      <VStack gap={6}>
        <HStack align="center" justify="between">
          <FtSkeleton width={140} height={14} />
          <FtSkeleton width={100} height={28} />
        </HStack>
        <div className="ft-kpi-bar" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="ft-kpi-bar-cell" style={{ background: "var(--ft-surface)", padding: "12px 16px" }}>
              <FtSkeleton width="60%" height={9} />
              <div style={{ marginTop: 6 }}><FtSkeleton width="80%" height={18} /></div>
            </div>
          ))}
        </div>
        <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: 20 }}>
              <HStack gap={12} marginBottom={12}>
                <FtSkeleton width={52} height={52} />
                <div style={{ flex: 1 }}>
                  <FtSkeleton width="70%" height={13} />
                  <div style={{ marginTop: 6 }}><FtSkeleton width="40%" height={9} /></div>
                </div>
              </HStack>
              <FtSkeleton width="100%" height={6} />
              <div style={{ marginTop: 10 }}><FtSkeleton width="60%" height={9} /></div>
            </div>
          ))}
        </div>
      </VStack>
    );
  }

  if (goalsError) {
    return (
      <ErrorState message={(goalsErrorObj as Error)?.message ?? "Could not load goals. Check your connection and try again."} />
    );
  }

  return (
    <div>
      <PageHeader
        icon={Target}
        title="Savings Goals"
        subtitle="Set targets · track progress · reach financial milestones"
        actions={
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
        }
      />

      {/* Persona context strip */}
      {(() => {
        const pid = loadPersonaIds()[0];
        if (!pid) return null;
        const msgs: Record<string, string | null> = {
          wealth: "Wealth Architect — savings goals feed directly into your FIRE timeline. Every milestone brings forward your financial independence date.",
          budget: "Set savings goals to protect spending surplus — your monthly savings rate here drives the Budget Commander score.",
          market: "Discipline first: set a cash reserve goal before deploying capital into the portfolio.",
          social: null,
          full: null,
        };
        const msg = msgs[pid];
        if (!msg) return null;
        const color = PERSONA_COLORS[pid as keyof typeof PERSONA_COLORS] ?? "var(--ft-accent)";
        return (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", border: "1px solid var(--ft-border)", background: "var(--ft-surface)", padding: "7px 12px", marginBottom: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color, fontWeight: 700, flexShrink: 0 }}>·</span>
            <span>{msg}</span>
          </div>
        );
      })()}

      {/* ── KPI Bar (border-as-gap grid) ── */}
      {goals.length > 0 && (
        <>
          <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)", marginBottom: 6 }}>
          <PanelHeader>Portfolio Overview</PanelHeader>
          <div className="ft-kpi-bar" style={{ gridTemplateColumns: "repeat(6, 1fr)", border: "none" }}>
            <KpiCell
              label="Total Goals"
              sub={<><Text as="span" color="var(--ft-green)">{achievedGoals.length}</Text> done · <Text as="span" color="var(--ft-accent)">{unachievedGoals.length}</Text> active</>}
            >
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--ft-text)", lineHeight: 1 }}>{goals.length}</div>
            </KpiCell>

            <KpiCell label="Total Target" sub="across all goals">
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--ft-text)", lineHeight: 1 }}>{formatBaseMoney(totalTarget)}</div>
            </KpiCell>

            <KpiCell
              label="Current Saved"
              sub={<><span className="pnum">{totalPct.toFixed(1)}%</span> overall</>}
            >
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--ft-green)", lineHeight: 1 }}>{formatBaseMoney(totalSaved)}</div>
              <div style={{ marginTop: 5, height: 3, background: "var(--ft-border)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${totalPct}%`, background: "var(--ft-green)" }} />
              </div>
            </KpiCell>

            <KpiCell
              label="Monthly Surplus"
              sub={<><span className="pnum">{formatBaseMoney(monthlyIncome)}</span> in · <span className="pnum">{formatBaseMoney(monthlyExpenses)}</span> out</>}
            >
              {dashLoading ? (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, color: "var(--ft-border2)", lineHeight: 1 }}>—</div>
              ) : (
                <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: monthlySurplus >= 0 ? "var(--ft-green)" : "var(--ft-red)", lineHeight: 1 }}>
                  {formatBaseMoney(Math.abs(monthlySurplus))}
                  {monthlySurplus < 0 && <span style={{ fontSize: 9, marginLeft: 4, color: "var(--ft-red)" }}>deficit</span>}
                </div>
              )}
            </KpiCell>

            <KpiCell
              label="Feasibility"
            >
              {feasibilityStatus === "none" ? (
                <Text as="div" mono size={11} color="var(--ft-dim)">—</Text>
              ) : feasibilityStatus === "on-track" ? (
                <Text as="div" mono size={13} weight={700} color="var(--ft-green)" letterSpacing="0.05em">ON TRACK</Text>
              ) : feasibilityStatus === "tight" ? (
                <Text as="div" mono size={13} weight={700} color="var(--ft-amber)" letterSpacing="0.05em">TIGHT</Text>
              ) : (
                <div>
                  <Text as="div" mono size={11} weight={700} color="var(--ft-red)" letterSpacing="0.04em">SHORTFALL</Text>
                  <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-red)", marginTop: 2 }}>{formatBaseMoney(shortfall)}/mo short</div>
                </div>
              )}
            </KpiCell>

            <KpiCell label="Monthly Needed" sub="to hit all deadlines">
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--ft-accent)", lineHeight: 1 }}>
                {combinedMonthlyNeeded > 0 ? formatBaseMoney(combinedMonthlyNeeded) : "—"}
              </div>
            </KpiCell>
          </div>
        </div>
        </>
      )}

      {/* ── Goal Insights Summary ── */}
      {goals.length >= 2 && (mostUrgent || biggestGap || closestToDone) && (
        <div style={{ marginBottom: 6, border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
          <PanelHeader>Insights</PanelHeader>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: 6 }}>
            {mostUrgent && (
              <InsightCard
                label="Most Urgent"
                name={<><GoalIcon emoji={mostUrgent.emoji} color={mostUrgent.color ?? PRESET_COLORS[0]} size={13} /> {mostUrgent.name}</>}
                value={<Text as="span" color="var(--ft-amber)">{Math.max(daysUntil(mostUrgent.deadline!), 0)}d remaining</Text>}
                accentColor={mostUrgent.color ?? PRESET_COLORS[0]}
              />
            )}
            {biggestGap && (
              <InsightCard
                label="Biggest Gap"
                name={<><GoalIcon emoji={biggestGap.emoji} color={biggestGap.color ?? PRESET_COLORS[0]} size={13} /> {biggestGap.name}</>}
                value={<span className="pnum" style={{ color: "var(--ft-red)" }}>{formatBaseMoney(biggestGap.target - biggestGap.current)} gap</span>}
                accentColor={biggestGap.color ?? PRESET_COLORS[0]}
              />
            )}
            {closestToDone && (
              <InsightCard
                label="Closest to Done"
                name={<><GoalIcon emoji={closestToDone.emoji} color={closestToDone.color ?? PRESET_COLORS[0]} size={13} /> {closestToDone.name}</>}
                value={<span className="pnum" style={{ color: "var(--ft-green)" }}>{((closestToDone.current / closestToDone.target) * 100).toFixed(0)}% — almost there!</span>}
                accentColor={closestToDone.color ?? PRESET_COLORS[0]}
              />
            )}
          </div>
        </div>
      )}

      {/* ── AI Goal Coach ── */}
      {unachievedGoals.length > 0 && (
        <AiGoalCoach
          goalItems={unachievedGoals.map((g) => {
            const days = g.deadline ? daysUntil(g.deadline) : null;
            const monthsLeft = g.deadline ? Math.max(monthsBetween(now, new Date(g.deadline)), 1) : null;
            const remaining = Math.max(g.target - g.current, 0);
            const needed = monthsLeft ? remaining / monthsLeft : 0;
            const contribution = g.monthlyContribution ?? (unachievedGoals.length > 0 ? monthlySurplus / unachievedGoals.length : 0);
            const goalShortfall = Math.max(needed - contribution, 0);
            return {
              name: g.name,
              pctFunded: g.target > 0 ? (g.current / g.target) * 100 : 0,
              daysRemaining: days,
              monthlyShortfall: goalShortfall,
            };
          })}
        />
      )}

      {/* ── Add Goal Form ── */}
      {showForm && (
        <Panel className="mb-1.5" title="New Goal" padding={20}>
          <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Goal Name</label>
              <input type="text" placeholder="e.g. Holiday Fund" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Target Amount (£)</label>
              <input type="number" placeholder="5000" min={0} value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Already Saved (£)</label>
              <input type="number" placeholder="0" min={0} value={form.current} onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Monthly Contribution (£, optional)</label>
              <input type="number" placeholder="200" min={0} value={form.monthlyContribution} onChange={(e) => setForm((f) => ({ ...f, monthlyContribution: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Deadline (optional)</label>
              <input type="date" value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} style={{ ...inputStyle, color: form.deadline ? "var(--ft-text)" : "var(--ft-dim)" }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Accent Color</label>
              <HStack gap={8} wrap>
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: form.color === c ? "2px solid var(--ft-text)" : "2px solid transparent", cursor: "pointer", outline: form.color === c ? "1px solid var(--ft-accent)" : "none" }}
                  />
                ))}
              </HStack>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Goal Image (optional)</label>
              <input ref={imageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleGoalImageFile(e.target.files?.[0])} />
              <HStack gap={10} align="center">
                <div
                  onClick={() => imageInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); handleGoalImageFile(e.dataTransfer.files[0]); }}
                  style={{ width: 52, height: 52, borderRadius: "50%", border: "1px dashed var(--ft-border2)", background: "var(--ft-raised)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, transition: "border-color 0.15s" }}
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
                    <button onClick={() => setForm((f) => ({ ...f, image: "" }))} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-red)", background: "none", border: "1px solid var(--ft-red)", padding: "2px 8px", cursor: "pointer", letterSpacing: "0.04em" }}>
                      Remove
                    </button>
                  )}
                </div>
              </HStack>
            </div>
          </div>
          <HStack gap={8}>
            <button onClick={handleSave} style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", background: "var(--ft-green)", color: "var(--ft-base)", border: "none", padding: "7px 20px", cursor: "pointer" }}>
              Save Goal
            </button>
            <button onClick={() => { setShowForm(false); setForm({ ...EMPTY_FORM }); }} style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", background: "transparent", color: "var(--ft-muted)", border: "1px solid var(--ft-border)", padding: "7px 16px", cursor: "pointer" }}>
              Cancel
            </button>
          </HStack>
        </Panel>
      )}

      {/* ── Empty State ── */}
      {goals.length === 0 && !showForm && (
        <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)", padding: "40px 32px", minHeight: "calc(100vh - 260px)", display: "flex", flexDirection: "column" as const, justifyContent: "center" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 6 }}>
            NO GOALS DEFINED
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)", marginBottom: 4 }}>
            Define a financial target to track.
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", marginBottom: 20, lineHeight: 1.7, maxWidth: 440 }}>
            Set a goal for a holiday fund, emergency buffer, or investment milestone. The engine will track your progress, project your completion date, and surface warnings when you're behind schedule.
          </div>
          {(() => {
            const pid = loadPersonaIds()[0] ?? "full";
            const templates = PERSONA_GOAL_TEMPLATES[pid] ?? PERSONA_GOAL_TEMPLATES["full"];
            return (
              <HStack gap={8} wrap marginBottom={20} maxWidth={460}>
                {templates.map((t) => (
                  <button
                    key={t.name}
                    title={t.tip}
                    onClick={() => {
                      setForm((f) => ({ ...f, name: t.name, target: String(t.target), emoji: t.emoji }));
                      setShowForm(true);
                    }}
                    style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", border: "1px solid var(--ft-border)", background: "var(--ft-raised)", color: "var(--ft-dim)", padding: "4px 12px", cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    {t.name}
                  </button>
                ))}
              </HStack>
            );
          })()}
          <Text as="div" mono size={10} color="var(--ft-dim)" letterSpacing="0.06em">
            Use <Text as="span" color="var(--ft-accent)">+ Add Goal</Text> above to get started, or select a template.
          </Text>
        </div>
      )}

      {/* ── Goal Cards Grid ── */}
      {goals.length > 0 && (
        <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)", marginBottom: 6 }}>
        <PanelHeader>Active Goals</PanelHeader>
        <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: 6 }}>
        {goals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            now={now}
            sharedMonthlyRate={sharedMonthlyRate}
            monthlySurplus={monthlySurplus}
            rankedGoalIds={rankedGoalIds}
            deleteConfirmId={deleteConfirmId}
            addFundsValue={addFunds[String(goal.id)] ?? ""}
            expandedAnalytics={expandedAnalytics[goal.id] ?? false}
            useCompound={compoundToggles[goal.id] ?? false}
            annualRate={compoundRates[goal.id] ?? 0.06}
            whatIfMonthly={whatIfMonthly[String(goal.id)] ?? ""}
            onAddFunds={handleAddFunds}
            onAddFundsChange={(id, val) => setAddFunds((prev) => ({ ...prev, [String(id)]: val }))}
            onDeleteClick={(id) => {
              if (deleteConfirmId === id) { handleDelete(id); setDeleteConfirmId(null); }
              else { setDeleteConfirmId(id); setTimeout(() => setDeleteConfirmId(null), 3000); }
            }}
            onToggleAnalytics={(id) => setExpandedAnalytics((prev) => ({ ...prev, [id]: !prev[id] }))}
            onToggleCompound={(id, val) => setCompoundToggles((prev) => ({ ...prev, [id]: val }))}
            onCompoundRateChange={(id, val) => setCompoundRates((prev) => ({ ...prev, [id]: val }))}
            onWhatIfChange={(id, val) => setWhatIfMonthly((prev) => ({ ...prev, [String(id)]: val }))}
            onSetDeadline={handleSetDeadline}
          />
        ))}
        </div>
        </div>
      )}

      {/* ── Goals Summary Footer ── */}
      {goals.length > 0 && (
        <PanelBox padding="14px 20px"><HStack gap={16} align="center" justify="between" wrap marginTop={16}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
              Portfolio Summary
            </div>
            <Text as="div" mono size={11} color="var(--ft-muted)">
              <span className="pnum" style={{ color: "var(--ft-green)", fontWeight: 700, fontSize: 18 }}>{formatBaseMoney(totalSaved)}</span>
              <Text as="span" color="var(--ft-dim)"> saved towards </Text>
              <span className="pnum" style={{ color: "var(--ft-text)", fontWeight: 700, fontSize: 18 }}>{formatBaseMoney(totalTarget)}</span>
              <Text as="span" color="var(--ft-dim)"> total</Text>
            </Text>
            <div style={{ height: 3, background: "var(--ft-border)", marginTop: 8, width: "min(240px, 100%)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${totalPct}%`, background: "var(--ft-green)" }} />
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>
              <span className="pnum">{totalPct.toFixed(1)}%</span> overall · {achievedGoals.length} of {goals.length} goals complete
            </div>
          </div>

          <HStack gap={24}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Monthly Needed</div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--ft-accent)" }}>
                {summaryMonthlyNeeded > 0 ? formatBaseMoney(summaryMonthlyNeeded) : "—"}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>across all active goals</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Still Needed</div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--ft-text)" }}>
                {formatBaseMoney(totalGoalsNeeded)}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>{unachievedGoals.length} goal{unachievedGoals.length !== 1 ? "s" : ""} in progress</div>
            </div>
          </HStack>
        </HStack></PanelBox>
      )}
    </div>
  );
}
