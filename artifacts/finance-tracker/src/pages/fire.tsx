import { useState, useMemo } from "react";
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
  // With zero return rate, simple division
  if (r === 0) {
    if (monthlyContribution <= 0) return Infinity;
    return Math.ceil((fireNumber - currentPortfolio) / monthlyContribution);
  }
  // FV = P*(1+r)^n + PMT*((1+r)^n - 1)/r  => solve for n numerically (binary search)
  // For small n, iterate monthly
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
  // FV = P*(1+r)^n + PMT*((1+r)^n - 1)/r
  // PMT = (FV - P*(1+r)^n) * r / ((1+r)^n - 1)
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
): { year: number; value: number }[] {
  const maxYears = Math.min(Math.ceil(yearsToFire) + 5, 60);
  const r = annualReturnRate / 12;
  const data: { year: number; value: number }[] = [{ year: 0, value: Math.round(currentPortfolio) }];
  let portfolio = currentPortfolio;
  for (let yr = 1; yr <= maxYears; yr++) {
    for (let m = 0; m < 12; m++) {
      portfolio = portfolio * (1 + r) + monthlyContribution;
    }
    data.push({ year: yr, value: Math.round(portfolio) });
  }
  return data;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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
      padding: "12px 16px",
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Fire() {
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

  // Whether defaults have been applied (lazy init once data arrives)
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  if (!defaultsApplied && (defaultPortfolio > 0 || defaultMonthlyExpenses > 0)) {
    setMonthlyExpenses(defaultMonthlyExpenses);
    setPortfolioValue(defaultPortfolio);
    setDefaultsApplied(true);
  }

  const effMonthlyExpenses = typeof monthlyExpenses === "number" ? monthlyExpenses : 0;
  const effPortfolio = typeof portfolioValue === "number" ? portfolioValue : 0;
  const effMonthlyContrib = typeof monthlyContrib === "number" ? monthlyContrib : 0;

  // ── Calculations ────────────────────────────────────────────────────────────

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

  const chartData = useMemo(() => {
    return buildChartData(effPortfolio, effMonthlyContrib, annualReturn / 100, fireNumber, isFinite(yearsToFire) ? yearsToFire : 30);
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

  return (
    <div>
      <PageHeader
        icon={Flame}
        title="FIRE CALCULATOR"
        subtitle="Financial Independence / Retire Early"
      />

      {/* ── KPI row ──────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" as const }}>
        <KpiCard
          label="FIRE Number"
          value={formatGbp(fireNumber)}
          color="var(--ft-amber)"
          sub={`${withdrawalRate}% safe withdrawal rate`}
        />
        <KpiCard
          label="Current Portfolio"
          value={formatGbp(effPortfolio)}
          color="var(--ft-green)"
          sub={`${progressPct}% of FIRE number`}
        />
        <KpiCard
          label="Years to FI"
          value={displayYearsToFire}
          color="var(--ft-accent)"
          sub={fireAgeNote}
        />
        <KpiCard
          label="Monthly Needed"
          value={formatGbp(Math.round(monthlyNeededForTarget))}
          color="var(--ft-cyan)"
          sub={`to reach FI in ${targetYears} yrs`}
        />
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────────────── */}
      <div style={{
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        padding: "14px 16px",
        marginBottom: 20,
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.08em",
          textTransform: "uppercase" as const,
          marginBottom: 8,
        }}>
          <span style={{ color: "var(--ft-dim)" }}>Progress to FIRE</span>
          <span style={{ color: progressPct >= 100 ? "var(--ft-green)" : "var(--ft-amber)", fontWeight: 700 }}>
            {progressPct}%
          </span>
        </div>
        <div style={{
          height: 10,
          background: "var(--ft-raised)",
          border: "1px solid var(--ft-border2)",
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${progressPct}%`,
            background: progressPct >= 100
              ? "var(--ft-green)"
              : progressPct >= 50
              ? "var(--ft-amber)"
              : "var(--ft-accent)",
            transition: "width 0.4s ease",
          }} />
        </div>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--ft-dim)",
          marginTop: 5,
        }}>
          <span>{formatGbp(effPortfolio)}</span>
          <span>{formatGbp(fireNumber)} target</span>
        </div>
      </div>

      {/* ── Two-col layout: chart + inputs ───────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>

        {/* Chart panel */}
        <div style={{
          background: "var(--ft-surface)",
          border: "1px solid var(--ft-border)",
        }}>
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
            <span style={{ color: "var(--ft-accent)" }}>·</span> Portfolio Growth Projection
          </div>
          <div style={{ padding: "16px" }}>
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fireGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--ft-green)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--ft-green)" stopOpacity={0.02} />
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
                    formatter={(v: number) => [formatGbp(v), "Portfolio"]}
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
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--ft-green)"
                    strokeWidth={1.5}
                    fill="url(#fireGradient)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
                Enter values to see projection
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
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>Portfolio growth</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 16, height: 2, background: "var(--ft-amber)", borderTop: "1px dashed var(--ft-amber)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>FIRE number</span>
            </div>
          </div>
        </div>

        {/* Input panel */}
        <div style={{
          background: "var(--ft-surface)",
          border: "1px solid var(--ft-border)",
        }}>
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
            <span style={{ color: "var(--ft-accent)" }}>·</span> Inputs
          </div>

          <InputRow
            label="Monthly Expenses (£)"
            help="Your average monthly spending target in retirement"
          >
            <input
              type="number"
              min={0}
              step={50}
              value={monthlyExpenses}
              onChange={e => setMonthlyExpenses(e.target.value === "" ? "" : Number(e.target.value))}
              style={numInputStyle}
            />
          </InputRow>

          <InputRow
            label="Current Portfolio (£)"
            help="Total invested assets (ISA, pension, brokerage)"
          >
            <input
              type="number"
              min={0}
              step={1000}
              value={portfolioValue}
              onChange={e => setPortfolioValue(e.target.value === "" ? "" : Number(e.target.value))}
              style={numInputStyle}
            />
          </InputRow>

          <InputRow
            label="Monthly Contribution (£)"
            help="How much you invest each month"
          >
            <input
              type="number"
              min={0}
              step={50}
              value={monthlyContrib}
              onChange={e => setMonthlyContrib(e.target.value === "" ? "" : Number(e.target.value))}
              style={numInputStyle}
            />
          </InputRow>

          <InputRow
            label="Annual Return (%)"
            help="Expected investment return per year"
          >
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

          <InputRow
            label="Withdrawal Rate (%)"
            help="Safe withdrawal rate (4% = 25x rule)"
          >
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

          <div style={{
            background: "var(--ft-raised)",
            borderTop: "1px solid var(--ft-border)",
            padding: "10px 16px 4px",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.08em",
            textTransform: "uppercase" as const,
            color: "var(--ft-accent)",
            fontWeight: 700,
          }}>
            Reverse Calculator
          </div>

          <InputRow
            label="Target Years to FI"
            help="How many years until you want to be FI"
          >
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

          <div style={{
            padding: "14px 16px",
            borderLeft: "3px solid var(--ft-cyan)",
            margin: "12px 16px",
            background: "var(--ft-raised)",
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>
              Monthly contribution needed
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--ft-cyan)", lineHeight: 1 }}>
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
            <div><span style={{ color: "var(--ft-dim)" }}>FIRE =</span> <span style={{ color: "var(--ft-text)" }}>expenses × 12 / {withdrawalRate}%</span></div>
            <div><span style={{ color: "var(--ft-dim)" }}>25×</span> rule at 4% · <span style={{ color: "var(--ft-dim)" }}>Trinity study</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
