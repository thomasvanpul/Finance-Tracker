import { X } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip,
  CartesianGrid, ReferenceLine, Cell, ComposedChart, Line,
} from "recharts";

interface EarningsEntry {
  date: string;
  epsActual?: number | null;
  epsEstimate?: number | null;
  surprise?: number | null;
}

interface RecTrend {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

interface Props {
  label: string;
  value: string;
  info: string;
  earningsHistory?: EarningsEntry[];
  recTrend?: RecTrend[];
  onClose: () => void;
}

// ── Benchmark definitions ────────────────────────────────────────────────────

type Quality = "excellent" | "good" | "fair" | "weak" | "poor";

interface Assessment {
  quality: Quality;
  badge: string;
  context: string;
}

const QC: Record<Quality, string> = {
  excellent: "#3fb950",
  good: "#22d3ee",
  fair: "#e3b341",
  weak: "#f97316",
  poor: "#f85149",
};

function pct(v: string): number | null {
  const n = parseFloat(v.replace("%", "").replace("+", ""));
  return isNaN(n) ? null : n;
}
function money(v: string): number | null {
  const n = parseFloat(v.replace(/[$×xd]/g, ""));
  return isNaN(n) ? null : n;
}

type BenchmarkDef = {
  formula?: string;
  chart?: "eps" | "analyst";
  insights: string[];
  assess: (v: string) => Assessment | null;
};

const BENCHMARKS: Record<string, BenchmarkDef> = {
  "P/E (TTM)": {
    formula: "Stock Price ÷ EPS (trailing 12 months)",
    insights: [
      "S&P 500 historical average: 15–25×",
      "Compare to sector peers, not the whole market",
      "Negative P/E means the company is losing money",
      "High P/E is justified only with high earnings growth",
    ],
    assess(v) {
      const n = money(v);
      if (n === null) return null;
      if (n < 0) return { quality: "poor", badge: "Net Loss", context: "Company is currently unprofitable — P/E is negative." };
      if (n < 12) return { quality: "excellent", badge: "Very Cheap", context: "Trading well below market average. Potential value — or value trap. Check debt and growth." };
      if (n < 20) return { quality: "good", badge: "Below Avg", context: "Below S&P 500 average (~20×). Reasonable valuation if earnings are stable." };
      if (n < 30) return { quality: "fair", badge: "Fair Value", context: "Near the S&P 500 long-run average. Priced for moderate growth." };
      if (n < 50) return { quality: "weak", badge: "Elevated", context: "Above historical norms. Requires consistent earnings growth to justify." };
      return { quality: "poor", badge: "Very Expensive", context: "Priced for exceptional growth. High risk if growth disappoints." };
    },
  },
  "Forward P/E": {
    formula: "Stock Price ÷ Next-12-Month EPS Estimate",
    insights: [
      "Based on analyst consensus — can be wrong",
      "Lower than TTM P/E means earnings expected to grow",
      "Higher than TTM P/E could signal expected earnings decline",
      "Useful for growth companies with near-term losses",
    ],
    assess(v) {
      const n = money(v);
      if (n === null) return null;
      if (n < 12) return { quality: "excellent", badge: "Very Cheap", context: "Very low forward valuation. Could be a bargain if estimates hold." };
      if (n < 20) return { quality: "good", badge: "Below Avg", context: "Below-average forward valuation. Reasonable entry point if estimates are reliable." };
      if (n < 30) return { quality: "fair", badge: "Moderate", context: "Fair forward valuation for a quality growth business." };
      if (n < 50) return { quality: "weak", badge: "Elevated", context: "High forward P/E demands strong execution on estimates." };
      return { quality: "poor", badge: "Very High", context: "Priced to perfection. Any earnings miss could cause a large correction." };
    },
  },
  "EPS (TTM)": {
    chart: "eps",
    formula: "Net Income ÷ Weighted Avg. Shares Outstanding",
    insights: [
      "Growth trend matters more than the absolute value",
      "Compare with Forward EPS for expected trajectory",
      "Positive surprises vs estimates drive price appreciation",
      "Dilution (share issuance) reduces EPS over time",
    ],
    assess(v) {
      const n = money(v);
      if (n === null) return null;
      if (n < 0) return { quality: "poor", badge: "Loss-Making", context: "Company is currently losing money per share." };
      if (n < 1) return { quality: "weak", badge: "Low", context: "Small per-share earnings. Growth trajectory is key." };
      if (n < 5) return { quality: "fair", badge: "Moderate", context: "Decent earnings base for a mid-cap or growth company." };
      if (n < 15) return { quality: "good", badge: "Strong", context: "Solid earnings per share — well-established profitability." };
      return { quality: "excellent", badge: "Excellent", context: "Very high per-share earnings — typically large, profitable companies." };
    },
  },
  "Fwd EPS": {
    chart: "eps",
    formula: "Analyst consensus estimate for next 12-month EPS",
    insights: [
      "Forward EPS is an estimate — subject to revisions",
      "Rising estimates (upgrades) are bullish signals",
      "Compare with TTM EPS to see expected growth",
      "Use Forward P/E = Price ÷ Forward EPS",
    ],
    assess(v) {
      const n = money(v);
      if (n === null) return null;
      if (n < 0) return { quality: "poor", badge: "Expected Loss", context: "Analysts expect the company to lose money next year." };
      if (n < 2) return { quality: "weak", badge: "Low", context: "Low expected earnings next year." };
      if (n < 8) return { quality: "fair", badge: "Moderate", context: "Moderate forward earnings expected." };
      return { quality: "good", badge: "Strong", context: "Analysts expect solid earnings next year." };
    },
  },
  "Beta": {
    formula: "Covariance(Stock, Market) ÷ Variance(Market)",
    insights: [
      "Beta < 0: moves opposite to the market (rare)",
      "Beta 0–0.7: defensive, lower risk/return",
      "Beta 0.7–1.3: market-correlated",
      "Beta > 1.3: amplified swings, higher risk/reward",
    ],
    assess(v) {
      const n = money(v);
      if (n === null) return null;
      if (n < 0) return { quality: "excellent", badge: "Inverse", context: "Moves opposite to the market. Acts as a natural hedge." };
      if (n < 0.5) return { quality: "excellent", badge: "Very Low", context: "Highly defensive. Very stable relative to markets." };
      if (n < 0.9) return { quality: "good", badge: "Low", context: "Below-market volatility. Good for conservative portfolios." };
      if (n < 1.3) return { quality: "fair", badge: "Market-Like", context: "Moves roughly in line with the broad market." };
      if (n < 2) return { quality: "weak", badge: "High", context: "Amplified moves vs the market. Higher risk and potential reward." };
      return { quality: "poor", badge: "Very High", context: "Very volatile stock. Expect large swings in both directions." };
    },
  },
  "Gross Margin": {
    formula: "(Revenue − Cost of Goods Sold) ÷ Revenue × 100",
    insights: [
      ">70% typical for software/pharma with high pricing power",
      "20–40% typical for industrials and retailers",
      "<20% typical for commodity or thin-margin businesses",
      "Gross margin trend more important than absolute level",
    ],
    assess(v) {
      const n = pct(v);
      if (n === null) return null;
      if (n < 0) return { quality: "poor", badge: "Negative", context: "Selling products below cost. Unsustainable without turnaround." };
      if (n < 20) return { quality: "poor", badge: "Very Thin", context: "Thin margins leave little room for overhead and profit." };
      if (n < 40) return { quality: "weak", badge: "Below Avg", context: "Moderate gross margins — typical for asset-heavy businesses." };
      if (n < 60) return { quality: "fair", badge: "Reasonable", context: "Decent gross margins for most sectors." };
      if (n < 80) return { quality: "good", badge: "Strong", context: "High gross margins indicate strong pricing power." };
      return { quality: "excellent", badge: "Excellent", context: "Exceptional gross margins — hallmark of software, pharma, luxury brands." };
    },
  },
  "Operating Margin": {
    formula: "Operating Income ÷ Revenue × 100",
    insights: [
      "Measures profitability after all operating expenses",
      "Excludes interest and taxes — good for comparing across capital structures",
      "Improving operating margin = efficiency gains or pricing power",
      "Negative operating margin = unsustainable without funding",
    ],
    assess(v) {
      const n = pct(v);
      if (n === null) return null;
      if (n < 0) return { quality: "poor", badge: "Unprofitable", context: "Operations are currently loss-making. Needs revenue growth or cost cuts." };
      if (n < 5) return { quality: "weak", badge: "Very Thin", context: "Very slim operating margin — vulnerable to cost shocks." };
      if (n < 15) return { quality: "fair", badge: "Moderate", context: "Moderate profitability. Typical for competitive industries." };
      if (n < 25) return { quality: "good", badge: "Strong", context: "Strong operating leverage. Good cost control." };
      return { quality: "excellent", badge: "Exceptional", context: "World-class operating efficiency." };
    },
  },
  "Net Margin": {
    formula: "Net Income ÷ Revenue × 100",
    insights: [
      "The 'bottom line' — profit after all costs including tax",
      "Highly variable by sector: utilities ~10%, software ~20–30%",
      "Can differ from operating margin due to debt load and taxes",
      "Negative net margin doesn't always mean distress (e.g. growth mode)",
    ],
    assess(v) {
      const n = pct(v);
      if (n === null) return null;
      if (n < 0) return { quality: "poor", badge: "Net Loss", context: "Currently unprofitable at the bottom line." };
      if (n < 3) return { quality: "weak", badge: "Very Thin", context: "Barely profitable. Small revenue changes can flip to losses." };
      if (n < 10) return { quality: "fair", badge: "Moderate", context: "Reasonable profitability. Typical for many mature businesses." };
      if (n < 20) return { quality: "good", badge: "Strong", context: "Above-average net margin. Strong business economics." };
      return { quality: "excellent", badge: "Exceptional", context: "Very high net margins. Indicative of monopolistic or high-IP businesses." };
    },
  },
  "ROE": {
    formula: "Net Income ÷ Shareholders' Equity × 100",
    insights: [
      "Warren Buffett looks for ROE > 15% consistently",
      "Very high ROE (>50%) may indicate heavy leverage or buybacks",
      "Compare to cost of equity (typically 8–12%) for economic value",
      "Negative equity gives misleading ROE — check balance sheet",
    ],
    assess(v) {
      const n = pct(v);
      if (n === null) return null;
      if (n < 0) return { quality: "poor", badge: "Negative", context: "Not generating returns for shareholders." };
      if (n < 8) return { quality: "weak", badge: "Below Avg", context: "Returns below the cost of equity — value destruction." };
      if (n < 15) return { quality: "fair", badge: "Acceptable", context: "Generating modest returns. Room for improvement." };
      if (n < 25) return { quality: "good", badge: "Strong", context: "Above Buffett's 15% benchmark. Efficient use of equity." };
      return { quality: "excellent", badge: "Excellent", context: "Exceptional capital efficiency. Could indicate high leverage — verify." };
    },
  },
  "ROA": {
    formula: "Net Income ÷ Total Assets × 100",
    insights: [
      "Less affected by leverage than ROE",
      "Asset-light businesses (tech, consulting) naturally have higher ROA",
      "Banks typically show 0.5–1.5% ROA (asset-heavy by nature)",
      "ROA improving over time = improving asset efficiency",
    ],
    assess(v) {
      const n = pct(v);
      if (n === null) return null;
      if (n < 0) return { quality: "poor", badge: "Negative", context: "Assets aren't generating profit." };
      if (n < 3) return { quality: "weak", badge: "Low", context: "Low asset utilization. Typical for capital-intensive businesses." };
      if (n < 8) return { quality: "fair", badge: "Moderate", context: "Decent asset productivity." };
      if (n < 15) return { quality: "good", badge: "Strong", context: "Efficient use of assets to generate profit." };
      return { quality: "excellent", badge: "Excellent", context: "Outstanding asset efficiency. Characteristic of best-in-class businesses." };
    },
  },
  "PEG Ratio": {
    formula: "P/E Ratio ÷ Annual EPS Growth Rate",
    insights: [
      "PEG < 1: potentially undervalued relative to growth",
      "PEG = 1: growth fairly priced into valuation",
      "PEG > 2: may be overvalued relative to growth",
      "Only meaningful for companies with positive earnings and growth",
    ],
    assess(v) {
      const n = money(v);
      if (n === null) return null;
      if (n < 0) return { quality: "poor", badge: "N/A", context: "Negative PEG is usually meaningless — negative earnings or growth." };
      if (n < 0.5) return { quality: "excellent", badge: "Very Cheap", context: "Potentially deeply undervalued relative to growth rate." };
      if (n < 1) return { quality: "good", badge: "Undervalued", context: "Growth may not be fully priced in." };
      if (n < 1.5) return { quality: "fair", badge: "Fair Value", context: "Fairly priced for the growth rate." };
      if (n < 2.5) return { quality: "weak", badge: "Elevated", context: "Paying a premium over growth rate. Requires consistent execution." };
      return { quality: "poor", badge: "Expensive", context: "High premium relative to growth. Risk of re-rating lower if growth slows." };
    },
  },
  "P/Sales": {
    formula: "Market Cap ÷ Annual Revenue",
    insights: [
      "Useful for pre-profit growth companies",
      "Tech SaaS: 5–20× is typical",
      "Retail: often below 1×",
      "Lower P/S is better, but industry context matters enormously",
    ],
    assess(v) {
      const n = money(v);
      if (n === null) return null;
      if (n < 1) return { quality: "excellent", badge: "Very Cheap", context: "Trading near or below annual revenue. Very low valuation." };
      if (n < 3) return { quality: "good", badge: "Reasonable", context: "Modest revenue multiple. Typical for value or cyclical sectors." };
      if (n < 8) return { quality: "fair", badge: "Moderate", context: "Mid-range revenue multiple. Common for quality growth businesses." };
      if (n < 20) return { quality: "weak", badge: "Elevated", context: "High revenue multiple. Requires strong growth and margin expansion." };
      return { quality: "poor", badge: "Very High", context: "Priced well above revenue. Need exceptional future cash flows to justify." };
    },
  },
  "P/Book": {
    formula: "Market Price per Share ÷ Book Value per Share",
    insights: [
      "P/B < 1: trading below asset value (could be value or distress)",
      "P/B is most relevant for financial companies and asset-heavy businesses",
      "High-ROIC companies often trade at high P/B (justified premium)",
      "Technology companies often show P/B > 10 (intangible assets not on balance sheet)",
    ],
    assess(v) {
      const n = money(v);
      if (n === null) return null;
      if (n < 1) return { quality: "excellent", badge: "Below Book", context: "Trading below book value — potential deep value or distress." };
      if (n < 2) return { quality: "good", badge: "Low", context: "Low book value premium. Common for financials and industrials." };
      if (n < 5) return { quality: "fair", badge: "Moderate", context: "Moderate book premium. Typical for quality businesses." };
      if (n < 15) return { quality: "weak", badge: "Elevated", context: "High book premium — justified for high-ROIC businesses." };
      return { quality: "poor", badge: "Very High", context: "Very high premium to book. Intangible assets dominate value." };
    },
  },
  "Div Yield": {
    formula: "Annual Dividend per Share ÷ Share Price × 100",
    insights: [
      "0% = no dividend (common for growth companies reinvesting cash)",
      "1–3% = moderate yield, balanced approach",
      ">5% = high yield — check payout ratio for sustainability",
      "Yield rises when price falls — high yield may signal distress",
    ],
    assess(v) {
      const n = pct(v);
      if (n === null) return null;
      if (n === 0) return { quality: "fair", badge: "No Dividend", context: "No current dividend. Earnings reinvested for growth." };
      if (n < 1) return { quality: "fair", badge: "Token Yield", context: "Minimal yield — primarily a growth investment." };
      if (n < 3) return { quality: "good", badge: "Moderate", context: "Healthy income yield with room for growth." };
      if (n < 5) return { quality: "fair", badge: "High Yield", context: "Attractive income. Verify payout ratio sustainability (<60% is healthy)." };
      return { quality: "weak", badge: "Very High", context: "Very high yield — could indicate price weakness or unsustainable payout." };
    },
  },
  "Debt / Equity": {
    formula: "Total Debt ÷ Total Shareholders' Equity",
    insights: [
      "D/E varies widely by sector — utilities and financials run higher",
      "D/E > 2 is considered high for most non-financial companies",
      "Debt isn't always bad — leverage amplifies returns in good times",
      "Check interest coverage ratio alongside D/E",
    ],
    assess(v) {
      const n = money(v);
      if (n === null) return null;
      if (n < 0) return { quality: "poor", badge: "Negative Equity", context: "More liabilities than assets. Potentially insolvent." };
      if (n < 0.3) return { quality: "excellent", badge: "Conservative", context: "Very low leverage. Strong balance sheet." };
      if (n < 0.7) return { quality: "good", badge: "Moderate", context: "Manageable debt load." };
      if (n < 1.5) return { quality: "fair", badge: "Leveraged", context: "Moderate leverage. Monitor interest coverage." };
      if (n < 3) return { quality: "weak", badge: "High", context: "High leverage. Vulnerable to rate hikes or earnings drops." };
      return { quality: "poor", badge: "Very High", context: "Very high leverage. Significant financial risk." };
    },
  },
  "Current Ratio": {
    formula: "Current Assets ÷ Current Liabilities",
    insights: [
      "< 1 means current liabilities exceed current assets",
      "1.5–2.5 is generally considered healthy",
      "Very high ratio (>4) can mean inefficient use of assets",
      "Falling current ratio is an early warning sign",
    ],
    assess(v) {
      const n = money(v);
      if (n === null) return null;
      if (n < 0.5) return { quality: "poor", badge: "Critical", context: "Severe liquidity risk — may struggle to meet short-term obligations." };
      if (n < 1) return { quality: "weak", badge: "Tight", context: "Current liabilities exceed current assets. Watch closely." };
      if (n < 1.5) return { quality: "fair", badge: "Acceptable", context: "Just covering short-term obligations." };
      if (n < 3) return { quality: "good", badge: "Healthy", context: "Good liquidity position. Comfortable coverage of near-term debts." };
      return { quality: "excellent", badge: "Strong", context: "Very strong liquidity — well protected against short-term shocks." };
    },
  },
  "Quick Ratio": {
    formula: "(Current Assets − Inventory) ÷ Current Liabilities",
    insights: [
      "Stricter than current ratio — excludes inventory",
      "> 1 means liquid assets cover all current liabilities",
      "Especially important for businesses with slow-moving inventory",
      "Software and service companies typically show high quick ratios",
    ],
    assess(v) {
      const n = money(v);
      if (n === null) return null;
      if (n < 0.5) return { quality: "poor", badge: "Critical", context: "Cannot cover liabilities without selling inventory." };
      if (n < 1) return { quality: "weak", badge: "Below 1", context: "Liquid assets don't fully cover short-term liabilities." };
      if (n < 1.5) return { quality: "good", badge: "Acceptable", context: "Adequate liquidity without needing inventory." };
      return { quality: "excellent", badge: "Strong", context: "Excellent liquid asset coverage." };
    },
  },
  "Short Float": {
    formula: "Shares Sold Short ÷ Float (tradeable shares) × 100",
    insights: [
      "> 10% is considered elevated short interest",
      "> 20% indicates significant bearish sentiment",
      "High short interest + positive news can trigger short squeeze",
      "Short sellers research companies deeply — high short interest = warning flag",
    ],
    assess(v) {
      const n = pct(v);
      if (n === null) return null;
      if (n < 2) return { quality: "excellent", badge: "Minimal", context: "Very little short selling. Generally bullish signal." };
      if (n < 5) return { quality: "good", badge: "Low", context: "Low short interest. No significant bearish positioning." };
      if (n < 10) return { quality: "fair", badge: "Moderate", context: "Some bears. Monitor but not alarming." };
      if (n < 20) return { quality: "weak", badge: "Elevated", context: "Notable short interest. Bears have a thesis against this stock." };
      return { quality: "poor", badge: "Very High", context: "Heavy short selling. High squeeze potential if thesis fails — or warning of problems." };
    },
  },
  "Short Ratio": {
    formula: "Shares Sold Short ÷ Average Daily Volume (days to cover)",
    insights: [
      "Measures how many days it would take shorts to close all positions",
      "> 5 days suggests shorts are taking significant risk",
      "High days-to-cover = potential fuel for a short squeeze",
      "Used alongside short float for complete picture",
    ],
    assess(v) {
      const n = money(v);
      if (n === null) return null;
      if (n < 1) return { quality: "excellent", badge: "Very Low", context: "Shorts can exit very quickly. Little conviction in the bearish case." };
      if (n < 3) return { quality: "good", badge: "Low", context: "Low days-to-cover. Manageable short interest." };
      if (n < 5) return { quality: "fair", badge: "Moderate", context: "Some short positioning but not extreme." };
      if (n < 10) return { quality: "weak", badge: "High", context: "Elevated days-to-cover. Potential short squeeze fuel." };
      return { quality: "poor", badge: "Very High", context: "Heavy short positioning. Short squeeze risk or sign of serious problems." };
    },
  },
  "Institutional": {
    formula: "Shares held by institutions ÷ Total Outstanding Shares × 100",
    insights: [
      "High institutional ownership (>60%) signals professional conviction",
      "Institutions do deep research — their ownership is a positive signal",
      "Very high ownership (>90%) limits retail opportunity to discover the stock",
      "Sudden institutional selling can cause sharp price drops",
    ],
    assess(v) {
      const n = pct(v);
      if (n === null) return null;
      if (n < 20) return { quality: "weak", badge: "Low", context: "Limited institutional interest. Often seen in small-caps or overlooked stocks." };
      if (n < 50) return { quality: "fair", badge: "Moderate", context: "Moderate institutional presence." };
      if (n < 80) return { quality: "good", badge: "High", context: "Strong institutional conviction. Well-researched stock." };
      return { quality: "excellent", badge: "Very High", context: "Dominant institutional ownership. Strong professional endorsement." };
    },
  },
};

// ── Chart for EPS history ─────────────────────────────────────────────────────

function EpsChart({ data }: { data: EarningsEntry[] }) {
  if (!data.length) return <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", padding: "20px 0" }}>No earnings history available.</div>;

  const chartData = data.slice(-8).map((e) => ({
    label: e.date,
    actual: e.epsActual,
    estimate: e.epsEstimate,
    surprise: e.surprise,
  }));

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-dim)", letterSpacing: "0.08em", marginBottom: 10, textTransform: "uppercase" }}>Quarterly EPS — Actual vs Estimate</div>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={chartData} margin={{ left: -10, right: 10, top: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--ft-border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v.toFixed(2)}`} />
          <RTooltip
            contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", fontFamily: "var(--font-mono)", fontSize: 9 }}
            formatter={(v: number, name: string) => [`$${v?.toFixed(2) ?? "—"}`, name === "actual" ? "Actual" : "Estimate"]}
          />
          <ReferenceLine y={0} stroke="var(--ft-border2)" strokeWidth={1} />
          <Bar dataKey="estimate" fill="rgba(88,166,255,0.25)" stroke="#58a6ff" strokeWidth={1} radius={[2, 2, 0, 0]} name="estimate" />
          <Bar dataKey="actual" radius={[2, 2, 0, 0]} name="actual">
            {chartData.map((d, i) => (
              <Cell
                key={i}
                fill={
                  d.actual == null || d.estimate == null
                    ? "#58a6ff"
                    : d.actual >= d.estimate
                    ? "rgba(63,185,80,0.8)"
                    : "rgba(248,81,73,0.8)"
                }
              />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
        {[{ color: "rgba(88,166,255,0.5)", label: "Estimate" }, { color: "rgba(63,185,80,0.8)", label: "Beat" }, { color: "rgba(248,81,73,0.8)", label: "Miss" }].map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
            <div style={{ width: 10, height: 10, background: l.color, borderRadius: 2 }} />{l.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Analyst trend chart ───────────────────────────────────────────────────────

function AnalystChart({ data }: { data: RecTrend[] }) {
  if (!data.length) return null;
  const chartData = data.slice(0, 5).map((r) => ({
    label: r.period,
    "Strong Buy": r.strongBuy,
    "Buy": r.buy,
    "Hold": r.hold,
    "Sell": r.sell,
    "Strong Sell": r.strongSell,
  }));

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-dim)", letterSpacing: "0.08em", marginBottom: 10, textTransform: "uppercase" }}>Analyst Recommendation Trend</div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={chartData} margin={{ left: -10, right: 10, top: 4, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }} tickLine={false} axisLine={false} />
          <RTooltip contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", fontFamily: "var(--font-mono)", fontSize: 9 }} />
          {["Strong Buy", "Buy", "Hold", "Sell", "Strong Sell"].map((k, i) => (
            <Bar key={k} dataKey={k} stackId="a" fill={["#3fb950", "#22d3ee", "#e3b341", "#f97316", "#f85149"][i]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function StatDrillModal({ label, value, info, earningsHistory = [], recTrend = [], onClose }: Props) {
  const bench = BENCHMARKS[label];
  const assessment = bench?.assess(value) ?? null;
  const showEpsChart = bench?.chart === "eps" && earningsHistory.length > 0;
  const showAnalystChart = bench?.chart === "analyst" && recTrend.length > 0;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--ft-base)", border: "1px solid var(--ft-border2)", width: "100%", maxWidth: 640, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-surface)", flexShrink: 0 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--ft-dim)", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: "20px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Current value + quality badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 36, fontWeight: 700, color: assessment ? QC[assessment.quality] : "var(--ft-text)", letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
            {assessment && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ background: QC[assessment.quality] + "22", border: `1px solid ${QC[assessment.quality]}55`, color: QC[assessment.quality], fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, padding: "3px 10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {assessment.badge}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)", lineHeight: 1.4, maxWidth: 280 }}>{assessment.context}</div>
              </div>
            )}
          </div>

          {/* Formula */}
          {bench?.formula && (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "8px 12px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>Formula</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)" }}>{bench.formula}</div>
            </div>
          )}

          {/* Full explanation */}
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>What This Measures</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", lineHeight: 1.7 }}>{info}</div>
          </div>

          {/* Key insights */}
          {bench?.insights && (
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>Key Insights</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {bench.insights.map((ins, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ color: "var(--ft-accent)", fontSize: 8, marginTop: 2, flexShrink: 0 }}>▸</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)", lineHeight: 1.5 }}>{ins}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Charts */}
          {showEpsChart && <EpsChart data={earningsHistory} />}
          {showAnalystChart && <AnalystChart data={recTrend} />}
          {!bench && !showEpsChart && !showAnalystChart && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", fontStyle: "italic" }}>No benchmark data available for this metric.</div>
          )}

          {/* Quality scale legend */}
          {bench && (
            <div style={{ borderTop: "1px solid var(--ft-border)", paddingTop: 14 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>Quality Scale</div>
              <div style={{ display: "flex", gap: 6 }}>
                {(["poor", "weak", "fair", "good", "excellent"] as Quality[]).map((q) => (
                  <div key={q} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div style={{ height: 4, background: assessment?.quality === q ? QC[q] : QC[q] + "40", width: "100%", borderRadius: 2, transition: "background 0.2s" }} />
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: assessment?.quality === q ? QC[q] : "var(--ft-dim)", letterSpacing: "0.04em", textTransform: "capitalize" }}>{q}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
