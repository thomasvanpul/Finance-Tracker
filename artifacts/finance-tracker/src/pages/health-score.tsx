import { useState, useEffect, useMemo, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Area, AreaChart,
} from "recharts";
import {
  useGetDashboard,
  useListTransactions,
  useListDebts,
  useListUpcoming,
  useListGoals,
  useListBudgets,
} from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import type { Transaction, Debt, UpcomingItem, Budget } from "@workspace/api-client-react";
import { PiggyBank, CalendarCheck, BarChart3, Zap, Star } from "lucide-react";
import { loadPersonaIds, PERSONAS, PERSONA_COLORS } from "@/lib/persona";
import { PageHeader } from "@/components/page-header";
import { Activity } from "lucide-react";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";

// ── Persona focus areas ───────────────────────────────────────────────────────
const PERSONA_HEALTH_FOCUS: Record<string, { label: string; tip: string; keys: string[] }> = {
  market: {
    label: "Market Terminal",
    tip: "Maximise savings rate to grow your investment capital. Keep debt low to free up cash for portfolio positions.",
    keys: ["savings", "debt"],
  },
  budget: {
    label: "Budget Commander",
    tip: "Budget adherence and spending consistency are your primary levers. A stable monthly pattern drives every other metric.",
    keys: ["budget", "consistency", "bills"],
  },
  wealth: {
    label: "Wealth Architect",
    tip: "Long-term wealth depends on savings rate and a fully-funded emergency buffer. Keep climbing toward 20%+ savings.",
    keys: ["savings", "emergency", "debt"],
  },
  social: {
    label: "Social Finance",
    tip: "Shared bills and split costs create debt exposure — stay on top of your liabilities to protect your score.",
    keys: ["debt", "bills", "consistency"],
  },
};

// ── Score history ─────────────────────────────────────────────────────────────
const SCORE_HISTORY_KEY = "ft-health-score-history";
const MAX_HISTORY_DAYS = 90;

interface ScoreSnapshot {
  date: string; // YYYY-MM-DD
  score: number;
}

function loadScoreHistory(): ScoreSnapshot[] {
  try {
    const raw = localStorage.getItem(SCORE_HISTORY_KEY);
    if (raw) return JSON.parse(raw) as ScoreSnapshot[];
  } catch {}
  return [];
}

function saveScoreSnapshot(score: number): ScoreSnapshot[] {
  const today = new Date().toISOString().slice(0, 10);
  const history = loadScoreHistory().filter(s => s.date !== today);
  history.push({ date: today, score });
  const trimmed = history.sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_HISTORY_DAYS);
  try { localStorage.setItem(SCORE_HISTORY_KEY, JSON.stringify(trimmed)); } catch {}
  return trimmed;
}

// ── Types ────────────────────────────────────────────────────────────────────

type AchievementIconKey = "piggybank" | "calendar" | "barchart" | "zap" | "star";

interface Achievement {
  id: string;
  name: string;
  icon: AchievementIconKey | string;
  description: string;
  unlockedAt: string;
}

interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  current: number;
}

interface SubScore {
  key: string;
  label: string;
  weight: number;
  score: number;
  insight: string;
  action?: string;
  pointGain?: number;
}

// ── LocalStorage helpers ─────────────────────────────────────────────────────

function loadAchievements(): Achievement[] {
  try {
    const raw = localStorage.getItem("ft-achievements");
    if (raw) return JSON.parse(raw) as Achievement[];
  } catch {}
  return [];
}

function saveAchievements(achievements: Achievement[]): void {
  try {
    localStorage.setItem("ft-achievements", JSON.stringify(achievements));
  } catch {}
}

// ── Score math ───────────────────────────────────────────────────────────────

function lerp(x: number, x0: number, y0: number, x1: number, y1: number): number {
  if (x <= x0) return y0;
  if (x >= x1) return y1;
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

function calcSavingsRateScore(rate: number): number {
  if (rate <= 0) return 0;
  if (rate <= 10) return lerp(rate, 0, 0, 10, 40);
  if (rate <= 20) return lerp(rate, 10, 40, 20, 70);
  return lerp(rate, 20, 70, 30, 100);
}

function calcDebtLoadScore(totalDebt: number, monthlyIncome: number): number {
  if (monthlyIncome <= 0) return 50;
  const ratio = totalDebt / monthlyIncome;
  if (ratio <= 0) return 100;
  if (ratio <= 1) return lerp(ratio, 0, 100, 1, 70);
  if (ratio <= 3) return lerp(ratio, 1, 70, 3, 40);
  if (ratio <= 6) return lerp(ratio, 3, 40, 6, 0);
  return 0;
}

function calcBillReliabilityScore(upcoming: UpcomingItem[], today: Date): number {
  if (upcoming.length === 0) return 100;
  const total = upcoming.length;
  const overdue = upcoming.filter((item) => {
    if (item.status === "paid") return false;
    return new Date(item.dueDate) < today;
  }).length;
  const overduePct = overdue / total;
  if (overduePct === 0) return 100;
  if (overduePct < 0.05) return 80;
  if (overduePct < 0.1) return 60;
  if (overduePct < 0.2) return 40;
  return 30;
}

function calcSpendingConsistencyScore(monthlyHistory: Array<{ expenses: number }>): number {
  const totals = monthlyHistory.map((m) => m.expenses).filter((v) => v > 0);
  if (totals.length < 2) return 50;
  const mean = totals.reduce((s, v) => s + v, 0) / totals.length;
  if (mean <= 0) return 50;
  const variance = totals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / totals.length;
  const stddev = Math.sqrt(variance);
  const cv = stddev / mean;
  if (cv <= 0.1) return 100;
  if (cv >= 0.5) return 20;
  return lerp(cv, 0.1, 100, 0.5, 20);
}

function calcEmergencyFundScore(goals: SavingsGoal[]): number {
  const fund = goals.find((g) => g.name.toLowerCase().includes("emergency"));
  if (!fund) return 0;
  if (fund.target <= 0) return 0;
  return Math.min((fund.current / fund.target) * 100, 100);
}

function calcBudgetAdherenceScore(budgets: Budget[], spentByCategory: Record<string, number>): number {
  if (budgets.length === 0) return 50;
  const overBudget = budgets.filter((b) => {
    const spent = spentByCategory[b.category.toLowerCase()] ?? 0;
    return spent > b.monthlyLimit;
  }).length;
  return ((budgets.length - overBudget) / budgets.length) * 100;
}

function letterGrade(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "F";
}

function gradeDescription(score: number): string {
  if (score >= 90) return "Outstanding — elite financial discipline";
  if (score >= 80) return "Excellent — strong across all pillars";
  if (score >= 70) return "Good — a few areas to tighten up";
  if (score >= 60) return "Fair — focus on the recommendations below";
  if (score >= 40) return "Needs attention — take action now";
  return "Critical — immediate financial review needed";
}

function scoreColor(score: number): string {
  if (score >= 90) return "var(--ft-cyan)";
  if (score >= 70) return "var(--ft-green)";
  if (score >= 40) return "var(--ft-amber)";
  return "var(--ft-red)";
}

// ── KPI strip cell ─────────────────────────────────────────────────────────────

interface KpiStripCellProps {
  label: string;
  value: string;
  unit?: string;
  color: string;
}

function KpiStripCell({ label, value, unit, color }: KpiStripCellProps) {
  return (
    <div style={{ background: "var(--ft-surface)", borderTop: `2px solid ${color}`, padding: "10px 14px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 4 }}>
        {label}
      </div>
      <HStack gap={4} align="baseline">
        <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color, lineHeight: 1, letterSpacing: "-0.02em" }}>
          {value}
        </span>
        {unit && (
          <Text as="span" mono size={9} color="var(--ft-dim)">{unit}</Text>
        )}
      </HStack>
    </div>
  );
}

// ── Color legend item ──────────────────────────────────────────────────────────

interface ColorLegendItemProps {
  label: string;
  color: string;
}

function ColorLegendItem({ label, color }: ColorLegendItemProps) {
  return (
    <HStack gap={3} align="center">
      <div style={{ width: 6, height: 6, background: color }} />
      <Text as="span" mono size={7} color="var(--ft-dim)">{label}</Text>
    </HStack>
  );
}

// ── Pillar mini bar row ────────────────────────────────────────────────────────

interface PillarMiniBarProps {
  label: string;
  score: number;
  weight: number;
}

function PillarMiniBar({ label, score, weight }: PillarMiniBarProps) {
  const color = scoreColor(score);
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "130px 1fr 42px 28px",
      alignItems: "center", gap: 8, background: "var(--ft-surface)",
      padding: "6px 10px",
    }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.05em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
        {label}
      </div>
      <div style={{ height: 4, background: "var(--ft-raised)", overflow: "hidden", position: "relative" as const }}>
        <div style={{ height: "100%", width: `${score}%`, background: color }} />
      </div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color, textAlign: "right" as const, letterSpacing: "-0.01em" }}>
        {Math.round(score)}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textAlign: "right" as const }}>
        ×{Math.round(weight * 100)}%
      </div>
    </div>
  );
}

// ── Locked achievement row ─────────────────────────────────────────────────────

interface LockedAchievementItem {
  id: string;
  name: string;
  icon: string;
  condition: string;
}

const ACHIEVEMENT_ICONS: Record<string, React.ReactNode> = {
  piggybank: <PiggyBank size={18} color="var(--ft-accent)" />,
  calendar:  <CalendarCheck size={18} color="var(--ft-green)" />,
  barchart:  <BarChart3 size={18} color="var(--ft-blue)" />,
  zap:       <Zap size={18} color="var(--ft-cyan)" />,
  star:      <Star size={18} color="var(--ft-amber)" />,
};

interface LockedAchievementRowProps {
  item: LockedAchievementItem;
  isLast: boolean;
}

function LockedAchievementRow({ item, isLast }: LockedAchievementRowProps) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 12px",
      borderBottom: !isLast ? "1px solid var(--ft-border)" : undefined,
      opacity: 0.45,
    }}>
      <div style={{ width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {ACHIEVEMENT_ICONS[item.icon] ?? <Star size={18} color="var(--ft-dim)" />}
      </div>
      <div style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
        {item.name}
      </div>
      <Text as="div" mono size={8} color="var(--ft-dim)" letterSpacing="0.04em">
        {item.condition}
      </Text>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", border: "1px solid var(--ft-border2)", padding: "1px 5px", letterSpacing: "0.06em" }}>
        LOCKED
      </div>
    </div>
  );
}

// ── Arc Gauge ────────────────────────────────────────────────────────────────

interface ScoreGaugeProps {
  score: number;
  color: string;
  grade: string;
}

function ScoreGauge({ score, color, grade }: ScoreGaugeProps) {
  const size = 220;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const sweepFraction = 270 / 360;
  const arcLength = circumference * sweepFraction;

  const [animated, setAnimated] = useState(0);
  const frameRef = useRef<number>(0);
  const startTimeRef = useRef<number | null>(null);
  const DURATION = 800;

  useEffect(() => {
    startTimeRef.current = null;
    const target = score;
    function tick(timestamp: number) {
      if (startTimeRef.current === null) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / DURATION, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimated(eased * target);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [score]);

  const filled = (animated / 100) * arcLength;
  const bandTicks = [0, 40, 70, 90, 100];

  return (
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
      <svg width={size} height={size} style={{ display: "block", overflow: "visible" }}>
        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="var(--ft-border)" strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference - arcLength}`}
          strokeLinecap="butt"
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />
        {/* Color zones */}
        {[
          { from: 0, to: 40, color: "var(--ft-red)" },
          { from: 40, to: 70, color: "var(--ft-amber)" },
          { from: 70, to: 90, color: "var(--ft-green)" },
          { from: 90, to: 100, color: "var(--ft-cyan)" },
        ].map((band) => {
          const startFrac = band.from / 100;
          const endFrac = band.to / 100;
          const bandStart = startFrac * arcLength;
          const bandLen = (endFrac - startFrac) * arcLength;
          return (
            <circle
              key={band.from}
              cx={size / 2} cy={size / 2} r={radius}
              fill="none" stroke={band.color} strokeWidth={strokeWidth}
              strokeOpacity={0.18}
              strokeDasharray={`${bandLen} ${circumference - bandLen}`}
              strokeDashoffset={-bandStart}
              strokeLinecap="butt"
              transform={`rotate(135 ${size / 2} ${size / 2})`}
            />
          );
        })}
        {/* Filled arc */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={`${filled} ${circumference - filled}`}
          strokeLinecap="butt"
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />
        {/* Tick marks at band boundaries */}
        {bandTicks.map((t) => {
          const angle = 135 + (t / 100) * 270;
          const rad = (angle * Math.PI) / 180;
          const cx = size / 2 + radius * Math.cos(rad);
          const cy = size / 2 + radius * Math.sin(rad);
          return (
            <circle key={t} cx={cx} cy={cy} r={2} fill="var(--ft-surface)" />
          );
        })}
      </svg>
      {/* Centre content */}
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", marginTop: 8,
      }}>
        <div className="pnum" style={{
          fontFamily: "var(--font-mono)", fontSize: 58, fontWeight: 700, color,
          lineHeight: 1, letterSpacing: "-0.03em",
        }}>
          {Math.round(animated)}
        </div>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color,
          letterSpacing: "0.1em", marginTop: 2,
        }}>
          {grade}
        </div>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)",
          letterSpacing: "0.12em", textTransform: "uppercase" as const, marginTop: 3,
        }}>
          / 100
        </div>
      </div>
      {/* Band labels */}
      <div style={{ position: "absolute", bottom: 6, left: 8, fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-red)" }}>F</div>
      <div style={{ position: "absolute", bottom: 6, right: 8, fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-cyan)" }}>A+</div>
    </div>
  );
}

// ── Sub-score row (compact, data-dense) ───────────────────────────────────────

interface SubScoreRowProps {
  sub: SubScore;
  rank: number;
}

function SubScoreRow({ sub, rank }: SubScoreRowProps) {
  const color = scoreColor(sub.score);
  const grade = letterGrade(sub.score);
  const [hovered, setHovered] = useState<boolean>(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "28px 140px 1fr 50px 32px",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        background: hovered
          ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))"
          : "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        borderLeft: `3px solid ${color}`,
        cursor: "default",
        transition: "background 0.1s",
      }}>
      {/* Rank */}
      <Text as="div" mono size={10} color="var(--ft-dim)" align="center">
        {rank}
      </Text>
      {/* Label + weight */}
      <div>
        <Text as="div" mono size={10} weight={600} color="var(--ft-text)">
          {sub.label}
        </Text>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 1 }}>
          weight: {Math.round(sub.weight * 100)}%
        </div>
      </div>
      {/* Progress bar + insight */}
      <div>
        <div style={{ height: 3, background: "var(--ft-border)", marginBottom: 5, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${sub.score}%`, background: color }} />
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)", lineHeight: 1.5 }}>
          {sub.insight}
        </div>
        {sub.action && sub.pointGain !== undefined && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 3 }}>
            <Text as="span" color="var(--ft-accent)">→</Text> {sub.action}{" "}
            <span className="pnum" style={{ color: "var(--ft-green)", fontWeight: 600 }}>+{sub.pointGain} pts</span>
          </div>
        )}
      </div>
      {/* Score */}
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color, textAlign: "right" as const }}>
        {Math.round(sub.score)}
      </div>
      {/* Grade badge */}
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color,
        border: `1px solid ${color}`, padding: "2px 4px", textAlign: "center" as const,
      }}>
        {grade}
      </div>
    </div>
  );
}

// ── Recommendation ────────────────────────────────────────────────────────────

interface Recommendation {
  id: string;
  text: string;
  impact: number;
  color: string;
  priority: "critical" | "high" | "medium";
}

// ── Achievement badge ─────────────────────────────────────────────────────────

interface AchievementBadgeProps {
  achievement: Achievement;
}

function AchievementBadge({ achievement }: AchievementBadgeProps) {
  const icon = ACHIEVEMENT_ICONS[achievement.icon] ?? <Star size={18} color="var(--ft-accent)" />;
  const [hovered, setHovered] = useState<boolean>(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        background: hovered
          ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))"
          : "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        borderLeft: "3px solid var(--ft-accent)", padding: "9px 12px",
        cursor: "default",
        transition: "background 0.1s",
      }}>
      <span style={{ lineHeight: 1, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-accent)", marginBottom: 1 }}>
          {achievement.name}
        </div>
        <Text as="div" mono size={9} color="var(--ft-muted)">
          {achievement.description}
        </Text>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textAlign: "right" as const, flexShrink: 0 }}>
        {new Date(achievement.unlockedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
      </div>
    </div>
  );
}

// ── Score log table row (with hover state) ────────────────────────────────────

interface ScoreLogRowProps {
  snap: ScoreSnapshot;
  delta: number | null;
  sc: string;
}

function ScoreLogRow({ snap, delta, sc }: ScoreLogRowProps) {
  const [hovered, setHovered] = useState<boolean>(false);
  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: "1px solid var(--ft-border)",
        background: hovered ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))" : "var(--ft-surface)",
        cursor: "default",
        transition: "background 0.1s",
      }}>
      <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", padding: "6px 12px" }}>
        {new Date(snap.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
      </td>
      <td className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: sc, padding: "6px 12px" }}>
        {snap.score}
      </td>
      <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: sc, padding: "6px 12px", fontWeight: 600 }}>
        {letterGrade(snap.score)}
      </td>
      <td className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: delta === null ? "var(--ft-dim)" : delta >= 0 ? "var(--ft-green)" : "var(--ft-red)", padding: "6px 12px" }}>
        {delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta} pts`}
      </td>
      <td style={{ padding: "6px 12px", width: 80 }}>
        <div style={{ height: 3, background: "var(--ft-border)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${snap.score}%`, background: sc }} />
        </div>
      </td>
    </tr>
  );
}

// ── Recommendation row (with hover state) ─────────────────────────────────────

interface RecRowProps {
  rec: Recommendation;
  rank: number;
  priorityLabel: string;
  priorityColor: string;
}

function RecRow({ rec, rank, priorityLabel, priorityColor }: RecRowProps) {
  const [hovered, setHovered] = useState<boolean>(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 14,
        background: hovered
          ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))"
          : "var(--ft-surface)",
        borderLeft: `3px solid ${rec.color}`, padding: "10px 14px",
        cursor: "default",
        transition: "background 0.1s",
      }}>
      {/* Rank */}
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: rec.color, opacity: 0.5, flexShrink: 0, width: 20, textAlign: "center" as const }}>
        {rank}
      </div>
      {/* Text */}
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", lineHeight: 1.5 }}>
          {rec.text}
        </div>
      </div>
      {/* Priority badge */}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, color: priorityColor, border: `1px solid ${priorityColor}55`, padding: "2px 5px", flexShrink: 0, letterSpacing: "0.06em" }}>
        {priorityLabel}
      </div>
      {/* Impact */}
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-green)", flexShrink: 0, minWidth: 52, textAlign: "right" as const }}>
        +{rec.impact}<Text as="span" size={8} weight={400} color="var(--ft-dim)"> pts</Text>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HealthScore() {
  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const isMobile = useIsMobile();

  // ── API data ──────────────────────────────────────────────────────────────────

  const { data: dashboard, isLoading: dashLoading } = useGetDashboard();
  const { data: allTxs, isLoading: txLoading } = useListTransactions({});
  const { data: monthTxs } = useListTransactions({ type: "expense", dateFrom: firstOfMonth });
  const { data: debts, isLoading: debtsLoading } = useListDebts();
  const { data: upcoming, isLoading: upcomingLoading } = useListUpcoming();
  const { data: goalsData = [] } = useListGoals();

  // ── Local state ───────────────────────────────────────────────────────────────

  const [achievements, setAchievements] = useState<Achievement[]>(() => loadAchievements());
  const [scoreHistory, setScoreHistory] = useState<ScoreSnapshot[]>(() => loadScoreHistory());

  // ── Derived values ────────────────────────────────────────────────────────────

  const savingsGoals = useMemo<SavingsGoal[]>(() =>
    goalsData.map(g => ({
      id: String(g.id),
      name: g.name,
      target: parseFloat(String(g.target)),
      current: parseFloat(String(g.current)),
    })), [goalsData]);

  const { data: budgets = [] } = useListBudgets();

  const spentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    if (!monthTxs) return map;
    monthTxs.forEach((tx: Transaction) => {
      const key = tx.category.toLowerCase();
      map[key] = (map[key] ?? 0) + tx.gbpValue;
    });
    return map;
  }, [monthTxs]);

  const totalPendingDebt = useMemo(
    () => (debts ?? []).filter((d: Debt) => d.status === "pending").reduce((s: number, d: Debt) => s + d.gbpEquivalent, 0),
    [debts]
  );

  const monthlyIncome = dashboard?.thisMonth?.income ?? 0;

  const last6Months = useMemo(() => {
    const hist = dashboard?.monthlyHistory ?? [];
    return hist.slice(-6);
  }, [dashboard]);

  // ── Sub-score computation ─────────────────────────────────────────────────────

  const subScores = useMemo((): SubScore[] => {
    const savingsRate = dashboard?.thisMonth?.savingsRate ?? 0;
    const savingsScore = calcSavingsRateScore(savingsRate);
    const debtScore = calcDebtLoadScore(totalPendingDebt, monthlyIncome);
    const billScore = calcBillReliabilityScore(upcoming ?? [], now);
    const consistencyScore = calcSpendingConsistencyScore(last6Months);
    const efScore = calcEmergencyFundScore(savingsGoals);
    const budgetScore = calcBudgetAdherenceScore(budgets, spentByCategory);

    function insightSavings(): string {
      if (savingsRate >= 30) return `Savings rate ${savingsRate.toFixed(0)}% — outstanding, top tier.`;
      if (savingsRate >= 20) return `Savings rate ${savingsRate.toFixed(0)}% — excellent, on track.`;
      if (savingsRate >= 10) return `Savings rate ${savingsRate.toFixed(0)}% — aim for 20%+.`;
      if (savingsRate > 0) return `Savings rate ${savingsRate.toFixed(0)}% — target 10% first.`;
      return "No savings detected this month.";
    }
    function actionSavings(): { action: string; gain: number } | null {
      if (savingsRate >= 20) return null;
      const target = savingsRate < 10 ? 10 : 20;
      const gain = Math.round((calcSavingsRateScore(target) - savingsScore) * 0.25);
      return { action: `Raise savings rate to ${target}%`, gain };
    }

    function insightDebt(): string {
      if (totalPendingDebt === 0) return "No pending debts — excellent position.";
      const ratio = monthlyIncome > 0 ? totalPendingDebt / monthlyIncome : 0;
      if (ratio <= 1) return `Debt ${ratio.toFixed(1)}x monthly income — manageable.`;
      if (ratio <= 3) return `Debt ${ratio.toFixed(1)}x income — consider paying down faster.`;
      return `Debt ${ratio.toFixed(1)}x income is high — prioritise reduction.`;
    }
    function actionDebt(): { action: string; gain: number } | null {
      if (totalPendingDebt === 0) return null;
      const ratio = monthlyIncome > 0 ? totalPendingDebt / monthlyIncome : 0;
      if (ratio <= 1) return null;
      const gain = Math.round((calcDebtLoadScore(monthlyIncome, monthlyIncome) - debtScore) * 0.2);
      return { action: "Reduce debt to under 1x monthly income", gain: Math.max(gain, 1) };
    }

    function insightBills(): string {
      const total = (upcoming ?? []).length;
      if (total === 0) return "No upcoming bills tracked.";
      const overdue = (upcoming ?? []).filter(
        (item: UpcomingItem) => item.status !== "paid" && new Date(item.dueDate) < now
      ).length;
      if (overdue === 0) return "All bills paid on time — perfect reliability.";
      return `${overdue} overdue bill${overdue > 1 ? "s" : ""} — pay promptly.`;
    }
    function actionBills(): { action: string; gain: number } | null {
      const overdue = (upcoming ?? []).filter(
        (item: UpcomingItem) => item.status !== "paid" && new Date(item.dueDate) < now
      ).length;
      if (overdue === 0) return null;
      return { action: `Pay ${overdue} overdue bill${overdue > 1 ? "s" : ""}`, gain: Math.round((100 - billScore) * 0.15) };
    }

    function insightConsistency(): string {
      const totals = last6Months.map((m) => m.expenses).filter((v) => v > 0);
      if (totals.length < 2) return "Need 2+ months of data for consistency analysis.";
      const mean = totals.reduce((s, v) => s + v, 0) / totals.length;
      if (mean <= 0) return "Insufficient data.";
      const variance = totals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / totals.length;
      const cv = Math.sqrt(variance) / mean;
      if (cv <= 0.1) return "Very consistent spending — stable and predictable.";
      if (cv <= 0.3) return "Moderate variation in spending over last 6 months.";
      return "High variability — smooth out monthly costs.";
    }

    function insightEF(): string {
      const fund = savingsGoals.find((g) => g.name.toLowerCase().includes("emergency"));
      if (!fund) return "No Emergency Fund goal found — create one in Goals.";
      const pct = fund.target > 0 ? (fund.current / fund.target) * 100 : 0;
      if (pct >= 100) return `Fully funded at ${formatGbp(fund.current)} — excellent!`;
      return `${pct.toFixed(0)}% funded — ${formatGbp(fund.current)} of ${formatGbp(fund.target)}.`;
    }
    function actionEF(): { action: string; gain: number } | null {
      const fund = savingsGoals.find((g) => g.name.toLowerCase().includes("emergency"));
      if (!fund) return { action: "Create an Emergency Fund goal in Goals", gain: 15 };
      const pct = fund.target > 0 ? fund.current / fund.target : 0;
      if (pct >= 0.5) return null;
      return { action: `Grow Emergency Fund to 50%`, gain: Math.round((50 - pct * 100) * 0.15) };
    }

    function insightBudget(): string {
      if (budgets.length === 0) return "No budgets set — add categories in Budget page.";
      const over = budgets.filter((b) => (spentByCategory[b.category.toLowerCase()] ?? 0) > b.monthlyLimit).length;
      if (over === 0) return "All categories within budget — great discipline.";
      return `${over} of ${budgets.length} categories over budget.`;
    }
    function actionBudget(): { action: string; gain: number } | null {
      if (budgets.length === 0) return { action: "Set up budget categories", gain: 10 };
      const over = budgets.filter((b) => (spentByCategory[b.category.toLowerCase()] ?? 0) > b.monthlyLimit).length;
      if (over === 0) return null;
      return { action: `Bring ${over} over-budget categor${over === 1 ? "y" : "ies"} back in line`, gain: Math.round(over / budgets.length * 10) };
    }

    const sa = actionSavings();
    const da = actionDebt();
    const ba = actionBills();
    const ea = actionEF();
    const bua = actionBudget();

    return [
      { key: "savings", label: "Savings Rate", weight: 0.25, score: Math.round(savingsScore), insight: insightSavings(), action: sa?.action, pointGain: sa?.gain },
      { key: "debt", label: "Debt Load", weight: 0.2, score: Math.round(debtScore), insight: insightDebt(), action: da?.action, pointGain: da?.gain },
      { key: "bills", label: "Bill Reliability", weight: 0.15, score: Math.round(billScore), insight: insightBills(), action: ba?.action, pointGain: ba?.gain },
      { key: "consistency", label: "Spending Consistency", weight: 0.15, score: Math.round(consistencyScore), insight: insightConsistency() },
      { key: "emergency", label: "Emergency Fund", weight: 0.15, score: Math.round(efScore), insight: insightEF(), action: ea?.action, pointGain: ea?.gain },
      { key: "budget", label: "Budget Adherence", weight: 0.1, score: Math.round(budgetScore), insight: insightBudget(), action: bua?.action, pointGain: bua?.gain },
    ].sort((a, b) => a.score - b.score);
  }, [
    dashboard, totalPendingDebt, monthlyIncome, upcoming, last6Months,
    savingsGoals, budgets, spentByCategory, now,
  ]);

  // ── Composite score ───────────────────────────────────────────────────────────

  const compositeScore = useMemo(
    () => Math.round(subScores.reduce((total, s) => total + s.score * s.weight, 0)),
    [subScores]
  );

  const grade = letterGrade(compositeScore);
  const color = scoreColor(compositeScore);

  // ── Recommendations ───────────────────────────────────────────────────────────

  const recommendations = useMemo((): Recommendation[] => {
    const list: Recommendation[] = [];
    const savingsRate = dashboard?.thisMonth?.savingsRate ?? 0;

    if (savingsRate < 15) {
      const impact = Math.round((calcSavingsRateScore(20) - calcSavingsRateScore(savingsRate)) * 0.25);
      list.push({ id: "savings", text: `Boost your savings rate to 20% to gain approximately +${impact} pts.`, impact, color: "var(--ft-amber)", priority: "high" });
    }

    const ratio = monthlyIncome > 0 ? totalPendingDebt / monthlyIncome : 0;
    if (ratio > 3) {
      const impact = Math.round((calcDebtLoadScore(monthlyIncome, monthlyIncome) - calcDebtLoadScore(totalPendingDebt, monthlyIncome)) * 0.2);
      list.push({ id: "debt", text: `Debt is ${ratio.toFixed(1)}x monthly income. Reduce to under 1x to gain ~+${Math.max(impact, 1)} pts.`, impact: Math.max(impact, 1), color: "var(--ft-red)", priority: "critical" });
    }

    const hasEF = savingsGoals.some((g) => g.name.toLowerCase().includes("emergency"));
    if (!hasEF) {
      list.push({ id: "emergency", text: "Create an Emergency Fund goal in Goals — worth up to +15 pts when fully funded.", impact: 15, color: "var(--ft-amber)", priority: "high" });
    } else {
      const fund = savingsGoals.find((g) => g.name.toLowerCase().includes("emergency"))!;
      const pct = fund.target > 0 ? fund.current / fund.target : 0;
      if (pct < 0.5) {
        const impact = Math.round((50 - pct * 100) * 0.15);
        list.push({ id: "emergency-grow", text: `Emergency Fund is at ${(pct * 100).toFixed(0)}%. Grow to 50% for ~+${impact} pts.`, impact, color: "var(--ft-blue)", priority: "medium" });
      }
    }

    if (budgets.length === 0) {
      list.push({ id: "budgets", text: "Set up budget categories in Budget — worth up to +10 pts when all in-budget.", impact: 10, color: "var(--ft-cyan)", priority: "medium" });
    }

    const overdueBills = (upcoming ?? []).filter(
      (item: UpcomingItem) => item.status !== "paid" && new Date(item.dueDate) < now
    ).length;
    if (overdueBills > 0) {
      list.push({ id: "bills", text: `Pay ${overdueBills} overdue bill${overdueBills > 1 ? "s" : ""} — full reliability is worth up to +15 pts.`, impact: 10, color: "var(--ft-red)", priority: "critical" });
    }

    return list.sort((a, b) => {
      const pri: Record<string, number> = { critical: 0, high: 1, medium: 2 };
      return (pri[a.priority] - pri[b.priority]) || b.impact - a.impact;
    }).slice(0, 4);
  }, [dashboard, monthlyIncome, totalPendingDebt, savingsGoals, budgets, upcoming, now]);

  // ── Achievement checks ────────────────────────────────────────────────────────

  useEffect(() => {
    const savingsRate = dashboard?.thisMonth?.savingsRate ?? 0;
    const updated = [...achievements];
    let changed = false;
    function unlock(id: string, name: string, icon: string, description: string) {
      if (!updated.some((a) => a.id === id)) {
        updated.push({ id, name, icon, description, unlockedAt: new Date().toISOString() });
        changed = true;
      }
    }
    if (savingsRate > 20) unlock("savings-20", "Super Saver", "piggybank", "Savings rate above 20% — top tier!");
    const allBillsPaid = (upcoming ?? []).length > 0 &&
      (upcoming ?? []).filter((item: UpcomingItem) => item.status !== "paid" && new Date(item.dueDate) < now).length === 0;
    if (allBillsPaid) unlock("bills-clean", "Bill Perfectionist", "calendar", "All upcoming bills paid on time!");
    if (budgets.length > 0) unlock("first-budget", "Budget Planner", "barchart", "Set up your first budget category.");
    if ((allTxs ?? []).some((tx: Transaction) => tx.type === "income")) unlock("first-investment", "Tracker Initiated", "zap", "Started tracking income and investments.");
    if (compositeScore >= 80) unlock("score-80", "Financial Health Star", "star", "Achieved a score of 80+ on Financial Health!");
    if (changed) { setAchievements(updated); saveAchievements(updated); }
  }, [dashboard, upcoming, budgets, allTxs, compositeScore, now, achievements]);

  // ── Save score snapshot on data load ─────────────────────────────────────────
  useEffect(() => {
    if (dashLoading || txLoading || debtsLoading || upcomingLoading) return;
    if (compositeScore === 0) return;
    const updated = saveScoreSnapshot(compositeScore);
    setScoreHistory(updated);
  }, [compositeScore, dashLoading, txLoading, debtsLoading, upcomingLoading]);

  // ── Score trend vs. 7 days ago ────────────────────────────────────────────────
  const scoreTrend = useMemo(() => {
    if (scoreHistory.length < 2) return null;
    const sorted = [...scoreHistory].sort((a, b) => a.date.localeCompare(b.date));
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDayStr = sevenDaysAgo.toISOString().slice(0, 10);
    const pastSnap = [...sorted].reverse().find(s => s.date <= sevenDayStr);
    if (!pastSnap) return null;
    return compositeScore - pastSnap.score;
  }, [scoreHistory, compositeScore]);

  const scoreMin = scoreHistory.length > 0 ? Math.min(...scoreHistory.map(s => s.score)) : 0;
  const scoreMax = scoreHistory.length > 0 ? Math.max(...scoreHistory.map(s => s.score)) : 0;

  const isLoading = dashLoading || txLoading || debtsLoading || upcomingLoading;

  // ── Persona ───────────────────────────────────────────────────────────────────
  const pid = loadPersonaIds()[0];
  const personaFocus = pid ? PERSONA_HEALTH_FOCUS[pid] : null;
  const persona = pid ? PERSONAS.find(p => p.id === pid) : null;
  const personaColor = pid ? (PERSONA_COLORS[pid] ?? "var(--ft-amber)") : "var(--ft-amber)";

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <VStack gap={0}>

      {/* ── Page header ── */}
      <PageHeader
        icon={Activity}
        title="Financial Health Score"
        subtitle="composite score across 6 pillars · updated in real time"
        actions={
          scoreTrend !== null ? (
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
              color: scoreTrend >= 0 ? "var(--ft-green)" : "var(--ft-red)",
              border: `1px solid ${scoreTrend >= 0 ? "var(--ft-green)" : "var(--ft-red)"}`,
              padding: "4px 12px",
              letterSpacing: "0.04em",
            }}>
              {scoreTrend >= 0 ? "▲" : "▼"} <span className="pnum">{Math.abs(scoreTrend)}</span> pts vs 7d ago
            </div>
          ) : undefined
        }
      />

      {/* ── Persona focus strip ── */}
      {personaFocus && persona && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 12,
          padding: "10px 14px", marginBottom: 16,
          border: `1px solid ${personaColor}33`,
          borderLeft: `3px solid ${personaColor}`,
          background: "var(--ft-surface)",
          fontFamily: "var(--font-mono)",
        }}>
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: personaColor, letterSpacing: "0.12em", marginBottom: 3 }}>
              {persona.code} — FOCUS
            </div>
            <HStack gap={5} wrap>
              {personaFocus.keys.map(k => (
                <span key={k} style={{ fontSize: 8, color: personaColor, border: `1px solid ${personaColor}55`, padding: "1px 6px", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
                  {k}
                </span>
              ))}
            </HStack>
          </div>
          <div style={{ fontSize: 9, color: "var(--ft-dim)", lineHeight: 1.65, letterSpacing: "0.03em", paddingTop: 1 }}>
            {personaFocus.tip}
          </div>
        </div>
      )}

      {/* ── KPI strip (border-as-gap grid) ── */}
      <div style={{ display: "grid", gap: 1, background: "var(--ft-border)", marginBottom: 16 }}
           className="ft-four-col"
           data-cols="4">
        <KpiStripCell label="Composite Score" value={String(compositeScore)} unit="/ 100" color={color} />
        <KpiStripCell label="Grade" value={grade} unit="" color={color} />
        <KpiStripCell
          label="Score Trend (7d)"
          value={scoreTrend !== null ? `${scoreTrend >= 0 ? "+" : ""}${scoreTrend}` : "—"}
          unit="pts"
          color={scoreTrend === null ? "var(--ft-dim)" : scoreTrend >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
        />
        <KpiStripCell label="Pillars Tracked" value={String(subScores.length)} unit="pillars" color="var(--ft-muted)" />
      </div>

      {/* ── Hero: gauge + grade description + mini bars ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto 1fr", gap: isMobile ? 16 : 32, alignItems: "center", marginBottom: 16 }}>
        {/* Gauge */}
        <div>
          {isLoading ? (
            <div style={{
              width: 220, height: 220, border: "1px solid var(--ft-border)", background: "var(--ft-surface)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)",
            }}>
              Loading…
            </div>
          ) : (
            <ScoreGauge score={compositeScore} color={color} grade={grade} />
          )}
          {/* Color legend */}
          <HStack gap={4} justify="center" marginTop={6}>
            {[
              { label: "0–39", c: "var(--ft-red)" },
              { label: "40–69", c: "var(--ft-amber)" },
              { label: "70–89", c: "var(--ft-green)" },
              { label: "90–100", c: "var(--ft-cyan)" },
            ].map(b => (
              <ColorLegendItem key={b.label} label={b.label} color={b.c} />
            ))}
          </HStack>
        </div>

        {/* Right panel: grade + mini bars */}
        <VStack gap={16}>
          {/* Grade interpretation */}
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderLeft: `3px solid ${color}`, padding: "12px 16px" }}>
            <HStack align="center" justify="between" marginBottom={6}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                Grade {grade}
              </div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em" }}>
                {compositeScore}/100
              </div>
            </HStack>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color, fontWeight: 700, lineHeight: 1.3 }}>
              {gradeDescription(compositeScore)}
            </div>
            {scoreTrend !== null && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--ft-border)" }}>
                Score {scoreTrend >= 0 ? "up" : "down"}{" "}
                <span className="pnum" style={{ color: scoreTrend >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 600 }}>
                  {scoreTrend >= 0 ? "+" : ""}{scoreTrend} pts
                </span>{" "}
                in the last 7 days
              </div>
            )}
          </div>

          {/* Compact mini-bar summary (border-as-gap grid) */}
          <div style={{ display: "grid", gap: 1, background: "var(--ft-border)" }}>
            {[...subScores].sort((a, b) => b.weight - a.weight).map((s) => (
              <PillarMiniBar key={s.key} label={s.label} score={s.score} weight={s.weight} />
            ))}
          </div>
        </VStack>
      </div>

      {/* ── Score Breakdown (detailed rows, sorted worst-first) ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)",
          textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderLeft: "3px solid var(--ft-accent)", paddingLeft: 8,
        }}>
          <span>Score Breakdown · sorted by weakest first</span>
          <span style={{ color: "var(--ft-muted)", textTransform: "none" as const, letterSpacing: 0, borderLeft: "none", paddingLeft: 0 }}>
            {subScores.filter(s => s.action).length} improvement{subScores.filter(s => s.action).length !== 1 ? "s" : ""} available
          </span>
        </div>
        <VStack gap={6}>
          {subScores.map((s, i) => (
            <SubScoreRow key={s.key} sub={s} rank={i + 1} />
          ))}
        </VStack>
      </div>

      {/* ── Top Recommendations ── */}
      {recommendations.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, borderLeft: "3px solid var(--ft-amber)", paddingLeft: 8 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
              Improvement Recommendations
            </div>
            <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-green)", fontWeight: 700 }}>
              +{recommendations.reduce((s, r) => s + r.impact, 0)} pts potential
            </div>
          </div>
          <div style={{ display: "grid", gap: 1, background: "var(--ft-border)" }}>
            {recommendations.map((rec, i) => {
              const priorityLabel = rec.priority === "critical" ? "CRITICAL" : rec.priority === "high" ? "HIGH" : "MEDIUM";
              const priorityColor = rec.priority === "critical" ? "var(--ft-red)" : rec.priority === "high" ? "var(--ft-amber)" : "var(--ft-blue)";
              return (
                <RecRow key={rec.id} rec={rec} rank={i + 1} priorityLabel={priorityLabel} priorityColor={priorityColor} />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Score history chart ── */}
      {scoreHistory.length >= 2 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)",
            textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            borderLeft: "3px solid var(--ft-accent)", paddingLeft: 8,
          }}>
            <span>Score History · {scoreHistory.length} snapshots</span>
            <span style={{ color: "var(--ft-muted)", textTransform: "none" as const, letterSpacing: 0 }}>
              <span className="pnum">Min {scoreMin} · Max {scoreMax} · Δ {scoreMax - scoreMin} pts</span>
            </span>
          </div>
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderTop: "2px solid var(--ft-accent)", padding: "16px 12px 8px" }}>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={scoreHistory} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                <defs>
                  <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ft-border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={d => { const p = d.split("-"); return `${p[2]}/${p[1]}`; }}
                  tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
                  tickLine={false} axisLine={false} interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
                  tickLine={false} axisLine={false} ticks={[0, 40, 70, 90, 100]}
                />
                <ReferenceLine y={90} stroke="var(--ft-cyan)" strokeDasharray="3 3" strokeOpacity={0.35} label={{ value: "A+", fill: "var(--ft-cyan)", fontSize: 7, fontFamily: "var(--font-mono)", position: "insideRight" }} />
                <ReferenceLine y={70} stroke="var(--ft-green)" strokeDasharray="3 3" strokeOpacity={0.35} label={{ value: "B", fill: "var(--ft-green)", fontSize: 7, fontFamily: "var(--font-mono)", position: "insideRight" }} />
                <ReferenceLine y={40} stroke="var(--ft-amber)" strokeDasharray="3 3" strokeOpacity={0.35} label={{ value: "D", fill: "var(--ft-amber)", fontSize: 7, fontFamily: "var(--font-mono)", position: "insideRight" }} />
                <Tooltip
                  contentStyle={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", fontFamily: "var(--font-mono)", fontSize: 11 }}
                  labelStyle={{ color: "var(--ft-muted)", fontSize: 10 }}
                  formatter={(val: number) => [`${val}/100 — ${letterGrade(val)}`, "Score"]}
                />
                <Area type="monotone" dataKey="score" stroke={color} strokeWidth={2} fill="url(#scoreGrad)"
                  dot={scoreHistory.length <= 14 ? { r: 3, fill: color, stroke: "var(--ft-base)", strokeWidth: 1 } : false}
                  activeDot={{ r: 4, fill: color }}
                />
              </AreaChart>
            </ResponsiveContainer>
            <HStack gap={16} justify="center" marginTop={6}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                Score saved once per day on visit
              </div>
            </HStack>
          </div>
        </div>
      )}

      {/* ── Historical score table (when chart exists) ── */}
      {scoreHistory.length >= 5 && (() => {
        const last7 = [...scoreHistory].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
        return (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8, borderLeft: "3px solid var(--ft-border2)", paddingLeft: 8 }}>
              Recent Score Log
            </div>
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--ft-raised)" }}>
                    {["Date", "Score", "Grade", "Δ Change", "Bar"].map(h => (
                      <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase" as const, textAlign: "left", padding: "5px 12px", borderBottom: "1px solid var(--ft-border)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {last7.map((snap, idx) => {
                    const next = last7[idx + 1];
                    const delta = next ? snap.score - next.score : null;
                    const sc = scoreColor(snap.score);
                    return (
                      <ScoreLogRow key={snap.date} snap={snap} delta={delta} sc={sc} />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ── Achievements ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, borderLeft: "3px solid var(--ft-accent)", paddingLeft: 8 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
            Achievements
          </div>
          {achievements.length > 0 && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-accent)" }}>
              {achievements.length} unlocked
            </span>
          )}
        </div>

        {achievements.length === 0 ? (
          <div style={{
            border: "1px solid var(--ft-border)", borderLeft: "3px solid var(--ft-border2)",
            background: "var(--ft-surface)",
          }}>
            {[
              { id: "savings-20", name: "Super Saver", icon: "piggybank", condition: "Savings rate > 20%" },
              { id: "bills-clean", name: "Bill Perfectionist", icon: "calendar", condition: "All bills paid on time" },
              { id: "first-budget", name: "Budget Planner", icon: "barchart", condition: "Set up budget categories" },
              { id: "score-80", name: "Financial Health Star", icon: "star", condition: "Score ≥ 80" },
            ].map((a, idx, arr) => (
              <LockedAchievementRow key={a.id} item={a} isLast={idx === arr.length - 1} />
            ))}
          </div>
        ) : (
          <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
            {achievements.map((a) => <AchievementBadge key={a.id} achievement={a} />)}
          </div>
        )}
      </div>

      {/* ── Methodology ── */}
      <div style={{
        background: "var(--ft-surface)", border: "1px solid var(--ft-border)",
        padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 9,
        color: "var(--ft-dim)", lineHeight: 1.7,
      }}>
        <strong style={{ color: "var(--ft-muted)", letterSpacing: "0.05em" }}>METHODOLOGY — </strong>
        Savings Rate (25%) · Debt Load (20%) · Bill Reliability (15%) · Spending Consistency (15%) · Emergency Fund (15%) · Budget Adherence (10%).{" "}
        Score bands: F &lt;40 · D 40–49 · C 50–59 · B 60–69 · A 70–89 · A+ 90+.{" "}
        Emergency Fund reads from Goals. Budget reads from Budget page. All other inputs are live API data.
      </div>
    </VStack>
  );
}
