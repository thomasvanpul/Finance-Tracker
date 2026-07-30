import React, { useState, useMemo, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useGetDashboard, useListTransactions, useListAccounts,
  useListBudgets, useListGoals, useGetInvestmentSummary,
  useListInvestments, useListSubscriptions,
} from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { FileText, RefreshCw, Loader2, AlertTriangle, TrendingUp, TrendingDown, Shield, Zap } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BriefingData {
  generatedAt: string;
  month: string;
  executiveSummary: string;
  situationRating: "strong" | "healthy" | "cautious" | "critical";
  keyFindings: string[];
  spendingNarrative: string;
  budgetNarrative: string;
  portfolioNarrative: string;
  recommendations: { priority: "high" | "medium" | "low"; action: string; impact: string }[];
  risks: { level: "red" | "amber" | "green"; description: string }[];
}

type Tx = { date: string; type: string; category: string; gbpValue: number };
type Budget = { category: string; monthlyLimit: number };
type Goal = { name: string; target: number; current: number; deadline?: string };
type Investment = { ticker: string; name?: string; gbpValue: number; quantity?: number; currency?: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const LS_KEY = "ft-briefing-cache";

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${months[parseInt(m, 10) - 1].toUpperCase()} ${y}`;
}

function nowYm(): string {
  return new Date().toISOString().slice(0, 7);
}

function loadCached(): BriefingData | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BriefingData;
    return parsed.month === nowYm() ? parsed : null;
  } catch { return null; }
}

function saveCache(data: BriefingData) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* noop */ }
}

// ─── Context builder ──────────────────────────────────────────────────────────

function buildBriefingContext(
  accounts: Array<{ name: string; currency: string; gbpEquivalent: number }> | undefined,
  dashboard: { netWorth?: number; thisMonth?: { income?: number; expenses?: number; savingsRate?: number } } | undefined,
  budgets: Budget[] | undefined,
  thisTxs: Tx[],
  lastTxs: Tx[],
  investmentSummary: { totalValueGbp: number } | undefined,
  investments: Investment[] | undefined,
  goals: Goal[] | undefined,
  subscriptions: Array<{ name: string; amount: number; frequency: string; active: boolean }> | undefined,
): string {
  const ym = nowYm();
  const parts: string[] = [
    `FINANCIAL BRIEFING CONTEXT — ${monthLabel(ym)}`,
    `Today: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`,
  ];

  if (dashboard?.netWorth != null) parts.push(`Net worth: ${formatGbp(dashboard.netWorth)}`);

  if (accounts?.length) {
    parts.push(`Accounts (${accounts.length}): ${accounts.map(a => `${a.name} ${formatGbp(a.gbpEquivalent)} ${a.currency}`).join("; ")}`);
  }

  if (dashboard?.thisMonth) {
    const { income, expenses, savingsRate } = dashboard.thisMonth;
    if (income != null) parts.push(`This month income: ${formatGbp(income)}`);
    if (expenses != null) parts.push(`This month expenses: ${formatGbp(expenses)}`);
    if (income != null && expenses != null) parts.push(`Monthly P&L: ${formatGbp(income - expenses)}`);
    if (savingsRate != null) parts.push(`Savings rate: ${(savingsRate * 100).toFixed(1)}%`);
  }

  const thisMap = new Map<string, number>();
  for (const tx of thisTxs) thisMap.set(tx.category, (thisMap.get(tx.category) ?? 0) + tx.gbpValue);
  const lastMap = new Map<string, number>();
  for (const tx of lastTxs) lastMap.set(tx.category, (lastMap.get(tx.category) ?? 0) + tx.gbpValue);

  const sortedCats = [...thisMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (sortedCats.length) {
    const catLines = sortedCats.map(([cat, amt]) => {
      const prev = lastMap.get(cat);
      if (prev && prev > 0) {
        const pct = Math.round(((amt - prev) / prev) * 100);
        return `${cat}: ${formatGbp(amt)} (${pct >= 0 ? "+" : ""}${pct}% vs last month)`;
      }
      return `${cat}: ${formatGbp(amt)}`;
    });
    parts.push(`Top spending categories:\n${catLines.join("\n")}`);
  }

  if (budgets?.length && thisMap.size) {
    const perf = budgets.map(b => {
      const spent = thisMap.get(b.category) ?? 0;
      const pct = b.monthlyLimit > 0 ? Math.round((spent / b.monthlyLimit) * 100) : 0;
      return `${b.category}: ${formatGbp(spent)}/${formatGbp(b.monthlyLimit)} (${pct}%)`;
    });
    parts.push(`Budget performance:\n${perf.join("\n")}`);
  }

  if (goals?.length) {
    const goalLines = goals.map(g => {
      const pct = g.target > 0 ? Math.round((g.current / g.target) * 100) : 0;
      const days = g.deadline ? Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86400000) : null;
      return `${g.name}: ${formatGbp(g.current)}/${formatGbp(g.target)} (${pct}%)${days != null ? ` — ${days} days left` : ""}`;
    });
    parts.push(`Goals:\n${goalLines.join("\n")}`);
  }

  if (investmentSummary) parts.push(`Portfolio total: ${formatGbp(investmentSummary.totalValueGbp)}`);
  if (investments?.length) {
    const top = investments.slice(0, 5);
    parts.push(`Top holdings: ${top.map(i => `${i.ticker} ${formatGbp(i.gbpValue)}`).join(", ")}`);
  }

  if (subscriptions?.length) {
    const active = subscriptions.filter(s => s.active);
    const monthlyTotal = active.reduce((s, sub) => {
      const monthly = sub.frequency === "monthly" ? sub.amount
        : sub.frequency === "annual" ? sub.amount / 12
        : sub.frequency === "weekly" ? sub.amount * 4.33 : sub.amount;
      return s + monthly;
    }, 0);
    parts.push(`Active subscriptions: ${active.length} totalling ~${formatGbp(monthlyTotal)}/month`);
  }

  return parts.join("\n");
}

// ─── AI call ──────────────────────────────────────────────────────────────────

const SCHEMA_INSTRUCTION = `
Respond with ONLY valid JSON in this exact structure (no markdown, no prose outside JSON):
{
  "executiveSummary": "2-3 sentence overview",
  "situationRating": "strong|healthy|cautious|critical",
  "keyFindings": ["finding1", "finding2", "finding3"],
  "spendingNarrative": "2-3 sentences on spending patterns",
  "budgetNarrative": "1-2 sentences on budget adherence",
  "portfolioNarrative": "1-2 sentences on investments (write 'No investment data.' if none)",
  "recommendations": [
    {"priority": "high|medium|low", "action": "specific action", "impact": "expected result"},
    {"priority": "high|medium|low", "action": "specific action", "impact": "expected result"},
    {"priority": "high|medium|low", "action": "specific action", "impact": "expected result"}
  ],
  "risks": [
    {"level": "red|amber|green", "description": "risk description"},
    {"level": "red|amber|green", "description": "risk description"}
  ]
}
Be direct. Use exact GBP figures from the data. British English. No generic advice.`;

async function generateBriefing(context: string): Promise<BriefingData> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      messages: [{ role: "user", text: `Generate my monthly financial intelligence briefing for ${monthLabel(nowYm())}.${SCHEMA_INSTRUCTION}` }],
      context,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "AI generation failed");
  }
  const { text } = await res.json() as { text: string };
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI response was not valid JSON");
  const parsed = JSON.parse(jsonMatch[0]) as Omit<BriefingData, "generatedAt" | "month">;
  return { ...parsed, generatedAt: new Date().toISOString(), month: nowYm() };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const RATING_STYLES: Record<string, { color: string; label: string }> = {
  strong:   { color: "var(--ft-green)", label: "STRONG" },
  healthy:  { color: "var(--ft-blue)",  label: "HEALTHY" },
  cautious: { color: "var(--ft-amber)", label: "CAUTIOUS" },
  critical: { color: "var(--ft-red)",   label: "CRITICAL" },
};

const RISK_COLORS: Record<string, string> = {
  red: "var(--ft-red)", amber: "var(--ft-amber)", green: "var(--ft-green)",
};

const PRIORITY_ICONS: Record<string, typeof AlertTriangle> = {
  high: AlertTriangle, medium: Zap, low: Shield,
};

function SectionHeader({ code, title, accentColor }: { code: string; title: string; accentColor?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      paddingBottom: 9, marginBottom: 14,
      borderBottom: "1px solid var(--ft-border)",
      borderLeft: `3px solid ${accentColor ?? "var(--ft-accent)"}`,
      paddingLeft: 10,
    }}>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-accent)",
        letterSpacing: "0.1em", background: "rgba(79,140,255,0.08)",
        border: "1px solid rgba(79,140,255,0.18)", padding: "1px 5px",
        fontWeight: 700,
      }}>{code}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: "var(--ft-border2)", marginLeft: 4 }} />
    </div>
  );
}

function NarrativeBox({ text, icon: Icon }: { text: string; icon?: React.ElementType }) {
  return (
    <div style={{
      background: "var(--ft-raised)", borderLeft: "2px solid var(--ft-accent)",
      padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: 12,
      color: "var(--ft-text)", lineHeight: 1.8, display: "flex", gap: 10,
    }}>
      {Icon && <Icon size={12} style={{ color: "var(--ft-accent)", flexShrink: 0, marginTop: 3 }} />}
      <span>{text}</span>
    </div>
  );
}

// ─── Key Finding row ──────────────────────────────────────────────────────────

function KeyFindingRow({ finding, index }: { finding: string; index: number }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        display: "flex", gap: 0,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        border: "1px solid var(--ft-border)", overflow: "hidden",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ width: 36, flexShrink: 0, background: "var(--ft-raised)", borderRight: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-accent)", fontWeight: 700 }}>
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>
      <div style={{ padding: "10px 14px", flex: 1 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-text)", lineHeight: 1.65 }}>{finding}</span>
      </div>
    </div>
  );
}

// ─── Spending category row ────────────────────────────────────────────────────

function SpendingCatRow({
  cat, amt, index, total, maxAmt, sortedLength, isMobile,
}: {
  cat: string; amt: number; index: number; total: number; maxAmt: number; sortedLength: number; isMobile?: boolean;
}) {
  const [hov, setHov] = useState(false);
  const share = total > 0 ? (amt / total) * 100 : 0;
  const barWidth = maxAmt > 0 ? (amt / maxAmt) * 100 : 0;
  const barColor = index === 0 ? "var(--ft-red)" : index === 1 ? "var(--ft-amber)" : "var(--ft-dim)";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 80px 50px" : "1fr 100px 60px 60px",
        padding: isMobile ? "9px 12px" : "8px 12px", gap: 8, alignItems: "center",
        borderBottom: index < sortedLength - 1 ? "1px solid var(--ft-border)" : undefined,
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : index % 2 === 0 ? "var(--ft-surface)" : "var(--ft-raised)",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>{cat}</span>
      {!isMobile && (
        <div style={{ height: 4, background: "var(--ft-border2)", borderRadius: 1, overflow: "hidden" }}>
          <div style={{ width: `${barWidth}%`, height: "100%", background: barColor, borderRadius: 1, transition: "width 0.12s ease" }} />
        </div>
      )}
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", textAlign: "right" }}>
        <span className="pnum">{formatGbp(amt)}</span>
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", textAlign: "right" }}>
        <span className="pnum">{share.toFixed(0)}%</span>
      </span>
    </div>
  );
}

// ─── Budget performance row ───────────────────────────────────────────────────

function BudgetPerfRow({
  budget, spent, index, totalBudgets, budgetSpendMap, isMobile,
}: {
  budget: Budget; spent: number; index: number; totalBudgets: number; budgetSpendMap: Map<string, number>; isMobile?: boolean;
}) {
  void budgetSpendMap;
  const [hov, setHov] = useState(false);
  const pct = budget.monthlyLimit > 0 ? (spent / budget.monthlyLimit) * 100 : 0;
  const over = pct > 100;
  const warn = pct >= 80 && !over;
  const barColor = over ? "var(--ft-red)" : warn ? "var(--ft-amber)" : "var(--ft-green)";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr auto 90px" : "1fr auto auto 120px",
        alignItems: "center", gap: 8, padding: "9px 12px",
        borderBottom: index < totalBudgets - 1 ? "1px solid var(--ft-border)" : undefined,
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : over ? "rgba(230,80,80,0.04)" : index % 2 === 0 ? "var(--ft-surface)" : "var(--ft-raised)",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        {over && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ft-red)", flexShrink: 0 }} />}
        {warn && !over && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ft-amber)", flexShrink: 0 }} />}
        {!over && !warn && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ft-border2)", flexShrink: 0 }} />}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>{budget.category}</span>
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: over ? "var(--ft-red)" : "var(--ft-text)", textAlign: "right" }}>
        <span className="pnum">{formatGbp(spent)}</span>
      </span>
      {!isMobile && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "right" }}>
          <span className="pnum">{formatGbp(budget.monthlyLimit)}</span>
        </span>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ flex: 1, height: 5, background: "var(--ft-border2)", borderRadius: 1, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: barColor, borderRadius: 1, transition: "width 0.12s ease" }} />
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: barColor, minWidth: 32, textAlign: "right", fontWeight: over || warn ? 700 : 400 }}>
          <span className="pnum">{pct.toFixed(0)}%</span>
        </span>
      </div>
    </div>
  );
}

// ─── Recommendation row ───────────────────────────────────────────────────────

function RecommendationRow({
  rec, index,
}: {
  rec: { priority: "high" | "medium" | "low"; action: string; impact: string };
  index: number;
}) {
  const [hov, setHov] = useState(false);
  const Icon = PRIORITY_ICONS[rec.priority] ?? Shield;
  const color = rec.priority === "high" ? "var(--ft-red)" : rec.priority === "medium" ? "var(--ft-amber)" : "var(--ft-green)";
  const bgTint = rec.priority === "high" ? "rgba(230,80,80,0.03)" : rec.priority === "medium" ? "rgba(245,158,11,0.03)" : "rgba(80,200,120,0.03)";
  return (
    <div
      style={{
        display: "flex", gap: 0,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        borderLeft: `3px solid ${color}`,
        overflow: "hidden",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ width: 44, flexShrink: 0, background: bgTint, borderRight: "1px solid var(--ft-border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, padding: "10px 0" }}>
        <Icon size={12} style={{ color }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>
          {rec.priority}
        </span>
      </div>
      <div style={{ padding: "11px 14px", flex: 1 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", fontWeight: 600, marginBottom: 4, lineHeight: 1.5 }}>{rec.action}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", lineHeight: 1.5 }}>
          <span style={{ color: "var(--ft-accent)", marginRight: 5 }}>↗</span>{rec.impact}
        </div>
      </div>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", padding: "0 12px" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
          R{String(index + 1).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}

// ─── Risk register row ────────────────────────────────────────────────────────

function RiskRow({
  risk, index, total,
}: {
  risk: { level: "red" | "amber" | "green"; description: string };
  index: number;
  total: number;
}) {
  const [hov, setHov] = useState(false);
  const riskColor = RISK_COLORS[risk.level] ?? "var(--ft-dim)";
  return (
    <div
      style={{
        display: "grid", gridTemplateColumns: "80px 1fr",
        alignItems: "flex-start", gap: 12, padding: "10px 12px",
        borderBottom: index < total - 1 ? "1px solid var(--ft-border)" : undefined,
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : index % 2 === 0 ? "var(--ft-surface)" : "var(--ft-raised)",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: riskColor, flexShrink: 0 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: riskColor, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
          {risk.level}
        </span>
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", lineHeight: 1.65 }}>{risk.description}</span>
    </div>
  );
}

// ─── Situation metric cell ────────────────────────────────────────────────────

function SituationMetricCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: "right", background: "var(--ft-surface)", padding: "10px 16px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color }}>
        <span className="pnum">{value}</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Briefing() {
  const isMobile = useIsMobile();
  const { data: dashData } = useGetDashboard();
  const { data: txRaw } = useListTransactions({});
  const { data: accountsRaw } = useListAccounts({});
  const { data: budgetsRaw } = useListBudgets({});
  const { data: goalsRaw } = useListGoals({});
  const { data: invSummary } = useGetInvestmentSummary();
  const { data: investmentsRaw } = useListInvestments({});
  const { data: subsRaw } = useListSubscriptions({});

  const [briefing, setBriefing] = useState<BriefingData | null>(loadCached);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dashboard = dashData as { netWorth?: number; thisMonth?: { income?: number; expenses?: number; savingsRate?: number } } | undefined;

  const ym = nowYm();
  const lastYm = (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7);
  })();

  const thisTxs = useMemo(() =>
    ((txRaw ?? []) as Tx[]).filter(t => t.date.startsWith(ym) && t.type === "expense"),
    [txRaw, ym]);
  const lastTxs = useMemo(() =>
    ((txRaw ?? []) as Tx[]).filter(t => t.date.startsWith(lastYm) && t.type === "expense"),
    [txRaw, lastYm]);

  const context = useMemo(() => buildBriefingContext(
    accountsRaw as any,
    dashboard,
    budgetsRaw as Budget[],
    thisTxs, lastTxs,
    invSummary as { totalValueGbp: number } | undefined,
    investmentsRaw as Investment[],
    goalsRaw as Goal[],
    subsRaw as any,
  ), [accountsRaw, dashboard, budgetsRaw, thisTxs, lastTxs, invSummary, investmentsRaw, goalsRaw, subsRaw]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await generateBriefing(context);
      saveCache(result);
      setBriefing(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }, [context]);

  const rating = briefing ? RATING_STYLES[briefing.situationRating] ?? RATING_STYLES.healthy : null;

  const generatedAgo = briefing
    ? Math.round((Date.now() - new Date(briefing.generatedAt).getTime()) / 60000)
    : null;

  const totalLiquid = useMemo(() =>
    ((accountsRaw ?? []) as Array<{ gbpEquivalent: number }>).reduce((s, a) => s + a.gbpEquivalent, 0),
    [accountsRaw]);

  const overBudgetCount = useMemo(() => {
    if (!budgetsRaw) return 0;
    const spendMap = new Map<string, number>();
    for (const tx of thisTxs) spendMap.set(tx.category, (spendMap.get(tx.category) ?? 0) + tx.gbpValue);
    return (budgetsRaw as Budget[]).filter(b => (spendMap.get(b.category) ?? 0) > b.monthlyLimit).length;
  }, [budgetsRaw, thisTxs]);

  const budgetSpendMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of thisTxs) map.set(tx.category, (map.get(tx.category) ?? 0) + tx.gbpValue);
    return map;
  }, [thisTxs]);

  // Spending category data for the report table
  const spendingCatData = useMemo(() => {
    if (thisTxs.length === 0) return null;
    const catMap = new Map<string, number>();
    for (const tx of thisTxs) catMap.set(tx.category, (catMap.get(tx.category) ?? 0) + tx.gbpValue);
    const sorted = [...catMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const total = thisTxs.reduce((s, t) => s + t.gbpValue, 0);
    const maxAmt = sorted[0]?.[1] ?? 1;
    return { sorted, total, maxAmt };
  }, [thisTxs]);

  // Situation header metrics
  const plValue = dashboard?.thisMonth?.income != null && dashboard?.thisMonth?.expenses != null
    ? formatGbp(dashboard.thisMonth.income - dashboard.thisMonth.expenses)
    : "—";
  const plColor = (dashboard?.thisMonth?.income ?? 0) >= (dashboard?.thisMonth?.expenses ?? 0) ? "var(--ft-green)" : "var(--ft-red)";
  const srValue = dashboard?.thisMonth?.savingsRate != null
    ? `${(dashboard.thisMonth.savingsRate * 100).toFixed(1)}%`
    : "—";

  return (
    <div>
      <PageHeader
        icon={FileText}
        title="Monthly Briefing"
        subtitle={`Intelligence report · ${monthLabel(ym)}`}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {generatedAgo != null && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                Generated {generatedAgo < 1 ? "just now" : `${generatedAgo}m ago`}
              </span>
            )}
            <button
              type="button"
              onClick={generate}
              disabled={generating}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                letterSpacing: "0.06em", textTransform: "uppercase",
                background: generating ? "var(--ft-raised)" : "var(--ft-accent)",
                border: "none", color: "var(--ft-base)",
                padding: "6px 14px", cursor: generating ? "not-allowed" : "pointer",
              }}
            >
              {generating
                ? <><Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> Generating…</>
                : <><RefreshCw size={11} /> {briefing ? "Regenerate" : "Generate Report"}</>
              }
            </button>
          </div>
        }
      />

      {/* Classification bar */}
      {isMobile ? (
        <div style={{
          background: "var(--ft-raised)",
          borderTop: "1px solid var(--ft-border)",
          borderBottom: "1px solid var(--ft-border)",
          padding: "6px 16px", marginBottom: 16,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em" }}>
            INTELLIGENCE REPORT
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-accent)", letterSpacing: "0.08em" }}>
            {monthLabel(ym)}
          </span>
        </div>
      ) : (
        <div style={{
          background: "var(--ft-raised)",
          borderTop: "1px solid var(--ft-border)",
          borderBottom: "1px solid var(--ft-border)",
          padding: "5px 0", marginBottom: 24,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {[
            "FINANCIAL INTELLIGENCE REPORT",
            `PERIOD: ${monthLabel(ym)}`,
            "CLASSIFICATION: PERSONAL",
            "POWERED BY GEMINI",
          ].map((label, i, arr) => (
            <span key={label} style={{ display: "flex", alignItems: "center" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.12em", padding: "0 20px" }}>
                {label}
              </span>
              {i < arr.length - 1 && (
                <span style={{ color: "var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 10 }}>·</span>
              )}
            </span>
          ))}
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 20, padding: "10px 14px", background: "rgba(230,80,80,0.06)", border: "1px solid rgba(230,80,80,0.2)", fontSize: 11, color: "var(--ft-red)", fontFamily: "var(--font-mono)" }}>
          {error}
        </div>
      )}

      {/* Pre-generate: live data summary + CTA */}
      {!briefing && !generating && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* KPI snapshot — border-as-gap grid */}
          <div>
            <SectionHeader code="01" title="Current Snapshot" accentColor="var(--ft-accent)" />
            <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "var(--ft-border)", marginBottom: 1 }}>
              {[
                { label: "Net Worth", value: dashboard?.netWorth != null ? formatGbp(dashboard.netWorth) : "—", color: "var(--ft-text)", accentColor: "var(--ft-accent)" },
                { label: "Liquid Assets", value: formatGbp(totalLiquid), color: totalLiquid > 0 ? "var(--ft-blue)" : "var(--ft-muted)", accentColor: totalLiquid > 0 ? "var(--ft-blue)" : "var(--ft-border2)" },
                { label: "Monthly Income", value: dashboard?.thisMonth?.income != null ? formatGbp(dashboard.thisMonth.income) : "—", color: (dashboard?.thisMonth?.income ?? 0) > 0 ? "var(--ft-green)" : "var(--ft-muted)", accentColor: (dashboard?.thisMonth?.income ?? 0) > 0 ? "var(--ft-green)" : "var(--ft-border2)" },
              ].map(({ label, value, color, accentColor }) => (
                <div key={label} style={{ background: "var(--ft-surface)", padding: "13px 14px", borderTop: `2px solid ${accentColor}` }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 7 }}>{label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color }}>
                    <span className="pnum">{value}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "var(--ft-border)" }}>
              {[
                { label: "Monthly Spend", value: dashboard?.thisMonth?.expenses != null ? formatGbp(dashboard.thisMonth.expenses) : "—", color: (dashboard?.thisMonth?.expenses ?? 0) > 0 ? "var(--ft-red)" : "var(--ft-muted)", accentColor: (dashboard?.thisMonth?.expenses ?? 0) > 0 ? "var(--ft-red)" : "var(--ft-border2)" },
                { label: "Savings Rate", value: dashboard?.thisMonth?.savingsRate != null ? `${(dashboard.thisMonth.savingsRate * 100).toFixed(1)}%` : "—", color: dashboard?.thisMonth?.savingsRate != null && dashboard.thisMonth.savingsRate !== 0 ? "var(--ft-amber)" : "var(--ft-muted)", accentColor: dashboard?.thisMonth?.savingsRate != null && dashboard.thisMonth.savingsRate !== 0 ? "var(--ft-amber)" : "var(--ft-border2)" },
                { label: "Budgets Over Limit", value: overBudgetCount > 0 ? `${overBudgetCount} over` : "All clear", color: overBudgetCount > 0 ? "var(--ft-red)" : "var(--ft-green)", accentColor: overBudgetCount > 0 ? "var(--ft-red)" : "var(--ft-green)" },
              ].map(({ label, value, color, accentColor }) => (
                <div key={label} style={{ background: "var(--ft-surface)", padding: "13px 14px", borderTop: `2px solid ${accentColor}` }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 7 }}>{label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color }}>
                    <span className="pnum">{value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div style={{
            border: "1px solid var(--ft-border)", borderLeft: "3px solid var(--ft-accent)",
            padding: isMobile ? "20px 16px" : "28px 24px",
            display: "flex", gap: isMobile ? 14 : 24,
            alignItems: isMobile ? "flex-start" : "center",
            flexDirection: isMobile ? "column" : "row",
          }}>
            <div style={{
              width: 48, height: 48, flexShrink: 0,
              background: "rgba(79,140,255,0.06)", border: "1px solid rgba(79,140,255,0.16)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <FileText size={22} style={{ color: "var(--ft-accent)" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)", marginBottom: 5 }}>
                {monthLabel(ym)} Report Not Yet Generated
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", lineHeight: 1.7, maxWidth: 480 }}>
                Generate your monthly intelligence briefing. The AI will analyse your spending, budgets, goals, and investments to produce a structured report with actionable recommendations.
              </div>
            </div>
            <button
              type="button"
              onClick={generate}
              style={{
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap",
                background: "var(--ft-accent)", border: "none",
                color: "var(--ft-base)", padding: "10px 20px", cursor: "pointer",
                flexShrink: 0, transition: "opacity 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.85"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
            >
              Generate Report ▸
            </button>
          </div>
        </div>
      )}

      {/* Generating spinner */}
      {generating && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "64px 0" }}>
          <div style={{ position: "relative", width: 48, height: 48 }}>
            <div style={{ width: 48, height: 48, border: "1px solid var(--ft-border)", borderTop: `2px solid var(--ft-accent)`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FileText size={16} style={{ color: "var(--ft-accent)" }} />
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", letterSpacing: "0.06em", marginBottom: 4 }}>
              Generating {monthLabel(ym)} Briefing
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
              Analysing spending, budgets, investments and goals…
            </div>
          </div>
        </div>
      )}

      {/* Generated report */}
      {briefing && !generating && (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

          {/* Situation header */}
          <div style={{
            background: "var(--ft-raised)",
            border: "1px solid var(--ft-border)",
            borderLeft: `4px solid ${rating?.color ?? "var(--ft-accent)"}`,
            overflow: "hidden",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 5 }}>Situation Assessment · {monthLabel(ym)}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: rating?.color, letterSpacing: "0.04em" }}>
                    {rating?.label}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                    {briefing.situationRating === "strong" ? "All metrics healthy" : briefing.situationRating === "healthy" ? "Generally on track" : briefing.situationRating === "cautious" ? "Some areas need attention" : "Immediate action required"}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 1, background: "var(--ft-border)" }}>
                <SituationMetricCell
                  label="Net Worth"
                  value={dashboard?.netWorth != null ? formatGbp(dashboard.netWorth) : "—"}
                  color="var(--ft-text)"
                />
                <SituationMetricCell
                  label="Monthly P&L"
                  value={plValue}
                  color={plColor}
                />
                <SituationMetricCell
                  label="Savings Rate"
                  value={srValue}
                  color="var(--ft-amber)"
                />
              </div>
            </div>
            {generatedAgo != null && (
              <div style={{ borderTop: "1px solid var(--ft-border)", padding: "4px 18px", display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ft-green)", flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
                  Generated {generatedAgo < 1 ? "just now" : `${generatedAgo}m ago`} · Data current as of session load
                </span>
              </div>
            )}
          </div>

          {/* Executive Summary */}
          <div>
            <SectionHeader code="01" title="Executive Summary" accentColor="var(--ft-accent)" />
            <NarrativeBox text={briefing.executiveSummary} icon={FileText} />
          </div>

          {/* Key Findings */}
          <div>
            <SectionHeader code="02" title="Key Findings" accentColor="var(--ft-blue)" />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {briefing.keyFindings.map((finding, i) => (
                <KeyFindingRow key={i} finding={finding} index={i} />
              ))}
            </div>
          </div>

          {/* Spending Analysis */}
          <div>
            <SectionHeader code="03" title="Spending Analysis" accentColor="var(--ft-red)" />
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <NarrativeBox text={briefing.spendingNarrative} icon={TrendingDown} />
              {spendingCatData && (
                <div style={{ border: "1px solid var(--ft-border)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 80px 50px" : "1fr 100px 60px 60px", background: "var(--ft-raised)", padding: "6px 12px", borderBottom: "1px solid var(--ft-border)", gap: 8 }}>
                    {(isMobile ? ["Category", "Amount", "Share"] : ["Category", "Bar", "Amount", "Share"]).map((h, idx) => (
                      <div key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", textAlign: isMobile ? (idx >= 1 ? "right" : "left") : (idx >= 2 ? "right" : "left") }}>{(!isMobile && idx === 1) ? "" : h}</div>
                    ))}
                  </div>
                  {spendingCatData.sorted.map(([cat, amt], i) => (
                    <SpendingCatRow
                      key={cat}
                      cat={cat}
                      amt={amt}
                      index={i}
                      total={spendingCatData.total}
                      maxAmt={spendingCatData.maxAmt}
                      sortedLength={spendingCatData.sorted.length}
                      isMobile={isMobile}
                    />
                  ))}
                  <div style={{ padding: "6px 12px", borderTop: "1px solid var(--ft-border)", background: "var(--ft-raised)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em" }}>TOTAL SPEND</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)" }}>
                      <span className="pnum">{formatGbp(spendingCatData.total)}</span>
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Budget Performance */}
          {budgetsRaw && (budgetsRaw as Budget[]).length > 0 && (
            <div>
              <SectionHeader code="04" title="Budget Performance" accentColor="var(--ft-amber)" />
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <NarrativeBox text={briefing.budgetNarrative} icon={Shield} />
                <div style={{ border: "1px solid var(--ft-border)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr auto 90px" : "1fr auto auto 120px", gap: 8, background: "var(--ft-raised)", padding: "6px 12px", borderBottom: "1px solid var(--ft-border)", alignItems: "center" }}>
                    {(isMobile ? ["Category", "Spent", "Progress"] : ["Category", "Spent", "Limit", "Progress"]).map((h, idx) => (
                      <div key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", textAlign: idx === 1 ? "right" : "left" }}>{h}</div>
                    ))}
                  </div>
                  {(budgetsRaw as Budget[]).map((b, i) => (
                    <BudgetPerfRow
                      key={b.category}
                      budget={b}
                      spent={budgetSpendMap.get(b.category) ?? 0}
                      index={i}
                      totalBudgets={(budgetsRaw as Budget[]).length}
                      budgetSpendMap={budgetSpendMap}
                      isMobile={isMobile}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Portfolio */}
          <div>
            <SectionHeader code="05" title="Portfolio Update" accentColor="var(--ft-cyan)" />
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <NarrativeBox text={briefing.portfolioNarrative} icon={TrendingUp} />
              {invSummary && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 1, background: "var(--ft-border)" }}>
                  <div style={{ background: "var(--ft-surface)", padding: "14px 16px", borderTop: "2px solid var(--ft-cyan)", minWidth: isMobile ? 0 : 160, flex: isMobile ? "1 1 100%" : undefined }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Portfolio Value</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--ft-text)" }}>
                      <span className="pnum">{formatGbp((invSummary as { totalValueGbp: number }).totalValueGbp)}</span>
                    </div>
                  </div>
                  {investmentsRaw && (investmentsRaw as Investment[]).length > 0 && (
                    <div style={{ flex: 1, background: "var(--ft-surface)", padding: "14px 16px", borderTop: "2px solid var(--ft-border2)" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Top Holdings</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {(investmentsRaw as Investment[]).slice(0, 6).map(inv => {
                          const totalVal = (invSummary as { totalValueGbp: number }).totalValueGbp;
                          const pct = totalVal > 0 ? ((inv.gbpValue / totalVal) * 100).toFixed(1) : "—";
                          return (
                            <div key={inv.ticker} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "4px 8px", display: "flex", gap: 6, alignItems: "baseline" }}>
                              <span style={{ color: "var(--ft-cyan)", fontWeight: 700 }}>{inv.ticker}</span>
                              <span className="pnum">{formatGbp(inv.gbpValue)}</span>
                              <span className="pnum" style={{ color: "var(--ft-dim)", fontSize: 9 }}>{pct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Recommendations */}
          <div>
            <SectionHeader code="06" title="Forward Guidance" accentColor="var(--ft-green)" />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {briefing.recommendations.map((rec, i) => (
                <RecommendationRow key={i} rec={rec} index={i} />
              ))}
            </div>
          </div>

          {/* Risk Register */}
          <div>
            <SectionHeader code="07" title="Risk Register" accentColor="var(--ft-red)" />
            <div style={{ border: "1px solid var(--ft-border)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", background: "var(--ft-raised)", padding: "5px 12px", borderBottom: "1px solid var(--ft-border)", gap: 12 }}>
                {["Level", "Description"].map(h => (
                  <div key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{h}</div>
                ))}
              </div>
              {briefing.risks.map((risk, i) => (
                <RiskRow key={i} risk={risk} index={i} total={briefing.risks.length} />
              ))}
            </div>
          </div>

          {/* Footer */}
          <div style={{
            borderTop: "1px solid var(--ft-border)", paddingTop: 12,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
              GENERATED {new Date(briefing.generatedAt).toLocaleString("en-GB")} · POWERED BY GOOGLE GEMINI
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
                FINANCE TRACKER · {monthLabel(ym)} REPORT
              </span>
              <button
                type="button"
                onClick={generate}
                disabled={generating}
                style={{
                  fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)",
                  background: "none", border: "1px solid var(--ft-border2)",
                  padding: "3px 8px", cursor: "pointer", letterSpacing: "0.06em",
                  display: "flex", alignItems: "center", gap: 4,
                  transition: "color 0.15s, border-color 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ft-text)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--ft-border)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ft-dim)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--ft-border2)"; }}
              >
                <RefreshCw size={8} /> REGENERATE
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
