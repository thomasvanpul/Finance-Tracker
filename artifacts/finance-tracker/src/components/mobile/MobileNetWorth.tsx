import { useGetDashboard } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { ChevronLeft } from "lucide-react";
import { SparkArea, DonutChart } from "./MobileCharts";
import { useWidgetVisibility } from "@/hooks/use-widget-visibility";
import { WidgetManagerButton } from "./MobileWidgetManager";

const ACC_COLORS = ["#3B82F6", "#F97316", "#4ADE80", "#10B981", "#F59E0B", "#EF4444", "#06B6D4"];

type AccType = "current" | "savings" | "investment" | "crypto" | "other";
const ACC_TYPE_COLORS: Record<AccType, string> = {
  current:    "#3B82F6",
  savings:    "#10B981",
  investment: "#F4A21E",
  crypto:     "#F97316",
  other:      "#6B7280",
};

function classifyAccount(name: string): AccType {
  const n = name.toLowerCase();
  if (n.includes("current") || n.includes("monzo") || n.includes("revolut") || n.includes("chase")) return "current";
  if (n.includes("sav") || n.includes("isa") || n.includes("barclays")) return "savings";
  if (n.includes("invest") || n.includes("vanguard") || n.includes("trading")) return "investment";
  if (n.includes("coin") || n.includes("crypto") || n.includes("btc") || n.includes("eth")) return "crypto";
  return "other";
}

const MOCK_MILESTONES = [
  { label: "£5K",   target: 5000,   achieved: true,  date: "Feb 2025" },
  { label: "£10K",  target: 10000,  achieved: true,  date: "May 2025" },
  { label: "£15K",  target: 15000,  achieved: true,  date: "Jan 2026" },
  { label: "£20K",  target: 20000,  achieved: false,  date: null },
  { label: "£25K",  target: 25000,  achieved: false, date: null },
  { label: "£50K",  target: 50000,  achieved: false, date: null },
];

function monthOffset(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MOCK_NW = {
  netWorth:     18200,
  totalCash:    16400,
  netLiquidity: 18200,
  monthlyHistory: [
    { month: monthOffset(-6), netSavings: 2250 },
    { month: monthOffset(-5), netSavings: 2420 },
    { month: monthOffset(-4), netSavings: -180 },
    { month: monthOffset(-3), netSavings: 2720 },
    { month: monthOffset(-2), netSavings: 2500 },
    { month: monthOffset(-1), netSavings: 2480 },
    { month: monthOffset(0),  netSavings: 2570 },
  ],
  accountBreakdown: [
    { id: "nb1", name: "Monzo Current",    currency: "GBP", gbpEquivalent: 3420  },
    { id: "nb2", name: "Barclays Savings", currency: "GBP", gbpEquivalent: 12400 },
    { id: "nb3", name: "Wise EUR",         currency: "EUR", gbpEquivalent: 1580  },
    { id: "nb4", name: "Coinbase",         currency: "USD", gbpEquivalent: 800   },
  ],
};

const NETWORTH_WIDGETS = [
  { id: "history",   label: "Monthly savings history" },
  { id: "signals",   label: "Net worth signals" },
  { id: "accounts",  label: "Account breakdown" },
  { id: "liquidity", label: "Liquidity ladder" },
];

export function MobileNetWorth({ onBack }: { onBack?: () => void }) {
  const { privacy } = usePrivacy();
  const { data, isLoading } = useGetDashboard();
  const mask = (v: number) => privacy ? "••••••" : formatGbp(v);

  const hasMockData     = data === undefined || (data?.netWorth ?? 0) === 0;
  const history         = hasMockData ? MOCK_NW.monthlyHistory   : (data?.monthlyHistory ?? []);
  const accounts        = hasMockData ? MOCK_NW.accountBreakdown : (data?.accountBreakdown ?? []);
  const displayNetWorth  = hasMockData ? MOCK_NW.netWorth     : (data?.netWorth ?? 0);
  const displayCash      = hasMockData ? MOCK_NW.totalCash    : (data?.totalCash ?? 0);
  const displayLiquidity = hasMockData ? MOCK_NW.netLiquidity : (data?.netLiquidity ?? 0);
  const showStats        = hasMockData || !!data;

  const savings     = history.map(h => h.netSavings);
  const maxSav      = savings.length > 0 ? Math.max(...savings.map(Math.abs), 1) : 1;
  const savingsTotal = savings.reduce((s, v) => s + v, 0);
  const savingsAvg   = savings.length > 0 ? Math.round(savingsTotal / savings.length) : 0;
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].netSavings > 0) streak++;
    else break;
  }
  const prevMonth = history.length >= 2 ? history[history.length - 2] : null;
  const currMonth = history.length >= 1 ? history[history.length - 1] : null;
  const nwChange  = (currMonth && prevMonth) ? currMonth.netSavings - prevMonth.netSavings : null;
  const totalAcc  = accounts.reduce((s, a) => s + a.gbpEquivalent, 0);

  const MOCK_MONTHLY_EXPENSES = 1130;
  const fireTarget   = hasMockData ? MOCK_MONTHLY_EXPENSES * 12 * 25 : 0;
  const oneYearProj  = displayNetWorth + savingsAvg * 12;
  const fiveYearProj = displayNetWorth + savingsAvg * 60;
  const monthsToFire = (savingsAvg > 0 && fireTarget > displayNetWorth) ? Math.ceil((fireTarget - displayNetWorth) / savingsAvg) : null;
  const yearsToFire  = monthsToFire !== null ? (monthsToFire / 12).toFixed(1) : null;
  const firePct      = fireTarget > 0 ? Math.min(100, (displayNetWorth / fireTarget) * 100) : 0;

  const { isVisible, toggle, resetAll, visible, hiddenCount } = useWidgetVisibility("networth", NETWORTH_WIDGETS);

  // Compute cumulative net worth trajectory by back-filling from current value
  const cumNW: number[] = [];
  if (history.length > 0) {
    let v = displayNetWorth;
    for (let i = history.length - 1; i >= 0; i--) {
      cumNW.unshift(v);
      v -= history[i].netSavings;
    }
  }

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
          Net Worth
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {hasMockData && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
              preview
            </div>
          )}
          <WidgetManagerButton widgets={NETWORTH_WIDGETS} visible={visible} onToggle={toggle} onReset={resetAll} hiddenCount={hiddenCount} />
        </div>
      </div>

      <div className="mobile-scroll" style={{ flex: 1, overflowY: "auto", padding: "0 16px", paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 16px)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: hasMockData ? 0.85 : 1, transition: "opacity 0.12s" }}>

          {/* Hero card */}
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ padding: "22px 22px 18px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8 }}>
                Total net worth
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(24px, 8vw, 34px)", fontWeight: 700, color: "var(--ft-text)", letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 8 }}>
                {mask(displayNetWorth)}
              </div>
              {nwChange !== null && !privacy && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: nwChange >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                  {nwChange >= 0 ? "+" : ""}{formatGbp(nwChange)} vs last month
                </div>
              )}
              {cumNW.length >= 2 && (
                <div style={{ marginTop: 14, borderRadius: 2, overflow: "hidden" }}>
                  <SparkArea data={cumNW} height={38} color="var(--ft-accent)" />
                </div>
              )}
            </div>
            {showStats && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid var(--ft-border)" }}>
                <div style={{ padding: "12px 22px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 4 }}>Cash</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: "var(--ft-green)" }}>{mask(displayCash)}</div>
                </div>
                <div style={{ padding: "12px 22px", borderLeft: "1px solid var(--ft-border)" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 4 }}>Liquidity</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: "var(--ft-accent)" }}>{mask(displayLiquidity)}</div>
                </div>
              </div>
            )}
          </div>

          {/* Monthly savings bar chart */}
          {isVisible("history") && history.length > 0 && (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "14px 16px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Monthly savings</div>
                {streak >= 2 && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: "color-mix(in srgb, var(--ft-green) 14%, transparent)", color: "var(--ft-green)", letterSpacing: "0.04em" }}>
                    {streak}mo streak
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 110 }}>
                {history.slice(-12).map((h, i, arr) => {
                  const val    = h.netSavings;
                  const pct    = Math.max(4, (Math.abs(val) / maxSav) * 100);
                  const pos    = val >= 0;
                  const isCurr = i === arr.length - 1;
                  const label  = new Date(`${h.month}-01`).toLocaleString("default", { month: "short" });
                  return (
                    <div key={h.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <div style={{
                        width: "100%", height: `${pct}%`,
                        background: pos ? (isCurr ? "var(--ft-accent)" : "var(--ft-green)") : "var(--ft-red)",
                        borderRadius: "3px 3px 0 0",
                        opacity: isCurr ? 1 : 0.55,
                        minHeight: 3,
                      }} />
                      {(i % 2 === 0 || isCurr) && (
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: isCurr ? "var(--ft-accent)" : "var(--ft-dim)", whiteSpace: "nowrap" }}>{label}</div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Summary strip */}
              <div style={{ borderTop: "1px solid var(--ft-border)", marginTop: 10, padding: "10px 0 12px", display: "flex" }}>
                <div style={{ flex: 1, textAlign: "center", borderRight: "1px solid var(--ft-border)" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3 }}>
                    {savings.length}M total
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: savingsTotal >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                    {savingsTotal >= 0 ? "+" : "−"}{formatGbp(Math.abs(savingsTotal))}
                  </div>
                </div>
                <div style={{ flex: 1, textAlign: "center", borderRight: "1px solid var(--ft-border)" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3 }}>
                    Avg / mo
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: savingsAvg >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                    {savingsAvg >= 0 ? "+" : "−"}{formatGbp(Math.abs(savingsAvg))}
                  </div>
                </div>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3 }}>
                    +12M est.
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-accent)" }}>
                    {mask(displayNetWorth + savingsAvg * 12)}
                  </div>
                </div>
              </div>
              {/* Momentum strip */}
              {savings.length >= 4 && (() => {
                const recent3Avg = Math.round(savings.slice(-3).reduce((s, v) => s + v, 0) / 3);
                const slice6     = savings.slice(-Math.min(6, savings.length));
                const avg6       = Math.round(slice6.reduce((s, v) => s + v, 0) / slice6.length);
                const momentum   = avg6 !== 0 ? ((recent3Avg - avg6) / Math.abs(avg6)) * 100 : 0;
                const dailyRate  = Math.round(recent3Avg / 30.44);
                const posMos     = savings.filter(v => v > 0).length;
                const consistency = Math.round((posMos / savings.length) * 100);
                const accel      = recent3Avg > avg6;
                const mcol       = accel ? "var(--ft-green)" : "var(--ft-red)";
                return (
                  <div style={{ borderTop: "1px solid var(--ft-border)", padding: "8px 16px 10px", display: "flex", gap: 6, alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>3M avg</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: recent3Avg >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                        {recent3Avg >= 0 ? "+" : "−"}{formatGbp(Math.abs(recent3Avg))}
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Momentum</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: mcol }}>
                        {accel ? "↑" : "↓"} {Math.abs(momentum).toFixed(0)}%
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Daily rate</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-accent)" }}>
                        +{formatGbp(dailyRate)}/d
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Consistency</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: consistency >= 80 ? "var(--ft-green)" : consistency >= 60 ? "var(--ft-accent)" : "var(--ft-red)" }}>
                        {consistency}%
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Net Worth signals */}
          {isVisible("signals") && (() => {
            const signals: Array<{ level: "red" | "amber" | "green"; headline: string; detail: string }> = [];
            const nextMilestone = MOCK_MILESTONES.find(m => !m.achieved);
            const monthsToMilestone = nextMilestone && savingsAvg > 0
              ? Math.ceil((nextMilestone.target - displayNetWorth) / savingsAvg)
              : null;

            // FIRE progress
            if (firePct > 0) {
              const lvl: "red" | "amber" | "green" = firePct >= 30 ? "green" : firePct >= 10 ? "amber" : "red";
              signals.push({ level: lvl, headline: `${firePct.toFixed(1)}% toward FIRE target`, detail: yearsToFire ? `${yearsToFire} years at current savings rate of ${formatGbp(savingsAvg)}/mo` : `FIRE target: ${formatGbp(fireTarget)}` });
            }

            // Savings streak
            if (streak >= 3) {
              signals.push({ level: "green", headline: `${streak}-month positive savings streak`, detail: `${formatGbp(savingsAvg)}/mo avg — compound growth building` });
            } else if (history.length > 0 && history.some(h => h.netSavings < 0)) {
              signals.push({ level: "amber", headline: "Negative savings month in history", detail: "Review the dip month to prevent recurrence" });
            }

            // Milestone proximity
            if (nextMilestone && monthsToMilestone !== null && monthsToMilestone <= 6) {
              signals.push({ level: "green", headline: `${nextMilestone.label} milestone in ~${monthsToMilestone}mo`, detail: `${formatGbp(nextMilestone.target - displayNetWorth)} remaining at current savings pace` });
            } else if (nextMilestone) {
              signals.push({ level: "amber", headline: `Next milestone: ${nextMilestone.label}`, detail: `${formatGbp(nextMilestone.target - displayNetWorth)} remaining${monthsToMilestone ? ` · ~${(monthsToMilestone / 12).toFixed(1)}yr away` : ""}` });
            }

            if (signals.length === 0) return null;
            const levelColors: Record<string, string> = { red: "var(--ft-red)", amber: "var(--ft-accent)", green: "var(--ft-green)" };
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ padding: "7px 14px", borderBottom: "1px solid var(--ft-border)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Wealth Signals</span>
                </div>
                {signals.map((sig, i) => {
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

          {/* FIRE / financial projections */}
          {savingsAvg > 0 && hasMockData && (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "14px 16px 12px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 12 }}>
                Financial projections
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "10px 12px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>+12 months</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-accent)", letterSpacing: "-0.01em" }}>{mask(oneYearProj)}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-green)", marginTop: 2 }}>+{mask(savingsAvg * 12)}</div>
                </div>
                <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "10px 12px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>+5 years</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "-0.01em" }}>{mask(fiveYearProj)}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-green)", marginTop: 2 }}>+{mask(savingsAvg * 60)}</div>
                </div>
              </div>
              {fireTarget > 0 && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-accent)" }}>FIRE</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>target (25× expenses)</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-text)" }}>{mask(fireTarget)}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-accent)" }}>{firePct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div style={{ height: 5, background: "var(--ft-raised)", borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{ height: "100%", width: `${firePct}%`, background: "var(--ft-accent)", borderRadius: 3 }} />
                  </div>
                  {yearsToFire && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                      est. <span style={{ color: "var(--ft-accent)", fontWeight: 700 }}>{yearsToFire} yrs</span> at current savings rate
                    </div>
                  )}
                </div>
              )}
              {/* FIRE Trajectory Projection Chart */}
              {cumNW.length > 1 && (() => {
                const histN = cumNW.length;
                const projN = 36;
                const totalN = histN + projN;
                const projVals = Array.from({ length: projN }, (_, i) => displayNetWorth + savingsAvg * (i + 1));
                const yMin = Math.min(0, ...cumNW);
                const yMax = Math.max(...projVals);
                const yRange = yMax - yMin || 1;
                const W = 300, H = 90, PX = 6, PY = 14;
                const xOf = (i: number) => PX + (i / (totalN - 1)) * (W - 2 * PX);
                const yOf = (v: number) => PY + (1 - (v - yMin) / yRange) * (H - 2 * PY);
                const nowIdx = histN - 1;
                const nowX = xOf(nowIdx);
                const nowY = yOf(displayNetWorth);
                const histPts = cumNW.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`);
                const histPath = `M ${histPts.join(" L ")}`;
                const projPts = projVals.map((v, i) => `${xOf(histN + i).toFixed(1)},${yOf(v).toFixed(1)}`);
                const projPath = `M ${nowX.toFixed(1)},${nowY.toFixed(1)} L ${projPts.join(" L ")}`;
                const msMarkers = MOCK_MILESTONES.filter(m => !m.achieved && m.target > displayNetWorth && m.target <= yMax);
                return (
                  <div style={{ marginTop: 14, borderTop: "1px solid var(--ft-border)", paddingTop: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                        NW trajectory · 3yr projection
                      </div>
                      {yearsToFire && (
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                          FIRE <span style={{ color: "var(--ft-accent)", fontWeight: 700 }}>{yearsToFire}yr</span>
                        </div>
                      )}
                    </div>
                    <svg width="100%" viewBox={`0 0 ${W} ${H + 12}`} style={{ overflow: "visible", display: "block" }}>
                      <defs>
                        <linearGradient id="nwHistGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--ft-accent)" stopOpacity="0.18" />
                          <stop offset="100%" stopColor="var(--ft-accent)" stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="nwProjGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--ft-dim)" stopOpacity="0.06" />
                          <stop offset="100%" stopColor="var(--ft-dim)" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      {/* Y grid guides */}
                      {[0.33, 0.66].map(f => {
                        const gy = yOf(yMin + f * yRange);
                        const gv = yMin + f * yRange;
                        return (
                          <g key={f}>
                            <line x1={PX} y1={gy} x2={W - PX} y2={gy} stroke="var(--ft-border)" strokeWidth="0.5" />
                            {!privacy && (
                              <text x={PX + 2} y={gy - 2} fill="var(--ft-dim)" fontSize="5.5" opacity="0.6">
                                {formatGbp(Math.round(gv))}
                              </text>
                            )}
                          </g>
                        );
                      })}
                      {/* Now vertical divider */}
                      <line x1={nowX} y1={PY - 6} x2={nowX} y2={H - PY + 2} stroke="var(--ft-border)" strokeWidth="0.8" strokeDasharray="2,3" />
                      <text x={nowX} y={PY - 8} fill="var(--ft-accent)" fontSize="6" textAnchor="middle">now</text>
                      {/* Historical area fill */}
                      <path
                        d={`${histPath} L ${nowX.toFixed(1)},${(H - PY).toFixed(1)} L ${PX},${(H - PY).toFixed(1)} Z`}
                        fill="url(#nwHistGrad)"
                      />
                      {/* Projection area fill */}
                      <path
                        d={`M ${nowX.toFixed(1)},${nowY.toFixed(1)} L ${projPts.join(" L ")} L ${(W - PX).toFixed(1)},${(H - PY).toFixed(1)} L ${nowX.toFixed(1)},${(H - PY).toFixed(1)} Z`}
                        fill="url(#nwProjGrad)"
                      />
                      {/* Historical line */}
                      <path d={histPath} fill="none" stroke="var(--ft-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      {/* Projection line (dashed) */}
                      <path d={projPath} fill="none" stroke="var(--ft-accent)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4,3" opacity="0.55" />
                      {/* Milestone markers */}
                      {msMarkers.map(ms => {
                        const mMonths = savingsAvg > 0 ? Math.ceil((ms.target - displayNetWorth) / savingsAvg) : 0;
                        const mIdx = nowIdx + mMonths;
                        if (mIdx >= totalN) return null;
                        const cx = xOf(mIdx);
                        const cy = yOf(ms.target);
                        return (
                          <g key={ms.label}>
                            <circle cx={cx} cy={cy} r={2.5} fill="var(--ft-base)" stroke="var(--ft-green)" strokeWidth="1.2" />
                            <text x={cx} y={cy - 5} fill="var(--ft-green)" fontSize="5.5" textAnchor="middle">{ms.label}</text>
                          </g>
                        );
                      })}
                      {/* Current NW dot */}
                      <circle cx={nowX} cy={nowY} r={3} fill="var(--ft-accent)" />
                      {/* FIRE target off-chart indicator */}
                      {fireTarget > yMax && (
                        <text x={W - PX} y={PY - 4} fill="var(--ft-dim)" fontSize="5.5" textAnchor="end" opacity="0.65">
                          {!privacy ? `FIRE ${formatGbp(fireTarget)}` : "FIRE target"} ↑
                        </text>
                      )}
                      {/* X axis labels */}
                      <text x={PX} y={H + 10} fill="var(--ft-dim)" fontSize="5.5" textAnchor="start">-{histN - 1}m</text>
                      <text x={W - PX} y={H + 10} fill="var(--ft-dim)" fontSize="5.5" textAnchor="end">+{projN}m</text>
                    </svg>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Account breakdown */}
          {isVisible("accounts") && accounts.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Accounts</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>{mask(totalAcc)}</div>
              </div>
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                {accounts.map((acc, i) => {
                  const color  = ACC_COLORS[i % ACC_COLORS.length];
                  const share  = totalAcc > 0 ? (acc.gbpEquivalent / totalAcc) * 100 : 0;
                  const isLast = i === accounts.length - 1;
                  return (
                    <div key={acc.id} style={{ borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
                      <div style={{ height: 2, background: color, opacity: 0.6 }} />
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
                        <div style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.name}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>{acc.currency} · {share.toFixed(0)}%</div>
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)", flexShrink: 0 }}>{mask(acc.gbpEquivalent)}</div>
                      </div>
                      <div style={{ height: 2, background: "var(--ft-raised)", margin: "0 14px 8px" }}>
                        <div style={{ height: "100%", width: `${share}%`, background: color, opacity: 0.4 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Asset allocation donut */}
          {accounts.length > 0 && (() => {
            const grouped: Partial<Record<AccType, number>> = {};
            for (const acc of accounts) {
              const t = classifyAccount(acc.name);
              grouped[t] = (grouped[t] ?? 0) + acc.gbpEquivalent;
            }
            const segments = (Object.entries(grouped) as [AccType, number][])
              .sort((a, b) => b[1] - a[1])
              .map(([t, v]) => ({ type: t, value: v, color: ACC_TYPE_COLORS[t] }));
            const grandTotal = segments.reduce((s, sg) => s + sg.value, 0);
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "14px 16px 14px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 14 }}>
                  Asset allocation
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <div style={{ flexShrink: 0 }}>
                    <DonutChart segments={segments} size={88} thickness={14} />
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                    {segments.map(sg => {
                      const pct = grandTotal > 0 ? (sg.value / grandTotal) * 100 : 0;
                      const label = sg.type.charAt(0).toUpperCase() + sg.type.slice(1);
                      return (
                        <div key={sg.type}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <div style={{ width: 6, height: 6, borderRadius: 3, background: sg.color, flexShrink: 0 }} />
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-text)" }}>{label}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-text)" }}>{mask(sg.value)}</span>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>{pct.toFixed(0)}%</span>
                            </div>
                          </div>
                          <div style={{ height: 2, background: "var(--ft-raised)", borderRadius: 1 }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: sg.color, borderRadius: 1 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Currency exposure */}
          {accounts.length > 0 && (() => {
            const currencies: Record<string, number> = {};
            for (const acc of accounts) {
              currencies[acc.currency] = (currencies[acc.currency] ?? 0) + acc.gbpEquivalent;
            }
            const entries = Object.entries(currencies).sort((a, b) => b[1] - a[1]);
            const grandTotal = entries.reduce((s, [, v]) => s + v, 0);
            const CURR_COLORS: Record<string, string> = { GBP: "#10B981", EUR: "#3B82F6", USD: "#F4A21E", JPY: "#F97316", CHF: "#38BDF8" };
            if (entries.length < 2) return null;
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "14px 16px 12px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 10 }}>
                  Currency exposure
                </div>
                {/* Stacked bar */}
                <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 1, marginBottom: 12 }}>
                  {entries.map(([cur, val]) => (
                    <div key={cur} style={{ flex: val, background: CURR_COLORS[cur] ?? "#6B7280", minWidth: 4 }} />
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(entries.length, 3)}, 1fr)`, gap: 8 }}>
                  {entries.map(([cur, val]) => {
                    const pct = grandTotal > 0 ? (val / grandTotal) * 100 : 0;
                    return (
                      <div key={cur} style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "8px 10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                          <div style={{ width: 5, height: 5, borderRadius: 2, background: CURR_COLORS[cur] ?? "#6B7280" }} />
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-text)" }}>{cur}</span>
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)" }}>{mask(val)}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 1 }}>{pct.toFixed(0)}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* UK wealth percentile benchmark */}
          {hasMockData && (() => {
            // ONS Wealth and Assets Survey 2020-22 UK household net worth deciles (individual approx)
            const UK_PERCENTILES: Array<{ pct: number; label: string; threshold: number }> = [
              { pct: 10, label: "P10",  threshold:    500 },
              { pct: 20, label: "P20",  threshold:   5000 },
              { pct: 30, label: "P30",  threshold:  15000 },
              { pct: 40, label: "P40",  threshold:  35000 },
              { pct: 50, label: "P50",  threshold:  65000 },
              { pct: 60, label: "P60",  threshold: 115000 },
              { pct: 70, label: "P70",  threshold: 195000 },
              { pct: 80, label: "P80",  threshold: 320000 },
              { pct: 90, label: "P90",  threshold: 600000 },
              { pct: 99, label: "P99",  threshold: 2000000 },
            ];
            const nw = displayNetWorth;
            const lower = UK_PERCENTILES.filter(p => nw >= p.threshold);
            const upper = UK_PERCENTILES.find(p => nw < p.threshold);
            const myPct = lower.length > 0
              ? (upper
                ? lower[lower.length - 1].pct + ((nw - lower[lower.length - 1].threshold) / (upper.threshold - lower[lower.length - 1].threshold)) * (upper.pct - lower[lower.length - 1].pct)
                : 99)
              : (nw > 0 ? 5 : 1);
            const pctRound = Math.max(1, Math.min(99, Math.round(myPct)));
            const rankLabel = pctRound >= 90 ? "Top 10%" : pctRound >= 75 ? "Top 25%" : pctRound >= 50 ? "Above median" : "Below median";
            const rankColor = pctRound >= 75 ? "var(--ft-green)" : pctRound >= 50 ? "var(--ft-accent)" : "var(--ft-amber)";
            const nextBand = upper ? upper : { label: "Top 1%", threshold: 2000000 };
            const gapToNext = Math.max(0, nextBand.threshold - nw);
            const W = 260, H = 28;
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    UK wealth percentile
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>ONS 2020–22</div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 10 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(26px, 9vw, 34px)", fontWeight: 700, color: rankColor, letterSpacing: "-0.04em", lineHeight: 1 }}>
                    P{pctRound}
                  </div>
                  <div style={{ marginBottom: 2 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: rankColor }}>{rankLabel}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>richer than {pctRound}% of UK adults</div>
                  </div>
                </div>
                {/* Density bar with position marker */}
                <div style={{ position: "relative", height: H, marginBottom: 8 }}>
                  <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
                    <defs>
                      <linearGradient id="wealth-dist" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%"   stopColor="var(--ft-red)"   stopOpacity="0.5" />
                        <stop offset="30%"  stopColor="var(--ft-amber)"  stopOpacity="0.6" />
                        <stop offset="60%"  stopColor="var(--ft-accent)" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="var(--ft-green)"  stopOpacity="0.7" />
                      </linearGradient>
                    </defs>
                    <rect x="0" y={H * 0.45} width={W} height={H * 0.28} rx="3" fill="url(#wealth-dist)" />
                    {/* Marker line */}
                    {(() => {
                      const mx = (pctRound / 100) * W;
                      return (
                        <>
                          <line x1={mx} y1={2} x2={mx} y2={H - 2} stroke={rankColor} strokeWidth="2" strokeLinecap="round" />
                          <circle cx={mx} cy={H / 2} r={4} fill={rankColor} />
                        </>
                      );
                    })()}
                    {/* Decile ticks */}
                    {[10,20,30,40,50,60,70,80,90].map(p => (
                      <line key={p} x1={(p / 100) * W} y1={H * 0.38} x2={(p / 100) * W} y2={H * 0.75} stroke="var(--ft-base)" strokeWidth="0.8" opacity="0.5" />
                    ))}
                  </svg>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>P0 · £0</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>P50 · £65K</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>P99 · £2M+</span>
                </div>
                {gapToNext > 0 && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", padding: "6px 8px", background: "var(--ft-raised)", borderRadius: 2 }}>
                    {formatGbp(gapToNext)} to reach {nextBand.label} threshold
                  </div>
                )}
              </div>
            );
          })()}

          {/* Net worth milestones */}
          {hasMockData && (() => {
            const current = displayNetWorth;
            const nextMilestone = MOCK_MILESTONES.find(m => !m.achieved);
            const nextPct = nextMilestone ? Math.min(100, (current / nextMilestone.target) * 100) : 100;
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "14px 16px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Milestones
                  </div>
                  {nextMilestone && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-accent)" }}>
                      Next: {nextMilestone.label} · {nextPct.toFixed(0)}%
                    </div>
                  )}
                </div>
                <div style={{ position: "relative" }}>
                  {/* Track line */}
                  <div style={{ position: "absolute", left: 10, top: 0, bottom: 0, width: 1, background: "var(--ft-border)" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {MOCK_MILESTONES.map((m, i) => {
                      const isNext = !m.achieved && MOCK_MILESTONES.slice(0, i).every(x => x.achieved);
                      return (
                        <div key={m.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "5px 0 5px 0" }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: 10, flexShrink: 0, zIndex: 1,
                            background: m.achieved ? "var(--ft-green)" : isNext ? "color-mix(in srgb, var(--ft-accent) 20%, transparent)" : "var(--ft-raised)",
                            border: `2px solid ${m.achieved ? "var(--ft-green)" : isNext ? "var(--ft-accent)" : "var(--ft-border)"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {m.achieved && (
                              <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                                <path d="M1 3.5L3.5 6L8 1" stroke="var(--ft-base)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                            {isNext && <div style={{ width: 5, height: 5, borderRadius: 2.5, background: "var(--ft-accent)" }} />}
                          </div>
                          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div>
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: m.achieved ? "var(--ft-text)" : isNext ? "var(--ft-accent)" : "var(--ft-dim)" }}>
                                {m.label}
                              </div>
                              {m.achieved && m.date && (
                                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 1 }}>{m.date}</div>
                              )}
                              {isNext && (
                                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-accent)", marginTop: 1 }}>
                                  {mask(nextMilestone!.target - current)} to go
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Real vs nominal wealth — inflation-adjusted */}
          {hasMockData && (() => {
            const ANNUAL_CPI   = 0.032;
            const CUMUL_FACTOR = 1.254;  // cumulative UK inflation since Jan 2022
            const BASE_YEAR    = "Jan '22";
            const realNow      = Math.round(displayNetWorth / CUMUL_FACTOR);
            const erosion      = displayNetWorth - realNow;
            const erosionPct   = ((erosion / displayNetWorth) * 100).toFixed(1);

            const projMonths = 60;
            const W = 300, H = 56, PX = 6, PY = 6;
            const nominal5Y    = displayNetWorth + savingsAvg * projMonths;
            const real5Y       = Math.round(nominal5Y / Math.pow(1 + ANNUAL_CPI, 5));
            const gap5Y        = nominal5Y - real5Y;
            const yMax         = nominal5Y * 1.02;
            const yMin         = Math.min(realNow, displayNetWorth) * 0.92;
            const xOf = (m: number) => PX + (m / projMonths) * (W - 2 * PX);
            const yOf = (v: number) => PY + (1 - (v - yMin) / (yMax - yMin)) * (H - 2 * PY);

            const nomPts: string[] = [];
            const realPts: string[] = [];
            for (let m = 0; m <= projMonths; m++) {
              const nom  = displayNetWorth + savingsAvg * m;
              const real = nom / Math.pow(1 + ANNUAL_CPI, m / 12);
              nomPts.push(`${xOf(m).toFixed(1)},${yOf(nom).toFixed(1)}`);
              realPts.push(`${xOf(m).toFixed(1)},${yOf(real).toFixed(1)}`);
            }

            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Real vs nominal wealth
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-red)" }}>
                    CPI {(ANNUAL_CPI * 100).toFixed(1)}%
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "8px 10px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Nominal today</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)", fontVariantNumeric: "tabular-nums" }}>{mask(displayNetWorth)}</div>
                  </div>
                  <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "8px 10px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Real ({BASE_YEAR} £)</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-red)", fontVariantNumeric: "tabular-nums" }}>{mask(realNow)}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-red)", marginTop: 2 }}>−{erosionPct}% purch. power</div>
                  </div>
                </div>
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
                  <defs>
                    <linearGradient id="real-gap-g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--ft-red)" stopOpacity="0.12" />
                      <stop offset="100%" stopColor="var(--ft-red)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polygon points={`${nomPts.join(" ")} ${realPts.slice().reverse().join(" ")}`} fill="url(#real-gap-g)" />
                  <polyline points={nomPts.join(" ")} fill="none" stroke="var(--ft-accent)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                  <polyline points={realPts.join(" ")} fill="none" stroke="var(--ft-red)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="4 3" />
                  <circle cx={xOf(0)} cy={yOf(displayNetWorth)} r="2.5" fill="var(--ft-accent)" />
                  <circle cx={xOf(projMonths)} cy={yOf(nominal5Y)} r="2.5" fill="var(--ft-accent)" />
                  <circle cx={xOf(projMonths)} cy={yOf(real5Y)} r="2.5" fill="var(--ft-red)" />
                  <text x={xOf(0)} y={H + 1} fontFamily="monospace" fontSize="7" fill="var(--ft-dim)" textAnchor="start" dominantBaseline="hanging">now</text>
                  <text x={xOf(projMonths)} y={H + 1} fontFamily="monospace" fontSize="7" fill="var(--ft-dim)" textAnchor="end" dominantBaseline="hanging">5Y</text>
                </svg>
                <div style={{ display: "flex", gap: 14, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--ft-border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 16, height: 2, background: "var(--ft-accent)", borderRadius: 1 }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>NOMINAL</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke="var(--ft-red)" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>REAL</span>
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
                    5Y gap: {mask(gap5Y)}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Financial runway */}
          {hasMockData && (() => {
            const monthlyExpenses = MOCK_MONTHLY_EXPENSES;
            const liquidCash     = MOCK_NW.totalCash;
            const runwayMonths   = monthlyExpenses > 0 ? Math.floor(liquidCash / monthlyExpenses) : 0;
            const runwayWeeks    = Math.round((liquidCash / monthlyExpenses) * 4.33);
            const TARGETS        = [{ months: 1, label: "1M" }, { months: 3, label: "3M" }, { months: 6, label: "6M" }, { months: 12, label: "1Y" }, { months: 24, label: "2Y" }];
            const reached        = TARGETS.filter(t => runwayMonths >= t.months);
            const next           = TARGETS.find(t => runwayMonths < t.months);
            const nextPct        = next ? Math.min(100, (liquidCash / (next.months * monthlyExpenses)) * 100) : 100;
            const statusColor    = runwayMonths < 1 ? "var(--ft-red)" : runwayMonths < 3 ? "var(--ft-amber)" : runwayMonths < 6 ? "var(--ft-accent)" : "var(--ft-green)";
            const statusLabel    = runwayMonths < 1 ? "CRITICAL" : runwayMonths < 3 ? "VULNERABLE" : runwayMonths < 6 ? "MODERATE" : "SECURE";
            const W = 300, H = 42, PX = 0, PY = 6;
            const maxMonths = 24;
            const clampedMonths = Math.min(runwayMonths, maxMonths);
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Financial runway
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 5, height: 5, borderRadius: 2.5, background: statusColor }} />
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: statusColor }}>{statusLabel}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 3, alignItems: "flex-end", marginBottom: 10 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(28px, 9vw, 36px)", fontWeight: 700, color: statusColor, letterSpacing: "-0.04em", lineHeight: 1 }}>{runwayMonths}</div>
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 1 }}>months</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>≈ {runwayWeeks}w</div>
                  </div>
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>on</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)" }}>{formatGbp(liquidCash)}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>{formatGbp(monthlyExpenses)}/mo burn</div>
                  </div>
                </div>
                {/* Runway milestone track */}
                <div style={{ position: "relative", height: 18, marginBottom: 8 }}>
                  <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 3, background: "var(--ft-raised)", borderRadius: 2, transform: "translateY(-50%)" }} />
                  <div style={{ position: "absolute", left: 0, top: "50%", height: 3, width: `${(clampedMonths / maxMonths) * 100}%`, background: statusColor, borderRadius: 2, transform: "translateY(-50%)", opacity: 0.75 }} />
                  {TARGETS.map(t => {
                    const xPct = (t.months / maxMonths) * 100;
                    const done = runwayMonths >= t.months;
                    return (
                      <div key={t.label} style={{ position: "absolute", left: `${xPct}%`, top: 0, bottom: 0, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: done ? statusColor : "var(--ft-raised)", border: `1.5px solid ${done ? statusColor : "var(--ft-border)"}` }} />
                      </div>
                    );
                  })}
                </div>
                {/* Milestone labels */}
                <div style={{ position: "relative", height: 12, marginBottom: 10 }}>
                  {TARGETS.map(t => {
                    const xPct = (t.months / maxMonths) * 100;
                    const done = runwayMonths >= t.months;
                    return (
                      <div key={t.label} style={{ position: "absolute", left: `${xPct}%`, transform: "translateX(-50%)" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: done ? statusColor : "var(--ft-dim)", fontWeight: done ? 700 : 400 }}>{t.label}</span>
                      </div>
                    );
                  })}
                </div>
                {next && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", background: `color-mix(in srgb, ${statusColor} 8%, var(--ft-raised))`, borderRadius: 2 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                      Next: <span style={{ color: statusColor, fontWeight: 700 }}>{next.label} runway</span> needs {formatGbp(next.months * monthlyExpenses - liquidCash)} more
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: statusColor }}>{nextPct.toFixed(0)}%</div>
                  </div>
                )}
                {reached.length === TARGETS.length && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-green)", textAlign: "center", marginTop: 4 }}>2Y+ runway · all milestones passed</div>
                )}
              </div>
            );
          })()}

          {/* Liquidity ladder */}
          {isVisible("liquidity") && showStats && (() => {
            const TIERS: Array<{ label: string; sub: string; types: AccType[]; accessLabel: string; color: string }> = [
              { label: "Tier 1",  sub: "Current accounts",      types: ["current"],    accessLabel: "Instant",  color: "#10B981" },
              { label: "Tier 2",  sub: "Easy-access savings",   types: ["savings"],    accessLabel: "1–3 days", color: "var(--ft-accent)" },
              { label: "Tier 3",  sub: "Investments",           types: ["investment"], accessLabel: "2–7 days", color: "#60A5FA" },
              { label: "Tier 4",  sub: "Crypto / other",        types: ["crypto", "other"], accessLabel: "Varies", color: "#F97316" },
            ];
            const tierTotals = TIERS.map(t => ({
              ...t,
              total: accounts
                .filter(a => t.types.includes(classifyAccount(a.name)))
                .reduce((s, a) => s + a.gbpEquivalent, 0),
            })).filter(t => t.total > 0);

            if (tierTotals.length === 0) return null;
            const grandTotal = tierTotals.reduce((s, t) => s + t.total, 0);
            const cumulativeByTier = tierTotals.reduce<{ tier: typeof tierTotals[0]; cumPct: number }[]>((acc, t, i) => {
              const prev = acc[i - 1]?.cumPct ?? 0;
              return [...acc, { tier: t, cumPct: prev + (t.total / grandTotal) * 100 }];
            }, []);

            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px", opacity: hasMockData ? 0.85 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Liquidity ladder
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                    {tierTotals.length} tier{tierTotals.length !== 1 ? "s" : ""}
                  </div>
                </div>

                {/* Stacked bar */}
                <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 12, gap: 1 }}>
                  {tierTotals.map(t => (
                    <div key={t.label} style={{ width: `${(t.total / grandTotal) * 100}%`, background: t.color, opacity: 0.8 }} />
                  ))}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {cumulativeByTier.map(({ tier: t, cumPct }) => {
                    const pct = (t.total / grandTotal) * 100;
                    return (
                      <div key={t.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: t.color, flexShrink: 0, opacity: 0.8 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginBottom: 1 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-text)" }}>{t.label}</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>· {t.sub}</span>
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: t.color }}>{t.accessLabel}</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-text)", fontVariantNumeric: "tabular-nums" }}>{mask(t.total)}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", fontVariantNumeric: "tabular-nums" }}>{pct.toFixed(0)}% · cum {cumPct.toFixed(0)}%</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>
                  T1+T2 = {mask(tierTotals.slice(0,2).reduce((s,t) => s+t.total, 0))} accessible within 3 days
                </div>
              </div>
            );
          })()}

          <a href="/net-worth" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", textDecoration: "none" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Full net worth</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)" }}>→</span>
          </a>
        </div>
      </div>
    </div>
  );
}
