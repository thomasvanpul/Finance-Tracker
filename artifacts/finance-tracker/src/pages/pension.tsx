import { useState, useMemo, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { TrendingUp, ArrowRight, Target, ShieldCheck, AlertTriangle } from "lucide-react";
import { formatBaseMoney } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { loadPersonaIds } from "@/lib/persona";
import { HStack, MonoLabel, PanelBox, Text, VStack } from "@/components/primitives";

// ── Constants ─────────────────────────────────────────────────────────────────

const PENSION_KEY = "ft-pension";
const ISA_KEY = "ft-isa";
// Stable id so the "assumes N%/yr growth" pill on the Projected Pot
// caption can scroll + focus this specific input (G11 · disclosure
// contract). Rendered on the input at line ~1311.
const GROWTH_RATE_INPUT_ID = "pension-growth-rate-input";
const ISA_ANNUAL_ALLOWANCE = 20_000;
const STATE_PENSION_ANNUAL = 11_502;
const ANNUAL_ALLOWANCE = 60_000; // 2024/25 UK pension annual allowance

// ── Types ─────────────────────────────────────────────────────────────────────

interface PensionInputs {
  currentPot: number;
  employeeContrib: number;
  employerContrib: number;
  // Nullable. A fabricated 30 for currentAge invented the user's own age
  // — a personal fact they know and would immediately correct on first
  // use — and it silently drove `yearsToRetirement` and therefore every
  // projected number. Now null-by-default: projection short-circuits
  // to an "enter your current age" empty state until they enter one.
  currentAge: number | null;
  // Retirement age keeps its default. 67 is the UK State Pension age
  // (Pensions Act 2014); it is a documented external fact users can
  // review and change, not a made-up personal number.
  retirementAge: number;
  growthRate: number;
  includeStatePension: boolean;
  // Nullable. A fabricated £2,500/mo default silently rendered as the
  // user's own retirement goal — appeared on the "target: £X" line, in
  // the shortfall calc, in the Pension Health panel header, and in the
  // "on track"/"needs attention" colour pill. See the 26-Aug audit
  // report and Lock #16 · Shape B for the same-class defect elsewhere.
  targetMonthlyIncome: number | null;
}

interface IsaStore {
  contributed: number;
  taxYear: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentTaxYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const inNewYear = m > 3 || (m === 3 && d >= 6);
  const startYear = inNewYear ? y : y - 1;
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

function taxYearDates(taxYear: string): { start: Date; end: Date } {
  const startYear = parseInt(taxYear.split("/")[0], 10);
  return {
    start: new Date(startYear, 3, 6),
    end: new Date(startYear + 1, 3, 5),
  };
}

function daysUntil(target: Date): number {
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function formatTaxYearLabel(ty: string): string {
  const startYear = parseInt(ty.split("/")[0], 10);
  return `Tax Year ${ty}: 6 Apr ${startYear} – 5 Apr ${startYear + 1}`;
}

function loadPension(): PensionInputs {
  try {
    const raw = localStorage.getItem(PENSION_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<PensionInputs>;
      return {
        currentPot: stored.currentPot ?? 0,
        employeeContrib: stored.employeeContrib ?? 0,
        employerContrib: stored.employerContrib ?? 0,
        // Fresh-install null for currentAge; a stored 0 is treated as
        // "not set" (legacy installs that predate this fix).
        currentAge: stored.currentAge != null && stored.currentAge > 0 ? stored.currentAge : null,
        retirementAge: stored.retirementAge ?? 67,
        growthRate: stored.growthRate ?? 7,
        includeStatePension: stored.includeStatePension ?? true,
        // No fabricated default — see PensionInputs type comment. A stored
        // 0 (legacy fresh installs before this fix) is also treated as
        // "not set" so the health panel doesn't wrongly assert "ON TRACK".
        targetMonthlyIncome: stored.targetMonthlyIncome != null && stored.targetMonthlyIncome > 0 ? stored.targetMonthlyIncome : null,
      };
    }
  } catch { /* ignore */ }
  return {
    currentPot: 0,
    employeeContrib: 0,
    employerContrib: 0,
    currentAge: null,
    retirementAge: 67,
    growthRate: 7,
    includeStatePension: true,
    targetMonthlyIncome: null,
  };
}

function savePension(v: PensionInputs) {
  try { localStorage.setItem(PENSION_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

function loadIsa(): IsaStore {
  const ty = currentTaxYear();
  try {
    const raw = localStorage.getItem(ISA_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as IsaStore;
      if (stored.taxYear !== ty) return { contributed: 0, taxYear: ty };
      return stored;
    }
  } catch { /* ignore */ }
  return { contributed: 0, taxYear: ty };
}

function saveIsa(v: IsaStore) {
  try { localStorage.setItem(ISA_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

function calcPotFV(currentPot: number, monthlyContrib: number, annualGrowthRate: number, years: number): number {
  const r = annualGrowthRate / 100 / 12;
  const n = years * 12;
  if (r === 0) return currentPot + monthlyContrib * n;
  const growth = Math.pow(1 + r, n);
  return currentPot * growth + monthlyContrib * ((growth - 1) / r);
}

function buildChartData(
  currentPot: number,
  employeeMonthly: number,
  employerMonthly: number,
  annualGrowthRate: number,
  yearsToRetirement: number,
): {
  year: number;
  ageLabel: number;
  employee: number;
  employer: number;
  growth: number;
  total: number;
}[] {
  const monthlyRate = annualGrowthRate / 100 / 12;
  const monthlyTotal = employeeMonthly + employerMonthly;
  const data: { year: number; ageLabel: number; employee: number; employer: number; growth: number; total: number }[] = [];
  let pot = currentPot;
  let cumulativeEmployee = currentPot;
  let cumulativeEmployer = 0;

  data.push({
    year: 0,
    ageLabel: 0,
    employee: Math.round(cumulativeEmployee),
    employer: Math.round(cumulativeEmployer),
    growth: 0,
    total: Math.round(pot),
  });

  for (let yr = 1; yr <= yearsToRetirement; yr++) {
    for (let m = 0; m < 12; m++) {
      pot = pot * (1 + monthlyRate) + monthlyTotal;
      cumulativeEmployee += employeeMonthly;
      cumulativeEmployer += employerMonthly;
    }
    const totalContrib = cumulativeEmployee + cumulativeEmployer;
    data.push({
      year: yr,
      ageLabel: yr,
      employee: Math.round(cumulativeEmployee),
      employer: Math.round(cumulativeEmployer),
      growth: Math.max(0, Math.round(pot - totalContrib)),
      total: Math.round(pot),
    });
  }

  return data;
}

// ── Shared style atoms ─────────────────────────────────────────────────────────

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

// ── Sub-components ────────────────────────────────────────────────────────────

function PanelHeader({ children, color = "var(--ft-accent)" }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{
      background: "var(--ft-raised)",
      borderBottom: "1px solid var(--ft-border)",
      borderLeft: `3px solid ${color}`,
      padding: "0 16px 0 13px",
      height: 34,
      display: "flex",
      alignItems: "center",
      gap: 8,
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase" as const,
      color: "var(--ft-muted)",
    }}>
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
      onTouchStart={() => setHovered(true)}
      onTouchEnd={() => setHovered(false)}
      onTouchCancel={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 16px",
        borderBottom: "1px solid var(--ft-border)",
        background: hovered ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
      }}
    >
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

// ── KPI Bar ───────────────────────────────────────────────────────────────────

function KpiBar({
  projectedPot, totalContributions, totalGrowth, monthlyIncomeFromPot,
  monthlyStatePension, includeStatePension, yearsToRetirement, retirementAge,
  currentPot, targetMonthlyIncome, growthRate, onFocusGrowthRate,
}: {
  projectedPot: number;
  totalContributions: number;
  totalGrowth: number;
  monthlyIncomeFromPot: number;
  monthlyStatePension: number;
  includeStatePension: boolean;
  yearsToRetirement: number;
  retirementAge: number;
  currentPot: number;
  targetMonthlyIncome: number | null;
  // Disclosed model assumption. Rendered inline on the Projected Pot
  // caption ("assumes N%/yr growth") and wired to a callback that
  // scrolls + focuses the growth-rate input. Per G11 · disclosure
  // contract: a conventional pension-model assumption is legitimate
  // IF the user can see the value at the render point and change it.
  growthRate: number;
  onFocusGrowthRate: () => void;
}) {
  const totalMonthlyIncome = monthlyIncomeFromPot + monthlyStatePension;
  // No target → no track/on-track claim, no pill, no colour. The health
  // KPI cell drops its progress signal until the user tells us what they
  // are aiming for.
  const hasTarget = targetMonthlyIncome != null && targetMonthlyIncome > 0;
  const onTrackPct = hasTarget ? (totalMonthlyIncome / targetMonthlyIncome) * 100 : null;
  const onTrack = onTrackPct != null && onTrackPct >= 100;
  const closeToTrack = onTrackPct != null && onTrackPct >= 75;
  const trackColor = !hasTarget ? "var(--ft-muted)" : onTrack ? "var(--ft-green)" : closeToTrack ? "var(--ft-amber)" : "var(--ft-red)";
  const trackLabel = !hasTarget ? "NO TARGET" : onTrack ? "ON TRACK" : closeToTrack ? "CLOSE" : "OFF TRACK";

  const fmtBig = (v: number) =>
    v >= 1_000_000 ? `£${(v / 1_000_000).toFixed(2)}M` : `£${(v / 1000).toFixed(0)}k`;

  const returnPct = totalContributions > 0 ? ((projectedPot - totalContributions) / totalContributions) * 100 : 0;

  const isMobile = useIsMobile();
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
      gap: 1,
      background: "var(--ft-border)",
      borderBottom: "1px solid var(--ft-border)",
    }}>
      {/* Projected pot */}
      <div style={{ padding: "14px 16px", background: "var(--ft-surface)", borderTop: "2px solid var(--ft-green)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6 }}>
          Projected Pot
        </div>
        <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 700, color: "var(--ft-green)", lineHeight: 1 }}>
          {fmtBig(Math.round(projectedPot))}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 5 }}>
          at age {retirementAge} · in {yearsToRetirement}yr ·{" "}
          {/* Disclosure of the growth-rate assumption at the point the
              projection reads. Clickable — scrolls to and focuses the
              growth-rate input so "change it" is one interaction away
              from where the £X hero renders. */}
          <button
            type="button"
            data-testid="growth-rate-disclosure"
            onClick={onFocusGrowthRate}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              margin: 0,
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--ft-accent)",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            assumes {growthRate}%/yr growth
          </button>
        </div>
      </div>

      {/* Total contributions */}
      <div style={{ padding: "14px 16px", background: "var(--ft-surface)", borderTop: "2px solid var(--ft-cyan)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6 }}>
          Total Contributions
        </div>
        <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "var(--ft-cyan)", lineHeight: 1 }}>
          {fmtBig(Math.round(totalContributions))}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 5 }}>
          current pot: <span className="pnum">{fmtBig(currentPot)}</span>
        </div>
      </div>

      {/* Investment growth */}
      <div style={{ padding: "14px 16px", background: "var(--ft-surface)", borderTop: "2px solid var(--ft-amber)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6 }}>
          Investment Growth
        </div>
        <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "var(--ft-amber)", lineHeight: 1 }}>
          {fmtBig(Math.round(totalGrowth))}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 5 }}>
          +<span className="pnum">{returnPct.toFixed(0)}%</span> return on contributions
        </div>
      </div>

      {/* Health / monthly income */}
      <div style={{ padding: "14px 16px", background: "var(--ft-surface)", borderTop: `2px solid ${trackColor}` }}>
        <HStack gap={6} align="center" marginBottom={6}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>
            Monthly Income
          </div>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 8, padding: "1px 6px",
            background: onTrack ? "rgba(86,182,194,0.15)" : closeToTrack ? "rgba(245,158,11,0.12)" : "rgba(248,81,73,0.12)",
            color: trackColor,
            letterSpacing: "0.06em", fontWeight: 700,
          }}>
            {trackLabel}
          </span>
        </HStack>
        <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: trackColor, lineHeight: 1 }}>
          {formatBaseMoney(Math.round(totalMonthlyIncome))}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 5 }}>
          {includeStatePension ? `incl. £${Math.round(monthlyStatePension)}/mo state` : "excl. state pension"} · target: <span className="pnum">{hasTarget ? formatBaseMoney(targetMonthlyIncome) : "—"}</span>
        </div>
      </div>
    </div>
  );
}

// ── Pension Health Block ───────────────────────────────────────────────────────

function PensionHealthBlock({
  totalMonthlyIncome, targetMonthlyIncome, monthlyTotal,
  yearsToRetirement, currentPot, growthRate, includeStatePension,
}: {
  totalMonthlyIncome: number;
  targetMonthlyIncome: number | null;
  monthlyTotal: number;
  yearsToRetirement: number;
  currentPot: number;
  growthRate: number;
  includeStatePension: boolean;
}) {
  // No target means no health signal. A "Pension Health · ON TRACK" panel
  // built off `targetMonthlyIncome > 0 ? real : 100` painted a green bar
  // for a user who had entered nothing — asserting completion of a goal
  // that was never set. Show an honest empty state instead.
  if (targetMonthlyIncome == null || targetMonthlyIncome <= 0) {
    return (
      <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", marginTop: 16 }}>
        <PanelHeader color="var(--ft-muted)">Pension Health — Target not set</PanelHeader>
        <div style={{ padding: "20px 16px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", lineHeight: 1.7, letterSpacing: "0.02em" }}>
          Enter a <strong style={{ color: "var(--ft-text)" }}>target monthly income</strong> in the form above and this panel fills in: on-track score, shortfall estimate, required extra contribution, and years-to-fix.
        </div>
      </div>
    );
  }

  const monthlyStatePension = includeStatePension ? STATE_PENSION_ANNUAL / 12 : 0;
  const annualTargetIncome = targetMonthlyIncome * 12;
  const annualCurrentIncome = totalMonthlyIncome * 12;
  const shortfallMonthly = Math.max(0, targetMonthlyIncome - totalMonthlyIncome);
  const shortfallAnnual = shortfallMonthly * 12;
  const onTrackPct = Math.min(100, (totalMonthlyIncome / targetMonthlyIncome) * 100);
  const onTrack = onTrackPct >= 100;

  // Required pot to hit target (pot / 240 + state pension = target)
  const incomeFromPotNeeded = targetMonthlyIncome - monthlyStatePension;
  const requiredPot = Math.max(0, incomeFromPotNeeded * 240);

  // Extra monthly needed to hit required pot
  let extraMonthlyNeeded = 0;
  if (!onTrack && yearsToRetirement > 0) {
    const n = yearsToRetirement * 12;
    const r = growthRate / 100 / 12;
    const growth = r === 0 ? 1 : Math.pow(1 + r, n);
    // requiredPot = currentPot * growth + (monthlyTotal + extra) * ((growth - 1) / r)
    const annuityFactor = r === 0 ? n : (growth - 1) / r;
    const potFromCurrent = currentPot * growth;
    const potFromCurrentContrib = monthlyTotal * annuityFactor;
    const potShortfall = requiredPot - potFromCurrent - potFromCurrentContrib;
    extraMonthlyNeeded = annuityFactor > 0 ? Math.max(0, potShortfall / annuityFactor) : 0;
  }

  const barPct = Math.min(100, onTrackPct);
  const barColor = onTrack ? "var(--ft-green)" : onTrackPct >= 75 ? "var(--ft-amber)" : "var(--ft-red)";

  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", marginTop: 16 }}>
      <PanelHeader color={barColor}>Pension Health — {onTrack ? "On Track" : "Needs Attention"}</PanelHeader>
      <div style={{ padding: 16 }}>

        {/* Progress toward target */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 6, letterSpacing: "0.06em" }}>
            <span>Progress toward income target</span>
            <span className="pnum" style={{ color: barColor, fontWeight: 700 }}>{onTrackPct.toFixed(0)}%</span>
          </div>
          <div style={{ height: 10, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${barPct}%`, background: barColor, transition: "none" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 4 }}>
            <span>£0/mo</span>
            <span>Target: <span className="pnum">{formatBaseMoney(targetMonthlyIncome)}/mo</span></span>
          </div>
        </div>

        {/* Side-by-side: projected vs target income */}
        <div className="ft-kpi-bar" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--ft-border)", marginBottom: 16 }}>
          <div style={{ background: "var(--ft-raised)", padding: "10px 12px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 4 }}>Projected Annual Income</div>
            <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: barColor, lineHeight: 1 }}>{formatBaseMoney(Math.round(annualCurrentIncome))}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}><span className="pnum">{formatBaseMoney(Math.round(totalMonthlyIncome))}</span>/mo</div>
          </div>
          <div style={{ background: "var(--ft-raised)", padding: "10px 12px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 4 }}>Target Annual Income</div>
            <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--ft-text)", lineHeight: 1 }}>{formatBaseMoney(annualTargetIncome)}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}><span className="pnum">{formatBaseMoney(targetMonthlyIncome)}</span>/mo</div>
          </div>
        </div>

        {!onTrack && (
          <div style={{
            border: "1px solid rgba(248,81,73,0.3)",
            background: "rgba(248,81,73,0.04)",
            padding: "12px 14px",
            marginBottom: 14,
          }}>
            <HStack gap={6} align="center" marginBottom={8}>
              <AlertTriangle style={{ width: 12, height: 12, color: "var(--ft-red)", flexShrink: 0 }} />
              <Text as="span" mono upper size={9} weight={700} color="var(--ft-red)" letterSpacing="0.08em">
                Shortfall Analysis
              </Text>
            </HStack>
            <div className="ft-kpi-bar" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "rgba(248,81,73,0.15)" }}>
              <div style={{ background: "rgba(248,81,73,0.04)", padding: "8px 10px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginBottom: 3 }}>Monthly shortfall</div>
                <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-red)" }}>-{formatBaseMoney(Math.round(shortfallMonthly))}</div>
              </div>
              <div style={{ background: "rgba(248,81,73,0.04)", padding: "8px 10px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginBottom: 3 }}>Annual shortfall</div>
                <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-red)" }}>-{formatBaseMoney(Math.round(shortfallAnnual))}</div>
              </div>
              <div style={{ background: "rgba(248,81,73,0.04)", padding: "8px 10px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginBottom: 3 }}>Required pot</div>
                <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-amber)" }}>
                  {requiredPot >= 1_000_000 ? `£${(requiredPot / 1_000_000).toFixed(2)}M` : `£${(requiredPot / 1000).toFixed(0)}k`}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Contribution optimiser */}
        {!onTrack && extraMonthlyNeeded > 0 && yearsToRetirement > 0 && (
          <div style={{
            border: "1px solid rgba(88,166,255,0.25)",
            background: "rgba(88,166,255,0.04)",
            padding: "12px 14px",
          }}>
            <HStack gap={6} align="center" marginBottom={8}>
              <Target style={{ width: 12, height: 12, color: "var(--ft-blue)", flexShrink: 0 }} />
              <Text as="span" mono upper size={9} weight={700} color="var(--ft-blue)" letterSpacing="0.08em">
                Contribution Optimiser
              </Text>
            </HStack>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", lineHeight: 1.8 }}>
              <HStack gap={8} align="center" wrap>
                <Text as="span" color="var(--ft-dim)">Contribute</Text>
                <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-blue)" }}>
                  {formatBaseMoney(Math.round(extraMonthlyNeeded))}/mo more
                </span>
                <ArrowRight style={{ width: 12, height: 12, color: "var(--ft-dim)", flexShrink: 0 }} />
                <Text as="span" color="var(--ft-dim)">to hit</Text>
                <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-green)" }}>
                  {formatBaseMoney(targetMonthlyIncome)}/mo target
                </span>
              </HStack>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>
                Total monthly: <span className="pnum">{formatBaseMoney(Math.round(monthlyTotal + extraMonthlyNeeded))}</span> · Annual: <span className="pnum">{formatBaseMoney(Math.round((monthlyTotal + extraMonthlyNeeded) * 12))}</span> · {yearsToRetirement}yr horizon
              </div>
            </div>
          </div>
        )}

        {onTrack && (
          <div style={{
            border: "1px solid rgba(86,182,194,0.25)",
            background: "rgba(86,182,194,0.04)",
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <ShieldCheck style={{ width: 14, height: 14, color: "var(--ft-green)", flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-green)" }}>
              Projected income exceeds your target by <span className="pnum">{formatBaseMoney(Math.round(totalMonthlyIncome - targetMonthlyIncome))}/mo</span>. You are on track for a comfortable retirement.
            </span>
          </div>
        )}

        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 10, lineHeight: 1.6 }}>
          Income = pot ÷ 240 months{includeStatePension ? ` + £${Math.round(STATE_PENSION_ANNUAL / 12)}/mo state pension` : ""} · Assumes {growthRate}%/yr growth to retirement
        </div>
      </div>
    </div>
  );
}

// ── State Pension Grid Cell ───────────────────────────────────────────────────

function StatePensionCell({ label, value, opacity }: { label: string; value: string; opacity: number }) {
  const [hov, setHov] = useState<boolean>(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
      style={{
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-raised))" : "var(--ft-raised)",
        padding: "8px 10px",
        opacity,
        transition: "background 0.1s",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 3 }}>{label}</div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-cyan)" }}>{value}</div>
    </div>
  );
}

// ── State Pension Panel ───────────────────────────────────────────────────────

function StatePensionPanel({ includeStatePension, onToggle }: {
  includeStatePension: boolean;
  onToggle: () => void;
}) {
  const statePensionCells = [
    { label: "Weekly", value: "£221.20" },
    { label: "Monthly", value: formatBaseMoney(Math.round(STATE_PENSION_ANNUAL / 12)) },
    { label: "Annual", value: formatBaseMoney(STATE_PENSION_ANNUAL) },
  ];

  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", marginTop: 16 }}>
      <PanelHeader color="var(--ft-cyan)">UK State Pension</PanelHeader>
      <div style={{ padding: 16 }}>
        <HStack gap={12} align="start" justify="between" wrap marginBottom={14}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", fontWeight: 600, marginBottom: 4 }}>
              Full New State Pension (2024/25)
            </div>
            <Text as="div" mono size={9} color="var(--ft-dim)" lineHeight={1.6}>
              £221.20/wk · £11,502/yr · £958/mo (estimate)<br />
              Requires 35 qualifying NI years for full amount · Check via NI record at gov.uk
            </Text>
          </div>
          <button
            onClick={onToggle}
            style={{
              width: 36, height: 18, border: "none", cursor: "pointer",
              background: includeStatePension ? "var(--ft-green)" : "var(--ft-border2)",
              position: "relative", flexShrink: 0, padding: 0,
            }}
            aria-label="Toggle state pension"
          >
            <span style={{
              position: "absolute", top: 2,
              left: includeStatePension ? 20 : 2,
              width: 14, height: 14,
              background: "var(--ft-base)",
            }} />
          </button>
        </HStack>

        <div className="ft-kpi-bar" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "var(--ft-border)" }}>
          {statePensionCells.map(({ label, value }) => (
            <StatePensionCell
              key={label}
              label={label}
              value={value}
              opacity={includeStatePension ? 1 : 0.4}
            />
          ))}
        </div>

        <div style={{
          marginTop: 12, padding: "8px 12px",
          background: "var(--ft-raised)", borderLeft: "3px solid var(--ft-border2)",
          fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", lineHeight: 1.7,
        }}>
          State pension age is currently 66 for both men and women, rising to 67 between 2026–2028. Check your NI record and State Pension forecast at gov.uk/check-state-pension.
        </div>
      </div>
    </div>
  );
}

// ── Sensitivity Table ─────────────────────────────────────────────────────────

const SENSITIVITY_RATES = [3, 5, 6, 7, 8, 10];

function SensitivityRow({
  rate, pot, totalMonthly, growthGain, growthMultiplier, realPot,
  isSelected, accentColor, fmtPot,
}: {
  rate: number; pot: number; totalMonthly: number; growthGain: number;
  growthMultiplier: number; realPot: number;
  isSelected: boolean; accentColor: string;
  fmtPot: (v: number) => string;
}) {
  const [hovered, setHovered] = useState<boolean>(false);
  const rowBg = isSelected
    ? "color-mix(in srgb, var(--ft-blue) 7%, var(--ft-surface))"
    : hovered
    ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))"
    : "transparent";

  const tdStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)", fontSize: 11,
    padding: "7px 10px",
    borderBottom: "1px solid var(--ft-border)", borderRight: "1px solid var(--ft-border)",
    textAlign: "right", background: rowBg,
  };

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <td style={{ ...tdStyle, textAlign: "left" }}>
        <HStack gap={6} align="center">
          {isSelected && <span style={{ width: 3, height: 14, background: "var(--ft-blue)", flexShrink: 0, display: "inline-block" }} />}
          <span style={{ color: accentColor, fontWeight: isSelected ? 700 : 500 }}>{rate}%</span>
          {isSelected && <Text as="span" size={8} color="var(--ft-blue)" letterSpacing="0.06em">← selected</Text>}
        </HStack>
      </td>
      <td className="pnum" style={{ ...tdStyle, color: isSelected ? "var(--ft-text)" : "var(--ft-muted)", fontWeight: isSelected ? 700 : 400, fontSize: isSelected ? 12 : 11 }}>
        {fmtPot(Math.round(pot))}
      </td>
      <td className="pnum" style={{ ...tdStyle, color: isSelected ? "var(--ft-amber)" : "var(--ft-muted)", fontWeight: isSelected ? 700 : 400 }}>
        {formatBaseMoney(Math.round(totalMonthly))}
      </td>
      <td className="pnum" style={{ ...tdStyle, color: growthGain > 0 ? "var(--ft-green)" : "var(--ft-dim)" }}>
        +{fmtPot(Math.round(growthGain))}
      </td>
      <td className="pnum" style={{ ...tdStyle, color: growthMultiplier >= 3 ? "var(--ft-green)" : growthMultiplier >= 2 ? "var(--ft-amber)" : "var(--ft-dim)" }}>
        {growthMultiplier.toFixed(1)}×
      </td>
      <td className="pnum" style={{ ...tdStyle, borderRight: "none", color: "var(--ft-dim)", fontSize: 10 }}>
        {fmtPot(Math.round(realPot))}
      </td>
    </tr>
  );
}

function SensitivityTable({
  currentPot, monthlyTotal, yearsToRetirement, totalContributions,
  includeStatePension, selectedRate,
}: {
  currentPot: number;
  monthlyTotal: number;
  yearsToRetirement: number;
  totalContributions: number;
  includeStatePension: boolean;
  selectedRate: number;
}) {
  const statePensionMonthly = includeStatePension ? STATE_PENSION_ANNUAL / 12 : 0;

  const rows = SENSITIVITY_RATES.map(rate => {
    const pot = calcPotFV(currentPot, monthlyTotal, rate, yearsToRetirement);
    const monthlyFromPot = pot / 240;
    const totalMonthly = monthlyFromPot + statePensionMonthly;
    const growthGain = Math.max(0, pot - totalContributions);
    const growthMultiplier = totalContributions > 0 ? pot / totalContributions : 1;
    const realRate = Math.max(0, rate - 2.5);
    const realPot = calcPotFV(currentPot, monthlyTotal, realRate, yearsToRetirement);
    return { rate, pot, monthlyFromPot, totalMonthly, growthGain, growthMultiplier, realPot };
  });

  const fmtPot = (v: number) =>
    v >= 1_000_000 ? `£${(v / 1_000_000).toFixed(2)}M` : `£${(v / 1000).toFixed(0)}k`;

  const thStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.09em",
    textTransform: "uppercase", color: "var(--ft-dim)",
    padding: "6px 10px", textAlign: "right",
    borderBottom: "1px solid var(--ft-border2)", borderRight: "1px solid var(--ft-border)",
    whiteSpace: "nowrap", fontWeight: 400,
  };

  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", marginTop: 16 }}>
      <PanelHeader>Return Scenario Analysis</PanelHeader>
      <div className="ft-scroll-x">
        <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: "left", minWidth: 80 }}>Rate</th>
              <th style={thStyle}>Projected Pot</th>
              <th style={thStyle}>Monthly Income</th>
              <th style={thStyle}>Growth Gain</th>
              <th style={thStyle}>Multiplier</th>
              <th style={{ ...thStyle, borderRight: "none" }}>Real (–2.5% CPI)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ rate, pot, totalMonthly, growthGain, growthMultiplier, realPot }) => {
              const isSelected = Math.abs(rate - selectedRate) < 0.1;
              const accentColor = rate >= 8 ? "var(--ft-green)" : rate >= 6 ? "var(--ft-amber)" : "var(--ft-red)";
              return (
                <SensitivityRow
                  key={rate}
                  rate={rate}
                  pot={pot}
                  totalMonthly={totalMonthly}
                  growthGain={growthGain}
                  growthMultiplier={growthMultiplier}
                  realPot={realPot}
                  isSelected={isSelected}
                  accentColor={accentColor}
                  fmtPot={fmtPot}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{
        padding: "8px 12px", background: "var(--ft-raised)", borderTop: "1px solid var(--ft-border)",
        fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", lineHeight: 1.7,
      }}>
        Monthly income = pot ÷ 240 months{includeStatePension ? ` + £${Math.round(STATE_PENSION_ANNUAL / 12)}/mo state pension` : ""} · Real = nominal minus 2.5% CPI · Assumes constant contributions to retirement
      </div>
    </div>
  );
}

// ── Annual Allowance Cell ─────────────────────────────────────────────────────

function AllowanceCellItem({ label, value, color }: { label: string; value: string; color: string }) {
  const [hov, setHov] = useState<boolean>(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
      style={{
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-raised))" : "var(--ft-raised)",
        padding: "10px 12px",
        transition: "background 0.1s",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 5 }}>{label}</div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

// ── Tax Relief Cell ────────────────────────────────────────────────────────────

function TaxReliefCellItem({ band, relief, note }: { band: string; relief: number; note: string }) {
  const [hov, setHov] = useState<boolean>(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
      style={{
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-raised))" : "var(--ft-raised)",
        padding: "8px 10px",
        transition: "background 0.1s",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 3 }}>{band}</div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-green)" }}>{formatBaseMoney(Math.round(relief))}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>{note}</div>
    </div>
  );
}

// ── Annual Allowance Section ──────────────────────────────────────────────────

function AnnualAllowanceSection({ monthlyTotal }: { monthlyTotal: number }) {
  const annualContrib = monthlyTotal * 12;
  const remaining = Math.max(0, ANNUAL_ALLOWANCE - annualContrib);
  const pct = Math.min(100, (annualContrib / ANNUAL_ALLOWANCE) * 100);
  const taxYear = currentTaxYear();
  const barColor = pct >= 100 ? "var(--ft-red)" : pct >= 80 ? "var(--ft-amber)" : "var(--ft-green)";

  const allowanceCells = [
    { label: "Annual Contributions", value: formatBaseMoney(Math.round(annualContrib)), color: barColor },
    { label: "Remaining Allowance", value: remaining === 0 ? "Maxed" : formatBaseMoney(remaining), color: remaining === 0 ? "var(--ft-green)" : "var(--ft-text)" },
    { label: "UK Annual Limit", value: formatBaseMoney(ANNUAL_ALLOWANCE), color: "var(--ft-dim)" },
  ];

  const taxReliefCells = [
    { band: "Basic 20%", relief: annualContrib * 0.25, note: "HMRC adds 25% to your pot" },
    { band: "Higher 40%", relief: annualContrib * 0.40, note: "via Self Assessment" },
    { band: "Additional 45%", relief: annualContrib * 0.45, note: "via Self Assessment" },
  ];

  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", marginTop: 16 }}>
      <PanelHeader>Annual Pension Allowance — {taxYear}</PanelHeader>
      <div style={{ padding: 16 }}>
        <div className="ft-kpi-bar" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "var(--ft-border)", marginBottom: 14 }}>
          {allowanceCells.map(({ label, value, color }) => (
            <AllowanceCellItem key={label} label={label} value={value} color={color} />
          ))}
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em", marginBottom: 6 }}>
            <span>Annual allowance used</span>
            <span className="pnum" style={{ color: barColor, fontWeight: 700 }}>{pct.toFixed(0)}%</span>
          </div>
          <div style={{ height: 6, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: barColor, transition: "none" }} />
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--ft-border)", paddingTop: 12 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 8 }}>
            Estimated Tax Relief (on your <span className="pnum">{formatBaseMoney(Math.round(annualContrib))}</span> contributions)
          </div>
          <div className="ft-kpi-bar" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "var(--ft-border)" }}>
            {taxReliefCells.map(({ band, relief, note }) => (
              <TaxReliefCellItem key={band} band={band} relief={relief} note={note} />
            ))}
          </div>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 10, lineHeight: 1.6 }}>
          £60,000 annual allowance (2024/25) · includes employer contributions · unused allowance can be carried forward 3 years
        </div>
      </div>
    </div>
  );
}

// ── ISA Grid Cell ─────────────────────────────────────────────────────────────

function IsaCellItem({ label, value, color }: { label: string; value: string; color: string }) {
  const [hov, setHov] = useState<boolean>(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
      style={{
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-raised))" : "var(--ft-raised)",
        padding: "10px 12px",
        transition: "background 0.1s",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 5 }}>{label}</div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

// ── ISA Tracker section ───────────────────────────────────────────────────────

function IsaSection() {
  const [isa, setIsa] = useState<IsaStore>(loadIsa);
  const [inputVal, setInputVal] = useState<number | "">(isa.contributed);

  const taxYear = currentTaxYear();
  const { end: taxYearEnd } = taxYearDates(taxYear);
  const daysLeft = daysUntil(taxYearEnd);

  const used = typeof inputVal === "number" ? Math.min(inputVal, ISA_ANNUAL_ALLOWANCE) : 0;
  const remaining = Math.max(0, ISA_ANNUAL_ALLOWANCE - used);
  const pct = Math.min(100, (used / ISA_ANNUAL_ALLOWANCE) * 100);
  const barColor = pct >= 100 ? "var(--ft-green)" : pct >= 80 ? "var(--ft-amber)" : "var(--ft-green)";

  const isaCells = [
    { label: "Used", value: formatBaseMoney(used), color: pct >= 100 ? "var(--ft-green)" : "var(--ft-amber)" },
    { label: "Remaining", value: formatBaseMoney(remaining), color: remaining === 0 ? "var(--ft-green)" : "var(--ft-text)" },
    { label: "Allowance", value: formatBaseMoney(ISA_ANNUAL_ALLOWANCE), color: "var(--ft-dim)" },
  ];

  function handleChange(v: number | "") {
    setInputVal(v);
    const stored: IsaStore = { contributed: typeof v === "number" ? v : 0, taxYear };
    setIsa(stored);
    saveIsa(stored);
  }

  useEffect(() => {
    const loaded = loadIsa();
    if (loaded.taxYear !== isa.taxYear) {
      setIsa(loaded);
      setInputVal(loaded.contributed);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", marginTop: 24 }}>
      <PanelHeader color="var(--ft-blue)">ISA Allowance Tracker</PanelHeader>
      <div style={{ padding: 16 }}>
        <HStack gap={8} align="center" justify="between" wrap marginBottom={14}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", letterSpacing: "0.04em" }}>
            {formatTaxYearLabel(taxYear)}
          </div>
          <Text as="div" mono size={9} color={daysLeft <= 30 ? "var(--ft-red)" : daysLeft <= 90 ? "var(--ft-amber)" : "var(--ft-dim)"} letterSpacing="0.06em">
            {daysLeft === 0 ? "TAX YEAR ENDS TODAY" : `${daysLeft} days remaining`}
          </Text>
        </HStack>

        <div className="ft-kpi-bar" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "var(--ft-border)", marginBottom: 16 }}>
          {isaCells.map(({ label, value, color }) => (
            <IsaCellItem key={label} label={label} value={value} color={color} />
          ))}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", marginBottom: 6 }}>
            <Text as="span" color="var(--ft-dim)">ISA allowance used</Text>
            <span className="pnum" style={{ color: barColor, fontWeight: 700 }}>
              {pct.toFixed(1)}%{pct >= 100 ? " MAXED" : ""}
            </span>
          </div>
          <div style={{ height: 12, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: barColor, transition: "none" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 4 }}>
            <span>£0</span>
            <span className="pnum">£{ISA_ANNUAL_ALLOWANCE.toLocaleString()}</span>
          </div>
        </div>

        <HStack gap={12} align="center">
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)", flex: 1 }}>
            ISA contributions this tax year (£)
          </div>
          <input
            type="number"
            min={0}
            max={ISA_ANNUAL_ALLOWANCE}
            step={100}
            value={inputVal}
            onChange={e => handleChange(e.target.value === "" ? "" : Number(e.target.value))}
            style={{ ...numInputStyle, width: 130 }}
            placeholder="0"
          />
        </HStack>

        <div style={{
          marginTop: 12, padding: "8px 12px",
          background: "var(--ft-raised)", borderLeft: "3px solid var(--ft-border2)",
          fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", lineHeight: 1.7,
        }}>
          UK ISA allowance resets each tax year on 6 April. Cash ISA, Stocks {"&"} Shares ISA, and LISA all count toward the £20,000 annual limit. This tracker resets automatically when a new tax year begins.
        </div>
      </div>
    </div>
  );
}

// ── Chart Legend Item ─────────────────────────────────────────────────────────

function ChartLegendDot({ color, label }: { color: string; label: string }) {
  return (
    <HStack gap={5} align="center">
      <div style={{ width: 16, height: 2, background: color }} />
      <Text as="span" mono size={8} color="var(--ft-dim)">{label}</Text>
    </HStack>
  );
}

// ── Contribution Legend Item ──────────────────────────────────────────────────

function ContribLegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 10, height: 10, background: color, flexShrink: 0 }} />
      <Text as="span" mono size={8} color="var(--ft-dim)">{label}</Text>
    </div>
  );
}

// ── Pension section ───────────────────────────────────────────────────────────

function PensionSection() {
  const [inputs, setInputs] = useState<PensionInputs>(loadPension);

  useEffect(() => { savePension(inputs); }, [inputs]);

  function set<K extends keyof PensionInputs>(key: K, value: PensionInputs[K]) {
    setInputs(prev => ({ ...prev, [key]: value }));
  }

  // yearsToRetirement is null when we do not yet know the user's current
  // age. Every downstream calc (projectedPot, totalContributions, chart
  // series) short-circuits rather than running against a fabricated
  // "you-are-30" assumption; the render below shows an empty-state
  // Pension Overview until the user enters an age.
  const currentAge = inputs.currentAge;
  const yearsToRetirement = currentAge != null && currentAge > 0
    ? Math.max(0, inputs.retirementAge - currentAge)
    : null;
  const monthlyTotal = inputs.employeeContrib + inputs.employerContrib;

  const projectedPot = useMemo(
    () => yearsToRetirement != null
      ? calcPotFV(inputs.currentPot, monthlyTotal, inputs.growthRate, yearsToRetirement)
      : null,
    [inputs.currentPot, monthlyTotal, inputs.growthRate, yearsToRetirement]
  );

  const monthlyIncomeFromPot = projectedPot != null ? projectedPot / 240 : null;
  const monthlyStatePension = inputs.includeStatePension ? STATE_PENSION_ANNUAL / 12 : 0;
  const totalMonthlyIncome = monthlyIncomeFromPot != null ? monthlyIncomeFromPot + monthlyStatePension : null;

  const totalContributions = yearsToRetirement != null
    ? inputs.currentPot + monthlyTotal * yearsToRetirement * 12
    : null;
  const totalGrowth = projectedPot != null && totalContributions != null
    ? Math.max(0, projectedPot - totalContributions)
    : null;

  const chartData = useMemo(
    () => yearsToRetirement != null
      ? buildChartData(inputs.currentPot, inputs.employeeContrib, inputs.employerContrib, inputs.growthRate, yearsToRetirement)
      : [],
    [inputs.currentPot, inputs.employeeContrib, inputs.employerContrib, inputs.growthRate, yearsToRetirement]
  );

  // Build contribution breakdown bar chart (last few years + now)
  const contribBreakdownData = useMemo(() => {
    const pts = chartData.filter((_, i) => i % Math.max(1, Math.floor(chartData.length / 6)) === 0 || i === chartData.length - 1);
    return pts.map(pt => ({
      label: `+${pt.year}yr`,
      employee: pt.employee,
      employer: pt.employer,
      growth: pt.growth,
    }));
  }, [chartData]);

  const fmtPot = (v: number) =>
    v >= 1_000_000 ? `£${(v / 1_000_000).toFixed(2)}M` : `£${(v / 1000).toFixed(0)}k`;

  const chartLegendItems = [
    { color: "var(--ft-green)", label: "Total pot (contributions + growth)" },
    { color: "var(--ft-cyan)", label: "Contributions only", dashed: true },
  ];

  const contribLegendItems = [
    { color: "var(--ft-blue)", label: "Your contributions" },
    { color: "var(--ft-cyan)", label: "Employer contributions" },
    { color: "var(--ft-green)", label: "Investment growth" },
  ];

  return (
    <div>
      {/* KPI Row */}
      <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)", marginBottom: 16 }}>
        <PanelHeader color="var(--ft-green)">Pension Overview</PanelHeader>
        {yearsToRetirement == null || projectedPot == null || totalContributions == null || totalGrowth == null || monthlyIncomeFromPot == null ? (
          // Age unknown → projection cannot honestly run. A fabricated
          // "age 30" default fed every projected number here (and the
          // "in 37yr" caption) with no user input. Empty state until
          // they enter it.
          <div style={{ padding: "24px 20px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", lineHeight: 1.7, letterSpacing: "0.02em" }}>
            Enter your <strong style={{ color: "var(--ft-text)" }}>current age</strong> in the form on the right and this row fills in: projected pot at retirement, total contributions, investment growth, and monthly retirement income.
          </div>
        ) : (
          <KpiBar
            projectedPot={projectedPot}
            totalContributions={totalContributions}
            totalGrowth={totalGrowth}
            monthlyIncomeFromPot={monthlyIncomeFromPot}
            monthlyStatePension={monthlyStatePension}
            includeStatePension={inputs.includeStatePension}
            yearsToRetirement={yearsToRetirement}
            retirementAge={inputs.retirementAge}
            currentPot={inputs.currentPot}
            targetMonthlyIncome={inputs.targetMonthlyIncome}
            growthRate={inputs.growthRate}
            onFocusGrowthRate={() => {
              const el = document.getElementById(GROWTH_RATE_INPUT_ID);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                (el as HTMLInputElement).focus({ preventScroll: true });
                (el as HTMLInputElement).select();
              }
            }}
          />
        )}
      </div>

      {/* Grid: chart + inputs */}
      <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>

        {/* Left: pot growth chart */}
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)" }}>
          <PanelHeader color="var(--ft-green)">Pension Pot Growth — Year by Year</PanelHeader>
          <div style={{ padding: 16 }}>
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pensionGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--ft-green)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--ft-green)" stopOpacity={0.03} />
                    </linearGradient>
                    <linearGradient id="pensionContribGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--ft-cyan)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--ft-cyan)" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ft-border)" vertical={false} />
                  <XAxis
                    dataKey="ageLabel"
                    tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }}
                    axisLine={false} tickLine={false}
                    tickFormatter={(v: number) => `+${v}yr`}
                  />
                  <YAxis
                    tickFormatter={(v: number) => v >= 1_000_000 ? `£${(v / 1_000_000).toFixed(1)}M` : `£${(v / 1000).toFixed(0)}k`}
                    tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }}
                    tickLine={false} axisLine={false} width={56}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatBaseMoney(value),
                      name === "total" ? "Total Pot" : "Contributions",
                    ]}
                    contentStyle={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", fontFamily: "var(--font-mono)", fontSize: 10 }}
                    labelFormatter={(l: number) => `Year +${l}`}
                  />
                  <Area type="monotone" dataKey="contributions" stroke="var(--ft-cyan)" strokeWidth={1} fill="url(#pensionContribGrad)" dot={false} strokeDasharray="4 2" />
                  <Area type="monotone" dataKey="total" stroke="var(--ft-green)" strokeWidth={1.5} fill="url(#pensionGrowthGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
                Enter your age and retirement age to see projection
              </div>
            )}
          </div>
          <div style={{ padding: "8px 16px", background: "var(--ft-raised)", borderTop: "1px solid var(--ft-border)", display: "flex", gap: 20, flexWrap: "wrap" as const }}>
            {chartLegendItems.map(({ color, label, dashed }) => (
              dashed ? (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 16, height: 0, borderTop: "2px dashed var(--ft-cyan)" }} />
                  <Text as="span" mono size={8} color="var(--ft-dim)">{label}</Text>
                </div>
              ) : (
                <ChartLegendDot key={label} color={color} label={label} />
              )
            ))}
          </div>
        </div>

        {/* Right: inputs */}
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)" }}>
          <PanelHeader>Pension Inputs</PanelHeader>

          <InputRow label="Current Pot (£)" help="Total pension savings today">
            <input type="number" min={0} step={1000} value={inputs.currentPot || ""} onChange={e => set("currentPot", Number(e.target.value) || 0)} style={numInputStyle} />
          </InputRow>
          <InputRow label="Employee Contribution (£/mo)" help="Your monthly pension contribution">
            <input type="number" min={0} step={10} value={inputs.employeeContrib || ""} onChange={e => set("employeeContrib", Number(e.target.value) || 0)} style={numInputStyle} />
          </InputRow>
          <InputRow label="Employer Contribution (£/mo)" help="Your employer's monthly contribution">
            <input type="number" min={0} step={10} value={inputs.employerContrib || ""} onChange={e => set("employerContrib", Number(e.target.value) || 0)} style={numInputStyle} />
          </InputRow>
          <InputRow label="Current Age" help="Your age today">
            <input
              type="number"
              min={16}
              max={80}
              step={1}
              placeholder="—"
              value={inputs.currentAge ?? ""}
              onChange={e => {
                const v = Number(e.target.value);
                set("currentAge", Number.isFinite(v) && v > 0 ? v : null);
              }}
              style={numInputStyle}
            />
          </InputRow>

          {/* Retirement age with inline label */}
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--ft-border)" }}>
            <HStack gap={12} align="center" justify="between">
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", fontWeight: 500 }}>
                  Retirement Age
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 2 }}>
                  {yearsToRetirement != null
                    ? <>{yearsToRetirement}yr to go · retire {new Date().getFullYear() + yearsToRetirement}</>
                    : <>enter current age to see years-to-retirement</>}
                </div>
              </div>
              <input type="number" min={50} max={90} step={1} value={inputs.retirementAge} onChange={e => set("retirementAge", Number(e.target.value))} style={numInputStyle} />
            </HStack>
            {/* Retirement age slider */}
            <div style={{ marginTop: 8 }}>
              <input
                type="range"
                min={50}
                max={85}
                step={1}
                value={inputs.retirementAge}
                onChange={e => set("retirementAge", Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--ft-blue)", cursor: "pointer" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>
                <span>50</span>
                <span>67 (state)</span>
                <span>85</span>
              </div>
            </div>
          </div>

          <InputRow label="Annual Growth Rate (%)" help="Expected investment growth per year">
            <input id={GROWTH_RATE_INPUT_ID} type="number" min={0} max={20} step={0.5} value={inputs.growthRate} onChange={e => set("growthRate", Math.max(0, Math.min(20, Number(e.target.value))))} style={numInputStyle} />
          </InputRow>

          {/* Target income — nullable. Empty input → null (not 0) so
              downstream reads render "—" rather than treating 0 as an
              achieved goal. */}
          <InputRow label="Target Monthly Income (£)" help="What you want in retirement">
            <input
              type="number"
              min={0}
              step={100}
              placeholder="—"
              value={inputs.targetMonthlyIncome ?? ""}
              onChange={e => {
                const v = Number(e.target.value);
                set("targetMonthlyIncome", Number.isFinite(v) && v > 0 ? v : null);
              }}
              style={numInputStyle}
            />
          </InputRow>

          {/* State pension toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--ft-border)" }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", fontWeight: 500 }}>Include State Pension</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 2 }}>+£{STATE_PENSION_ANNUAL.toLocaleString()}/yr at retirement</div>
            </div>
            <button
              onClick={() => set("includeStatePension", !inputs.includeStatePension)}
              style={{ width: 36, height: 18, border: "none", cursor: "pointer", background: inputs.includeStatePension ? "var(--ft-green)" : "var(--ft-border2)", position: "relative", flexShrink: 0, padding: 0 }}
              aria-label="Toggle state pension"
            >
              <span style={{ position: "absolute", top: 2, left: inputs.includeStatePension ? 20 : 2, width: 14, height: 14, background: "var(--ft-base)" }} />
            </button>
          </div>

          {/* Summary note */}
          <div style={{ margin: "0 16px 16px", border: "1px solid var(--ft-border)", borderLeft: "3px solid var(--ft-green)", overflow: "hidden" }}>
            <div style={{ background: "var(--ft-raised)", borderBottom: "1px solid var(--ft-border)", padding: "6px 14px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>Contributions / Month</div>
            </div>
            <div style={{ padding: "10px 14px", background: "var(--ft-surface)" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", lineHeight: 1.9 }}>
                <HStack justify="between">
                  <span style={{ color: "var(--ft-muted)" }}>Your contribution</span>
                  <span className="pnum" style={{ color: "var(--ft-text)", fontWeight: 600 }}>{formatBaseMoney(inputs.employeeContrib)}</span>
                </HStack>
                <HStack justify="between">
                  <Text as="span" color="var(--ft-muted)">Employer match</Text>
                  <span className="pnum" style={{ color: "var(--ft-cyan)", fontWeight: 600 }}>{formatBaseMoney(inputs.employerContrib)}</span>
                </HStack>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--ft-border)", paddingTop: 4, marginTop: 2, marginBottom: 4 }}>
                  <Text as="span" weight={600} color="var(--ft-text)">Total / mo</Text>
                  <span className="pnum" style={{ color: "var(--ft-green)", fontWeight: 700 }}>{formatBaseMoney(monthlyTotal)}</span>
                </div>
              </div>
            </div>
            <div style={{ background: "var(--ft-raised)", borderTop: "1px solid var(--ft-border)", borderBottom: "1px solid var(--ft-border)", padding: "6px 14px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>Retirement income breakdown</div>
            </div>
            <div style={{ padding: "10px 14px", background: "var(--ft-surface)" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", lineHeight: 1.9 }}>
                <HStack justify="between">
                  <Text as="span" color="var(--ft-muted)">From pension pot</Text>
                  <span className="pnum" style={{ color: "var(--ft-green)", fontWeight: 700 }}>{monthlyIncomeFromPot != null ? formatBaseMoney(Math.round(monthlyIncomeFromPot)) : "—"}</span>
                </HStack>
                {inputs.includeStatePension && (
                  <HStack justify="between">
                    <Text as="span" color="var(--ft-muted)">State pension</Text>
                    <span className="pnum" style={{ color: "var(--ft-cyan)", fontWeight: 700 }}>{formatBaseMoney(Math.round(monthlyStatePension))}</span>
                  </HStack>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--ft-border)", paddingTop: 4, marginTop: 2 }}>
                  <Text as="span" weight={600} color="var(--ft-text)">Total</Text>
                  <span className="pnum" style={{ color: "var(--ft-amber)", fontWeight: 700 }}>{totalMonthlyIncome != null ? formatBaseMoney(Math.round(totalMonthlyIncome)) : "—"}</span>
                </div>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 8 }}>Assumes 20-yr drawdown · pot / 240 months</div>
            </div>
          </div>
        </div>
      </div>

      {/* Employer vs Employee breakdown chart */}
      {contribBreakdownData.length > 1 && monthlyTotal > 0 && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", marginTop: 16 }}>
          <PanelHeader color="var(--ft-cyan)">Contribution Breakdown — Employee / Employer / Growth</PanelHeader>
          <div style={{ padding: 16 }}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={contribBreakdownData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--ft-raised)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v: number) => v >= 1_000_000 ? `£${(v / 1_000_000).toFixed(1)}M` : `£${(v / 1000).toFixed(0)}k`}
                  tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }}
                  tickLine={false} axisLine={false} width={52}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    formatBaseMoney(Math.round(value)),
                    name === "employee" ? "Your Contributions" : name === "employer" ? "Employer Contributions" : "Investment Growth",
                  ]}
                  contentStyle={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", fontFamily: "var(--font-mono)", fontSize: 10 }}
                />
                <Bar dataKey="employee" stackId="a" fill="var(--ft-blue)" opacity={0.8}>
                  {contribBreakdownData.map((_, i) => <Cell key={i} fill="var(--ft-blue)" />)}
                </Bar>
                <Bar dataKey="employer" stackId="a" fill="var(--ft-cyan)" opacity={0.75}>
                  {contribBreakdownData.map((_, i) => <Cell key={i} fill="var(--ft-cyan)" />)}
                </Bar>
                <Bar dataKey="growth" stackId="a" fill="var(--ft-green)" opacity={0.7}>
                  {contribBreakdownData.map((_, i) => <Cell key={i} fill="var(--ft-green)" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", gap: 16, paddingTop: 8, flexWrap: "wrap" as const }}>
              {contribLegendItems.map(({ color, label }) => (
                <ContribLegendDot key={label} color={color} label={label} />
              ))}
            </div>
            {/* Employer/employee ratio note. The ratio itself is computable
                without an age; the projected-pot tail is only shown when
                we can actually project it (age known). */}
            {monthlyTotal > 0 && (
              <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                Employee <span className="pnum">{inputs.employeeContrib > 0 ? ((inputs.employeeContrib / monthlyTotal) * 100).toFixed(0) : 0}%</span> ·
                Employer <span className="pnum">{inputs.employerContrib > 0 ? ((inputs.employerContrib / monthlyTotal) * 100).toFixed(0) : 0}%</span> of total contributions
                {projectedPot != null && (
                  <>
                    {" · "}
                    Projected pot: <span className="pnum">{fmtPot(Math.round(projectedPot))}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Health-and-sensitivity blocks are age-dependent — same argument
          as the KpiBar guard above. StatePensionPanel and AnnualAllowance
          are age-independent so they render either way. */}
      {yearsToRetirement != null && totalMonthlyIncome != null && totalContributions != null ? (
        <PensionHealthBlock
          totalMonthlyIncome={totalMonthlyIncome}
          targetMonthlyIncome={inputs.targetMonthlyIncome}
          monthlyTotal={monthlyTotal}
          yearsToRetirement={yearsToRetirement}
          currentPot={inputs.currentPot}
          growthRate={inputs.growthRate}
          includeStatePension={inputs.includeStatePension}
        />
      ) : null}

      <StatePensionPanel
        includeStatePension={inputs.includeStatePension}
        onToggle={() => set("includeStatePension", !inputs.includeStatePension)}
      />

      <AnnualAllowanceSection monthlyTotal={monthlyTotal} />

      {yearsToRetirement != null && totalContributions != null ? (
        <SensitivityTable
          currentPot={inputs.currentPot}
          monthlyTotal={monthlyTotal}
          yearsToRetirement={yearsToRetirement}
          totalContributions={totalContributions}
          includeStatePension={inputs.includeStatePension}
          selectedRate={inputs.growthRate}
        />
      ) : null}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Pension() {
  const pid = loadPersonaIds()[0];
  const pensionTip = (() => {
    if (!pid || pid === "full") return null;
    const msgs: Record<string, string | null> = {
      wealth: "Max ISA before taxable investing — £20,000/yr grows entirely tax-free. Pension employer match is free money; capture 100% before directing surplus elsewhere.",
      market: "Track ISA allowance usage to keep investment contributions in a tax-sheltered wrapper before topping up any taxable brokerage accounts.",
      budget: null,
      social: null,
    };
    return msgs[pid] ?? null;
  })();

  return (
    <div>
      <PageHeader
        icon={TrendingUp}
        title="PENSION & ISA PLANNER"
        subtitle="Retirement projection · Contribution breakdown · ISA allowance tracker"
      />

      {pensionTip && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-amber)", border: "1px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.06)", padding: "7px 14px", marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, flexShrink: 0, letterSpacing: "0.08em" }}>TAX TIP</span>
          <Text as="span" color="var(--ft-dim)">{pensionTip}</Text>
        </div>
      )}

      <PensionSection />
      <IsaSection />
    </div>
  );
}
