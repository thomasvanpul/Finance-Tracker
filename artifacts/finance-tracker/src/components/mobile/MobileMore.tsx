import { ChevronRight, TrendingUp, Target, Brain, BarChart2, FileText, RefreshCw, Home as HomeIcon, CreditCard, Flame, Calculator, Landmark, Repeat, Tag, BookOpen, Calendar, Users, Globe, Briefcase, Sliders, ExternalLink, PieChart, Bell, DollarSign } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MobileTab } from "./MobileNav";
import type { AppScreen } from "./MobileApp";
import { useGetDashboard, useListSubscriptions, useListGoals } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { MiniSparkLine } from "./MobileCharts";
import { useWidgetVisibility } from "@/hooks/use-widget-visibility";
import { WidgetManagerButton } from "./MobileWidgetManager";

const BALANCE_HISTORY = [14800, 15600, 15300, 16100, 17200, 17700, 18200];

const MOCK_MONTHLY_PERF = [
  { income: 3700, spend: 1450, rate: 60.8 },
  { income: 3700, spend: 1280, rate: 65.4 },
  { income: 4200, spend: 1890, rate: 55.0 },
  { income: 3700, spend: 830,  rate: 77.6 }, // current month (partial)
];

const MOCK_OWING_TOTAL = 250;
const MOCK_UPCOMING_COUNT = 3;
const MOCK_GOALS = [
  { id: "mg1", current: 7500,  target: 10000 },
  { id: "mg2", current: 1200,  target: 2500 },
  { id: "mg3", current: 890,   target: 3000 },
];

interface MoreItem {
  key: string;
  href?: string;
  inApp?: AppScreen;
  label: string;
  desc: string;
  Icon: LucideIcon;
  badge?: string;
  badgeColor?: string;
}

interface MoreSection {
  label: string;
  color: string;
  badge?: string;
  items: MoreItem[];
}

interface MobileMoreProps {
  onPersonalize: () => void;
  onNavigate: (screen: AppScreen) => void;
}

function QuickActionBtn({ label, color, onClick, children }: { label: string; color: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 7,
        background: `color-mix(in srgb, ${color} 11%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 24%, transparent)`,
        borderRadius: 3,
        padding: "12px 6px 10px",
        cursor: "pointer",
      }}
    >
      <div style={{
        width: 36, height: 36,
        background: `color-mix(in srgb, ${color} 18%, transparent)`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {children}
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
        {label}
      </span>
    </button>
  );
}

const MORE_WIDGETS = [
  { id: "pulse",           label: "Financial Pulse" },
  { id: "tempo",           label: "Financial Tempo" },
  { id: "compound-growth", label: "Compound Growth Engine" },
  { id: "tax-snapshot",    label: "Income Tax Snapshot" },
  { id: "fitness",         label: "Financial Fitness Score" },
  { id: "ppi",             label: "Purchasing power erosion" },
  { id: "market-ticker",   label: "Market ticker" },
  { id: "fire",            label: "F.I.R.E. progress" },
];

export function MobileMore({ onPersonalize, onNavigate }: MobileMoreProps) {
  const { data: dash } = useGetDashboard();
  const { data: subs } = useListSubscriptions();
  const { data: goals } = useListGoals();

  const hasMockDash = dash === undefined || (dash?.netWorth ?? 0) === 0;
  const netWorth = hasMockDash ? 18200 : dash!.netWorth;
  const monthIncome = hasMockDash ? 3400 : (dash?.thisMonth?.income ?? 3400);
  const monthSpend = hasMockDash ? 830 : (dash?.thisMonth?.expenses ?? 830);
  const savedThisMonth = monthIncome - monthSpend;
  const savingsRate = monthIncome > 0 ? Math.round((savedThisMonth / monthIncome) * 100) : 0;
  const runway = monthSpend > 0 ? parseFloat((netWorth / monthSpend).toFixed(1)) : 16.1;

  const activeSubs = subs ?? [];
  const monthlySubCost = activeSubs.reduce((s, sub) => {
    const amt = sub.amount ?? 0;
    if (sub.frequency === "weekly") return s + amt * 4.33;
    if (sub.frequency === "quarterly") return s + amt / 3;
    if (sub.frequency === "annual") return s + amt / 12;
    return s + amt;
  }, 0);
  const hasMockSubs = activeSubs.length === 0;
  const displaySubCost = hasMockSubs ? 89.67 : monthlySubCost;
  const displaySubCount = hasMockSubs ? 6 : activeSubs.length;

  const activeGoals = goals ?? [];
  const hasMockGoals = activeGoals.length === 0;
  const goalItems = hasMockGoals ? MOCK_GOALS : activeGoals.map(g => ({ id: g.id, current: g.current ?? 0, target: g.target ?? 1 }));
  const goalCount = goalItems.length;
  const avgGoalPct = goalCount > 0 ? Math.round(goalItems.reduce((s, g) => s + Math.min(100, (g.current / Math.max(g.target, 1)) * 100), 0) / goalCount) : 0;

  const SECTIONS: MoreSection[] = [
    {
      label: "Invest",
      color: "#3B82F6",
      items: [
        { key: "markets",   inApp: "investments",  label: "Markets",     desc: "Stocks, ETFs, crypto",       Icon: TrendingUp },
        { key: "portfolio", href: "/portfolio",     label: "Portfolio",   desc: "Holdings & performance",     Icon: Globe },
        { key: "networth",  inApp: "net-worth",     label: "Net Worth",   desc: formatGbp(netWorth) + " total",          Icon: BarChart2 },
        { key: "tax",       href: "/tax",           label: "Tax",         desc: "Capital gains & ISA",        Icon: FileText },
      ],
    },
    {
      label: "Plan",
      color: "#3B82F6",
      items: [
        { key: "goals",      inApp: "goals",         label: "Goals",       desc: `${goalCount} active · avg ${avgGoalPct}% done`,  Icon: Target },
        { key: "fire",       href: "/fire",           label: "FIRE",        desc: "Retirement calculator",      Icon: Flame },
        { key: "projection", href: "/projection",     label: "Projection",  desc: "Net worth growth model",     Icon: TrendingUp },
        { key: "mortgage",   href: "/mortgage",       label: "Mortgage",    desc: "Loan & repayment",           Icon: HomeIcon },
        { key: "cashflow",   href: "/cashflow",       label: "Cash Flow",   desc: `${runway.toFixed(1)}mo runway`,  Icon: RefreshCw },
      ],
    },
    {
      label: "Insights",
      color: "#10B981",
      items: [
        { key: "aicoach",    href: "/ai-coach",       label: "AI Coach",    desc: "Gemini financial analysis",  Icon: Brain },
        { key: "analytics",  inApp: "analytics",      label: "Analytics",   desc: "Spending breakdowns",        Icon: PieChart },
        { key: "reports",    inApp: "reports",         label: "Reports",     desc: "Income statements",          Icon: FileText },
        { key: "health",     href: "/health-score",   label: "Health",      desc: "Financial health score",     Icon: Target },
        { key: "yearreview", href: "/year-review",    label: "Year Review", desc: "Annual summary",             Icon: Calendar },
      ],
    },
    {
      label: "Manage",
      color: "var(--ft-amber)",
      items: [
        { key: "subs",      inApp: "subscriptions",   label: "Subscriptions", desc: `${displaySubCount} active · ${formatGbp(displaySubCost)}/mo`,  Icon: CreditCard },
        { key: "recurring", href: "/recurring",        label: "Recurring",     desc: "Detected patterns",        Icon: Repeat },
        { key: "accounts",  inApp: "accounts",         label: "Accounts",      desc: "Manage accounts",          Icon: Landmark },
        { key: "owing",     inApp: "owing",            label: "Owing",         desc: `${formatGbp(MOCK_OWING_TOTAL)} outstanding`,  Icon: DollarSign },
        { key: "upcoming",  inApp: "upcoming",         label: "Upcoming",      desc: `${MOCK_UPCOMING_COUNT} bills due soon`,       Icon: Bell },
        { key: "family",    href: "/family",            label: "Family",        desc: "Household overview",       Icon: Users },
        { key: "trading",   href: "/trading",           label: "Trading",       desc: "Trade journal",            Icon: Briefcase },
      ],
    },
    {
      label: "Tools",
      color: "#6B7280",
      items: [
        { key: "import",    href: "/import",           label: "Import",      desc: "CSV import",              Icon: Tag },
        { key: "settings",  inApp: "settings",         label: "Settings",    desc: "Theme & preferences",     Icon: Sliders },
        { key: "whatif",    href: "/whatif",            label: "Calculators", desc: "Scenarios & what-if",     Icon: Calculator },
        { key: "learn",     href: "/learn",             label: "Learn",       desc: "Finance concepts",        Icon: BookOpen },
      ],
    },
  ];

  const savedColor = savedThisMonth >= 0 ? "var(--ft-green)" : "var(--ft-red)";
  const { isVisible, toggle, resetAll, visible, hiddenCount } = useWidgetVisibility("more", MORE_WIDGETS);

  return (
    <div className="mobile-scroll" style={{ flex: 1, overflowY: "auto", paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 16px)" }}>
      {/* Header */}
      <div style={{ padding: "16px 16px 0", display: "flex", alignItems: "center" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-text)" }}>
          More
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <WidgetManagerButton widgets={MORE_WIDGETS} visible={visible} onToggle={toggle} onReset={resetAll} hiddenCount={hiddenCount} />
        </div>
      </div>

      <div style={{ padding: "12px 16px 0", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Quick Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <QuickActionBtn label="Expense" color="#EF4444">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#EF4444" strokeWidth="1.8" strokeLinecap="round">
              <line x1="9" y1="3" x2="9" y2="15" />
              <line x1="3" y1="9" x2="15" y2="9" />
            </svg>
          </QuickActionBtn>
          <QuickActionBtn label="Income" color="#10B981">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#10B981" strokeWidth="1.8" strokeLinecap="round">
              <line x1="9" y1="3" x2="9" y2="15" />
              <line x1="3" y1="9" x2="15" y2="9" />
              <circle cx="9" cy="9" r="6.5" />
            </svg>
          </QuickActionBtn>
          <QuickActionBtn label="Transfer" color="#3B82F6">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#3B82F6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h12M11 3l4 3-4 3M15 12H3M7 9l-4 3 4 3" />
            </svg>
          </QuickActionBtn>
          <QuickActionBtn label="Search" color="#3B82F6">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#3B82F6" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="8" cy="8" r="4.5" />
              <line x1="11.5" y1="11.5" x2="15" y2="15" />
            </svg>
          </QuickActionBtn>
        </div>

        {/* Nav Sections — rendered FIRST so navigation is immediately visible */}
        {SECTIONS.map(section => (
          <div key={section.label}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: section.color, marginBottom: 8, opacity: 0.8 }}>
              {section.label}
            </div>
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", overflow: "hidden" }}>
              {section.items.map((item, i) => {
                const isLast = i === section.items.length - 1;
                const inner = (
                  <>
                    <div style={{ width: 34, height: 34, background: `color-mix(in srgb, ${section.color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${section.color} 22%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <item.Icon size={16} style={{ color: section.color }} strokeWidth={1.8} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ft-text)" }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: "var(--ft-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.desc}</div>
                    </div>
                    {item.badge && (
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: item.badgeColor ?? section.color, background: `color-mix(in srgb, ${item.badgeColor ?? section.color} 12%, transparent)`, borderRadius: 6, padding: "2px 6px", flexShrink: 0, marginRight: 4 }}>
                        {item.badge}
                      </div>
                    )}
                    {item.inApp
                      ? <ChevronRight size={14} style={{ color: "var(--ft-border)", flexShrink: 0 }} />
                      : <ExternalLink size={12} style={{ color: "var(--ft-border)", flexShrink: 0 }} />
                    }
                  </>
                );

                const rowStyle: React.CSSProperties = {
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "12px 14px",
                  textDecoration: "none", cursor: "pointer",
                };

                if (item.inApp) {
                  return (
                    <button key={item.key} onClick={() => onNavigate(item.inApp!)} style={{ ...rowStyle, background: "none", border: "none", borderBottom: isLast ? "none" : "1px solid var(--ft-border)", width: "100%", textAlign: "left" }}>
                      {inner}
                    </button>
                  );
                }

                return (
                  <a key={item.key} href={item.href} style={{ ...rowStyle, borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
                    {inner}
                  </a>
                );
              })}
            </div>
          </div>
        ))}

        {/* Personalize shortcut */}
        <button
          onClick={onPersonalize}
          style={{
            display: "flex", alignItems: "center", gap: 14,
            background: "color-mix(in srgb, var(--ft-accent) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--ft-accent) 30%, transparent)",
            borderRadius: 3, padding: "13px 16px",
            cursor: "pointer", width: "100%", textAlign: "left",
          }}
        >
          <div style={{ width: 34, height: 34, background: "var(--ft-accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Sliders size={16} style={{ color: "var(--ft-base)" }} strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.04em" }}>PERSONALIZE</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", marginTop: 2 }}>Widgets, tabs, theme &amp; quick actions</div>
          </div>
          <ChevronRight size={14} style={{ color: "var(--ft-accent)", flexShrink: 0 }} />
        </button>

        {/* Quick Insights — analytics widgets below fold */}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 0, marginTop: 4 }}>
          Quick Insights
        </div>

        {/* Financial Pulse Card */}
        {isVisible("pulse") && (
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 3, padding: "14px 16px 12px", borderTop: "2px solid var(--ft-accent)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 10 }}>
              Financial Pulse
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(18px, 6.5vw, 24px)", fontWeight: 700, color: "var(--ft-text)", letterSpacing: "-0.01em", lineHeight: 1 }}>
                  {formatGbp(netWorth)}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", marginTop: 3 }}>net worth</div>
              </div>
              <div style={{ width: 100, height: 36 }}>
                <MiniSparkLine data={BALANCE_HISTORY} color="var(--ft-accent)" width={100} height={36} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "SAVED",     value: formatGbp(savedThisMonth), color: savedColor },
                { label: "SAV. RATE", value: `${savingsRate}%`,         color: savingsRate >= 20 ? "var(--ft-green)" : "var(--ft-accent)" },
                { label: "RUNWAY",    value: `${runway.toFixed(1)}mo`,  color: "var(--ft-text)" },
              ].map(m => (
                <div key={m.label} style={{ background: "var(--ft-raised)", padding: "8px 10px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3 }}>{m.label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: m.color }}>{m.value}</div>
                </div>
              ))}
            </div>
            {goalCount > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--ft-border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Goals</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: avgGoalPct >= 80 ? "var(--ft-green)" : "var(--ft-accent)" }}>avg {avgGoalPct}%</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {goalItems.slice(0, 3).map((g) => {
                    const pct = Math.min(100, (g.current / Math.max(g.target, 1)) * 100);
                    const barColor = pct >= 100 ? "var(--ft-green)" : pct >= 60 ? "var(--ft-accent)" : "var(--ft-dim)";
                    return (
                      <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 3, background: "var(--ft-raised)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: barColor }} />
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, color: barColor, width: 28, textAlign: "right", flexShrink: 0 }}>{Math.round(pct)}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Financial Tempo */}
        {isVisible("tempo") && hasMockDash && (() => {
          const hist = MOCK_MONTHLY_PERF;
          const current = hist[hist.length - 1];
          const prior3 = hist.slice(0, -1);
          const avg3Rate = prior3.reduce((s, m) => s + m.rate, 0) / prior3.length;
          const tempoScore = Math.round(((current.rate - avg3Rate) / avg3Rate) * 100);
          const isAbove = tempoScore >= 0;
          const tempoColor = isAbove ? "var(--ft-green)" : "var(--ft-red)";
          const barFill = Math.min(100, Math.abs(tempoScore) * 2);
          return (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 3, padding: "11px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Financial Tempo</div>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>{current.rate.toFixed(1)}% this mo</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: tempoColor }}>{isAbove ? "+" : ""}{tempoScore}% vs 3M avg</div>
                </div>
              </div>
              <div style={{ flex: 1, height: 5, background: "var(--ft-raised)", position: "relative", overflow: "hidden" }}>
                {isAbove
                  ? <div style={{ position: "absolute", left: "50%", width: `${barFill / 2}%`, height: "100%", background: "var(--ft-green)" }} />
                  : <div style={{ position: "absolute", right: "50%", width: `${barFill / 2}%`, height: "100%", background: "var(--ft-red)" }} />
                }
                <div style={{ position: "absolute", left: "50%", top: 0, width: 1, height: "100%", background: "var(--ft-border)", transform: "translateX(-50%)" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-red)" }}>slower</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>3M avg {avg3Rate.toFixed(1)}%</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-green)" }}>faster</span>
              </div>
            </div>
          );
        })()}

        {/* Compound Growth Engine */}
        {isVisible("compound-growth") && hasMockDash && (() => {
          const r = 0.05 / 12;
          const PV = netWorth;
          const PMT = savedThisMonth > 100 ? savedThisMonth : 2570;
          const fv = (n: number) => PV * Math.pow(1 + r, n) + PMT * (Math.pow(1 + r, n) - 1) / r;
          const flat = (n: number) => PV + PMT * n;
          const rows = [
            { label: "5Y", n: 60 }, { label: "10Y", n: 120 }, { label: "20Y", n: 240 },
          ].map(h => ({ label: h.label, compound: Math.round(fv(h.n)), savings: Math.round(flat(h.n)) }));
          const maxVal = Math.max(...rows.map(r => r.compound));
          const interest10yr = rows[1].compound - rows[1].savings;
          return (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ padding: "9px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Compound Growth Engine</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-green)" }}>5% APY</span>
              </div>
              <div style={{ padding: "10px 14px 8px", display: "flex", flexDirection: "column", gap: 9 }}>
                {rows.map(row => {
                  const compoundPct = (row.compound / maxVal) * 100;
                  const savingsPct  = (row.savings  / maxVal) * 100;
                  const isLargest   = row.compound === maxVal;
                  const interestPct = ((row.compound - row.savings) / row.compound) * 100;
                  return (
                    <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-dim)", width: 28, flexShrink: 0 }}>{row.label}</span>
                      <div style={{ flex: 1, position: "relative", height: 12 }}>
                        <div style={{ position: "absolute", left: 0, top: 2, height: 8, width: `${savingsPct}%`, background: "var(--ft-raised)", border: "1px solid var(--ft-border)" }} />
                        <div style={{ position: "absolute", left: 0, top: 2, height: 8, width: `${compoundPct}%`, overflow: "hidden", background: "color-mix(in srgb, var(--ft-accent) 55%, transparent)" }}>
                          <div style={{ position: "absolute", right: 0, top: 0, height: "100%", width: `${interestPct}%`, background: "var(--ft-green)", opacity: 0.85 }} />
                        </div>
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: isLargest ? 11 : 9, fontWeight: 700, color: isLargest ? "var(--ft-text)" : "var(--ft-dim)", width: 52, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                        {row.compound >= 1000000 ? `£${(row.compound / 1000000).toFixed(2)}M` : formatGbp(row.compound)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ padding: "6px 14px 8px", borderTop: "1px solid var(--ft-border)", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 8, height: 4, background: "color-mix(in srgb, var(--ft-accent) 55%, transparent)", border: "1px solid var(--ft-border)" }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>contrib</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 8, height: 4, background: "var(--ft-green)", opacity: 0.85 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>interest</span>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-green)", marginLeft: "auto" }}>
                  +{interest10yr >= 1000000 ? `£${(interest10yr / 1000000).toFixed(2)}M` : formatGbp(interest10yr)} interest bonus @ 10yr
                </span>
              </div>
            </div>
          );
        })()}

        {/* Income Tax Snapshot */}
        {isVisible("tax-snapshot") && hasMockDash && (() => {
          const annualGross = monthIncome * 12;
          const ALLOWANCE = 12570, BASIC_CAP = 50270;
          const taxable   = Math.max(0, annualGross - ALLOWANCE);
          const incomeTax = taxable <= (BASIC_CAP - ALLOWANCE)
            ? taxable * 0.20
            : (BASIC_CAP - ALLOWANCE) * 0.20 + Math.max(0, taxable - (BASIC_CAP - ALLOWANCE)) * 0.40;
          const ni        = Math.max(0, annualGross - ALLOWANCE) * 0.08;
          const totalTax  = incomeTax + ni;
          const takeHome  = annualGross - totalTax;
          const effectiveRate = annualGross > 0 ? (totalTax / annualGross) * 100 : 0;
          const taxBand   = annualGross <= ALLOWANCE ? "Non-taxpayer" : annualGross <= BASIC_CAP ? "Basic rate" : "Higher rate";
          const moGross   = monthIncome, moTax = incomeTax / 12, moNI = ni / 12, moTakeHome = takeHome / 12;
          return (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ padding: "9px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Income Tax Snapshot</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>2025/26 · {taxBand}</span>
              </div>
              <div style={{ padding: "10px 14px 8px" }}>
                <div style={{ display: "flex", height: 18, overflow: "hidden", marginBottom: 7 }}>
                  <div style={{ width: `${(moTax / moGross) * 100}%`, background: "var(--ft-red)", opacity: 0.75 }} />
                  <div style={{ width: `${(moNI / moGross) * 100}%`, background: "#F97316", opacity: 0.75 }} />
                  <div style={{ flex: 1, background: "var(--ft-green)", opacity: 0.6 }} />
                </div>
                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  {[{ color: "var(--ft-red)", label: "Income tax" }, { color: "#F97316", label: "NI" }, { color: "var(--ft-green)", label: "Take-home" }].map(s => (
                    <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <div style={{ width: 7, height: 7, background: s.color, flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderTop: "1px solid var(--ft-border)" }}>
                {[
                  { label: "Gross/mo",  value: formatGbp(moGross),                   color: "var(--ft-text)"  },
                  { label: "Tax + NI",  value: `−${formatGbp(moTax + moNI)}`,        color: "var(--ft-red)"   },
                  { label: "Take-home", value: formatGbp(moTakeHome),                 color: "var(--ft-green)" },
                ].map((s, i) => (
                  <div key={s.label} style={{ padding: "8px 10px", borderLeft: i > 0 ? "1px solid var(--ft-border)" : "none" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{s.label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: "5px 14px 6px", borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>
                effective rate {effectiveRate.toFixed(1)}% · income tax {(moTax / moGross * 100).toFixed(1)}% · NI {(moNI / moGross * 100).toFixed(1)}% · est. only
              </div>
            </div>
          );
        })()}

        {/* Financial Fitness Score */}
        {isVisible("fitness") && hasMockDash && (() => {
          const dims = [
            { label: "Emergency fund", sub: "4.2mo covered",  score: Math.min(4.2 / 6 * 20, 20),     color: "#10B981" },
            { label: "Savings rate",   sub: "61%",            score: Math.min(0.608 / 0.3 * 20, 20), color: "var(--ft-accent)" },
            { label: "Debt ratio",     sub: "12% of assets",  score: Math.max(20 - 12, 0),            color: "#3B82F6" },
            { label: "Diversification",sub: "3 asset classes",score: Math.min(3 / 4 * 20, 20),        color: "#38BDF8" },
            { label: "Budget adherence",sub: "88% months",    score: Math.min(0.88 / 0.85 * 20, 20), color: "var(--ft-amber)" },
          ];
          const totalScore = dims.reduce((s, d) => s + d.score, 0);
          const grade = totalScore >= 85 ? "A" : totalScore >= 70 ? "B" : totalScore >= 55 ? "C" : "D";
          const gradeColor = totalScore >= 85 ? "var(--ft-green)" : totalScore >= 70 ? "var(--ft-accent)" : totalScore >= 55 ? "var(--ft-amber)" : "var(--ft-red)";
          return (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ padding: "11px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Financial Fitness</span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: gradeColor, lineHeight: 1 }}>{totalScore.toFixed(0)}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>/100</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: gradeColor, marginLeft: 4 }}>{grade}</span>
                </div>
              </div>
              <div style={{ padding: "0 14px" }}>
                <div style={{ height: 3, background: "var(--ft-raised)", margin: "10px 0 12px" }}>
                  <div style={{ height: "100%", width: `${totalScore}%`, background: gradeColor }} />
                </div>
              </div>
              <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
                {dims.map(d => {
                  const pct = (d.score / 20) * 100;
                  return (
                    <div key={d.label}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <div style={{ width: 5, height: 5, background: d.color, flexShrink: 0 }} />
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-text)" }}>{d.label}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>{d.sub}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: d.color }}>{d.score.toFixed(0)}/20</span>
                        </div>
                      </div>
                      <div style={{ height: 3, background: "var(--ft-raised)" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: d.color, opacity: 0.85 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ padding: "8px 14px", borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                composite across emergency fund · savings · debt · diversification · budget adherence
              </div>
            </div>
          );
        })()}

        {/* Purchasing Power Erosion */}
        {isVisible("ppi") && hasMockDash && (() => {
          const CPI_RATE = 0.032;
          const annualLoss  = Math.round(netWorth * CPI_RATE);
          const monthlyLoss = Math.round(annualLoss / 12);
          const realAt = [1, 3, 5].map(yr => ({ yr, real: Math.round(netWorth * Math.pow(1 - CPI_RATE, yr)), loss: Math.round(netWorth * (1 - Math.pow(1 - CPI_RATE, yr))) }));
          const W = 300, H = 34, PX = 4, PY = 4, yrs = 10;
          const vals = Array.from({ length: yrs + 1 }, (_, y) => netWorth * Math.pow(1 - CPI_RATE, y));
          const yMin = vals[yrs], yMax = vals[0];
          const xOf = (y: number) => PX + (y / yrs) * (W - 2 * PX);
          const yOf = (v: number) => PY + (1 - (v - yMin) / Math.max(yMax - yMin, 1)) * (H - 2 * PY);
          const pts = vals.map((v, y) => `${xOf(y)},${yOf(v)}`).join(" ");
          const area = `${pts} ${xOf(yrs)},${H} ${xOf(0)},${H}`;
          return (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ padding: "9px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Purchasing Power</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-red)" }}>CPI {(CPI_RATE * 100).toFixed(1)}%</span>
              </div>
              <div style={{ padding: "10px 14px 8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Annual real loss</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--ft-red)", fontVariantNumeric: "tabular-nums" }}>−{formatGbp(annualLoss)}</div>
                  </div>
                  <div style={{ width: 1, height: 28, background: "var(--ft-border)" }} />
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Per month</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-red)", fontVariantNumeric: "tabular-nums" }}>−{formatGbp(monthlyLoss)}</div>
                  </div>
                </div>
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
                  <defs>
                    <linearGradient id="ppi-g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--ft-red)" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="var(--ft-red)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polygon points={area} fill="url(#ppi-g)" />
                  <polyline points={pts} fill="none" stroke="var(--ft-red)" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, marginBottom: 8 }}>
                  {["today", "+5Y", "+10Y"].map((l, i) => (
                    <span key={l} style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textAlign: i === 1 ? "center" : i === 2 ? "right" : "left", flex: 1 }}>{l}</span>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {realAt.map(r => (
                    <div key={r.yr} style={{ background: "var(--ft-raised)", padding: "7px 8px" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", marginBottom: 3 }}>{r.yr}Y real</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-text)", fontVariantNumeric: "tabular-nums" }}>{formatGbp(r.real)}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-red)", marginTop: 1 }}>−{formatGbp(r.loss)}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding: "5px 14px 7px", borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>
                real value of {formatGbp(netWorth)} at {(CPI_RATE * 100).toFixed(1)}% CPI · invest to outpace inflation
              </div>
            </div>
          );
        })()}

        {/* Market Ticker */}
        {isVisible("market-ticker") && (() => {
          const TICKERS = [
            { sym: "FTSE 100", val: 8247.3,  chg: +0.42, fmt: (v: number) => v.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) },
            { sym: "S&P 500",  val: 5643.7,  chg: +0.18, fmt: (v: number) => v.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) },
            { sym: "GBP/USD",  val: 1.2734,  chg: -0.11, fmt: (v: number) => v.toFixed(4) },
            { sym: "BTC/USD",  val: 67420,   chg: +2.31, fmt: (v: number) => "$" + v.toLocaleString("en-US") },
            { sym: "BOE RATE", val: 4.75,    chg: 0,     fmt: (v: number) => v.toFixed(2) + "%" },
          ];
          return (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ padding: "9px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Markets</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>indicative · mock data</span>
              </div>
              {TICKERS.map((t, i) => {
                const isLast = i === TICKERS.length - 1;
                const chgColor = t.chg > 0 ? "var(--ft-green)" : t.chg < 0 ? "var(--ft-red)" : "var(--ft-dim)";
                const chgLabel = t.chg === 0 ? "—" : `${t.chg > 0 ? "+" : ""}${t.chg.toFixed(2)}%`;
                return (
                  <div key={t.sym} style={{ padding: "7px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", width: 68, flexShrink: 0 }}>{t.sym}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-text)", flex: 1, fontVariantNumeric: "tabular-nums" }}>{t.fmt(t.val)}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: chgColor, fontVariantNumeric: "tabular-nums", minWidth: 52, textAlign: "right" }}>{chgLabel}</span>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* F.I.R.E. Progress */}
        {isVisible("fire") && hasMockDash && (() => {
          const MONTHLY_EXP = 1540;
          const MONTHLY_SAV = Math.round(monthIncome - MONTHLY_EXP);
          const FIRE_NUM = Math.round(MONTHLY_EXP * 12 * 25);
          const prog = Math.min(100, (netWorth / FIRE_NUM) * 100);
          const r = 0.05 / 12;
          const months = Math.log((r * FIRE_NUM + MONTHLY_SAV) / (r * netWorth + MONTHLY_SAV)) / Math.log(1 + r);
          const yrs = Math.round(months / 12);
          return (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 3, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>F.I.R.E. Progress</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-accent)" }}>{yrs}yr to independence</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 7 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--ft-green)", fontVariantNumeric: "tabular-nums" }}>{prog.toFixed(1)}%</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>of {formatGbp(FIRE_NUM)}</span>
              </div>
              <div style={{ height: 5, background: "var(--ft-raised)", overflow: "hidden", marginBottom: 8 }}>
                <div style={{ height: "100%", width: `${prog}%`, background: "var(--ft-green)", opacity: 0.8 }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
                {[
                  { label: "Saved",        val: formatGbp(netWorth),    col: "var(--ft-text)"   },
                  { label: "Monthly save", val: formatGbp(MONTHLY_SAV), col: "var(--ft-green)"  },
                  { label: "FIRE target",  val: formatGbp(FIRE_NUM),    col: "var(--ft-accent)" },
                ].map(item => (
                  <div key={item.label} style={{ background: "var(--ft-raised)", padding: "5px 7px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 700, color: item.col, fontVariantNumeric: "tabular-nums" }}>{item.val}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 7, fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>
                25× annual spend · 5% real return · saving {formatGbp(MONTHLY_SAV)}/mo · mock
              </div>
            </div>
          );
        })()}

        {/* Bottom version stamp */}
        <div style={{ textAlign: "center", paddingTop: 8, paddingBottom: 4 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--ft-dim)", opacity: 0.5 }}>
            FINTRACK · v2.0 · PREVIEW
          </div>
        </div>
      </div>
    </div>
  );
}
