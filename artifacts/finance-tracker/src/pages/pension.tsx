import { useState, useMemo, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { formatGbp } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

// ── Constants ─────────────────────────────────────────────────────────────────

const PENSION_KEY = "ft-pension";
const ISA_KEY = "ft-isa";
const ISA_ANNUAL_ALLOWANCE = 20_000;
const STATE_PENSION_ANNUAL = 11_502;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PensionInputs {
  currentPot: number;
  employeeContrib: number;
  employerContrib: number;
  currentAge: number;
  retirementAge: number;
  growthRate: number;
  includeStatePension: boolean;
}

interface IsaStore {
  contributed: number;
  taxYear: string; // e.g. "2025/26"
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentTaxYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
  const d = now.getDate();
  // Tax year starts Apr 6
  const inNewYear = m > 3 || (m === 3 && d >= 6);
  const startYear = inNewYear ? y : y - 1;
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

function taxYearDates(taxYear: string): { start: Date; end: Date } {
  const startYear = parseInt(taxYear.split("/")[0], 10);
  return {
    start: new Date(startYear, 3, 6),  // Apr 6
    end: new Date(startYear + 1, 3, 5), // Apr 5 next year
  };
}

function daysUntil(target: Date): number {
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function formatTaxYearLabel(ty: string): string {
  const startYear = parseInt(ty.split("/")[0], 10);
  const startFull = `6 Apr ${startYear}`;
  const endFull = `5 Apr ${startYear + 1}`;
  return `Tax Year ${ty}: ${startFull} – ${endFull}`;
}

function loadPension(): PensionInputs {
  try {
    const raw = localStorage.getItem(PENSION_KEY);
    if (raw) return JSON.parse(raw) as PensionInputs;
  } catch { /* ignore */ }
  return {
    currentPot: 0,
    employeeContrib: 0,
    employerContrib: 0,
    currentAge: 30,
    retirementAge: 67,
    growthRate: 7,
    includeStatePension: true,
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
      // Reset if it's a different tax year
      if (stored.taxYear !== ty) return { contributed: 0, taxYear: ty };
      return stored;
    }
  } catch { /* ignore */ }
  return { contributed: 0, taxYear: ty };
}

function saveIsa(v: IsaStore) {
  try { localStorage.setItem(ISA_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

/**
 * Build year-by-year chart data from now until retirement.
 * Returns two series per year:
 *  - contributions: cumulative money paid in (pot start + contributions)
 *  - total: projected pot value (contributions + investment growth)
 */
function buildChartData(
  currentPot: number,
  monthlyContrib: number,
  annualGrowthRate: number,
  yearsToRetirement: number,
): { year: number; ageLabel: number; contributions: number; total: number }[] {
  const monthlyRate = annualGrowthRate / 100 / 12;
  const data: { year: number; ageLabel: number; contributions: number; total: number }[] = [];
  let pot = currentPot;
  let cumulativeContrib = currentPot;

  data.push({ year: 0, ageLabel: 0, contributions: Math.round(cumulativeContrib), total: Math.round(pot) });

  for (let yr = 1; yr <= yearsToRetirement; yr++) {
    for (let m = 0; m < 12; m++) {
      pot = pot * (1 + monthlyRate) + monthlyContrib;
      cumulativeContrib += monthlyContrib;
    }
    data.push({
      year: yr,
      ageLabel: yr,
      contributions: Math.round(cumulativeContrib),
      total: Math.round(pot),
    });
  }

  return data;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, color = "var(--ft-text)", sub }: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div style={{
      background: "var(--ft-surface)",
      border: "1px solid var(--ft-border)",
      borderTop: `2px solid ${color}`,
      padding: "14px 16px",
      flex: 1,
      minWidth: 0,
    }}>
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        letterSpacing: "0.1em",
        textTransform: "uppercase" as const,
        color: "var(--ft-dim)",
        marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 22,
        fontWeight: 700,
        color,
        lineHeight: 1,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--ft-muted)",
          marginTop: 5,
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function InputRow({ label, help, children }: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      padding: "10px 16px",
      borderBottom: "1px solid var(--ft-border)",
    }}>
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", fontWeight: 500 }}>
          {label}
        </div>
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

function PanelHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
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
      textTransform: "uppercase" as const,
      color: "var(--ft-muted)",
    }}>
      <span style={{ color: "var(--ft-accent)" }}>·</span> {children}
    </div>
  );
}

// ── Pension section ───────────────────────────────────────────────────────────

function PensionSection() {
  const [inputs, setInputs] = useState<PensionInputs>(loadPension);

  // Persist on every change
  useEffect(() => { savePension(inputs); }, [inputs]);

  function set<K extends keyof PensionInputs>(key: K, value: PensionInputs[K]) {
    setInputs(prev => ({ ...prev, [key]: value }));
  }

  const yearsToRetirement = Math.max(0, inputs.retirementAge - inputs.currentAge);
  const monthlyTotal = inputs.employeeContrib + inputs.employerContrib;

  // Projected pot using Future Value of growing annuity
  const projectedPot = useMemo(() => {
    const r = inputs.growthRate / 100 / 12;
    const n = yearsToRetirement * 12;
    if (r === 0) return inputs.currentPot + monthlyTotal * n;
    // FV = P*(1+r)^n + PMT * ((1+r)^n - 1) / r
    const growth = Math.pow(1 + r, n);
    return inputs.currentPot * growth + monthlyTotal * ((growth - 1) / r);
  }, [inputs.currentPot, monthlyTotal, inputs.growthRate, yearsToRetirement]);

  // Monthly income from pot over 20 years (240 months), ignoring growth in drawdown for simplicity
  const monthlyIncomeFromPot = projectedPot / 240;
  const monthlyStatePension = inputs.includeStatePension ? STATE_PENSION_ANNUAL / 12 : 0;
  const totalMonthlyIncome = monthlyIncomeFromPot + monthlyStatePension;

  // Contributions vs growth breakdown
  const totalContributions = inputs.currentPot + monthlyTotal * yearsToRetirement * 12;
  const totalGrowth = Math.max(0, projectedPot - totalContributions);

  const chartData = useMemo(() => buildChartData(
    inputs.currentPot,
    monthlyTotal,
    inputs.growthRate,
    yearsToRetirement,
  ), [inputs.currentPot, monthlyTotal, inputs.growthRate, yearsToRetirement]);

  const fmtPot = (v: number) =>
    v >= 1_000_000 ? `£${(v / 1_000_000).toFixed(2)}M` : `£${(v / 1000).toFixed(0)}k`;

  return (
    <div>
      {/* KPI row */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" as const }}>
        <KpiCard
          label="Projected Pot"
          value={fmtPot(Math.round(projectedPot))}
          color="var(--ft-green)"
          sub={`at age ${inputs.retirementAge}`}
        />
        <KpiCard
          label="Monthly Income"
          value={formatGbp(Math.round(totalMonthlyIncome))}
          color="var(--ft-amber)"
          sub={inputs.includeStatePension ? "incl. state pension" : "excl. state pension"}
        />
        <KpiCard
          label="Years to Retirement"
          value={`${yearsToRetirement} yrs`}
          color="var(--ft-accent)"
          sub={`retiring ${new Date().getFullYear() + yearsToRetirement}`}
        />
        <KpiCard
          label="Contributions"
          value={fmtPot(Math.round(totalContributions))}
          color="var(--ft-cyan)"
          sub={`+${fmtPot(Math.round(totalGrowth))} growth`}
        />
      </div>

      {/* Grid: chart + inputs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>

        {/* Chart */}
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)" }}>
          <PanelHeader>Pension Pot Growth — Year by Year</PanelHeader>
          <div style={{ padding: 16 }}>
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={280}>
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
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `+${v}yr`}
                  />
                  <YAxis
                    tickFormatter={(v: number) =>
                      v >= 1_000_000 ? `£${(v / 1_000_000).toFixed(1)}M` : `£${(v / 1000).toFixed(0)}k`
                    }
                    tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatGbp(value),
                      name === "total" ? "Total Pot" : "Contributions",
                    ]}
                    contentStyle={{
                      background: "var(--ft-raised)",
                      border: "1px solid var(--ft-border2)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                    }}
                    labelFormatter={(l: number) => `Year +${l}`}
                  />
                  {/* Contributions area — bottom layer */}
                  <Area
                    type="monotone"
                    dataKey="contributions"
                    stroke="var(--ft-cyan)"
                    strokeWidth={1}
                    fill="url(#pensionContribGrad)"
                    dot={false}
                    strokeDasharray="4 2"
                  />
                  {/* Total pot area — top layer (gap = growth) */}
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="var(--ft-green)"
                    strokeWidth={1.5}
                    fill="url(#pensionGrowthGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
                Enter your age and retirement age to see projection
              </div>
            )}
          </div>
          <div style={{
            padding: "8px 16px",
            background: "var(--ft-raised)",
            borderTop: "1px solid var(--ft-border)",
            display: "flex",
            gap: 20,
            flexWrap: "wrap" as const,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 16, height: 2, background: "var(--ft-green)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>Total pot (contributions + growth)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 16, height: 0, borderTop: "2px dashed var(--ft-cyan)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>Contributions only</span>
            </div>
          </div>
        </div>

        {/* Inputs */}
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)" }}>
          <PanelHeader>Pension Inputs</PanelHeader>

          <InputRow label="Current Pot (£)" help="Total pension savings today">
            <input
              type="number"
              min={0}
              step={1000}
              value={inputs.currentPot || ""}
              onChange={e => set("currentPot", Number(e.target.value) || 0)}
              style={numInputStyle}
            />
          </InputRow>

          <InputRow label="Employee Contribution (£/mo)" help="Your monthly pension contribution">
            <input
              type="number"
              min={0}
              step={10}
              value={inputs.employeeContrib || ""}
              onChange={e => set("employeeContrib", Number(e.target.value) || 0)}
              style={numInputStyle}
            />
          </InputRow>

          <InputRow label="Employer Contribution (£/mo)" help="Your employer's monthly contribution">
            <input
              type="number"
              min={0}
              step={10}
              value={inputs.employerContrib || ""}
              onChange={e => set("employerContrib", Number(e.target.value) || 0)}
              style={numInputStyle}
            />
          </InputRow>

          <InputRow label="Current Age" help="Your age today">
            <input
              type="number"
              min={16}
              max={80}
              step={1}
              value={inputs.currentAge}
              onChange={e => set("currentAge", Number(e.target.value))}
              style={numInputStyle}
            />
          </InputRow>

          <InputRow label="Retirement Age" help="Target retirement age (UK state = 67)">
            <input
              type="number"
              min={50}
              max={90}
              step={1}
              value={inputs.retirementAge}
              onChange={e => set("retirementAge", Number(e.target.value))}
              style={numInputStyle}
            />
          </InputRow>

          <InputRow label="Annual Growth Rate (%)" help="Expected investment growth per year">
            <input
              type="number"
              min={0}
              max={20}
              step={0.5}
              value={inputs.growthRate}
              onChange={e => set("growthRate", Number(e.target.value))}
              style={numInputStyle}
            />
          </InputRow>

          {/* State pension toggle */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 16px",
          }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", fontWeight: 500 }}>
                Include State Pension
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 2 }}>
                +£{STATE_PENSION_ANNUAL.toLocaleString()}/yr at retirement
              </div>
            </div>
            <button
              onClick={() => set("includeStatePension", !inputs.includeStatePension)}
              style={{
                width: 36,
                height: 18,
                borderRadius: 9,
                border: "none",
                cursor: "pointer",
                background: inputs.includeStatePension ? "var(--ft-green)" : "var(--ft-border2)",
                position: "relative",
                transition: "background 0.15s",
                flexShrink: 0,
                padding: 0,
              }}
              aria-label="Toggle state pension"
            >
              <span style={{
                position: "absolute",
                top: 2,
                left: inputs.includeStatePension ? 20 : 2,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "var(--ft-base)",
                transition: "left 0.15s",
              }} />
            </button>
          </div>

          {/* Breakdown note */}
          <div style={{
            margin: "0 16px 16px",
            padding: "12px 14px",
            background: "var(--ft-raised)",
            borderLeft: "3px solid var(--ft-green)",
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>
              Monthly income breakdown
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", lineHeight: 2 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--ft-muted)" }}>From pension pot</span>
                <span style={{ color: "var(--ft-green)", fontWeight: 700 }}>{formatGbp(Math.round(monthlyIncomeFromPot))}</span>
              </div>
              {inputs.includeStatePension && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ft-muted)" }}>State pension</span>
                  <span style={{ color: "var(--ft-cyan)", fontWeight: 700 }}>{formatGbp(Math.round(monthlyStatePension))}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--ft-border)", paddingTop: 4, marginTop: 2 }}>
                <span style={{ color: "var(--ft-text)", fontWeight: 600 }}>Total</span>
                <span style={{ color: "var(--ft-amber)", fontWeight: 700 }}>{formatGbp(Math.round(totalMonthlyIncome))}</span>
              </div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 6 }}>
              Assumes 20-yr drawdown · pot / 240 months
            </div>
          </div>
        </div>
      </div>
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

  const barColor =
    pct >= 100 ? "var(--ft-green)" :
    pct >= 80  ? "var(--ft-amber)" :
                 "var(--ft-green)";

  function handleChange(v: number | "") {
    setInputVal(v);
    const stored: IsaStore = { contributed: typeof v === "number" ? v : 0, taxYear };
    setIsa(stored);
    saveIsa(stored);
  }

  // Sync if tax year has changed on mount
  useEffect(() => {
    const loaded = loadIsa();
    if (loaded.taxYear !== isa.taxYear) {
      setIsa(loaded);
      setInputVal(loaded.contributed);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      background: "var(--ft-surface)",
      border: "1px solid var(--ft-border)",
      marginTop: 24,
    }}>
      <PanelHeader>ISA Allowance Tracker</PanelHeader>

      <div style={{ padding: 16 }}>

        {/* Tax year label + days remaining */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap" as const, gap: 8 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", letterSpacing: "0.04em" }}>
            {formatTaxYearLabel(taxYear)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: daysLeft <= 30 ? "var(--ft-red)" : daysLeft <= 90 ? "var(--ft-amber)" : "var(--ft-dim)",
              letterSpacing: "0.06em",
            }}>
              {daysLeft === 0 ? "TAX YEAR ENDS TODAY" : `${daysLeft} days remaining`}
            </span>
          </div>
        </div>

        {/* Three KPI pills */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" as const }}>
          {[
            { label: "Used", value: formatGbp(used), color: pct >= 100 ? "var(--ft-green)" : "var(--ft-amber)" },
            { label: "Remaining", value: formatGbp(remaining), color: remaining === 0 ? "var(--ft-green)" : "var(--ft-text)" },
            { label: "Allowance", value: formatGbp(ISA_ANNUAL_ALLOWANCE), color: "var(--ft-dim)" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              flex: 1,
              minWidth: 100,
              background: "var(--ft-raised)",
              border: "1px solid var(--ft-border)",
              padding: "10px 12px",
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 5 }}>
                {label}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", marginBottom: 6 }}>
            <span style={{ color: "var(--ft-dim)" }}>ISA allowance used</span>
            <span style={{
              color: barColor,
              fontWeight: 700,
              animation: pct >= 100 ? "ft-pulse-green 1.5s ease-in-out infinite" : undefined,
            }}>
              {pct.toFixed(1)}%{pct >= 100 ? " ✓ MAXED" : ""}
            </span>
          </div>
          <div style={{
            height: 12,
            background: "var(--ft-raised)",
            border: "1px solid var(--ft-border2)",
            overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              width: `${pct}%`,
              background: barColor,
              transition: "width 0.35s ease",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 4 }}>
            <span>£0</span>
            <span>£{ISA_ANNUAL_ALLOWANCE.toLocaleString()}</span>
          </div>
        </div>

        {/* Input */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
        </div>

        {/* Note */}
        <div style={{
          marginTop: 12,
          padding: "8px 12px",
          background: "var(--ft-raised)",
          borderLeft: "3px solid var(--ft-border2)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--ft-dim)",
          lineHeight: 1.7,
        }}>
          UK ISA allowance resets each tax year on 6 April. Cash ISA, Stocks {"&"} Shares ISA, and LISA all count toward the £20,000 annual limit. This tracker resets automatically when a new tax year begins.
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Pension() {
  return (
    <div>
      <PageHeader
        icon={TrendingUp}
        title="PENSION & ISA PLANNER"
        subtitle="Retirement projection · ISA allowance tracker"
      />

      <PensionSection />
      <IsaSection />
    </div>
  );
}
