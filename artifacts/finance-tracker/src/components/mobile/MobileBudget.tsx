import { useMemo } from "react";
import { useListBudgets, useListTransactions } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { ArcGauge } from "./MobileCharts";
import { useWidgetVisibility } from "@/hooks/use-widget-visibility";
import { WidgetManagerButton } from "./MobileWidgetManager";

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function pctColor(pct: number): string {
  if (pct >= 100) return "var(--ft-red)";
  if (pct >= 80) return "var(--ft-amber)";
  return "var(--ft-green)";
}

const MOCK_BUDGETS = [
  { id: "mb1", category: "Food & Drink",   limit: 500, spent: 420  },
  { id: "mb2", category: "Transport",       limit: 200, spent: 85   },
  { id: "mb3", category: "Entertainment",   limit: 150, spent: 148  },
  { id: "mb4", category: "Shopping",        limit: 300, spent: 347  },
  { id: "mb5", category: "Health",          limit: 100, spent: 32   },
];

// Weekly spend for current month (4 weeks), current week is partial
const MOCK_WEEKLY_SPEND = [312, 287, 334, 99];  // wk1, wk2, wk3, wk4 (partial)
const MOCK_WEEKLY_LABELS = ["Wk 1", "Wk 2", "Wk 3", "Wk 4"];

function WeeklyBars({ data, labels }: { data: number[]; labels: string[] }) {
  const maxV = Math.max(...data, 1);
  const H = 56;
  const isPartial = data[data.length - 1] < data[data.length - 2] * 0.7;
  return (
    <div>
      <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: H }}>
        {data.map((v, i) => {
          const barH = Math.max(4, Math.round((v / maxV) * (H - 16)));
          const isCurrent = i === data.length - 1;
          const color = v > data[i - 1] * 1.1 ? "var(--ft-red)" : "var(--ft-green)";
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: isCurrent ? "var(--ft-accent)" : "var(--ft-dim)", marginBottom: 3 }}>
                {isCurrent && isPartial ? "…" : ""}£{Math.round(v)}
              </div>
              <div style={{
                width: "100%", height: barH,
                background: isCurrent ? (isPartial ? "var(--ft-accent)" : color) : color,
                borderRadius: "3px 3px 0 0",
                opacity: isCurrent ? 1 : 0.55,
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
        {labels.map((l, i) => (
          <div key={i} style={{
            flex: 1, textAlign: "center",
            fontFamily: "var(--font-mono)", fontSize: 7,
            color: i === labels.length - 1 ? "var(--ft-accent)" : "var(--ft-dim)",
          }}>{l}</div>
        ))}
      </div>
    </div>
  );
}

const BUDGET_WIDGETS = [
  { id: "weekly-chart",    label: "Weekly spending chart" },
  { id: "budget-trend",    label: "3-month utilization trend" },
  { id: "daily-burn",      label: "Daily burn rate chart" },
  { id: "health-scoreboard", label: "Budget health scoreboard" },
  { id: "allocation-bar",  label: "Budget attribution" },
  { id: "signals",         label: "Budget signals" },
  { id: "per-category",    label: "Per-category list" },
  { id: "cat-volatility",  label: "Category spend volatility" },
  { id: "rebalance",       label: "Budget surplus rebalancer" },
  { id: "503020",          label: "50/30 needs vs wants" },
];

export function MobileBudget() {
  const { data: rawBudgets = [], isLoading } = useListBudgets();
  const budgets = useMemo(() => rawBudgets.map(b => ({
    id: b.id,
    category: b.category ?? "",
    limit: (b as any).monthlyLimit ?? 0,
  })), [rawBudgets]);
  const { data: txns = [] } = useListTransactions({ dateFrom: firstOfMonth(), dateTo: today() });

  const spendByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of txns) {
      if (tx.type === "expense") {
        const cat = (tx.category ?? "Uncategorised").toLowerCase();
        map[cat] = (map[cat] ?? 0) + (tx.gbpValue ?? 0);
      }
    }
    return map;
  }, [txns]);

  const hasMockData     = budgets.length === 0;
  const displayBudgets  = hasMockData
    ? MOCK_BUDGETS
    : budgets.map(b => ({ ...b, spent: spendByCategory[(b.category ?? "").toLowerCase()] ?? 0 }));

  const totalBudget = displayBudgets.reduce((s, b) => s + b.limit, 0);
  const totalSpent  = displayBudgets.reduce((s, b) => s + b.spent, 0);

  const totalPct    = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const remaining   = totalBudget - totalSpent;
  const now          = new Date();
  const daysElapsed  = now.getDate();
  const daysInMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft     = daysInMonth - daysElapsed;
  const dailyLeft    = daysLeft > 0 && remaining > 0 ? remaining / daysLeft : null;
  const dailyBurn    = daysElapsed > 0 && totalSpent > 0 ? totalSpent / daysElapsed : null;
  const projected    = dailyBurn !== null ? dailyBurn * daysInMonth : null;
  const projDelta    = projected !== null ? projected - totalBudget : null;

  const { isVisible, toggle, resetAll, visible, hiddenCount } = useWidgetVisibility("budget", BUDGET_WIDGETS);

  // Budget signals — auto-derived insights
  const signals: Array<{ level: "red" | "amber" | "green"; headline: string; detail: string }> = [];
  if (displayBudgets.length > 0) {
    const overCats = displayBudgets.filter(b => b.limit > 0 && b.spent > b.limit)
      .sort((a, b) => (b.spent - b.limit) / b.limit - (a.spent - a.limit) / a.limit);
    const fastBurning = displayBudgets.filter(b => {
      if (b.limit <= 0 || b.spent >= b.limit || daysElapsed === 0) return false;
      return (b.spent / daysElapsed) / (b.limit / daysInMonth) > 1.25;
    }).sort((a, b) => (b.spent / b.limit) - (a.spent / a.limit));
    const sortedByBuffer = [...displayBudgets].filter(b => b.limit > 0)
      .sort((a, b) => (b.limit - b.spent) / b.limit - (a.limit - a.spent) / a.limit);
    if (overCats.length > 0) {
      const c = overCats[0];
      signals.push({ level: "red", headline: `${c.category} over budget`, detail: `+${formatGbp(c.spent - c.limit)} · ${Math.round((c.spent / c.limit - 1) * 100)}% excess` });
    }
    if (fastBurning.length > 0 && signals.length < 3) {
      const c = fastBurning[0];
      const v = ((c.spent / Math.max(daysElapsed, 1)) / (c.limit / daysInMonth)).toFixed(1);
      const projFull = Math.round((c.spent / Math.max(daysElapsed, 1)) * daysInMonth / c.limit * 100);
      signals.push({ level: "amber", headline: `${c.category} burning ${v}× pace`, detail: `Projected ${projFull}% used by month-end` });
    }
    if (sortedByBuffer.length > 0 && signals.length < 3) {
      const c = sortedByBuffer[0];
      const bufferPct = Math.round((1 - c.spent / c.limit) * 100);
      if (bufferPct > 30) signals.push({ level: "green", headline: `${c.category} has headroom`, detail: `${formatGbp(c.limit - c.spent)} available · ${bufferPct}% unused` });
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 16px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-text)" }}>
            Budget
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
              {now.toLocaleString("default", { month: "long" })}{hasMockData && " · preview"}
            </div>
            <WidgetManagerButton widgets={BUDGET_WIDGETS} visible={visible} onToggle={toggle} onReset={resetAll} hiddenCount={hiddenCount} />
          </div>
        </div>
      </div>

      <div className="mobile-scroll" style={{ flex: 1, overflowY: "auto", padding: "0 16px", paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 16px)" }}>
        {isLoading ? (
          <div style={{ textAlign: "center", color: "var(--ft-dim)", fontSize: 13, padding: 40 }}>Loading…</div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, opacity: isLoading ? 0 : hasMockData ? 0.85 : 1, transition: "opacity 0.12s" }}>
          {/* Hero summary card */}
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "22px 22px 20px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 14 }}>
              Monthly budget
            </div>

            {/* Arc gauge */}
            <div style={{ position: "relative", display: "flex", justifyContent: "center", marginBottom: 4 }}>
              <ArcGauge pct={totalPct} size={152} thickness={12} color={pctColor(totalPct)} />
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                display: "flex", flexDirection: "column", alignItems: "center",
                paddingBottom: 6,
              }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(22px, 7vw, 30px)", fontWeight: 700, color: pctColor(totalPct), letterSpacing: "-0.02em", lineHeight: 1 }}>
                  {totalPct}%
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 3 }}>
                  of budget used
                </div>
              </div>
            </div>

            {/* Budget-vs-time dual tracker */}
            {totalBudget > 0 && (() => {
              const timePct = Math.round((daysElapsed / daysInMonth) * 100);
              const spndPct = Math.min(100, totalPct);
              const paceGap = timePct - spndPct;
              const under   = paceGap > 0;
              return (
                <div style={{ margin: "14px 0 4px" }}>
                  {[
                    { label: "Time",  pct: timePct, color: "var(--ft-accent)" },
                    { label: "Spend", pct: spndPct, color: pctColor(totalPct) },
                  ].map(row => (
                    <div key={row.label} style={{ marginBottom: 5 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>{row.label}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, color: row.color }}>{row.pct}%</span>
                      </div>
                      <div style={{ height: 3, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${row.pct}%`, background: row.color, borderRadius: 2 }} />
                      </div>
                    </div>
                  ))}
                  {Math.abs(paceGap) >= 3 && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: under ? "var(--ft-green)" : "var(--ft-red)", marginTop: 1 }}>
                      {under ? `${paceGap}% under pace` : `${Math.abs(paceGap)}% over pace`}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12, borderTop: "1px solid var(--ft-border)", paddingTop: 14 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Spent</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-text)" }}>{formatGbp(totalSpent)}</div>
              </div>
              <div style={{ textAlign: "center", borderLeft: "1px solid var(--ft-border)", borderRight: "1px solid var(--ft-border)" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Budget</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-text)" }}>{formatGbp(totalBudget)}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
                  {remaining >= 0 ? "Left" : "Over"}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: remaining >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                  {formatGbp(Math.abs(remaining))}
                </div>
              </div>
            </div>

            {/* Daily budget + projected strip */}
            {(dailyLeft !== null || projected !== null) && daysLeft > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--ft-border)", display: "flex", flexDirection: "column", gap: 8 }}>
                {dailyLeft !== null && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      {daysLeft}d left · daily budget
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: pctColor(totalPct) }}>
                      {formatGbp(dailyLeft)}/day
                    </div>
                  </div>
                )}
                {projected !== null && projDelta !== null && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      Projected month-end
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: projDelta > 0 ? "var(--ft-red)" : "var(--ft-green)" }}>
                        {formatGbp(projected)}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: projDelta > 0 ? "var(--ft-red)" : "var(--ft-green)" }}>
                        {projDelta > 0 ? "+" : ""}{formatGbp(projDelta)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Weekly spend chart (mock only) */}
          {isVisible("weekly-chart") && hasMockData && (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 10 }}>
                Weekly spending
              </div>
              <WeeklyBars data={MOCK_WEEKLY_SPEND} labels={MOCK_WEEKLY_LABELS} />
            </div>
          )}

          {/* 3-month budget utilization trend */}
          {isVisible("budget-trend") && hasMockData && (() => {
            const getMLbl = (offset: number) => {
              const d = new Date();
              d.setMonth(d.getMonth() + offset);
              return d.toLocaleString("default", { month: "short" });
            };
            const monthHistory = [
              { month: getMLbl(-2), spent: 1189, budget: 1250, pct: Math.round((1189 / 1250) * 100) },
              { month: getMLbl(-1), spent: 1332, budget: 1250, pct: Math.round((1332 / 1250) * 100) },
              { month: getMLbl(0),  spent: Math.round(totalSpent), budget: totalBudget, pct: totalPct },
            ];
            const maxSpent = Math.max(...monthHistory.map(m => m.spent), totalBudget);
            const trendDelta = monthHistory[2].pct - monthHistory[0].pct;
            const avg3m = Math.round(monthHistory.reduce((s, m) => s + m.spent, 0) / monthHistory.length);
            const bestPct = Math.min(...monthHistory.map(m => m.pct));
            const worstPct = Math.max(...monthHistory.map(m => m.pct));
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Utilization · 3M
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: trendDelta <= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                    {trendDelta > 0 ? "+" : ""}{trendDelta}% vs 2mo ago
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {monthHistory.map((m, i) => {
                    const isCurrent = i === monthHistory.length - 1;
                    const col = m.pct >= 100 ? "var(--ft-red)" : m.pct >= 80 ? "var(--ft-amber)" : "var(--ft-green)";
                    const barH = Math.max(6, (m.spent / maxSpent) * 50);
                    const budgetLineBottom = (m.budget / maxSpent) * 50;
                    return (
                      <div key={m.month} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: isCurrent ? col : "var(--ft-dim)", fontWeight: isCurrent ? 700 : 400, marginBottom: 3, fontVariantNumeric: "tabular-nums" }}>
                          {m.pct}%
                        </div>
                        <div style={{ width: "100%", position: "relative", height: 54, display: "flex", alignItems: "flex-end" }}>
                          <div style={{ position: "absolute", left: 0, right: 0, bottom: budgetLineBottom, height: 1, background: isCurrent ? "var(--ft-accent)" : "var(--ft-border)", opacity: 0.65 }} />
                          <div style={{ width: "100%", height: barH, background: col, borderRadius: "2px 2px 0 0", opacity: isCurrent ? 1 : 0.45 }} />
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: isCurrent ? "var(--ft-accent)" : "var(--ft-dim)", marginTop: 4, textAlign: "center" }}>
                          {m.month}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--ft-border)", display: "flex", gap: 16 }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>3M avg</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-text)", marginTop: 1, fontVariantNumeric: "tabular-nums" }}>{formatGbp(avg3m)}/mo</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Best</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-green)", marginTop: 1, fontVariantNumeric: "tabular-nums" }}>{bestPct}%</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Worst</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-red)", marginTop: 1, fontVariantNumeric: "tabular-nums" }}>{worstPct}%</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Daily burn rate vs. ideal pace chart */}
          {isVisible("daily-burn") && totalBudget > 0 && totalSpent > 0 && daysElapsed > 0 && (() => {
            const W = 300, H = 72, PX = 8, PY = 10;
            const projectedMonthEnd = Math.round((totalSpent / daysElapsed) * daysInMonth);
            const yMax = Math.max(totalBudget * 1.05, projectedMonthEnd * 1.02);
            const xOf = (day: number) => PX + (day / daysInMonth) * (W - 2 * PX);
            const yOf = (spend: number) => PY + (1 - spend / yMax) * (H - 2 * PY);
            const x0 = xOf(0), y0 = yOf(0);
            const xNow = xOf(daysElapsed), yNow = yOf(totalSpent);
            const xEnd = xOf(daysInMonth);
            const yBudget = yOf(totalBudget);
            const yProj = yOf(projectedMonthEnd);
            const paceAtNow = (totalBudget / daysInMonth) * daysElapsed;
            const yPaceNow = yOf(paceAtNow);
            const isOverPace = totalSpent > paceAtNow;
            const lineColor = isOverPace ? "var(--ft-red)" : "var(--ft-green)";
            const areaPath = `M ${x0.toFixed(1)},${y0.toFixed(1)} L ${xNow.toFixed(1)},${yNow.toFixed(1)} L ${xNow.toFixed(1)},${yPaceNow.toFixed(1)} L ${x0.toFixed(1)},${y0.toFixed(1)} Z`;
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Burn rate · {now.toLocaleString("default", { month: "short" })}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: projectedMonthEnd > totalBudget ? "var(--ft-red)" : "var(--ft-green)" }}>
                    proj. {formatGbp(projectedMonthEnd)}
                    {projectedMonthEnd > totalBudget ? ` +${formatGbp(projectedMonthEnd - totalBudget)}` : " on track"}
                  </div>
                </div>
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
                  <defs>
                    <linearGradient id="burn-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
                      <stop offset="100%" stopColor={lineColor} stopOpacity="0.04" />
                    </linearGradient>
                  </defs>
                  {/* Budget ceiling */}
                  <line x1={PX} y1={yBudget} x2={xEnd} y2={yBudget} stroke="var(--ft-accent)" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.5" />
                  <text x={xEnd - 1} y={yBudget - 3} fontFamily="monospace" fontSize="6.5" fill="var(--ft-accent)" textAnchor="end" opacity="0.8">
                    {formatGbp(totalBudget)}
                  </text>
                  {/* Ideal linear pace line */}
                  <line x1={x0} y1={y0} x2={xEnd} y2={yBudget} stroke="var(--ft-dim)" strokeWidth="1" strokeDasharray="2 2.5" opacity="0.45" />
                  {/* Divergence fill between actual and pace */}
                  <path d={areaPath} fill="url(#burn-grad)" />
                  {/* Actual spend solid line */}
                  <line x1={x0} y1={y0} x2={xNow} y2={yNow} stroke={lineColor} strokeWidth="2" strokeLinecap="round" />
                  {/* Projected dotted continuation */}
                  <line x1={xNow} y1={yNow} x2={xEnd} y2={yProj} stroke={lineColor} strokeWidth="1.2" strokeDasharray="2 3" opacity="0.55" />
                  {/* "Now" vertical marker */}
                  <line x1={xNow} y1={PY - 3} x2={xNow} y2={H - PY + 2} stroke="var(--ft-dim)" strokeWidth="0.5" opacity="0.25" />
                  {/* Current position ring + dot */}
                  <circle cx={xNow} cy={yNow} r="3.5" fill={lineColor} />
                  <circle cx={xNow} cy={yNow} r="2" fill="var(--ft-base)" />
                  {/* Projected end ghost dot */}
                  <circle cx={xEnd} cy={yProj} r="2.5" fill={lineColor} opacity="0.45" />
                  {/* X labels */}
                  <text x={PX} y={H + 1} fontFamily="monospace" fontSize="7" fill="var(--ft-dim)" textAnchor="start" dominantBaseline="hanging">1</text>
                  <text x={xNow} y={H + 1} fontFamily="monospace" fontSize="7" fill="var(--ft-accent)" textAnchor="middle" dominantBaseline="hanging">D{daysElapsed}</text>
                  <text x={xEnd} y={H + 1} fontFamily="monospace" fontSize="7" fill="var(--ft-dim)" textAnchor="end" dominantBaseline="hanging">{daysInMonth}</text>
                </svg>
                <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
                  {[
                    { color: lineColor, dashed: false, label: "ACTUAL" },
                    { color: "var(--ft-dim)", dashed: true, label: "IDEAL PACE" },
                    { color: "var(--ft-accent)", dashed: true, label: "BUDGET" },
                  ].map(item => (
                    <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <svg width="16" height="6" style={{ flexShrink: 0 }}>
                        <line x1="0" y1="3" x2="16" y2="3" stroke={item.color} strokeWidth="1.5"
                          strokeDasharray={item.dashed ? "2 2" : undefined} opacity={item.dashed ? 0.5 : 0.9} />
                      </svg>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Budget health scoreboard */}
          {isVisible("health-scoreboard") && displayBudgets.length > 0 && (() => {
            const over    = displayBudgets.filter(b => b.limit > 0 && b.spent > b.limit).length;
            const warning = displayBudgets.filter(b => b.limit > 0 && b.spent <= b.limit && (b.spent / b.limit) >= 0.8).length;
            const onTrack = displayBudgets.length - over - warning;
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "11px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Budget health
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>{displayBudgets.length} categories</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {onTrack > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, background: "color-mix(in srgb, var(--ft-green) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--ft-green) 25%, transparent)", borderRadius: 4, padding: "4px 10px" }}>
                      <div style={{ width: 5, height: 5, borderRadius: 3, background: "var(--ft-green)" }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-green)" }}>{onTrack} On Track</span>
                    </div>
                  )}
                  {warning > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, background: "color-mix(in srgb, var(--ft-amber) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--ft-amber) 25%, transparent)", borderRadius: 4, padding: "4px 10px" }}>
                      <div style={{ width: 5, height: 5, borderRadius: 3, background: "var(--ft-amber)" }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-amber)" }}>{warning} Warning</span>
                    </div>
                  )}
                  {over > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, background: "color-mix(in srgb, var(--ft-red) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--ft-red) 25%, transparent)", borderRadius: 4, padding: "4px 10px" }}>
                      <div style={{ width: 5, height: 5, borderRadius: 3, background: "var(--ft-red)" }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-red)" }}>{over} Over</span>
                    </div>
                  )}
                </div>
                {/* Allocation proportion bar */}
                <div style={{ display: "flex", height: 4, borderRadius: 2, overflow: "hidden", gap: 1, marginTop: 10 }}>
                  {displayBudgets.map((b, i) => {
                    const shade = b.limit > 0 && b.spent > b.limit ? "var(--ft-red)" : b.limit > 0 && (b.spent / b.limit) >= 0.8 ? "var(--ft-amber)" : "var(--ft-green)";
                    return (
                      <div key={b.id} style={{ flex: b.limit / Math.max(totalBudget, 1), background: shade, opacity: 0.7 }} />
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Budget attribution */}
          {isVisible("allocation-bar") && displayBudgets.length > 0 && (() => {
            const underBudget = displayBudgets.filter(b => b.limit > 0 && b.spent < b.limit);
            const overBudget  = displayBudgets.filter(b => b.limit > 0 && b.spent > b.limit);
            const totalSaved  = underBudget.reduce((s, b) => s + (b.limit - b.spent), 0);
            const totalOver   = overBudget.reduce((s, b)  => s + (b.spent - b.limit),  0);
            const netPos      = totalSaved - totalOver;
            if (underBudget.length === 0 && overBudget.length === 0) return null;
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Budget attribution</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: netPos >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                    net {netPos >= 0 ? "+" : "−"}{formatGbp(Math.abs(netPos))}
                  </span>
                </div>
                {underBudget.length > 0 && (
                  <div style={{ marginBottom: overBudget.length > 0 ? 8 : 0 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-green)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Under budget</div>
                    {[...underBudget].sort((a, b) => (b.limit - b.spent) - (a.limit - a.spent)).map(b => (
                      <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 11, color: "var(--ft-dim)", flex: 1, textTransform: "capitalize", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.category}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", minWidth: 30, textAlign: "right" }}>{Math.round((b.spent / b.limit) * 100)}%</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-green)", minWidth: 52, textAlign: "right" }}>
                          -{formatGbp(b.limit - b.spent)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {overBudget.length > 0 && (
                  <div style={{ paddingTop: underBudget.length > 0 ? 8 : 0, borderTop: underBudget.length > 0 ? "1px solid var(--ft-border)" : "none" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-red)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Over budget</div>
                    {[...overBudget].sort((a, b) => (b.spent - b.limit) - (a.spent - a.limit)).map(b => (
                      <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 11, color: "var(--ft-dim)", flex: 1, textTransform: "capitalize", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.category}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", minWidth: 30, textAlign: "right" }}>{Math.round((b.spent / b.limit) * 100)}%</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-red)", minWidth: 52, textAlign: "right" }}>
                          +{formatGbp(b.spent - b.limit)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--ft-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Net vs budget</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: netPos >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                    {netPos >= 0 ? "+" : "−"}{formatGbp(Math.abs(netPos))}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Budget signals */}
          {isVisible("signals") && signals.length > 0 && (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ padding: "9px 14px 8px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-accent)" }}>Signals</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>{signals.length} alert{signals.length > 1 ? "s" : ""}</span>
              </div>
              {signals.map((sig, i) => {
                const color = sig.level === "red" ? "var(--ft-red)" : sig.level === "amber" ? "var(--ft-amber)" : "var(--ft-green)";
                const isLast = i === signals.length - 1;
                return (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "9px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)", alignItems: "flex-start" }}>
                    <div style={{ width: 2, alignSelf: "stretch", background: color, borderRadius: 1, flexShrink: 0, opacity: 0.8, marginTop: 1 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color, marginBottom: 2, textTransform: "capitalize" }}>{sig.headline}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.02em" }}>{sig.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Per-category list */}
          {isVisible("per-category") && <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
            {displayBudgets.map((budget, i) => {
              const pct    = budget.limit > 0 ? Math.round((budget.spent / budget.limit) * 100) : 0;
              const isLast = i === displayBudgets.length - 1;
              const color  = pctColor(pct);
              // Projected spend at month end based on daily burn rate
              const projPct = dailyBurn !== null && budget.limit > 0
                ? Math.min(150, Math.round(((budget.spent / Math.max(daysElapsed, 1)) * daysInMonth / budget.limit) * 100))
                : null;
              // Spending velocity: actual daily rate ÷ expected daily rate
              const velocity = daysElapsed > 0 && budget.limit > 0 && pct < 100
                ? parseFloat(((budget.spent / daysElapsed) / (budget.limit / daysInMonth)).toFixed(1))
                : null;
              const velFast = velocity !== null && velocity > 1.25;
              const velSlow = velocity !== null && velocity < 0.6;
              return (
                <div key={budget.id} style={{ padding: "13px 16px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ft-text)", textTransform: "capitalize" }}>
                        {budget.category}
                      </div>
                      {pct >= 100 && (
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, color: "var(--ft-red)", background: "color-mix(in srgb, var(--ft-red) 14%, transparent)", padding: "1px 5px", borderRadius: 3, letterSpacing: "0.06em" }}>OVER</div>
                      )}
                      {pct >= 80 && pct < 100 && (
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, color: "var(--ft-amber)", background: "color-mix(in srgb, var(--ft-amber) 14%, transparent)", padding: "1px 5px", borderRadius: 3, letterSpacing: "0.06em" }}>WARN</div>
                      )}
                      {velFast && (
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, color: "var(--ft-red)", background: "color-mix(in srgb, var(--ft-red) 10%, transparent)", padding: "1px 5px", borderRadius: 3, letterSpacing: "0.04em" }}>↑{velocity}×</div>
                      )}
                      {velSlow && (
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, color: "var(--ft-green)", background: "color-mix(in srgb, var(--ft-green) 10%, transparent)", padding: "1px 5px", borderRadius: 3, letterSpacing: "0.04em" }}>↓{velocity}×</div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>
                        / {formatGbp(budget.limit)}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color }}>
                        {formatGbp(budget.spent)}
                      </span>
                    </div>
                  </div>
                  {/* Progress bar with projected ghost */}
                  <div style={{ position: "relative", height: 5, background: "var(--ft-raised)", borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
                    {/* Projected ghost bar */}
                    {projPct !== null && projPct > pct && daysLeft > 0 && (
                      <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(projPct, 100)}%`, background: pctColor(projPct), opacity: 0.2, borderRadius: 3 }} />
                    )}
                    {/* Actual bar */}
                    <div style={{ position: "absolute", left: 0, top: 0, height: "100%", borderRadius: 3, width: `${Math.min(pct, 100)}%`, background: color }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {pct > 100 ? (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-red)", letterSpacing: "0.04em" }}>
                        Over by {formatGbp(budget.spent - budget.limit)}
                      </span>
                    ) : (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                        {formatGbp(Math.max(0, budget.limit - budget.spent))} left
                      </span>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {projPct !== null && projPct > 100 && daysLeft > 0 && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-red)", opacity: 0.8 }}>
                          proj. {projPct}%
                        </span>
                      )}
                      {daysLeft > 0 && budget.limit > budget.spent && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-accent)" }}>
                          {formatGbp((budget.limit - budget.spent) / daysLeft)}/day
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>}

          {/* Category spending volatility */}
          {isVisible("cat-volatility") && hasMockData && (() => {
            const MOCK_CAT_HISTORY: Record<string, [number, number, number]> = {
              "Food & Drink":  [385, 460, 420],
              "Transport":     [92,  78,  85 ],
              "Entertainment": [210, 95,  148],
              "Shopping":      [180, 320, 347],
              "Health":        [0,   55,  32 ],
            };
            const rows = Object.entries(MOCK_CAT_HISTORY).map(([cat, hist]) => {
              const mean = hist.reduce((s, v) => s + v, 0) / hist.length;
              const variance = hist.reduce((s, v) => s + (v - mean) ** 2, 0) / hist.length;
              const cv = mean > 0 ? (Math.sqrt(variance) / mean) * 100 : 0;
              const stability = cv < 15 ? "stable" : cv < 35 ? "variable" : "erratic";
              const color = stability === "stable" ? "var(--ft-green)" : stability === "variable" ? "var(--ft-accent)" : "var(--ft-red)";
              return { cat, hist, mean, cv, stability, color };
            }).sort((a, b) => b.cv - a.cv);
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 3, overflow: "hidden", opacity: 0.85 }}>
                <div style={{ padding: "9px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Spend volatility · 3M</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>CV = σ/μ</span>
                </div>
                {rows.map((r, i) => {
                  const isLast = i === rows.length - 1;
                  const histMax = Math.max(...r.hist, 1);
                  return (
                    <div key={r.cat} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.cat}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>CV {r.cv.toFixed(0)}%</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, color: r.color, padding: "1px 4px", borderRadius: 2, background: `color-mix(in srgb, ${r.color} 12%, transparent)`, textTransform: "uppercase", letterSpacing: "0.06em" }}>{r.stability}</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 18 }}>
                          {r.hist.map((v, j) => (
                            <div key={j} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                              <div style={{ height: `${Math.max(3, (v / histMax) * 100)}%`, background: j === 2 ? r.color : `color-mix(in srgb, ${r.color} 40%, var(--ft-raised))`, borderRadius: "1px 1px 0 0", opacity: j === 2 ? 0.9 : 0.6 }} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div style={{ padding: "7px 14px", borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                  3-month spending consistency · rightmost bar = this month
                </div>
              </div>
            );
          })()}

          {/* Budget Surplus Rebalancer */}
          {isVisible("rebalance") && displayBudgets.length > 0 && (() => {
            const over  = displayBudgets.filter(b => b.spent > b.limit).map(b => ({ ...b, delta: b.spent - b.limit }));
            const under = displayBudgets.filter(b => b.spent < b.limit).map(b => ({ ...b, delta: b.limit - b.spent })).sort((a, b) => b.delta - a.delta);
            const totalOver  = over.reduce((s, b) => s + b.delta, 0);
            const totalUnder = under.reduce((s, b) => s + b.delta, 0);
            const net = totalUnder - totalOver;
            const netColor = net >= 0 ? "var(--ft-green)" : "var(--ft-red)";
            const maxDelta = Math.max(...[...over, ...under].map(b => b.delta), 1);
            if (over.length === 0 && under.length === 0) return null;
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 3, overflow: "hidden", opacity: hasMockData ? 0.85 : 1 }}>
                <div style={{ padding: "9px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Budget Rebalance</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: netColor }}>
                    {net >= 0 ? "+" : "−"}{formatGbp(Math.abs(net))} net
                  </span>
                </div>
                {over.length > 0 && (
                  <div style={{ padding: "8px 14px 4px", borderBottom: under.length > 0 ? "1px solid var(--ft-border)" : "none" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-red)", marginBottom: 6 }}>
                      Over budget · {over.length}
                    </div>
                    {over.map(b => (
                      <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-text)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.category}</span>
                        <div style={{ width: 64, height: 4, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${(b.delta / maxDelta) * 100}%`, background: "var(--ft-red)", borderRadius: 2, opacity: 0.75 }} />
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-red)", width: 44, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                          −{formatGbp(b.delta)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {under.length > 0 && (
                  <div style={{ padding: "8px 14px 4px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-green)", marginBottom: 6 }}>
                      Under budget · {under.length}
                    </div>
                    {under.slice(0, 4).map(b => (
                      <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-text)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.category}</span>
                        <div style={{ width: 64, height: 4, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${(b.delta / maxDelta) * 100}%`, background: "var(--ft-green)", borderRadius: 2, opacity: 0.7 }} />
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-green)", width: 44, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                          +{formatGbp(b.delta)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ padding: "6px 14px 8px", borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 7.5, color: net >= 0 ? "var(--ft-dim)" : "var(--ft-accent)" }}>
                  {over.length === 0
                    ? `All categories within budget · ${formatGbp(totalUnder)} surplus this month`
                    : net >= 0
                    ? `Overspend covered by surplus · ${formatGbp(net)} unallocated to redirect`
                    : `Net deficit ${formatGbp(Math.abs(net))} · review ${over[0].category} spending`
                  }
                </div>
              </div>
            );
          })()}

          {/* 50/30 needs vs wants check */}
          {isVisible("503020") && hasMockData && (() => {
            const NS = new Set(["food & drink", "transport", "health"]);
            const nS = displayBudgets.filter(b => NS.has(b.category.toLowerCase())).reduce((s, b) => s + b.spent, 0);
            const wS = displayBudgets.filter(b => !NS.has(b.category.toLowerCase())).reduce((s, b) => s + b.spent, 0);
            const tot = nS + wS || 1;
            const nP = Math.round(nS / tot * 100), wP = 100 - nP;
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 9 }}>50/30 needs vs wants</div>
                {([["Needs", nP, 63, nS, "var(--ft-green)"], ["Wants", wP, 37, wS, "var(--ft-accent)"]] as [string, number, number, number, string][]).map(([lbl, pct, ideal, spent, col]) => (
                  <div key={lbl} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: col, fontWeight: 700 }}>{lbl} · {formatGbp(spent)}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: Math.abs(pct - ideal) <= 8 ? col : "var(--ft-red)", fontVariantNumeric: "tabular-nums" }}>{pct}% <span style={{ fontSize: 7, fontWeight: 400, color: "var(--ft-dim)" }}>/{ideal}</span></span>
                    </div>
                    <div style={{ position: "relative", height: 4, background: "var(--ft-raised)", borderRadius: 2 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 2, opacity: 0.7 }} />
                      <div style={{ position: "absolute", top: -1, left: `${ideal}%`, width: 1.5, height: 6, background: "var(--ft-dim)", opacity: 0.4 }} />
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>50/30/20 rule · tracked spend only · | = ideal split</div>
              </div>
            );
          })()}

          <a href="/budget" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", textDecoration: "none" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Manage budgets</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)" }}>→</span>
          </a>
        </div>
      </div>
    </div>
  );
}
