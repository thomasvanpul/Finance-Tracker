import { useListInvestments, useGetInvestmentSummary } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { ChevronLeft } from "lucide-react";
import { MiniSparkLine, SparkArea, DonutChart } from "./MobileCharts";
import { useWidgetVisibility } from "@/hooks/use-widget-visibility";
import { WidgetManagerButton } from "./MobileWidgetManager";

const INVESTMENTS_WIDGETS = [
  { id: "signals",       label: "Portfolio signals" },
  { id: "top-movers",   label: "Top movers" },
  { id: "holdings",     label: "Holdings list" },
  { id: "allocation",   label: "Allocation" },
  { id: "sector",       label: "Sector exposure" },
  { id: "rolling",      label: "Rolling returns" },
  { id: "attribution",  label: "Performance attribution" },
  { id: "concentration", label: "Concentration risk" },
  { id: "dividend-income", label: "Dividend income" },
  { id: "dividend-cal", label: "Dividend calendar" },
  { id: "isa",          label: "ISA allowance" },
  { id: "cgt",          label: "CGT exposure" },
  { id: "benchmark",    label: "vs Benchmark" },
  { id: "risk",         label: "Risk analytics" },
  { id: "stress-var",   label: "Stress test + VaR" },
  { id: "correlation",  label: "Correlation matrix" },
];

const SEG_COLORS = [
  "#F4A21E", "#60a5fa", "#4ade80", "#facc15",
  "#38bdf8", "#34d399", "#fb923c", "#0ea5e9",
];

const MOCK_HOLDINGS = [
  { id: "m1", ticker: "VWRL", name: "Vanguard All-World ETF", gbpValue: 14820, plGbp: 2340, plPercent: 18.73 },
  { id: "m2", ticker: "AAPL", name: "Apple Inc.",            gbpValue:  6210, plGbp:  890, plPercent: 16.72 },
  { id: "m3", ticker: "TSLA", name: "Tesla Inc.",            gbpValue:  3150, plGbp: -420, plPercent: -11.76 },
  { id: "m4", ticker: "BTC",  name: "Bitcoin",               gbpValue:  2880, plGbp:  640, plPercent: 28.57 },
];

const MOCK_SPARKLINES: Record<string, number[]> = {
  VWRL: [82, 85, 83, 88, 91, 87, 94, 96, 92, 99, 102, 98, 104, 107, 105],
  AAPL: [145, 152, 148, 155, 162, 158, 165, 169, 163, 171, 175, 168, 178, 182, 176],
  TSLA: [240, 228, 235, 220, 215, 228, 210, 198, 205, 192, 188, 195, 182, 176, 180],
  BTC:  [2800, 3100, 2950, 3400, 3800, 3500, 4200, 3900, 4500, 4800, 4400, 5200, 4900, 5800, 5600],
};

const PORTFOLIO_HISTORY = [21200, 22800, 23500, 21800, 24600, 26100, 27060];

const MOCK_DIVIDEND_YIELD: Record<string, number> = {
  VWRL: 1.8, AAPL: 0.5, TSLA: 0, BTC: 0,
};

const PORTFOLIO_BENCHMARK_RETURN = 11.1; // S&P 500 comparison period return %
// Indexed to 100 at start of 7-month window (realistic simulated paths)
const BENCHMARK_INDEXED = [100, 101.8, 104.2, 102.5, 106.3, 108.9, 111.1]; // S&P 500
const FTSE_INDEXED      = [100, 101.2, 102.8, 101.5, 104.1, 106.0, 107.2]; // FTSE 100

const MOCK_SECTORS: Record<string, string> = {
  VWRL: "Diversified", AAPL: "Technology", TSLA: "Technology", BTC: "Crypto",
};
const SECTOR_COLORS: Record<string, string> = {
  Technology: "#60a5fa", Diversified: "#F4A21E", Crypto: "#F97316",
  Finance: "#4ade80",    Healthcare: "#34D399",  Energy: "#fb923c",
};

export function MobileInvestments() {
  const { privacy } = usePrivacy();
  const { data: investments = [], isLoading } = useListInvestments();
  const { data: summary } = useGetInvestmentSummary();
  const { isVisible, toggle, resetAll, visible, hiddenCount } = useWidgetVisibility("investments", INVESTMENTS_WIDGETS);

  const hasMockData = investments.length === 0 && !isLoading;
  const displayHoldings = hasMockData ? MOCK_HOLDINGS : [...investments].sort((a, b) => b.gbpValue - a.gbpValue);

  const byPl    = [...displayHoldings].sort((a, b) => b.plPercent - a.plPercent);
  const best    = byPl[0] ?? null;
  const worst   = byPl[byPl.length - 1] ?? null;
  const bestI   = best  ? displayHoldings.findIndex(h => h.id === best.id)  : -1;
  const worstI  = worst ? displayHoldings.findIndex(h => h.id === worst.id) : -1;

  const totalValue = hasMockData
    ? MOCK_HOLDINGS.reduce((s, i) => s + i.gbpValue, 0)
    : (summary?.totalValueGbp ?? investments.reduce((s, i) => s + i.gbpValue, 0));
  const totalPl    = hasMockData
    ? MOCK_HOLDINGS.reduce((s, i) => s + i.plGbp, 0)
    : (summary?.totalPlGbp ?? investments.reduce((s, i) => s + i.plGbp, 0));
  const totalPlPct = hasMockData
    ? (totalValue > 0 ? (totalPl / totalValue) * 100 : 0)
    : (summary?.totalPlPercent ?? (totalValue > 0 ? (totalPl / totalValue) * 100 : 0));
  const positive   = totalPl >= 0;
  const mask       = (v: number) => privacy ? "••••" : formatGbp(v);

  const bySector: Record<string, number> = {};
  for (const h of displayHoldings) {
    const sec = hasMockData ? (MOCK_SECTORS[h.ticker.toUpperCase()] ?? "Other") : "Other";
    bySector[sec] = (bySector[sec] ?? 0) + h.gbpValue;
  }
  const sectorEntries = Object.entries(bySector).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 16px 0", marginBottom: 12, flexShrink: 0 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-text)" }}>
          Markets
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {displayHoldings.length > 0 && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
              {displayHoldings.length} holding{displayHoldings.length !== 1 ? "s" : ""}
              {hasMockData && " · preview"}
            </div>
          )}
          <WidgetManagerButton widgets={INVESTMENTS_WIDGETS} visible={visible} onToggle={toggle} onReset={resetAll} hiddenCount={hiddenCount} />
        </div>
      </div>

      <div className="mobile-scroll" style={{ flex: 1, overflowY: "auto", padding: "0 16px", paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 16px)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Portfolio hero card */}
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "22px 22px 16px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8 }}>
              Portfolio value
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(24px, 8vw, 34px)", fontWeight: 700, color: "var(--ft-text)", letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 8 }}>
                  {mask(totalValue)}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: positive ? "var(--ft-green)" : "var(--ft-red)" }}>
                    {positive ? "+" : ""}{mask(totalPl)}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: positive ? "var(--ft-green)" : "var(--ft-red)" }}>
                    {positive ? "+" : ""}{totalPlPct.toFixed(2)}%
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>all time</span>
                  {hasMockData && (() => {
                    const alpha = totalPlPct - PORTFOLIO_BENCHMARK_RETURN;
                    return (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: alpha >= 0 ? "var(--ft-green)" : "var(--ft-red)", padding: "1px 5px", background: `color-mix(in srgb, ${alpha >= 0 ? "var(--ft-green)" : "var(--ft-red)"} 12%, transparent)`, borderRadius: 3 }}>
                        {alpha >= 0 ? "+" : ""}{alpha.toFixed(1)}% vs S&P
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>
            {/* Portfolio sparkline */}
            <div style={{ borderRadius: 2, overflow: "hidden" }}>
              <SparkArea data={PORTFOLIO_HISTORY} height={38} color={positive ? "var(--ft-green)" : "var(--ft-red)"} />
            </div>
          </div>

          {/* Portfolio signals */}
          {isVisible('signals') && !isLoading && displayHoldings.length > 0 && (() => {
            const signals: Array<{ level: "red" | "amber" | "green"; headline: string; detail: string }> = [];
            const alpha = totalPlPct - PORTFOLIO_BENCHMARK_RETURN;

            // Benchmark alpha
            if (alpha > 3) {
              signals.push({ level: "green", headline: `+${alpha.toFixed(1)}pp alpha vs S&P 500`, detail: `Portfolio ${totalPlPct.toFixed(1)}% vs benchmark ${PORTFOLIO_BENCHMARK_RETURN}% — outperforming` });
            } else if (alpha < -3) {
              signals.push({ level: "red", headline: `${alpha.toFixed(1)}pp behind S&P 500`, detail: `Portfolio ${totalPlPct.toFixed(1)}% vs benchmark ${PORTFOLIO_BENCHMARK_RETURN}% — underperforming` });
            } else {
              signals.push({ level: "amber", headline: `Tracking benchmark closely (+${alpha.toFixed(1)}pp)`, detail: `Portfolio ${totalPlPct.toFixed(1)}% vs S&P 500 ${PORTFOLIO_BENCHMARK_RETURN}%` });
            }

            // Largest losing position
            if (worst && worst.plPercent < -8) {
              signals.push({ level: "red", headline: `${worst.ticker.toUpperCase()} down ${Math.abs(worst.plPercent).toFixed(1)}% — review position`, detail: `${formatGbp(Math.abs(worst.plGbp))} unrealised loss · largest detractor` });
            }

            // Concentration: top holding > 55%
            if (displayHoldings.length > 0 && totalValue > 0) {
              const topHolding = displayHoldings.reduce((m, h) => h.gbpValue > m.gbpValue ? h : m, displayHoldings[0]);
              const topPct = (topHolding.gbpValue / totalValue) * 100;
              if (topPct > 55) {
                signals.push({ level: "amber", headline: `${topHolding.ticker.toUpperCase()} at ${topPct.toFixed(0)}% of portfolio`, detail: "High concentration — consider rebalancing for diversification" });
              }
            }

            if (signals.length === 0) return null;
            const levelColors: Record<string, string> = { red: "var(--ft-red)", amber: "var(--ft-accent)", green: "var(--ft-green)" };
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden", opacity: hasMockData ? 0.85 : 1 }}>
                <div style={{ padding: "7px 14px", borderBottom: "1px solid var(--ft-border)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Portfolio Signals</span>
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

          {isLoading ? (
            <div style={{ textAlign: "center", color: "var(--ft-dim)", fontSize: 13, padding: 32 }}>Loading…</div>
          ) : (
            <>
              {/* Top movers callout */}
              {isVisible('top-movers') && displayHoldings.length > 1 && best && worst && best.id !== worst.id && (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, display: "flex", overflow: "hidden", opacity: hasMockData ? 0.85 : 1 }}>
                  <div style={{ flex: 1, padding: "11px 14px", borderRight: "1px solid var(--ft-border)" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 5 }}>Top Gainer</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: SEG_COLORS[bestI % SEG_COLORS.length] }}>{best.ticker.toUpperCase()}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-green)" }}>+{best.plPercent.toFixed(1)}%</span>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 2 }}>{best.name.split(" ").slice(0, 2).join(" ")}</div>
                  </div>
                  <div style={{ flex: 1, padding: "11px 14px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 5 }}>Top Loser</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: SEG_COLORS[worstI % SEG_COLORS.length] }}>{worst.ticker.toUpperCase()}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: worst.plPercent >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>{worst.plPercent >= 0 ? "+" : ""}{worst.plPercent.toFixed(1)}%</span>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 2 }}>{worst.name.split(" ").slice(0, 2).join(" ")}</div>
                  </div>
                </div>
              )}

              {/* Holdings list */}
              {isVisible('holdings') && <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden", opacity: hasMockData ? 0.85 : 1 }}>
                {displayHoldings.map((inv, i) => {
                  const pos       = inv.plGbp >= 0;
                  const isLast    = i === displayHoldings.length - 1;
                  const sparkData = MOCK_SPARKLINES[inv.ticker.toUpperCase()] ?? [];
                  const tickerColor = SEG_COLORS[i % SEG_COLORS.length];
                  const spLo  = sparkData.length >= 2 ? Math.min(...sparkData) : 0;
                  const spHi  = sparkData.length >= 2 ? Math.max(...sparkData) : 0;
                  const spCur = sparkData.length >= 2 ? sparkData[sparkData.length - 1] : 0;
                  const rangePct = spHi > spLo ? ((spCur - spLo) / (spHi - spLo)) * 100 : 50;
                  return (
                    <div key={inv.id} style={{ padding: "12px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: sparkData.length >= 2 ? 8 : 0 }}>
                        {/* Symbol + name */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: tickerColor, letterSpacing: "0.04em" }}>
                            {inv.ticker.toUpperCase()}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--ft-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                            {inv.name}
                          </div>
                        </div>
                        {/* Sparkline */}
                        {sparkData.length >= 2 && (
                          <div style={{ flexShrink: 0 }}>
                            <MiniSparkLine data={sparkData} width={56} height={22} positive={pos} />
                          </div>
                        )}
                        {/* Value + P&L */}
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)" }}>
                            {mask(inv.gbpValue)}
                          </div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 5, justifyContent: "flex-end", marginTop: 1 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: pos ? "var(--ft-green)" : "var(--ft-red)" }}>
                              {pos ? "+" : "−"}{mask(Math.abs(inv.plGbp))}
                            </span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: pos ? "var(--ft-green)" : "var(--ft-red)" }}>
                              {pos ? "+" : ""}{inv.plPercent.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* Price range bar */}
                      {sparkData.length >= 2 && (
                        <div>
                          <div style={{ position: "relative", height: 3, background: "var(--ft-raised)", borderRadius: 2 }}>
                            <div style={{ position: "absolute", inset: 0, background: pos ? "var(--ft-green)" : "var(--ft-red)", opacity: 0.18, borderRadius: 2 }} />
                            <div style={{ position: "absolute", left: `${Math.max(2, Math.min(98, rangePct))}%`, top: "50%", transform: "translate(-50%, -50%)", width: 7, height: 7, borderRadius: "50%", background: pos ? "var(--ft-green)" : "var(--ft-red)", border: "1.5px solid var(--ft-surface)", boxSizing: "border-box" }} />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>L {spLo}</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", letterSpacing: "0.08em" }}>period range</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>H {spHi}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>}

              {/* Allocation bar */}
              {isVisible('allocation') && totalValue > 0 && (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 10 }}>
                    Allocation
                  </div>
                  <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 10, gap: 1 }}>
                    {displayHoldings.map((inv, i) => (
                      <div key={inv.id} style={{ flex: inv.gbpValue / totalValue, background: SEG_COLORS[i % SEG_COLORS.length], minWidth: 3 }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
                    {displayHoldings.map((inv, i) => (
                      <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ width: 6, height: 6, borderRadius: 3, background: SEG_COLORS[i % SEG_COLORS.length], flexShrink: 0 }} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                          {inv.ticker.toUpperCase()}{" "}
                          <span style={{ color: "var(--ft-text)" }}>{(inv.gbpValue / totalValue * 100).toFixed(0)}%</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

              {/* Sector exposure */}
              {isVisible('sector') && sectorEntries.length > 1 && (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px", opacity: hasMockData ? 0.85 : 1 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 12 }}>
                    Sector exposure
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ position: "relative", flexShrink: 0, width: 72, height: 72 }}>
                      <DonutChart
                        segments={sectorEntries.map(([sec, val]) => ({ value: val, color: SECTOR_COLORS[sec] ?? "#64748b" }))}
                        size={72}
                        thickness={10}
                      />
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                      {sectorEntries.map(([sec, val]) => {
                        const pct   = totalValue > 0 ? (val / totalValue) * 100 : 0;
                        const color = SECTOR_COLORS[sec] ?? "#64748b";
                        return (
                          <div key={sec} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <div style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
                            <div style={{ flex: 1, fontSize: 11, color: "var(--ft-text)" }}>{sec}</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", minWidth: 28, textAlign: "right" }}>{pct.toFixed(0)}%</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-text)", minWidth: 64, textAlign: "right" }}>{mask(val)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

          {/* Rolling returns table */}
          {isVisible('rolling') && hasMockData && (() => {
            const ROLLING = [
              { ticker: "VWRL", w1:  1.2,  m1:  3.4,  m3:  8.7  },
              { ticker: "AAPL", w1: -0.8,  m1:  5.1,  m3: 11.2  },
              { ticker: "TSLA", w1:  2.3,  m1: -12.4, m3: -18.9 },
              { ticker: "BTC",  w1:  4.1,  m1:  8.9,  m3: 32.1  },
            ];
            const portW1 = ROLLING.reduce((s, r) => s + r.w1, 0) / ROLLING.length;
            const portM1 = ROLLING.reduce((s, r) => s + r.m1, 0) / ROLLING.length;
            const portM3 = ROLLING.reduce((s, r) => s + r.m3, 0) / ROLLING.length;
            const fmt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
            const vc  = (v: number) => v >= 0 ? "var(--ft-green)" : "var(--ft-red)";
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden", opacity: 0.85 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 54px 54px 54px", padding: "8px 14px", borderBottom: "1px solid var(--ft-border)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Rolling returns</span>
                  {["1W", "1M", "3M"].map(label => (
                    <span key={label} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textAlign: "right", letterSpacing: "0.08em" }}>{label}</span>
                  ))}
                </div>
                {ROLLING.map((r, i) => {
                  const idx = displayHoldings.findIndex(h => h.ticker.toUpperCase() === r.ticker);
                  const tickerColor = SEG_COLORS[(idx >= 0 ? idx : i) % SEG_COLORS.length];
                  const isLast = i === ROLLING.length - 1;
                  return (
                    <div key={r.ticker} style={{ display: "grid", gridTemplateColumns: "1fr 54px 54px 54px", padding: "7px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)", alignItems: "center" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: tickerColor }}>{r.ticker}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, color: vc(r.w1), textAlign: "right" }}>{fmt(r.w1)}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, color: vc(r.m1), textAlign: "right" }}>{fmt(r.m1)}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, color: vc(r.m3), textAlign: "right" }}>{fmt(r.m3)}</span>
                    </div>
                  );
                })}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 54px 54px 54px", padding: "7px 14px", borderTop: "1px solid var(--ft-border)", background: "var(--ft-raised)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Portfolio avg</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: vc(portW1), textAlign: "right" }}>{fmt(portW1)}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: vc(portM1), textAlign: "right" }}>{fmt(portM1)}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: vc(portM3), textAlign: "right" }}>{fmt(portM3)}</span>
                </div>
              </div>
            );
          })()}

          {/* Performance attribution */}
          {isVisible('attribution') && displayHoldings.length > 0 && totalPl !== 0 && (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "14px 16px", opacity: hasMockData ? 0.85 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                  Return attribution
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: totalPl >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 700 }}>
                  {totalPl >= 0 ? "+" : ""}{totalPlPct.toFixed(1)}% total
                </div>
              </div>
              {[...displayHoldings]
                .sort((a, b) => b.plGbp - a.plGbp)
                .map((inv, i) => {
                  const contrib = totalPl !== 0 ? (inv.plGbp / Math.abs(totalPl)) * 100 : 0;
                  const pos = inv.plGbp >= 0;
                  const color = SEG_COLORS[displayHoldings.findIndex(h => h.id === inv.id) % SEG_COLORS.length];
                  const barW = Math.abs(contrib);
                  return (
                    <div key={inv.id} style={{ marginBottom: i < displayHoldings.length - 1 ? 8 : 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <div style={{ width: 5, height: 5, borderRadius: 2.5, background: color }} />
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-text)", fontWeight: 700 }}>{inv.ticker.toUpperCase()}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>{inv.name.split(" ").slice(0, 2).join(" ")}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: pos ? "var(--ft-green)" : "var(--ft-red)" }}>
                            {pos ? "+" : ""}{contrib.toFixed(0)}%
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>of gain</span>
                        </div>
                      </div>
                      <div style={{ height: 4, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${barW}%`, background: pos ? "var(--ft-green)" : "var(--ft-red)", borderRadius: 2, opacity: 0.8 }} />
                      </div>
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* Concentration risk */}
          {isVisible('concentration') && displayHoldings.length > 0 && totalValue > 0 && (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "14px 16px", opacity: hasMockData ? 0.85 : 1 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 10 }}>
                Concentration risk
              </div>
              {(() => {
                const maxHolding = displayHoldings[0];
                const maxPct = (maxHolding.gbpValue / totalValue) * 100;
                const top3Pct = displayHoldings.slice(0, 3).reduce((s, h) => s + (h.gbpValue / totalValue) * 100, 0);
                const riskLevel = maxPct > 50 ? "HIGH" : maxPct > 30 ? "MEDIUM" : "LOW";
                const riskColor = riskLevel === "HIGH" ? "var(--ft-red)" : riskLevel === "MEDIUM" ? "var(--ft-accent)" : "var(--ft-green)";
                const hhi = displayHoldings.reduce((s, h) => s + Math.pow(h.gbpValue / totalValue, 2), 0) * 10000;
                return (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                      <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "8px 10px" }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>Top hold.</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)" }}>{maxPct.toFixed(0)}%</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 1 }}>{maxHolding.ticker.toUpperCase()}</div>
                      </div>
                      <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "8px 10px" }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>Top 3</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)" }}>{top3Pct.toFixed(0)}%</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 1 }}>of portfolio</div>
                      </div>
                      <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "8px 10px" }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>HHI</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: hhi > 2500 ? "var(--ft-red)" : hhi > 1500 ? "var(--ft-accent)" : "var(--ft-green)" }}>{Math.round(hhi)}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 1 }}>conc. index</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: 3, background: riskColor }} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: riskColor }}>
                          {riskLevel} CONCENTRATION
                        </span>
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                        {displayHoldings.length} positions
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Dividend income card */}
          {isVisible('dividend-income') && hasMockData && (() => {
            const divEntries = displayHoldings
              .map((h, i) => {
                const yld      = MOCK_DIVIDEND_YIELD[h.ticker.toUpperCase()] ?? 0;
                const annualDiv = h.gbpValue * (yld / 100);
                return { id: h.id, ticker: h.ticker, name: h.name, yld, annualDiv, color: SEG_COLORS[i % SEG_COLORS.length] };
              })
              .filter(e => e.yld > 0);
            const totalDiv = divEntries.reduce((s, e) => s + e.annualDiv, 0);
            if (divEntries.length === 0) return null;
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden", opacity: 0.85 }}>
                <div style={{ padding: "11px 16px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Dividend income
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-green)" }}>{mask(totalDiv)}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>/yr · {mask(totalDiv / 12)}/mo</span>
                  </div>
                </div>
                {divEntries.map((e, i) => (
                  <div key={e.id} style={{ padding: "8px 16px", borderBottom: i < divEntries.length - 1 ? "1px solid var(--ft-border)" : "none", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: e.color, flexShrink: 0 }} />
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: e.color, minWidth: 36 }}>{e.ticker}</div>
                    <div style={{ flex: 1, fontSize: 10, color: "var(--ft-dim)" }}>{e.yld}% yield</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-green)" }}>{mask(e.annualDiv)}/yr</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Dividend payment calendar */}
          {isVisible('dividend-cal') && hasMockData && (() => {
            const MOCK_DIV_SCHEDULE: Record<string, number[]> = {
              VWRL: [3, 6, 9, 12],
              AAPL: [2, 5, 8, 11],
            };
            const now = new Date();
            const currentMonth = now.getMonth() + 1;
            const divEvents: Array<{ ticker: string; month: number; amount: number; color: string; isPast: boolean; isNext: boolean }> = [];
            let nextEventFound = false;

            displayHoldings.forEach((h, i) => {
              const schedule = MOCK_DIV_SCHEDULE[h.ticker.toUpperCase()];
              const yld = MOCK_DIVIDEND_YIELD[h.ticker.toUpperCase()] ?? 0;
              if (!schedule || yld === 0) return;
              const quarterlyDiv = (h.gbpValue * (yld / 100)) / 4;
              const color = SEG_COLORS[i % SEG_COLORS.length];
              for (const m of schedule) {
                const isPast = m < currentMonth;
                const isNextUp = !nextEventFound && m >= currentMonth;
                if (isNextUp) nextEventFound = true;
                divEvents.push({ ticker: h.ticker, month: m, amount: quarterlyDiv, color, isPast, isNext: isNextUp });
              }
            });

            if (divEvents.length === 0) return null;

            const MONTHS_SHORT = ["J","F","M","A","M","J","J","A","S","O","N","D"];
            const tickers = [...new Set(divEvents.map(e => e.ticker))];
            const maxAmt = Math.max(...divEvents.map(e => e.amount));
            const nextEvent = divEvents.find(e => e.isNext);
            const daysToNext = nextEvent
              ? Math.ceil((new Date(now.getFullYear(), nextEvent.month - 1, 15).getTime() - now.getTime()) / 86400000)
              : null;
            const yearTotal = divEvents.filter(e => !e.isPast).reduce((s, e) => s + e.amount, 0);

            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px", opacity: 0.85 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Dividend calendar
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {daysToNext !== null && daysToNext > 0 && (
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>next in {daysToNext}d</div>
                    )}
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-green)" }}>
                      +£{yearTotal.toFixed(0)} remaining
                    </div>
                  </div>
                </div>

                {/* Grid: rows = tickers, cols = 12 months */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {tickers.map(ticker => {
                    const events = divEvents.filter(e => e.ticker === ticker);
                    const color = events[0]?.color ?? "var(--ft-dim)";
                    return (
                      <div key={ticker} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color, minWidth: 32, textAlign: "right", letterSpacing: "0.04em" }}>
                          {ticker}
                        </div>
                        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 2 }}>
                          {MONTHS_SHORT.map((m, mi) => {
                            const monthNum = mi + 1;
                            const ev = events.find(e => e.month === monthNum);
                            const isPast = monthNum < currentMonth;
                            const isCurrent = monthNum === currentMonth;
                            const dotSize = ev ? Math.max(6, Math.round((ev.amount / maxAmt) * 14)) : 0;
                            return (
                              <div key={m} style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 18 }}>
                                {ev ? (
                                  <div style={{
                                    width: dotSize, height: dotSize, borderRadius: dotSize / 2,
                                    background: isPast ? "var(--ft-border)" : color,
                                    opacity: isPast ? 0.4 : ev.isNext ? 1 : 0.75,
                                    outline: ev.isNext ? `2px solid ${color}` : "none",
                                    outlineOffset: 1,
                                  }} />
                                ) : (
                                  <div style={{ width: 2, height: 2, borderRadius: 1, background: isCurrent ? "var(--ft-accent)" : "var(--ft-border)", opacity: 0.3 }} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Month labels row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ minWidth: 32 }} />
                    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 2 }}>
                      {MONTHS_SHORT.map((m, mi) => (
                        <div key={m} style={{
                          fontFamily: "var(--font-mono)", fontSize: 6.5,
                          color: mi + 1 === currentMonth ? "var(--ft-accent)" : "var(--ft-dim)",
                          textAlign: "center", fontWeight: mi + 1 === currentMonth ? 700 : 400,
                        }}>
                          {m}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--ft-border)", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: "var(--ft-border)", opacity: 0.4 }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>paid</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: "var(--ft-accent)" }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>upcoming · dot size = amount</span>
                  </div>
                  <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>
                    quarterly schedule
                  </div>
                </div>
              </div>
            );
          })()}

          {/* UK ISA allowance tracker */}
          {isVisible('isa') && hasMockData && (() => {
            const ANNUAL_ALLOWANCE = 20000;
            const MOCK_CONTRIBUTED = 15600;
            const remaining  = ANNUAL_ALLOWANCE - MOCK_CONTRIBUTED;
            const pct        = Math.min(100, (MOCK_CONTRIBUTED / ANNUAL_ALLOWANCE) * 100);
            const now2 = new Date();
            const yr   = now2.getFullYear();
            const taxYearEnd = (now2.getMonth() < 3 || (now2.getMonth() === 3 && now2.getDate() <= 5))
              ? new Date(yr, 3, 5)
              : new Date(yr + 1, 3, 5);
            const daysLeft  = Math.ceil((taxYearEnd.getTime() - now2.getTime()) / 86400000);
            const monthsLeft = Math.max(1, Math.round(daysLeft / 30));
            const statusColor = remaining < 2000 ? "var(--ft-accent)" : "var(--ft-green)";
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px", opacity: 0.85 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    ISA Allowance · {yr}/{String(yr + 1).slice(2)}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>{daysLeft}d to 5 Apr</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "9px 10px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>Contributed</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-green)" }}>{formatGbp(MOCK_CONTRIBUTED)}</div>
                  </div>
                  <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "9px 10px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>Remaining</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: statusColor }}>{formatGbp(remaining)}</div>
                  </div>
                </div>
                <div style={{ marginBottom: 5 }}>
                  <div style={{ height: 5, background: "var(--ft-raised)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: statusColor, borderRadius: 3 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>£0</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, color: statusColor }}>{pct.toFixed(0)}% used</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>{formatGbp(ANNUAL_ALLOWANCE)} limit</span>
                  </div>
                </div>
                {remaining > 0 && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", marginTop: 4 }}>
                    invest {formatGbp(Math.round(remaining / monthsLeft))}/mo to maximize by 5 Apr
                  </div>
                )}
              </div>
            );
          })()}

          {/* UK CGT exposure */}
          {isVisible('cgt') && hasMockData && (() => {
            const CGT_EXEMPT    = 3000;   // 2024/25 annual exempt amount
            const withColors    = MOCK_HOLDINGS.map((h, i) => ({ ...h, color: SEG_COLORS[i % SEG_COLORS.length] }));
            const nonZero       = withColors.filter(h => h.plGbp !== 0);
            const totalGain     = withColors.reduce((s, h) => s + h.plGbp, 0);
            const gainOver      = Math.max(0, totalGain - CGT_EXEMPT);
            const basicRateCGT  = Math.round(gainOver * 0.10);
            const higherRateCGT = Math.round(gainOver * 0.20);
            const pctUsed       = Math.min(100, Math.max(0, (totalGain / CGT_EXEMPT) * 100));
            const barColor      = totalGain > CGT_EXEMPT ? "var(--ft-accent)" : "var(--ft-green)";
            const now3          = new Date();
            const taxYear3      = `${now3.getFullYear()}/${String(now3.getFullYear() + 1).slice(2)}`;
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px", opacity: 0.85 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    CGT exposure · {taxYear3}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: barColor }}>
                    {totalGain > CGT_EXEMPT
                      ? `${formatGbp(gainOver)} over AEA`
                      : totalGain > 0
                        ? `${formatGbp(CGT_EXEMPT - totalGain)} headroom`
                        : "no net gain"}
                  </div>
                </div>
                {/* AEA bar */}
                <div style={{ marginBottom: 4 }}>
                  <div style={{ height: 5, background: "var(--ft-raised)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pctUsed}%`, background: barColor, borderRadius: 3 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>£0</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, color: barColor }}>{pctUsed.toFixed(0)}% of AEA</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>£3,000 AEA</span>
                  </div>
                </div>
                {/* Per-holding unrealized gain/loss rows */}
                <div style={{ marginTop: 8, marginBottom: gainOver > 0 ? 10 : 0 }}>
                  {nonZero.map((h, i) => (
                    <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: i < nonZero.length - 1 ? "1px solid var(--ft-border)" : "none" }}>
                      <div style={{ width: 5, height: 5, borderRadius: 2.5, background: h.color, flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: h.color, minWidth: 38 }}>{h.ticker}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", flex: 1 }}>{h.plPercent >= 0 ? "+" : ""}{h.plPercent.toFixed(1)}%</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: h.plGbp >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontVariantNumeric: "tabular-nums" }}>
                        {h.plGbp >= 0 ? "+" : "−"}{formatGbp(Math.abs(h.plGbp))}
                      </span>
                    </div>
                  ))}
                </div>
                {gainOver > 0 && (
                  <div style={{ background: "color-mix(in srgb, var(--ft-accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--ft-accent) 20%, transparent)", borderRadius: 2, padding: "7px 10px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-accent)" }}>
                      If crystallised: <span style={{ fontWeight: 700 }}>{formatGbp(basicRateCGT)}</span> CGT at 10% (basic) · <span style={{ fontWeight: 700 }}>{formatGbp(higherRateCGT)}</span> at 20% (higher)
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Portfolio vs benchmark */}
          {isVisible('benchmark') && displayHoldings.length > 0 && (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "14px 16px", opacity: hasMockData ? 0.85 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                  vs benchmark
                </div>
                {(() => {
                  const alpha = totalPlPct - PORTFOLIO_BENCHMARK_RETURN;
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: alpha >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                        {alpha >= 0 ? "+" : ""}{alpha.toFixed(1)}% alpha
                      </div>
                    </div>
                  );
                })()}
              </div>
              {(() => {
                const portIndexed = PORTFOLIO_HISTORY.map(v => (v / PORTFOLIO_HISTORY[0]) * 100);
                const n = portIndexed.length;
                const W = 300, H = 80, PX = 6, PY = 8;
                const allVals = [...portIndexed, ...BENCHMARK_INDEXED, ...FTSE_INDEXED];
                const yMin = Math.min(...allVals) * 0.985;
                const yMax = Math.max(...allVals) * 1.015;
                const yRange = yMax - yMin || 1;
                const xOf = (i: number) => PX + (i / (n - 1)) * (W - 2 * PX);
                const yOf = (v: number) => PY + (1 - (v - yMin) / yRange) * (H - 2 * PY);
                const pathFor = (vals: number[]) =>
                  `M ${vals.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" L ")}`;
                const portColor = portIndexed[n - 1] >= 100 ? "var(--ft-green)" : "var(--ft-red)";
                const portFinal = portIndexed[n - 1] - 100;
                const months = Array.from({ length: n }, (_, i) => {
                  const d = new Date(); d.setMonth(d.getMonth() - (n - 1 - i));
                  return d.toLocaleString("default", { month: "short" });
                });
                const breakEvenY = yOf(100);
                return (
                  <>
                    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
                      <defs>
                        <linearGradient id="port-grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={portColor} stopOpacity="0.18" />
                          <stop offset="100%" stopColor={portColor} stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      {/* Break-even reference at 100 */}
                      <line x1={PX} y1={breakEvenY} x2={W - PX} y2={breakEvenY} stroke="var(--ft-border)" strokeWidth="0.5" strokeDasharray="3,4" />
                      <text x={PX + 2} y={breakEvenY - 2} fill="var(--ft-dim)" fontSize="5.5" opacity="0.6">100</text>
                      {/* Portfolio area fill */}
                      <path
                        d={`${pathFor(portIndexed)} L ${xOf(n - 1).toFixed(1)},${H} L ${PX},${H} Z`}
                        fill="url(#port-grad)"
                      />
                      {/* FTSE 100 line */}
                      <path d={pathFor(FTSE_INDEXED)} fill="none" stroke="var(--ft-cyan)" strokeWidth="1" strokeLinejoin="round" opacity="0.65" />
                      {/* S&P 500 line */}
                      <path d={pathFor(BENCHMARK_INDEXED)} fill="none" stroke="#60a5fa" strokeWidth="1.2" strokeLinejoin="round" opacity="0.75" />
                      {/* Portfolio line */}
                      <path d={pathFor(portIndexed)} fill="none" stroke={portColor} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
                      {/* End-point dots */}
                      <circle cx={xOf(n - 1)} cy={yOf(portIndexed[n - 1])} r={2.5} fill={portColor} />
                      <circle cx={xOf(n - 1)} cy={yOf(BENCHMARK_INDEXED[n - 1])} r={2} fill="#60a5fa" opacity="0.8" />
                      <circle cx={xOf(n - 1)} cy={yOf(FTSE_INDEXED[n - 1])} r={2} fill="var(--ft-cyan)" opacity="0.8" />
                      {/* Right-edge return labels */}
                      <text x={W - PX + 3} y={yOf(portIndexed[n - 1]) + 3} fill={portColor} fontSize="6" fontWeight="bold">
                        {portFinal >= 0 ? "+" : ""}{portFinal.toFixed(1)}%
                      </text>
                      <text x={W - PX + 3} y={yOf(BENCHMARK_INDEXED[n - 1]) + 3} fill="#60a5fa" fontSize="5.5" opacity="0.8">
                        +{(BENCHMARK_INDEXED[n - 1] - 100).toFixed(1)}%
                      </text>
                      <text x={W - PX + 3} y={yOf(FTSE_INDEXED[n - 1]) + 3} fill="var(--ft-cyan)" fontSize="5.5" opacity="0.8">
                        +{(FTSE_INDEXED[n - 1] - 100).toFixed(1)}%
                      </text>
                      {/* X month labels — first, mid, last */}
                      {[0, Math.floor((n - 1) / 2), n - 1].map(i => (
                        <text key={i} x={xOf(i)} y={H + 10} fill="var(--ft-dim)" fontSize="5.5" textAnchor="middle">{months[i]}</text>
                      ))}
                    </svg>
                    {/* Legend */}
                    <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                      {[
                        { label: "Portfolio", color: portColor },
                        { label: "S&P 500",   color: "#60a5fa" },
                        { label: "FTSE 100",  color: "var(--ft-cyan)" },
                      ].map(item => (
                        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <div style={{ width: 16, height: 2, background: item.color, borderRadius: 1, opacity: 0.8 }} />
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>{item.label}</span>
                        </div>
                      ))}
                      <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", opacity: 0.6 }}>
                        indexed · 6m
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Risk analytics */}
          {isVisible('risk') && displayHoldings.length > 0 && hasMockData && (() => {
            const monthlyRets = PORTFOLIO_HISTORY.slice(1).map((v, i) => (v - PORTFOLIO_HISTORY[i]) / PORTFOLIO_HISTORY[i]);
            const benchRets   = BENCHMARK_INDEXED.slice(1).map((v, i) => (v - BENCHMARK_INDEXED[i]) / BENCHMARK_INDEXED[i]);
            const n = monthlyRets.length;
            const meanRet  = monthlyRets.reduce((s, r) => s + r, 0) / n;
            const variance = monthlyRets.reduce((s, r) => s + Math.pow(r - meanRet, 2), 0) / n;
            const stdDev   = Math.sqrt(variance);
            const annualVol = stdDev * Math.sqrt(12) * 100;
            const rfRate    = 0.0525 / 12;
            const meanExcess = monthlyRets.reduce((s, r) => s + r - rfRate, 0) / n;
            const sharpe    = stdDev > 0 ? (meanExcess / stdDev) * Math.sqrt(12) : 0;
            let peak = PORTFOLIO_HISTORY[0], maxDD = 0;
            for (const v of PORTFOLIO_HISTORY) {
              if (v > peak) peak = v;
              const dd = (v - peak) / peak;
              if (dd < maxDD) maxDD = dd;
            }
            const meanBench   = benchRets.reduce((s, r) => s + r, 0) / n;
            const covariance  = monthlyRets.reduce((s, r, i) => s + (r - meanRet) * (benchRets[i] - meanBench), 0) / n;
            const benchVar    = benchRets.reduce((s, r) => s + Math.pow(r - meanBench, 2), 0) / n;
            const beta        = benchVar > 0 ? covariance / benchVar : 1;
            const metrics = [
              { label: "Sharpe",  value: sharpe.toFixed(2),          sub: "annualized", color: sharpe >= 1 ? "var(--ft-green)" : sharpe >= 0.5 ? "var(--ft-accent)" : "var(--ft-red)" },
              { label: "Max DD",  value: `${(maxDD * 100).toFixed(1)}%`, sub: "drawdown",   color: "var(--ft-red)" },
              { label: "Vol",     value: `${annualVol.toFixed(0)}%`,  sub: "ann. 6M",    color: annualVol < 15 ? "var(--ft-green)" : annualVol < 25 ? "var(--ft-accent)" : "var(--ft-red)" },
              { label: "Beta",    value: beta.toFixed(2),             sub: "vs S&P",     color: beta > 1.2 ? "var(--ft-red)" : beta >= 0.8 ? "var(--ft-accent)" : "var(--ft-green)" },
            ];
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px", opacity: 0.85 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 10 }}>
                  Risk analytics · 6M
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                  {metrics.map(m => (
                    <div key={m.label} style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "8px 6px" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>{m.label}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: m.color }}>{m.value}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", marginTop: 1 }}>{m.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Portfolio stress test + VaR */}
          {isVisible('stress-var') && hasMockData && (() => {
            const totalValue = MOCK_HOLDINGS.reduce((s, h) => s + h.gbpValue, 0);
            const MOCK_BETAS: Record<string, number> = { VWRL: 1.0, AAPL: 1.2, TSLA: 1.8, BTC: 2.2 };
            const weightedBeta = MOCK_HOLDINGS.reduce((s, h) => {
              const w = h.gbpValue / totalValue;
              return s + w * (MOCK_BETAS[h.ticker.toUpperCase()] ?? 1.0);
            }, 0);

            const scenarios = [
              { label: "Correction", shock: -0.10, color: "var(--ft-accent)" },
              { label: "Bear market", shock: -0.20, color: "var(--ft-red)" },
              { label: "Crash",       shock: -0.40, color: "#7f1d1d" },
            ];
            const impacts = scenarios.map(s => ({
              ...s,
              loss: totalValue * weightedBeta * s.shock,
              pct: weightedBeta * s.shock * 100,
            }));
            const maxAbsLoss = Math.max(...impacts.map(i => Math.abs(i.loss)));

            const monthlyReturns = PORTFOLIO_HISTORY.slice(1).map((v, i) => (v - PORTFOLIO_HISTORY[i]) / PORTFOLIO_HISTORY[i]);
            const sorted = [...monthlyReturns].sort((a, b) => a - b);
            const varMonthly = sorted[Math.floor(sorted.length * 0.05)] ?? sorted[0];
            const varDaily = varMonthly / Math.sqrt(21);
            const varGbp = Math.abs(varDaily * totalValue);

            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px", opacity: 0.85 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Stress test
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>Daily VaR 95%</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-red)", fontVariantNumeric: "tabular-nums" }}>
                      −£{varGbp.toFixed(0)}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {impacts.map(sc => {
                    const barW = Math.round((Math.abs(sc.loss) / maxAbsLoss) * 100);
                    return (
                      <div key={sc.label}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-text)", letterSpacing: "0.04em" }}>{sc.label}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: sc.color, fontVariantNumeric: "tabular-nums" }}>
                              {sc.pct.toFixed(1)}%
                            </div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: sc.color, fontVariantNumeric: "tabular-nums", minWidth: 60, textAlign: "right" }}>
                              −£{Math.abs(sc.loss).toLocaleString("en-GB", { maximumFractionDigits: 0 })}
                            </div>
                          </div>
                        </div>
                        <div style={{ height: 4, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${barW}%`, background: sc.color, borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--ft-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>
                    Beta-adjusted · portfolio β {weightedBeta.toFixed(2)}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>
                    VaR from 6M historical simulation
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Correlation matrix */}
          {isVisible('correlation') && hasMockData && displayHoldings.length > 1 && (() => {
            const tickers = displayHoldings.map(h => h.ticker.toUpperCase());
            const rawSeries = tickers.map(t => MOCK_SPARKLINES[t] ?? []);
            const minLen = Math.min(...rawSeries.map(s => s.length));
            if (minLen < 3) return null;
            const retSeries = rawSeries.map(s =>
              s.slice(-minLen).slice(1).map((v, i) => (v - s[s.length - minLen + i]) / s[s.length - minLen + i])
            );
            const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
            const corr = (a: number[], b: number[]) => {
              const ma = mean(a), mb = mean(b);
              const num = a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0);
              const da  = Math.sqrt(a.reduce((s, v) => s + (v - ma) ** 2, 0));
              const db  = Math.sqrt(b.reduce((s, v) => s + (v - mb) ** 2, 0));
              return da * db === 0 ? 0 : num / (da * db);
            };
            const matrix = retSeries.map((ra, i) => retSeries.map((rb, j) => i === j ? 1 : corr(ra, rb)));
            const corrColor = (r: number, diag: boolean) => {
              if (diag) return "var(--ft-raised)";
              if (r >= 0.7)  return "color-mix(in srgb, var(--ft-red)  18%, var(--ft-raised))";
              if (r >= 0.4)  return "color-mix(in srgb, var(--ft-amber) 14%, var(--ft-raised))";
              if (r >= 0)    return "color-mix(in srgb, var(--ft-green) 10%, var(--ft-raised))";
              if (r >= -0.4) return "color-mix(in srgb, var(--ft-green) 18%, var(--ft-raised))";
              return "color-mix(in srgb, var(--ft-green) 28%, var(--ft-raised))";
            };
            const corrTextColor = (r: number, diag: boolean) => {
              if (diag) return "var(--ft-dim)";
              if (r >= 0.7)  return "var(--ft-red)";
              if (r >= 0.4)  return "#F59E0B";
              return "var(--ft-green)";
            };
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px", opacity: 0.85 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Correlation matrix
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>Pearson · {minLen - 1}pt</div>
                </div>
                {/* Header row */}
                <div style={{ display: "grid", gridTemplateColumns: `48px repeat(${tickers.length}, 1fr)`, gap: 3, marginBottom: 3 }}>
                  <div />
                  {tickers.map((t, j) => (
                    <div key={j} style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: SEG_COLORS[j % SEG_COLORS.length], textAlign: "center", letterSpacing: "0.04em" }}>{t}</div>
                  ))}
                </div>
                {matrix.map((row, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: `48px repeat(${tickers.length}, 1fr)`, gap: 3, marginBottom: 3 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: SEG_COLORS[i % SEG_COLORS.length], alignSelf: "center", letterSpacing: "0.04em" }}>{tickers[i]}</div>
                    {row.map((r, j) => {
                      const diag = i === j;
                      return (
                        <div key={j} style={{
                          background: corrColor(r, diag),
                          border: `1px solid color-mix(in srgb, ${corrTextColor(r, diag)} 20%, var(--ft-border))`,
                          borderRadius: 3,
                          padding: "5px 2px",
                          textAlign: "center",
                        }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: corrTextColor(r, diag) }}>
                            {diag ? "—" : r.toFixed(2)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                {/* Legend */}
                <div style={{ display: "flex", gap: 10, marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--ft-border)" }}>
                  {[
                    { color: "var(--ft-green)", label: "Low / neg" },
                    { color: "#F59E0B",         label: "Moderate" },
                    { color: "var(--ft-red)",   label: "High" },
                  ].map(item => (
                    <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: `color-mix(in srgb, ${item.color} 22%, var(--ft-raised))`, border: `1px solid color-mix(in srgb, ${item.color} 30%, transparent)` }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>{item.label}</span>
                    </div>
                  ))}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", marginLeft: "auto" }}>Low = better diversification</span>
                </div>
              </div>
            );
          })()}

          <a href="/investments" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", textDecoration: "none" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Full markets & portfolio</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)" }}>→</span>
          </a>
        </div>
      </div>
    </div>
  );
}
