import { useListGoals } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { useWidgetVisibility } from "@/hooks/use-widget-visibility";
import { WidgetManagerButton } from "./MobileWidgetManager";

const GOAL_COLORS = ["#3B82F6", "#F97316", "#10B981", "#F59E0B", "#4ADE80", "#06B6D4"];

const MOCK_GOALS = [
  { id: "mg1", name: "Emergency Fund", emoji: null, target: 10000, current: 7500, deadline: "2026-12-31", monthlyContribution: 400 },
  { id: "mg2", name: "MacBook Pro",    emoji: null, target: 2500,  current: 1200, deadline: "2026-10-01", monthlyContribution: 200 },
  { id: "mg3", name: "Japan Holiday",  emoji: null, target: 3000,  current: 890,  deadline: "2027-03-15", monthlyContribution: 150 },
];

const MOCK_INTEREST_RATE = 0.03; // 3% APY

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function monthsToComplete(remaining: number, monthly: number): number | null {
  if (monthly <= 0 || remaining <= 0) return null;
  return Math.ceil(remaining / monthly);
}

function compoundFV(principal: number, monthly: number, months: number, apy: number) {
  const r = apy / 12;
  if (r === 0) return principal + monthly * months;
  return principal * Math.pow(1 + r, months) + monthly * (Math.pow(1 + r, months) - 1) / r;
}

function CompoundChart({ principal, monthly, months = 24, apy = MOCK_INTEREST_RATE }: {
  principal: number; monthly: number; months?: number; apy?: number;
}) {
  const W = 100;
  const H = 48;
  const pad = 2;
  const pts: [number, number][] = [];
  const ptsFlat: [number, number][] = [];
  for (let m = 0; m <= months; m++) {
    const withInt  = compoundFV(principal, monthly, m, apy);
    const withFlat = principal + monthly * m;
    pts.push([m, withInt]);
    ptsFlat.push([m, withFlat]);
  }
  const maxV = pts[pts.length - 1][1];
  const minV = principal;
  const scaleX = (m: number) => pad + (m / months) * (W - pad * 2);
  const scaleY = (v: number) => H - pad - ((v - minV) / (maxV - minV)) * (H - pad * 2);

  const intPts   = pts.map(([m, v]) => `${scaleX(m)},${scaleY(v)}`).join(" ");
  const flatPts  = ptsFlat.map(([m, v]) => `${scaleX(m)},${scaleY(v)}`).join(" ");
  const intArea  = `${intPts} ${scaleX(months)},${H} ${scaleX(0)},${H}`;
  const flatArea = `${flatPts} ${scaleX(months)},${H} ${scaleX(0)},${H}`;

  const gain = pts[pts.length - 1][1] - ptsFlat[ptsFlat.length - 1][1];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
          Compound growth · {months}M forecast
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-green)" }}>
          +{formatGbp(gain)} interest
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block", borderRadius: 4, overflow: "hidden" }}>
        <defs>
          <linearGradient id="cg-ig" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ft-accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--ft-accent)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cg-fg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ft-dim)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--ft-dim)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Flat (no interest) area */}
        <polygon points={flatArea} fill="url(#cg-fg)" />
        <polyline points={flatPts} fill="none" stroke="var(--ft-dim)" strokeWidth="1" strokeLinejoin="round" strokeDasharray="2 2" />
        {/* With interest area */}
        <polygon points={intArea} fill="url(#cg-ig)" />
        <polyline points={intPts} fill="none" stroke="var(--ft-accent)" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 18, height: 2, background: "var(--ft-accent)", borderRadius: 1 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>WITH {(apy * 100).toFixed(0)}% APY</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 18, height: 2, background: "var(--ft-dim)", borderRadius: 1, opacity: 0.5 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>NO INTEREST</span>
        </div>
      </div>
    </div>
  );
}

function GoalTrajectory({ current, target, monthly, color, months = 18 }: {
  current: number; target: number; monthly: number; color: string; months?: number;
}) {
  const W = 100; const H = 20;
  const pts: string[] = [];
  let done = -1;
  for (let m = 0; m <= months; m++) {
    const v = Math.min(current + monthly * m, target);
    if (v >= target && done < 0) done = m;
    const x = (m / months) * W;
    const y = H - (v / target) * (H - 2) - 2;
    pts.push(`${x},${y}`);
  }
  const area = `${pts.join(" ")} ${W},${H} 0,${H}`;
  const doneX = done >= 0 ? (done / months) * W : -1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id={`tg-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#tg-${color.replace("#", "")})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      {/* Target line */}
      <line x1="0" y1="2" x2={W} y2="2" stroke={color} strokeWidth="0.5" strokeDasharray="2 2" opacity="0.4" />
      {/* Done marker */}
      {doneX >= 0 && doneX <= W && (
        <line x1={doneX} y1="0" x2={doneX} y2={H} stroke={color} strokeWidth="0.8" strokeDasharray="2 1" opacity="0.7" />
      )}
    </svg>
  );
}

function ProgressRing({ pct, size = 64, color }: { pct: number; size?: number; color: string }) {
  const stroke = size > 56 ? 6 : 5;
  const r      = (size - stroke * 2) / 2;
  const circ   = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ft-raised)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.min(pct / 100, 1))}
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.1s ease" }}
      />
      <text x={size / 2} y={size / 2 + 4} textAnchor="middle"
        style={{ fontFamily: "var(--font-mono)", fontSize: size < 50 ? 9 : 11, fontWeight: 700, fill: color }}>
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

const GOALS_WIDGETS = [
  { id: "signals",         label: "Goal signals" },
  { id: "funding-gap",     label: "Funding gap analysis" },
  { id: "contribution",    label: "Contribution split" },
  { id: "timeline",        label: "Goal timeline" },
  { id: "scenario",        label: "Contribution scenario projection" },
  { id: "monte-carlo",     label: "Monte Carlo simulation" },
  { id: "conflict",        label: "Goal conflict detector" },
  { id: "goal-cards",      label: "Goal cards" },
];

export function MobileGoals() {
  const { data: goals = [], isLoading } = useListGoals();

  const hasMockData  = goals.length === 0;
  const displayGoals = hasMockData ? MOCK_GOALS : goals;

  const totalTarget    = displayGoals.reduce((s, g) => s + g.target, 0);
  const totalCurrent   = displayGoals.reduce((s, g) => s + g.current, 0);
  const totalMonthly   = displayGoals.reduce((s, g) => s + (g.monthlyContribution ?? 0), 0);
  const overallPct     = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0;

  const doneCount = displayGoals.filter(g => g.current >= g.target).length;
  const behindCount = displayGoals.filter(g => {
    if (g.current >= g.target) return false;
    const remaining = g.target - g.current;
    const months = g.monthlyContribution && g.monthlyContribution > 0 ? Math.ceil(remaining / g.monthlyContribution) : null;
    const days = g.deadline ? daysUntil(g.deadline) : null;
    const monthsLeft = days !== null && days > 0 ? days / 30 : null;
    return months !== null && monthsLeft !== null && months > monthsLeft;
  }).length;
  const onTrackCount = displayGoals.length - doneCount - behindCount;

  const goalsWithMonths = displayGoals
    .filter(g => g.current < g.target && g.monthlyContribution && g.monthlyContribution > 0)
    .map(g => ({ ...g, months: Math.ceil((g.target - g.current) / g.monthlyContribution!) }))
    .sort((a, b) => a.months - b.months);

  const { isVisible, toggle, resetAll, visible, hiddenCount } = useWidgetVisibility("goals", GOALS_WIDGETS);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 16px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-text)" }}>
            Goals
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
              {displayGoals.length} goal{displayGoals.length !== 1 ? "s" : ""}{hasMockData && " · preview"}
            </div>
            <WidgetManagerButton widgets={GOALS_WIDGETS} visible={visible} onToggle={toggle} onReset={resetAll} hiddenCount={hiddenCount} />
          </div>
        </div>
      </div>

      <div className="mobile-scroll" style={{ flex: 1, overflowY: "auto", padding: "0 16px", paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 16px)" }}>
        {isLoading ? (
          <div style={{ textAlign: "center", color: "var(--ft-dim)", fontSize: 13, padding: 40 }}>Loading…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, opacity: hasMockData ? 0.85 : 1 }}>

            {/* Hero summary card */}
            {displayGoals.length > 0 && (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ padding: "20px 20px 16px", display: "flex", alignItems: "center", gap: 18 }}>
                  <ProgressRing pct={overallPct} size={72} color="var(--ft-accent)" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 6 }}>
                      Total saved
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(19px, 6.5vw, 26px)", fontWeight: 700, color: "var(--ft-text)", letterSpacing: "-0.02em", lineHeight: 1, marginBottom: 3 }}>
                      {formatGbp(totalCurrent)}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
                      of {formatGbp(totalTarget)} · {formatGbp(totalTarget - totalCurrent)} to go
                    </div>
                  </div>
                </div>

                {/* Allocation bar */}
                <div style={{ padding: "0 20px 10px" }}>
                  <div style={{ display: "flex", height: 3, borderRadius: 2, overflow: "hidden", gap: 1 }}>
                    {displayGoals.map((g, i) => (
                      <div key={g.id} style={{
                        flex: g.current / Math.max(totalCurrent, 1),
                        background: GOAL_COLORS[i % GOAL_COLORS.length],
                        minWidth: 3,
                      }} />
                    ))}
                  </div>
                </div>

                {/* Status scoreboard */}
                <div style={{ padding: "10px 20px 12px", borderTop: "1px solid var(--ft-border)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { label: "On track", count: onTrackCount, color: "var(--ft-green)" },
                    { label: "Behind",   count: behindCount,  color: "var(--ft-red)"   },
                    { label: "Done",     count: doneCount,    color: "var(--ft-dim)"   },
                  ].map(pill => (
                    <div key={pill.label} style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "4px 10px",
                      background: `color-mix(in srgb, ${pill.color} 10%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${pill.color} 25%, transparent)`,
                      borderRadius: 4,
                    }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: pill.color }}>{pill.count}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.08em", textTransform: "uppercase", color: pill.color }}>{pill.label}</span>
                    </div>
                  ))}
                </div>

                {/* Monthly total + compound forecast */}
                <div style={{ borderTop: "1px solid var(--ft-border)", padding: "14px 20px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                      Monthly contributions
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-green)" }}>
                      +{formatGbp(totalMonthly)}/mo
                    </div>
                  </div>
                  {/* Compound interest chart */}
                  <CompoundChart principal={totalCurrent} monthly={totalMonthly} months={24} apy={MOCK_INTEREST_RATE} />
                </div>
              </div>
            )}

            {/* Goal Signals */}
            {isVisible("signals") && displayGoals.length > 0 && (() => {
              const levelColors: Record<string, string> = { red: "var(--ft-red)", amber: "var(--ft-accent)", green: "var(--ft-green)" };
              const signals: Array<{ level: "red" | "amber" | "green"; headline: string; detail: string }> = [];

              const goalDetails = displayGoals.map(g => {
                const remaining = g.target - g.current;
                const done = remaining <= 0;
                const days = g.deadline ? daysUntil(g.deadline) : null;
                const monthsLeft = days !== null && days > 0 ? days / 30 : null;
                const months = g.monthlyContribution && g.monthlyContribution > 0
                  ? Math.ceil(remaining / g.monthlyContribution)
                  : null;
                const behind = !done && months !== null && monthsLeft !== null && months > monthsLeft;
                const monthsGap = behind && months !== null && monthsLeft !== null ? months - monthsLeft : 0;
                const extraNeeded = behind && monthsLeft !== null && monthsLeft > 0 && g.monthlyContribution
                  ? Math.ceil(remaining / monthsLeft) - g.monthlyContribution
                  : 0;
                return { ...g, remaining, done, monthsLeft, months, behind, monthsGap, extraNeeded };
              });

              const critical = goalDetails.filter(g => g.behind).sort((a, b) => b.monthsGap - a.monthsGap)[0];
              if (critical && critical.deadline) {
                const deadlineLabel = new Date(critical.deadline).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
                signals.push({
                  level: "red",
                  headline: `${critical.name} — deadline at risk (${deadlineLabel})`,
                  detail: critical.extraNeeded > 0
                    ? `Needs +${formatGbp(critical.extraNeeded)}/mo extra to complete on time`
                    : "Increase contributions to hit this deadline",
                });
              }

              if (behindCount > 1) {
                signals.push({
                  level: "amber",
                  headline: `${behindCount} of ${displayGoals.length} goals behind schedule`,
                  detail: "Adjust monthly contributions or extend deadlines to recover",
                });
              }

              const closest = goalDetails
                .filter(g => !g.done && g.target > 0)
                .sort((a, b) => (b.current / b.target) - (a.current / a.target))[0];
              if (closest) {
                const pct = Math.round((closest.current / closest.target) * 100);
                signals.push({
                  level: "green",
                  headline: `${closest.name} is ${pct}% complete`,
                  detail: `${formatGbp(closest.current)} of ${formatGbp(closest.target)} saved · ${formatGbp(closest.remaining)} to go`,
                });
              }

              if (signals.length === 0) {
                signals.push({
                  level: "green",
                  headline: `Contributing ${formatGbp(totalMonthly)}/mo across all goals`,
                  detail: "All goals have active contributions in progress",
                });
              }

              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Goal Signals
                  </div>
                  {signals.slice(0, 3).map((s, i) => (
                    <div key={i} style={{ padding: "9px 14px", borderBottom: i < signals.slice(0, 3).length - 1 ? "1px solid var(--ft-border)" : "none", display: "flex", alignItems: "flex-start", gap: 9 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 3, background: levelColors[s.level], flexShrink: 0, marginTop: 3 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: levelColors[s.level], lineHeight: 1.3 }}>{s.headline}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 2, lineHeight: 1.4 }}>{s.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Funding gap analysis */}
            {isVisible("funding-gap") && displayGoals.length > 0 && (() => {
              const gaps = displayGoals
                .filter(g => g.current < g.target && g.monthlyContribution && g.monthlyContribution > 0 && g.deadline)
                .map((g, i) => {
                  const remaining  = g.target - g.current;
                  const days       = daysUntil(g.deadline!);
                  if (days <= 0) return null;
                  const monthsLeft      = Math.max(1, days / 30);
                  const requiredMonthly = remaining / monthsLeft;
                  const gap             = requiredMonthly - (g.monthlyContribution ?? 0);
                  return { ...g, remaining, monthsLeft, requiredMonthly, gap, color: GOAL_COLORS[i % GOAL_COLORS.length] };
                })
                .filter((x): x is NonNullable<typeof x> => x !== null);

              if (gaps.length === 0) return null;

              const totalGap  = gaps.reduce((s, g) => s + Math.max(0, g.gap), 0);
              const allFunded = totalGap < 1;

              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                      Funding gap
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: allFunded ? "var(--ft-green)" : "var(--ft-red)" }}>
                      {allFunded ? "all funded" : `+${formatGbp(totalGap)}/mo needed`}
                    </span>
                  </div>
                  {gaps.map((g, i) => {
                    const isLast  = i === gaps.length - 1;
                    const col     = g.gap <= 0 ? "var(--ft-green)" : "var(--ft-red)";
                    return (
                      <div key={g.id} style={{ padding: "9px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)", display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 6, height: 6, borderRadius: 3, background: g.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 500, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 1 }}>
                            needs {formatGbp(g.requiredMonthly)}/mo · current {formatGbp(g.monthlyContribution ?? 0)}/mo
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: col, fontVariantNumeric: "tabular-nums" }}>
                            {g.gap <= 0 ? "on track" : `+${formatGbp(g.gap)}`}
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>
                            {g.gap > 0 ? "per month" : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Contribution Optimizer */}
            {isVisible("contribution") && displayGoals.length > 0 && totalMonthly > 0 && (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-accent)" }}>
                    Contribution Split
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                    {formatGbp(totalMonthly)}/mo total
                  </div>
                </div>
                <div style={{ padding: "10px 16px 4px" }}>
                  {displayGoals.map((g, i) => {
                    const color = GOAL_COLORS[i % GOAL_COLORS.length];
                    const monthly = g.monthlyContribution ?? 0;
                    const sharePct = totalMonthly > 0 ? (monthly / totalMonthly) * 100 : 0;
                    const pct = g.target > 0 ? (g.current / g.target) * 100 : 0;
                    if (monthly <= 0) return null;
                    return (
                      <div key={g.id} style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <div style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
                          <div style={{ flex: 1, fontSize: 11, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-green)", fontWeight: 700 }}>+{formatGbp(monthly)}/mo</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", width: 30, textAlign: "right" }}>{sharePct.toFixed(0)}%</div>
                        </div>
                        <div style={{ position: "relative", height: 4, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${sharePct}%`, background: color, opacity: 0.75, borderRadius: 2 }} />
                          {/* Current progress ghost marker */}
                          {pct < 100 && pct > 0 && (
                            <div style={{ position: "absolute", top: 0, left: `${Math.min(pct * sharePct / 100, sharePct)}%`, width: 2, height: "100%", background: color, opacity: 0.4 }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Priority recommendation */}
                {goalsWithMonths.length > 0 && (
                  <div style={{ margin: "0 16px 12px", padding: "8px 10px", background: "var(--ft-raised)", borderRadius: 2, borderLeft: `2px solid var(--ft-accent)` }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-accent)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>
                      Quick win
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)" }}>
                      <span style={{ fontWeight: 700 }}>{goalsWithMonths[0].name}</span>
                      <span style={{ color: "var(--ft-dim)" }}> closes in {goalsWithMonths[0].months}mo · extra contributions here first</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Goal timeline — horizontal strip showing completion order */}
            {isVisible("timeline") && hasMockData && (() => {
              const timedGoals = displayGoals
                .filter(g => g.monthlyContribution && g.monthlyContribution > 0)
                .map((g, i) => {
                  const remaining = g.target - g.current;
                  const months = Math.ceil(remaining / (g.monthlyContribution ?? 1));
                  const projDate = new Date();
                  projDate.setMonth(projDate.getMonth() + months);
                  return { g, months, color: GOAL_COLORS[i % GOAL_COLORS.length], label: projDate.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }) };
                })
                .sort((a, b) => a.months - b.months);
              const maxMonths = Math.max(...timedGoals.map(t => t.months), 1);
              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 12 }}>
                    Completion timeline
                  </div>
                  <div style={{ position: "relative", paddingBottom: 6 }}>
                    {/* Axis line */}
                    <div style={{ height: 1, background: "var(--ft-border)", position: "absolute", top: 10, left: 0, right: 0 }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {timedGoals.map(({ g, months, color, label }) => {
                        const pct = (months / maxMonths) * 100;
                        return (
                          <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", width: 80, flexShrink: 0, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                              {g.name}
                            </div>
                            <div style={{ flex: 1, position: "relative", height: 20 }}>
                              <div style={{ height: 3, background: "var(--ft-raised)", borderRadius: 2, position: "absolute", top: "50%", left: 0, right: 0, transform: "translateY(-50%)" }} />
                              <div style={{
                                height: 3, background: color, borderRadius: 2,
                                position: "absolute", top: "50%", left: 0, width: `${pct}%`, transform: "translateY(-50%)",
                              }} />
                              <div style={{
                                position: "absolute", top: "50%", left: `${pct}%`,
                                transform: "translate(-50%, -50%)",
                                width: 10, height: 10, borderRadius: 5,
                                background: color, border: "2px solid var(--ft-base)",
                              }} />
                            </div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color, fontWeight: 700, width: 36, textAlign: "right", flexShrink: 0 }}>
                              {label}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Contribution scenario projection chart */}
            {isVisible("scenario") && displayGoals.length > 0 && hasMockData && (() => {
              const baseGoal = displayGoals.find(
                g => g.current < g.target && g.monthlyContribution && g.monthlyContribution > 0
              );
              if (!baseGoal || !baseGoal.monthlyContribution) return null;
              const current   = baseGoal.current;
              const target    = baseGoal.target;
              const base      = baseGoal.monthlyContribution;
              const maxMonths = Math.ceil((target - current) / base) + 4;
              const W = 300, H = 76, PX = 6, PY = 10;
              const xOf = (m: number) => PX + (m / maxMonths) * (W - 2 * PX);
              const yOf = (v: number) => PY + (1 - Math.min(v / target, 1.0)) * (H - 2 * PY);

              const buildScenario = (monthly: number) => {
                const pts: string[] = [];
                let completionMonth = -1;
                for (let m = 0; m <= maxMonths; m++) {
                  const v = Math.min(current + monthly * m, target);
                  if (v >= target && completionMonth < 0) completionMonth = m;
                  pts.push(`${xOf(m).toFixed(1)},${yOf(v).toFixed(1)}`);
                }
                return {
                  path: `M ${pts.join(" L ")}`,
                  completionMonth,
                  completionX: completionMonth >= 0 ? xOf(completionMonth) : -1,
                };
              };

              const scenarios = [
                { monthly: base,       label: `${formatGbp(base)}/mo`,       color: "var(--ft-accent)", opacity: 0.9 },
                { monthly: base + 50,  label: `${formatGbp(base + 50)}/mo`,  color: "var(--ft-green)",  opacity: 0.8 },
                { monthly: base + 100, label: `${formatGbp(base + 100)}/mo`, color: "#60A5FA",           opacity: 0.7 },
              ].map(s => ({ ...s, ...buildScenario(s.monthly) }));

              const now = new Date();
              const targetY = yOf(target);
              const step = Math.max(1, Math.ceil(maxMonths / 3));
              const axisLabels = Array.from({ length: Math.floor(maxMonths / step) + 1 }, (_, i) => {
                const m = i * step;
                const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
                return { x: xOf(m), label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }) };
              });

              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                      Contribution scenarios · {baseGoal.name}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>target {formatGbp(target)}</div>
                  </div>
                  <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
                    {/* Target ceiling */}
                    <line x1={PX} y1={targetY} x2={W - PX} y2={targetY}
                      stroke="var(--ft-dim)" strokeWidth="0.8" strokeDasharray="2 3" opacity="0.3" />
                    <text x={W - PX - 1} y={targetY - 3} fontFamily="monospace" fontSize="6.5"
                      fill="var(--ft-dim)" textAnchor="end" opacity="0.5">{formatGbp(target)}</text>
                    {/* Scenario projection paths */}
                    {scenarios.map(s => (
                      <g key={s.label}>
                        <path d={s.path} fill="none" stroke={s.color} strokeWidth="1.6"
                          strokeLinejoin="round" strokeLinecap="round" opacity={s.opacity} />
                        {s.completionX >= 0 && (
                          <>
                            <line x1={s.completionX} y1={targetY + 2} x2={s.completionX} y2={H - PY}
                              stroke={s.color} strokeWidth="0.6" strokeDasharray="2 2" opacity="0.4" />
                            <circle cx={s.completionX} cy={targetY} r="2.5" fill={s.color} opacity={s.opacity} />
                          </>
                        )}
                      </g>
                    ))}
                    {/* X axis */}
                    {axisLabels.map(({ x, label }) => (
                      <text key={label} x={x} y={H + 1} fontFamily="monospace" fontSize="7"
                        fill="var(--ft-dim)" textAnchor="middle" dominantBaseline="hanging">{label}</text>
                    ))}
                  </svg>
                  {/* Legend with completion dates */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 10 }}>
                    {scenarios.map((s, i) => {
                      const d = new Date(now.getFullYear(), now.getMonth() + s.completionMonth, 1);
                      const dateStr = s.completionMonth >= 0
                        ? d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" })
                        : "—";
                      const faster = i > 0 && scenarios[0].completionMonth >= 0 && s.completionMonth >= 0
                        ? scenarios[0].completionMonth - s.completionMonth
                        : 0;
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 20, height: 2, background: s.color, borderRadius: 1, opacity: s.opacity, flexShrink: 0 }} />
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: s.color }}>{s.label}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginLeft: "auto" }}>
                            {dateStr}{faster > 0 ? ` · ${faster}mo faster` : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Monte Carlo probability simulation */}
            {isVisible("monte-carlo") && hasMockData && displayGoals.length > 0 && (() => {
              const baseGoal = displayGoals.find(
                g => g.current < g.target && g.monthlyContribution && g.monthlyContribution > 0
              );
              if (!baseGoal || !baseGoal.monthlyContribution) return null;

              const N_SIMS  = 500;
              const current = baseGoal.current;
              const target  = baseGoal.target;
              const monthly = baseGoal.monthlyContribution;
              const MAX_M   = 120; // 10Y cap

              const completionMonths: number[] = [];
              for (let s = 0; s < N_SIMS; s++) {
                let bal  = current;
                let done = false;
                for (let m = 1; m <= MAX_M; m++) {
                  const noiseContrib = 0.7 + (Math.random() + Math.random()) * 0.3;
                  const noiseReturn  = (Math.random() * 0.07) / 12;
                  bal = bal * (1 + noiseReturn) + monthly * noiseContrib;
                  if (bal >= target) { completionMonths.push(m); done = true; break; }
                }
                if (!done) completionMonths.push(MAX_M + 1);
              }

              completionMonths.sort((a, b) => a - b);
              const p10  = completionMonths[Math.floor(N_SIMS * 0.10)];
              const p50  = completionMonths[Math.floor(N_SIMS * 0.50)];
              const p90  = completionMonths[Math.floor(N_SIMS * 0.90)];
              const successPct = Math.round((completionMonths.filter(m => m <= MAX_M).length / N_SIMS) * 100);

              const moToDate = (m: number) => {
                if (m > MAX_M) return ">10Y";
                const d = new Date();
                d.setMonth(d.getMonth() + m);
                return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
              };

              const BUCKET     = 6;
              const maxBucket  = Math.min(p90 + BUCKET * 3, MAX_M);
              const numBuckets = Math.ceil(maxBucket / BUCKET);
              const hist = Array.from({ length: numBuckets }, (_, i) =>
                completionMonths.filter(m => m >= i * BUCKET && m < (i + 1) * BUCKET).length
              );
              const histMax = Math.max(...hist, 1);

              const successColor = successPct >= 80 ? "var(--ft-green)" : successPct >= 50 ? "var(--ft-accent)" : "var(--ft-red)";

              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                      Monte Carlo · {baseGoal.name}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                      {N_SIMS} scenarios
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 36, fontWeight: 700, color: successColor, letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                      {successPct}%
                    </div>
                    <div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", fontWeight: 600 }}>
                        goal success rate
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>
                        variable contributions &amp; market returns
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
                    {([
                      { label: "Best case",  pct: "P10", months: p10, color: "var(--ft-green)" },
                      { label: "Median",     pct: "P50", months: p50, color: "var(--ft-text)"  },
                      { label: "Worst case", pct: "P90", months: p90, color: "var(--ft-red)"   },
                    ] as const).map(({ label, pct, months, color }) => (
                      <div key={pct} style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "8px 8px 6px" }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{pct}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-text)" }}>
                          {moToDate(months)}
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", marginTop: 2 }}>{label}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 32 }}>
                    {hist.map((count, i) => {
                      const bucketMid  = (i + 0.5) * BUCKET;
                      const isP50      = bucketMid >= p50 - BUCKET / 2 && bucketMid <= p50 + BUCKET / 2;
                      const hPct       = count / histMax;
                      return (
                        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                          <div style={{
                            background: isP50 ? successColor : `color-mix(in srgb, ${successColor} 30%, var(--ft-raised))`,
                            borderRadius: "1px 1px 0 0",
                            height: `${Math.max(3, hPct * 100)}%`,
                            opacity: 0.85,
                          }} />
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>now</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>completion distribution</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>{moToDate(maxBucket)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Goal conflict detector */}
            {isVisible("conflict") && hasMockData && (() => {
              const MOCK_MONTHLY_SAVINGS = 820;
              const overCommitted = totalMonthly > MOCK_MONTHLY_SAVINGS;
              const headroom = MOCK_MONTHLY_SAVINGS - totalMonthly;
              const utilizationPct = Math.min((totalMonthly / MOCK_MONTHLY_SAVINGS) * 100, 100);
              if (!overCommitted && utilizationPct < 70) return null;
              const borderColor = overCommitted ? "var(--ft-red)" : "var(--ft-accent)";
              return (
                <div style={{
                  background: "var(--ft-surface)",
                  border: `1px solid ${borderColor}`,
                  borderLeft: `3px solid ${borderColor}`,
                  borderRadius: 3,
                  padding: "12px 14px",
                  opacity: 0.85,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M6 1L11 10H1L6 1Z" stroke={borderColor} strokeWidth="1.2" fill="none" strokeLinejoin="round"/>
                        <line x1="6" y1="5" x2="6" y2="7.5" stroke={borderColor} strokeWidth="1.2" strokeLinecap="round"/>
                        <circle cx="6" cy="9" r="0.5" fill={borderColor}/>
                      </svg>
                      <span style={{ fontSize: 10, fontWeight: 600, color: borderColor, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        {overCommitted ? "Over-commitment detected" : "Budget pressure"}
                      </span>
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                      savings budget
                    </span>
                  </div>

                  {/* Utilisation bar */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ height: 4, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${utilizationPct}%`,
                        background: overCommitted ? "var(--ft-red)" : "var(--ft-accent)",
                        borderRadius: 2,
                        transition: "width 300ms ease",
                      }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>£0</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: borderColor }}>
                        {formatGbp(totalMonthly)}/mo committed
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                        {formatGbp(MOCK_MONTHLY_SAVINGS)} capacity
                      </span>
                    </div>
                  </div>

                  {/* Per-goal share rows */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                    {displayGoals.filter(g => (g.monthlyContribution ?? 0) > 0).map((g, i) => {
                      const contrib = g.monthlyContribution ?? 0;
                      const sharePct = (contrib / MOCK_MONTHLY_SAVINGS) * 100;
                      const isHeavy = sharePct > 30;
                      const color = GOAL_COLORS[i % GOAL_COLORS.length];
                      return (
                        <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: 1, background: color, flexShrink: 0 }} />
                          <div style={{ flex: 1, fontSize: 10, color: "var(--ft-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {g.name}
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <div style={{ width: 48, height: 3, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.min(sharePct / 50 * 100, 100)}%`, background: isHeavy ? "var(--ft-red)" : color, borderRadius: 2 }} />
                            </div>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: isHeavy ? "var(--ft-red)" : "var(--ft-dim)", minWidth: 36, textAlign: "right" }}>
                              {formatGbp(contrib)}/mo
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ paddingTop: 8, borderTop: "1px solid var(--ft-border)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: overCommitted ? "var(--ft-red)" : "var(--ft-dim)" }}>
                      {overCommitted
                        ? `${formatGbp(Math.abs(headroom))}/mo over budget · reduce contributions or defer a goal`
                        : `${formatGbp(headroom)}/mo headroom · ${Math.round(utilizationPct)}% of savings allocated`}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Individual goal cards */}
            {isVisible("goal-cards") && displayGoals.map((goal, i) => {
              const color     = GOAL_COLORS[i % GOAL_COLORS.length];
              const pct       = goal.target > 0 ? (goal.current / goal.target) * 100 : 0;
              const remaining  = goal.target - goal.current;
              const done       = pct >= 100;
              const days       = goal.deadline ? daysUntil(goal.deadline) : null;
              const months     = goal.monthlyContribution ? monthsToComplete(remaining, goal.monthlyContribution) : null;
              const monthsLeft = days !== null && days > 0 ? days / 30 : null;
              const pace       = (!done && months !== null && monthsLeft !== null)
                ? (months > monthsLeft ? "behind" : "on track")
                : null;

              const deadlineLabel = goal.deadline
                ? new Date(goal.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })
                : null;

              // Milestone markers (25%, 50%, 75%)
              const milestones = [25, 50, 75].map(m => ({ pct: m, reached: pct >= m }));

              return (
                <div key={goal.id} style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: 2, background: color, opacity: 0.8 }} />
                  <div style={{ padding: "14px 16px" }}>
                    {/* Name + deadline badge */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ft-text)" }}>{goal.name}</div>
                      </div>
                      {deadlineLabel && (
                        <div style={{
                          fontFamily: "var(--font-mono)", fontSize: 9, padding: "3px 7px",
                          background: `color-mix(in srgb, ${done ? "var(--ft-green)" : days !== null && days < 60 ? "var(--ft-red)" : color} 12%, transparent)`,
                          color: done ? "var(--ft-green)" : days !== null && days < 60 ? "var(--ft-red)" : color,
                          borderRadius: 4, letterSpacing: "0.04em",
                        }}>
                          {done ? "complete" : days !== null && days <= 0 ? "overdue" : deadlineLabel}
                        </div>
                      )}
                    </div>

                    {/* Amount row */}
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(17px, 6vw, 22px)", fontWeight: 700, color: "var(--ft-text)", letterSpacing: "-0.02em", lineHeight: 1 }}>
                          {formatGbp(goal.current)}
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>
                          of {formatGbp(goal.target)}{!done && ` · ${formatGbp(remaining)} to go`}
                        </div>
                      </div>
                      <ProgressRing pct={pct} size={44} color={color} />
                    </div>

                    {/* Progress bar with milestone markers */}
                    <div style={{ position: "relative", height: 6, background: "var(--ft-raised)", borderRadius: 3, overflow: "visible", marginBottom: 10 }}>
                      <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 3, opacity: 0.85 }} />
                      {milestones.map(ms => (
                        <div key={ms.pct} style={{
                          position: "absolute", top: "50%", left: `${ms.pct}%`,
                          transform: "translate(-50%, -50%)",
                          width: 6, height: 6, borderRadius: 3,
                          background: ms.reached ? color : "var(--ft-border)",
                          border: "1.5px solid var(--ft-base)",
                          zIndex: 1,
                        }} />
                      ))}
                    </div>

                    {/* Trajectory mini-chart */}
                    {!done && goal.monthlyContribution && goal.monthlyContribution > 0 && (
                      <div style={{ marginBottom: 10, borderRadius: 4, overflow: "hidden" }}>
                        <GoalTrajectory current={goal.current} target={goal.target} monthly={goal.monthlyContribution} color={color} months={months ? Math.min(months + 4, 24) : 24} />
                      </div>
                    )}

                    {/* Footer stats */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {goal.monthlyContribution && !done && (
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-green)", fontWeight: 700 }}>
                          +{formatGbp(goal.monthlyContribution)}/mo
                        </div>
                      )}
                      {pace !== null && (
                        <div style={{
                          fontFamily: "var(--font-mono)", fontSize: 8, padding: "2px 6px", fontWeight: 700,
                          background: `color-mix(in srgb, ${pace === "behind" ? "var(--ft-red)" : "var(--ft-green)"} 14%, transparent)`,
                          color: pace === "behind" ? "var(--ft-red)" : "var(--ft-green)",
                          borderRadius: 3, letterSpacing: "0.04em",
                        }}>
                          {pace}
                        </div>
                      )}
                      {months !== null && !done && (() => {
                        const projDate = new Date();
                        projDate.setMonth(projDate.getMonth() + months);
                        const label = projDate.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
                        return (
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                            done {label}
                          </div>
                        );
                      })()}
                      {pace === "behind" && monthsLeft !== null && monthsLeft > 0 && goal.monthlyContribution && !done && (() => {
                        const needed    = Math.ceil(remaining / monthsLeft);
                        const extra     = needed - goal.monthlyContribution;
                        if (extra <= 0) return null;
                        return (
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-red)", fontWeight: 700 }}>
                            need +{formatGbp(extra)}/mo
                          </div>
                        );
                      })()}
                      {days !== null && !done && days > 0 && (
                        <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, color: days < 60 ? "var(--ft-red)" : "var(--ft-dim)" }}>
                          {days}d left
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <a href="/goals" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", textDecoration: "none" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Manage goals</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)" }}>→</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
