import { useState, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useGetDashboard, useListTransactions } from "@workspace/api-client-react";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { formatBaseMoney } from "@/lib/utils";
import { loadPersonaIds, PERSONA_COLORS } from "@/lib/persona";
import { PageHeader } from "@/components/page-header";
import { TrendingUp } from "lucide-react";
import { HStack, MonoLabel, PanelBox, Text, VStack } from "@/components/primitives";

const MILESTONES = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000];
const HORIZONS = [5, 10, 20, 30] as const;
type Horizon = typeof HORIZONS[number];

// ─── Style constant (module-level) ───────────────────────────────────────────

const mono: React.CSSProperties = { fontFamily: "var(--font-mono)" };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMilestone(n: number) {
  if (n >= 1_000_000) return `£${n / 1_000_000}M`;
  return `£${n / 1_000}K`;
}

function get3MonthsAgo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

function buildScenario(
  startNW: number,
  monthlySavings: number,
  annualRate: number,
  horizonYears: number
): { month: number; value: number }[] {
  const monthlyRate = annualRate / 100 / 12;
  const months = horizonYears * 12;
  const points: { month: number; value: number }[] = [];
  let nw = startNW;
  for (let m = 0; m <= months; m++) {
    points.push({ month: m, value: Math.round(nw) });
    nw = nw * (1 + monthlyRate) + monthlySavings;
  }
  return points;
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: number;
}) {
  if (!active || !payload?.length) return null;
  const months = Number(label);
  const yr = Math.floor(months / 12);
  const mo = months % 12;
  return (
    <div style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 10 }}>
      <div style={{ color: "var(--ft-dim)", marginBottom: 6 }}>
        Year {yr}{mo > 0 ? `, month ${mo}` : ""}
      </div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: "flex", justifyContent: "space-between", gap: 16, color: p.color }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 700 }} className="pnum">{formatBaseMoney(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Horizon Button ───────────────────────────────────────────────────────────

interface HorizonButtonProps {
  h: Horizon;
  active: boolean;
  onClick: () => void;
}

function HorizonButton({ h, active, onClick }: HorizonButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
        padding: "4px 10px", cursor: "pointer", border: "1px solid",
        borderColor: active ? "var(--ft-green)" : "var(--ft-border)",
        background: active ? "color-mix(in srgb, var(--ft-green) 12%, transparent)" : "var(--ft-surface)",
        color: active ? "var(--ft-green)" : "var(--ft-dim)",
        transition: "all 0.1s",
      }}
    >{h}Y</button>
  );
}

// ─── KPI Cell ─────────────────────────────────────────────────────────────────

interface KpiCellProps {
  label: string;
  value: string;
  color: string;
  accentColor?: string;
}

function KpiCell({ label, value, color, accentColor }: KpiCellProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
      style={{
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        borderLeft: accentColor ? `3px solid ${accentColor}` : "none",
        padding: "10px 14px",
        transition: "background 0.1s",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", color: "var(--ft-dim)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, color, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1 }}>
        <span className="pnum">{value}</span>
      </div>
    </div>
  );
}

// ─── Milestone Table Header ───────────────────────────────────────────────────

interface MilestoneHeaderProps {
  bearRate: number;
  annualRate: number;
  bullRate: number;
  showScenarios: boolean;
}

function MilestoneHeader({ bearRate, annualRate, bullRate, showScenarios }: MilestoneHeaderProps) {
  const cols = ["TARGET", ...(showScenarios ? [`BEAR ${bearRate}%`, `BASE ${annualRate}%`, `BULL ${bullRate}%`] : [`BASE ${annualRate}%`])];
  return (
    <div style={{ display: "grid", gridTemplateColumns: showScenarios ? "auto 1fr 1fr 1fr" : "auto 1fr", background: "var(--ft-raised)", borderBottom: "1px solid var(--ft-border)" }}>
      {cols.map(h => (
        <div key={h} style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", padding: "5px 12px", letterSpacing: "0.06em" }}>{h}</div>
      ))}
    </div>
  );
}

// ─── Milestone Table Row ──────────────────────────────────────────────────────

interface MilestoneRowProps {
  milestone: number;
  base: number | undefined;
  bear: number | undefined;
  bull: number | undefined;
  showScenarios: boolean;
  fmtMonth: (m: number | undefined) => string;
}

function MilestoneRow({ milestone, base, bear, bull, showScenarios, fmtMonth }: MilestoneRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
      style={{
        display: "grid",
        gridTemplateColumns: showScenarios ? "auto 1fr 1fr 1fr" : "auto 1fr",
        borderBottom: "1px solid var(--ft-border)",
        alignItems: "center",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-green)", padding: "7px 12px", whiteSpace: "nowrap" }}>
        <span className="pnum">{fmtMilestone(milestone)}</span>
      </div>
      {showScenarios && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: bear != null ? "var(--ft-red)" : "var(--ft-dim)", padding: "7px 12px" }}>
          {fmtMonth(bear)}
        </div>
      )}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: base != null ? "var(--ft-text)" : "var(--ft-dim)", padding: "7px 12px", fontWeight: base != null ? 600 : 400 }}>
        {fmtMonth(base)}
      </div>
      {showScenarios && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: bull != null ? "var(--ft-blue)" : "var(--ft-dim)", padding: "7px 12px" }}>
          {fmtMonth(bull)}
        </div>
      )}
    </div>
  );
}

// ─── Breakdown Row ────────────────────────────────────────────────────────────

interface BreakdownRowProps {
  label: string;
  value: string;
  color: string;
  bold?: boolean;
}

function BreakdownRow({ label, value, color, bold }: BreakdownRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "9px 14px",
        borderBottom: "1px solid var(--ft-border)",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color, fontWeight: bold ? 700 : 400 }}>
        <span className="pnum">{value}</span>
      </span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Projection() {
  const isMobile = useIsMobile();
  const [annualRate, setAnnualRate] = useState(7);
  const [savingsAdj, setSavingsAdj] = useState(0);
  const [horizon, setHorizon] = useState<Horizon>(10);
  const [showScenarios, setShowScenarios] = useState(true);

  const { data: dash } = useGetDashboard();
  const dateFrom = useMemo(() => get3MonthsAgo(), []);
  const { data: recentTxs } = useListTransactions({ dateFrom });

  // Projection needs a real starting net worth and a real 3-month savings
  // baseline. A `?? 0` on netWorth plus a `: 500` fabricated £/mo default
  // would project growth from "£0 with £500/mo saved" for a user who
  // supplied nothing — the exact silent-fabrication pattern this pass
  // exists to remove.
  const { startNetWorth, avgMonthlySavings, hasEnoughData } = useMemo(() => {
    const nw = dash?.netWorth ?? null;
    if (nw == null || !recentTxs || recentTxs.length === 0) {
      return { startNetWorth: 0, avgMonthlySavings: 0, hasEnoughData: false };
    }
    // Signed baseEquivalent (fix 31 Aug): expense rows are negative;
    // `income - expenses` was `income - (negative)` = income +
    // magnitude → savings inflated by 2× actual spend. The
    // Math.max(0, …) clamp masked the sign confusion by pinning
    // negative results at zero, but positive results were wrong-
    // too-high, not wrong-in-the-clamp direction.
    // Math.abs both, skip unconvertible.
    const income = recentTxs
      .filter(t => t.type === "income")
      .reduce((s, t) => t.baseEquivalent == null ? s : s + Math.abs(t.baseEquivalent), 0);
    const expenses = recentTxs
      .filter(t => t.type === "expense")
      .reduce((s, t) => t.baseEquivalent == null ? s : s + Math.abs(t.baseEquivalent), 0);
    return { startNetWorth: nw, avgMonthlySavings: Math.max(0, (income - expenses) / 3), hasEnoughData: true };
  }, [dash, recentTxs]);

  const effectiveSavings = avgMonthlySavings * (1 + savingsAdj / 100);

  const bearRate = Math.max(0, annualRate - 4);
  const bullRate = annualRate + 4;

  const baseData = useMemo(() => buildScenario(startNetWorth, effectiveSavings, annualRate, horizon), [startNetWorth, effectiveSavings, annualRate, horizon]);
  const bearData = useMemo(() => buildScenario(startNetWorth, effectiveSavings, bearRate, horizon), [startNetWorth, effectiveSavings, bearRate, horizon]);
  const bullData = useMemo(() => buildScenario(startNetWorth, effectiveSavings, bullRate, horizon), [startNetWorth, effectiveSavings, bullRate, horizon]);

  const chartData = useMemo(() => baseData.map((p, i) => ({
    month: p.month,
    base: p.value,
    bear: bearData[i]?.value ?? p.value,
    bull: bullData[i]?.value ?? p.value,
  })), [baseData, bearData, bullData]);

  const finalBase = baseData[baseData.length - 1]?.value ?? 0;
  const finalBear = bearData[bearData.length - 1]?.value ?? 0;
  const finalBull = bullData[bullData.length - 1]?.value ?? 0;
  const gainBase = finalBase - startNetWorth;
  const maxVal = Math.max(...baseData.map(p => p.value));

  const milestoneHits = useMemo(() => MILESTONES.map(m => {
    const baseHit = baseData.find(p => p.value >= m);
    const bearHit = bearData.find(p => p.value >= m);
    const bullHit = bullData.find(p => p.value >= m);
    if (!baseHit && !bearHit && !bullHit) return null;
    return { milestone: m, base: baseHit?.month, bear: bearHit?.month, bull: bullHit?.month };
  }).filter((x): x is NonNullable<typeof x> => x !== null && (x.base != null || x.bull != null)), [baseData, bearData, bullData]);

  const relevantMilestones = MILESTONES.filter(m => m <= maxVal * 1.1);

  const fmtMonth = (m: number | undefined) => {
    if (m == null) return "—";
    const yr = Math.floor(m / 12);
    const mo = m % 12;
    if (yr === 0) return `${m}mo`;
    return mo > 0 ? `${yr}y ${mo}m` : `${yr}y`;
  };

  const kpiItems = [
    { label: "CURRENT NET WORTH", value: formatBaseMoney(startNetWorth), color: "var(--ft-text)", accent: "var(--ft-border)", show: true },
    { label: "TOTAL GAIN (BASE)", value: `+${formatBaseMoney(gainBase)}`, color: gainBase >= 0 ? "var(--ft-green)" : "var(--ft-red)", accent: gainBase >= 0 ? "var(--ft-green)" : "var(--ft-red)", show: true },
    { label: `IN ${horizon}Y — BEAR ${bearRate}%`, value: formatBaseMoney(finalBear), color: "var(--ft-red)", accent: "var(--ft-red)", show: showScenarios },
    { label: `IN ${horizon}Y — BASE ${annualRate}%`, value: formatBaseMoney(finalBase), color: "var(--ft-green)", accent: "var(--ft-green)", show: true },
    { label: `IN ${horizon}Y — BULL ${bullRate}%`, value: formatBaseMoney(finalBull), color: "var(--ft-blue)", accent: "var(--ft-blue)", show: showScenarios },
  ].filter(k => k.show);

  if (!hasEnoughData) {
    return (
      <div>
        <PageHeader
          icon={TrendingUp}
          title="NET WORTH PROJECTION"
          subtitle="compound growth model · three scenarios · milestone tracker"
        />
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "24px 20px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", lineHeight: 1.7 }}>
          Projection needs a real net worth and at least a few months of income and expenses to establish a savings baseline. Connect an account or import transactions and the three scenarios fill in.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        icon={TrendingUp}
        title="NET WORTH PROJECTION"
        subtitle="compound growth model · three scenarios · milestone tracker"
        actions={
          <HStack gap={2}>
            {HORIZONS.map(h => (
              <HorizonButton
                key={h}
                h={h}
                active={horizon === h}
                onClick={() => setHorizon(h)}
              />
            ))}
          </HStack>
        }
      />

      {/* Controls */}
      <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderLeft: "3px solid var(--ft-green)", padding: "14px 16px" }}>
          <HStack justify="between" marginBottom={10}>
            <span style={{ ...mono, fontSize: 9, letterSpacing: "0.1em", color: "var(--ft-dim)" }}>BASE ANNUAL RETURN</span>
            <span style={{ ...mono, fontSize: 14, color: "var(--ft-green)", fontWeight: 700 }}>
              <span className="pnum">{annualRate}</span>%
            </span>
          </HStack>
          <input type="range" min={0} max={20} step={0.5} value={annualRate}
            onChange={e => setAnnualRate(parseFloat(e.target.value))}
            style={{ width: "100%", accentColor: "var(--ft-green)" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", ...mono, fontSize: 8, color: "var(--ft-dim)", marginTop: 6 }}>
            <span>0% — cash</span>
            <span>S&P avg ~10%</span>
            <span>20% — aggressive</span>
          </div>
          {showScenarios && (
            <HStack gap={12} marginTop={8}>
              <span style={{ ...mono, fontSize: 9, color: "var(--ft-red)" }}>Bear <span className="pnum">{bearRate}</span>%</span>
              <span style={{ ...mono, fontSize: 9, color: "var(--ft-green)" }}>Base <span className="pnum">{annualRate}</span>%</span>
              <span style={{ ...mono, fontSize: 9, color: "var(--ft-blue)" }}>Bull <span className="pnum">{bullRate}</span>%</span>
            </HStack>
          )}
        </div>
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderLeft: "3px solid var(--ft-accent)", padding: "14px 16px" }}>
          <HStack justify="between" marginBottom={10}>
            <span style={{ ...mono, fontSize: 9, letterSpacing: "0.1em", color: "var(--ft-dim)" }}>MONTHLY SAVINGS</span>
            <span style={{ ...mono, fontSize: 14, color: "var(--ft-accent)", fontWeight: 700 }}>
              <span className="pnum">{formatBaseMoney(Math.round(effectiveSavings))}</span>/mo
            </span>
          </HStack>
          <input type="range" min={-50} max={100} step={5} value={savingsAdj}
            onChange={e => setSavingsAdj(parseInt(e.target.value))}
            style={{ width: "100%", accentColor: "var(--ft-accent)" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", ...mono, fontSize: 8, color: "var(--ft-dim)", marginTop: 6 }}>
            <span>-50%</span>
            <span>Base: <span className="pnum">{formatBaseMoney(Math.round(avgMonthlySavings))}</span>/mo</span>
            <span>+100%</span>
          </div>
          <div style={{ marginTop: 8, ...mono, fontSize: 9, color: "var(--ft-dim)" }}>
            {savingsAdj > 0 ? `Saving ${savingsAdj}% more than current pace` : savingsAdj < 0 ? `Saving ${Math.abs(savingsAdj)}% less than current pace` : "At current savings pace"}
          </div>
        </div>
      </div>

      {/* Persona context strip */}
      {(() => {
        const pid = loadPersonaIds()[0];
        if (!pid || pid === "full") return null;
        const msgs: Record<string, string | null> = {
          wealth:  `This projection uses your live net worth and 3-month spending average. Increasing your savings rate by 5% can reduce your FIRE timeline by years — adjust the savings slider to model it.`,
          market:  `Adjust the growth rate to model different market regimes. 7% is a realistic long-run real return for a diversified equity portfolio after inflation.`,
          budget:  `Increasing projected savings starts with reducing recurring expenses. Check Subscriptions and Budget pages to find where to cut.`,
          social:  null,
        };
        const msg = msgs[pid];
        if (!msg) return null;
        const color = PERSONA_COLORS[pid as keyof typeof PERSONA_COLORS] ?? "var(--ft-accent)";
        return (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", border: "1px solid var(--ft-border)", borderLeft: `3px solid ${color}`, background: "var(--ft-surface)", padding: "7px 14px 7px 10px", marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color, fontWeight: 700, flexShrink: 0 }}>·</span>
            <span>{msg}</span>
          </div>
        );
      })()}

      {/* Border-as-gap KPI strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : `repeat(${kpiItems.length}, 1fr)`,
          gap: 1,
          background: "var(--ft-border)",
          marginBottom: 16,
        }}
      >
        {kpiItems.map(({ label, value, color, accent }, i) => {
          const isLastOdd = isMobile && i === kpiItems.length - 1 && kpiItems.length % 2 === 1;
          return isLastOdd ? (
            <div key={label} style={{ gridColumn: "span 2" }}>
              <KpiCell label={label} value={value} color={color} accentColor={accent} />
            </div>
          ) : (
            <KpiCell key={label} label={label} value={value} color={color} accentColor={accent} />
          );
        })}
      </div>

      {/* Chart */}
      <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderLeft: "3px solid var(--ft-green)", padding: "16px", marginBottom: 16 }}>
        <HStack align="center" justify="between" marginBottom={12}>
          <div style={{ ...mono, fontSize: 9, letterSpacing: "0.1em", color: "var(--ft-dim)" }}>
            {horizon}-YEAR NET WORTH TRAJECTORY
          </div>
          <button
            onClick={() => setShowScenarios(s => !s)}
            style={{ ...mono, fontSize: 9, padding: "3px 8px", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-muted)", cursor: "pointer" }}
          >
            {showScenarios ? "Hide scenarios" : "Show scenarios"}
          </button>
        </HStack>
        <ResponsiveContainer width="100%" height={320}>
          {showScenarios ? (
            <LineChart data={chartData} margin={{ top: 10, right: 16, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="bullGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--ft-blue)" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="var(--ft-blue)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--ft-border)" />
              <XAxis
                dataKey="month"
                tickFormatter={m => (m as number) % 12 === 0 && (m as number) > 0 ? `Y${(m as number) / 12}` : ""}
                interval={11}
                tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tickFormatter={v => (v as number) >= 1_000_000 ? `£${((v as number) / 1_000_000).toFixed(1)}M` : `£${Math.round((v as number) / 1_000)}K`}
                tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
                axisLine={false} tickLine={false} width={64}
              />
              <Tooltip content={<CustomTooltip />} />
              {relevantMilestones.map(m => (
                <ReferenceLine key={m} y={m} stroke="var(--ft-border)" strokeDasharray="3 3"
                  label={{ value: fmtMilestone(m), position: "right", fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }}
                />
              ))}
              <Line type="monotone" dataKey="bear" name={`Bear ${bearRate}%`} stroke="var(--ft-red)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              <Line type="monotone" dataKey="base" name={`Base ${annualRate}%`} stroke="var(--ft-green)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="bull" name={`Bull ${bullRate}%`} stroke="var(--ft-blue)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            </LineChart>
          ) : (
            <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--ft-green)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--ft-green)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--ft-border)" />
              <XAxis
                dataKey="month"
                tickFormatter={m => (m as number) % 12 === 0 && (m as number) > 0 ? `Y${(m as number) / 12}` : ""}
                interval={11}
                tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tickFormatter={v => (v as number) >= 1_000_000 ? `£${((v as number) / 1_000_000).toFixed(1)}M` : `£${Math.round((v as number) / 1_000)}K`}
                tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
                axisLine={false} tickLine={false} width={64}
              />
              <Tooltip content={<CustomTooltip />} />
              {relevantMilestones.map(m => (
                <ReferenceLine key={m} y={m} stroke="var(--ft-border)" strokeDasharray="3 3"
                  label={{ value: fmtMilestone(m), position: "right", fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }}
                />
              ))}
              <Area type="monotone" dataKey="base" name={`Base ${annualRate}%`} stroke="var(--ft-green)" strokeWidth={2} fill="url(#projGrad)" dot={false} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Bottom two columns */}
      <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Milestone table */}
        {milestoneHits.length > 0 && (
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)" }}>
            <div style={{ ...mono, fontSize: 9, letterSpacing: "0.1em", color: "var(--ft-amber)", padding: "8px 14px", borderBottom: "1px solid var(--ft-border)", borderLeft: "3px solid var(--ft-amber)", background: "var(--ft-raised)", fontWeight: 700 }}>
              MILESTONE TIMELINE
            </div>
            <MilestoneHeader
              bearRate={bearRate}
              annualRate={annualRate}
              bullRate={bullRate}
              showScenarios={showScenarios}
            />
            {milestoneHits.map(hit => (
              <MilestoneRow
                key={hit.milestone}
                milestone={hit.milestone}
                base={hit.base}
                bear={hit.bear}
                bull={hit.bull}
                showScenarios={showScenarios}
                fmtMonth={fmtMonth}
              />
            ))}
          </div>
        )}

        {/* Compound breakdown */}
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)" }}>
          <div style={{ ...mono, fontSize: 9, letterSpacing: "0.1em", color: "var(--ft-blue)", padding: "8px 14px", borderBottom: "1px solid var(--ft-border)", borderLeft: "3px solid var(--ft-blue)", background: "var(--ft-raised)", fontWeight: 700 }}>
            BASE SCENARIO BREAKDOWN
          </div>
          <BreakdownRow label="Starting net worth" value={formatBaseMoney(startNetWorth)} color="var(--ft-text)" />
          <BreakdownRow label={`Contributions over ${horizon}y`} value={formatBaseMoney(Math.round(effectiveSavings * horizon * 12))} color="var(--ft-muted)" />
          <BreakdownRow label="Investment returns" value={formatBaseMoney(Math.round(gainBase - effectiveSavings * horizon * 12))} color="var(--ft-green)" />
          <BreakdownRow label={`Final value (${horizon}y)`} value={formatBaseMoney(finalBase)} color="var(--ft-green)" bold />
          <div style={{ padding: "12px 14px" }}>
            <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", marginBottom: 8 }}>
              SCENARIO RANGE AT {horizon} YEARS
            </div>
            <HStack gap={8} align="center">
              <span style={{ ...mono, fontSize: 10, color: "var(--ft-red)", fontWeight: 600 }}>
                <span className="pnum">{formatBaseMoney(finalBear)}</span>
              </span>
              <div style={{ flex: 1, height: 6, background: "var(--ft-raised)", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                <div style={{
                  position: "absolute",
                  left: `${Math.min(99, (finalBear / finalBull) * 100)}%`,
                  right: 0,
                  height: "100%",
                  background: "var(--ft-green)",
                  opacity: 0.6,
                  borderRadius: 3,
                }} />
                <div style={{
                  position: "absolute",
                  left: `${Math.min(99, (finalBase / finalBull) * 100) - 1}%`,
                  width: 3,
                  height: "100%",
                  background: "var(--ft-green)",
                  borderRadius: 1,
                }} />
              </div>
              <span style={{ ...mono, fontSize: 10, color: "var(--ft-blue)", fontWeight: 600 }}>
                <span className="pnum">{formatBaseMoney(finalBull)}</span>
              </span>
            </HStack>
            <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", marginTop: 6, textAlign: "center" }}>
              ▲ baseline <span className="pnum">{formatBaseMoney(finalBase)}</span> · upside: +<span className="pnum">{formatBaseMoney(finalBull - finalBase)}</span> · downside: −<span className="pnum">{formatBaseMoney(finalBase - finalBear)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
