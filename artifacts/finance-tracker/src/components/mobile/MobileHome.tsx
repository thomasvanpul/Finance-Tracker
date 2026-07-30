import { useState } from "react";
import { Eye, EyeOff, Minus, Plus, BarChart2, Target, Bell } from "lucide-react";
import { usePrivacy } from "@/contexts/privacy-context";
import { useGetDashboard, useListTransactions, useGetTransactionSummary, useListSubscriptions } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { QuickAddTransaction } from "@/components/quick-add-transaction";
import { SparkArea, MiniSparkLine } from "./MobileCharts";
import type { AppScreen } from "./MobileApp";
import { useWidgetVisibility } from "@/hooks/use-widget-visibility";
import { WidgetManagerButton } from "./MobileWidgetManager";

const BALANCE_HISTORY = [14800, 15600, 15300, 16100, 17200, 17700, 18200];

// 30-day cash flow mock: salary on 25th, bills spread across month
function buildCashFlowWeeks(now: Date, monthlyBills: BillPreview[]) {
  const weeks: Array<{ label: string; start: Date; income: number; outgoing: number; events: string[] }> = [];
  for (let w = 0; w < 4; w++) {
    const start = new Date(now);
    start.setDate(now.getDate() + w * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    let income = 0;
    let outgoing = 0;
    const events: string[] = [];
    // Salary on the 25th
    const salaryDate = new Date(start.getFullYear(), start.getMonth(), 25);
    if (salaryDate >= start && salaryDate < end) { income += 3700; events.push("Salary"); }
    // Bills
    for (const bill of monthlyBills) {
      const d = new Date(bill.nextDue + "T12:00:00");
      if (d >= start && d < end) { outgoing += bill.amount; events.push(bill.name); }
    }
    const s = start.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const e = new Date(end.getTime() - 86400000).toLocaleDateString("en-GB", { day: "numeric" });
    weeks.push({ label: `${s}–${e}`, start, income, outgoing, events });
  }
  return weeks;
}

type BillPreview = { id: number | string; name: string; amount: number; nextDue: string };

const MOCK_UPCOMING_SUBS: BillPreview[] = [
  { id: 801, name: "Netflix",      amount: 15.99, nextDue: "2026-08-03" },
  { id: 804, name: "ChatGPT Plus", amount: 16.70, nextDue: "2026-08-07" },
  { id: 802, name: "Spotify",      amount:  9.99, nextDue: "2026-08-10" },
];

function subIconColor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("netflix"))  return "#E50914";
  if (n.includes("spotify"))  return "#1DB954";
  if (n.includes("chatgpt") || n.includes("openai")) return "#10A37F";
  if (n.includes("apple") || n.includes("icloud"))   return "#555555";
  if (n.includes("adobe"))   return "#FF0000";
  if (n.includes("amazon") || n.includes("prime"))   return "#FF9900";
  return "#60A5FA";
}
const MOCK_MACRO = [
  { label: "BoE Rate",  value: "5.25%", sub: "base rate",      color: "var(--ft-accent)" },
  { label: "CPI",       value: "3.2%",  sub: "YoY inflation",  color: "var(--ft-red)"    },
  { label: "SONIA",     value: "5.19%", sub: "overnight",      color: "var(--ft-green)"  },
];

const MOCK_MARKETS = [
  { symbol: "BTC",     name: "Bitcoin",   price: "£43.2k",  change: "+2.4%",  pos: true,  spark: [38000, 39200, 38500, 41000, 42800, 41500, 43210] },
  { symbol: "ETH",     name: "Ethereum",  price: "£2,318",  change: "+1.7%",  pos: true,  spark: [2150, 2180, 2160, 2200, 2270, 2280, 2318] },
  { symbol: "SPX",     name: "S&P 500",   price: "5,847",   change: "+0.8%",  pos: true,  spark: [5720, 5750, 5740, 5780, 5810, 5800, 5847] },
  { symbol: "FTSE",    name: "FTSE 100",  price: "8,234",   change: "-0.3%",  pos: false, spark: [8290, 8280, 8260, 8270, 8250, 8240, 8234] },
  { symbol: "XAU",     name: "Gold",      price: "£1,923",  change: "+0.5%",  pos: true,  spark: [1890, 1895, 1902, 1908, 1912, 1918, 1923] },
  { symbol: "GBP/EUR", name: "GBP/EUR",   price: "1.1782",  change: "-0.1%",  pos: false, spark: [1.182, 1.181, 1.180, 1.179, 1.178, 1.178, 1.1782] },
  { symbol: "WTI",     name: "Oil (WTI)", price: "$72.4",   change: "-1.2%",  pos: false, spark: [74.2, 73.8, 73.1, 72.9, 72.8, 72.6, 72.4] },
];

const MOCK_SECTORS = [
  { code: "TECH", pct: +1.4 },
  { code: "ENRG", pct: -0.8 },
  { code: "FINL", pct: +0.6 },
  { code: "HLTH", pct: +0.3 },
  { code: "COND", pct: -0.4 },
  { code: "INDU", pct: +0.9 },
  { code: "MATL", pct: -1.2 },
  { code: "UTIL", pct: +0.2 },
];
const SECTOR_MAX_ABS = Math.max(...MOCK_SECTORS.map(s => Math.abs(s.pct)));

const YIELD_CURVE = [
  { tenor: "2Y",  uk: 4.85, us: 4.91 },
  { tenor: "5Y",  uk: 4.42, us: 4.47 },
  { tenor: "10Y", uk: 4.31, us: 4.36 },
  { tenor: "30Y", uk: 4.52, us: null  },
];
const YC_SPREAD_2Y10Y = +(YIELD_CURVE[0].uk - YIELD_CURVE[2].uk).toFixed(2);

const BALANCE_HISTORY_PCT = ((BALANCE_HISTORY[BALANCE_HISTORY.length - 1] - BALANCE_HISTORY[0]) / BALANCE_HISTORY[0] * 100).toFixed(1);
const BALANCE_6M_LOW  = Math.min(...BALANCE_HISTORY);
const BALANCE_6M_HIGH = Math.max(...BALANCE_HISTORY);

const MOCK_TXNS = [
  { id: "mt1", description: "Tesco",         category: "Groceries",     type: "expense", gbpValue: 34.20, date: new Date(Date.now() - 0 * 86400000).toISOString().slice(0, 10) },
  { id: "mt2", description: "Spotify",       category: "Subscriptions", type: "expense", gbpValue:  9.99, date: new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10) },
  { id: "mt3", description: "Salary",        category: "Income",        type: "income",  gbpValue: 3200,  date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10) },
  { id: "mt4", description: "Uber",          category: "Transport",     type: "expense", gbpValue: 12.40, date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10) },
  { id: "mt5", description: "Pret a Manger", category: "Food",         type: "expense", gbpValue:  8.60, date: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10) },
];

const CAT_COLORS: Record<string, string> = {
  groceries:     "#10B981",
  supermarket:   "#10B981",
  food:          "var(--ft-amber)",
  dining:        "var(--ft-amber)",
  restaurant:    "var(--ft-amber)",
  transport:     "#3B82F6",
  travel:        "#3B82F6",
  entertainment: "#38BDF8",
  shopping:      "#F97316",
  utilities:     "#6B7280",
  health:        "#EF4444",
  income:        "#10B981",
  salary:        "#10B981",
  freelance:     "#10B981",
  rent:          "#F97316",
  subscriptions: "#60A5FA",
};

function catColor(category: string | null | undefined): string {
  return CAT_COLORS[(category ?? "").toLowerCase()] ?? "#64748B";
}

function relDate(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yest  = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateStr === today) return "Today";
  if (dateStr === yest)  return "Yesterday";
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const HOME_WIDGETS = [
  { id: "insights",      label: "Smart insights" },
  { id: "health-score",  label: "Financial health score" },
  { id: "milestones",    label: "Wealth milestones" },
  { id: "market",        label: "Market snapshot" },
  { id: "macro",         label: "Macro context strip" },
  { id: "macro-impact",  label: "Macro impact · your finances" },
  { id: "yield-curve",   label: "Yield curve" },
  { id: "sector-pulse",  label: "Sector pulse" },
  { id: "events",        label: "Economic events" },
  { id: "cashflow",      label: "30-day cash flow forecast" },
  { id: "upcoming",      label: "Upcoming bills" },
  { id: "month-summary", label: "Month summary" },
  { id: "month-forecast", label: "Month-end forecast" },
];

interface MobileHomeProps {
  onNavigate: (screen: AppScreen) => void;
}

export function MobileHome({ onNavigate }: MobileHomeProps) {
  const { privacy, togglePrivacy } = usePrivacy();
  const [addOpen, setAddOpen] = useState(false);

  const { data: dashboard } = useGetDashboard();

  const now        = new Date();
  const monthStr   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dateFrom   = `${monthStr}-01`;
  const dateTo     = now.toISOString().slice(0, 10);

  const { data: monthSummary } = useGetTransactionSummary({ month: monthStr });
  const { data: txns = [] }    = useListTransactions({ dateFrom, dateTo });

  const rawNetWorth    = dashboard?.netWorth    ?? 0;
  const rawMonthIncome = monthSummary?.totalIncome   ?? 0;
  const rawMonthSpend  = monthSummary?.totalExpenses ?? 0;
  const rawMonthSaved  = monthSummary?.netSavings    ?? 0;

  const hasMockDash  = rawNetWorth === 0 && rawMonthIncome === 0 && rawMonthSpend === 0;
  const netWorth     = hasMockDash ? 18200 : rawNetWorth;
  const monthIncome  = hasMockDash ? 3700  : rawMonthIncome;
  const monthSpend   = hasMockDash ? 1130  : rawMonthSpend;
  const monthSaved   = hasMockDash ? 2570  : rawMonthSaved;
  const maxBar       = Math.max(monthIncome, monthSpend, 1);

  const sortedTxns = [...txns].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 5);
  const hasMockTxns = sortedTxns.length === 0;
  const last5       = hasMockTxns ? MOCK_TXNS : sortedTxns;

  const { data: subsRaw = [] } = useListSubscriptions();
  const activeSubs = subsRaw.filter(s => s.active);
  const hasMockSubs = activeSubs.length === 0;
  const upcomingBills: BillPreview[] = (hasMockSubs
    ? MOCK_UPCOMING_SUBS
    : activeSubs
        .filter((s): s is typeof s & { nextDue: string } => !!s.nextDue)
        .map(s => ({ id: s.id, name: s.name, amount: s.amount, nextDue: s.nextDue }))
  ).sort((a, b) => a.nextDue.localeCompare(b.nextDue)).slice(0, 3);

  const mask  = (v: number) => privacy ? "••••••" : formatGbp(v);
  const { isVisible, toggle, resetAll, visible, hiddenCount } = useWidgetVisibility("home", HOME_WIDGETS);

  const displayInsights = hasMockDash ? [
    { color: "var(--ft-amber)", label: "Shopping", msg: "Budget 99% used this month" },
    { color: "var(--ft-green)", label: "Savings",  msg: `On track to save ${formatGbp(monthSaved)}` },
  ] : [
    ...(monthIncome > 0 && monthSpend / monthIncome > 0.8
      ? [{ color: "var(--ft-red)", label: "Spending", msg: `${((monthSpend / monthIncome) * 100).toFixed(0)}% of income spent this month` }]
      : []),
    ...(monthSaved > 0
      ? [{ color: "var(--ft-green)", label: "Savings", msg: `+${formatGbp(monthSaved)} saved this month` }]
      : []),
  ].slice(0, 2);

  const greeting = () => {
    const h = now.getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="mobile-scroll" style={{ flex: 1, overflowY: "auto", paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 16px)" }}>

      {/* Header */}
      <div style={{ padding: "18px 16px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "clamp(18px, 5.5vw, 22px)", fontWeight: 600, color: "var(--ft-text)", letterSpacing: "-0.01em", lineHeight: 1.2 }}>
            {greeting()}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginTop: 3 }}>
            {now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
          <button
            onClick={togglePrivacy}
            style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", borderRadius: 4, width: 40, height: 40, cursor: "pointer", color: "var(--ft-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {privacy ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button
            onClick={() => onNavigate("upcoming")}
            style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", borderRadius: 4, width: 40, height: 40, cursor: "pointer", color: "var(--ft-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <Bell size={16} />
          </button>
          <WidgetManagerButton widgets={HOME_WIDGETS} visible={visible} onToggle={toggle} onReset={resetAll} hiddenCount={hiddenCount} />
        </div>
      </div>

      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Balance hero */}
        <div style={{
          background: "var(--ft-surface)", border: "1px solid var(--ft-border)",
          borderRadius: 2, padding: "22px 22px 20px",
        }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 10 }}>
            Total Balance
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(26px, 9vw, 38px)", fontWeight: 700, color: "var(--ft-text)", letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 12 }}>
            {mask(netWorth)}
          </div>

          {/* Balance sparkline */}
          <div style={{ marginBottom: 8, borderRadius: 2, overflow: "hidden" }}>
            <SparkArea data={BALANCE_HISTORY} height={42} color="var(--ft-accent)" />
          </div>

          {/* 6-month gain + range */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-green)" }}>
              +{BALANCE_HISTORY_PCT}%
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>6M</span>
            <div style={{ height: 12, width: 1, background: "var(--ft-border)" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-green)" }}>
              +{mask(18200 - 14800)}
            </span>
          </div>
          {/* TODAY P&L */}
          {hasMockDash && !privacy && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>TODAY</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-green)" }}>+£124</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--ft-green)" }}>+0.68%</span>
              <div style={{ height: 10, width: 1, background: "var(--ft-border)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>vs prev. close</span>
            </div>
          )}

          {/* 6M High / Low + Runway */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", color: "var(--ft-dim)", textTransform: "uppercase" }}>6M H</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-green)" }}>{mask(BALANCE_6M_HIGH)}</span>
            </div>
            <div style={{ width: 1, height: 10, background: "var(--ft-border)" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", color: "var(--ft-dim)", textTransform: "uppercase" }}>6M L</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-dim)" }}>{mask(BALANCE_6M_LOW)}</span>
            </div>
            {monthSpend > 0 && !privacy && (
              <>
                <div style={{ width: 1, height: 10, background: "var(--ft-border)" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", color: "var(--ft-dim)", textTransform: "uppercase" }}>Runway</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: netWorth / monthSpend >= 12 ? "var(--ft-green)" : "var(--ft-accent)" }}>
                    {(netWorth / monthSpend).toFixed(1)}mo
                  </span>
                </div>
              </>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {monthSaved !== 0 ? (
              <>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600,
                  color: monthSaved >= 0 ? "var(--ft-green)" : "var(--ft-red)",
                }}>
                  {monthSaved >= 0 ? "+" : ""}{mask(monthSaved)}
                </span>
                <span style={{ fontSize: 12, color: "var(--ft-dim)" }}>this month</span>
              </>
            ) : (
              <span style={{ fontSize: 12, color: "var(--ft-dim)" }}>
                {now.toLocaleString("default", { month: "long" })} · no activity yet
              </span>
            )}
          </div>
        </div>

        {/* Smart insights strip */}
        {isVisible("insights") && displayInsights.length > 0 && (
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
            {displayInsights.map((ins, i) => {
              const isLast = i === displayInsights.length - 1;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
                  <div style={{ width: 5, height: 5, borderRadius: 3, background: ins.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: ins.color, letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>
                    {ins.label}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                    {ins.msg}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Financial Health Score */}
        {isVisible("health-score") && hasMockDash && (() => {
          const savingsRate  = monthIncome > 0 ? (monthSaved / monthIncome) * 100 : 0;
          const emFundMonths = monthSpend > 0 ? netWorth / monthSpend : 0;

          const metrics = [
            {
              label: "Savings rate",
              score: savingsRate >= 30 ? 20 : savingsRate >= 20 ? 16 : savingsRate >= 10 ? 12 : 8,
              color: savingsRate >= 20 ? "var(--ft-green)" : savingsRate >= 10 ? "var(--ft-accent)" : "var(--ft-red)",
            },
            {
              label: "Budget pace",
              score: 20,  // 7% under pace → excellent
              color: "var(--ft-green)",
            },
            {
              label: "Emergency fund",
              score: emFundMonths >= 6 ? 20 : emFundMonths >= 3 ? 16 : emFundMonths >= 1 ? 10 : 4,
              color: emFundMonths >= 6 ? "var(--ft-green)" : emFundMonths >= 3 ? "var(--ft-accent)" : "var(--ft-red)",
            },
            {
              label: "Debt position",
              score: 18,  // net positive
              color: "var(--ft-green)",
            },
            {
              label: "Investments",
              score: 18,  // actively investing
              color: "var(--ft-green)",
            },
          ];
          const totalScore = metrics.reduce((s, m) => s + m.score, 0);
          const grade = totalScore >= 90 ? "Excellent" : totalScore >= 75 ? "Good" : totalScore >= 60 ? "Fair" : "Needs work";
          const scoreColor = totalScore >= 90 ? "var(--ft-green)" : totalScore >= 75 ? "var(--ft-accent)" : "var(--ft-red)";

          return (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "13px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
                {/* Score ring */}
                <div style={{
                  width: 52, height: 52, borderRadius: 2, flexShrink: 0,
                  border: `2px solid ${scoreColor}`,
                  background: `color-mix(in srgb, ${scoreColor} 8%, transparent)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: scoreColor }}>{totalScore}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3 }}>
                    Financial Health
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: scoreColor }}>{grade}</div>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textAlign: "right" }}>
                  <div>{totalScore}/100</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {metrics.map(m => (
                  <div key={m.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", width: 88, flexShrink: 0 }}>{m.label}</div>
                    <div style={{ flex: 1, height: 3, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(m.score / 20) * 100}%`, background: m.color, borderRadius: 2 }} />
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: m.color, width: 16, textAlign: "right" }}>{m.score}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Wealth Milestone Tracker */}
        {isVisible("milestones") && hasMockDash && !privacy && (() => {
          const MONTHLY_RETURN_RATE = 0.05 / 12;
          const monthlyPassive = Math.round(netWorth * MONTHLY_RETURN_RATE);
          const monthlyTotal = monthSaved + monthlyPassive;
          if (monthlyTotal <= 0) return null;

          const MILESTONES = [20000, 25000, 30000, 50000, 75000, 100000];
          const upcoming = MILESTONES.filter(m => m > netWorth).slice(0, 4);
          if (upcoming.length === 0) return null;

          const items = upcoming.map((target, idx) => {
            const monthsNeeded = Math.ceil((target - netWorth) / monthlyTotal);
            const eta = new Date();
            eta.setMonth(eta.getMonth() + monthsNeeded);
            const etaStr = eta.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
            const pct = Math.min(99, (netWorth / target) * 100);
            return { target, monthsNeeded, etaStr, pct, isNext: idx === 0 };
          });

          return (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ padding: "7px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Wealth Milestones</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-green)", fontVariantNumeric: "tabular-nums" }}>
                  +{formatGbp(monthlyTotal)}/mo trajectory
                </span>
              </div>
              {items.map((m, i) => {
                const col = m.isNext ? "var(--ft-accent)" : "var(--ft-dim)";
                const isLast = i === items.length - 1;
                return (
                  <div key={m.target} style={{ padding: "8px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: m.isNext ? 6 : 0 }}>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flexShrink: 0 }}>
                        <rect x="1" y="1" width="1.2" height="9" fill={col} />
                        <path d="M2.2 1.5 L8.5 3.8 L2.2 6.2 Z" fill={col} />
                      </svg>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: m.isNext ? 12 : 10, fontWeight: m.isNext ? 700 : 500, color: m.isNext ? "var(--ft-text)" : "var(--ft-dim)", fontVariantNumeric: "tabular-nums" }}>
                            {formatGbp(m.target)}
                          </span>
                          {m.isNext && (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-accent)", letterSpacing: "0.06em", fontWeight: 700 }}>NEXT</span>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: m.isNext ? 10 : 9, fontWeight: 600, color: col, fontVariantNumeric: "tabular-nums" }}>{m.etaStr}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>{m.monthsNeeded}mo</div>
                      </div>
                    </div>
                    {m.isNext && (
                      <div style={{ height: 3, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${m.pct}%`, background: "var(--ft-accent)", borderRadius: 2 }} />
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ padding: "5px 14px", borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>
                Assumes {formatGbp(monthSaved)}/mo saved · 5% APY on current balance
              </div>
            </div>
          );
        })()}

        {/* Market snapshot */}
        {isVisible("market") && (() => {
          const nowH = new Date().getUTCHours();
          const londonOpen = nowH >= 8 && nowH < 16;
          const nyOpen = nowH >= 14 && nowH < 21;
          const sessionLabel = londonOpen ? "LON OPEN" : nyOpen ? "NY OPEN" : "CLOSED";
          const sessionColor = (londonOpen || nyOpen) ? "var(--ft-green)" : "var(--ft-dim)";
          return (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ padding: "7px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Markets</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: sessionColor, display: "inline-block" }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: sessionColor, letterSpacing: "0.08em" }}>{sessionLabel}</span>
                </span>
              </div>
              <div className="ft-no-scrollbar" style={{ display: "flex", overflowX: "auto", WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"] }}>
                {MOCK_MARKETS.map((mkt, i) => (
                  <div key={mkt.symbol} style={{ padding: "9px 11px 8px", borderLeft: i > 0 ? "1px solid var(--ft-border)" : "none", flexShrink: 0, minWidth: 84 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 5 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.04em" }}>{mkt.symbol}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: mkt.pos ? "var(--ft-green)" : "var(--ft-red)" }}>{mkt.change}</span>
                    </div>
                    <MiniSparkLine data={mkt.spark} width={64} height={20} positive={mkt.pos} />
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 3 }}>{mkt.price}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Macro context strip */}
        {isVisible("macro") && <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", overflow: "hidden" }}>
          {MOCK_MACRO.map((m, i) => (
            <div key={m.label} style={{ padding: "9px 12px", borderLeft: i > 0 ? "1px solid var(--ft-border)" : "none" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3 }}>{m.label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: m.color, letterSpacing: "-0.01em" }}>{m.value}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", marginTop: 2 }}>{m.sub}</div>
            </div>
          ))}
        </div>}

        {/* Macro impact — personalised to user finances */}
        {isVisible("macro-impact") && (() => {
          const impacts = [
            {
              code: "BOE",
              headline: "Rate hold at 5.25%",
              impact: `+${formatGbp(Math.round(netWorth * 0.0525 / 12))} est. monthly interest on savings`,
              dir: "pos" as const,
            },
            {
              code: "CPI",
              headline: "Inflation 3.2% YoY",
              impact: `−${formatGbp(Math.round(netWorth * 0.032 / 12))} purchasing power erosion / month`,
              dir: "neg" as const,
            },
            {
              code: "SPX",
              headline: "S&P 500 +0.8% today",
              impact: "Equity exposure likely higher — check investments",
              dir: "pos" as const,
            },
          ];
          return (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ padding: "7px 14px", borderBottom: "1px solid var(--ft-border)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                  Macro Impact · Your Finances
                </span>
              </div>
              {impacts.map((imp, i) => {
                const col = imp.dir === "pos" ? "var(--ft-green)" : "var(--ft-red)";
                const isLast = i === impacts.length - 1;
                return (
                  <div key={imp.code} style={{ padding: "8px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)", display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--ft-dim)", width: 30, flexShrink: 0, marginTop: 1 }}>{imp.code}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-text)", marginBottom: 2 }}>{imp.headline}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: col }}>{imp.impact}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Yield Curve */}
        {isVisible("yield-curve") && (() => {
          const W = 300, H = 66, PX = 6, PY = 6;
          const ukYields  = YIELD_CURVE.map(p => p.uk);
          const usYields  = YIELD_CURVE.map(p => p.us).filter((v): v is number => v !== null);
          const allVals   = [...ukYields, ...usYields];
          const yMin = Math.min(...allVals) - 0.1;
          const yMax = Math.max(...allVals) + 0.1;
          const n    = YIELD_CURVE.length;
          const xOf  = (i: number) => PX + (i / (n - 1)) * (W - 2 * PX);
          const yOf  = (v: number) => PY + (1 - (v - yMin) / (yMax - yMin)) * (H - 2 * PY);
          const ukPts = YIELD_CURVE.map((p, i) => `${xOf(i).toFixed(1)},${yOf(p.uk).toFixed(1)}`).join(" ");
          const usPts = YIELD_CURVE.filter(p => p.us !== null).map((p, i) => `${xOf(i).toFixed(1)},${yOf(p.us as number).toFixed(1)}`).join(" ");
          const isInverted = YC_SPREAD_2Y10Y < 0;
          const spreadColor = isInverted ? "var(--ft-red)" : "var(--ft-green)";
          return (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "10px 14px 8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                  Yield Curve
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: spreadColor, fontWeight: 700 }}>
                    {isInverted ? "INVERTED" : "NORMAL"} · 2s10s {YC_SPREAD_2Y10Y > 0 ? "+" : ""}{YC_SPREAD_2Y10Y.toFixed(0)}bp
                  </span>
                </div>
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
                {/* US Treasuries (dim) */}
                <polyline points={usPts} fill="none" stroke="var(--ft-dim)" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="3 2" strokeLinejoin="round" />
                {/* UK Gilts */}
                <polyline points={ukPts} fill="none" stroke="var(--ft-accent)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
                {YIELD_CURVE.map((p, i) => (
                  <circle key={p.tenor} cx={xOf(i)} cy={yOf(p.uk)} r={2.5} fill="var(--ft-accent)" />
                ))}
                {/* Tenor labels */}
                {YIELD_CURVE.map((p, i) => (
                  <text key={p.tenor} x={xOf(i)} y={H} textAnchor="middle" fontSize={7} fontFamily="var(--font-mono)" fill="var(--ft-dim)">{p.tenor}</text>
                ))}
                {/* Yield labels on dots */}
                {YIELD_CURVE.map((p, i) => (
                  <text
                    key={`lbl-${p.tenor}`}
                    x={xOf(i)}
                    y={yOf(p.uk) - 5}
                    textAnchor="middle"
                    fontSize={7}
                    fontFamily="var(--font-mono)"
                    fill="var(--ft-accent)"
                    fontWeight="600"
                  >
                    {p.uk.toFixed(2)}
                  </text>
                ))}
              </svg>
              <div style={{ display: "flex", gap: 14, marginTop: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 14, height: 2, background: "var(--ft-accent)", borderRadius: 1 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>UK Gilts</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 14, height: 1, background: "var(--ft-dim)", borderRadius: 1, opacity: 0.5, borderTop: "1px dashed" }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>US Treasuries</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Sector Pulse */}
        {isVisible("sector-pulse") && <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ padding: "7px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Sector Pulse</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>1D · UK/US GICS</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            {MOCK_SECTORS.map((sec, i) => {
              const isLeft    = i % 2 === 0;
              const isLastRow = i >= MOCK_SECTORS.length - 2;
              const barPct    = (Math.abs(sec.pct) / SECTOR_MAX_ABS) * 100;
              const color     = sec.pct >= 0 ? "var(--ft-green)" : "var(--ft-red)";
              return (
                <div key={sec.code} style={{
                  padding: "7px 12px",
                  borderBottom: isLastRow ? "none" : "1px solid var(--ft-border)",
                  borderLeft:   isLeft    ? "none" : "1px solid var(--ft-border)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.06em" }}>{sec.code}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color }}>{sec.pct >= 0 ? "+" : ""}{sec.pct.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 3, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${barPct}%`, background: color, borderRadius: 2 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>}

        {/* Economic Events */}
        {isVisible("events") && (() => {
          const EVENTS = [
            { label: "BoE Rate Decision",    daysFromNow: 2,  impact: 3, consensus: "5.25% hold", prev: "5.25%" },
            { label: "US Non-Farm Payrolls", daysFromNow: 4,  impact: 3, consensus: "182K",       prev: "206K"  },
            { label: "UK Mfg PMI",           daysFromNow: 8,  impact: 2, consensus: "52.1",       prev: "51.8"  },
            { label: "US CPI YoY",           daysFromNow: 10, impact: 3, consensus: "3.0%",       prev: "3.2%"  },
          ];
          return (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ padding: "7px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Economic Events · 10D</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>UK/US</span>
              </div>
              {EVENTS.map((ev, i) => {
                const evDate = new Date(now);
                evDate.setDate(now.getDate() + ev.daysFromNow);
                const dayNum    = evDate.getDate();
                const monthAbbr = evDate.toLocaleDateString("en-GB", { month: "short" });
                const impactColor = ev.impact === 3 ? "var(--ft-red)" : ev.impact === 2 ? "var(--ft-accent)" : "var(--ft-dim)";
                const isLast = i === EVENTS.length - 1;
                return (
                  <div key={ev.label} style={{ padding: "8px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flexShrink: 0, width: 30, textAlign: "center" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)", lineHeight: 1 }}>{dayNum}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", marginTop: 1 }}>{monthAbbr}</div>
                    </div>
                    <div style={{ width: 1, height: 26, background: "var(--ft-border)", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2 }}>{ev.label}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                        exp {ev.consensus} · prev {ev.prev}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      {[1, 2, 3].map(dot => (
                        <div key={dot} style={{
                          width: 5, height: 5, borderRadius: "50%",
                          background: dot <= ev.impact ? impactColor : "var(--ft-raised)",
                        }} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* 30-Day Cash Flow Forecast */}
        {isVisible("cashflow") && (() => {
          const cfBills: BillPreview[] = hasMockSubs ? MOCK_UPCOMING_SUBS : upcomingBills;
          const weeks = buildCashFlowWeeks(now, cfBills);
          const totalNet = weeks.reduce((s, w) => s + w.income - w.outgoing, 0);
          const maxBar = Math.max(...weeks.map(w => Math.max(w.income, w.outgoing)), 1);
          return (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ padding: "9px 14px 7px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                  30-Day Cash Flow
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: totalNet >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                  {totalNet >= 0 ? "+" : ""}{formatGbp(totalNet)} net
                </span>
              </div>
              <div style={{ padding: "8px 0" }}>
                {weeks.map((wk, i) => {
                  const net = wk.income - wk.outgoing;
                  const incomePct = (wk.income / maxBar) * 100;
                  const outPct = (wk.outgoing / maxBar) * 100;
                  const isLast = i === weeks.length - 1;
                  return (
                    <div key={i} style={{ padding: "5px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", width: 76, flexShrink: 0 }}>{wk.label}</div>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                          {wk.income > 0 && (
                            <div style={{ height: 4, width: `${incomePct}%`, background: "var(--ft-green)", borderRadius: 2, opacity: 0.8 }} />
                          )}
                          {wk.outgoing > 0 && (
                            <div style={{ height: 4, width: `${outPct}%`, background: "var(--ft-red)", borderRadius: 2, opacity: 0.7 }} />
                          )}
                          {wk.income === 0 && wk.outgoing === 0 && (
                            <div style={{ height: 4, width: "4%", background: "var(--ft-border)", borderRadius: 2 }} />
                          )}
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: net > 0 ? "var(--ft-green)" : net < 0 ? "var(--ft-red)" : "var(--ft-dim)", width: 54, textAlign: "right", flexShrink: 0 }}>
                          {net !== 0 ? `${net > 0 ? "+" : ""}${formatGbp(net)}` : "—"}
                        </div>
                      </div>
                      {wk.events.length > 0 && (
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", paddingLeft: 84 }}>
                          {wk.events.map(ev => (
                            <span key={ev} style={{
                              fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.04em",
                              padding: "1px 5px", borderRadius: 3,
                              background: ev === "Salary" ? "color-mix(in srgb, var(--ft-green) 12%, transparent)" : "color-mix(in srgb, var(--ft-red) 10%, transparent)",
                              color: ev === "Salary" ? "var(--ft-green)" : "var(--ft-red)",
                            }}>
                              {ev}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ padding: "6px 14px 8px", borderTop: "1px solid var(--ft-border)", display: "flex", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 8, height: 3, background: "var(--ft-green)", borderRadius: 1, opacity: 0.8 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>income</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 8, height: 3, background: "var(--ft-red)", borderRadius: 1, opacity: 0.7 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>outgoings</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Upcoming bills */}
        {isVisible("upcoming") && upcomingBills.length > 0 && (
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ padding: "9px 14px 7px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Upcoming bills</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                {formatGbp(upcomingBills.reduce((s, b) => s + b.amount, 0))} total
              </span>
            </div>
            {upcomingBills.map((bill, i) => {
              const daysLeft = Math.ceil((new Date(bill.nextDue).getTime() - Date.now()) / 86400000);
              const isLast   = i === upcomingBills.length - 1;
              return (
                <div key={bill.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
                  <div style={{ width: 5, height: 5, borderRadius: 3, background: subIconColor(bill.name), flexShrink: 0 }} />
                  <div style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>{bill.name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: daysLeft <= 3 ? "var(--ft-red)" : "var(--ft-dim)", marginRight: 8 }}>
                    {daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `${daysLeft}d`}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-text)" }}>
                    {formatGbp(bill.amount)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Quick actions */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "var(--ft-border)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
          {[
            { label: "Expense", color: "var(--ft-red)",    Icon: Minus,    onTap: () => setAddOpen(true) },
            { label: "Income",  color: "var(--ft-green)",  Icon: Plus,     onTap: () => setAddOpen(true) },
            { label: "Budget",  color: "var(--ft-blue)",   Icon: BarChart2, onTap: () => onNavigate("budget") },
            { label: "Goals",   color: "var(--ft-accent)", Icon: Target,   onTap: () => onNavigate("goals") },
          ].map(item => (
            <button
              key={item.label}
              onClick={item.onTap}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 6, padding: "14px 6px 12px",
                background: "var(--ft-surface)", border: "none",
                borderTop: `2px solid ${item.color}`,
                cursor: "pointer",
              }}
            >
              <div style={{ width: 34, height: 34, background: `color-mix(in srgb, ${item.color} 12%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <item.Icon size={16} strokeWidth={2} style={{ color: item.color }} />
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", fontWeight: 600 }}>
                {item.label}
              </span>
            </button>
          ))}
        </div>

        {/* Month summary */}
        {isVisible("month-summary") && (monthIncome > 0 || monthSpend > 0) && (
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-accent)" }}>
                {now.toLocaleString("default", { month: "long" })}
              </div>
              {monthIncome > 0 && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
                  savings rate: <span style={{ color: monthSaved >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 700 }}>
                    {((monthSaved / monthIncome) * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>

            {[
              { label: "Income", amount: monthIncome, color: "var(--ft-green)" },
              { label: "Spent",  amount: monthSpend,  color: "var(--ft-red)" },
            ].map(row => {
              const pct = maxBar > 0 ? (row.amount / maxBar) * 100 : 0;
              const ofIncome = monthIncome > 0 ? (row.amount / monthIncome) * 100 : 0;
              return (
                <div key={row.label} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                    <span style={{ fontSize: 13, color: "var(--ft-dim)" }}>{row.label}</span>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      {row.label === "Spent" && monthIncome > 0 && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
                          {ofIncome.toFixed(0)}%
                        </span>
                      )}
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: row.color }}>
                        {mask(row.amount)}
                      </span>
                    </div>
                  </div>
                  <div style={{ height: 5, background: "var(--ft-raised)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: row.color, borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}

            <div style={{ paddingTop: 10, borderTop: "1px solid var(--ft-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Saved</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: monthSaved >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                {monthSaved >= 0 ? "+" : ""}{mask(monthSaved)}
              </span>
            </div>
          </div>
        )}

        {/* Month-end forecast */}
        {isVisible("month-forecast") && (monthIncome > 0 || hasMockDash) && (() => {
          const daysInMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
          const dayOfMonth   = now.getDate();
          const daysElapsed  = Math.max(dayOfMonth, 1);
          const daysLeft     = daysInMonth - dayOfMonth;
          const monthPct     = (dayOfMonth / daysInMonth) * 100;
          const dailyRate    = monthSpend / daysElapsed;
          const projSpend    = dailyRate * daysInMonth;
          const projSaved    = monthIncome - projSpend;
          const projSavRate  = monthIncome > 0 ? (projSaved / monthIncome) * 100 : 0;
          const onTrack      = projSavRate >= 20;
          const statusColor  = projSavRate >= 30 ? "var(--ft-green)" : projSavRate >= 10 ? "var(--ft-accent)" : "var(--ft-red)";
          const statusLabel  = projSavRate >= 30 ? "On Track" : projSavRate >= 10 ? "Caution" : "Overspending";
          return (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "13px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                  Month forecast
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 5, height: 5, borderRadius: 3, background: statusColor }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: statusColor }}>{statusLabel}</span>
                </div>
              </div>
              {/* Progress bar */}
              <div style={{ position: "relative", height: 5, background: "var(--ft-raised)", borderRadius: 3, marginBottom: 8 }}>
                <div style={{ height: "100%", width: `${monthPct}%`, background: statusColor, borderRadius: 3, opacity: 0.8 }} />
                <div style={{ position: "absolute", left: `${monthPct}%`, top: "50%", transform: "translate(-50%, -50%)", width: 9, height: 9, borderRadius: "50%", background: statusColor, border: "1.5px solid var(--ft-surface)" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>Day {dayOfMonth}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>{daysLeft}d left</span>
              </div>
              {/* Stats row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "7px 8px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Daily rate</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-text)" }}>−{formatGbp(dailyRate)}</div>
                </div>
                <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "7px 8px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Proj. save</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: statusColor }}>
                    {projSaved >= 0 ? "+" : ""}{formatGbp(projSaved)}
                  </div>
                </div>
                <div style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "7px 8px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Sav. rate</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: statusColor }}>{projSavRate.toFixed(0)}%</div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Recent transactions */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
              Recent
            </span>
            <button
              onClick={() => onNavigate("txns")}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ft-accent)", padding: 0 }}
            >
              View all →
            </button>
          </div>

          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden", opacity: hasMockTxns ? 0.8 : 1 }}>
            {last5.map((tx, i) => {
              const isLast   = i === last5.length - 1;
              const isIncome = tx.type === "income";
              const color    = catColor(tx.category);
              const initial  = (tx.description?.[0] ?? tx.category?.[0] ?? "?").toUpperCase();
              return (
                <div key={tx.id ?? i} style={{ display: "flex", alignItems: "center", borderBottom: isLast ? "none" : "1px solid var(--ft-border)", overflow: "hidden" }}>
                  <div style={{ width: 3, alignSelf: "stretch", background: color, flexShrink: 0, opacity: 0.7 }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", flex: 1, minWidth: 0 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 2, background: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ color, fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12, lineHeight: 1 }}>{initial}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {tx.description || tx.category || "Transaction"}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color, marginTop: 1, textTransform: "capitalize" }}>
                        {tx.category ?? ""}{tx.category && tx.date ? " · " : ""}{tx.date ? relDate(tx.date) : ""}
                      </div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: isIncome ? "var(--ft-green)" : "var(--ft-text)", flexShrink: 0 }}>
                      {isIncome ? "+" : "−"}{formatGbp(Math.abs(tx.gbpValue ?? 0))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      <QuickAddTransaction open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
