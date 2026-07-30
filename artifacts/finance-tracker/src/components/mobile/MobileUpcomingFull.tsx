import { useListUpcoming, useGetUpcomingSummary, type UpcomingItem } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";
import { useWidgetVisibility } from "@/hooks/use-widget-visibility";
import { WidgetManagerButton } from "./MobileWidgetManager";

function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
}

const MOCK_UPCOMING: UpcomingItem[] = [
  { id: 1001, description: "Salary",        category: "Income",        type: "income",  gbpEquivalent: 3200,   dueDate: daysFromNow(2),  status: "pending" },
  { id: 1002, description: "Rent",          category: "Housing",       type: "expense", gbpEquivalent: -1400,  dueDate: daysFromNow(5),  status: "pending" },
  { id: 1003, description: "Netflix",       category: "Entertainment", type: "expense", gbpEquivalent: -15.99, dueDate: daysFromNow(9),  status: "pending" },
  { id: 1004, description: "iCloud+",       category: "Subscriptions", type: "expense", gbpEquivalent: -2.99,  dueDate: daysFromNow(12), status: "pending" },
  { id: 1005, description: "Car Insurance", category: "Insurance",     type: "expense", gbpEquivalent: -89,    dueDate: daysFromNow(18), status: "pending" },
  { id: 1006, description: "Gym",           category: "Health",        type: "expense", gbpEquivalent: -40,    dueDate: daysFromNow(25), status: "pending" },
] as unknown as UpcomingItem[];

const MOCK_SUMMARY = {
  committedOutgoings30d: 1400 + 15.99 + 2.99 + 89 + 40,
  expectedIncome30d: 3200,
};

const UPCOMING_WIDGETS = [
  { id: "weekly-bars",        label: "Weekly cash flow bars" },
  { id: "payment-map",        label: "30-day payment map" },
  { id: "bill-concentration", label: "Bill concentration score" },
  { id: "stress",             label: "Bill stress index" },
  { id: "cash-cushion",       label: "Cash cushion risk" },
  { id: "categories",         label: "Bill category breakdown" },
  { id: "delay-stress",       label: "Income delay stress test" },
  { id: "savings-window",     label: "Savings window detector" },
  { id: "necessity",          label: "Bill necessity split" },
  { id: "bill-velocity",      label: "Bill load velocity" },
];

export function MobileUpcomingFull({ onBack }: { onBack?: () => void }) {
  const { data: items = [], isLoading } = useListUpcoming();
  const { data: summary } = useGetUpcomingSummary();

  const hasMockData = !isLoading && items.length === 0;
  const displayItems   = hasMockData ? MOCK_UPCOMING : items;
  const displaySummary = hasMockData ? MOCK_SUMMARY  : summary;

  const now  = new Date();
  const in7  = new Date(now); in7.setDate(now.getDate() + 7);
  const in30 = new Date(now); in30.setDate(now.getDate() + 30);

  const pending  = displayItems.filter(i => i.status === "pending");
  const soon     = pending.filter(i => new Date(i.dueDate) <= in7);
  const later    = pending.filter(i => new Date(i.dueDate) > in7 && new Date(i.dueDate) <= in30);
  const netFlow30 = displaySummary ? displaySummary.expectedIncome30d - displaySummary.committedOutgoings30d : null;
  const { isVisible, toggle, resetAll, visible, hiddenCount } = useWidgetVisibility("upcoming-full", UPCOMING_WIDGETS);

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
          Upcoming
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
            {pending.length} pending{hasMockData && " · preview"}
          </div>
          <WidgetManagerButton widgets={UPCOMING_WIDGETS} visible={visible} onToggle={toggle} onReset={resetAll} hiddenCount={hiddenCount} />
        </div>
      </div>

      <div className="mobile-scroll" style={{ flex: 1, overflowY: "auto", padding: "0 16px", paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 16px)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Summary hero card */}
          {displaySummary && (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 20, overflow: "hidden", opacity: hasMockData ? 0.85 : 1 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 5 }}>Bills 30d</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: "var(--ft-red)" }}>{formatGbp(displaySummary.committedOutgoings30d)}</div>
                </div>
                <div style={{ padding: "14px 16px", borderLeft: "1px solid var(--ft-border)" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 5 }}>Income 30d</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: "var(--ft-green)" }}>{formatGbp(displaySummary.expectedIncome30d)}</div>
                </div>
                <div style={{ padding: "14px 12px", borderLeft: "1px solid var(--ft-border)" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 5 }}>Net</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: netFlow30 !== null && netFlow30 >= 0 ? "var(--ft-green)" : "var(--ft-red)", whiteSpace: "nowrap" }}>
                    {netFlow30 !== null ? (netFlow30 >= 0 ? "+" : "−") + formatGbp(Math.abs(netFlow30)) : "—"}
                  </div>
                </div>
              </div>
              {displaySummary.expectedIncome30d > 0 && (
                <div style={{ padding: "0 16px 14px" }}>
                  <div style={{ height: 3, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
                    <div style={{
                      height: "100%",
                      width: `${Math.min(100, (displaySummary.committedOutgoings30d / displaySummary.expectedIncome30d) * 100)}%`,
                      background: "var(--ft-red)", borderRadius: 2, opacity: 0.7,
                    }} />
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                    Bills = {((displaySummary.committedOutgoings30d / displaySummary.expectedIncome30d) * 100).toFixed(0)}% of expected income
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cumulative balance projection — 30-day cash flow curve */}
          {!isLoading && pending.length > 0 && (() => {
            const MOCK_CURRENT_BALANCE = 3420; // current account balance
            const W = 100; const H = 64;

            // Build day-by-day cumulative balance
            const dayBalances: number[] = [];
            let running = MOCK_CURRENT_BALANCE;
            let minBal = running; let maxBal = running;
            for (let d = 0; d <= 30; d++) {
              const dayDate = new Date(now.getTime() + d * 86400000).toISOString().slice(0, 10);
              const dayEvents = pending.filter(i => i.dueDate === dayDate);
              for (const ev of dayEvents) running += (ev.gbpEquivalent ?? 0);
              dayBalances.push(running);
              if (running < minBal) minBal = running;
              if (running > maxBal) maxBal = running;
            }
            const range = Math.max(maxBal - minBal, 100);
            const scaleX = (d: number) => (d / 30) * W;
            const scaleY = (v: number) => H - 2 - ((v - minBal) / range) * (H - 4);
            const pts = dayBalances.map((v, d) => `${scaleX(d)},${scaleY(v)}`).join(" ");
            const area = `${pts} ${W},${H} 0,${H}`;
            const endBal = dayBalances[dayBalances.length - 1];
            const balanceGain = endBal - MOCK_CURRENT_BALANCE;

            // Find the salary income day (largest single +ve jump)
            const salaryDay = pending.reduce((best, item) => {
              if ((item.gbpEquivalent ?? 0) > 0) {
                const d = Math.round((new Date(item.dueDate).getTime() - now.getTime()) / 86400000);
                if (!best || (item.gbpEquivalent ?? 0) > (best.amount ?? 0)) return { d, amount: item.gbpEquivalent ?? 0 };
              }
              return best;
            }, null as { d: number; amount: number } | null);

            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 16, padding: "12px 14px 10px", opacity: hasMockData ? 0.85 : 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Balance projection · 30d
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: balanceGain >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                    {balanceGain >= 0 ? "+" : "−"}{formatGbp(Math.abs(balanceGain))} 30d
                  </div>
                </div>
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}>
                  <defs>
                    <linearGradient id="cf-ag" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--ft-accent)" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="var(--ft-accent)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {/* Zero line (current balance) — visual reference */}
                  <line x1="0" y1={scaleY(MOCK_CURRENT_BALANCE)} x2={W} y2={scaleY(MOCK_CURRENT_BALANCE)}
                    stroke="var(--ft-border)" strokeWidth="0.5" strokeDasharray="2 2" />
                  <polygon points={area} fill="url(#cf-ag)" />
                  <polyline points={pts} fill="none" stroke="var(--ft-accent)" strokeWidth="1.5" strokeLinejoin="round" />
                  {/* Salary spike marker */}
                  {salaryDay && (
                    <line x1={scaleX(salaryDay.d)} y1="0" x2={scaleX(salaryDay.d)} y2={H}
                      stroke="var(--ft-green)" strokeWidth="0.8" strokeDasharray="2 1" opacity="0.5" />
                  )}
                </svg>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>Now · {formatGbp(MOCK_CURRENT_BALANCE)}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>+30d</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--ft-text)" }}>{formatGbp(endBal)}</span>
                </div>
              </div>
            );
          })()}

          {/* Weekly cash flow bars */}
          {isVisible("weekly-bars") && !isLoading && pending.length > 0 && (() => {
            const CHART_H = 52;
            const weeks = [0, 1, 2, 3].map(w => {
              const start = new Date(now.getTime() + w * 7 * 86400000);
              const end   = new Date(now.getTime() + (w + 1) * 7 * 86400000 - 1);
              const net   = pending
                .filter(i => { const d = new Date(i.dueDate); return d >= start && d <= end; })
                .reduce((s, i) => s + (i.gbpEquivalent ?? 0), 0);
              return { label: `W${w + 1}`, net };
            });
            const maxAbs = Math.max(...weeks.map(w => Math.abs(w.net)), 1);
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 16, padding: "13px 16px 10px", opacity: hasMockData ? 0.85 : 1 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 14 }}>
                  30-day cash flow · weekly net
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: CHART_H }}>
                  {weeks.map(w => {
                    const barH = Math.max(4, Math.round((Math.abs(w.net) / maxAbs) * CHART_H));
                    const pos  = w.net >= 0;
                    return (
                      <div key={w.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ height: CHART_H - barH }} />
                        <div style={{ width: "100%", height: barH, background: pos ? "var(--ft-green)" : "var(--ft-red)", borderRadius: "3px 3px 0 0", opacity: 0.75 }} />
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  {weeks.map(w => {
                    const pos = w.net >= 0;
                    return (
                      <div key={w.label} style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", marginBottom: 1 }}>{w.label}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: w.net === 0 ? "var(--ft-dim)" : pos ? "var(--ft-green)" : "var(--ft-red)" }}>
                          {w.net === 0 ? "—" : (pos ? "+" : "−") + formatGbp(Math.abs(w.net))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* 30-day payment map */}
          {isVisible("payment-map") && !isLoading && pending.length > 0 && (() => {
            const BAR_H = 44;
            const dayData = Array.from({ length: 30 }, (_, d) => {
              const dateStr   = new Date(now.getTime() + d * 86400000).toISOString().slice(0, 10);
              const dayItems  = pending.filter(i => i.dueDate === dateStr);
              const absTotal  = dayItems.reduce((s, i) => s + Math.abs(i.gbpEquivalent ?? 0), 0);
              const hasIncome  = dayItems.some(i => (i.gbpEquivalent ?? 0) > 0);
              const hasExpense = dayItems.some(i => (i.gbpEquivalent ?? 0) < 0);
              return { d, absTotal, hasIncome, hasExpense };
            });
            const sqrtMax      = Math.max(...dayData.map(d => Math.sqrt(d.absTotal)), 1);
            const incomeTotal  = pending.filter(i => (i.gbpEquivalent ?? 0) > 0).reduce((s, i) => s + (i.gbpEquivalent ?? 0), 0);
            const expenseTotal = pending.filter(i => (i.gbpEquivalent ?? 0) < 0).reduce((s, i) => s + Math.abs(i.gbpEquivalent ?? 0), 0);
            const activeCount  = dayData.filter(d => d.absTotal > 0).length;
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 16, padding: "12px 14px 10px", opacity: hasMockData ? 0.85 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Payment map · 30d</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>{activeCount} active days</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 1.5, height: BAR_H }}>
                  {dayData.map(day => {
                    if (day.absTotal === 0) {
                      return <div key={day.d} style={{ flex: 1, height: 2, background: "var(--ft-raised)", borderRadius: 1, alignSelf: "center" }} />;
                    }
                    const color = (day.hasIncome && day.hasExpense) ? "var(--ft-accent)" : day.hasIncome ? "var(--ft-green)" : "var(--ft-red)";
                    const barH  = Math.max(3, Math.round((Math.sqrt(day.absTotal) / sqrtMax) * BAR_H * 0.9));
                    return <div key={day.d} style={{ flex: 1, height: barH, background: color, borderRadius: "2px 2px 0 0", opacity: 0.8, alignSelf: "flex-end" }} />;
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                  {["now", "+15d", "+30d"].map((l, i) => (
                    <span key={l} style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textAlign: i === 1 ? "center" : i === 2 ? "right" : "left", flex: 1 }}>{l}</span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--ft-border)" }}>
                  {[
                    { color: "var(--ft-green)",  label: `income ${formatGbp(incomeTotal)}` },
                    { color: "var(--ft-red)",    label: `bills ${formatGbp(expenseTotal)}` },
                    { color: "var(--ft-accent)", label: "mixed" },
                  ].map(s => (
                    <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <div style={{ width: 8, height: 4, background: s.color, borderRadius: 1, opacity: 0.8 }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Bill Concentration Score */}
          {isVisible("bill-concentration") && !isLoading && pending.length > 0 && (() => {
            const billWeeks = [0, 1, 2, 3].map(w => {
              const wStart = new Date(now.getTime() + w * 7 * 86400000);
              const wEnd   = new Date(now.getTime() + (w + 1) * 7 * 86400000);
              const bills  = pending.filter(i => {
                const d = new Date(i.dueDate);
                return d >= wStart && d < wEnd && (i.gbpEquivalent ?? 0) < 0;
              });
              const total  = bills.reduce((s, b) => s + Math.abs(b.gbpEquivalent ?? 0), 0);
              return { week: w + 1, total, count: bills.length };
            });

            const totalBills = billWeeks.reduce((s, w) => s + w.total, 0);
            if (totalBills === 0) return null;

            const hhi = billWeeks.reduce((s, w) => {
              const share = totalBills > 0 ? w.total / totalBills : 0;
              return s + share * share;
            }, 0);

            const peakWeek   = billWeeks.reduce((a, b) => b.total > a.total ? b : a);
            const peakShare  = totalBills > 0 ? (peakWeek.total / totalBills) * 100 : 0;
            const spreadScore = Math.max(0, Math.round((1 - hhi) / (1 - 0.25) * 100));
            const scoreColor  = spreadScore >= 70 ? "var(--ft-green)" : spreadScore >= 40 ? "var(--ft-accent)" : "var(--ft-red)";
            const scoreLabel  = spreadScore >= 70 ? "Well Spread" : spreadScore >= 40 ? "Moderate" : "Concentrated";
            const maxWeekAmt  = Math.max(...billWeeks.map(w => w.total), 1);

            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 16, overflow: "hidden", opacity: hasMockData ? 0.85 : 1 }}>
                <div style={{ padding: "9px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Bill Concentration</span>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: scoreColor }}>{scoreLabel}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>· {spreadScore}/100</span>
                  </div>
                </div>

                {/* Score bar */}
                <div style={{ padding: "8px 14px 6px" }}>
                  <div style={{ height: 4, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden", marginBottom: 3 }}>
                    <div style={{ height: "100%", width: `${spreadScore}%`, background: scoreColor, borderRadius: 2, opacity: 0.8 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-red)" }}>concentrated</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-green)" }}>spread</span>
                  </div>
                </div>

                {/* Week bars */}
                <div style={{ padding: "4px 14px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {billWeeks.map(w => {
                    const pct    = (w.total / maxWeekAmt) * 100;
                    const isPeak = w.week === peakWeek.week && w.total > 0;
                    const col    = isPeak ? (peakShare >= 60 ? "var(--ft-red)" : "var(--ft-accent)") : "var(--ft-dim)";
                    return (
                      <div key={w.week} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: isPeak ? "var(--ft-text)" : "var(--ft-dim)", width: 16, flexShrink: 0 }}>W{w.week}</span>
                        <div style={{ flex: 1, height: 8, background: "var(--ft-raised)", borderRadius: 4, overflow: "hidden" }}>
                          {w.total > 0 && <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 4, opacity: 0.8 }} />}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0, minWidth: 52 }}>
                          {w.total > 0 ? (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: isPeak ? 700 : 500, color: isPeak ? col : "var(--ft-dim)", fontVariantNumeric: "tabular-nums" }}>
                              {formatGbp(w.total)}
                            </span>
                          ) : (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ padding: "6px 14px 8px", borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 7.5, color: peakShare >= 60 ? "var(--ft-accent)" : "var(--ft-dim)" }}>
                  {peakShare >= 60
                    ? `W${peakWeek.week} peak: ${peakShare.toFixed(0)}% of outgoings — consider spreading payments`
                    : `Largest cluster W${peakWeek.week} · ${peakShare.toFixed(0)}% of 30-day outgoings · ${formatGbp(totalBills)} total`
                  }
                </div>
              </div>
            );
          })()}

          {/* Bill Stress Index */}
          {isVisible("stress") && !isLoading && pending.length > 0 && (() => {
            const MOCK_BALANCE = 3420;
            const soonExpenses = pending.filter(i => new Date(i.dueDate) <= in7 && (i.gbpEquivalent ?? 0) < 0);

            const nextIncome = [...pending]
              .filter(i => (i.gbpEquivalent ?? 0) > 0)
              .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
            const daysToIncome = nextIncome
              ? Math.max(0, Math.ceil((new Date(nextIncome.dueDate + "T12:00:00").getTime() - Date.now()) / 86400000))
              : 30;
            const incomeDate     = nextIncome ? new Date(nextIncome.dueDate + "T12:00:00") : in30;
            const billsPreIncome = pending.filter(i => (i.gbpEquivalent ?? 0) < 0 && new Date(i.dueDate + "T12:00:00") < incomeDate);
            const preIncomeAmt   = billsPreIncome.reduce((s, i) => s + Math.abs(i.gbpEquivalent ?? 0), 0);

            let running = MOCK_BALANCE; let trough = running;
            for (let d = 0; d <= 30; d++) {
              const ds = new Date(now.getTime() + d * 86400000).toISOString().slice(0, 10);
              for (const item of pending.filter(i => i.dueDate === ds)) running += (item.gbpEquivalent ?? 0);
              if (running < trough) trough = running;
            }

            const d1 = Math.min(25, (daysToIncome / 14) * 25);
            const d2 = Math.min(25, (preIncomeAmt / Math.max(MOCK_BALANCE, 1)) * 25);
            const d3 = Math.min(25, (soonExpenses.length / 5) * 25);
            const d4 = trough < 0 ? 25 : trough < 200 ? 20 : trough < 500 ? 12 : Math.max(2, Math.min(8, (500 / Math.max(trough, 1)) * 8));

            const stress = Math.round(d1 + d2 + d3 + d4);
            const stressLabel = stress < 20 ? "Calm" : stress < 40 ? "Moderate" : stress < 65 ? "Elevated" : "High";
            const stressColor = stress < 20 ? "var(--ft-green)" : stress < 40 ? "var(--ft-accent)" : stress < 65 ? "#F97316" : "var(--ft-red)";

            const dims = [
              { label: "Days to income",   score: d1, detail: daysToIncome < 30 ? `${daysToIncome}d · ${formatGbp(nextIncome?.gbpEquivalent ?? 0)}` : "none expected" },
              { label: "Bills pre-income", score: d2, detail: billsPreIncome.length > 0 ? `${billsPreIncome.length} bill${billsPreIncome.length > 1 ? "s" : ""} · ${formatGbp(preIncomeAmt)}` : "none" },
              { label: "Week load",        score: d3, detail: `${soonExpenses.length} expense${soonExpenses.length !== 1 ? "s" : ""} due` },
              { label: "Balance floor",    score: d4, detail: `${formatGbp(trough)} trough in 30d` },
            ];

            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 16, overflow: "hidden", opacity: hasMockData ? 0.85 : 1 }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Bill Stress Index</span>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: stressColor, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{stress}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>/100 · {stressLabel}</span>
                  </div>
                </div>
                <div style={{ padding: "10px 14px 8px" }}>
                  <div style={{ height: 4, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden", marginBottom: 10 }}>
                    <div style={{ height: "100%", width: `${stress}%`, background: stressColor, borderRadius: 2, opacity: 0.85 }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {dims.map(dim => (
                      <div key={dim.label}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-text)" }}>{dim.label}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>{dim.detail}</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: stressColor, fontVariantNumeric: "tabular-nums" }}>{Math.round(dim.score)}/25</span>
                          </div>
                        </div>
                        <div style={{ height: 3, background: "var(--ft-raised)", borderRadius: 1.5 }}>
                          <div style={{ height: "100%", width: `${(dim.score / 25) * 100}%`, background: stressColor, borderRadius: 1.5, opacity: 0.75 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ padding: "5px 14px 7px", borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>
                  composite · income timing · pre-income commitment · week load · balance floor
                </div>
              </div>
            );
          })()}

          {/* Cash cushion risk analysis */}
          {isVisible("cash-cushion") && !isLoading && pending.length > 0 && (() => {
            const MOCK_CURRENT_BALANCE = 3420;
            const MIN_CUSHION = 200;
            let running = MOCK_CURRENT_BALANCE;
            let troughVal = running;
            let troughDay = 0;
            let salaryDay = -1;
            let salaryAmt = 0;

            for (let d = 0; d <= 30; d++) {
              const dayDate = new Date(now.getTime() + d * 86400000).toISOString().slice(0, 10);
              for (const item of pending.filter(i => i.dueDate === dayDate)) {
                const amt = item.gbpEquivalent ?? 0;
                running += amt;
                if (amt > salaryAmt) { salaryAmt = amt; salaryDay = d; }
              }
              if (running < troughVal) { troughVal = running; troughDay = d; }
            }

            const cushion = troughVal - MIN_CUSHION;
            const atRisk = troughVal < MIN_CUSHION;
            const tight = !atRisk && troughVal < 500;
            const riskColor = atRisk ? "var(--ft-red)" : tight ? "var(--ft-accent)" : "var(--ft-green)";
            const riskLabel = atRisk ? "At Risk" : tight ? "Tight" : "Safe";
            const troughDate = new Date(now.getTime() + troughDay * 86400000);
            const troughLabel = troughDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

            const nextIncome = pending
              .filter(i => (i.gbpEquivalent ?? 0) > 0)
              .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
            const daysToIncome = nextIncome
              ? Math.ceil((new Date(nextIncome.dueDate).getTime() - Date.now()) / 86400000)
              : null;

            return (
              <div style={{ background: "var(--ft-surface)", border: `1px solid color-mix(in srgb, ${riskColor} 30%, var(--ft-border))`, borderRadius: 16, padding: "12px 14px", opacity: hasMockData ? 0.85 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Cash cushion · 30d
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: riskColor, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    {riskLabel}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                  <div style={{ background: "var(--ft-raised)", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Floor</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: riskColor, fontVariantNumeric: "tabular-nums" }}>{formatGbp(troughVal)}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", marginTop: 1 }}>{troughLabel}</div>
                  </div>
                  <div style={{ background: "var(--ft-raised)", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Cushion</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: cushion >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontVariantNumeric: "tabular-nums" }}>
                      {cushion >= 0 ? "+" : "−"}{formatGbp(Math.abs(cushion))}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", marginTop: 1 }}>vs £{MIN_CUSHION} min</div>
                  </div>
                  <div style={{ background: "var(--ft-raised)", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Income in</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: daysToIncome !== null && daysToIncome <= 3 ? "var(--ft-accent)" : "var(--ft-text)", fontVariantNumeric: "tabular-nums" }}>
                      {daysToIncome !== null ? `${daysToIncome}d` : "—"}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", marginTop: 1 }}>
                      {nextIncome ? formatGbp(nextIncome.gbpEquivalent) : "none"}
                    </div>
                  </div>
                </div>

                {/* Cushion bar */}
                <div style={{ height: 4, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.min(100, Math.max(0, (troughVal / (MOCK_CURRENT_BALANCE || 1)) * 100))}%`,
                    background: riskColor, borderRadius: 2, opacity: 0.7,
                  }} />
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", marginTop: 4 }}>
                  {atRisk
                    ? `Balance drops below £${MIN_CUSHION} on ${troughLabel} — review bills`
                    : tight
                    ? `Tight window around ${troughLabel} — £${troughVal.toFixed(0)} floor`
                    : `Balance stays above £${troughVal.toFixed(0)} throughout the 30-day window`
                  }
                </div>
              </div>
            );
          })()}

          {/* Bill category breakdown */}
          {isVisible("categories") && !isLoading && pending.length > 0 && (() => {
            const expenses = pending.filter(i => (i.gbpEquivalent ?? 0) < 0);
            const catMap: Record<string, number> = {};
            for (const item of expenses) {
              const cat = item.category ?? "Other";
              catMap[cat] = (catMap[cat] ?? 0) + Math.abs(item.gbpEquivalent ?? 0);
            }
            const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
            const totalOut = cats.reduce((s, [, v]) => s + v, 0);
            const CAT_ACCENT: Record<string, string> = {
              Housing:        "#F97316",
              Entertainment:  "#38BDF8",
              Subscriptions:  "#60A5FA",
              Insurance:      "#3B82F6",
              Health:         "#EF4444",
              Transport:      "#60A5FA",
              Income:         "#10B981",
            };
            if (cats.length === 0) return null;
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 16, overflow: "hidden", opacity: hasMockData ? 0.85 : 1 }}>
                <div style={{ padding: "9px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Bill breakdown · 30D</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-red)" }}>{formatGbp(totalOut)}</span>
                </div>
                {/* Allocation bar */}
                <div style={{ display: "flex", height: 4, overflow: "hidden" }}>
                  {cats.map(([cat, amt]) => (
                    <div key={cat} style={{ width: `${(amt / totalOut) * 100}%`, background: CAT_ACCENT[cat] ?? "#64748b", opacity: 0.75 }} />
                  ))}
                </div>
                {cats.map(([cat, amt], i) => {
                  const pct   = (amt / totalOut) * 100;
                  const color = CAT_ACCENT[cat] ?? "#64748b";
                  const isLast = i === cats.length - 1;
                  return (
                    <div key={cat} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
                      <div style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
                      <div style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)" }}>{cat}</div>
                      <div style={{ width: 60, height: 3, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, opacity: 0.7 }} />
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", width: 24, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{pct.toFixed(0)}%</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-red)", width: 56, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatGbp(amt)}</div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {isLoading ? (
            <div style={{ textAlign: "center", color: "var(--ft-dim)", fontSize: 13, padding: 32 }}>Loading…</div>
          ) : (
            <div style={{ opacity: hasMockData ? 0.85 : 1, display: "flex", flexDirection: "column", gap: 14 }}>
              {soon.length > 0 && <UpcomingSection label="Within 7 days" items={soon} urgent />}
              {later.length > 0 && <UpcomingSection label="Within 30 days" items={later} />}
              {pending.length === 0 && (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 16, padding: "32px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 13, color: "var(--ft-dim)" }}>Nothing due in the next 30 days</div>
                </div>
              )}
            </div>
          )}

          {/* Income delay stress test */}
          {isVisible("delay-stress") && !isLoading && pending.length > 0 && (() => {
            const MOCK_BAL = 3420;
            const DELAY = 7;
            const incP = pending.filter(i => (i.gbpEquivalent ?? 0) > 0);
            const expP = pending.filter(i => (i.gbpEquivalent ?? 0) < 0);
            let baseMin = MOCK_BAL, baseRun = MOCK_BAL, stressMin = MOCK_BAL, stressRun = MOCK_BAL;
            for (let d = 0; d <= 30; d++) {
              const dd = new Date(now.getTime() + d * 86400000).toISOString().slice(0, 10);
              const delayedD = new Date(now.getTime() + (d - DELAY) * 86400000).toISOString().slice(0, 10);
              pending.forEach(i => { if (i.dueDate === dd) baseRun += (i.gbpEquivalent ?? 0); });
              expP.forEach(i => { if (i.dueDate === dd) stressRun += (i.gbpEquivalent ?? 0); });
              incP.forEach(i => { if (i.dueDate === delayedD) stressRun += (i.gbpEquivalent ?? 0); });
              if (baseRun < baseMin) baseMin = baseRun;
              if (stressRun < stressMin) stressMin = stressRun;
            }
            const isNeg = stressMin < 0;
            const col = isNeg ? "var(--ft-red)" : "var(--ft-green)";
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderLeft: `3px solid ${col}`, borderRadius: 3, padding: "12px 14px", opacity: hasMockData ? 0.85 : 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 9 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Income delay stress · +{DELAY}d</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: col }}>{isNeg ? "WOULD GO NEGATIVE" : "RESILIENT"}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 7 }}>
                  {[
                    { label: "Normal min", val: baseMin, col: "var(--ft-green)" },
                    { label: `Delayed ${DELAY}d min`, val: stressMin, col: isNeg ? "var(--ft-red)" : "var(--ft-accent)" },
                  ].map(r => (
                    <div key={r.label}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{r.label}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: r.col, fontVariantNumeric: "tabular-nums" }}>{formatGbp(r.val)}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>bills on normal schedule · income arrives {DELAY}d late · {hasMockData ? "mock" : "live"}</div>
              </div>
            );
          })()}

          {/* Savings window detector */}
          {isVisible("savings-window") && !isLoading && pending.length > 0 && (() => {
            const MOCK_BAL = 3420;
            const incP = pending.filter(i => (i.gbpEquivalent ?? 0) > 0).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
            const expP = pending.filter(i => (i.gbpEquivalent ?? 0) < 0);
            let peakDay = 0, peakBal = MOCK_BAL, runBal = MOCK_BAL;
            for (let d = 1; d <= 30; d++) {
              const dd = new Date(now.getTime() + d * 86400000).toISOString().slice(0, 10);
              pending.forEach(i => { if (i.dueDate === dd) runBal += (i.gbpEquivalent ?? 0); });
              if (runBal > peakBal) { peakBal = runBal; peakDay = d; }
            }
            const nextIncome = incP[0];
            const incomeDate = nextIncome ? new Date(nextIncome.dueDate) : null;
            const billsBeforeIncome = incomeDate ? expP.filter(i => new Date(i.dueDate) < incomeDate) : [];
            const preIncomeObl = billsBeforeIncome.reduce((s, i) => s + Math.abs(i.gbpEquivalent ?? 0), 0);
            const totalBills = expP.reduce((s, i) => s + Math.abs(i.gbpEquivalent ?? 0), 0);
            const optTransfer = Math.max(0, Math.round(peakBal - totalBills * 1.1));
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 14, padding: "12px 14px", opacity: hasMockData ? 0.85 : 1 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 9 }}>Savings window</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                  {[
                    { label: "Peak balance", val: formatGbp(peakBal), sub: `day +${peakDay}`, col: "var(--ft-green)" },
                    { label: "Transfer up to", val: formatGbp(optTransfer), sub: "10% buffer kept", col: "var(--ft-accent)" },
                    { label: "Bills pre-payday", val: formatGbp(preIncomeObl), sub: `${billsBeforeIncome.length} payment${billsBeforeIncome.length !== 1 ? "s" : ""}`, col: preIncomeObl > 0 ? "var(--ft-accent)" : "var(--ft-green)" },
                  ].map(r => (
                    <div key={r.label}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{r.label}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: r.col, fontVariantNumeric: "tabular-nums" }}>{r.val}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", marginTop: 1 }}>{r.sub}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>
                  transfer on day +{peakDay} · after income before major bills · 10% safety buffer retained
                </div>
              </div>
            );
          })()}

          {/* Bill necessity split */}
          {isVisible("necessity") && pending.filter(i => (i.gbpEquivalent ?? 0) < 0).length > 0 && (() => {
            const bills = pending.filter(i => (i.gbpEquivalent ?? 0) < 0);
            const ESS = new Set(["housing", "insurance", "utilities", "health", "transport"]);
            const essential = bills.filter(b => ESS.has((b.category ?? "").toLowerCase()));
            const discr = bills.filter(b => !ESS.has((b.category ?? "").toLowerCase()));
            const essTotal = essential.reduce((s, b) => s + Math.abs(b.gbpEquivalent ?? 0), 0);
            const disTotal = discr.reduce((s, b) => s + Math.abs(b.gbpEquivalent ?? 0), 0);
            const tot = essTotal + disTotal || 1;
            const essPct = Math.round(essTotal / tot * 100);
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 14, padding: "12px 14px", opacity: hasMockData ? 0.85 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Necessity split</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-accent)" }}>{bills.length} upcoming bill{bills.length !== 1 ? "s" : ""}</span>
                </div>
                <div style={{ display: "flex", height: 8, borderRadius: 2, overflow: "hidden", marginBottom: 10 }}>
                  <div style={{ width: `${essPct}%`, background: "var(--ft-green)" }} />
                  <div style={{ flex: 1, background: "var(--ft-accent)", opacity: 0.7 }} />
                </div>
                {([["Essential", essTotal, essPct, essential.length, "var(--ft-green)"], ["Discretionary", disTotal, 100 - essPct, discr.length, "var(--ft-accent)"]] as [string, number, number, number, string][]).map(([lbl, total, pct, n, col]) => (
                  <div key={lbl} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 1, background: col, flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-text)" }}>{lbl}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>{n} bill{n !== 1 ? "s" : ""}</span>
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: col, fontVariantNumeric: "tabular-nums" }}>{pct}% · {formatGbp(total)}</span>
                  </div>
                ))}
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>
                  essential = rent · insurance · health · transport · utilities · 30-day window
                </div>
              </div>
            );
          })()}

          {/* Bill load velocity */}
          {isVisible("bill-velocity") && pending.filter(i => (i.gbpEquivalent ?? 0) < 0).length > 0 && (() => {
            const totalBills = pending.filter(i => (i.gbpEquivalent ?? 0) < 0).reduce((s, i) => s + Math.abs(i.gbpEquivalent ?? 0), 0);
            const PREV = 1320;
            const pct = Math.round((totalBills - PREV) / PREV * 100);
            const col = pct > 15 ? "var(--ft-red)" : pct > 5 ? "var(--ft-accent)" : "var(--ft-green)";
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 12, padding: "10px 14px", marginBottom: 10, opacity: hasMockData ? 0.85 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Bill velocity</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: col }}>{pct >= 0 ? "+" : ""}{pct}% vs last month</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {([["This month", totalBills, col], ["Last month", PREV, "var(--ft-dim)"]] as [string, number, string][]).map(([lbl, amt, c]) => (
                    <div key={lbl}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{lbl}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: c, fontVariantNumeric: "tabular-nums" }}>{formatGbp(amt)}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <a href="/upcoming" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", textDecoration: "none" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Manage upcoming</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)" }}>→</span>
          </a>
        </div>
      </div>
    </div>
  );
}

function UpcomingSection({ label, items, urgent }: { label: string; items: UpcomingItem[]; urgent?: boolean }) {
  const sorted = [...items].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: urgent ? "var(--ft-red)" : "var(--ft-dim)", marginBottom: 6 }}>
        {label} · {items.length}
      </div>
      <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 16, overflow: "hidden" }}>
        {sorted.map((item, i) => {
          const isLast    = i === sorted.length - 1;
          const due       = new Date(item.dueDate);
          const daysLeft  = Math.ceil((due.getTime() - Date.now()) / 86400000);
          const isExpense = item.gbpEquivalent < 0 || item.type === "expense";
          const amtColor  = isExpense ? "var(--ft-red)" : "var(--ft-green)";

          let daysBadge: string;
          let badgeColor: string;
          if (daysLeft <= 0)      { daysBadge = "today"; badgeColor = "var(--ft-red)"; }
          else if (daysLeft === 1) { daysBadge = "tmrw";  badgeColor = "var(--ft-red)"; }
          else if (daysLeft <= 3)  { daysBadge = `${daysLeft}d`; badgeColor = "var(--ft-accent)"; }
          else                     { daysBadge = `${daysLeft}d`; badgeColor = "var(--ft-dim)"; }

          return (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
              <div style={{
                minWidth: 40, height: 40, borderRadius: 20,
                background: `color-mix(in srgb, ${badgeColor} 10%, transparent)`,
                border: `1px solid color-mix(in srgb, ${badgeColor} 20%, transparent)`,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: badgeColor, letterSpacing: "0.02em" }}>{daysBadge}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ft-text)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                  {item.category} · {due.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </div>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: amtColor, flexShrink: 0 }}>
                {isExpense ? "−" : "+"}{formatGbp(Math.abs(item.gbpEquivalent))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
