import { useState, useMemo, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { loadPersonaIds } from "@/lib/persona";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { Flame } from "lucide-react";
import { formatGbp } from "@/lib/utils";
import {
  useGetDashboard,
  useListTransactions,
  useGetInvestmentSummary,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/page-header";
import { HStack, MonoLabel, PanelBox, Text, VStack } from "@/components/primitives";

// ── Helpers ────────────────────────────────────────────────────────────────────

function getThreeMonthsAgo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

/** Months until portfolio (with monthly contributions) grows to target. */
function monthsToFire(
  currentPortfolio: number,
  monthlyContribution: number,
  annualReturnRate: number,
  fireNumber: number
): number {
  if (currentPortfolio >= fireNumber) return 0;
  const r = annualReturnRate / 12;
  if (r === 0) {
    if (monthlyContribution <= 0) return Infinity;
    return Math.ceil((fireNumber - currentPortfolio) / monthlyContribution);
  }
  let portfolio = currentPortfolio;
  for (let month = 1; month <= 12 * 200; month++) {
    portfolio = portfolio * (1 + r) + monthlyContribution;
    if (portfolio >= fireNumber) return month;
  }
  return Infinity;
}

/** Monthly contribution needed to hit fireNumber in exactly targetMonths months. */
function monthlyContributionNeeded(
  currentPortfolio: number,
  annualReturnRate: number,
  fireNumber: number,
  targetMonths: number
): number {
  if (targetMonths <= 0) return 0;
  const r = annualReturnRate / 12;
  const growth = Math.pow(1 + r, targetMonths);
  if (r === 0) return Math.max(0, (fireNumber - currentPortfolio) / targetMonths);
  const pmt = (fireNumber - currentPortfolio * growth) * r / (growth - 1);
  return Math.max(0, pmt);
}

/** Build chart data: yearly snapshots of portfolio value up to FIRE or maxYears. */
function buildChartData(
  currentPortfolio: number,
  monthlyContribution: number,
  annualReturnRate: number,
  fireNumber: number,
  yearsToFire: number
): { year: number; value: number; contributions: number }[] {
  const maxYears = Math.min(Math.ceil(yearsToFire) + 5, 60);
  const r = annualReturnRate / 12;
  const data: { year: number; value: number; contributions: number }[] = [
    { year: 0, value: Math.round(currentPortfolio), contributions: Math.round(currentPortfolio) },
  ];
  let portfolio = currentPortfolio;
  let totalContrib = currentPortfolio;
  for (let yr = 1; yr <= maxYears; yr++) {
    for (let m = 0; m < 12; m++) {
      portfolio = portfolio * (1 + r) + monthlyContribution;
      totalContrib += monthlyContribution;
    }
    data.push({ year: yr, value: Math.round(portfolio), contributions: Math.round(totalContrib) });
  }
  return data;
}

/**
 * Estimate portfolio survival probability for a given withdrawal rate using
 * a simplified heuristic based on published Trinity Study / Bengen data.
 * Returns a percentage 0-100.
 */
function survivalProbability(withdrawalRate: number, years: number): number {
  const base30: Record<number, number> = {
    2: 100, 2.5: 100, 3: 99, 3.5: 96, 4: 90, 4.5: 82, 5: 70, 5.5: 60, 6: 50, 7: 35, 8: 22, 9: 12, 10: 5,
  };
  const keys = Object.keys(base30).map(Number).sort((a, b) => a - b);
  let prob30 = 5;
  for (let i = 0; i < keys.length - 1; i++) {
    const lo = keys[i];
    const hi = keys[i + 1];
    if (withdrawalRate >= lo && withdrawalRate <= hi) {
      const t = (withdrawalRate - lo) / (hi - lo);
      prob30 = base30[lo] + t * (base30[hi] - base30[lo]);
      break;
    }
    if (withdrawalRate <= lo) { prob30 = base30[lo]; break; }
    if (withdrawalRate >= hi && i === keys.length - 2) { prob30 = base30[hi]; break; }
  }
  const factor = years <= 30 ? 1 : Math.max(0.5, 1 - (years - 30) * 0.012);
  return Math.min(100, Math.max(1, Math.round(prob30 * factor)));
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const panelHeaderStyle: React.CSSProperties = {
  background: "var(--ft-raised)",
  borderBottom: "1px solid var(--ft-border)",
  padding: "0 16px",
  height: 34,
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--ft-muted)",
};

function PanelHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={panelHeaderStyle}>
      <Text as="span" color="var(--ft-accent)">·</Text>
      {children}
    </div>
  );
}

function InputRow({ label, help, children }: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState<boolean>(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 16px",
        borderBottom: "1px solid var(--ft-border)",
        background: hovered
          ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))"
          : "transparent",
        transition: "background 0.1s",
        cursor: "default",
      }}>
      <div>
        <Text as="div" mono size={11} weight={500} color="var(--ft-text)">
          {label}
        </Text>
        {help && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 2 }}>
            {help}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>
        {children}
      </div>
    </div>
  );
}

const numInputStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  background: "var(--ft-raised)",
  border: "1px solid var(--ft-border2)",
  color: "var(--ft-text)",
  padding: "5px 10px",
  width: 110,
  textAlign: "right",
  outline: "none",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--ft-raised)",
      padding: "7px 16px 5px",
      fontFamily: "var(--font-mono)",
      fontSize: 9,
      letterSpacing: "0.1em",
      textTransform: "uppercase" as const,
      color: "var(--ft-accent)",
      fontWeight: 700,
      borderTop: "1px solid var(--ft-border)",
    }}>
      {children}
    </div>
  );
}

// ── KPI strip cell ─────────────────────────────────────────────────────────────

interface KpiCellProps {
  label: string;
  value: string;
  sub: string;
  color: string;
}

function KpiCell({ label, value, sub, color }: KpiCellProps) {
  return (
    <div style={{
      background: "var(--ft-surface)",
      borderTop: `2px solid ${color}`,
      padding: "10px 14px",
    }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 4 }}>
        {label}
      </div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color, lineHeight: 1, letterSpacing: "-0.02em", marginBottom: 3 }}>
        {value}
      </div>
      <Text as="div" mono size={8} color="var(--ft-dim)">
        {sub}
      </Text>
    </div>
  );
}

// ── Gap metric cell ────────────────────────────────────────────────────────────

interface GapMetricCellProps {
  label: string;
  value: string;
  color: string;
}

function GapMetricCell({ label, value, color }: GapMetricCellProps) {
  return (
    <div style={{ background: "var(--ft-surface)", padding: "7px 12px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 3 }}>
        {label}
      </div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color, lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

// ── Milestone pill ─────────────────────────────────────────────────────────────

interface MilestonePillProps {
  label: string;
  value: number;
  pct: number;
  color: string;
  years: number | null;
  effPortfolio: number;
}

function MilestonePill({ label, value, pct, color, years, effPortfolio }: MilestonePillProps) {
  const reached = effPortfolio >= value;
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 10px",
      background: reached ? `color-mix(in srgb, ${color} 10%, transparent)` : "var(--ft-raised)",
      border: `1px solid ${reached ? color : "var(--ft-border)"}`,
      opacity: value <= 0 ? 0.4 : 1,
    }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: reached ? color : "var(--ft-dim)" }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: reached ? color : "var(--ft-muted)", fontWeight: reached ? 700 : 400 }}>
        {label}
      </span>
      <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
        {formatGbp(value)}
      </span>
      {years !== null && isFinite(years) && !reached && (
        <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
          {years.toFixed(1)}yr
        </span>
      )}
      {reached && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color }}>✓</span>
      )}
      {/* suppress unused warning */}
      {pct > 0 && null}
    </div>
  );
}

// Survival probability gauge
function SurvivalGauge({ probability, withdrawalRate }: { probability: number; withdrawalRate: number }) {
  const color = probability >= 90 ? "var(--ft-green)" : probability >= 75 ? "var(--ft-amber)" : "var(--ft-red)";
  const label = probability >= 90 ? "SAFE" : probability >= 75 ? "MODERATE" : "RISKY";

  return (
    <div style={{
      background: "var(--ft-surface)",
      border: "1px solid var(--ft-border)",
      borderTop: `2px solid ${color}`,
      padding: "14px 16px",
    }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--ft-dim)", marginBottom: 10 }}>
        Portfolio Survival (30yr)
      </div>

      <HStack gap={6} align="baseline" marginBottom={10}>
        <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 36, fontWeight: 700, color, lineHeight: 1, letterSpacing: "-0.03em" }}>
          {probability}%
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color, fontWeight: 700, letterSpacing: "0.1em" }}>
          {label}
        </div>
      </HStack>

      <div style={{ height: 6, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", overflow: "hidden", marginBottom: 6 }}>
        <div style={{ height: "100%", width: `${probability}%`, background: color, transition: "width 0.12s ease" }} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
        <span>0%</span>
        <Text as="span" color="var(--ft-red)">50%</Text>
        <Text as="span" color="var(--ft-amber)">75%</Text>
        <Text as="span" color="var(--ft-green)">90%</Text>
        <span>100%</span>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 8 }}>
        at {withdrawalRate}% SWR · Trinity Study / Bengen heuristic
      </div>
    </div>
  );
}

// Large hero result card
function HeroResult({ label, value, color, sub, note, isMobile }: {
  label: string;
  value: string;
  color: string;
  sub?: string;
  note?: string;
  isMobile?: boolean;
}) {
  return (
    <div style={{
      background: "var(--ft-surface)",
      border: "1px solid var(--ft-border)",
      borderTop: `3px solid ${color}`,
      padding: "18px 20px",
      flex: 1,
      minWidth: 0,
    }}>
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        letterSpacing: "0.12em",
        textTransform: "uppercase" as const,
        color: "var(--ft-dim)",
        marginBottom: 10,
      }}>
        {label}
      </div>
      <div className="pnum" style={{
        fontFamily: "var(--font-mono)",
        fontSize: isMobile ? 24 : 38,
        fontWeight: 700,
        color,
        lineHeight: 1,
        letterSpacing: "-0.03em",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        minWidth: 0,
        marginBottom: sub ? 8 : 0,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", marginTop: 4 }}>
          {sub}
        </div>
      )}
      {note && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>
          {note}
        </div>
      )}
    </div>
  );
}

// Coast FIRE card
function CoastCard({ coastFireNeeded, effPortfolio, coastFireGap, hasCoasted, targetYears }: {
  coastFireNeeded: number;
  effPortfolio: number;
  coastFireGap: number;
  hasCoasted: boolean;
  targetYears: number;
}) {
  const progressToCoast = coastFireNeeded > 0
    ? Math.min(100, Math.round((effPortfolio / coastFireNeeded) * 100))
    : 100;

  return (
    <div style={{
      background: "var(--ft-surface)",
      border: "1px solid var(--ft-border)",
      borderTop: `2px solid ${hasCoasted ? "var(--ft-green)" : "var(--ft-accent)"}`,
      padding: "14px 16px",
    }}>
      <HStack align="start" justify="between" marginBottom={10}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--ft-dim)" }}>
          Coast FIRE Number
        </div>
        {hasCoasted && (
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            background: "color-mix(in srgb, var(--ft-green) 15%, transparent)",
            color: "var(--ft-green)",
            padding: "2px 8px",
            letterSpacing: "0.07em",
            border: "1px solid color-mix(in srgb, var(--ft-green) 30%, transparent)",
          }}>
            COASTED ✓
          </span>
        )}
      </HStack>

      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 700, color: hasCoasted ? "var(--ft-green)" : "var(--ft-accent)", lineHeight: 1, letterSpacing: "-0.025em", marginBottom: 6 }}>
        {formatGbp(coastFireNeeded)}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 10 }}>
        stop contributing today, coast to FI by {targetYears}yr horizon
      </div>

      <div style={{ height: 5, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", overflow: "hidden", marginBottom: 5 }}>
        <div style={{
          height: "100%",
          width: `${progressToCoast}%`,
          background: hasCoasted ? "var(--ft-green)" : progressToCoast > 50 ? "var(--ft-amber)" : "var(--ft-accent)",
          transition: "width 0.12s ease",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
        <span className="pnum">{progressToCoast}% of coast target</span>
        <span className="pnum" style={{ color: hasCoasted ? "var(--ft-green)" : "var(--ft-red)" }}>
          {hasCoasted ? `+${formatGbp(coastFireGap)} surplus` : `${formatGbp(Math.abs(coastFireGap))} gap`}
        </span>
      </div>
    </div>
  );
}

// ── Sensitivity table row (with hover state) ──────────────────────────────────

interface SensitivityRowProps {
  r: number;
  yrs: number | null;
  arrYear: number | null;
  fireN: number;
  portfolioAtFI: number | null;
  monthlyNeed: number;
  isSelected: boolean;
  effPortfolio: number;
}

function SensitivityRow({ r, yrs, arrYear, fireN, portfolioAtFI, monthlyNeed, isSelected, effPortfolio }: SensitivityRowProps) {
  const [hovered, setHovered] = useState<boolean>(false);
  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderLeft: isSelected ? "2px solid var(--ft-accent)" : "2px solid transparent",
        borderBottom: "1px solid var(--ft-border)",
        background: hovered
          ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))"
          : isSelected
          ? "color-mix(in srgb, var(--ft-accent) 4%, var(--ft-surface))"
          : "var(--ft-surface)",
        transition: "background 0.1s",
        cursor: "default",
      }}>
      <td className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: isSelected ? "var(--ft-accent)" : "var(--ft-text)", padding: "6px 14px", fontWeight: isSelected ? 700 : 400 }}>
        {r}%{isSelected ? " ←" : ""}
      </td>
      <td className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", padding: "6px 14px" }}>
        {yrs !== null ? (effPortfolio >= fireN ? "Already FI" : `${yrs.toFixed(1)} yrs`) : "—"}
      </td>
      <td className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", padding: "6px 14px" }}>
        {arrYear ?? "—"}
      </td>
      <td className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", padding: "6px 14px" }}>
        {formatGbp(fireN)}
      </td>
      <td className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-green)", padding: "6px 14px" }}>
        {portfolioAtFI !== null ? formatGbp(portfolioAtFI) : "—"}
      </td>
      <td className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-cyan)", padding: "6px 14px" }}>
        {formatGbp(Math.round(monthlyNeed))}
      </td>
    </tr>
  );
}

// ── FIRE variant card (with hover state) ──────────────────────────────────────

interface FireVariantCardProps {
  v: {
    label: string;
    tag: string;
    number: number;
    years: number | null;
    color: string;
    desc: string;
    coasted?: boolean;
  };
  effPortfolio: number;
}

function FireVariantCard({ v, effPortfolio }: FireVariantCardProps) {
  const [hovered, setHovered] = useState<boolean>(false);
  const reached = effPortfolio >= v.number;
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))"
          : "var(--ft-surface)",
        borderTop: `2px solid ${v.color}`,
        padding: "12px 14px",
        cursor: "default",
        transition: "background 0.1s",
      }}>
      <HStack align="start" justify="between" marginBottom={8}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: v.color, letterSpacing: "0.07em" }}>
          {v.label}
        </div>
        {v.coasted && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, background: "color-mix(in srgb, var(--ft-cyan) 15%, transparent)", color: "var(--ft-cyan)", padding: "1px 6px", letterSpacing: "0.07em" }}>
            COASTED ✓
          </span>
        )}
        {reached && !v.coasted && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, background: "color-mix(in srgb, var(--ft-green) 15%, transparent)", color: "var(--ft-green)", padding: "1px 6px", letterSpacing: "0.07em" }}>
            REACHED ✓
          </span>
        )}
      </HStack>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: reached ? v.color : "var(--ft-text)", lineHeight: 1, marginBottom: 4, letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
        {formatGbp(v.number)}
      </div>
      <div style={{ height: 2, background: "var(--ft-border)", overflow: "hidden", marginBottom: 6 }}>
        <div style={{ height: "100%", width: `${Math.min(100, v.number > 0 ? Math.round((effPortfolio / v.number) * 100) : 100)}%`, background: v.color }} />
      </div>
      {v.years !== null && (
        <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", marginBottom: 4 }}>
          {isFinite(v.years) ? `${v.years.toFixed(1)} yrs away` : "—"}
        </div>
      )}
      <Text as="div" mono size={9} color="var(--ft-muted)" lineHeight={1.5}>
        {v.tag}
      </Text>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4, lineHeight: 1.4 }}>
        {v.desc}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Fire() {
  const isMobile = useIsMobile();
  const threeMonthsAgo = useMemo(() => getThreeMonthsAgo(), []);

  const { data: dashData } = useGetDashboard();
  const { data: investData } = useGetInvestmentSummary();
  const { data: recentTxs } = useListTransactions({ type: "expense", dateFrom: threeMonthsAgo });

  // ── Derived defaults from live data ────────────────────────────────────────

  const defaultPortfolio = useMemo(() => {
    if (investData?.totalValueGbp != null && investData.totalValueGbp > 0) {
      return Math.round(investData.totalValueGbp);
    }
    if (dashData?.netWorth != null && dashData.netWorth > 0) {
      return Math.round(dashData.netWorth);
    }
    return 0;
  }, [investData, dashData]);

  const defaultMonthlyExpenses = useMemo(() => {
    if (!recentTxs || recentTxs.length === 0) return 2000;
    const total = recentTxs.reduce((sum, t) => sum + t.gbpValue, 0);
    return Math.round(total / 3);
  }, [recentTxs]);

  // ── Inputs ─────────────────────────────────────────────────────────────────

  const [monthlyExpenses, setMonthlyExpenses] = useState<number | "">(0);
  const [annualReturn, setAnnualReturn] = useState(7);
  const [withdrawalRate, setWithdrawalRate] = useState(4);
  const [portfolioValue, setPortfolioValue] = useState<number | "">(0);
  const [monthlyContrib, setMonthlyContrib] = useState<number | "">(0);
  const [targetYears, setTargetYears] = useState(20);
  const [monthlyIncome, setMonthlyIncome] = useState<number | "">(0);

  const [defaultsApplied, setDefaultsApplied] = useState(false);

  useEffect(() => {
    if (!defaultsApplied && (defaultPortfolio > 0 || defaultMonthlyExpenses > 0)) {
      setMonthlyExpenses(defaultMonthlyExpenses);
      setPortfolioValue(defaultPortfolio);
      setDefaultsApplied(true);
    }
  }, [defaultPortfolio, defaultMonthlyExpenses, defaultsApplied]);

  const effMonthlyExpenses = typeof monthlyExpenses === "number" ? monthlyExpenses : 0;
  const effPortfolio = typeof portfolioValue === "number" ? portfolioValue : 0;
  const effMonthlyContrib = typeof monthlyContrib === "number" ? monthlyContrib : 0;
  const effMonthlyIncome = typeof monthlyIncome === "number" ? monthlyIncome : 0;

  // ── Core Calculations ───────────────────────────────────────────────────────

  const fireNumber = useMemo(() => {
    if (withdrawalRate <= 0) return 0;
    return Math.round((effMonthlyExpenses * 12) / (withdrawalRate / 100));
  }, [effMonthlyExpenses, withdrawalRate]);

  const monthsNeeded = useMemo(() => {
    return monthsToFire(effPortfolio, effMonthlyContrib, annualReturn / 100, fireNumber);
  }, [effPortfolio, effMonthlyContrib, annualReturn, fireNumber]);

  const yearsToFire = isFinite(monthsNeeded) ? monthsNeeded / 12 : Infinity;

  const progressPct = useMemo(() => {
    if (fireNumber <= 0) return 100;
    return Math.min(100, Math.round((effPortfolio / fireNumber) * 100));
  }, [effPortfolio, fireNumber]);

  const monthlyNeededForTarget = useMemo(() => {
    return monthlyContributionNeeded(effPortfolio, annualReturn / 100, fireNumber, targetYears * 12);
  }, [effPortfolio, annualReturn, fireNumber, targetYears]);

  const savingsRate = useMemo(() => {
    if (effMonthlyIncome <= 0) return null;
    return Math.round((effMonthlyContrib / effMonthlyIncome) * 100);
  }, [effMonthlyContrib, effMonthlyIncome]);

  const chartData = useMemo(() => {
    return buildChartData(
      effPortfolio,
      effMonthlyContrib,
      annualReturn / 100,
      fireNumber,
      isFinite(yearsToFire) ? yearsToFire : 30
    );
  }, [effPortfolio, effMonthlyContrib, annualReturn, fireNumber, yearsToFire]);

  const displayYearsToFire = isFinite(yearsToFire)
    ? yearsToFire < 0.1
      ? "Already FI"
      : `${yearsToFire.toFixed(1)} yrs`
    : "∞";

  const fireAgeNote = useMemo(() => {
    if (!isFinite(yearsToFire)) return undefined;
    const now = new Date();
    const fireYear = now.getFullYear() + Math.ceil(yearsToFire);
    return `~${fireYear}`;
  }, [yearsToFire]);

  // ── FIRE Variants ───────────────────────────────────────────────────────────

  const leanFireNumber = useMemo(() => {
    if (withdrawalRate <= 0) return 0;
    return Math.round((effMonthlyExpenses * 0.7 * 12) / (withdrawalRate / 100));
  }, [effMonthlyExpenses, withdrawalRate]);

  const fatFireNumber = useMemo(() => {
    if (withdrawalRate <= 0) return 0;
    return Math.round((effMonthlyExpenses * 1.5 * 12) / (withdrawalRate / 100));
  }, [effMonthlyExpenses, withdrawalRate]);

  const leanYears = useMemo(() => {
    const m = monthsToFire(effPortfolio, effMonthlyContrib, annualReturn / 100, leanFireNumber);
    return isFinite(m) ? m / 12 : Infinity;
  }, [effPortfolio, effMonthlyContrib, annualReturn, leanFireNumber]);

  const fatYears = useMemo(() => {
    const m = monthsToFire(effPortfolio, effMonthlyContrib, annualReturn / 100, fatFireNumber);
    return isFinite(m) ? m / 12 : Infinity;
  }, [effPortfolio, effMonthlyContrib, annualReturn, fatFireNumber]);

  // Coast FIRE
  const coastFireNeeded = useMemo(() => {
    if (targetYears <= 0 || fireNumber <= 0) return 0;
    return Math.round(fireNumber / Math.pow(1 + annualReturn / 100, targetYears));
  }, [fireNumber, annualReturn, targetYears]);

  const coastFireGap = effPortfolio - coastFireNeeded;
  const hasCoasted = coastFireGap >= 0;

  // Survival probability
  const survivalProb = useMemo(() => {
    return survivalProbability(withdrawalRate, 30);
  }, [withdrawalRate]);

  // Crossover year for chart label
  const crossoverYear = useMemo(() => {
    if (!isFinite(yearsToFire)) return null;
    return Math.ceil(yearsToFire);
  }, [yearsToFire]);

  // Monthly surplus/deficit
  const monthlySurplus = effMonthlyIncome > 0 ? effMonthlyIncome - effMonthlyExpenses : null;

  return (
    <div>
      <PageHeader
        icon={Flame}
        title="FIRE CALCULATOR"
        subtitle="Financial Independence / Retire Early"
      />

      {/* ── KPI strip (border-as-gap) ── */}
      <div style={{ display: "grid", gap: 1, background: "var(--ft-border)", marginBottom: 12 }}
           className="ft-four-col">
        <KpiCell
          label="FI Number"
          value={formatGbp(fireNumber)}
          sub={`${withdrawalRate}% SWR`}
          color="var(--ft-amber)"
        />
        <KpiCell
          label="Progress"
          value={`${progressPct}%`}
          sub={`${formatGbp(effPortfolio)} of ${formatGbp(fireNumber)}`}
          color={progressPct >= 100 ? "var(--ft-green)" : progressPct >= 50 ? "var(--ft-amber)" : "var(--ft-accent)"}
        />
        <KpiCell
          label="Years to FIRE"
          value={displayYearsToFire}
          sub={fireAgeNote ? `target ${fireAgeNote}` : "enter contributions"}
          color={isFinite(yearsToFire) && yearsToFire <= 15 ? "var(--ft-green)" : "var(--ft-amber)"}
        />
        <KpiCell
          label={`Needed in ${targetYears}yr`}
          value={formatGbp(Math.round(monthlyNeededForTarget))}
          sub={effMonthlyContrib > 0 ? (effMonthlyContrib >= monthlyNeededForTarget ? "on track ✓" : `${formatGbp(Math.round(monthlyNeededForTarget - effMonthlyContrib))} shortfall`) : "per month"}
          color="var(--ft-cyan)"
        />
      </div>

      {/* Persona context strip */}
      {(() => {
        const pid = loadPersonaIds()[0];
        const msgs: Record<string, string | null> = {
          wealth:  `Your live portfolio and expenses are pre-loaded. Adjust the savings rate and target to model different FI timelines.`,
          market:  progressPct >= 100 ? `Portfolio has reached your FIRE target — consider withdrawal rate and portfolio de-risking strategy.` : `Portfolio at ${progressPct}% of FIRE number. Maximise savings rate to accelerate timeline.`,
          budget:  `Track expenses carefully — every £100/mo increase in spending adds ~${((100 * 12) / (withdrawalRate / 100)).toFixed(0)} to your FIRE number.`,
          social:  null,
          full:    null,
        };
        const msg = pid ? msgs[pid] : null;
        if (!msg) return null;
        return (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", border: "1px solid var(--ft-amber)", background: "color-mix(in srgb, var(--ft-amber) 5%, transparent)", padding: "8px 14px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <span style={{ color: "var(--ft-amber)", fontWeight: 700, letterSpacing: "0.06em", flexShrink: 0 }}>FIRE TIP</span>
            <span>{msg}</span>
          </div>
        );
      })()}

      {/* ── HERO RESULTS ROW ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" as const, flexDirection: isMobile ? "column" : "row" }}>
        <HeroResult
          label="FI Number"
          value={formatGbp(fireNumber)}
          color="var(--ft-amber)"
          sub={`${withdrawalRate}% safe withdrawal rate · ${Math.round(1 / (withdrawalRate / 100))}× annual expenses`}
          note="The portfolio value at which you are financially independent"
          isMobile={isMobile}
        />
        <HeroResult
          label="Years to FIRE"
          value={displayYearsToFire}
          color={isFinite(yearsToFire) && yearsToFire <= 15 ? "var(--ft-green)" : "var(--ft-amber)"}
          sub={fireAgeNote ? `Target year: ${fireAgeNote}` : undefined}
          note={isFinite(yearsToFire) ? `At £${effMonthlyContrib.toLocaleString()}/mo contributions` : "Increase contributions or reduce expenses"}
          isMobile={isMobile}
        />
        <HeroResult
          label="Monthly Needed"
          value={formatGbp(Math.round(monthlyNeededForTarget))}
          color="var(--ft-cyan)"
          sub={`to reach FI in ${targetYears} years`}
          note={effMonthlyContrib > 0 ? (effMonthlyContrib >= monthlyNeededForTarget ? "On track for target" : `${formatGbp(Math.round(monthlyNeededForTarget - effMonthlyContrib))}/mo shortfall`) : undefined}
          isMobile={isMobile}
        />
      </div>

      {/* ── LARGE PROGRESS BAR ────────────────────────────────────────────────── */}
      <div style={{
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        padding: "18px 20px",
        marginBottom: 12,
        position: "relative",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, flexWrap: isMobile ? "wrap" : "nowrap", gap: isMobile ? 6 : 0 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--ft-dim)", borderLeft: "3px solid var(--ft-amber)", paddingLeft: 8 }}>
            {isMobile ? "FI Progress" : "Progress to Financial Independence"}
          </div>
          <HStack gap={6} align="baseline">
            <span className="pnum" style={{
              fontFamily: "var(--font-mono)",
              fontSize: isMobile ? 34 : 42,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: "-0.04em",
              color: progressPct >= 100 ? "var(--ft-green)" : progressPct >= 50 ? "var(--ft-amber)" : "var(--ft-accent)",
            }}>
              {progressPct}%
            </span>
            <Text as="span" mono size={isMobile ? 10 : 11} color="var(--ft-muted)">of FI</Text>
          </HStack>
        </div>

        {/* Main progress track */}
        <div style={{
          height: 20,
          background: "var(--ft-raised)",
          border: "1px solid var(--ft-border2)",
          overflow: "hidden",
          position: "relative",
          marginBottom: 8,
        }}>
          {/* Fill */}
          <div style={{
            height: "100%",
            width: `${progressPct}%`,
            background: progressPct >= 100
              ? "var(--ft-green)"
              : progressPct >= 75
              ? "var(--ft-amber)"
              : progressPct >= 50
              ? "var(--ft-amber)"
              : "var(--ft-accent)",
            transition: "width 0.12s ease",
            position: "relative",
          }}>
            {progressPct > 12 && (
              <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "rgba(0,0,0,0.6)", whiteSpace: "nowrap" }}>
                {formatGbp(effPortfolio)}
              </span>
            )}
          </div>

          {/* Coast FIRE marker */}
          {coastFireNeeded > 0 && coastFireNeeded < fireNumber && (
            <div style={{
              position: "absolute",
              top: 0,
              left: `${Math.min(100, (coastFireNeeded / fireNumber) * 100)}%`,
              height: "100%",
              width: 1,
              background: "var(--ft-cyan)",
              opacity: 0.8,
            }} />
          )}
        </div>

        {/* Labels */}
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 6 }}>
          <span>{formatGbp(0)}</span>
          {coastFireNeeded > 0 && coastFireNeeded < fireNumber && (
            <span className="pnum" style={{ color: "var(--ft-cyan)" }}>
              Coast {formatGbp(coastFireNeeded)} ({Math.round((coastFireNeeded / fireNumber) * 100)}%)
            </span>
          )}
          <span className="pnum" style={{ color: "var(--ft-amber)" }}>{formatGbp(fireNumber)} FI target</span>
        </div>

        {/* Gap to FIRE */}
        {effPortfolio < fireNumber && fireNumber > 0 && (
          <div style={{ display: "grid", gap: 1, background: "var(--ft-border)", marginTop: 12, marginBottom: 2 }}
               className="ft-three-col">
            <GapMetricCell label="Portfolio" value={formatGbp(effPortfolio)} color="var(--ft-text)" />
            <GapMetricCell label="Gap to FI" value={formatGbp(fireNumber - effPortfolio)} color="var(--ft-red)" />
            <GapMetricCell label="Monthly Contrib" value={effMonthlyContrib > 0 ? formatGbp(effMonthlyContrib) : "—"} color="var(--ft-cyan)" />
          </div>
        )}

        {/* Milestone pills */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginTop: 10 }}>
          {[
            { label: "Lean FIRE", value: leanFireNumber, pct: fireNumber > 0 ? Math.round((leanFireNumber / fireNumber) * 100) : 0, color: "var(--ft-cyan)", years: leanYears },
            { label: "Base FIRE", value: fireNumber, pct: 100, color: "var(--ft-green)", years: yearsToFire },
            { label: "Fat FIRE", value: fatFireNumber, pct: fireNumber > 0 ? Math.round((fatFireNumber / fireNumber) * 100) : 0, color: "var(--ft-amber)", years: fatYears },
            { label: "Coast FIRE", value: coastFireNeeded, pct: fireNumber > 0 ? Math.round((coastFireNeeded / fireNumber) * 100) : 0, color: "var(--ft-accent)", years: null as number | null },
          ].map((m) => (
            <MilestonePill
              key={m.label}
              label={m.label}
              value={m.value}
              pct={m.pct}
              color={m.color}
              years={m.years}
              effPortfolio={effPortfolio}
            />
          ))}
        </div>
      </div>

      {/* ── MAIN TWO-COL: INPUTS LEFT / RIGHT PANEL ───────────────────────────── */}
      <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 12, alignItems: "start", marginBottom: 12 }}>

        {/* Left: Input panel */}
        <PanelBox><VStack gap={0}>
          <PanelHeader>Inputs</PanelHeader>

          <SectionLabel>Current State</SectionLabel>
          <InputRow label="Current Portfolio (£)" help="Total invested assets (ISA, pension, brokerage)">
            <input
              type="number"
              min={0}
              step={1000}
              value={portfolioValue}
              onChange={e => setPortfolioValue(e.target.value === "" ? "" : Number(e.target.value))}
              style={numInputStyle}
            />
          </InputRow>

          <SectionLabel>Monthly Cashflow</SectionLabel>
          <InputRow label="Monthly Income (£)" help="Total take-home income">
            <input
              type="number"
              min={0}
              step={50}
              value={monthlyIncome}
              onChange={e => setMonthlyIncome(e.target.value === "" ? "" : Number(e.target.value))}
              style={numInputStyle}
            />
          </InputRow>
          <InputRow label="Monthly Expenses (£)" help="Spending target in retirement">
            <input
              type="number"
              min={0}
              step={50}
              value={monthlyExpenses}
              onChange={e => setMonthlyExpenses(e.target.value === "" ? "" : Number(e.target.value))}
              style={numInputStyle}
            />
          </InputRow>
          <InputRow label="Monthly Contribution (£)" help="How much you invest each month">
            <input
              type="number"
              min={0}
              step={50}
              value={monthlyContrib}
              onChange={e => setMonthlyContrib(e.target.value === "" ? "" : Number(e.target.value))}
              style={numInputStyle}
            />
          </InputRow>

          {/* Derived cashflow summary */}
          {effMonthlyIncome > 0 && (
            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--ft-border)", display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 3 }}>Savings Rate</div>
                <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: (savingsRate ?? 0) >= 40 ? "var(--ft-green)" : (savingsRate ?? 0) >= 20 ? "var(--ft-amber)" : "var(--ft-red)" }}>
                  {savingsRate !== null ? `${savingsRate}%` : "—"}
                </div>
              </div>
              {monthlySurplus !== null && (
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 3 }}>Surplus</div>
                  <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: monthlySurplus >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                    {monthlySurplus >= 0 ? "+" : ""}{formatGbp(monthlySurplus)}
                  </div>
                </div>
              )}
            </div>
          )}

          <SectionLabel>Assumptions</SectionLabel>
          <InputRow label="Annual Return (%)" help="Expected investment return per year">
            <input
              type="number"
              min={0}
              max={30}
              step={0.5}
              value={annualReturn}
              onChange={e => setAnnualReturn(Number(e.target.value))}
              style={numInputStyle}
            />
          </InputRow>
          <InputRow label="Withdrawal Rate (%)" help="Safe withdrawal rate (4% = 25× rule)">
            <input
              type="number"
              min={1}
              max={10}
              step={0.5}
              value={withdrawalRate}
              onChange={e => setWithdrawalRate(Number(e.target.value))}
              style={numInputStyle}
            />
          </InputRow>

          <SectionLabel>Reverse Calculator</SectionLabel>
          <InputRow label="Target Years to FI" help="How many years until you want to be FI">
            <input
              type="number"
              min={1}
              max={60}
              step={1}
              value={targetYears}
              onChange={e => setTargetYears(Number(e.target.value))}
              style={numInputStyle}
            />
          </InputRow>

          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--ft-border)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 }}>
              Monthly contribution needed
            </div>
            <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 700, color: "var(--ft-cyan)", lineHeight: 1, letterSpacing: "-0.02em" }}>
              {formatGbp(Math.round(monthlyNeededForTarget))}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>
              to reach FI in {targetYears} years
            </div>
          </div>

          {/* Formula notes */}
          <div style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--ft-border)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--ft-dim)",
            lineHeight: 1.8,
          }}>
            <div><span>FIRE =</span> <Text as="span" color="var(--ft-text)">expenses × 12 / {withdrawalRate}%</Text></div>
            <div><span>25×</span> rule at 4% · <span>Trinity study</span></div>
          </div>
        </VStack></PanelBox>

        {/* Right: chart + survival + coast */}
        <VStack gap={12}>

          {/* Survival + Coast row */}
          <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <SurvivalGauge probability={survivalProb} withdrawalRate={withdrawalRate} />
            <CoastCard
              coastFireNeeded={coastFireNeeded}
              effPortfolio={effPortfolio}
              coastFireGap={coastFireGap}
              hasCoasted={hasCoasted}
              targetYears={targetYears}
            />
          </div>

          {/* Chart panel */}
          <div style={{
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-border)",
          }}>
            <PanelHeader>Portfolio Growth Projection</PanelHeader>
            <div style={{ padding: "16px" }}>
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="fireGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--ft-green)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--ft-green)" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="fireContribGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--ft-accent)" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="var(--ft-accent)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--ft-border)" vertical={false} />
                    <XAxis
                      dataKey="year"
                      tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }}
                      axisLine={false}
                      tickLine={false}
                      label={{ value: "Years", position: "insideBottomRight", offset: -4, fill: "var(--ft-dim)", fontSize: 8, fontFamily: "var(--font-mono)" }}
                    />
                    <YAxis
                      tickFormatter={(v: number) => v >= 1_000_000 ? `£${(v / 1_000_000).toFixed(1)}M` : `£${(v / 1000).toFixed(0)}k`}
                      tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                    />
                    <Tooltip
                      formatter={(v: number, name: string) => [formatGbp(v), name === "value" ? "Portfolio" : "Contributions"]}
                      contentStyle={{
                        background: "var(--ft-raised)",
                        border: "1px solid var(--ft-border2)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                      }}
                      labelFormatter={(l: number) => `Year ${l}`}
                    />
                    {fireNumber > 0 && (
                      <ReferenceLine
                        y={fireNumber}
                        stroke="var(--ft-amber)"
                        strokeDasharray="6 3"
                        strokeWidth={1.5}
                        label={{
                          value: "FIRE",
                          position: "insideTopRight",
                          fill: "var(--ft-amber)",
                          fontSize: 8,
                          fontFamily: "var(--font-mono)",
                          fontWeight: 700,
                        }}
                      />
                    )}
                    {coastFireNeeded > 0 && coastFireNeeded < fireNumber && (
                      <ReferenceLine
                        y={coastFireNeeded}
                        stroke="var(--ft-accent)"
                        strokeDasharray="4 4"
                        strokeWidth={1}
                        label={{
                          value: "Coast",
                          position: "insideTopRight",
                          fill: "var(--ft-accent)",
                          fontSize: 8,
                          fontFamily: "var(--font-mono)",
                        }}
                      />
                    )}
                    {crossoverYear !== null && crossoverYear > 0 && (
                      <ReferenceLine
                        x={crossoverYear}
                        stroke="var(--ft-green)"
                        strokeDasharray="3 3"
                        strokeWidth={1}
                        label={{
                          value: `FI yr ${crossoverYear}`,
                          position: "insideTopLeft",
                          fill: "var(--ft-green)",
                          fontSize: 8,
                          fontFamily: "var(--font-mono)",
                        }}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="contributions"
                      stroke="var(--ft-accent)"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      fill="url(#fireContribGrad)"
                      dot={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="var(--ft-green)"
                      strokeWidth={2}
                      fill="url(#fireGrowthGrad)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
                  Enter values to see projection
                </div>
              )}
            </div>
            {/* Legend */}
            <div style={{ padding: "8px 16px 10px", background: "var(--ft-raised)", borderTop: "1px solid var(--ft-border)", display: "flex", gap: 20, flexWrap: "wrap" as const }}>
              <HStack gap={5} align="center">
                <div style={{ width: 16, height: 2, background: "var(--ft-green)" }} />
                <Text as="span" mono size={8} color="var(--ft-dim)">Portfolio value</Text>
              </HStack>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 16, height: 2, background: "var(--ft-accent)", borderTop: "1px dashed var(--ft-accent)" }} />
                <Text as="span" mono size={8} color="var(--ft-dim)">Total contributions</Text>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 16, height: 2, background: "var(--ft-amber)", borderTop: "1px dashed var(--ft-amber)" }} />
                <Text as="span" mono size={8} color="var(--ft-dim)">FIRE number</Text>
              </div>
              {crossoverYear !== null && crossoverYear > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 2, height: 12, background: "var(--ft-green)", opacity: 0.7 }} />
                  <Text as="span" mono size={8} color="var(--ft-dim)">Crossover yr {crossoverYear}</Text>
                </div>
              )}
            </div>
          </div>
        </VStack>
      </div>

      {/* ── FIRE VARIANTS ──────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gap: 1, background: "var(--ft-border)", marginBottom: 12 }}
           className="ft-four-col">
        {[
          {
            label: "LEAN FIRE",
            tag: "70% expenses",
            number: leanFireNumber,
            years: leanYears,
            color: "var(--ft-cyan)",
            desc: `${formatGbp(Math.round(effMonthlyExpenses * 0.7))}/mo in retirement`,
          },
          {
            label: "BASE FIRE",
            tag: "100% expenses",
            number: fireNumber,
            years: yearsToFire,
            color: "var(--ft-green)",
            desc: `${formatGbp(effMonthlyExpenses)}/mo in retirement`,
          },
          {
            label: "FAT FIRE",
            tag: "150% expenses",
            number: fatFireNumber,
            years: fatYears,
            color: "var(--ft-amber)",
            desc: `${formatGbp(Math.round(effMonthlyExpenses * 1.5))}/mo in retirement`,
          },
          {
            label: "COAST FIRE",
            tag: `stop contributing in ${targetYears}y`,
            number: coastFireNeeded,
            years: null as number | null,
            color: "var(--ft-accent)",
            desc: hasCoasted
              ? `Already coasted — ${formatGbp(coastFireGap)} above coast number`
              : `Need ${formatGbp(Math.abs(coastFireGap))} more to coast`,
            coasted: hasCoasted,
          },
        ].map((v) => (
          <FireVariantCard key={v.label} v={v} effPortfolio={effPortfolio} />
        ))}
      </div>

      {/* ── RETURN RATE SENSITIVITY ────────────────────────────────────────────── */}
      {fireNumber > 0 && effPortfolio > 0 && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)" }}>
          <div style={{ background: "var(--ft-raised)", borderBottom: "1px solid var(--ft-border)", padding: "0 16px", height: 34, display: "flex", alignItems: "center", gap: 8 }}>
            <Text as="span" color="var(--ft-accent)">·</Text>
            <Text as="span" mono upper size={10} weight={600} color="var(--ft-muted)" letterSpacing="0.08em">
              Return Rate Sensitivity
            </Text>
            <Text as="span" mono size={9} color="var(--ft-dim)">
              — how return rate affects years to FI
            </Text>
          </div>
          <div className="ft-scroll-x">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--ft-raised)" }}>
                  {["Return Rate", "Years to FI", "Arrival Year", "FIRE Number", "Portfolio at FI", "Monthly Needed"].map((h) => (
                    <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase" as const, textAlign: "left", padding: "6px 14px", borderBottom: "1px solid var(--ft-border)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[4, 5, 6, 7, 8, 10, 12].map((r) => {
                  const fireN = withdrawalRate > 0 ? Math.round((effMonthlyExpenses * 12) / (withdrawalRate / 100)) : 0;
                  const m = monthsToFire(effPortfolio, effMonthlyContrib, r / 100, fireN);
                  const yrs = isFinite(m) ? m / 12 : null;
                  const arrYear = yrs !== null ? new Date().getFullYear() + Math.ceil(yrs) : null;
                  const monthlyNeed = monthlyContributionNeeded(effPortfolio, r / 100, fireN, targetYears * 12);
                  const isSelected = Math.abs(r - annualReturn) < 0.5;
                  const portfolioAtFI = yrs !== null ? (() => {
                    let p = effPortfolio;
                    const rMonthly = r / 100 / 12;
                    for (let i = 0; i < Math.ceil(yrs * 12); i++) {
                      p = p * (1 + rMonthly) + effMonthlyContrib;
                    }
                    return Math.round(p);
                  })() : null;
                  return (
                    <SensitivityRow
                      key={r}
                      r={r}
                      yrs={yrs}
                      arrYear={arrYear}
                      fireN={fireN}
                      portfolioAtFI={portfolioAtFI}
                      monthlyNeed={monthlyNeed}
                      isSelected={isSelected}
                      effPortfolio={effPortfolio}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "6px 14px 8px", borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
            Highlighted row = your current return rate · Monthly Needed = contribution to hit FI in {targetYears} yrs at each rate
          </div>
        </div>
      )}
    </div>
  );
}
