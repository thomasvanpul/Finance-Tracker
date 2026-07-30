import { useGetTransactionSummary } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";
import { useWidgetVisibility } from "@/hooks/use-widget-visibility";
import { WidgetManagerButton } from "./MobileWidgetManager";
import { SparkArea } from "./MobileCharts";

interface MockSummary { totalIncome: number; totalExpenses: number; netSavings: number; }

const MOCK_SUMMARIES: MockSummary[] = [
  { totalIncome: 3700, totalExpenses: 1450, netSavings: 2250 },
  { totalIncome: 3700, totalExpenses: 1280, netSavings: 2420 },
  { totalIncome: 4200, totalExpenses: 1650, netSavings: 2550 },
  { totalIncome: 3700, totalExpenses: 980,  netSavings: 2720 },
  { totalIncome: 3700, totalExpenses: 1200, netSavings: 2500 },
  { totalIncome: 3700, totalExpenses: 1130, netSavings: 2570 },
];

const MOCK_6M_INCOME   = MOCK_SUMMARIES.reduce((s, m) => s + m.totalIncome, 0);
const MOCK_6M_EXPENSES = MOCK_SUMMARIES.reduce((s, m) => s + m.totalExpenses, 0);
const MOCK_6M_NET      = MOCK_SUMMARIES.reduce((s, m) => s + m.netSavings, 0);
const MOCK_NET_HISTORY = MOCK_SUMMARIES.map(m => m.netSavings);

const MOCK_CAT_CUR  = [
  { cat: "Food & Drink",  cur: 420 },
  { cat: "Shopping",      cur: 347 },
  { cat: "Entertainment", cur: 148 },
  { cat: "Transport",     cur: 85  },
  { cat: "Subscriptions", cur: 98  },
  { cat: "Health",        cur: 32  },
];
const MOCK_CAT_PREV: Record<string, number> = {
  "Food & Drink": 385, "Shopping": 210, "Entertainment": 160,
  "Transport": 92,     "Subscriptions": 98, "Health": 0,
};
const MOCK_AVG_SAVINGS = Math.round(MOCK_6M_NET / MOCK_SUMMARIES.length);
const MOCK_BEST_IDX    = MOCK_SUMMARIES.reduce((bi, m, i) => m.netSavings > MOCK_SUMMARIES[bi].netSavings ? i : bi, 0);
const MOCK_WORST_IDX   = MOCK_SUMMARIES.reduce((wi, m, i) => m.netSavings < MOCK_SUMMARIES[wi].netSavings ? i : wi, 0);

function getLast6Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

function MonthRow({ month, isLast, mockSummary }: { month: string; isLast: boolean; mockSummary: MockSummary }) {
  const { data } = useGetTransactionSummary({ month });
  const hasRealData = !!data && (data.totalIncome > 0 || data.totalExpenses > 0);
  const display  = hasRealData ? data : mockSummary;
  const hasMock  = !hasRealData;
  const label    = new Date(`${month}-01`).toLocaleString("default", { month: "short", year: "2-digit" });

  const savingsRate    = display.totalIncome > 0 ? (display.netSavings / display.totalIncome) * 100 : 0;
  const rateColor      = savingsRate >= 20 ? "var(--ft-green)" : savingsRate >= 0 ? "var(--ft-accent)" : "var(--ft-red)";
  const now            = new Date();
  const isCurrentMonth = month === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid var(--ft-border)", opacity: hasMock ? 0.75 : 1 }}>
      <div style={{ display: "grid", gridTemplateColumns: "52px 1fr 1fr 1fr 28px", alignItems: "center", gap: 6, padding: "10px 14px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: isCurrentMonth ? "var(--ft-accent)" : "var(--ft-dim)", fontWeight: isCurrentMonth ? 700 : 400 }}>{label}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-green)", fontWeight: 600, textAlign: "right" }}>{formatGbp(display.totalIncome)}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-red)", fontWeight: 600, textAlign: "right" }}>{formatGbp(display.totalExpenses)}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: display.netSavings >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 700, textAlign: "right" }}>{formatGbp(display.netSavings)}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
          <div style={{ fontSize: 7, fontFamily: "var(--font-mono)", color: rateColor, lineHeight: 1 }}>{Math.abs(savingsRate).toFixed(0)}%</div>
          <div style={{ width: 18, height: 3, background: "var(--ft-raised)", borderRadius: 1, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(100, Math.abs(savingsRate))}%`, background: rateColor, borderRadius: 1 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

const REPORTS_WIDGETS = [
  { id: "signals",       label: "Report signals" },
  { id: "mom-waterfall", label: "MoM net savings waterfall" },
  { id: "savings-rate",  label: "Savings rate trend" },
  { id: "income-alloc",  label: "Income allocation" },
  { id: "ytd",           label: "Year to date" },
  { id: "fifty-thirty",  label: "50/30/20 rule" },
  { id: "tax",           label: "Income tax" },
  { id: "year-end",      label: "Year-end outlook" },
  { id: "cat-velocity",  label: "Category MoM velocity" },
  { id: "milestones",    label: "Wealth milestones" },
];

export function MobileReports({ onBack }: { onBack?: () => void }) {
  const months = getLast6Months();
  const { isVisible, toggle, resetAll, visible, hiddenCount } = useWidgetVisibility("reports", REPORTS_WIDGETS);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 16px 0", marginBottom: 12, flexShrink: 0 }}>
        {onBack && (
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-dim)", display: "flex", padding: 12, marginLeft: -12 }}>
            <ChevronLeft size={20} />
          </button>
        )}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-text)" }}>
          Reports
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
            Last 6 months
          </div>
          <WidgetManagerButton widgets={REPORTS_WIDGETS} visible={visible} onToggle={toggle} onReset={resetAll} hiddenCount={hiddenCount} />
        </div>
      </div>

      <div className="mobile-scroll" style={{ flex: 1, overflowY: "auto", padding: "0 16px", paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 16px)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* 6-month summary hero */}
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "16px 18px 14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 4 }}>6M Income</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-green)" }}>{formatGbp(MOCK_6M_INCOME)}</div>
              </div>
              <div style={{ borderLeft: "1px solid var(--ft-border)", paddingLeft: 10 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 4 }}>6M Spent</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-red)" }}>{formatGbp(MOCK_6M_EXPENSES)}</div>
              </div>
              <div style={{ borderLeft: "1px solid var(--ft-border)", paddingLeft: 10 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 4 }}>6M Saved</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-green)" }}>{formatGbp(MOCK_6M_NET)}</div>
              </div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 6 }}>
              Net savings trend
            </div>
            <div style={{ borderRadius: 2, overflow: "hidden", marginBottom: 12 }}>
              <SparkArea data={MOCK_NET_HISTORY} height={36} color="var(--ft-green)" />
            </div>
            {/* Best / Avg / Worst strip */}
            <div style={{ borderTop: "1px solid var(--ft-border)", paddingTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-green)", marginBottom: 2 }}>Best month</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-text)" }}>{formatGbp(MOCK_SUMMARIES[MOCK_BEST_IDX].netSavings)}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                  {new Date(`${getLast6Months()[MOCK_BEST_IDX]}-01`).toLocaleString("default", { month: "short", year: "2-digit" })}
                </div>
              </div>
              <div style={{ borderLeft: "1px solid var(--ft-border)", paddingLeft: 10 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 2 }}>6M Avg</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-text)" }}>{formatGbp(MOCK_AVG_SAVINGS)}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>per month</div>
              </div>
              <div style={{ borderLeft: "1px solid var(--ft-border)", paddingLeft: 10 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-red)", marginBottom: 2 }}>Worst month</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-text)" }}>{formatGbp(MOCK_SUMMARIES[MOCK_WORST_IDX].netSavings)}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                  {new Date(`${getLast6Months()[MOCK_WORST_IDX]}-01`).toLocaleString("default", { month: "short", year: "2-digit" })}
                </div>
              </div>
            </div>
          </div>

          {/* Reports signals */}
          {isVisible("signals") && (() => {
            const rates = MOCK_SUMMARIES.map(s => s.totalIncome > 0 ? (s.netSavings / s.totalIncome) * 100 : 0);
            const expenses = MOCK_SUMMARIES.map(s => s.totalExpenses);
            const signals: Array<{ level: "red" | "amber" | "green"; headline: string; detail: string }> = [];

            const avgRate  = rates.reduce((s, r) => s + r, 0) / rates.length;
            const nowRate  = rates[rates.length - 1];
            const prevRate = rates[rates.length - 2];

            // Baseline: current rate vs 6M avg
            const diff = nowRate - avgRate;
            if (diff > 3) {
              signals.push({ level: "green", headline: `Savings rate ${nowRate.toFixed(1)}% — above 6M avg`, detail: `${diff.toFixed(1)}pp ahead of your ${avgRate.toFixed(1)}% average` });
            } else if (diff < -3) {
              signals.push({ level: "amber", headline: `Savings rate ${nowRate.toFixed(1)}% — below 6M avg`, detail: `${Math.abs(diff).toFixed(1)}pp below your ${avgRate.toFixed(1)}% average` });
            } else {
              signals.push({ level: "green", headline: `Savings rate stable at ${nowRate.toFixed(1)}%`, detail: `Within 3pp of your 6M average of ${avgRate.toFixed(1)}%` });
            }

            // MoM direction
            if (nowRate > prevRate + 2) {
              signals.push({ level: "green", headline: `Rate up ${(nowRate - prevRate).toFixed(1)}pp this month`, detail: `${prevRate.toFixed(1)}% → ${nowRate.toFixed(1)}% — spending fell` });
            } else if (nowRate < prevRate - 2) {
              signals.push({ level: "amber", headline: `Rate down ${(prevRate - nowRate).toFixed(1)}pp this month`, detail: `${prevRate.toFixed(1)}% → ${nowRate.toFixed(1)}% — spending rose` });
            }

            // Volatility
            const avgExp = expenses.reduce((s, v) => s + v, 0) / expenses.length;
            const stdDev = Math.sqrt(expenses.reduce((s, v) => s + Math.pow(v - avgExp, 2), 0) / expenses.length);
            const cv = stdDev / avgExp;
            if (cv > 0.25) {
              signals.push({ level: "amber", headline: "Variable spending pattern", detail: `±${formatGbp(Math.round(stdDev))}/mo deviation — consider tighter budget control` });
            } else if (cv <= 0.12) {
              signals.push({ level: "green", headline: "Highly consistent spending", detail: `±${formatGbp(Math.round(stdDev))}/mo deviation — excellent discipline` });
            }

            if (signals.length === 0) return null;
            const levelColors: Record<string, string> = { red: "var(--ft-red)", amber: "var(--ft-accent)", green: "var(--ft-green)" };
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ padding: "7px 14px", borderBottom: "1px solid var(--ft-border)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Signals</span>
                </div>
                {signals.slice(0, 3).map((sig, i) => {
                  const col = levelColors[sig.level];
                  return (
                    <div key={i} style={{ padding: "8px 14px", borderBottom: i < signals.length - 1 ? "1px solid var(--ft-border)" : "none", display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: col, flexShrink: 0, marginTop: 3 }} />
                      <div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: col }}>{sig.headline}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>{sig.detail}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* MoM net savings waterfall */}
          {isVisible("mom-waterfall") && (() => {
            const savings = MOCK_NET_HISTORY;
            const deltas  = savings.slice(1).map((v, i) => v - savings[i]);
            const labels  = getLast6Months().slice(1).map(m => new Date(`${m}-01`).toLocaleString("default", { month: "short" }));
            const maxAbs  = Math.max(...deltas.map(d => Math.abs(d)), 1);
            const posCount = deltas.filter(d => d > 0).length;

            const W = 280, H = 82, PX = 6, PY = 8;
            const midY   = PY + 30;
            const topH   = midY - PY;
            const botH   = H - midY - PY - 14;
            const barSlot = (W - PX * 2) / deltas.length;
            const barW   = barSlot * 0.62;

            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    MoM net change
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                    {posCount}/{deltas.length} months up
                  </div>
                </div>
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
                  {/* Zero baseline */}
                  <line x1={PX} y1={midY} x2={W - PX} y2={midY} stroke="var(--ft-border)" strokeWidth="0.8" />
                  <text x={PX + 2} y={midY - 2} fontFamily="monospace" fontSize="6" fill="var(--ft-dim)" opacity="0.5" dominantBaseline="auto">0</text>
                  {deltas.map((delta, i) => {
                    const cx    = PX + i * barSlot + barSlot / 2;
                    const x     = cx - barW / 2;
                    const color = delta >= 0 ? "var(--ft-green)" : "var(--ft-red)";
                    const avail = delta >= 0 ? topH : botH;
                    const bh    = Math.max(3, (Math.abs(delta) / maxAbs) * avail);
                    const y     = delta >= 0 ? midY - bh : midY;
                    const lbY   = delta >= 0 ? y - 2 : y + bh + 2;
                    return (
                      <g key={i}>
                        <rect x={x} y={y} width={barW} height={bh} fill={color} rx="2" opacity="0.82" />
                        <text x={cx} y={lbY} fontFamily="monospace" fontSize="6.5" fill={color}
                          textAnchor="middle" dominantBaseline={delta >= 0 ? "auto" : "hanging"}>
                          {delta >= 0 ? "+" : "−"}{Math.abs(delta)}
                        </text>
                        <text x={cx} y={H + 1} fontFamily="monospace" fontSize="7" fill="var(--ft-dim)"
                          textAnchor="middle" dominantBaseline="hanging">{labels[i]}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            );
          })()}

          {/* Savings rate trend */}
          {isVisible("savings-rate") && (() => {
            const rates = MOCK_SUMMARIES.map(s => s.totalIncome > 0 ? (s.netSavings / s.totalIncome) * 100 : 0);
            const labels = getLast6Months().map(m => new Date(`${m}-01`).toLocaleString("default", { month: "short" }));
            const TARGET = 20;
            const W = 280, H = 72, PAD = 6;
            const minR = Math.min(...rates, 0), maxR = Math.max(...rates, TARGET + 5);
            const range = maxR - minR || 1;
            const toX = (i: number) => PAD + (i / (rates.length - 1)) * (W - PAD * 2);
            const toY = (v: number) => PAD + (1 - (v - minR) / range) * (H - PAD * 2);
            const pts = rates.map((r, i): [number, number] => [toX(i), toY(r)]);
            const targetY = toY(TARGET);
            const linePts = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
            const areaPath = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)} L${pts.slice(1).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} L${pts[pts.length-1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`;
            const avgRate = rates.reduce((s, r) => s + r, 0) / rates.length;
            const currentRate = rates[rates.length - 1];
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Savings rate trend
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>avg {avgRate.toFixed(0)}%</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: currentRate >= TARGET ? "var(--ft-green)" : "var(--ft-accent)" }}>
                      now {currentRate.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
                  <defs>
                    <linearGradient id="sr-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--ft-green)" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="var(--ft-green)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {/* Target line at 20% */}
                  <line x1={PAD} y1={targetY} x2={W - PAD} y2={targetY} stroke="var(--ft-accent)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
                  <text x={W - PAD} y={targetY - 3} fontFamily="monospace" fontSize="7" fill="var(--ft-accent)" textAnchor="end" opacity="0.7">20%</text>
                  {/* Area fill */}
                  <path d={areaPath} fill="url(#sr-grad)" />
                  {/* Line */}
                  <polyline points={linePts} fill="none" stroke="var(--ft-green)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                  {/* Dots */}
                  {pts.map(([x, y], i) => (
                    <circle key={i} cx={x} cy={y} r="2.5" fill="var(--ft-green)" opacity={i === pts.length - 1 ? 1 : 0.5} />
                  ))}
                  {/* X labels */}
                  {pts.map(([x], i) => (
                    <text key={i} x={x} y={H + 1} fontFamily="monospace" fontSize="7" fill="var(--ft-dim)" textAnchor="middle" dominantBaseline="hanging">
                      {labels[i]}
                    </text>
                  ))}
                </svg>
              </div>
            );
          })()}

          {/* Income allocation breakdown for latest month */}
          {isVisible("income-alloc") && (() => {
            const latest = MOCK_SUMMARIES[MOCK_SUMMARIES.length - 1];
            const latestLabel = new Date(`${months[months.length - 1]}-01`).toLocaleString("default", { month: "short", year: "2-digit" });
            const housing = Math.round(latest.totalExpenses * 0.50);
            const food    = Math.round(latest.totalExpenses * 0.27);
            const other   = latest.totalExpenses - housing - food;
            const segments = [
              { label: "Housing", amount: housing,           color: "var(--ft-red)",    opacity: 0.85 },
              { label: "Food",    amount: food,              color: "var(--ft-red)",    opacity: 0.55 },
              { label: "Other",   amount: other,             color: "#F59E0B",          opacity: 0.75 },
              { label: "Saved",   amount: latest.netSavings, color: "var(--ft-green)",  opacity: 0.85 },
            ];
            const total = latest.totalIncome;
            const savingsRate = ((latest.netSavings / total) * 100).toFixed(1);
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Income allocation · {latestLabel}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>{formatGbp(total)}</div>
                </div>
                {/* Stacked allocation bar */}
                <div style={{ display: "flex", height: 22, borderRadius: 2, overflow: "hidden", gap: 1.5, marginBottom: 12 }}>
                  {segments.map(s => (
                    <div key={s.label} style={{ width: `${(s.amount / total) * 100}%`, background: s.color, opacity: s.opacity }} />
                  ))}
                </div>
                {/* Segment breakdown */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                  {segments.map(s => (
                    <div key={s.label}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                        <div style={{ width: 6, height: 6, borderRadius: 1, background: s.color, opacity: s.opacity, flexShrink: 0 }} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</span>
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: s.color }}>{formatGbp(s.amount)}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 1 }}>
                        {((s.amount / total) * 100).toFixed(0)}%
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Savings rate
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 60, height: 3, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, parseFloat(savingsRate))}%`, background: parseFloat(savingsRate) >= 20 ? "var(--ft-green)" : "var(--ft-accent)", borderRadius: 2 }} />
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: parseFloat(savingsRate) >= 20 ? "var(--ft-green)" : "var(--ft-accent)" }}>
                      {savingsRate}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* YTD summary */}
          {isVisible("ytd") && (() => {
            const now = new Date();
            const monthsElapsed = now.getMonth() + 1;
            const ytdIncome   = MOCK_SUMMARIES.slice(-monthsElapsed).reduce((s, m) => s + m.totalIncome, 0);
            const ytdExpenses = MOCK_SUMMARIES.slice(-monthsElapsed).reduce((s, m) => s + m.totalExpenses, 0);
            const ytdNet      = MOCK_SUMMARIES.slice(-monthsElapsed).reduce((s, m) => s + m.netSavings, 0);
            const annualRate  = monthsElapsed > 0 ? ytdNet / monthsElapsed * 12 : 0;
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "13px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Year to date · {now.getFullYear()}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>{monthsElapsed}M elapsed</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "10px 12px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>YTD income</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-green)" }}>{formatGbp(ytdIncome)}</div>
                  </div>
                  <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "10px 12px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>YTD spent</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-red)" }}>{formatGbp(ytdExpenses)}</div>
                  </div>
                  <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "10px 12px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>YTD saved</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-accent)" }}>{formatGbp(ytdNet)}</div>
                  </div>
                  <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "10px 12px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Annual pace</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-text)" }}>{formatGbp(annualRate)}</div>
                  </div>
                </div>
                <div style={{ height: 3, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(monthsElapsed / 12) * 100}%`, background: "var(--ft-accent)", borderRadius: 2 }} />
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 4 }}>
                  {(monthsElapsed / 12 * 100).toFixed(0)}% through {now.getFullYear()} · {12 - monthsElapsed}M remaining
                </div>
              </div>
            );
          })()}

          {/* 50/30/20 rule compliance */}
          {isVisible("fifty-thirty") && (() => {
            const MOCK_GROSS = 44200;
            const PA = 12570, BRT = 50270, NI_PT = 12576, NI_UEL = 50268;
            const taxable = Math.max(0, MOCK_GROSS - PA);
            const inBasic = Math.min(taxable, BRT - PA);
            const inHigher = Math.max(0, taxable - (BRT - PA));
            const incomeTax = inBasic * 0.20 + inHigher * 0.40;
            const niEarnings = Math.max(0, MOCK_GROSS - NI_PT);
            const niLower = Math.min(niEarnings, NI_UEL - NI_PT) * 0.08;
            const niUpper = Math.max(0, niEarnings - (NI_UEL - NI_PT)) * 0.02;
            const ni = niLower + niUpper;
            const takeHome = (MOCK_GROSS - incomeTax - ni) / 12;

            const latest = MOCK_SUMMARIES[MOCK_SUMMARIES.length - 1];
            const needs   = latest.totalExpenses * 0.55;
            const wants   = latest.totalExpenses * 0.45;
            const saved   = latest.netSavings;

            const rules: Array<{ label: string; actual: number; target: number; color: string }> = [
              { label: "Needs",   actual: (needs / takeHome) * 100,  target: 50, color: "#3B82F6" },
              { label: "Wants",   actual: (wants / takeHome) * 100,  target: 30, color: "#38BDF8" },
              { label: "Savings", actual: (saved / takeHome) * 100,  target: 20, color: "var(--ft-green)" },
            ];

            // Score: 0-100 based on proximity to targets
            const score = Math.round(rules.reduce((s, r) => {
              const delta = Math.abs(r.actual - r.target);
              return s + Math.max(0, 33 - delta * 1.2);
            }, 0) / 99 * 100);
            const scoreColor = score >= 70 ? "var(--ft-green)" : score >= 45 ? "var(--ft-accent)" : "var(--ft-red)";

            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    50/30/20 rule
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: scoreColor, fontVariantNumeric: "tabular-nums" }}>
                    {score}% adherent
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {rules.map(r => {
                    const diff = r.actual - r.target;
                    const isOver = diff > 0;
                    const barColor = Math.abs(diff) < 5 ? "var(--ft-green)" : Math.abs(diff) < 15 ? "var(--ft-accent)" : "var(--ft-red)";
                    return (
                      <div key={r.label}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ width: 5, height: 5, borderRadius: 1, background: r.color, flexShrink: 0 }} />
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-text)" }}>{r.label}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>target {r.target}%</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: barColor, fontVariantNumeric: "tabular-nums" }}>
                              {r.actual.toFixed(0)}%
                            </span>
                            {Math.abs(diff) > 1 && (
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: barColor, fontVariantNumeric: "tabular-nums" }}>
                                {isOver ? "+" : ""}{diff.toFixed(0)}pp
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ height: 4, background: "var(--ft-raised)", borderRadius: 2, position: "relative", overflow: "visible" }}>
                          <div style={{ position: "absolute", left: `${Math.min(r.target, 100)}%`, top: -1, width: 1, height: 6, background: "var(--ft-border)", opacity: 0.8 }} />
                          <div style={{ height: "100%", width: `${Math.min(r.actual, 100)}%`, background: r.color, borderRadius: 2, opacity: 0.8 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 9, paddingTop: 8, borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>
                  Based on {formatGbp(Math.round(takeHome))}/mo take-home · allocate 50% needs · 30% wants · 20% savings
                </div>
              </div>
            );
          })()}

          {/* Income tax efficiency */}
          {isVisible("tax") && (() => {
            const MOCK_GROSS   = 44200;
            const PA           = 12570;   // Personal Allowance
            const BRT_LIMIT    = 50270;   // Basic rate threshold
            const NI_PT        = 12576;   // NI Primary Threshold
            const NI_UEL       = 50268;   // NI Upper Earnings Limit
            const taxable      = Math.max(0, MOCK_GROSS - PA);
            const inBasic      = Math.min(taxable, BRT_LIMIT - PA);
            const inHigher     = Math.max(0, taxable - (BRT_LIMIT - PA));
            const incomeTax    = inBasic * 0.20 + inHigher * 0.40;
            const niEarnings   = Math.max(0, MOCK_GROSS - NI_PT);
            const niLower      = Math.min(niEarnings, NI_UEL - NI_PT) * 0.08;
            const niUpper      = Math.max(0, niEarnings - (NI_UEL - NI_PT)) * 0.02;
            const ni           = niLower + niUpper;
            const totalDed     = incomeTax + ni;
            const takeHome     = MOCK_GROSS - totalDed;
            const effRate      = (totalDed / MOCK_GROSS) * 100;
            const toHigher     = BRT_LIMIT - MOCK_GROSS;
            const now0         = new Date();
            const taxYear      = `${now0.getFullYear()}/${String(now0.getFullYear() + 1).slice(2)}`;
            // Bracket bar proportions (scale to 120% of basic rate limit)
            const scale        = BRT_LIMIT * 1.2;
            const paPct        = (PA / scale) * 100;
            const basicPct     = ((BRT_LIMIT - PA) / scale) * 100;
            const markerPct    = Math.min(100, (MOCK_GROSS / scale) * 100);
            const effColor     = effRate < 25 ? "var(--ft-green)" : "var(--ft-accent)";
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Income tax · {taxYear}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: effColor }}>
                    {effRate.toFixed(1)}% effective
                  </div>
                </div>
                {/* Bracket position bar with income marker */}
                <div style={{ marginBottom: 4, position: "relative" }}>
                  <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${paPct}%`, background: "var(--ft-green)", opacity: 0.55 }} />
                    <div style={{ width: `${basicPct}%`, background: "var(--ft-accent)", opacity: 0.55 }} />
                    <div style={{ flex: 1, background: "var(--ft-red)", opacity: 0.35 }} />
                  </div>
                  {/* Income position marker */}
                  <div style={{ position: "absolute", left: `${markerPct}%`, top: 0, width: 2, height: 8, background: "var(--ft-text)", transform: "translateX(-50%)", borderRadius: 1 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 6, color: "var(--ft-green)" }}>ALLOWANCE</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 6, color: "var(--ft-accent)" }}>BASIC 20%</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 6, color: "var(--ft-red)", opacity: 0.7 }}>HIGHER 40%</span>
                </div>
                {/* 4-stat grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                  {[
                    { label: "Gross",     value: formatGbp(MOCK_GROSS),           color: "var(--ft-text)" },
                    { label: "Inc Tax",   value: formatGbp(Math.round(incomeTax)), color: "var(--ft-red)" },
                    { label: "NI",        value: formatGbp(Math.round(ni)),        color: "var(--ft-red)" },
                    { label: "Take-home", value: formatGbp(Math.round(takeHome)),  color: "var(--ft-green)" },
                  ].map(s => (
                    <div key={s.label} style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "7px 8px" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{s.label}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
                    </div>
                  ))}
                </div>
                {toHigher > 0 && (
                  <div style={{ paddingTop: 8, borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                    <span style={{ color: "var(--ft-accent)", fontWeight: 700 }}>{formatGbp(Math.round(toHigher))}</span> to higher rate threshold (£50,270)
                    <span style={{ marginLeft: 5, color: "var(--ft-dim)" }}>· basic rate band</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Year-end outlook */}
          {isVisible("year-end") && (() => {
            const now = new Date();
            const monthsElapsed = now.getMonth() + 1;
            const ytdNet   = MOCK_SUMMARIES.slice(-monthsElapsed).reduce((s, m) => s + m.netSavings, 0);
            const avgMonthly = monthsElapsed > 0 ? ytdNet / monthsElapsed : 0;
            const remainingMonths = 12 - monthsElapsed;
            const projectedFull  = ytdNet + avgMonthly * remainingMonths;
            const ANNUAL_TARGET  = 30000;
            const pctToTarget    = Math.min(100, (projectedFull / ANNUAL_TARGET) * 100);
            const onTrack        = projectedFull >= ANNUAL_TARGET;
            const gap            = Math.abs(projectedFull - ANNUAL_TARGET);
            const statusColor    = onTrack ? "var(--ft-green)" : projectedFull >= ANNUAL_TARGET * 0.85 ? "var(--ft-accent)" : "var(--ft-red)";

            const rates = MOCK_SUMMARIES.map(s => s.totalIncome > 0 ? (s.netSavings / s.totalIncome) * 100 : 0);
            const aboveTarget = rates.filter(r => r >= 20).length;
            let streak = 0;
            for (let i = rates.length - 1; i >= 0; i--) {
              if (rates[i] >= 20) streak++;
              else break;
            }

            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Year-end outlook · {now.getFullYear()}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: statusColor, letterSpacing: "0.08em" }}>
                    {onTrack ? "ON TRACK" : "BELOW TARGET"}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "9px 10px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>Projected savings</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: statusColor }}>{formatGbp(Math.round(projectedFull))}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", marginTop: 2 }}>at current pace</div>
                  </div>
                  <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "9px 10px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>Annual target</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-dim)" }}>{formatGbp(ANNUAL_TARGET)}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: statusColor, marginTop: 2 }}>
                      {onTrack ? `+${formatGbp(Math.round(gap))} surplus` : `${formatGbp(Math.round(gap))} shortfall`}
                    </div>
                  </div>
                </div>
                <div style={{ marginBottom: 9 }}>
                  <div style={{ height: 5, background: "var(--ft-raised)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pctToTarget}%`, background: statusColor, borderRadius: 3 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>£0</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, color: statusColor }}>{pctToTarget.toFixed(0)}% of target</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>{formatGbp(ANNUAL_TARGET)}</span>
                  </div>
                </div>
                <div style={{ borderTop: "1px solid var(--ft-border)", paddingTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>20%+ streak</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: streak > 0 ? "var(--ft-green)" : "var(--ft-dim)" }}>{streak}M</div>
                  </div>
                  <div style={{ borderLeft: "1px solid var(--ft-border)", paddingLeft: 10 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Above 20%</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)" }}>{aboveTarget}/{rates.length}M</div>
                  </div>
                  <div style={{ borderLeft: "1px solid var(--ft-border)", paddingLeft: 10 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Rem. months</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)" }}>{remainingMonths}</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Category MoM velocity table */}
          {isVisible("cat-velocity") && (() => {
            const rows = MOCK_CAT_CUR.map(({ cat, cur }) => {
              const prev  = MOCK_CAT_PREV[cat] ?? 0;
              const delta = cur - prev;
              const pct   = prev > 0 ? (delta / prev) * 100 : (cur > 0 ? 100 : 0);
              return { cat, cur, prev, delta, pct };
            }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 52px 52px 56px", padding: "8px 14px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-raised)" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Category</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", textAlign: "right" }}>Prev</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", textAlign: "right" }}>Cur</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", textAlign: "right" }}>MoM</div>
                </div>
                {rows.map((r, i) => {
                  const isLast  = i === rows.length - 1;
                  const up      = r.delta > 0;
                  const flat    = r.delta === 0;
                  const color   = flat ? "var(--ft-dim)" : up ? "var(--ft-red)" : "var(--ft-green)";
                  const arrow   = flat ? "·" : up ? "▲" : "▼";
                  return (
                    <div key={r.cat} style={{ display: "grid", gridTemplateColumns: "1fr 52px 52px 56px", padding: "7px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)", alignItems: "center" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.cat}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textAlign: "right" }}>£{r.prev}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, color: "var(--ft-text)", textAlign: "right" }}>£{r.cur}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color, textAlign: "right" }}>
                        {arrow} {Math.abs(r.pct).toFixed(0)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* 6-month grouped bar chart */}
          {(() => {
            const maxV   = Math.max(...MOCK_SUMMARIES.map(s => s.totalIncome), 1);
            const H      = 80;
            const labels = getLast6Months().map(m => new Date(`${m}-01`).toLocaleString("default", { month: "short" }));
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 10px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 10 }}>
                  Income vs spend · 6M
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: H }}>
                  {MOCK_SUMMARIES.map((s, i) => {
                    const incH = Math.max(2, Math.round((s.totalIncome  / maxV) * (H - 16)));
                    const expH = Math.max(2, Math.round((s.totalExpenses / maxV) * (H - 16)));
                    const isLast = i === MOCK_SUMMARIES.length - 1;
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                        <div style={{ display: "flex", gap: 1, alignItems: "flex-end", width: "100%" }}>
                          <div style={{ flex: 1, height: incH, background: "var(--ft-green)", borderRadius: "2px 2px 0 0", opacity: isLast ? 1 : 0.55 }} />
                          <div style={{ flex: 1, height: expH, background: "var(--ft-red)",   borderRadius: "2px 2px 0 0", opacity: isLast ? 1 : 0.55 }} />
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: isLast ? "var(--ft-accent)" : "var(--ft-dim)", marginTop: 4 }}>{labels[i]}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--ft-border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: "var(--ft-green)", opacity: 0.7 }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>INCOME</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: "var(--ft-red)", opacity: 0.7 }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>SPEND</span>
                  </div>
                </div>
              </div>
            );
          })()}

          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
            {/* Column headers */}
            <div style={{ display: "grid", gridTemplateColumns: "52px 1fr 1fr 1fr 28px", gap: 6, padding: "9px 14px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-raised)" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Month</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-green)", textAlign: "right" }}>In</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-red)", textAlign: "right" }}>Out</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", textAlign: "right" }}>Net</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", textAlign: "right" }}>%</div>
            </div>
            {months.map((m, i) => (
              <MonthRow key={m} month={m} isLast={i === months.length - 1} mockSummary={MOCK_SUMMARIES[i]} />
            ))}
          </div>

          {/* Savings milestone tracker */}
          {isVisible("milestones") && (() => {
            const MOCK_NET_WORTH = 18200;
            const avgMonthly = MOCK_AVG_SAVINGS;
            const MILESTONES = [5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
            const upcoming = MILESTONES.filter(m => m > MOCK_NET_WORTH).slice(0, 4);
            const passed = MILESTONES.filter(m => m <= MOCK_NET_WORTH);
            if (upcoming.length === 0) return null;
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 3, overflow: "hidden", opacity: 0.85 }}>
                <div style={{ padding: "9px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Wealth milestones</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-green)" }}>{passed.length} reached</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {passed.slice(-2).map((m) => (
                    <div key={m} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid var(--ft-border)", opacity: 0.5 }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="var(--ft-green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-green)", flex: 1 }}>{formatGbp(m)}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-green)" }}>reached</span>
                    </div>
                  ))}
                  {upcoming.map((m, i) => {
                    const monthsLeft = avgMonthly > 0 ? Math.ceil((m - MOCK_NET_WORTH) / avgMonthly) : 9999;
                    const yrs = Math.floor(monthsLeft / 12);
                    const mos = monthsLeft % 12;
                    const eta = yrs > 0 ? `${yrs}y ${mos}m` : `${mos}m`;
                    const progressToThis = MOCK_NET_WORTH / m;
                    const isNext = i === 0;
                    return (
                      <div key={m} style={{ padding: "9px 14px", borderBottom: i < upcoming.length - 1 ? "1px solid var(--ft-border)" : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isNext ? 5 : 0 }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: isNext ? 12 : 10, fontWeight: isNext ? 700 : 400, color: isNext ? "var(--ft-text)" : "var(--ft-dim)" }}>{formatGbp(m)}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: isNext ? "var(--ft-accent)" : "var(--ft-dim)" }}>{eta}</span>
                        </div>
                        {isNext && (
                          <div style={{ height: 3, background: "var(--ft-raised)", borderRadius: 1.5, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(progressToThis * 100, 100)}%`, background: "var(--ft-accent)", borderRadius: 1.5 }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ padding: "7px 14px", borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                  at {formatGbp(avgMonthly)}/mo avg savings · linear projection
                </div>
              </div>
            );
          })()}

          <a href="/reports" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", textDecoration: "none" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Full reports</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)" }}>→</span>
          </a>
        </div>
      </div>
    </div>
  );
}
