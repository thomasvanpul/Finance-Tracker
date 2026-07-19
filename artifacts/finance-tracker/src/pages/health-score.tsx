import { useState, useEffect, useMemo, useRef } from "react";
import {
  useGetDashboard,
  useListTransactions,
  useListDebts,
  useListUpcoming,
} from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import type { Transaction, Debt, UpcomingItem } from "@workspace/api-client-react";
import { PiggyBank, CalendarCheck, BarChart3, Zap, Star } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type AchievementIconKey = "piggybank" | "calendar" | "barchart" | "zap" | "star";

interface Achievement {
  id: string;
  name: string;
  icon: AchievementIconKey | string; // string fallback for old data
  description: string;
  unlockedAt: string;
}

interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  current: number;
}

interface Budget {
  category: string;
  limit: number;
}

interface SubScore {
  key: string;
  label: string;
  weight: number;
  score: number;
  insight: string;
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

function loadSavingsGoals(): SavingsGoal[] {
  try {
    const raw = localStorage.getItem("ft-savings-goals");
    if (raw) return JSON.parse(raw) as SavingsGoal[];
  } catch {}
  return [];
}

function loadBudgets(): Budget[] {
  try {
    const raw = localStorage.getItem("ft-budgets");
    if (raw) return JSON.parse(raw) as Budget[];
  } catch {}
  return [];
}

// ── Score math ───────────────────────────────────────────────────────────────

function lerp(x: number, x0: number, y0: number, x1: number, y1: number): number {
  if (x <= x0) return y0;
  if (x >= x1) return y1;
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

function calcSavingsRateScore(rate: number): number {
  // 0%→0, 10%→40, 20%→70, 30%+→100
  if (rate <= 0) return 0;
  if (rate <= 10) return lerp(rate, 0, 0, 10, 40);
  if (rate <= 20) return lerp(rate, 10, 40, 20, 70);
  return lerp(rate, 20, 70, 30, 100);
}

function calcDebtLoadScore(totalDebt: number, monthlyIncome: number): number {
  if (monthlyIncome <= 0) return 50;
  const ratio = totalDebt / monthlyIncome;
  // 0x→100, 1x→70, 3x→40, 6x+→0
  if (ratio <= 0) return 100;
  if (ratio <= 1) return lerp(ratio, 0, 100, 1, 70);
  if (ratio <= 3) return lerp(ratio, 1, 70, 3, 40);
  if (ratio <= 6) return lerp(ratio, 3, 40, 6, 0);
  return 0;
}

function calcBillReliabilityScore(
  upcoming: UpcomingItem[],
  today: Date
): number {
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
  // CV < 0.1 → 100, CV > 0.5 → 20
  if (cv <= 0.1) return 100;
  if (cv >= 0.5) return 20;
  return lerp(cv, 0.1, 100, 0.5, 20);
}

function calcEmergencyFundScore(goals: SavingsGoal[]): number {
  const fund = goals.find((g) =>
    g.name.toLowerCase().includes("emergency")
  );
  if (!fund) return 0;
  if (fund.target <= 0) return 0;
  return Math.min((fund.current / fund.target) * 100, 100);
}

function calcBudgetAdherenceScore(
  budgets: Budget[],
  spentByCategory: Record<string, number>
): number {
  if (budgets.length === 0) return 50;
  const overBudget = budgets.filter((b) => {
    const spent = spentByCategory[b.category.toLowerCase()] ?? 0;
    return spent > b.limit;
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

function scoreColor(score: number): string {
  if (score >= 80) return "var(--ft-green)";
  if (score >= 60) return "var(--ft-amber)";
  if (score >= 40) return "var(--ft-amber)";
  return "var(--ft-red)";
}

// ── SVG animated ring ────────────────────────────────────────────────────────

interface ScoreRingProps {
  score: number;
  color: string;
  grade: string;
}

function ScoreRing({ score, color, grade }: ScoreRingProps) {
  const size = 200;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const sweepFraction = 270 / 360;
  const arcLength = circumference * sweepFraction;

  const [animated, setAnimated] = useState(0);
  const frameRef = useRef<number>(0);
  const startTimeRef = useRef<number | null>(null);
  const DURATION = 1200;

  useEffect(() => {
    startTimeRef.current = null;
    const target = score;

    function tick(timestamp: number) {
      if (startTimeRef.current === null) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / DURATION, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimated(eased * target);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [score]);

  const filled = (animated / 100) * arcLength;
  const gap = circumference - arcLength;

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        margin: "0 auto",
      }}
    >
      <svg
        width={size}
        height={size}
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--ft-border)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${gap}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />
        {/* Glow filter */}
        <defs>
          <filter id="score-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Filled arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${filled} ${circumference - filled}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(135 ${size / 2} ${size / 2})`}
          filter={score >= 80 ? "url(#score-glow)" : undefined}
        />
      </svg>
      {/* Centre label */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 6,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 52,
            fontWeight: 700,
            color,
            lineHeight: 1,
            letterSpacing: "-0.03em",
          }}
        >
          {Math.round(animated)}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            fontWeight: 700,
            color,
            letterSpacing: "0.08em",
            marginTop: 2,
          }}
        >
          {grade}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            color: "var(--ft-dim)",
            letterSpacing: "0.12em",
            textTransform: "uppercase" as const,
            marginTop: 4,
          }}
        >
          / 100
        </div>
      </div>
    </div>
  );
}

// ── Sub-score tile ────────────────────────────────────────────────────────────

interface SubScoreTileProps {
  sub: SubScore;
}

function SubScoreTile({ sub }: SubScoreTileProps) {
  const color = scoreColor(sub.score);
  const pct = sub.score;

  return (
    <div
      style={{
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        borderTop: `2px solid ${color}`,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--ft-dim)",
            textTransform: "uppercase" as const,
            letterSpacing: "0.08em",
          }}
        >
          {sub.label}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            fontWeight: 700,
            color,
          }}
        >
          {Math.round(sub.score)}
          <span
            style={{ fontSize: 9, color: "var(--ft-dim)", fontWeight: 400 }}
          >
            /100
          </span>
        </div>
      </div>
      <div
        style={{
          height: 4,
          background: "var(--ft-border)",
          borderRadius: 2,
          overflow: "hidden",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 2,
            transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--ft-muted)",
          lineHeight: 1.5,
        }}
      >
        {sub.insight}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          color: "var(--ft-dim)",
          marginTop: 6,
          textTransform: "uppercase" as const,
          letterSpacing: "0.05em",
        }}
      >
        weight: {Math.round(sub.weight * 100)}%
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
}

// ── Achievement badge ─────────────────────────────────────────────────────────

interface AchievementBadgeProps {
  achievement: Achievement;
}

const ACHIEVEMENT_ICONS: Record<string, React.ReactNode> = {
  piggybank: <PiggyBank size={22} color="var(--ft-accent)" />,
  calendar:  <CalendarCheck size={22} color="var(--ft-green)" />,
  barchart:  <BarChart3 size={22} color="var(--ft-blue)" />,
  zap:       <Zap size={22} color="var(--ft-cyan)" />,
  star:      <Star size={22} color="var(--ft-amber)" />,
};

function AchievementBadge({ achievement }: AchievementBadgeProps) {
  const icon = ACHIEVEMENT_ICONS[achievement.icon] ?? <Star size={22} color="var(--ft-accent)" />;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        borderLeft: "3px solid var(--ft-accent)",
        padding: "10px 14px",
      }}
    >
      <span style={{ lineHeight: 1, flexShrink: 0 }}>
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 700,
            color: "var(--ft-accent)",
            marginBottom: 2,
          }}
        >
          {achievement.name}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ft-muted)",
          }}
        >
          {achievement.description}
        </div>
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          color: "var(--ft-dim)",
          textAlign: "right" as const,
          flexShrink: 0,
          letterSpacing: "0.04em",
        }}
      >
        {new Date(achievement.unlockedAt).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HealthScore() {
  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  // ── API data ─────────────────────────────────────────────────────────────────

  const { data: dashboard, isLoading: dashLoading } = useGetDashboard();
  const { data: allTxs, isLoading: txLoading } = useListTransactions({});
  const { data: monthTxs } = useListTransactions({
    type: "expense",
    dateFrom: firstOfMonth,
  });
  const { data: debts, isLoading: debtsLoading } = useListDebts();
  const { data: upcoming, isLoading: upcomingLoading } = useListUpcoming();

  // ── Local state ───────────────────────────────────────────────────────────────

  const [achievements, setAchievements] = useState<Achievement[]>(() =>
    loadAchievements()
  );

  // ── Derived values ────────────────────────────────────────────────────────────

  const savingsGoals = useMemo(() => loadSavingsGoals(), []);
  const budgets = useMemo(() => loadBudgets(), []);

  // Per-category spend this month
  const spentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    if (!monthTxs) return map;
    monthTxs.forEach((tx: Transaction) => {
      const key = tx.category.toLowerCase();
      map[key] = (map[key] ?? 0) + tx.gbpValue;
    });
    return map;
  }, [monthTxs]);

  // Total pending debt
  const totalPendingDebt = useMemo(
    () =>
      (debts ?? [])
        .filter((d: Debt) => d.status === "pending")
        .reduce((s: number, d: Debt) => s + d.gbpEquivalent, 0),
    [debts]
  );

  const monthlyIncome = dashboard?.thisMonth?.income ?? 0;

  // Last 6 months from history
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
      if (savingsRate >= 30) return `Your savings rate of ${savingsRate.toFixed(0)}% is outstanding — keep it up!`;
      if (savingsRate >= 20) return `Your savings rate of ${savingsRate.toFixed(0)}% is excellent — you're on track.`;
      if (savingsRate >= 10) return `Savings rate ${savingsRate.toFixed(0)}% — aiming for 20% would be great.`;
      if (savingsRate > 0) return `Savings rate ${savingsRate.toFixed(0)}% — try to push towards 10% first.`;
      return "No savings detected this month — consider cutting discretionary spend.";
    }

    function insightDebt(): string {
      if (totalPendingDebt === 0) return "No pending debts — excellent position!";
      const ratio = monthlyIncome > 0 ? totalPendingDebt / monthlyIncome : 0;
      if (ratio <= 1) return `Debt load at ${ratio.toFixed(1)}x monthly income — manageable.`;
      if (ratio <= 3) return `Debt load ${ratio.toFixed(1)}x income — consider accelerating paydown.`;
      return `Debt load ${ratio.toFixed(1)}x income is high — prioritise debt reduction.`;
    }

    function insightBills(): string {
      const total = (upcoming ?? []).length;
      if (total === 0) return "No upcoming bills tracked.";
      const overdue = (upcoming ?? []).filter(
        (item: UpcomingItem) => item.status !== "paid" && new Date(item.dueDate) < now
      ).length;
      if (overdue === 0) return "All bills paid on time — great reliability!";
      return `${overdue} overdue bill${overdue > 1 ? "s" : ""} — pay promptly to improve this score.`;
    }

    function insightConsistency(): string {
      const totals = last6Months.map((m) => m.expenses).filter((v) => v > 0);
      if (totals.length < 2) return "Need at least 2 months of data for consistency analysis.";
      const mean = totals.reduce((s, v) => s + v, 0) / totals.length;
      if (mean <= 0) return "Insufficient data.";
      const variance = totals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / totals.length;
      const cv = Math.sqrt(variance) / mean;
      if (cv <= 0.1) return "Very consistent spending — predictable and stable.";
      if (cv <= 0.3) return "Moderate spending variation over last 6 months.";
      return "High spending variability — try to smooth out monthly costs.";
    }

    function insightEF(): string {
      const fund = savingsGoals.find((g) => g.name.toLowerCase().includes("emergency"));
      if (!fund) return "No Emergency Fund goal found — create one in Goals.";
      const pct = fund.target > 0 ? (fund.current / fund.target) * 100 : 0;
      if (pct >= 100) return `Emergency Fund fully funded at ${formatGbp(fund.current)} — excellent!`;
      return `Emergency Fund at ${pct.toFixed(0)}% (${formatGbp(fund.current)} of ${formatGbp(fund.target)}).`;
    }

    function insightBudget(): string {
      if (budgets.length === 0) return "No budgets set — add categories in the Budget page.";
      const over = budgets.filter((b) => {
        const spent = spentByCategory[b.category.toLowerCase()] ?? 0;
        return spent > b.limit;
      }).length;
      if (over === 0) return "All categories within budget this month — great discipline!";
      return `${over} of ${budgets.length} categories over budget this month.`;
    }

    return [
      {
        key: "savings",
        label: "Savings Rate",
        weight: 0.25,
        score: Math.round(savingsScore),
        insight: insightSavings(),
      },
      {
        key: "debt",
        label: "Debt Load",
        weight: 0.2,
        score: Math.round(debtScore),
        insight: insightDebt(),
      },
      {
        key: "bills",
        label: "Bill Reliability",
        weight: 0.15,
        score: Math.round(billScore),
        insight: insightBills(),
      },
      {
        key: "consistency",
        label: "Spending Consistency",
        weight: 0.15,
        score: Math.round(consistencyScore),
        insight: insightConsistency(),
      },
      {
        key: "emergency",
        label: "Emergency Fund",
        weight: 0.15,
        score: Math.round(efScore),
        insight: insightEF(),
      },
      {
        key: "budget",
        label: "Budget Adherence",
        weight: 0.1,
        score: Math.round(budgetScore),
        insight: insightBudget(),
      },
    ];
  }, [
    dashboard,
    totalPendingDebt,
    monthlyIncome,
    upcoming,
    last6Months,
    savingsGoals,
    budgets,
    spentByCategory,
    now,
  ]);

  // ── Composite score ───────────────────────────────────────────────────────────

  const compositeScore = useMemo(
    () =>
      Math.round(
        subScores.reduce((total, s) => total + s.score * s.weight, 0)
      ),
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
      list.push({
        id: "savings",
        text: `Boost your savings rate to 20% — worth ~+${impact} pts to your score.`,
        impact,
        color: "var(--ft-amber)",
      });
    }

    const ratio = monthlyIncome > 0 ? totalPendingDebt / monthlyIncome : 0;
    if (ratio > 3) {
      const impact = Math.round((calcDebtLoadScore(monthlyIncome, monthlyIncome) - calcDebtLoadScore(totalPendingDebt, monthlyIncome)) * 0.2);
      list.push({
        id: "debt",
        text: `Reduce outstanding debts — debt is ${ratio.toFixed(1)}x monthly income, worth ~+${Math.max(impact, 1)} pts.`,
        impact: Math.max(impact, 1),
        color: "var(--ft-red)",
      });
    }

    const hasEF = savingsGoals.some((g) => g.name.toLowerCase().includes("emergency"));
    if (!hasEF) {
      list.push({
        id: "emergency",
        text: "Create an Emergency Fund goal in Goals — worth up to +15 pts when funded.",
        impact: 15,
        color: "var(--ft-amber)",
      });
    } else {
      const fund = savingsGoals.find((g) => g.name.toLowerCase().includes("emergency"))!;
      const pct = fund.target > 0 ? fund.current / fund.target : 0;
      if (pct < 0.5) {
        const impact = Math.round((50 - pct * 100) * 0.15);
        list.push({
          id: "emergency-grow",
          text: `Grow your Emergency Fund to 50% — currently at ${(pct * 100).toFixed(0)}%, worth ~+${impact} pts.`,
          impact,
          color: "var(--ft-blue)",
        });
      }
    }

    if (budgets.length === 0) {
      list.push({
        id: "budgets",
        text: "Set up budget categories in Budget — worth up to +10 pts when all in-budget.",
        impact: 10,
        color: "var(--ft-cyan)",
      });
    }

    const overdueBills = (upcoming ?? []).filter(
      (item: UpcomingItem) => item.status !== "paid" && new Date(item.dueDate) < now
    ).length;
    if (overdueBills > 0) {
      list.push({
        id: "bills",
        text: `Pay ${overdueBills} overdue bill${overdueBills > 1 ? "s" : ""} — full reliability is worth up to +15 pts.`,
        impact: 10,
        color: "var(--ft-red)",
      });
    }

    return list
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 3);
  }, [dashboard, monthlyIncome, totalPendingDebt, savingsGoals, budgets, upcoming, now]);

  // ── Achievement checks ────────────────────────────────────────────────────────

  useEffect(() => {
    const savingsRate = dashboard?.thisMonth?.savingsRate ?? 0;
    const updated = [...achievements];
    let changed = false;

    function unlock(id: string, name: string, icon: string, description: string) {
      if (!updated.some((a) => a.id === id)) {
        updated.push({
          id,
          name,
          icon,
          description,
          unlockedAt: new Date().toISOString(),
        });
        changed = true;
      }
    }

    if (savingsRate > 20) {
      unlock("savings-20", "Super Saver", "piggybank", "Savings rate above 20% — you're in the top tier!");
    }

    const allBillsPaid =
      (upcoming ?? []).length > 0 &&
      (upcoming ?? []).filter(
        (item: UpcomingItem) => item.status !== "paid" && new Date(item.dueDate) < now
      ).length === 0;
    if (allBillsPaid) {
      unlock("bills-clean", "Bill Perfectionist", "calendar", "All upcoming bills paid on time!");
    }

    if (budgets.length > 0) {
      unlock("first-budget", "Budget Planner", "barchart", "Set up your first budget category.");
    }

    if ((allTxs ?? []).some((tx: Transaction) => tx.type === "income")) {
      unlock("first-investment", "Tracker Initiated", "zap", "Started tracking income and investments.");
    }

    if (compositeScore >= 80) {
      unlock("score-80", "Financial Health Star", "star", "Achieved a score of 80+ on Financial Health!");
    }

    if (changed) {
      setAchievements(updated);
      saveAchievements(updated);
    }
  }, [dashboard, upcoming, budgets, allTxs, compositeScore, now, achievements]);

  // ── Loading state ─────────────────────────────────────────────────────────────

  const isLoading = dashLoading || txLoading || debtsLoading || upcomingLoading;

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ── Page header ── */}
      <div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ft-dim)",
            letterSpacing: "0.1em",
            textTransform: "uppercase" as const,
            marginBottom: 4,
          }}
        >
          <span style={{ color: "var(--ft-accent)" }}>·</span> Financial Health Score
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--ft-dim)",
            letterSpacing: "0.05em",
          }}
        >
          Based on your live data · updated in real time
        </div>
      </div>

      {/* ── Score ring + quick summary ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 32,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div>
          {isLoading ? (
            <div
              style={{
                width: 200,
                height: 200,
                border: "1px solid var(--ft-border)",
                background: "var(--ft-surface)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--ft-dim)",
              }}
            >
              Loading…
            </div>
          ) : (
            <ScoreRing score={compositeScore} color={color} grade={grade} />
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--ft-dim)",
                textTransform: "uppercase" as const,
                letterSpacing: "0.08em",
                marginBottom: 4,
              }}
            >
              Score Interpretation
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: color,
                fontWeight: 600,
              }}
            >
              {compositeScore >= 90
                ? "Outstanding — elite financial discipline"
                : compositeScore >= 80
                ? "Excellent — strong across all pillars"
                : compositeScore >= 70
                ? "Good — a few areas to tighten up"
                : compositeScore >= 60
                ? "Fair — focus on the recommendations below"
                : compositeScore >= 40
                ? "Needs attention — take action now"
                : "Critical — immediate financial review needed"}
            </div>
          </div>

          {/* Mini score bars */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            {subScores.map((s) => (
              <div
                key={s.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "130px 1fr 40px",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--ft-dim)",
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.05em",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap" as const,
                  }}
                >
                  {s.label}
                </div>
                <div
                  style={{
                    height: 4,
                    background: "var(--ft-border)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${s.score}%`,
                      background: scoreColor(s.score),
                      borderRadius: 2,
                      transition: "width 0.5s ease",
                    }}
                  />
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    color: scoreColor(s.score),
                    textAlign: "right" as const,
                  }}
                >
                  {Math.round(s.score)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Sub-score tiles ── */}
      <div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--ft-dim)",
            textTransform: "uppercase" as const,
            letterSpacing: "0.08em",
            marginBottom: 10,
          }}
        >
          Score Breakdown
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
          }}
        >
          {subScores.map((s) => (
            <SubScoreTile key={s.key} sub={s} />
          ))}
        </div>
      </div>

      {/* ── Recommendations ── */}
      {recommendations.length > 0 && (
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--ft-dim)",
              textTransform: "uppercase" as const,
              letterSpacing: "0.08em",
              marginBottom: 10,
            }}
          >
            Top 3 Improvements
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recommendations.map((rec, i) => (
              <div
                key={rec.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: "var(--ft-surface)",
                  border: "1px solid var(--ft-border)",
                  borderLeft: `3px solid ${rec.color}`,
                  padding: "12px 16px",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 18,
                    fontWeight: 700,
                    color: rec.color,
                    opacity: 0.5,
                    flexShrink: 0,
                    width: 24,
                    textAlign: "center" as const,
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--ft-text)",
                      lineHeight: 1.5,
                    }}
                  >
                    {rec.text}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontWeight: 700,
                    color: rec.color,
                    flexShrink: 0,
                    minWidth: 60,
                    textAlign: "right" as const,
                  }}
                >
                  +{rec.impact}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Achievements ── */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--ft-dim)",
              textTransform: "uppercase" as const,
              letterSpacing: "0.08em",
            }}
          >
            Achievements
          </div>
          {achievements.length > 0 && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--ft-accent)",
              }}
            >
              {achievements.length} unlocked
            </span>
          )}
        </div>

        {achievements.length === 0 ? (
          <div
            style={{
              padding: "24px",
              textAlign: "center",
              border: "1px dashed var(--ft-border)",
              background: "var(--ft-surface)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ft-dim)",
            }}
          >
            No achievements yet — improve your score to unlock them!
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 8,
            }}
          >
            {achievements.map((a) => (
              <AchievementBadge key={a.id} achievement={a} />
            ))}
          </div>
        )}
      </div>

      {/* ── Methodology note ── */}
      <div
        style={{
          background: "var(--ft-surface)",
          border: "1px solid var(--ft-border)",
          padding: "12px 16px",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--ft-dim)",
          lineHeight: 1.7,
        }}
      >
        <strong style={{ color: "var(--ft-muted)", letterSpacing: "0.05em" }}>
          METHODOLOGY —{" "}
        </strong>
        Savings Rate (25%) · Debt Load (20%) · Bill Reliability (15%) · Spending
        Consistency (15%) · Emergency Fund (15%) · Budget Adherence (10%).
        Emergency Fund reads from the Goals page (localStorage). Budget
        Adherence reads from the Budget page. All other inputs are live API
        data. Score updates automatically as your data changes.
      </div>
    </div>
  );
}
