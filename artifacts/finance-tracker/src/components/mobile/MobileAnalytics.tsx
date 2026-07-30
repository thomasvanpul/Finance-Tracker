import { useListTransactions } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";
import { DonutChart } from "./MobileCharts";
import { useWidgetVisibility } from "@/hooks/use-widget-visibility";
import { WidgetManagerButton } from "./MobileWidgetManager";

const ANALYTICS_WIDGETS = [
  { id: "signals",             label: "Spending signals" },
  { id: "spend-curve",         label: "Spend curve vs pace" },
  { id: "weekly-comparison",   label: "Weekly comparison" },
  { id: "dow-profile",         label: "Day-of-week profile" },
  { id: "income-spend",        label: "Income vs spend trend" },
  { id: "fixed-discretionary", label: "Fixed vs discretionary" },
  { id: "daily-heatmap",       label: "Daily spending heatmap" },
  { id: "savings-rate",        label: "Savings rate trend" },
  { id: "top-merchants",       label: "Top merchants" },
  { id: "txn-distribution",    label: "Transaction distribution" },
  { id: "anomaly",             label: "Anomaly detector" },
  { id: "cash-funnel",         label: "Cash efficiency funnel" },
];

interface CatRow { category: string; amount: number; count: number; }

const MOCK_SPEND_ROWS: CatRow[] = [
  { category: "Food & Drink",   amount: 420, count: 12 },
  { category: "Shopping",       amount: 347, count: 4  },
  { category: "Entertainment",  amount: 148, count: 3  },
  { category: "Transport",      amount: 85,  count: 8  },
  { category: "Subscriptions",  amount: 98,  count: 3  },
  { category: "Health",         amount: 32,  count: 1  },
];

const MOCK_INCOME_ROWS: CatRow[] = [
  { category: "Salary",    amount: 3200, count: 1 },
  { category: "Freelance", amount: 500,  count: 2 },
];

const MOCK_TOTAL_SPEND  = MOCK_SPEND_ROWS.reduce((s, r) => s + r.amount, 0);
const MOCK_TOTAL_INCOME = MOCK_INCOME_ROWS.reduce((s, r) => s + r.amount, 0);

const MOCK_WEEKDAY_SPEND = [
  { day: "Mo", amount: 128 }, { day: "Tu", amount: 62  }, { day: "We", amount: 188 },
  { day: "Th", amount: 85  }, { day: "Fr", amount: 237 }, { day: "Sa", amount: 290 },
  { day: "Su", amount: 140 },
];

const MOCK_PREV_SPEND: Record<string, number> = {
  "Food & Drink": 385, "Shopping": 210, "Entertainment": 160,
  "Transport": 92,     "Subscriptions": 98, "Health": 0,
};

function mLabel(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleString("default", { month: "short" });
}

const MOCK_DAILY_SPEND: Record<number, number> = {
  1: 23,  2: 45,  3: 0,   4: 67,  5: 0,   6: 12,  7: 0,
  8: 34,  9: 89,  10: 0,  11: 156, 12: 23, 13: 0,  14: 0,
  15: 45, 16: 78, 17: 34, 18: 0,  19: 234, 20: 67, 21: 0,
  22: 45, 23: 12, 24: 89, 25: 0,  26: 145, 27: 0,  28: 34,
};

const MOCK_MONTHLY_HISTORY = [
  { month: mLabel(-5), income: 3700, spend: 1450 },
  { month: mLabel(-4), income: 3700, spend: 1280 },
  { month: mLabel(-3), income: 4200, spend: 1890 },
  { month: mLabel(-2), income: 3700, spend: 1340 },
  { month: mLabel(-1), income: 3700, spend: 1620 },
  { month: mLabel(0),  income: 3700, spend: 1130 },
];

const MOCK_MERCHANTS = [
  { name: "H&M",          amount: 67.50 },
  { name: "Tesco Express", amount: 34.20 },
  { name: "Amazon",       amount: 23.99 },
  { name: "Netflix",      amount: 15.99 },
  { name: "Uber",         amount: 12.40 },
];

// 6-month category averages for anomaly detection
const MOCK_6M_AVG: Record<string, number> = {
  "Food & Drink":  395, "Shopping": 212, "Entertainment": 158,
  "Transport":      90, "Subscriptions": 97, "Health": 18,
};

// Fixed (recurring: rent, subs, insurance) vs discretionary per month
const MOCK_SPEND_SPLIT = [
  { month: mLabel(-5), fixed: 680, disc: 770  },
  { month: mLabel(-4), fixed: 680, disc: 600  },
  { month: mLabel(-3), fixed: 695, disc: 1195 },
  { month: mLabel(-2), fixed: 680, disc: 660  },
  { month: mLabel(-1), fixed: 680, disc: 940  },
  { month: mLabel(0),  fixed: 680, disc: 450  },
];

// Income allocation: what % of income flows to each bucket
const MOCK_FUNNEL = [
  { label: "Gross income",    amount: 3700, color: "var(--ft-green)" },
  { label: "Tax & NI",        amount: 420,  color: "#EF4444" },
  { label: "Fixed costs",     amount: 680,  color: "#F97316" },
  { label: "Variable spend",  amount: 450,  color: "var(--ft-amber)" },
  { label: "Lifestyle",       amount: 480,  color: "#38BDF8" },
  { label: "Net savings",     amount: 1670, color: "var(--ft-green)" },
];

const MOCK_TXN_DIST = [
  { label: "<£10",    count: 6,  amount: 41,  color: "var(--ft-green)"  },
  { label: "£10–25",  count: 10, amount: 175, color: "#60A5FA"          },
  { label: "£25–50",  count: 7,  amount: 235, color: "var(--ft-accent)" },
  { label: "£50–100", count: 5,  amount: 296, color: "#F97316"          },
  { label: ">£100",   count: 3,  amount: 383, color: "var(--ft-red)"    },
];

const COLORS = [
  "var(--ft-accent)", "#60a5fa", "#4ade80", "#facc15",
  "#fb923c", "#0ea5e9", "#34d399", "#f87171", "#38bdf8", "#4ade80",
];

export function MobileAnalytics({ onBack }: { onBack?: () => void }) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const dateFrom = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const dateTo   = new Date(y, m + 1, 0).toISOString().split("T")[0];
  const { data: txns = [], isLoading } = useListTransactions({ dateFrom, dateTo });

  const hasMockData = !isLoading && txns.length === 0;

  const byCat = (items: typeof txns): CatRow[] => {
    const map: Record<string, CatRow> = {};
    for (const t of items) {
      const cat = t.category || "Other";
      if (!map[cat]) map[cat] = { category: cat, amount: 0, count: 0 };
      map[cat].amount += Math.abs(t.gbpValue);
      map[cat].count  += 1;
    }
    return Object.values(map).sort((a, b) => b.amount - a.amount);
  };

  const expenses    = txns.filter(t => t.gbpValue < 0);
  const incomes     = txns.filter(t => t.gbpValue >= 0);
  const totalSpend  = hasMockData ? MOCK_TOTAL_SPEND  : expenses.reduce((s, t) => s + Math.abs(t.gbpValue), 0);
  const totalIncome = hasMockData ? MOCK_TOTAL_INCOME : incomes.reduce((s, t) => s + t.gbpValue, 0);
  const spendRows   = hasMockData ? MOCK_SPEND_ROWS   : byCat(expenses);
  const incomeRows  = hasMockData ? MOCK_INCOME_ROWS  : byCat(incomes);
  const net         = totalIncome - totalSpend;
  const monthLabel  = now.toLocaleString("default", { month: "long", year: "numeric" });

  const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const byWeekday = hasMockData ? MOCK_WEEKDAY_SPEND : (() => {
    const sums = new Array(7).fill(0);
    for (const t of expenses) {
      if (t.date) sums[new Date(t.date + "T12:00:00").getDay()] += Math.abs(t.gbpValue ?? 0);
    }
    return [1,2,3,4,5,6,0].map(i => ({ day: DAY_NAMES[i], amount: Math.round(sums[i]) }));
  })();
  const wdMax = Math.max(...byWeekday.map(d => d.amount), 1);

  const topMerchants = hasMockData ? MOCK_MERCHANTS : (() => {
    const map: Record<string, number> = {};
    for (const t of expenses) {
      const name = t.description || "Unknown";
      map[name] = (map[name] ?? 0) + Math.abs(t.gbpValue ?? 0);
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => ({ name, amount }));
  })();
  const merchantMax = topMerchants.length > 0 ? topMerchants[0].amount : 1;

  const dailySpend: Record<number, number> = hasMockData ? MOCK_DAILY_SPEND : (() => {
    const map: Record<number, number> = {};
    for (const t of expenses) {
      if (t.date) {
        const day = new Date(t.date + "T12:00:00").getDate();
        map[day] = (map[day] ?? 0) + Math.abs(t.gbpValue ?? 0);
      }
    }
    return map;
  })();

  const { isVisible, toggle, resetAll, visible, hiddenCount } = useWidgetVisibility("analytics", ANALYTICS_WIDGETS);

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
          Analytics
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
            {monthLabel}{hasMockData && " · preview"}
          </div>
          <WidgetManagerButton widgets={ANALYTICS_WIDGETS} visible={visible} onToggle={toggle} onReset={resetAll} hiddenCount={hiddenCount} />
        </div>
      </div>

      <div className="mobile-scroll" style={{ flex: 1, overflowY: "auto", padding: "0 16px", paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 16px)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: hasMockData ? 0.85 : 1, transition: "opacity 0.12s" }}>

          {/* Summary hero card */}
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
              <Stat label="Income" value={formatGbp(totalIncome)} color="var(--ft-green)" />
              <Stat label="Spend"  value={formatGbp(totalSpend)}  color="var(--ft-red)"   border />
              <Stat label="Net"    value={(net >= 0 ? "+" : "−") + formatGbp(Math.abs(net))} color={net >= 0 ? "var(--ft-green)" : "var(--ft-red)"} border />
            </div>
            {totalIncome > 0 && (
              <div style={{ padding: "0 16px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Savings rate</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: net >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                    {((net / totalIncome) * 100).toFixed(1)}%
                  </span>
                </div>
                <div style={{ height: 3, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden", marginBottom: 10 }}>
                  <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, (net / totalIncome) * 100))}%`, background: net >= 0 ? "var(--ft-green)" : "var(--ft-red)", borderRadius: 2 }} />
                </div>
                {totalSpend > 0 && (() => {
                  const todayDay  = now.getDate();
                  const totalDays = new Date(y, m + 1, 0).getDate();
                  const pace      = Math.round((totalSpend / todayDay) * totalDays);
                  const remaining = totalDays - todayDay;
                  return (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Pace</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-accent)" }}>{formatGbp(pace)}/mo</span>
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                        day {todayDay} of {totalDays} · {remaining}d left
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {isLoading ? (
            <div style={{ textAlign: "center", color: "var(--ft-dim)", fontSize: 13, padding: 32 }}>Loading…</div>
          ) : (
            <>
              {/* Analytics signals */}
              {isVisible("signals") && (() => {
                const todayDay   = now.getDate();
                const totalDays  = new Date(y, m + 1, 0).getDate();
                const pace       = totalDays > 0 ? Math.round((totalSpend / Math.max(todayDay, 1)) * totalDays) : 0;
                const paceOfInc  = totalIncome > 0 ? (pace / totalIncome) * 100 : 0;
                const savingsRate = totalIncome > 0 ? ((totalIncome - totalSpend) / totalIncome) * 100 : 0;
                const prevSpendMap = hasMockData ? MOCK_PREV_SPEND : {} as Record<string, number>;

                const signals: Array<{ level: "red" | "amber" | "green"; headline: string; detail: string }> = [];

                // Pace signal
                if (pace > 0 && totalIncome > 0) {
                  if (paceOfInc > 80) {
                    signals.push({ level: "red", headline: `Spending at £${pace.toLocaleString()}/mo pace`, detail: `${paceOfInc.toFixed(0)}% of income — savings squeezed` });
                  } else if (paceOfInc > 60) {
                    signals.push({ level: "amber", headline: `Pace £${pace.toLocaleString()}/mo (${paceOfInc.toFixed(0)}% of income)`, detail: `${totalDays - todayDay}d remaining this month` });
                  } else {
                    signals.push({ level: "green", headline: `Strong pace — £${pace.toLocaleString()}/mo`, detail: `Save rate ${savingsRate.toFixed(1)}% at current pace` });
                  }
                }

                // Biggest category mover vs last month
                const movers = spendRows
                  .map(r => {
                    const prev = prevSpendMap[r.category];
                    if (prev === undefined || prev === 0) return null;
                    const delta = r.amount - prev;
                    const deltaPct = (delta / prev) * 100;
                    return { category: r.category, delta, deltaPct };
                  })
                  .filter((x): x is NonNullable<typeof x> => x !== null && Math.abs(x.deltaPct) >= 20)
                  .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
                if (movers.length > 0) {
                  const top = movers[0];
                  const sign = top.delta > 0 ? "+" : "−";
                  const lvl: "red" | "green" = top.delta > 0 ? "red" : "green";
                  signals.push({
                    level: lvl,
                    headline: `${top.category} ${sign}${Math.abs(top.deltaPct).toFixed(0)}% vs last month`,
                    detail: `${sign}£${Math.abs(top.delta).toFixed(0)} compared to prior period`,
                  });
                }

                // Weekday pattern
                const wdAmounts = byWeekday.map(d => d.amount).filter(v => v > 0);
                if (wdAmounts.length >= 4) {
                  const wdAvg = wdAmounts.reduce((s, v) => s + v, 0) / wdAmounts.length;
                  const peak = byWeekday.reduce((best, d) => d.amount > best.amount ? d : best, byWeekday[0]);
                  const ratio = peak.amount / Math.max(wdAvg, 1);
                  if (ratio > 1.6) {
                    signals.push({
                      level: "amber",
                      headline: `${peak.day} spend ${ratio.toFixed(1)}× weekday avg`,
                      detail: `Weekend concentration — £${peak.amount} on peak day`,
                    });
                  }
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
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: col, letterSpacing: "0.01em" }}>{sig.headline}</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>{sig.detail}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Cumulative spend curve vs linear pace */}
              {isVisible("spend-curve") && Object.keys(dailySpend).length > 0 && (() => {
                const todayDay  = now.getDate();
                const totalDays = new Date(y, m + 1, 0).getDate();
                const W = 320, H = 64, PX = 4, PY = 6;

                // Build cumulative actual spend up to today
                let cum = 0;
                const cumPoints: Array<{ d: number; v: number }> = [];
                for (let d = 1; d <= todayDay; d++) {
                  cum += dailySpend[d] ?? 0;
                  cumPoints.push({ d, v: cum });
                }
                const projectedMonthly = todayDay > 0 ? (cum / todayDay) * totalDays : 0;

                // Add projected endpoint
                const chartPoints = [...cumPoints, { d: totalDays, v: projectedMonthly }];
                const maxV = Math.max(projectedMonthly, cum, 1);

                const xOf = (d: number) => PX + ((d - 1) / (totalDays - 1)) * (W - 2 * PX);
                const yOf = (v: number) => PY + (1 - v / maxV) * (H - 2 * PY);

                // Actual path
                const actualPts = cumPoints.map(p => `${xOf(p.d).toFixed(1)},${yOf(p.v).toFixed(1)}`).join(" L ");
                const actualPath = `M ${actualPts}`;

                // Linear pace line (from 0 to projected)
                const paceX0 = xOf(1), paceY0 = yOf(0);
                const paceX1 = xOf(totalDays), paceY1 = yOf(projectedMonthly);

                // Projected continuation (dashed) from today to month end
                const projPath = todayDay < totalDays
                  ? `M ${xOf(todayDay).toFixed(1)},${yOf(cum).toFixed(1)} L ${xOf(totalDays).toFixed(1)},${yOf(projectedMonthly).toFixed(1)}`
                  : null;

                return (
                  <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Spend Pace</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-accent)" }}>
                        proj £{Math.round(projectedMonthly).toLocaleString()}/mo
                      </span>
                    </div>
                    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
                      <defs>
                        <linearGradient id="csc-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--ft-accent)" stopOpacity="0.18" />
                          <stop offset="100%" stopColor="var(--ft-accent)" stopOpacity="0.02" />
                        </linearGradient>
                      </defs>
                      {/* Fill under actual */}
                      {cumPoints.length > 1 && (
                        <path
                          d={`M ${xOf(1).toFixed(1)},${H} L ${actualPts} L ${xOf(todayDay).toFixed(1)},${H} Z`}
                          fill="url(#csc-fill)"
                        />
                      )}
                      {/* Linear pace reference */}
                      <line x1={paceX0} y1={paceY0} x2={paceX1} y2={paceY1} stroke="var(--ft-border)" strokeWidth="1" strokeDasharray="3 3" />
                      {/* Actual spend line */}
                      {cumPoints.length > 1 && (
                        <path d={actualPath} fill="none" stroke="var(--ft-accent)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
                      )}
                      {/* Projected continuation */}
                      {projPath && (
                        <path d={projPath} fill="none" stroke="var(--ft-accent)" strokeWidth="1.2" strokeDasharray="4 3" strokeOpacity="0.5" />
                      )}
                      {/* Today dot */}
                      {cumPoints.length > 0 && (
                        <circle cx={xOf(todayDay)} cy={yOf(cum)} r={3} fill="var(--ft-accent)" />
                      )}
                    </svg>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>Day 1</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-accent)" }}>Day {todayDay} · £{Math.round(cum).toLocaleString()}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>Day {totalDays}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Weekly spend comparison — 4-week rolling */}
              {isVisible("weekly-comparison") && hasMockData && (() => {
                const MOCK_WEEKLY = [
                  { label: "4w avg", amount: 284 },
                  { label: "2w ago", amount: 312 },
                  { label: "Last wk", amount: 267 },
                  { label: "This wk", amount: 198 },
                ];
                const weekMax   = Math.max(...MOCK_WEEKLY.map(w => w.amount));
                const thisWk    = MOCK_WEEKLY[3];
                const lastWk    = MOCK_WEEKLY[2];
                const delta     = thisWk.amount - lastWk.amount;
                const deltaPct  = (delta / lastWk.amount) * 100;
                const vs4wAvg   = thisWk.amount - MOCK_WEEKLY[0].amount;
                const deltaCol  = delta <= 0 ? "var(--ft-green)" : "var(--ft-red)";
                const avgCol    = vs4wAvg <= 0 ? "var(--ft-green)" : "var(--ft-red)";
                return (
                  <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "10px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                        Weekly spend
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: deltaCol }}>
                        {delta > 0 ? "+" : ""}{deltaPct.toFixed(0)}% vs last wk
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 72, marginBottom: 8 }}>
                      {MOCK_WEEKLY.map((w, i) => {
                        const barH   = Math.max(4, (w.amount / weekMax) * 58);
                        const isThis = i === MOCK_WEEKLY.length - 1;
                        const isAvg  = i === 0;
                        const col    = isThis ? "var(--ft-accent)" : isAvg ? "var(--ft-border)" : "var(--ft-dim)";
                        return (
                          <div key={w.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                            {isThis && (
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-accent)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                                £{w.amount}
                              </span>
                            )}
                            <div style={{ width: "100%", height: barH, background: col, borderRadius: 2, opacity: isThis ? 1 : isAvg ? 0.5 : 0.55, marginTop: "auto" }} />
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: isThis ? "var(--ft-accent)" : "var(--ft-dim)", textAlign: "center", whiteSpace: "nowrap" }}>
                              {w.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", gap: 10, paddingTop: 8, borderTop: "1px solid var(--ft-border)" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: avgCol, fontVariantNumeric: "tabular-nums" }}>
                        {vs4wAvg > 0 ? "+" : ""}£{Math.abs(vs4wAvg)} vs 4w avg
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-border)" }}>·</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", fontVariantNumeric: "tabular-nums" }}>
                        £{(thisWk.amount / 7).toFixed(0)}/day rate
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Day-of-week spending profile */}
              {isVisible("dow-profile") && byWeekday.some(d => d.amount > 0) && (() => {
                const W = 300, H = 88, PX = 4, PY = 10;
                const n = byWeekday.length;
                const barW = Math.floor((W - 2 * PX) / n) - 3;
                const available = H - PY - 18;
                const wkMax = Math.max(...byWeekday.map(d => d.amount), 1);
                const peakDay = byWeekday.reduce((best, d) => d.amount > best.amount ? d : best, byWeekday[0]);
                const weekendTotal = (byWeekday.find(d => d.day === "Sa")?.amount ?? 0) + (byWeekday.find(d => d.day === "Su")?.amount ?? 0);
                const weekdayTotal = byWeekday.filter(d => d.day !== "Sa" && d.day !== "Su").reduce((s, d) => s + d.amount, 0);
                const weekendPct = Math.round((weekendTotal / (weekdayTotal + weekendTotal)) * 100);
                return (
                  <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "10px 14px 8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                        Spend by weekday
                      </span>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-accent)" }}>peak: {peakDay.day}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>wknd {weekendPct}%</span>
                      </div>
                    </div>
                    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
                      {byWeekday.map((d, i) => {
                        const cx = PX + (i / n) * (W - 2 * PX) + barW / 2 + 1;
                        const barH = Math.max(3, (d.amount / wkMax) * available);
                        const y = H - 14 - barH;
                        const isPeak = d.day === peakDay.day;
                        const isWeekend = d.day === "Sa" || d.day === "Su";
                        const color = isPeak ? "var(--ft-accent)" : isWeekend ? "var(--ft-red)" : "var(--ft-text)";
                        const opacity = isPeak ? 1 : isWeekend ? 0.65 : 0.45;
                        return (
                          <g key={d.day}>
                            <rect
                              x={cx - barW / 2}
                              y={y}
                              width={barW}
                              height={barH}
                              rx={2}
                              fill={color}
                              fillOpacity={opacity}
                            />
                            {isPeak && (
                              <text
                                x={cx}
                                y={y - 3}
                                textAnchor="middle"
                                fontSize={7}
                                fontFamily="var(--font-mono)"
                                fill="var(--ft-accent)"
                                fontWeight="700"
                              >
                                £{d.amount}
                              </text>
                            )}
                            <text
                              x={cx}
                              y={H - 3}
                              textAnchor="middle"
                              fontSize={8}
                              fontFamily="var(--font-mono)"
                              fill={isPeak ? "var(--ft-accent)" : isWeekend ? "var(--ft-dim)" : "var(--ft-dim)"}
                              fontWeight={isPeak ? "700" : "400"}
                            >
                              {d.day}
                            </text>
                          </g>
                        );
                      })}
                      {/* Average line */}
                      {(() => {
                        const avg = byWeekday.reduce((s, d) => s + d.amount, 0) / byWeekday.length;
                        const avgY = H - 14 - Math.max(3, (avg / wkMax) * available);
                        return (
                          <line
                            x1={PX}
                            y1={avgY}
                            x2={W - PX}
                            y2={avgY}
                            stroke="var(--ft-border)"
                            strokeWidth="1"
                            strokeDasharray="3 3"
                          />
                        );
                      })()}
                    </svg>
                  </div>
                );
              })()}

              {/* 6-month income vs spend trend */}
              {isVisible("income-spend") && hasMockData && (() => {
                const W = 320, H = 76, PX = 8, PY = 5;
                const data = MOCK_MONTHLY_HISTORY;
                const xs   = data.map((_, i) => PX + (i / (data.length - 1)) * (W - 2 * PX));
                const all  = data.flatMap(d => [d.income, d.spend]);
                const minV = Math.min(...all) * 0.8;
                const maxV = Math.max(...all) * 1.1;
                const toY  = (v: number) => PY + (1 - (v - minV) / (maxV - minV)) * (H - 2 * PY);
                const pts  = (key: "income" | "spend") =>
                  data.map((d, i) => `${xs[i].toFixed(1)},${toY(d[key]).toFixed(1)}`).join(" ");
                const area = (key: "income" | "spend") => {
                  const p = data.map((d, i) => `${xs[i].toFixed(1)},${toY(d[key]).toFixed(1)}`);
                  return `M ${xs[0].toFixed(1)},${H} L ${p.join(" L ")} L ${xs[data.length - 1].toFixed(1)},${H} Z`;
                };
                const last = data[data.length - 1];
                const lx   = xs[data.length - 1];
                return (
                  <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 10px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8 }}>
                      Monthly trend · 6m
                    </div>
                    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
                      <defs>
                        <linearGradient id="mt-ig" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#4ade80" stopOpacity="0.22" />
                          <stop offset="100%" stopColor="#4ade80" stopOpacity="0.02" />
                        </linearGradient>
                        <linearGradient id="mt-sg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f87171" stopOpacity="0.18" />
                          <stop offset="100%" stopColor="#f87171" stopOpacity="0.02" />
                        </linearGradient>
                      </defs>
                      <path d={area("income")} fill="url(#mt-ig)" />
                      <path d={area("spend")}  fill="url(#mt-sg)" />
                      <polyline points={pts("income")} fill="none" stroke="#4ade80" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                      <polyline points={pts("spend")}  fill="none" stroke="#f87171" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                      <circle cx={lx} cy={toY(last.income)} r={3} fill="#4ade80" />
                      <circle cx={lx} cy={toY(last.spend)}  r={3} fill="#f87171" />
                    </svg>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                      {data.map(d => (
                        <span key={d.month} style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>{d.month}</span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 14, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--ft-border)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ width: 16, height: 2, background: "#4ade80", borderRadius: 1 }} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>INCOME</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ width: 16, height: 2, background: "#f87171", borderRadius: 1 }} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>SPEND</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Fixed vs discretionary split — stacked bars */}
              {isVisible("fixed-discretionary") && hasMockData && (() => {
                const W = 300, H = 72, PX = 4, PY = 6;
                const n      = MOCK_SPEND_SPLIT.length;
                const barW   = Math.floor((W - 2 * PX) / n) - 4;
                const maxTot = Math.max(...MOCK_SPEND_SPLIT.map(d => d.fixed + d.disc));
                const avail  = H - PY - 14;
                const fixedColor = "#60a5fa";
                const discColor  = "#f97316";
                const avgDisc    = MOCK_SPEND_SPLIT.reduce((s, d) => s + d.disc, 0) / n;
                const curDisc    = MOCK_SPEND_SPLIT[n - 1].disc;
                const discDelta  = curDisc - avgDisc;
                return (
                  <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "10px 14px 8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Fixed vs Discretionary</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: discDelta <= 0 ? "var(--ft-green)" : "var(--ft-accent)", fontWeight: 700 }}>
                        disc {discDelta > 0 ? "+" : ""}£{Math.round(discDelta)} vs avg
                      </span>
                    </div>
                    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
                      {MOCK_SPEND_SPLIT.map((d, i) => {
                        const cx   = PX + (i / n) * (W - 2 * PX) + barW / 2 + 1;
                        const tot  = d.fixed + d.disc;
                        const totH = Math.max(4, (tot / maxTot) * avail);
                        const fixH = Math.max(2, (d.fixed / tot) * totH);
                        const disH = totH - fixH;
                        const y0   = H - 14 - totH;
                        return (
                          <g key={d.month}>
                            <rect x={cx - barW / 2} y={y0}        width={barW} height={disH} rx={i === n - 1 ? 2 : 0} fill={discColor} fillOpacity={i === n - 1 ? 0.85 : 0.45} />
                            <rect x={cx - barW / 2} y={y0 + disH} width={barW} height={fixH} rx={0}                   fill={fixedColor} fillOpacity={i === n - 1 ? 0.85 : 0.45} />
                            <text x={cx} y={H - 2} textAnchor="middle" fontSize={7} fontFamily="var(--font-mono)" fill="var(--ft-dim)">{d.month}</text>
                          </g>
                        );
                      })}
                    </svg>
                    <div style={{ display: "flex", gap: 14, marginTop: 2 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: discColor, opacity: 0.85 }} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>Discretionary</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: fixedColor, opacity: 0.85 }} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>Fixed</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Daily spending heatmap */}
              {isVisible("daily-heatmap") && Object.keys(dailySpend).length > 0 && (() => {
                const daysInMonth = new Date(y, m + 1, 0).getDate();
                const firstDow    = new Date(y, m, 1).getDay();
                const startPad    = firstDow === 0 ? 6 : firstDow - 1;
                const maxDay      = Math.max(...Object.values(dailySpend), 1);
                const todayDay    = now.getDate();
                const totalCells  = startPad + daysInMonth;
                const rows        = Math.ceil(totalCells / 7);
                const maxEntry    = Object.entries(dailySpend).reduce<[string, number]>(
                  (best, [d, v]) => v > best[1] ? [d, v] : best, ["0", 0]
                );
                return (
                  <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 10px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8 }}>
                      Daily spend
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
                      {["M","T","W","T","F","S","S"].map((d, i) => (
                        <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 6, color: "var(--ft-dim)", textAlign: "center", paddingBottom: 2 }}>{d}</div>
                      ))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                      {Array.from({ length: rows * 7 }).map((_, idx) => {
                        const day      = idx - startPad + 1;
                        if (day < 1 || day > daysInMonth) {
                          return <div key={idx} style={{ aspectRatio: "1" }} />;
                        }
                        const spend    = dailySpend[day] ?? 0;
                        const isFuture = day > todayDay;
                        const isToday  = day === todayDay;
                        const heat     = spend > 0 ? Math.round((spend / maxDay) * 65) + 12 : 0;
                        const bg       = isFuture ? "transparent"
                          : spend > 0 ? `color-mix(in srgb, var(--ft-red) ${heat}%, var(--ft-raised))`
                          : "var(--ft-raised)";
                        return (
                          <div key={idx} style={{
                            aspectRatio: "1",
                            borderRadius: 3,
                            background: bg,
                            border: isToday ? "1px solid var(--ft-accent)" : "1px solid transparent",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 6, color: isToday ? "var(--ft-accent)" : spend > 0 ? "rgba(255,255,255,0.7)" : "var(--ft-dim)", opacity: isFuture ? 0.2 : 1 }}>
                              {day}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {maxEntry[1] > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--ft-border)" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                          Peak: {new Date(y, m, parseInt(maxEntry[0])).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--ft-red)" }}>
                          {formatGbp(maxEntry[1])}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Donut breakdown */}
              {spendRows.length > 0 && (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "14px 16px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 12 }}>
                    Spending breakdown
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ position: "relative", flexShrink: 0, width: 96, height: 96 }}>
                      <DonutChart
                        segments={spendRows.slice(0, 6).map((row, i) => ({ value: row.amount, color: COLORS[i % COLORS.length] }))}
                        size={96}
                        thickness={13}
                      />
                      <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        pointerEvents: "none",
                      }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-text)", lineHeight: 1, letterSpacing: "-0.01em" }}>
                          {formatGbp(totalSpend)}
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", letterSpacing: "0.1em", marginTop: 2, textTransform: "uppercase" }}>
                          spent
                        </div>
                      </div>
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                      {spendRows.slice(0, 5).map((row, i) => {
                        const pct = totalSpend > 0 ? (row.amount / totalSpend) * 100 : 0;
                        return (
                          <div key={row.category} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <div style={{ width: 6, height: 6, borderRadius: 3, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                            <div style={{ flex: 1, fontSize: 11, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.category}</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", flexShrink: 0 }}>{pct.toFixed(0)}%</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Savings rate trend */}
              {isVisible("savings-rate") && hasMockData && (() => {
                const rates = MOCK_MONTHLY_HISTORY.map(d => ({
                  month: d.month,
                  rate: d.income > 0 ? ((d.income - d.spend) / d.income) * 100 : 0,
                  net: d.income - d.spend,
                }));
                const W = 300, H = 56, PX = 6, PY = 6;
                const minR = Math.min(...rates.map(r => r.rate)) - 3;
                const maxR = Math.max(...rates.map(r => r.rate)) + 3;
                const xs = rates.map((_, i) => PX + (i / (rates.length - 1)) * (W - 2 * PX));
                const toY = (v: number) => PY + (1 - (v - minR) / (maxR - minR)) * (H - 2 * PY);
                const pts = rates.map((r, i) => `${xs[i].toFixed(1)},${toY(r.rate).toFixed(1)}`).join(" ");
                const current = rates[rates.length - 1];
                const prev    = rates[rates.length - 2];
                const trend   = current.rate - prev.rate;
                const trendCol = trend >= 0 ? "var(--ft-green)" : "var(--ft-red)";
                const avgRate  = rates.reduce((s, r) => s + r.rate, 0) / rates.length;
                const avgY     = toY(avgRate);
                return (
                  <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Savings rate · 6m</span>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: trendCol }}>
                          {trend >= 0 ? "+" : ""}{trend.toFixed(1)}pp MoM
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: current.rate >= 20 ? "var(--ft-green)" : "var(--ft-accent)" }}>
                          {current.rate.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
                      <defs>
                        <linearGradient id="sr-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--ft-green)" stopOpacity="0.18" />
                          <stop offset="100%" stopColor="var(--ft-green)" stopOpacity="0.02" />
                        </linearGradient>
                      </defs>
                      {/* avg reference */}
                      <line x1={PX} y1={avgY} x2={W - PX} y2={avgY} stroke="var(--ft-border)" strokeWidth="1" strokeDasharray="3 3" />
                      {/* fill */}
                      <path
                        d={`M ${xs[0].toFixed(1)},${H} L ${pts} L ${xs[rates.length - 1].toFixed(1)},${H} Z`}
                        fill="url(#sr-fill)"
                      />
                      {/* line */}
                      <polyline points={pts} fill="none" stroke="var(--ft-green)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
                      {/* current dot */}
                      <circle cx={xs[rates.length - 1]} cy={toY(current.rate)} r={3} fill="var(--ft-green)" />
                    </svg>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      {rates.map((r, i) => (
                        <span key={r.month} style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: i === rates.length - 1 ? "var(--ft-green)" : "var(--ft-dim)" }}>
                          {r.month}
                        </span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 14, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--ft-border)" }}>
                      <div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>6m avg</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: avgRate >= 20 ? "var(--ft-green)" : "var(--ft-accent)", marginTop: 1 }}>{avgRate.toFixed(1)}%</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Net saved</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-green)", marginTop: 1 }}>{formatGbp(current.net)}</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Best month</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-green)", marginTop: 1 }}>
                          {rates.reduce((best, r) => r.rate > best.rate ? r : best, rates[0]).month}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Top merchants */}
              {isVisible("top-merchants") && topMerchants.length > 0 && (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 10px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 12 }}>
                    Top merchants
                  </div>
                  {topMerchants.map(({ name, amount }, i) => {
                    const pct   = (amount / merchantMax) * 100;
                    const isTop = i === 0;
                    return (
                      <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: i < topMerchants.length - 1 ? 7 : 0 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: isTop ? 700 : 400, color: isTop ? "var(--ft-text)" : "var(--ft-dim)", minWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {name}
                        </div>
                        <div style={{ flex: 1, height: 5, background: "var(--ft-raised)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: COLORS[i % COLORS.length], opacity: isTop ? 1 : 0.5, borderRadius: 3 }} />
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: isTop ? "var(--ft-text)" : "var(--ft-dim)", minWidth: 52, textAlign: "right" }}>
                          {formatGbp(amount)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Transaction size distribution */}
              {isVisible("txn-distribution") && (hasMockData || expenses.length > 0) && (() => {
                const BUCKET_DEFS = [
                  { label: "<£10",    min: 0,   max: 10,       color: "var(--ft-green)"  },
                  { label: "£10–25",  min: 10,  max: 25,       color: "#60A5FA"          },
                  { label: "£25–50",  min: 25,  max: 50,       color: "var(--ft-accent)" },
                  { label: "£50–100", min: 50,  max: 100,      color: "#F97316"          },
                  { label: ">£100",   min: 100, max: Infinity,  color: "var(--ft-red)"   },
                ];
                const dist = hasMockData
                  ? MOCK_TXN_DIST
                  : (() => {
                      const buckets = BUCKET_DEFS.map(b => ({ ...b, count: 0, amount: 0 }));
                      for (const t of expenses) {
                        const v = Math.abs(t.gbpValue ?? 0);
                        const b = buckets.find(bk => v >= bk.min && v < bk.max);
                        if (b) { b.count++; b.amount += v; }
                      }
                      return buckets;
                    })();
                const totalTxns   = dist.reduce((s, d) => s + d.count, 0);
                const totalAmount = dist.reduce((s, d) => s + d.amount, 0);
                if (totalTxns === 0) return null;
                const maxCount   = Math.max(...dist.map(d => d.count), 1);
                const avgTxn     = totalAmount / totalTxns;
                const peakBucket = dist.reduce((best, d) => d.count > best.count ? d : best, dist[0]);
                const largeTxns  = dist.find(d => d.label === ">£100")?.count ?? 0;
                return (
                  <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Txn size distribution</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>{totalTxns} txns · {monthLabel}</span>
                    </div>
                    {dist.map(({ label, count, amount, color }) => {
                      const barPct = (count / maxCount) * 100;
                      const amtPct = totalAmount > 0 ? ((amount / totalAmount) * 100).toFixed(0) : "0";
                      return (
                        <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", minWidth: 46, textAlign: "right", letterSpacing: "0.02em" }}>{label}</div>
                          <div style={{ flex: 1, height: 10, background: "var(--ft-raised)", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                            <div style={{ height: "100%", width: `${barPct}%`, background: color, opacity: 0.78, borderRadius: 3 }} />
                            {barPct > 28 && (
                              <span style={{ position: "absolute", left: 4, top: "50%", transform: "translateY(-50%)", fontFamily: "var(--font-mono)", fontSize: 6.5, color: "#fff", pointerEvents: "none" }}>
                                {count}
                              </span>
                            )}
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color, minWidth: 38, textAlign: "right" }}>{formatGbp(amount)}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)", minWidth: 26, textAlign: "right" }}>{amtPct}%</div>
                        </div>
                      );
                    })}
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--ft-border)", display: "flex", gap: 14 }}>
                      <div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Avg txn</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-accent)", marginTop: 2 }}>{formatGbp(avgTxn)}</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Peak bracket</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: peakBucket.color, marginTop: 2 }}>{peakBucket.label}</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>XL txns</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-red)", marginTop: 2 }}>
                          {largeTxns} · {totalTxns > 0 ? ((largeTxns / totalTxns) * 100).toFixed(0) : "0"}%
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Spend anomaly detector */}
              {isVisible("anomaly") && spendRows.length > 0 && (() => {
                const avgMap = hasMockData ? MOCK_6M_AVG : {};
                const anomalies = spendRows
                  .map(r => {
                    const avg = avgMap[r.category];
                    if (avg === undefined || avg === 0) return null;
                    const delta = ((r.amount - avg) / avg) * 100;
                    if (Math.abs(delta) < 15) return null;
                    return { category: r.category, amount: r.amount, avg, delta };
                  })
                  .filter((x): x is NonNullable<typeof x> => x !== null)
                  .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
                  .slice(0, 4);
                if (anomalies.length === 0) return null;
                return (
                  <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                        Spend anomalies
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", opacity: 0.6 }}>vs 6M avg</div>
                    </div>
                    {anomalies.map(a => {
                      const isHigh = a.delta > 0;
                      const barColor = isHigh ? "var(--ft-red)" : "var(--ft-green)";
                      const maxPct = Math.min(Math.abs(a.delta), 200);
                      return (
                        <div key={a.category} style={{ marginBottom: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                            <div style={{ flex: 1, fontSize: 11, fontWeight: 500, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {a.category}
                            </div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: barColor }}>
                              {isHigh ? "+" : ""}{a.delta.toFixed(0)}%
                            </div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                              {formatGbp(a.amount)} vs avg {formatGbp(a.avg)}
                            </div>
                          </div>
                          <div style={{ position: "relative", height: 5, background: "var(--ft-raised)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${(maxPct / 200) * 100}%`, background: barColor, borderRadius: 3, opacity: 0.85 }} />
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: barColor, marginTop: 3 }}>
                            {isHigh ? `£${(a.amount - a.avg).toFixed(0)} above average` : `£${(a.avg - a.amount).toFixed(0)} below average`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Cash efficiency funnel */}
              {isVisible("cash-funnel") && hasMockData && (() => {
                const gross = MOCK_FUNNEL[0].amount;
                let remaining = gross;
                return (
                  <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 14px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 12 }}>
                      Income allocation
                    </div>
                    {MOCK_FUNNEL.map((row, i) => {
                      const pct = (row.amount / gross) * 100;
                      const isGross = i === 0;
                      if (!isGross) remaining -= row.amount;
                      const barW = isGross ? 100 : pct;
                      return (
                        <div key={row.label} style={{ marginBottom: i < MOCK_FUNNEL.length - 1 ? 10 : 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <div style={{ flex: 1, fontSize: 11, color: i === MOCK_FUNNEL.length - 1 ? "var(--ft-text)" : "var(--ft-dim)", fontWeight: i === MOCK_FUNNEL.length - 1 ? 600 : 400 }}>
                              {row.label}
                            </div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: row.color }}>
                              {isGross ? "+" : (i < MOCK_FUNNEL.length - 1 ? "−" : "+")}{formatGbp(row.amount)}
                            </div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", width: 30, textAlign: "right" }}>
                              {pct.toFixed(0)}%
                            </div>
                          </div>
                          <div style={{ height: i === MOCK_FUNNEL.length - 1 ? 7 : 4, background: "var(--ft-raised)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${barW}%`, background: row.color, opacity: isGross ? 0.5 : 0.85, borderRadius: 3 }} />
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--ft-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Save rate</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-green)" }}>
                        {((MOCK_FUNNEL[MOCK_FUNNEL.length - 1].amount / gross) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* 12-month spending calendar heatmap */}
              {hasMockData && (() => {
                // Generate mock weekly totals for past 52 weeks
                const SEED_WEEKLY = [
                  18,45,0,67,0,12,0,34,89,0,156,23,0,0,45,78,34,0,234,67,0,45,12,89,0,145,0,34,
                  56,22,98,0,140,76,23,45,110,0,189,44,0,67,33,55,0,88,176,0,32,11,65,0,
                ];
                const weeks = Array.from({ length: 52 }, (_, i) => {
                  const d = new Date();
                  d.setDate(d.getDate() - (51 - i) * 7);
                  return {
                    weekIdx: i,
                    amount: SEED_WEEKLY[i % SEED_WEEKLY.length] ?? 0,
                    month: d.toLocaleString("default", { month: "short" }),
                    monthNum: d.getMonth(),
                  };
                });

                const maxWeek = Math.max(...weeks.map(w => w.amount), 1);
                const totalYear = weeks.reduce((s, w) => s + w.amount, 0);
                const peakWeek = weeks.reduce((best, w) => w.amount > best.amount ? w : best, weeks[0]);
                const avgWeek = totalYear / weeks.filter(w => w.amount > 0).length;

                // Month labels: show first occurrence
                const monthLabels: Array<{ idx: number; label: string }> = [];
                let lastMonth = -1;
                for (const w of weeks) {
                  if (w.monthNum !== lastMonth) {
                    monthLabels.push({ idx: w.weekIdx, label: w.month });
                    lastMonth = w.monthNum;
                  }
                }

                // Render in rows of 13 (4 quarters)
                const COLS = 13;
                const ROWS = Math.ceil(52 / COLS);

                return (
                  <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                        52-week spend heatmap
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-red)" }}>
                        {formatGbp(totalYear)}/yr
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {Array.from({ length: ROWS }, (_, row) => (
                        <div key={row} style={{ display: "flex", gap: 2 }}>
                          {Array.from({ length: COLS }, (_, col) => {
                            const wIdx = row * COLS + col;
                            if (wIdx >= 52) return <div key={col} style={{ flex: 1, aspectRatio: "1" }} />;
                            const w = weeks[wIdx];
                            const heat = w.amount > 0 ? Math.round((w.amount / maxWeek) * 65) + 12 : 0;
                            const bg = w.amount > 0
                              ? `color-mix(in srgb, var(--ft-red) ${heat}%, var(--ft-raised))`
                              : "var(--ft-raised)";
                            const isCurrent = wIdx === 51;
                            return (
                              <div key={col} style={{
                                flex: 1,
                                aspectRatio: "1",
                                borderRadius: 2,
                                background: bg,
                                border: isCurrent ? "1px solid var(--ft-accent)" : "1px solid transparent",
                                opacity: w.amount === 0 ? 0.4 : 1,
                              }} />
                            );
                          })}
                        </div>
                      ))}
                    </div>

                    {/* Quarter labels */}
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                      {["Q4 prev", "Q1", "Q2", "Q3 now"].map(q => (
                        <span key={q} style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>{q}</span>
                      ))}
                    </div>

                    {/* Legend + stats */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--ft-border)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>Low</span>
                        {[12, 25, 45, 65, 85].map(h => (
                          <div key={h} style={{ width: 9, height: 9, borderRadius: 2, background: `color-mix(in srgb, var(--ft-red) ${h}%, var(--ft-raised))` }} />
                        ))}
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>High</span>
                      </div>
                      <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>peak wk</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-red)" }}>{formatGbp(peakWeek.amount)}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>avg wk</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-accent)" }}>{formatGbp(Math.round(avgWeek))}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {spendRows.length > 0 && <CatSection title="Spend by category" rows={spendRows} total={totalSpend} prevSpend={hasMockData ? MOCK_PREV_SPEND : undefined} />}
              {incomeRows.length > 0 && <CatSection title="Income by category" rows={incomeRows} total={totalIncome} green />}
              {spendRows.length === 0 && incomeRows.length === 0 && (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "32px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 13, color: "var(--ft-dim)" }}>No transactions this month</div>
                </div>
              )}
            </>
          )}

          <a href="/analytics" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", textDecoration: "none" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Full analytics</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)" }}>→</span>
          </a>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color, border }: { label: string; value: string; color: string; border?: boolean }) {
  return (
    <div style={{ padding: "14px 16px", borderLeft: border ? "1px solid var(--ft-border)" : "none" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color, letterSpacing: "-0.01em" }}>{value}</div>
    </div>
  );
}

function CatSection({ title, rows, total, green, prevSpend }: { title: string; rows: CatRow[]; total: number; green?: boolean; prevSpend?: Record<string, number> }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 6 }}>{title}</div>
      <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
        {rows.slice(0, 8).map((row, i) => {
          const pct      = total > 0 ? (row.amount / total) * 100 : 0;
          const color    = green ? "var(--ft-green)" : COLORS[i % COLORS.length];
          const isLast   = i === Math.min(rows.length, 8) - 1;
          const prev     = prevSpend?.[row.category] ?? null;
          const delta    = prev !== null ? row.amount - prev : null;
          const deltaPct = delta !== null && prev !== null && prev > 0 ? (delta / prev) * 100 : null;
          const dColor   = delta !== null && delta > 0
            ? (green ? "var(--ft-green)" : "var(--ft-red)")
            : (green ? "var(--ft-red)" : "var(--ft-green)");
          return (
            <div key={row.category} style={{ padding: "11px 16px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                <div style={{ width: 7, height: 7, borderRadius: 4, background: color, flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 12, fontWeight: 500, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.category}</div>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 8, color, padding: "1px 5px",
                  background: `color-mix(in srgb, ${color} 12%, transparent)`,
                  borderRadius: 3, marginRight: 4,
                }}>
                  {row.count} txn{row.count !== 1 ? "s" : ""}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", minWidth: 60 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)" }}>{formatGbp(row.amount)}</div>
                  {deltaPct !== null && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: dColor, lineHeight: 1, marginTop: 1 }}>
                      {delta! >= 0 ? "+" : "−"}{Math.abs(deltaPct).toFixed(0)}% MoM
                    </div>
                  )}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", minWidth: 28, textAlign: "right" }}>{pct.toFixed(0)}%</div>
              </div>
              <div style={{ height: 5, background: "var(--ft-raised)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, opacity: 0.8 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
