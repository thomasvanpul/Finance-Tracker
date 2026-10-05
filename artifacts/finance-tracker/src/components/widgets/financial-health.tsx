import { useState } from "react";
import { useGetDashboard } from "@workspace/api-client-react";
import { WidgetShell } from "./widget-shell";

// ─── Types ────────────────────────────────────────────────────────────────────

// A pillar is null when its input is null — unknown, not zero. The weights
// are unchanged; only what an unknown input does to the render is.
type ScoreComponents = {
  savingsRate: number | null;
  netLiquidity: number | null;
  portfolio: number | null;
  cashBuffer: number | null;
};

type ScoreMaxes = {
  savingsRate: number;
  netLiquidity: number;
  portfolio: number;
  cashBuffer: number;
};

type ScoreResult = {
  /** Null while any pillar is unscorable: a part-score out of 100 is a
      claim the data does not support. */
  total: number | null;
  components: ScoreComponents;
  maxes: ScoreMaxes;
  /** Human names of the pillars that could not be scored. */
  unscorable: string[];
  /** How many of the 100 points those pillars are worth. */
  unscorablePoints: number;
};

// ─── Scoring ──────────────────────────────────────────────────────────────────

function computeScore(d: {
  thisMonth: { savingsRate: number | null; expenses: number };
  netLiquidity: number;
  portfolio: { totalPlBase: number | null; totalValueBase: number | null };
  totalCash: number;
}): ScoreResult {
  // DECIDED 2026-10-05 (T1 item 3), replacing the open question that stood
  // here: an unknown input is rendered as unknown, never as 0 and never as
  // a grade. The pillars and their weights are untouched — which pillars
  // are real is still T3's call — but a null no longer silently scores
  // zero. Measured before: a user with no income recorded and no prices
  // read "50 / 100 MODERATE · Watch your expenses and build reserves",
  // with SAVINGS RATE 0/30 and PORTFOLIO 0/20 presented as results and
  // two HIGH-impact recommendations built on them. 50 of the 100 points
  // were unscorable.
  const savingsRate =
    d.thisMonth.savingsRate == null
      ? null
      : Math.min(30, d.thisMonth.savingsRate * 1.5);

  const rawLiquidity = d.netLiquidity;
  const netLiquidity =
    rawLiquidity > 0
      ? 25
      : rawLiquidity === 0
        ? 0
        : Math.max(0, 12 + (rawLiquidity / Math.abs(rawLiquidity || 1)) * 12);

  // Holdings with no valuation (null total), or a valued portfolio with no
  // known return (null P/L), are unscorable. An empty portfolio is a real
  // zero: there is nothing invested, which is a fact and not a gap.
  const portfolioValue = d.portfolio.totalValueBase;
  const portfolio =
    portfolioValue == null
      ? null
      : portfolioValue === 0
        ? 0
        : d.portfolio.totalPlBase == null
          ? null
          : Math.min(20, Math.max(0, (d.portfolio.totalPlBase / portfolioValue) * 200));

  const monthsCovered = d.totalCash / Math.max(1, d.thisMonth.expenses);
  const cashBuffer = Math.min(25, (monthsCovered / 3) * 25);

  const maxes: ScoreMaxes = {
    savingsRate: 30,
    netLiquidity: 25,
    portfolio: 20,
    cashBuffer: 25,
  };

  const components: ScoreComponents = {
    savingsRate: savingsRate == null ? null : Math.round(savingsRate),
    netLiquidity: Math.round(netLiquidity),
    portfolio: portfolio == null ? null : Math.round(portfolio),
    cashBuffer: Math.round(cashBuffer),
  };

  const unscorable: string[] = [];
  let unscorablePoints = 0;
  if (components.savingsRate == null) {
    unscorable.push("savings rate (no income recorded this month)");
    unscorablePoints += maxes.savingsRate;
  }
  if (components.portfolio == null) {
    unscorable.push("portfolio (no valuation for the holdings)");
    unscorablePoints += maxes.portfolio;
  }

  // Withheld, not part-scored. A 50 that is really "50 points we could
  // measure and 50 we could not" is the same class of defect as a
  // fabricated figure: it reads as a result.
  const total =
    unscorable.length > 0
      ? null
      : Math.round(
          (components.savingsRate ?? 0) +
            (components.netLiquidity ?? 0) +
            (components.portfolio ?? 0) +
            (components.cashBuffer ?? 0),
        );

  return { total, components, maxes, unscorable, unscorablePoints };
}

function scoreColor(score: number): string {
  if (score >= 70) return "var(--ft-green)";
  if (score >= 40) return "var(--ft-amber)";
  return "var(--ft-red)";
}

function scoreBand(score: number): string {
  if (score >= 70) return "STRONG";
  if (score >= 40) return "MODERATE";
  return "WEAK";
}

function scoreVerdict(score: number): string {
  if (score >= 85) return "Excellent financial position — keep it up";
  if (score >= 70) return "Strong financial position";
  if (score >= 55) return "Solid foundation, room to improve";
  if (score >= 40) return "Watch your expenses and build reserves";
  if (score >= 25) return "Financial stress detected — review spending";
  return "Critical: immediate budget review recommended";
}

// ─── Gauge ────────────────────────────────────────────────────────────────────

type GaugeProps = { score: number; color: string };

function CircularGauge({ score, color }: GaugeProps) {
  const size = 128;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const sweepFraction = 270 / 360;
  const arcLength = circumference * sweepFraction;
  const filled = (score / 100) * arcLength;

  return (
    <svg
      width={size}
      height={size}
      style={{ display: "block", margin: "0 auto", overflow: "visible" }}
      aria-hidden="true"
    >
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--ft-border)"
        strokeWidth={strokeWidth}
        strokeDasharray={`${arcLength} ${circumference - arcLength}`}
        strokeLinecap="round"
        transform={`rotate(135 ${size / 2} ${size / 2})`}
      />
      {/* Fill */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={`${filled} ${circumference - filled}`}
        strokeLinecap="round"
        transform={`rotate(135 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 0.25s ease, stroke 0.15s ease" }}
      />
    </svg>
  );
}

// ─── Component Row ────────────────────────────────────────────────────────────

type ComponentRowProps = {
  label: string;
  description: string;
  /** Null = unscorable. Renders "—/30", an empty bar and a neutral dot,
      so an unknown pillar never reads as a failed one. */
  pts: number | null;
  maxPts: number;
  isWeakest?: boolean;
};

function ComponentRow({ label, description, pts, maxPts, isWeakest }: ComponentRowProps) {
  const [hov, setHov] = useState(false);
  const known = pts != null;
  const pct = known && maxPts > 0 ? (pts / maxPts) * 100 : 0;
  const dotColor = !known
    ? "var(--ft-border2)"
    : pct >= 70 ? "var(--ft-green)" : pct >= 40 ? "var(--ft-amber)" : "var(--ft-red)";
  const barColor = dotColor;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "6px 1fr auto",
        alignItems: "center",
        gap: "8px",
        padding: "7px 0",
        borderBottom: "1px solid var(--ft-border)",
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : isWeakest && known
          ? "rgba(248,81,73,0.04)"
          : undefined,
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* Status dot */}
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: dotColor,
          flexShrink: 0,
        }}
      />

      {/* Label + bar */}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            marginBottom: 3,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 11,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--ft-muted)",
            }}
          >
            {label}
          </span>
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 9,
              color: "var(--ft-dim)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {description}
          </span>
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
              transition: "width 0.12s ease",
            }}
          />
        </div>
      </div>

      {/* Score */}
      <div
        className="pnum"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          fontWeight: 700,
          color: known ? dotColor : "var(--ft-dim)",
          textAlign: "right",
          minWidth: 48,
          letterSpacing: "-0.01em",
        }}
      >
        {known ? pts : "\u2014"}
        <span style={{ fontWeight: 400, color: "var(--ft-dim)", fontSize: 9 }}>
          /{maxPts}
        </span>
      </div>
    </div>
  );
}

// ─── Breakdown ────────────────────────────────────────────────────────────────

type BreakdownItemProps = {
  label: string;
  impact: "high" | "medium" | "low";
  message: string;
};

function BreakdownItem({ label, impact, message }: BreakdownItemProps) {
  const [hov, setHov] = useState(false);
  const impactColor =
    impact === "high"
      ? "var(--ft-red)"
      : impact === "medium"
        ? "var(--ft-amber)"
        : "var(--ft-dim)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "5px 0",
        borderBottom: "1px solid var(--ft-border)",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          padding: "var(--ft-badge-py) var(--ft-badge-px)",
          border: `1px solid ${impactColor}40`,
          color: impactColor,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {impact}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 9,
            color: "var(--ft-muted)",
            fontWeight: 600,
            letterSpacing: "0.04em",
            marginBottom: 1,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 9,
            color: "var(--ft-dim)",
          }}
        >
          {message}
        </div>
      </div>
    </div>
  );
}

function buildBreakdown(
  components: ScoreComponents,
  maxes: ScoreMaxes,
  unscorable: string[]
): BreakdownItemProps[] {
  const items: BreakdownItemProps[] = [];

  // A null pillar yields a null ratio, and every rule below skips a null.
  // Advice built on an unknown is the defect, not a lesser form of it: the
  // widget used to tell a user with no recorded income that their savings
  // were "very low" at HIGH impact, and a user with no prices that their
  // portfolio was "underperforming".
  const ratio = (pts: number | null, max: number): number | null =>
    pts == null || max <= 0 ? null : pts / max;
  const srPct = ratio(components.savingsRate, maxes.savingsRate);
  const nlPct = ratio(components.netLiquidity, maxes.netLiquidity);
  const pfPct = ratio(components.portfolio, maxes.portfolio);
  const cbPct = ratio(components.cashBuffer, maxes.cashBuffer);

  for (const what of unscorable) {
    items.push({
      label: "Not scorable yet",
      impact: "low",
      message: `${what} — recorded once, this pillar scores and the total appears`,
    });
  }

  if (srPct != null && srPct < 0.5) {
    items.push({
      label: "Savings Rate",
      impact: srPct != null && srPct < 0.25 ? "high" : "medium",
      message:
        srPct != null && srPct < 0.25
          ? "Very low savings — target 15%+ of income each month"
          : "Below ideal savings rate — aim to reduce discretionary spend",
    });
  }
  if (nlPct != null && nlPct < 0.5) {
    items.push({
      label: "Net Liquidity",
      impact: nlPct != null && nlPct < 0.25 ? "high" : "medium",
      message:
        nlPct != null && nlPct < 0.25
          ? "Net worth is negative — liabilities exceed assets"
          : "Net position is thin — watch debt levels",
    });
  }
  if (pfPct != null && pfPct < 0.5) {
    items.push({
      label: "Portfolio",
      impact: pfPct != null && pfPct < 0.25 ? "high" : "medium",
      message:
        pfPct != null && pfPct < 0.25
          ? "Portfolio underperforming or very small — consider diversifying"
          : "Portfolio gains below benchmark — review allocation",
    });
  }
  if (cbPct != null && cbPct < 0.5) {
    items.push({
      label: "Cash Buffer",
      impact: cbPct != null && cbPct < 0.25 ? "high" : "medium",
      message:
        cbPct != null && cbPct < 0.25
          ? "Less than 1 month expenses in cash — rebuild emergency fund"
          : "Under 1.5 months' runway — build towards 3 months",
    });
  }

  if (items.length === 0) {
    items.push({
      label: "All metrics healthy",
      impact: "low",
      message: "No major weaknesses detected — keep maintaining your current habits",
    });
  }

  return items;
}

// ─── Widget ───────────────────────────────────────────────────────────────────

export function FinancialHealthWidget() {
  const { data: d, isLoading } = useGetDashboard();

  const result = d ? computeScore(d) : null;
  const total = result?.total ?? null;
  const color = total != null ? scoreColor(total) : "var(--ft-dim)";
  const band = total != null ? scoreBand(total) : result ? "NOT SCORABLE YET" : "";
  const verdict =
    total != null
      ? scoreVerdict(total)
      : result
        ? `${result.unscorablePoints} of the 100 points cannot be measured yet: ${result.unscorable.join("; ")}. A score is withheld rather than part-counted.`
        : "";
  const breakdown = result ? buildBreakdown(result.components, result.maxes, result.unscorable) : [];

  // Find the weakest component. An unscorable pillar is not a candidate —
  // it is not weak, it is unmeasured.
  let weakestKey: keyof ScoreComponents | null = null;
  if (result) {
    let lowestPct = 1;
    for (const k of Object.keys(result.components) as (keyof ScoreComponents)[]) {
      const pts = result.components[k];
      if (pts == null) continue;
      const pct = pts / result.maxes[k];
      if (pct < lowestPct) {
        lowestPct = pct;
        weakestKey = k;
      }
    }
  }

  const componentMeta: Record<keyof ScoreComponents, { label: string; description: string }> = {
    savingsRate: { label: "Savings Rate", description: "% of income saved" },
    netLiquidity: { label: "Net Liquidity", description: "assets minus liabilities" },
    portfolio: { label: "Portfolio", description: "investment performance" },
    cashBuffer: { label: "Cash Buffer", description: "months of expenses covered" },
  };

  return (
    <WidgetShell title="Financial Health" isLoading={isLoading}>
      {result && (
        <>
          {/* ── Hero: gauge + score ── */}
          <div
            style={{
              padding: "16px 16px 12px",
              display: "flex",
              alignItems: "center",
              gap: 16,
              borderBottom: "1px solid var(--ft-border)",
            }}
          >
            <div style={{ position: "relative", width: 128, flexShrink: 0 }}>
              <CircularGauge score={total ?? 0} color={color} />
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
                  className="pnum"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 20,
                    fontWeight: 700,
                    color,
                    lineHeight: 1,
                    letterSpacing: "-0.03em",
                  }}
                >
                  {total ?? "\u2014"}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--ft-dim)",
                    marginTop: 3,
                  }}
                >
                  / 100
                </div>
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              {/* Band badge */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "var(--ft-badge-py) var(--ft-badge-px)",
                  border: `1px solid ${color}40`,
                  marginBottom: 8,
                  overflow: "hidden",
                  maxWidth: "100%",
                }}
              >
                <div
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color,
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {band}
                </span>
              </div>

              {/* Verdict */}
              <div
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 11,
                  color: "var(--ft-muted)",
                  lineHeight: 1.45,
                  letterSpacing: "0.02em",
                  overflow: "hidden",
                }}
              >
                {verdict}
              </div>

              {/* Score total bar */}
              <div
                style={{
                  marginTop: 10,
                  height: 4,
                  background: "var(--ft-border)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${total ?? 0}%`,
                    background: color,
                    borderRadius: 2,
                    transition: "width 0.35s ease",
                  }}
                />
              </div>
              <div
                style={{
                  marginTop: 3,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                {[0, 40, 70, 100].map((v) => (
                  <span
                    key={v}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      color: "var(--ft-dim)",
                    }}
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ── Score components ── */}
          <div style={{ padding: "0 16px" }}>
            {(Object.keys(result.components) as (keyof ScoreComponents)[]).map((k) => (
              <ComponentRow
                key={k}
                label={componentMeta[k].label}
                description={componentMeta[k].description}
                pts={result.components[k]}
                maxPts={result.maxes[k]}
                isWeakest={k === weakestKey}
              />
            ))}
          </div>

          {/* ── Score Breakdown ── */}
          <div style={{ margin: "8px 16px 0" }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ft-dim)",
                marginBottom: 4,
                paddingBottom: 4,
                borderBottom: "1px solid var(--ft-border)",
              }}
            >
              Score Breakdown
            </div>
            {breakdown.map((item) => (
              <BreakdownItem key={item.label} {...item} />
            ))}
          </div>

          <div style={{ height: 12 }} />
        </>
      )}
    </WidgetShell>
  );
}
