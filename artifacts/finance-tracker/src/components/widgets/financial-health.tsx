import { useGetDashboard } from "@workspace/api-client-react";
import { WidgetShell } from "./widget-shell";

type ScoreComponents = {
  savingsRate: number;
  netLiquidity: number;
  portfolio: number;
  cashBuffer: number;
};

type ScoreResult = {
  total: number;
  components: ScoreComponents;
};

function computeScore(d: {
  thisMonth: { savingsRate: number; expenses: number };
  netLiquidity: number;
  portfolio: { totalPlGbp: number; totalValueGbp: number };
  totalCash: number;
}): ScoreResult {
  const savingsRate = Math.min(30, d.thisMonth.savingsRate * 1.5);

  const rawLiquidity = d.netLiquidity;
  const netLiquidity =
    rawLiquidity > 0 ? 25 : rawLiquidity === 0 ? 12 : Math.max(0, 12 + (rawLiquidity / Math.abs(rawLiquidity || 1)) * 12);

  const portfolioRatio =
    d.portfolio.totalValueGbp > 0 ? d.portfolio.totalPlGbp / d.portfolio.totalValueGbp : 0;
  const portfolio = Math.min(20, Math.max(0, 10 + portfolioRatio * 200));

  const monthsCovered = d.totalCash / Math.max(1, d.thisMonth.expenses);
  const cashBuffer = Math.min(25, (monthsCovered / 3) * 25);

  const total = Math.round(savingsRate + netLiquidity + portfolio + cashBuffer);

  return {
    total,
    components: {
      savingsRate: Math.round(savingsRate),
      netLiquidity: Math.round(netLiquidity),
      portfolio: Math.round(portfolio),
      cashBuffer: Math.round(cashBuffer),
    },
  };
}

function scoreColor(score: number): string {
  if (score >= 70) return "var(--ft-green)";
  if (score >= 40) return "var(--ft-amber)";
  return "var(--ft-red)";
}

function scoreVerdict(score: number): string {
  if (score >= 85) return "Excellent financial position — keep it up";
  if (score >= 70) return "Strong financial position";
  if (score >= 55) return "Solid foundation, room to improve";
  if (score >= 40) return "Watch your expenses and build reserves";
  if (score >= 25) return "Financial stress detected — review spending";
  return "Critical: immediate budget review recommended";
}

type GaugeProps = {
  score: number;
  color: string;
};

function CircularGauge({ score, color }: GaugeProps) {
  const size = 140;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const sweepFraction = 270 / 360;
  const arcLength = circumference * sweepFraction;
  const filled = (score / 100) * arcLength;
  const gap = circumference - arcLength;

  return (
    <svg
      width={size}
      height={size}
      style={{ display: "block", margin: "0 auto", overflow: "visible" }}
    >
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
        style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.3s ease" }}
      />
    </svg>
  );
}

type ComponentRowProps = {
  label: string;
  pts: number;
  maxPts: number;
};

function ComponentRow({ label, pts, maxPts }: ComponentRowProps) {
  const pct = maxPts > 0 ? (pts / maxPts) * 100 : 0;
  const barColor = pct >= 70 ? "var(--ft-green)" : pct >= 40 ? "var(--ft-amber)" : "var(--ft-red)";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: "8px",
        padding: "6px 0",
        borderBottom: "1px solid var(--ft-border)",
      }}
    >
      <div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ft-dim)",
            marginBottom: 4,
          }}
        >
          {label}
        </div>
        <div
          style={{
            height: 3,
            background: "var(--ft-border)",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: barColor,
              borderRadius: 2,
              transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </div>
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 700,
          color: barColor,
          textAlign: "right",
          minWidth: 44,
        }}
      >
        {pts}
        <span
          style={{
            fontWeight: 400,
            color: "var(--ft-dim)",
            fontSize: 9,
          }}
        >
          /{maxPts}
        </span>
      </div>
    </div>
  );
}

export function FinancialHealthWidget() {
  const { data: d, isLoading } = useGetDashboard();

  const result = d ? computeScore(d) : null;
  const color = result ? scoreColor(result.total) : "var(--ft-dim)";
  const verdict = result ? scoreVerdict(result.total) : "";

  return (
    <WidgetShell title="Financial Health" isLoading={isLoading}>
      {result && (
        <>
          <div style={{ padding: "20px 16px 12px" }}>
            <div style={{ position: "relative", width: 140, margin: "0 auto" }}>
              <CircularGauge score={result.total} color={color} />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 32,
                    fontWeight: 700,
                    color,
                    lineHeight: 1,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {result.total}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--ft-dim)",
                    marginTop: 3,
                  }}
                >
                  Health Score
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: "0 16px 4px" }}>
            <ComponentRow label="Savings Rate" pts={result.components.savingsRate} maxPts={30} />
            <ComponentRow label="Net Liquidity" pts={result.components.netLiquidity} maxPts={25} />
            <ComponentRow label="Portfolio" pts={result.components.portfolio} maxPts={20} />
            <ComponentRow label="Cash Buffer" pts={result.components.cashBuffer} maxPts={25} />
          </div>

          <div
            style={{
              margin: "8px 16px 0",
              padding: "8px 10px",
              background: "var(--ft-raised)",
              borderTop: "1px solid var(--ft-border)",
              borderBottom: "1px solid var(--ft-border)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: color,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--ft-muted)",
                letterSpacing: "0.03em",
              }}
            >
              {verdict}
            </span>
          </div>

          <div style={{ height: 12 }} />
        </>
      )}
    </WidgetShell>
  );
}
