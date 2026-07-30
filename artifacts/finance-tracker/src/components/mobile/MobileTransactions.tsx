import { useState, useMemo, useCallback } from "react";
import { useListTransactions, ListTransactionsQueryResult } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { Search, X } from "lucide-react";
import { useWidgetVisibility } from "@/hooks/use-widget-visibility";
import { WidgetManagerButton } from "./MobileWidgetManager";

type FilterType = "all" | "income" | "expense";
type TxItem = ListTransactionsQueryResult[number];

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

const MOCK_TXN_DATA = [
  { id: "mt1",  description: "Tesco Express",    category: "Groceries",     type: "expense", gbpValue: -34.20, date: daysAgo(0) },
  { id: "mt2",  description: "Spotify",           category: "Subscriptions", type: "expense", gbpValue: -9.99,  date: daysAgo(0) },
  { id: "mt3",  description: "Salary",            category: "Income",        type: "income",  gbpValue: 3200,   date: daysAgo(1) },
  { id: "mt4",  description: "Uber",              category: "Transport",     type: "expense", gbpValue: -12.40, date: daysAgo(1) },
  { id: "mt5",  description: "Pret a Manger",     category: "Food",          type: "expense", gbpValue: -8.60,  date: daysAgo(2) },
  { id: "mt6",  description: "Netflix",           category: "Entertainment", type: "expense", gbpValue: -15.99, date: daysAgo(2) },
  { id: "mt7",  description: "H&M",               category: "Shopping",      type: "expense", gbpValue: -67.50, date: daysAgo(3) },
  { id: "mt8",  description: "Costa Coffee",      category: "Food",          type: "expense", gbpValue: -4.80,  date: daysAgo(4) },
  { id: "mt9",  description: "Amazon",            category: "Shopping",      type: "expense", gbpValue: -23.99, date: daysAgo(5) },
  { id: "mt10", description: "Freelance Invoice", category: "Income",        type: "income",  gbpValue: 500,    date: daysAgo(6) },
] as unknown as TxItem[];

const CAT_COLORS: Record<string, string> = {
  groceries: "#10B981", supermarket: "#10B981",
  food: "var(--ft-amber)", dining: "var(--ft-amber)", restaurant: "var(--ft-amber)",
  transport: "#3B82F6", travel: "#3B82F6",
  entertainment: "#38BDF8", shopping: "#F97316",
  utilities: "#6B7280", health: "#EF4444",
  income: "#10B981", salary: "#10B981", freelance: "#10B981",
  rent: "#F97316", subscriptions: "#60A5FA",
};

function groupByDate(txns: TxItem[]): [string, TxItem[]][] {
  const map = new Map<string, TxItem[]>();
  for (const tx of txns) {
    const d = tx.date ?? "";
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(tx);
  }
  return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
}

function relLabel(dateStr: string): string {
  const t = new Date().toISOString().slice(0, 10);
  if (dateStr === t) return "Today";
  const y = new Date(new Date(t).getTime() - 86400000).toISOString().slice(0, 10);
  if (dateStr === y) return "Yesterday";
  return new Date(dateStr).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

const TRANSACTIONS_WIDGETS = [
  { id: "category-spend",   label: "Category spend breakdown" },
  { id: "daily-bars",       label: "Daily spend bars" },
  { id: "running-balance",  label: "Running balance chart" },
  { id: "top-expenses",     label: "Top expenses ranking" },
  { id: "merchant-loyalty", label: "Repeat merchants" },
  { id: "smart-insights",   label: "Smart insights" },
  { id: "spend-intel",      label: "Spend intelligence" },
  { id: "dow-pattern",      label: "Intraweek spending pattern" },
  { id: "size-dist",        label: "Transaction size bands" },
];

export function MobileTransactions() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [sortByAmt, setSortByAmt] = useState(false);

  const { data: txns, isLoading } = useListTransactions({});

  const hasMockData = txns === undefined || (txns ?? []).length === 0;
  const totalCount  = hasMockData ? MOCK_TXN_DATA.length : (txns ?? []).length;
  const baseData    = hasMockData ? MOCK_TXN_DATA : (txns ?? []);

  const chipCounts = {
    all:     baseData.length,
    income:  baseData.filter(t => t.type === "income").length,
    expense: baseData.filter(t => t.type === "expense").length,
  };

  const filtered = useMemo(() => {
    const raw  = txns ?? [];
    const base = (!isLoading && raw.length === 0) ? MOCK_TXN_DATA : raw;
    const q    = query.toLowerCase();
    return base.filter(tx => {
      if (filter !== "all" && tx.type !== filter) return false;
      if (q && !((tx.description ?? "").toLowerCase().includes(q)) && !((tx.category ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [txns, isLoading, query, filter]);

  const groups = useMemo(() => {
    const grouped = groupByDate(filtered);
    if (!sortByAmt) return grouped;
    return grouped.map(([d, txs]) => [d, [...txs].sort((a, b) => Math.abs(b.gbpValue ?? 0) - Math.abs(a.gbpValue ?? 0))] as [string, TxItem[]]);
  }, [filtered, sortByAmt]);

  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySpend = baseData
      .filter(t => t.date === todayStr && t.type === "expense")
      .reduce((s, t) => s + Math.abs(t.gbpValue ?? 0), 0);
    const totalIncome   = baseData.filter(t => t.type === "income").reduce((s, t) => s + (t.gbpValue ?? 0), 0);
    const totalExpenses = baseData.filter(t => t.type === "expense").reduce((s, t) => s + Math.abs(t.gbpValue ?? 0), 0);
    return { todaySpend, net: totalIncome - totalExpenses, count: baseData.length };
  }, [baseData]);

  const clearSearch = useCallback(() => setQuery(""), []);
  const { isVisible, toggle, resetAll, visible, hiddenCount } = useWidgetVisibility("transactions", TRANSACTIONS_WIDGETS);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 16px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-text)" }}>
            Transactions
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {(hasMockData || (txns ?? []).length > 0) && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
                {filtered.length}{filtered.length !== totalCount ? ` / ${totalCount}` : ""} entries{hasMockData && " · preview"}
              </div>
            )}
            <WidgetManagerButton widgets={TRANSACTIONS_WIDGETS} visible={visible} onToggle={toggle} onReset={resetAll} hiddenCount={hiddenCount} />
          </div>
        </div>

        {/* Search */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--ft-raised)", border: "1px solid var(--ft-border)",
          borderRadius: 4, padding: "0 12px", marginBottom: 10,
        }}>
          <Search size={14} style={{ color: "var(--ft-dim)", flexShrink: 0 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search transactions..."
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ft-text)",
              padding: "13px 0", minHeight: 44,
            }}
          />
          {query && (
            <button onClick={clearSearch} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-dim)", display: "flex" }}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
          {(["all", "income", "expense"] as FilterType[]).map(f => {
            const label = f === "all" ? "All" : f === "income" ? "Income" : "Expenses";
            const count = chipCounts[f];
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em",
                  textTransform: "uppercase", padding: "5px 10px",
                  background: filter === f ? "var(--ft-accent)" : "var(--ft-raised)",
                  color: filter === f ? "var(--ft-base)" : "var(--ft-dim)",
                  border: `1px solid ${filter === f ? "var(--ft-accent)" : "var(--ft-border)"}`,
                  borderRadius: 4, cursor: "pointer", fontWeight: filter === f ? 700 : 400,
                  display: "flex", alignItems: "center", gap: 5,
                }}
              >
                {label}
                <span style={{
                  fontSize: 9,
                  background: filter === f ? "rgba(0,0,0,0.2)" : "var(--ft-border)",
                  color: filter === f ? "var(--ft-base)" : "var(--ft-dim)",
                  borderRadius: 3, padding: "1px 5px", fontWeight: 700,
                }}>
                  {count}
                </span>
              </button>
            );
          })}
          <button
            onClick={() => setSortByAmt(s => !s)}
            title="Sort by amount"
            style={{
              marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em",
              padding: "5px 9px", flexShrink: 0,
              background: sortByAmt ? `color-mix(in srgb, var(--ft-accent) 15%, transparent)` : "var(--ft-raised)",
              color: sortByAmt ? "var(--ft-accent)" : "var(--ft-dim)",
              border: `1px solid ${sortByAmt ? "var(--ft-accent)" : "var(--ft-border)"}`,
              borderRadius: 4, cursor: "pointer", fontWeight: sortByAmt ? 700 : 400,
            }}
          >
            £↓
          </button>
        </div>

        {/* Stats strip */}
        {!isLoading && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 12, opacity: hasMockData ? 0.85 : 1 }}>
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>Today</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: stats.todaySpend > 0 ? "var(--ft-red)" : "var(--ft-dim)" }}>
                {stats.todaySpend > 0 ? `−${formatGbp(stats.todaySpend)}` : "—"}
              </div>
            </div>
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>Txns</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)" }}>{stats.count}</div>
            </div>
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>Net</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: stats.net >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                {stats.net >= 0 ? "+" : "−"}{formatGbp(Math.abs(stats.net))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* List */}
      <div className="mobile-scroll" style={{ flex: 1, overflowY: "auto", padding: "0 16px", paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 16px)" }}>
        {isLoading ? (
          <div style={{ textAlign: "center", color: "var(--ft-dim)", fontSize: 13, paddingTop: 40 }}>Loading…</div>
        ) : (
          <>
            {/* Category spend breakdown */}
            {isVisible("category-spend") && (() => {
              const expenseTxns = baseData.filter(t => t.type === "expense");
              if (expenseTxns.length === 0) return null;
              const catMap: Record<string, number> = {};
              for (const t of expenseTxns) {
                const cat = (t.category ?? "Other").toLowerCase();
                catMap[cat] = (catMap[cat] ?? 0) + Math.abs(t.gbpValue ?? 0);
              }
              const totalSpend = Object.values(catMap).reduce((s, v) => s + v, 0);
              const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
              const maxCat = sorted[0]?.[1] ?? 1;
              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 10px", marginBottom: 10, opacity: hasMockData ? 0.85 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                      Spending by category
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-red)", fontWeight: 700 }}>
                      −{formatGbp(totalSpend)}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {sorted.map(([cat, amt]) => {
                      const pct = (amt / totalSpend) * 100;
                      const barPct = (amt / maxCat) * 100;
                      const color = CAT_COLORS[cat] ?? "#6B7280";
                      const label = cat.charAt(0).toUpperCase() + cat.slice(1);
                      return (
                        <div key={cat}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <div style={{ width: 5, height: 5, borderRadius: 2.5, background: color, flexShrink: 0 }} />
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-text)" }}>{label}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-text)" }}>−{formatGbp(amt)}</span>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>{pct.toFixed(0)}%</span>
                            </div>
                          </div>
                          <div style={{ height: 3, background: "var(--ft-raised)", borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${barPct}%`, background: color, borderRadius: 2, opacity: 0.8 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* 7-day daily spend bars */}
            {isVisible("daily-bars") && (() => {
              const CHART_H = 42;
              const todayStr = new Date().toISOString().slice(0, 10);
              const days = Array.from({ length: 7 }, (_, i) => {
                const d = new Date(); d.setDate(d.getDate() - (6 - i));
                return d.toISOString().slice(0, 10);
              });
              const dayLabels = days.map(d => ["Su","Mo","Tu","We","Th","Fr","Sa"][new Date(d + "T12:00:00").getDay()]);
              const dayAmounts = days.map(d =>
                baseData.filter(t => t.date === d && t.type === "expense")
                  .reduce((s, t) => s + Math.abs(t.gbpValue ?? 0), 0)
              );
              const maxAmt = Math.max(...dayAmounts, 1);
              const nonZero = dayAmounts.filter(v => v > 0);
              const avgAmt = nonZero.length > 0 ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 0;
              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 10px", marginBottom: 10, opacity: hasMockData ? 0.85 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                      Daily spend · last 7 days
                    </div>
                    {avgAmt > 0 && (
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-accent)", letterSpacing: "0.04em" }}>
                        avg £{Math.round(avgAmt)}/d
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 4 }}>
                    {days.map((d, i) => {
                      const amt  = dayAmounts[i];
                      const barH = amt > 0 ? Math.max(4, Math.round((amt / maxAmt) * CHART_H)) : 2;
                      const isTd = d === todayStr;
                      const isAbove = avgAmt > 0 && amt > avgAmt * 1.15;
                      const barColor = isTd ? "var(--ft-accent)" : isAbove ? "var(--ft-amber)" : "var(--ft-accent)";
                      return (
                        <div key={d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: isTd ? "var(--ft-accent)" : isAbove ? "var(--ft-amber)" : "var(--ft-dim)", lineHeight: 1, minHeight: 10, textAlign: "center" }}>
                            {amt > 0 ? Math.round(amt) : ""}
                          </div>
                          <div style={{ height: barH, width: "100%", background: barColor, opacity: isTd ? 1 : 0.55, borderRadius: 2 }} />
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: isTd ? "var(--ft-accent)" : "var(--ft-dim)", fontWeight: isTd ? 700 : 400 }}>
                            {dayLabels[i]}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Running balance chart */}
            {isVisible("running-balance") && (() => {
              const INITIAL_BALANCE = 5000;
              const daysList = Array.from({ length: 7 }, (_, i) => daysAgo(6 - i));
              const sortedAll = [...baseData].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

              let runBal = INITIAL_BALANCE;
              const balByDay: Record<string, number> = {};
              for (const d of daysList) {
                const dayTxns = sortedAll.filter(t => t.date === d);
                for (const t of dayTxns) runBal += t.gbpValue ?? 0;
                balByDay[d] = runBal;
              }
              const balVals = daysList.map(d => balByDay[d] ?? INITIAL_BALANCE);
              const minBal = Math.min(...balVals, INITIAL_BALANCE) * 0.95;
              const maxBal = Math.max(...balVals, INITIAL_BALANCE) * 1.02;
              const currentBal = balVals[balVals.length - 1];
              const totalChange = currentBal - INITIAL_BALANCE;
              const isPos = totalChange >= 0;
              const lineColor = isPos ? "var(--ft-green)" : "var(--ft-red)";

              const W = 320, H = 60, PX = 4, PY = 6;
              const xOf = (i: number) => PX + (i / (daysList.length - 1)) * (W - 2 * PX);
              const yOf = (v: number) => maxBal > minBal
                ? PY + (1 - (v - minBal) / (maxBal - minBal)) * (H - 2 * PY)
                : H / 2;
              const pts = balVals.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`);
              const pathD = `M ${pts.join(" L ")}`;
              const areaD = `M ${xOf(0).toFixed(1)},${H} L ${pts.join(" L ")} L ${xOf(daysList.length - 1).toFixed(1)},${H} Z`;

              const incomeDayIdx = daysList.reduce((best, d, i) => {
                const inc = baseData.filter(t => t.date === d && t.type === "income").reduce((s, t) => s + (t.gbpValue ?? 0), 0);
                return inc > best.inc ? { i, inc } : best;
              }, { i: -1, inc: 0 });

              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 10px", marginBottom: 10, opacity: hasMockData ? 0.85 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                      Running Balance · 7D
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: lineColor }}>
                      {isPos ? "+" : ""}{formatGbp(totalChange)} net
                    </div>
                  </div>
                  <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
                    <defs>
                      <linearGradient id="rb-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
                        <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
                      </linearGradient>
                    </defs>
                    <path d={areaD} fill="url(#rb-fill)" />
                    <path d={pathD} fill="none" stroke={lineColor} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
                    {incomeDayIdx.i >= 0 && incomeDayIdx.inc > 0 && (
                      <>
                        <line x1={xOf(incomeDayIdx.i)} y1={0} x2={xOf(incomeDayIdx.i)} y2={H} stroke="var(--ft-green)" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.45" />
                        <circle cx={xOf(incomeDayIdx.i)} cy={yOf(balVals[incomeDayIdx.i])} r={4} fill="none" stroke="var(--ft-green)" strokeWidth="1.5" />
                      </>
                    )}
                    <circle cx={xOf(daysList.length - 1)} cy={yOf(currentBal)} r={3} fill={lineColor} />
                  </svg>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>
                      {new Date(daysList[0] + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: lineColor }}>
                      {formatGbp(currentBal)}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>Today</span>
                  </div>
                </div>
              );
            })()}

            {/* Top expenses ranking */}
            {isVisible("top-expenses") && (() => {
              const expenses = baseData.filter(t => t.type === "expense");
              if (expenses.length < 2) return null;
              const totalSpend = expenses.reduce((s, t) => s + Math.abs(t.gbpValue ?? 0), 0);
              const top5 = [...expenses]
                .sort((a, b) => Math.abs(b.gbpValue ?? 0) - Math.abs(a.gbpValue ?? 0))
                .slice(0, 5);
              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden", marginBottom: 10, opacity: hasMockData ? 0.85 : 1 }}>
                  <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-raised)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Top Expenses</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>{formatGbp(totalSpend)} total</span>
                  </div>
                  {top5.map((tx, i) => {
                    const amt    = Math.abs(tx.gbpValue ?? 0);
                    const pct    = totalSpend > 0 ? (amt / totalSpend) * 100 : 0;
                    const isLast = i === top5.length - 1 || i === expenses.length - 1;
                    const catColor = CAT_COLORS[(tx.category ?? "").toLowerCase()] ?? "#64748B";
                    return (
                      <div key={tx.id ?? i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", width: 10 }}>{i + 1}</span>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: catColor, flexShrink: 0 }} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {tx.description ?? tx.category ?? "—"}
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-red)", flexShrink: 0 }}>{formatGbp(amt)}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", flexShrink: 0, width: 28, textAlign: "right" }}>{pct.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Merchant loyalty — repeat visit tracker */}
            {isVisible("merchant-loyalty") && (() => {
              const expenses = baseData.filter(t => t.type === "expense");
              if (expenses.length < 3) return null;
              const merchantMap: Record<string, { visits: number; total: number }> = {};
              for (const t of expenses) {
                const name = (t.description ?? t.category ?? "Unknown").trim();
                if (!merchantMap[name]) merchantMap[name] = { visits: 0, total: 0 };
                merchantMap[name].visits++;
                merchantMap[name].total += Math.abs(t.gbpValue ?? 0);
              }
              const repeats = Object.entries(merchantMap)
                .filter(([, v]) => v.visits >= 2)
                .sort((a, b) => b[1].visits - a[1].visits || b[1].total - a[1].total)
                .slice(0, 5);
              if (repeats.length === 0) return null;
              const maxVisits = repeats[0][1].visits;
              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden", marginBottom: 10, opacity: hasMockData ? 0.85 : 1 }}>
                  <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Repeat Merchants</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>{repeats.length} habituals</span>
                  </div>
                  {repeats.map(([name, data], i) => {
                    const visitPct = (data.visits / maxVisits) * 100;
                    const avgTxn = data.total / data.visits;
                    const isLast = i === repeats.length - 1;
                    const color = ["var(--ft-accent)", "#60a5fa", "#4ade80", "#fb923c", "#38bdf8"][i % 5];
                    return (
                      <div key={name} style={{ padding: "7px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <div style={{ width: 5, height: 5, borderRadius: 2.5, background: color, flexShrink: 0 }} />
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color, fontWeight: 700 }}>×{data.visits}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-text)", fontWeight: 700 }}>{formatGbp(data.total)}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ flex: 1, height: 3, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${visitPct}%`, background: color, opacity: 0.75, borderRadius: 2 }} />
                          </div>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", flexShrink: 0 }}>{formatGbp(avgTxn)} avg</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Smart insights strip */}
            {isVisible("smart-insights") && (() => {
              const expenses = baseData.filter(t => t.type === "expense");
              if (expenses.length === 0) return null;
              const biggest = expenses.reduce((m, t) => Math.abs(t.gbpValue ?? 0) > Math.abs(m.gbpValue ?? 0) ? t : m, expenses[0]);
              const totalSpend7 = expenses.filter(t => {
                if (!t.date) return false;
                return new Date(t.date).getTime() >= Date.now() - 7 * 86400000;
              }).reduce((s, t) => s + Math.abs(t.gbpValue ?? 0), 0);
              const dailyAvg = totalSpend7 / 7;
              const subsCount = expenses.filter(t =>
                ["subscriptions", "netflix", "spotify", "amazon prime"].includes((t.category ?? "").toLowerCase())
              ).length;
              const merchantMap: Record<string, number> = {};
              for (const t of expenses) {
                const n = t.description ?? "Unknown";
                merchantMap[n] = (merchantMap[n] ?? 0) + 1;
              }
              const topMerchant = Object.entries(merchantMap).sort((a, b) => b[1] - a[1])[0];
              const insights: { label: string; value: string; color: string }[] = [
                { label: "Biggest", value: `${biggest?.description?.split(" ")[0] ?? "—"} ${formatGbp(Math.abs(biggest?.gbpValue ?? 0))}`, color: "var(--ft-red)" },
                { label: "Avg/day", value: `${formatGbp(dailyAvg)}/d`, color: "var(--ft-accent)" },
                ...(subsCount > 0 ? [{ label: "Subs", value: `${subsCount} cleared`, color: "var(--ft-cyan)" }] : []),
                ...(topMerchant && topMerchant[1] > 1 ? [{ label: "Top merchant", value: `${topMerchant[0].split(" ")[0]} ×${topMerchant[1]}`, color: "var(--ft-dim)" }] : []),
              ].slice(0, 4);
              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "10px 14px", marginBottom: 10, opacity: hasMockData ? 0.85 : 1 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8 }}>
                    Smart insights
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {insights.map(ins => (
                      <div key={ins.label} style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "7px 10px" }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{ins.label}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 700, color: ins.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ins.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Spend intelligence — velocity + anomaly detection */}
            {isVisible("spend-intel") && (() => {
              const expenses = baseData.filter(t => t.type === "expense");
              if (expenses.length < 3) return null;

              // Velocity: recent 4d avg vs prior 3d avg
              const now = Date.now();
              const recent = expenses.filter(t => t.date && now - new Date(t.date).getTime() < 4 * 86400000);
              const prior  = expenses.filter(t => t.date && now - new Date(t.date).getTime() >= 4 * 86400000 && now - new Date(t.date).getTime() < 7 * 86400000);
              const recentDaily = recent.length > 0 ? recent.reduce((s, t) => s + Math.abs(t.gbpValue ?? 0), 0) / 4 : 0;
              const priorDaily  = prior.length  > 0 ? prior.reduce((s, t)  => s + Math.abs(t.gbpValue ?? 0), 0) / 3 : recentDaily;
              const velPct  = priorDaily > 0 ? ((recentDaily - priorDaily) / priorDaily) * 100 : 0;
              const isAccel = velPct > 8;
              const isDecel = velPct < -8;
              const velColor = isDecel ? "var(--ft-green)" : isAccel ? "var(--ft-red)" : "var(--ft-accent)";
              const velLabel = isDecel ? "Decelerating" : isAccel ? "Accelerating" : "Stable";

              // Category averages for anomaly detection
              const catStats: Record<string, { total: number; count: number }> = {};
              for (const t of expenses) {
                const cat = (t.category ?? "other").toLowerCase();
                if (!catStats[cat]) catStats[cat] = { total: 0, count: 0 };
                catStats[cat].total += Math.abs(t.gbpValue ?? 0);
                catStats[cat].count++;
              }
              const anomalies = expenses
                .filter(t => {
                  const cat = (t.category ?? "other").toLowerCase();
                  const s = catStats[cat];
                  if (!s || s.count < 2) return false;
                  return Math.abs(t.gbpValue ?? 0) > (s.total / s.count) * 1.8;
                })
                .slice(0, 2);

              const hasVelocity = recentDaily > 0;
              if (!hasVelocity && anomalies.length === 0) return null;

              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden", marginBottom: 10, opacity: hasMockData ? 0.85 : 1 }}>
                  <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--ft-border)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Spend Intelligence</span>
                  </div>
                  {hasVelocity && (
                    <div style={{ padding: "9px 14px", borderBottom: anomalies.length > 0 ? "1px solid var(--ft-border)" : "none", display: "flex", alignItems: "center", gap: 10 }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                        {isAccel && <polyline points="2,10 7,4 12,4" stroke={velColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
                        {isDecel && <polyline points="2,4 7,10 12,10" stroke={velColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
                        {!isAccel && !isDecel && <line x1="2" y1="7" x2="12" y2="7" stroke={velColor} strokeWidth="1.5" strokeLinecap="round" />}
                      </svg>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: velColor }}>{velLabel} spend</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)", marginTop: 1 }}>
                          {formatGbp(recentDaily)}/d avg (recent) · {Math.abs(velPct) > 1 ? `${Math.abs(velPct).toFixed(0)}% ${isAccel ? "faster" : "slower"} vs prior` : "unchanged"}
                        </div>
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: velColor, fontVariantNumeric: "tabular-nums" }}>
                        {velPct >= 0 ? "+" : ""}{velPct.toFixed(0)}%
                      </div>
                    </div>
                  )}
                  {anomalies.map((t, i) => {
                    const cat  = (t.category ?? "other").toLowerCase();
                    const s    = catStats[cat];
                    const mean = s ? s.total / s.count : 0;
                    const mult = mean > 0 ? (Math.abs(t.gbpValue ?? 0) / mean).toFixed(1) : "—";
                    const col  = CAT_COLORS[cat] ?? "#64748B";
                    const isLast = i === anomalies.length - 1;
                    return (
                      <div key={t.id ?? i} style={{ padding: "8px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)", display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ft-accent)", flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-accent)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {t.description ?? t.category ?? "Transaction"}
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)", marginTop: 1 }}>
                            {mult}× above {cat} avg ({formatGbp(mean)}) · flagged
                          </div>
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: col, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                          −{formatGbp(Math.abs(t.gbpValue ?? 0))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Day-of-week spending pattern */}
            {isVisible("dow-pattern") && (() => {
              const expenses = baseData.filter(t => t.type === "expense" && t.date);
              if (expenses.length < 5) return null;
              const dowTotals = [0, 0, 0, 0, 0, 0, 0]; // Mon=0 … Sun=6
              const dowCounts = [0, 0, 0, 0, 0, 0, 0];
              for (const t of expenses) {
                const d = new Date(t.date!).getDay(); // 0=Sun…6=Sat
                const idx = d === 0 ? 6 : d - 1;     // remap to Mon=0…Sun=6
                dowTotals[idx] += Math.abs(t.gbpValue ?? 0);
                dowCounts[idx]++;
              }
              const avgs = dowTotals.map((tot, i) => dowCounts[i] > 0 ? tot / dowCounts[i] : 0);
              const maxAvg = Math.max(...avgs, 1);
              const totalAvgSpend = avgs.reduce((s, v) => s + v, 0);
              if (totalAvgSpend === 0) return null;
              const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
              const peakIdx = avgs.indexOf(maxAvg);
              const DAY_FULL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "11px 14px 10px", marginBottom: 10, opacity: hasMockData ? 0.85 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                      Intraweek pattern
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-accent)" }}>
                      peak: {DAY_FULL[peakIdx]} −{formatGbp(avgs[peakIdx])}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, alignItems: "flex-end", height: 44 }}>
                    {avgs.map((avg, i) => {
                      const hPct = maxAvg > 0 ? (avg / maxAvg) * 100 : 0;
                      const isPeak = i === peakIdx;
                      const isWeekend = i >= 5;
                      const barColor = isPeak ? "var(--ft-accent)" : isWeekend ? "#60A5FA" : "var(--ft-green)";
                      return (
                        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, height: "100%", justifyContent: "flex-end" }}>
                          <div style={{
                            width: "100%", borderRadius: "1px 1px 0 0",
                            height: `${Math.max(hPct, avg > 0 ? 5 : 0)}%`,
                            background: barColor, opacity: isPeak ? 1 : 0.6,
                          }} />
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginTop: 4 }}>
                    {DAY_LABELS.map((lbl, i) => (
                      <div key={i} style={{
                        textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 8,
                        color: i === peakIdx ? "var(--ft-accent)" : "var(--ft-dim)", fontWeight: i === peakIdx ? 700 : 400,
                      }}>{lbl}</div>
                    ))}
                  </div>
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                    avg daily spend by weekday · blue = weekend
                  </div>
                </div>
              );
            })()}

            {/* Transaction size distribution */}
            {isVisible("size-dist") && (() => {
              const exps = baseData.filter(t => t.type === "expense");
              if (exps.length === 0) return null;
              const BANDS = ([["Micro", 0, 5], ["Small", 5, 50], ["Medium", 50, 200], ["Large", 200, Infinity]] as [string, number, number][]).map(([lbl, lo, hi]) => {
                const items = exps.filter(t => { const a = Math.abs(t.gbpValue ?? 0); return a >= lo && a < hi; });
                return { lbl, count: items.length, total: items.reduce((s, t) => s + Math.abs(t.gbpValue ?? 0), 0) };
              });
              const maxCount = Math.max(...BANDS.map(b => b.count), 1);
              const COLS = ["#60A5FA", "var(--ft-green)", "var(--ft-accent)", "var(--ft-red)"];
              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "11px 14px 10px", marginBottom: 10, opacity: hasMockData ? 0.85 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Size distribution</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-accent)" }}>{exps.length} expense{exps.length !== 1 ? "s" : ""} analysed</span>
                  </div>
                  {BANDS.map(({ lbl, count, total }, i) => (
                    <div key={lbl} style={{ marginBottom: i < 3 ? 7 : 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: count > 0 ? COLS[i] : "var(--ft-dim)" }}>{lbl}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", fontVariantNumeric: "tabular-nums" }}>{count}× · {count > 0 ? formatGbp(total) : "—"}</span>
                      </div>
                      <div style={{ height: 3, background: "var(--ft-raised)", borderRadius: 1.5, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(count / maxCount) * 100}%`, background: COLS[i] }} />
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                    micro &lt;£5 · small £5–50 · medium £50–200 · large &gt;£200
                  </div>
                </div>
              );
            })()}

            {groups.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--ft-dim)", fontSize: 13, paddingTop: 40 }}>
                No transactions match your search.
              </div>
            ) : groups.map(([date, txs]) => (
              <div key={date} style={{ marginBottom: 16, opacity: hasMockData ? 0.85 : 1 }}>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em",
              textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8,
            }}>
              {relLabel(date)}
            </div>
            <div style={{
              background: "var(--ft-surface)", border: "1px solid var(--ft-border)",
              borderRadius: 2, overflow: "hidden",
            }}>
              {txs!.map((tx, i) => {
                const isIncome = tx.type === "income";
                const isLast = i === txs!.length - 1;
                const catColor = CAT_COLORS[(tx.category ?? "").toLowerCase()] ?? (isIncome ? "#10B981" : "#64748B");
                return (
                  <div key={tx.id ?? i} style={{
                    display: "flex", alignItems: "center",
                    borderBottom: isLast ? "none" : "1px solid var(--ft-border)",
                    overflow: "hidden",
                  }}>
                    {/* Left color stripe */}
                    <div style={{ width: 3, alignSelf: "stretch", background: catColor, flexShrink: 0, opacity: 0.7 }} />
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", flex: 1, minWidth: 0 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 2,
                        background: `color-mix(in srgb, ${catColor} 12%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${catColor} 30%, transparent)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12, color: catColor, flexShrink: 0,
                      }}>
                        {(tx.category?.[0] ?? tx.description?.[0] ?? "?").toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 500, color: "var(--ft-text)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {tx.description || tx.category || "Transaction"}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 1 }}>
                          {tx.category && (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: catColor, textTransform: "capitalize", letterSpacing: "0.04em" }}>
                              {tx.category}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{
                          fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700,
                          color: isIncome ? "var(--ft-green)" : "var(--ft-text)",
                        }}>
                          {isIncome ? "+" : "−"}{formatGbp(Math.abs(tx.gbpValue ?? 0))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
            ))}
          </>
        )}
      </div>

    </div>
  );
}
