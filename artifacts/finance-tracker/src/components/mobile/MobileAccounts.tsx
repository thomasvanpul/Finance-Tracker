import { useListAccounts } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
import { SparkArea, MiniSparkLine } from "./MobileCharts";
import { useWidgetVisibility } from "@/hooks/use-widget-visibility";
import { WidgetManagerButton } from "./MobileWidgetManager";

const BALANCE_HISTORY    = [14800, 15600, 15300, 16100, 17200, 17700, 18180];
const BALANCE_6M_CHANGE  = BALANCE_HISTORY[BALANCE_HISTORY.length - 1] - BALANCE_HISTORY[0];
const BALANCE_6M_PCT     = ((BALANCE_6M_CHANGE / BALANCE_HISTORY[0]) * 100).toFixed(1);
const BALANCE_MOM_CHANGE = BALANCE_HISTORY[BALANCE_HISTORY.length - 1] - BALANCE_HISTORY[BALANCE_HISTORY.length - 2];

const ACCENT_COLORS = ["#3B82F6", "#F97316", "#4ADE80", "#10B981", "#F59E0B", "#EF4444", "#06B6D4"];

const ACCOUNT_HISTORY: Record<string, number[]> = {
  ma1: [3200, 3350, 3100, 3420, 3380, 3450, 3420],
  ma2: [10800, 11200, 11800, 12000, 12200, 12350, 12400],
  ma3: [1700,  1620,  1590,  1650,  1600,  1560,  1580],
  ma4: [920,   850,   780,   810,   750,   800,   780 ],
};

const MOCK_ACCOUNTS = [
  { id: "ma1", name: "Monzo Current",    currency: "GBP", gbpEquivalent: 3420,  balance: 3420,  isWiseLinked: false },
  { id: "ma2", name: "Barclays Savings", currency: "GBP", gbpEquivalent: 12400, balance: 12400, isWiseLinked: false },
  { id: "ma3", name: "Wise EUR",         currency: "EUR", gbpEquivalent: 1580,  balance: 1842,  isWiseLinked: true  },
  { id: "ma4", name: "Coinbase",         currency: "USD", gbpEquivalent: 780,   balance: 985,   isWiseLinked: false },
];

const MOCK_APR: Record<string, number> = { ma1: 1.5, ma2: 4.5, ma3: 0.5, ma4: 0 };
const MARKET_BEST_RATE = 5.1; // Best easy-access savings rate on market
const OPTIMAL_BUFFER_MONTHS = 2; // Keep 2 months expenses in current account
const MOCK_MONTHLY_EXPENSES = 1130;

const ACCOUNTS_WIDGETS = [
  { id: "signals",              label: "Account signals" },
  { id: "per-account",          label: "Per-account list" },
  { id: "currency",             label: "Currency exposure" },
  { id: "balance-trend",        label: "Balance trend" },
  { id: "cash-drag",            label: "Cash drag analysis" },
  { id: "yield-optimizer",      label: "Yield optimizer" },
  { id: "projected-interest",   label: "Projected interest" },
  { id: "compound-growth",      label: "5Y compound growth projection" },
  { id: "fscs",                 label: "FSCS protection" },
  { id: "interest-sensitivity", label: "Interest rate sensitivity" },
  { id: "isa-tracker",         label: "ISA allowance tracker" },
  { id: "emergency-fund",      label: "Emergency fund coverage" },
  { id: "concentration",       label: "Account concentration risk" },
];

export function MobileAccounts() {
  const { privacy } = usePrivacy();
  const { data: accounts = [], isLoading } = useListAccounts();

  const hasMockData      = accounts.length === 0 && !isLoading;
  const displayAccounts  = hasMockData ? MOCK_ACCOUNTS : accounts;
  const total            = displayAccounts.reduce((s, a) => s + a.gbpEquivalent, 0);
  const mask             = (v: number) => privacy ? "••••••" : formatGbp(v);
  const { isVisible, toggle, resetAll, visible, hiddenCount } = useWidgetVisibility("accounts", ACCOUNTS_WIDGETS);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 16px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-text)" }}>
            Accounts
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!isLoading && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
                {displayAccounts.length} account{displayAccounts.length !== 1 ? "s" : ""}{hasMockData && " · preview"}
              </div>
            )}
            <WidgetManagerButton widgets={ACCOUNTS_WIDGETS} visible={visible} onToggle={toggle} onReset={resetAll} hiddenCount={hiddenCount} />
          </div>
        </div>
      </div>

      <div className="mobile-scroll" style={{ flex: 1, overflowY: "auto", padding: "0 16px", paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 16px)" }}>
        {isLoading ? (
          <div style={{ textAlign: "center", color: "var(--ft-dim)", fontSize: 13, padding: 40 }}>Loading…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, opacity: hasMockData ? 0.85 : 1 }}>
            {/* Hero total card */}
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "22px 22px 20px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8 }}>
                Total balance
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(24px, 8.5vw, 36px)", fontWeight: 700, color: "var(--ft-text)", letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 12 }}>
                {mask(total)}
              </div>
              {/* Balance sparkline */}
              <div style={{ marginBottom: 8, borderRadius: 2, overflow: "hidden" }}>
                <SparkArea data={BALANCE_HISTORY} height={36} color="var(--ft-accent)" />
              </div>
              {/* Growth row */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: BALANCE_6M_CHANGE >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                  {BALANCE_6M_CHANGE >= 0 ? "+" : "−"}{formatGbp(Math.abs(BALANCE_6M_CHANGE))}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
                  +{BALANCE_6M_PCT}%
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>6M</span>
                <div style={{ height: 12, width: 1, background: "var(--ft-border)" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: BALANCE_MOM_CHANGE >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                  {BALANCE_MOM_CHANGE >= 0 ? "+" : "−"}{formatGbp(Math.abs(BALANCE_MOM_CHANGE))} MoM
                </span>
              </div>
              {/* Allocation bar */}
              <div style={{ display: "flex", height: 4, borderRadius: 2, overflow: "hidden", gap: 1 }}>
                {displayAccounts.map((acc, i) => (
                  <div
                    key={acc.id}
                    style={{
                      flex: acc.gbpEquivalent / Math.max(total, 1),
                      background: ACCENT_COLORS[i % ACCENT_COLORS.length],
                      minWidth: 3,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Account signals */}
            {isVisible("signals") && hasMockData && (() => {
              const signals: Array<{ level: "red" | "amber" | "green"; headline: string; detail: string }> = [];
              const optBuffer = OPTIMAL_BUFFER_MONTHS * MOCK_MONTHLY_EXPENSES;
              const currentBal = MOCK_ACCOUNTS[0].gbpEquivalent;
              const idleCash = Math.max(0, currentBal - optBuffer);
              const emergencyMonths = total / Math.max(MOCK_MONTHLY_EXPENSES, 1);

              if (idleCash > 200) {
                const lostYr = Math.round(idleCash * ((MARKET_BEST_RATE - (MOCK_APR["ma1"] ?? 0)) / 100));
                signals.push({ level: "amber", headline: `${formatGbp(idleCash)} idle in current account`, detail: `+${formatGbp(lostYr)}/yr potential at ${MARKET_BEST_RATE}% savings rate` });
              }
              if (emergencyMonths < 3) {
                signals.push({ level: "red", headline: `Emergency fund: ${emergencyMonths.toFixed(1)}mo covered`, detail: "Target 3–6 months of expenses in liquid savings" });
              } else if (emergencyMonths < 6) {
                signals.push({ level: "green", headline: `Emergency fund: ${emergencyMonths.toFixed(1)}mo covered`, detail: "Within target range (3–6 months)" });
              } else {
                signals.push({ level: "amber", headline: `${emergencyMonths.toFixed(1)}mo expenses as emergency fund`, detail: "Consider investing excess above 6-month buffer" });
              }
              const savingsAccs = MOCK_ACCOUNTS.filter(a => (MOCK_APR[a.id] ?? 0) >= MARKET_BEST_RATE - 0.5);
              if (savingsAccs.length === 0) {
                signals.push({ level: "amber", headline: `No accounts near market best rate (${MARKET_BEST_RATE}%)`, detail: "Market-leading easy-access savings available" });
              }

              const levelColors: Record<string, string> = { red: "var(--ft-red)", amber: "var(--ft-accent)", green: "var(--ft-green)" };
              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ padding: "7px 14px", borderBottom: "1px solid var(--ft-border)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Account Signals</span>
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

            {/* Per-account list */}
            {isVisible("per-account") && <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
              {displayAccounts.map((acc, i) => {
                const color        = ACCENT_COLORS[i % ACCENT_COLORS.length];
                const shareOfTotal = total > 0 ? (acc.gbpEquivalent / total) * 100 : 0;
                const isLast       = i === displayAccounts.length - 1;

                return (
                  <div key={acc.id} style={{ borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
                    <div style={{ height: 2, background: color, opacity: 0.7 }} />
                    <div style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ft-text)" }}>{acc.name}</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                              {acc.currency}{acc.isWiseLinked ? " · WISE" : ""}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {hasMockData && ACCOUNT_HISTORY[acc.id] && (
                            <MiniSparkLine
                              data={ACCOUNT_HISTORY[acc.id]}
                              width={52}
                              height={22}
                              positive={ACCOUNT_HISTORY[acc.id][ACCOUNT_HISTORY[acc.id].length - 1] >= ACCOUNT_HISTORY[acc.id][0]}
                            />
                          )}
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--ft-text)" }}>
                              {mask(acc.gbpEquivalent)}
                            </div>
                            {acc.currency !== "GBP" && !privacy && (
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
                                {acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {total > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 2, background: "var(--ft-raised)", borderRadius: 1, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${shareOfTotal}%`, background: color, borderRadius: 1 }} />
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", width: 32, textAlign: "right" }}>
                            {shareOfTotal.toFixed(0)}%
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>}

            {/* Currency exposure */}
            {isVisible("currency") && (() => {
              const byCurrency: Record<string, number> = {};
              for (const acc of displayAccounts) {
                byCurrency[acc.currency] = (byCurrency[acc.currency] ?? 0) + acc.gbpEquivalent;
              }
              const entries = Object.entries(byCurrency).sort((a, b) => b[1] - a[1]);
              const CUR_COLORS: Record<string, string> = { GBP: "#10B981", EUR: "#3B82F6", USD: "var(--ft-amber)", BTC: "#F97316" };
              return entries.length > 1 ? (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ padding: "11px 16px 0", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 10 }}>
                    Currency exposure
                  </div>
                  {entries.map(([cur, gbp], i) => {
                    const color = CUR_COLORS[cur] ?? ACCENT_COLORS[i % ACCENT_COLORS.length];
                    const pct = total > 0 ? (gbp / total) * 100 : 0;
                    const isLast = i === entries.length - 1;
                    return (
                      <div key={cur} style={{ padding: "8px 16px", borderBottom: isLast ? "0 0 16px 16px" : "1px solid var(--ft-border)", borderTop: "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color, minWidth: 32 }}>{cur}</div>
                          <div style={{ flex: 1, height: 5, background: "var(--ft-raised)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, opacity: 0.8 }} />
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-text)", minWidth: 70, textAlign: "right" }}>{mask(gbp)}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", minWidth: 28, textAlign: "right" }}>{pct.toFixed(0)}%</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null;
            })()}

            {/* Multi-account balance trend */}
            {isVisible("balance-trend") && hasMockData && (() => {
              const ids = Object.keys(ACCOUNT_HISTORY);
              const n = BALANCE_HISTORY.length;
              const totals = Array.from({ length: n }, (_, i) =>
                ids.reduce((s, id) => s + (ACCOUNT_HISTORY[id]?.[i] ?? 0), 0)
              );
              const yMax = Math.max(...totals) * 1.08;
              const W = 300, H = 76, PX = 6, PY = 8;
              const xOf = (i: number) => PX + (i / (n - 1)) * (W - 2 * PX);
              const yOf = (v: number) => PY + (1 - v / yMax) * (H - 2 * PY);
              const lineFor = (vals: number[]) =>
                `M ${vals.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" L ")}`;
              const months = Array.from({ length: n }, (_, i) => {
                const d = new Date(); d.setMonth(d.getMonth() - (n - 1 - i));
                return d.toLocaleString("default", { month: "short" });
              });
              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 10px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                      Balance trend · 6m
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-green)" }}>
                      {BALANCE_6M_CHANGE >= 0 ? "+" : "−"}{formatGbp(Math.abs(BALANCE_6M_CHANGE))}
                    </div>
                  </div>
                  <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
                    <defs>
                      <linearGradient id="acc-trend-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--ft-accent)" stopOpacity="0.14" />
                        <stop offset="100%" stopColor="var(--ft-accent)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {/* Y guide lines */}
                    {[0.5].map(f => {
                      const gy = yOf(yMax * f);
                      return (
                        <g key={f}>
                          <line x1={PX} y1={gy} x2={W - PX} y2={gy} stroke="var(--ft-border)" strokeWidth="0.4" />
                          {!privacy && <text x={PX + 2} y={gy - 2} fill="var(--ft-dim)" fontSize="5.5" opacity="0.6">{mask(Math.round(yMax * f))}</text>}
                        </g>
                      );
                    })}
                    {/* Total area fill */}
                    <path
                      d={`${lineFor(totals)} L ${xOf(n - 1).toFixed(1)},${H} L ${PX},${H} Z`}
                      fill="url(#acc-trend-grad)"
                    />
                    {/* Individual account lines */}
                    {ids.map((id, idx) => {
                      const vals = ACCOUNT_HISTORY[id];
                      if (!vals) return null;
                      return <path key={id} d={lineFor(vals)} fill="none" stroke={ACCENT_COLORS[idx % ACCENT_COLORS.length]} strokeWidth="1" strokeLinejoin="round" opacity="0.6" />;
                    })}
                    {/* Total line */}
                    <path d={lineFor(totals)} fill="none" stroke="var(--ft-accent)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
                    {/* End-point dots */}
                    {ids.map((id, idx) => {
                      const vals = ACCOUNT_HISTORY[id];
                      if (!vals) return null;
                      return <circle key={id} cx={xOf(n - 1)} cy={yOf(vals[n - 1])} r={1.8} fill={ACCENT_COLORS[idx % ACCENT_COLORS.length]} opacity="0.7" />;
                    })}
                    <circle cx={xOf(n - 1)} cy={yOf(totals[n - 1])} r={3} fill="var(--ft-accent)" />
                    {/* X month labels */}
                    {[0, Math.floor((n - 1) / 2), n - 1].map(i => (
                      <text key={i} x={xOf(i)} y={H + 10} fill="var(--ft-dim)" fontSize="5.5" textAnchor="middle">{months[i]}</text>
                    ))}
                  </svg>
                  {/* Legend */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", marginTop: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 16, height: 2, background: "var(--ft-accent)", borderRadius: 1 }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>Total</span>
                    </div>
                    {MOCK_ACCOUNTS.map((acc, idx) => (
                      <div key={acc.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 12, height: 1.5, background: ACCENT_COLORS[idx % ACCENT_COLORS.length], borderRadius: 1, opacity: 0.7 }} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>{acc.name.split(" ")[0]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Cash drag analysis */}
            {isVisible("cash-drag") && hasMockData && (() => {
              const optimalBuffer = OPTIMAL_BUFFER_MONTHS * MOCK_MONTHLY_EXPENSES;
              const currentAccs = [MOCK_ACCOUNTS[0]]; // Monzo Current
              const totalCurrent = currentAccs.reduce((s, a) => s + a.gbpEquivalent, 0);
              const idleCash = Math.max(0, totalCurrent - optimalBuffer);
              const currentWeightedAPR = MOCK_APR["ma1"] ?? 0;
              const opportunityCost = idleCash * ((MARKET_BEST_RATE - currentWeightedAPR) / 100);
              if (idleCash < 50) return null;
              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "13px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                      Cash drag
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-accent)", fontWeight: 700 }}>
                      +{formatGbp(opportunityCost)}/yr potential
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                    <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "8px 10px" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Idle cash</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-accent)" }}>{formatGbp(idleCash)}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 1 }}>{currentWeightedAPR}% APR</div>
                    </div>
                    <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "8px 10px" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Buffer</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-green)" }}>{formatGbp(optimalBuffer)}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 1 }}>{OPTIMAL_BUFFER_MONTHS}mo expenses</div>
                    </div>
                    <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "8px 10px" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Best rate</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-green)" }}>{MARKET_BEST_RATE}%</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 1 }}>market best</div>
                    </div>
                  </div>
                  <div style={{ background: "color-mix(in srgb, var(--ft-accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--ft-accent) 20%, transparent)", borderRadius: 2, padding: "7px 10px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-accent)" }}>
                      Moving {formatGbp(idleCash)} to a {MARKET_BEST_RATE}% account could earn +{formatGbp(opportunityCost)}/yr more
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Yield Optimizer */}
            {isVisible("yield-optimizer") && hasMockData && (() => {
              const rows = MOCK_ACCOUNTS.map(acc => {
                const apr  = MOCK_APR[acc.id] ?? 0;
                const actualYield  = acc.gbpEquivalent * (apr / 100);
                const optimalYield = acc.gbpEquivalent * (MARKET_BEST_RATE / 100);
                const missed = Math.max(0, optimalYield - actualYield);
                const status = apr >= MARKET_BEST_RATE * 0.9 ? "optimal" : apr >= MARKET_BEST_RATE * 0.5 ? "fair" : "low";
                const statusColor = status === "optimal" ? "var(--ft-green)" : status === "fair" ? "var(--ft-accent)" : "var(--ft-red)";
                return { ...acc, apr, actualYield, optimalYield, missed, status, statusColor };
              }).sort((a, b) => b.missed - a.missed);

              const totalMissed = rows.reduce((s, r) => s + r.missed, 0);
              const totalActual = rows.reduce((s, r) => s + r.actualYield, 0);

              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 3, overflow: "hidden", opacity: 0.85 }}>
                  <div style={{ padding: "9px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Yield Optimizer</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                      best rate: <span style={{ color: "var(--ft-green)", fontWeight: 700 }}>{MARKET_BEST_RATE}%</span>
                    </span>
                  </div>
                  {rows.map((r, i) => {
                    const isLast = i === rows.length - 1;
                    return (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
                        <div style={{ width: 5, height: 5, borderRadius: 3, background: r.statusColor, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: r.statusColor, flexShrink: 0, marginLeft: 6 }}>
                              {r.apr > 0 ? `${r.apr}%` : "0%"}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                              {mask ? mask(r.actualYield) : formatGbp(r.actualYield)}/yr
                            </span>
                            {r.missed > 0 && (
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-red)" }}>
                                · −{formatGbp(r.missed)}/yr vs best
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ padding: "6px 14px 8px", borderTop: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: totalMissed > 50 ? "var(--ft-accent)" : "var(--ft-dim)" }}>
                      {totalMissed > 10
                        ? `${formatGbp(totalMissed)}/yr left on table vs market best`
                        : `Earning ${formatGbp(totalActual)}/yr · near-optimal allocation`
                      }
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>
                      {formatGbp(totalActual)}/yr actual
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Projected interest */}
            {isVisible("projected-interest") && hasMockData && (() => {
              const yieldEntries = MOCK_ACCOUNTS
                .filter(acc => (MOCK_APR[acc.id] ?? 0) > 0)
                .map(acc => ({ id: acc.id, name: acc.name, apr: MOCK_APR[acc.id] ?? 0, annualYield: acc.gbpEquivalent * ((MOCK_APR[acc.id] ?? 0) / 100) }));
              const totalYield = yieldEntries.reduce((s, e) => s + e.annualYield, 0);
              if (yieldEntries.length === 0) return null;
              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ padding: "11px 16px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                      Projected interest
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-green)" }}>{formatGbp(totalYield)}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>/yr · {formatGbp(totalYield / 12)}/mo</span>
                    </div>
                  </div>
                  {yieldEntries.map((e, i) => (
                    <div key={e.id} style={{ padding: "8px 16px", borderBottom: i < yieldEntries.length - 1 ? "1px solid var(--ft-border)" : "none", display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, fontSize: 11, color: "var(--ft-dim)" }}>{e.name}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>{e.apr}% APR</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-green)", minWidth: 60, textAlign: "right" }}>{formatGbp(e.annualYield)}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* 5Y compound growth projection */}
            {isVisible("compound-growth") && hasMockData && (() => {
              const savingsAccs = MOCK_ACCOUNTS.filter(acc => (MOCK_APR[acc.id] ?? 0) > 0);
              const savingsTotal = savingsAccs.reduce((s, a) => s + a.gbpEquivalent, 0);
              if (savingsTotal === 0) return null;
              const weightedAPR = savingsAccs.reduce((s, a) => s + a.gbpEquivalent * (MOCK_APR[a.id] ?? 0), 0) / savingsTotal;
              const months      = 60;
              const project     = (rate: number, m: number) => savingsTotal * Math.pow(1 + rate / 100 / 12, m);
              const W = 300, H = 72, PX = 6, PY = 8;
              const yMax = project(MARKET_BEST_RATE, months) * 1.04;
              const yMin = savingsTotal * 0.98;
              const xOf  = (m: number) => PX + (m / months) * (W - 2 * PX);
              const yOf  = (v: number) => PY + (1 - (v - yMin) / (yMax - yMin)) * (H - 2 * PY);
              const pathFor = (rate: number) =>
                `M ${Array.from({ length: months + 1 }, (_, m) => `${xOf(m).toFixed(1)},${yOf(project(rate, m)).toFixed(1)}`).join(" L ")}`;
              const bestPts    = Array.from({ length: months + 1 }, (_, m) => `${xOf(m).toFixed(1)},${yOf(project(MARKET_BEST_RATE, m)).toFixed(1)}`);
              const currRevPts = Array.from({ length: months + 1 }, (_, m) => `${xOf(months - m).toFixed(1)},${yOf(project(weightedAPR, months - m)).toFixed(1)}`);
              const fillPath   = `M ${bestPts.join(" L ")} L ${currRevPts.join(" L ")} Z`;
              const gapAtEnd   = Math.round(project(MARKET_BEST_RATE, months) - project(weightedAPR, months));
              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>5Y growth projection</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-green)" }}>+{formatGbp(gapAtEnd)} rate gap</span>
                  </div>
                  <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
                    <defs>
                      <linearGradient id="cgp-gap" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--ft-green)" stopOpacity="0.16" />
                        <stop offset="100%" stopColor="var(--ft-green)" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>
                    {[1, 2, 3, 4].map(yr => (
                      <line key={yr} x1={xOf(yr * 12)} y1={PY} x2={xOf(yr * 12)} y2={H - PY} stroke="var(--ft-border)" strokeWidth="0.4" strokeDasharray="2 2" />
                    ))}
                    <path d={fillPath} fill="url(#cgp-gap)" />
                    <path d={pathFor(weightedAPR)} fill="none" stroke="var(--ft-dim)" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.7" />
                    <path d={pathFor(MARKET_BEST_RATE)} fill="none" stroke="var(--ft-green)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
                    <circle cx={xOf(months)} cy={yOf(project(weightedAPR, months))} r={2.5} fill="var(--ft-dim)" opacity="0.7" />
                    <circle cx={xOf(months)} cy={yOf(project(MARKET_BEST_RATE, months))} r={3} fill="var(--ft-green)" />
                    {[0, 1, 2, 3, 4, 5].map(yr => (
                      <text key={yr} x={xOf(yr * 12)} y={H + 10} fill="var(--ft-dim)" fontSize="5.5" textAnchor="middle">{yr === 0 ? "Now" : `${yr}Y`}</text>
                    ))}
                  </svg>
                  <div style={{ display: "flex", gap: 12, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--ft-border)", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 16, height: 2, background: "var(--ft-dim)", borderRadius: 1, opacity: 0.6 }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>Current {weightedAPR.toFixed(1)}%</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 16, height: 2, background: "var(--ft-green)", borderRadius: 1 }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>Market best {MARKET_BEST_RATE}%</span>
                    </div>
                    <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-green)", fontWeight: 700 }}>
                      {formatGbp(Math.round(project(MARKET_BEST_RATE, months)))} at 5Y
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* FSCS protection monitor */}
            {isVisible("fscs") && (() => {
              const FSCS_LIMIT   = 85000;
              const FSCS_WARNING = 50000;
              const instMap: Record<string, number> = {};
              for (const acc of displayAccounts) {
                const inst = acc.name.split(" ")[0];
                instMap[inst] = (instMap[inst] ?? 0) + acc.gbpEquivalent;
              }
              const entries = Object.entries(instMap).sort((a, b) => b[1] - a[1]);
              const totalProtected = entries.reduce((s, [, v]) => s + Math.min(v, FSCS_LIMIT), 0);
              const hasOver = entries.some(([, v]) => v > FSCS_LIMIT);
              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                      FSCS protection
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: hasOver ? "var(--ft-red)" : "var(--ft-green)" }}>
                      {formatGbp(totalProtected)} covered
                    </span>
                  </div>
                  {entries.map(([inst, amount], i) => {
                    const pct    = (amount / FSCS_LIMIT) * 100;
                    const over   = amount > FSCS_LIMIT;
                    const warn   = amount > FSCS_WARNING;
                    const color  = over ? "var(--ft-red)" : warn ? "var(--ft-accent)" : "var(--ft-green)";
                    const isLast = i === entries.length - 1;
                    return (
                      <div key={inst} style={{ padding: "9px 16px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ft-text)" }}>{inst}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color, fontWeight: 700 }}>
                            {over ? `${formatGbp(amount - FSCS_LIMIT)} unprotected` : "fully protected"}
                          </span>
                        </div>
                        <div style={{ height: 3, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 2, opacity: 0.8 }} />
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
                          {mask(amount)} · {pct.toFixed(1)}% of £85k limit
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ padding: "7px 16px", background: "var(--ft-raised)", borderTop: "1px solid var(--ft-border)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>
                      FSCS protects up to £85,000 per authorised institution per person
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Interest rate sensitivity */}
            {isVisible("interest-sensitivity") && hasMockData && (() => {
              const savingsAccounts = MOCK_ACCOUNTS.filter(a => (MOCK_APR[a.id] ?? 0) > 0);
              const currentAnnualInterest = savingsAccounts.reduce((s, a) => {
                return s + a.gbpEquivalent * (MOCK_APR[a.id]! / 100);
              }, 0);
              const SCENARIOS = [
                { label: "−0.5% cut",  delta: -0.5, color: "var(--ft-red)" },
                { label: "−0.25%",     delta: -0.25, color: "var(--ft-accent)" },
                { label: "+0.25%",     delta: +0.25, color: "var(--ft-green)" },
                { label: "+0.5% hike", delta: +0.5,  color: "#10B981" },
              ];
              const scenarios = SCENARIOS.map(s => {
                const newInterest = savingsAccounts.reduce((tot, a) => {
                  const newRate = Math.max(0, (MOCK_APR[a.id] ?? 0) + s.delta);
                  return tot + a.gbpEquivalent * (newRate / 100);
                }, 0);
                return { ...s, newInterest, impact: newInterest - currentAnnualInterest };
              });
              const maxImpact = Math.max(...scenarios.map(s => Math.abs(s.impact)), 1);
              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 3, overflow: "hidden", opacity: 0.85 }}>
                  <div style={{ padding: "9px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Rate sensitivity</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-text)", fontWeight: 600 }}>
                      {formatGbp(currentAnnualInterest)}/yr current
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {scenarios.map((s, i) => {
                      const barW = (Math.abs(s.impact) / maxImpact) * 40;
                      const isLast = i === scenarios.length - 1;
                      return (
                        <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", minWidth: 66 }}>{s.label}</span>
                          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4 }}>
                            <div style={{ height: 4, background: "var(--ft-raised)", borderRadius: 2, flex: 1, overflow: "hidden", position: "relative" }}>
                              <div style={{
                                position: "absolute", top: 0, bottom: 0,
                                left: s.impact >= 0 ? "50%" : `${50 - barW}%`,
                                width: `${barW}%`,
                                background: s.color, borderRadius: 2,
                              }} />
                              <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "var(--ft-border)" }} />
                            </div>
                          </div>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: s.color, minWidth: 52, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {s.impact >= 0 ? "+" : "−"}{formatGbp(Math.abs(s.impact))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ padding: "7px 14px", borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                    BoE base rate scenarios · annual interest income impact
                  </div>
                </div>
              );
            })()}

            {/* ISA Allowance Tracker */}
            {isVisible("isa-tracker") && hasMockData && (() => {
              const today = new Date();
              const ISA_ANNUAL    = 20000;
              const TY_START      = new Date("2026-04-06T00:00:00");
              const TY_END        = new Date("2027-04-05T23:59:59");
              const MOCK_ISA_USED = 5400;
              const remaining     = ISA_ANNUAL - MOCK_ISA_USED;
              const usedPct       = (MOCK_ISA_USED / ISA_ANNUAL) * 100;
              const yearProgress  = Math.min(1, (today.getTime() - TY_START.getTime()) / (TY_END.getTime() - TY_START.getTime()));
              const pace          = yearProgress > 0 ? (MOCK_ISA_USED / ISA_ANNUAL) / yearProgress : 1;
              const paceLabel     = pace >= 1.1 ? "Ahead of pace" : pace >= 0.85 ? "On pace" : "Behind pace";
              const paceColor     = pace >= 0.85 ? "var(--ft-green)" : "var(--ft-accent)";
              const monthsLeft    = Math.round((TY_END.getTime() - today.getTime()) / (30.44 * 86400000));
              const monthlyNeeded = monthsLeft > 0 ? Math.round(remaining / monthsLeft) : remaining;
              const taxSaved      = Math.round(remaining * 0.04 * 0.20);
              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>ISA Allowance</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: paceColor }}>{paceLabel}</span>
                  </div>
                  <div style={{ padding: "12px 14px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-text)", fontVariantNumeric: "tabular-nums" }}>{formatGbp(MOCK_ISA_USED)} used</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>of {formatGbp(ISA_ANNUAL)}</span>
                    </div>
                    <div style={{ height: 8, background: "var(--ft-raised)", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
                      <div style={{ height: "100%", width: `${usedPct}%`, background: "var(--ft-green)", borderRadius: 4, opacity: 0.85 }} />
                    </div>
                    <div style={{ height: 2, background: "var(--ft-raised)", borderRadius: 1, overflow: "hidden", marginBottom: 5 }}>
                      <div style={{ height: "100%", width: `${yearProgress * 100}%`, background: "var(--ft-accent)", borderRadius: 1, opacity: 0.5 }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-green)" }}>used {usedPct.toFixed(0)}%</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-accent)" }}>tax year {(yearProgress * 100).toFixed(0)}% elapsed</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>{formatGbp(remaining)} left</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "8px 10px" }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>To maximise</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)", fontVariantNumeric: "tabular-nums" }}>{mask(monthlyNeeded)}/mo</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", marginTop: 1 }}>{monthsLeft}mo remaining</div>
                      </div>
                      <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "8px 10px" }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Tax saved est.</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-green)", fontVariantNumeric: "tabular-nums" }}>{formatGbp(taxSaved)}/yr</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", marginTop: 1 }}>vs taxable acct</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: "5px 14px 7px", borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>
                    2026/27 tax year · £20,000 annual ISA allowance · est. only
                  </div>
                </div>
              );
            })()}

            {/* Emergency fund coverage */}
            {isVisible("emergency-fund") && hasMockData && (() => {
              const totalMonths = total / MOCK_MONTHLY_EXPENSES;
              const liquidBal = displayAccounts.find(a => a.name.toLowerCase().includes("current"))?.gbpEquivalent ?? 0;
              const liquidMonths = liquidBal / MOCK_MONTHLY_EXPENSES;
              const status = liquidMonths >= 6 ? "optimal" : liquidMonths >= 3 ? "adequate" : "low";
              const statusColor = status === "optimal" ? "var(--ft-green)" : status === "adequate" ? "var(--ft-accent)" : "var(--ft-red)";
              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderLeft: `3px solid ${statusColor}`, borderRadius: 3, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Emergency fund</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: statusColor, letterSpacing: "0.06em", textTransform: "uppercase" }}>{status}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 9 }}>
                    {[
                      { label: "Liquid coverage", val: liquidMonths.toFixed(1), sub: `${mask(liquidBal)} current acct`, col: statusColor },
                      { label: "Total coverage", val: totalMonths.toFixed(1), sub: "all accounts", col: "var(--ft-text)" },
                    ].map(r => (
                      <div key={r.label}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{r.label}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: r.col, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                          {r.val}<span style={{ fontSize: 10, fontWeight: 400 }}> mo</span>
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", marginTop: 2 }}>{r.sub}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ position: "relative", height: 5, background: "var(--ft-raised)", borderRadius: 2, marginBottom: 5 }}>
                    <div style={{ height: "100%", width: `${Math.min(100, (liquidMonths / 6) * 100)}%`, background: statusColor, borderRadius: 2, opacity: 0.75 }} />
                    <div style={{ position: "absolute", top: -2, left: "50%", width: 1.5, height: 9, background: "var(--ft-dim)", opacity: 0.45 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>0</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>3 mo target</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>6 mo optimal</span>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>
                    based on {formatGbp(MOCK_MONTHLY_EXPENSES)}/mo expenses · liquid = current accounts only
                  </div>
                </div>
              );
            })()}

            {/* Account concentration risk */}
            {isVisible("concentration") && hasMockData && (() => {
              const sorted = [...displayAccounts].sort((a, b) => b.gbpEquivalent - a.gbpEquivalent);
              const maxPct = Math.round(sorted[0].gbpEquivalent / total * 100);
              const col = maxPct > 80 ? "var(--ft-red)" : maxPct > 60 ? "var(--ft-accent)" : "var(--ft-green)";
              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "10px 14px", marginBottom: 10, opacity: 0.85 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Concentration risk</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: col }}>{maxPct > 60 ? `${maxPct}% in ${sorted[0].name.split(" ")[0]}` : "well spread"}</span>
                  </div>
                  <div style={{ display: "flex", height: 10, borderRadius: 2, overflow: "hidden", gap: 1, marginBottom: 7 }}>
                    {sorted.map((a, i) => <div key={a.id} style={{ flex: a.gbpEquivalent, background: ACCENT_COLORS[i % ACCENT_COLORS.length], minWidth: 2 }} />)}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px" }}>
                    {sorted.map((a, i) => <span key={a.id} style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: ACCENT_COLORS[i % ACCENT_COLORS.length], fontVariantNumeric: "tabular-nums" }}>{a.name.split(" ")[0]} {Math.round(a.gbpEquivalent / total * 100)}%</span>)}
                  </div>
                </div>
              );
            })()}

            <a href="/accounts" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", textDecoration: "none" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Manage accounts</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)" }}>→</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

