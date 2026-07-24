import { useState, useMemo } from "react";
import { useGetDashboard, useListTransactions } from "@workspace/api-client-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatGbp } from "@/lib/utils";

const MILESTONES = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];

function fmtMilestone(n: number) {
  if (n >= 1_000_000) return `£${n / 1_000_000}M`;
  return `£${n / 1_000}K`;
}

function get3MonthsAgo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

export default function Projection() {
  const [annualRate, setAnnualRate] = useState(7);
  const [savingsAdj, setSavingsAdj] = useState(0);

  const { data: dash } = useGetDashboard();
  const dateFrom = useMemo(() => get3MonthsAgo(), []);
  const { data: recentTxs } = useListTransactions({ dateFrom });

  const { startNetWorth, avgMonthlySavings } = useMemo(() => {
    const nw = dash?.netWorth ?? 0;
    if (!recentTxs || recentTxs.length === 0) return { startNetWorth: nw, avgMonthlySavings: 500 };
    const income = recentTxs.filter(t => t.type === "income").reduce((s, t) => s + t.gbpValue, 0);
    const expenses = recentTxs.filter(t => t.type === "expense").reduce((s, t) => s + t.gbpValue, 0);
    return { startNetWorth: nw, avgMonthlySavings: Math.max(0, (income - expenses) / 3) };
  }, [dash, recentTxs]);

  const effectiveSavings = avgMonthlySavings * (1 + savingsAdj / 100);
  const monthlyRate = annualRate / 100 / 12;

  const chartData = useMemo(() => {
    const points: { month: number; value: number }[] = [];
    let nw = startNetWorth;
    for (let m = 0; m <= 60; m++) {
      points.push({ month: m, value: Math.round(nw) });
      nw = nw * (1 + monthlyRate) + effectiveSavings;
    }
    return points;
  }, [startNetWorth, monthlyRate, effectiveSavings]);

  const finalValue = chartData[60]?.value ?? 0;
  const gain = finalValue - startNetWorth;

  const milestoneHits = MILESTONES.map(m => {
    const hit = chartData.find(p => p.value >= m);
    if (!hit) return null;
    const yr = Math.floor(hit.month / 12);
    const mo = hit.month % 12;
    return { milestone: m, year: yr, month: mo, monthIdx: hit.month };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  const maxVal = Math.max(...chartData.map(p => p.value));
  const relevantMilestones = MILESTONES.filter(m => m <= maxVal * 1.05);

  return (
    <div style={{ padding: "20px 24px", maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: "var(--ft-dim)", marginBottom: 6 }}>
          PROJECTION
        </div>
        <h1 style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 400, color: "var(--ft-text)", margin: 0 }}>
          5-Year Financial Projection
        </h1>
      </div>

      {/* Controls */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        {/* Annual return slider */}
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--ft-dim)" }}>ANNUAL INVESTMENT RETURN</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--ft-green)", fontWeight: 700 }}>{annualRate}%</span>
          </div>
          <input
            type="range" min={0} max={15} step={0.5} value={annualRate}
            onChange={e => setAnnualRate(parseFloat(e.target.value))}
            style={{ width: "100%", accentColor: "var(--ft-green)" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 4 }}>
            <span>0%</span><span>S&P avg ~10%</span><span>15%</span>
          </div>
        </div>
        {/* Savings adjustment slider */}
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--ft-dim)" }}>MONTHLY SAVINGS</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--ft-accent)", fontWeight: 700 }}>
              {formatGbp(Math.round(effectiveSavings))}/mo
            </span>
          </div>
          <input
            type="range" min={-50} max={100} step={5} value={savingsAdj}
            onChange={e => setSavingsAdj(parseInt(e.target.value))}
            style={{ width: "100%", accentColor: "var(--ft-accent)" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 4 }}>
            <span>-50%</span><span>Base: {formatGbp(Math.round(avgMonthlySavings))}</span><span>+100%</span>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "CURRENT NET WORTH", value: formatGbp(startNetWorth), color: "var(--ft-text)" },
          { label: "PROJECTED IN 5 YEARS", value: formatGbp(finalValue), color: "var(--ft-green)" },
          { label: "TOTAL GAIN", value: `+${formatGbp(gain)}`, color: gain >= 0 ? "var(--ft-green)" : "var(--ft-red)" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "14px 16px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--ft-dim)", marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, color, fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "16px", marginBottom: 20 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--ft-dim)", marginBottom: 12 }}>NET WORTH TRAJECTORY</div>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--ft-green)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--ft-green)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--ft-border)" />
            <XAxis
              dataKey="month"
              tickFormatter={m => (m as number) % 12 === 0 ? `Y${(m as number) / 12}` : ""}
              interval={11}
              tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              tickFormatter={v => (v as number) >= 1_000_000 ? `£${((v as number) / 1_000_000).toFixed(1)}M` : (v as number) >= 1_000 ? `£${((v as number) / 1_000).toFixed(0)}K` : `£${v}`}
              tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
              axisLine={false} tickLine={false} width={60}
            />
            <Tooltip
              contentStyle={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 10 }}
              formatter={(v: number) => [formatGbp(v), "Net Worth"]}
              labelFormatter={m => `Month ${m} (Year ${Math.floor(Number(m) / 12)}, Month ${Number(m) % 12 || 12})`}
            />
            {relevantMilestones.map(m => (
              <ReferenceLine key={m} y={m} stroke="var(--ft-border)" strokeDasharray="3 3"
                label={{ value: fmtMilestone(m), position: "right", fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }}
              />
            ))}
            <Area type="monotone" dataKey="value" stroke="var(--ft-green)" strokeWidth={2} fill="url(#projGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Milestone table */}
      {milestoneHits.length > 0 && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--ft-dim)", padding: "10px 14px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-raised)" }}>
            MILESTONE TIMELINE
          </div>
          {milestoneHits.map(hit => (
            <div key={hit.milestone} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", borderBottom: "1px solid var(--ft-border)" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-green)" }}>{fmtMilestone(hit.milestone)}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)" }}>
                Year {hit.year}{hit.month > 0 ? `, month ${hit.month}` : ""} (month {hit.monthIdx})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
