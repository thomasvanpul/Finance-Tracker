import React, { useState, useMemo, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useGetDashboard, useListTransactions, useListAccounts,
  useListBudgets, useListGoals, useGetInvestmentSummary,
  useListInvestments, useListSubscriptions,
} from "@workspace/api-client-react";
import { formatBaseMoney } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { FileText, RefreshCw, Loader2, AlertTriangle, TrendingUp, TrendingDown, Shield, Zap } from "lucide-react";
import { HStack, MonoLabel, PanelBox, PanelHeader, Text, VStack } from "@/components/primitives";
import { Drill } from "@/components/drill";
import { categoryTransactionsHref, ledgerHref } from "@/lib/entity-href";
import { oneShotInsight } from "@/lib/ai-chat-client";
import { netAccountsTotal } from "@/lib/account-sign";

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

type Tx = { date: string; type: string; category: string; baseEquivalent: number };
type Budget = { category: string; monthlyLimit: number };
type Goal = { name: string; target: number; current: number; deadline?: string };
type Investment = { ticker: string; name?: string; baseEquivalent: number; quantity?: number; currency?: string };

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

// ─── AI call ──────────────────────────────────────────────────────────────────
// Context assembly is server-side (lib/ai-context.ts, buildChatContext).
// This page sends only the prompt — the server reads accounts, net
// worth, monthly P&L, budgets, goals, portfolio, subscriptions from
// the authenticated user's own rows.

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
Be direct. Use exact GBP figures from the context provided. British English. No generic advice.`;

async function generateBriefing(): Promise<BriefingData> {
  const result = await oneShotInsight({
    path: "/briefing",
    prompt: `Generate my monthly financial intelligence briefing for ${monthLabel(nowYm())}.${SCHEMA_INSTRUCTION}`,
  });
  const jsonMatch = result.text.match(/\{[\s\S]*\}/);
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

function NarrativeBox({ text, icon: Icon }: { text: string; icon?: React.ElementType }) {
  return (
    // No frame and no fill: this is prose belonging to the panel, and both the
    // border and the --ft-surface fill were being drawn inside a panel that
    // already paints --ft-surface behind a --ft-border frame. The fill was
    // invisible; the frame was a frame inside a frame (DESIGN.md § 1).
    <div style={{
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
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
        // Rows in a run are separated by a shared rule, not by a frame each
        // (DESIGN.md § 5). The resting fill was the same token as the panel.
        borderBottom: "1px solid var(--ft-border)", overflow: "hidden",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ width: 36, flexShrink: 0, background: "var(--ft-raised)", borderRight: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Text as="span" mono size={9} weight={700} color="var(--ft-accent)">
          {String(index + 1).padStart(2, "0")}
        </Text>
      </div>
      <div style={{ padding: "10px 14px", flex: 1 }}>
        <Text as="span" mono size={12} color="var(--ft-text)" lineHeight={1.65}>{finding}</Text>
      </div>
    </div>
  );
}

// ─── Spending category row ────────────────────────────────────────────────────

function SpendingCatRow({
  cat, amt, index, total, maxAmt, sortedLength, isMobile, range,
}: {
  cat: string; amt: number; index: number; total: number; maxAmt: number; sortedLength: number; isMobile?: boolean;
  /** The month these rows were summed over (DESIGN.md §14). */
  range: { from: string; to: string };
}) {
  const [hov, setHov] = useState(false);
  // Share of a zero spend total is undefined, not 0%. The bar width below
  // keeps ?? 0 — that is geometry, not a figure the user reads.
  const share: number | null = total > 0 ? (amt / total) * 100 : null;
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
      {/* Category and amount are the same set of rows and both open it.
          The bar and the share are proportions of a whole (DESIGN.md §14). */}
      <span style={{ color: "var(--ft-text)" }}>
        <Drill href={categoryTransactionsHref(cat, range)} title={`Open the ${cat} transactions this month`}>
          <Text as="span" mono size={11}>{cat}</Text>
        </Drill>
      </span>
      {!isMobile && (
        <div style={{ height: 4, background: "var(--ft-border2)", borderRadius: 1, overflow: "hidden" }}>
          <div style={{ width: `${barWidth}%`, height: "100%", background: barColor, borderRadius: 1, transition: "width 0.12s ease" }} />
        </div>
      )}
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", textAlign: "right" }}>
        <Drill href={categoryTransactionsHref(cat, range)} title={`Open the ${cat} transactions this added up`}>
          <span className="pnum">{formatBaseMoney(amt)}</span>
        </Drill>
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", textAlign: "right" }}>
        <span className="pnum">{share == null ? "—" : `${share.toFixed(0)}%`}</span>
      </span>
    </div>
  );
}

// ─── Budget performance row ───────────────────────────────────────────────────

function BudgetPerfRow({
  budget, spent, index, totalBudgets, budgetSpendMap, isMobile, range,
}: {
  budget: Budget; spent: number; index: number; totalBudgets: number; budgetSpendMap: Map<string, number>; isMobile?: boolean;
  /** The month these rows were summed over (DESIGN.md §14). */
  range: { from: string; to: string };
}) {
  void budgetSpendMap;
  const [hov, setHov] = useState(false);
  // A budget with no limit set has no denominator — "0% used" reads as
  // "you have spent nothing", which is not what an absent limit means.
  const pct: number | null = budget.monthlyLimit > 0 ? (spent / budget.monthlyLimit) * 100 : null;
  const over = pct != null && pct > 100;
  const warn = pct != null && pct >= 80 && !over;
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
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>
          <Drill href={categoryTransactionsHref(budget.category, range)} title={`Open the ${budget.category} transactions this month`}>{budget.category}</Drill>
        </span>
      </div>
      {/* Spent is the sum of those rows. The limit beside it is a number
          the user typed and the percentage is a proportion of it —
          neither is a set of rows (DESIGN.md §14). */}
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: over ? "var(--ft-red)" : "var(--ft-text)", textAlign: "right" }}>
        <Drill href={categoryTransactionsHref(budget.category, range)} title="Open the transactions this added up">
          <span className="pnum">{formatBaseMoney(spent)}</span>
        </Drill>
      </span>
      {!isMobile && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "right" }}>
          <span className="pnum">{formatBaseMoney(budget.monthlyLimit)}</span>
        </span>
      )}
      <HStack gap={6} align="center">
        <div style={{ flex: 1, height: 5, background: "var(--ft-border2)", borderRadius: 1, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(pct ?? 0, 100)}%`, height: "100%", background: barColor, borderRadius: 1, transition: "width 0.12s ease" }} />
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: barColor, minWidth: 32, textAlign: "right", fontWeight: over || warn ? 700 : 400 }}>
          <span className="pnum">{pct == null ? "—" : `${pct.toFixed(0)}%`}</span>
        </span>
      </HStack>
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
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
        // One shared rule between rows, not a frame each (DESIGN.md § 5).
        borderBottom: "1px solid var(--ft-border)",
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
        <Text as="div" mono size={10} color="var(--ft-dim)" lineHeight={1.5}>
          <span style={{ color: "var(--ft-accent)", marginRight: 5 }}>↗</span>{rec.impact}
        </Text>
      </div>
      <HStack align="center" padding="0 12px" shrink={false}>
        <Text as="span" mono size={8} color="var(--ft-dim)" letterSpacing="0.06em">
          R{String(index + 1).padStart(2, "0")}
        </Text>
      </HStack>
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
      <Text as="span" mono size={11} color="var(--ft-text)" lineHeight={1.65}>{risk.description}</Text>
    </div>
  );
}

// ─── Situation metric cell ────────────────────────────────────────────────────

function SituationMetricCell({ label, value, color, isLast }: { label: string; value: string; color: string; isLast?: boolean }) {
  return (
    <div style={{ textAlign: "right", background: "var(--ft-surface)", padding: "10px 16px", borderRight: isLast ? "none" : "1px solid var(--ft-border)" }}>
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
  // The month every drill off this screen carries, so the rows that open
  // are the rows that were summed (DESIGN.md §14). `thisTxs` filters on
  // `date.startsWith(ym)`, and this is the same window as a range.
  const monthRange = {
    from: `${ym}-01`,
    to: new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).toISOString().slice(0, 10),
  };
  const lastYm = (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7);
  })();

  const thisTxs = useMemo(() =>
    ((txRaw ?? []) as Tx[]).filter(t => t.date.startsWith(ym) && t.type === "expense"),
    [txRaw, ym]);
  const lastTxs = useMemo(() =>
    ((txRaw ?? []) as Tx[]).filter(t => t.date.startsWith(lastYm) && t.type === "expense"),
    [txRaw, lastYm]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await generateBriefing();
      saveCache(result);
      setBriefing(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }, []);

  const rating = briefing ? RATING_STYLES[briefing.situationRating] ?? RATING_STYLES.healthy : null;

  const generatedAgo = briefing
    ? Math.round((Date.now() - new Date(briefing.generatedAt).getTime()) / 60000)
    : null;

  // A liability stores a positive balance and the type carries the sign, so
  // summing raw offered a season-ticket loan as liquidity. netAccountsTotal
  // subtracts it; an overdraft is already negative and is left alone.
  const totalLiquid = useMemo(() =>
    netAccountsTotal((accountsRaw ?? []) as Array<{ type: string; baseEquivalent: number | null }>),
    [accountsRaw]);

  const overBudgetCount = useMemo(() => {
    if (!budgetsRaw) return 0;
    const spendMap = new Map<string, number>();
    for (const tx of thisTxs) spendMap.set(tx.category, (spendMap.get(tx.category) ?? 0) + tx.baseEquivalent);
    return (budgetsRaw as Budget[]).filter(b => (spendMap.get(b.category) ?? 0) > b.monthlyLimit).length;
  }, [budgetsRaw, thisTxs]);

  const budgetSpendMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of thisTxs) map.set(tx.category, (map.get(tx.category) ?? 0) + tx.baseEquivalent);
    return map;
  }, [thisTxs]);

  // Spending category data for the report table
  const spendingCatData = useMemo(() => {
    if (thisTxs.length === 0) return null;
    const catMap = new Map<string, number>();
    for (const tx of thisTxs) catMap.set(tx.category, (catMap.get(tx.category) ?? 0) + tx.baseEquivalent);
    const sorted = [...catMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const total = thisTxs.reduce((s, t) => s + t.baseEquivalent, 0);
    const maxAmt = sorted[0]?.[1] ?? 1;
    return { sorted, total, maxAmt };
  }, [thisTxs]);

  // Situation header metrics
  const plValue = dashboard?.thisMonth?.income != null && dashboard?.thisMonth?.expenses != null
    ? formatBaseMoney(dashboard.thisMonth.income - dashboard.thisMonth.expenses)
    : "—";
  const plColor = (dashboard?.thisMonth?.income ?? 0) >= (dashboard?.thisMonth?.expenses ?? 0) ? "var(--ft-green)" : "var(--ft-red)";
  // savingsRate arrives from /dashboard already expressed in percent
  // (the server does `(monthNet / monthIncome) * 100`), so it is
  // formatted directly. Multiplying by 100 here overstated it 100x.
  const srValue = dashboard?.thisMonth?.savingsRate != null
    ? `${dashboard.thisMonth.savingsRate.toFixed(1)}%`
    : "—";

  return (
    <div>
      <PageHeader
        icon={FileText}
        title="Monthly Briefing"
        subtitle={`Intelligence report · ${monthLabel(ym)}`}
        actions={
          <HStack gap={10} align="center">
            {generatedAgo != null && (
              <Text as="span" mono size={9} color="var(--ft-dim)">
                Generated {generatedAgo < 1 ? "just now" : `${generatedAgo}m ago`}
              </Text>
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
          </HStack>
        }
      />

      {/* Classification bar */}
      {isMobile ? (
        <div style={{
          background: "var(--ft-raised)",
          borderTop: "1px solid var(--ft-border)",
          borderBottom: "1px solid var(--ft-border)",
          padding: "6px 16px", marginBottom: 6,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <Text as="span" mono size={9} color="var(--ft-dim)" letterSpacing="0.08em">
            INTELLIGENCE REPORT
          </Text>
          <Text as="span" mono size={9} color="var(--ft-accent)" letterSpacing="0.08em">
            {monthLabel(ym)}
          </Text>
        </div>
      ) : (
        <div style={{
          background: "var(--ft-raised)",
          borderTop: "1px solid var(--ft-border)",
          borderBottom: "1px solid var(--ft-border)",
          padding: "5px 0", marginBottom: 6,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {[
            "FINANCIAL INTELLIGENCE REPORT",
            `PERIOD: ${monthLabel(ym)}`,
            "CLASSIFICATION: PERSONAL",
            "POWERED BY GROQ",
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
        <div style={{ marginBottom: 6, padding: "10px 14px", background: "rgba(230,80,80,0.06)", border: "1px solid rgba(230,80,80,0.2)", fontSize: 11, color: "var(--ft-red)", fontFamily: "var(--font-mono)" }}>
          {error}
        </div>
      )}

      {/* Pre-generate: live data summary + CTA */}
      {!briefing && !generating && (
        <VStack gap={6}>
          {/* KPI snapshot — one framed strip, cells separated by borders */}
          <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
            <PanelHeader>Current Snapshot <Text as="span" mono size={10} color="var(--ft-muted)">01</Text></PanelHeader>
            <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
              {[
                // Each of these three is a sum over rows on another
                // screen, so each opens them (DESIGN.md §14).
                //
                // A zero month is the exception: £0.00 income means the
                // ledger holds no income rows for the window, and a drill
                // that opens an empty list is a promise the product did
                // not keep. Seen on this screen — September 2026 has no
                // income and the figure was underlined anyway.
                { label: "Net Worth", value: dashboard?.netWorth != null ? formatBaseMoney(dashboard.netWorth) : "—", color: "var(--ft-text)", href: "/net-worth" },
                { label: "Liquid Assets", value: formatBaseMoney(totalLiquid), color: totalLiquid > 0 ? "var(--ft-blue)" : "var(--ft-muted)", href: "/accounts" },
                { label: "Monthly Income", value: dashboard?.thisMonth?.income != null ? formatBaseMoney(dashboard.thisMonth.income) : "—", color: (dashboard?.thisMonth?.income ?? 0) > 0 ? "var(--ft-green)" : "var(--ft-muted)", href: (dashboard?.thisMonth?.income ?? 0) > 0 ? ledgerHref({ type: "income", from: monthRange.from, to: monthRange.to }) : undefined },
              ].map(({ label, value, color, href }, i, arr) => (
                <div key={label} style={{ padding: "13px 14px", borderBottom: "1px solid var(--ft-border)" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 7 }}>{label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color }}>
                    {href ? <Drill href={href} title="Open the rows this figure was computed from"><span className="pnum">{value}</span></Drill> : <span className="pnum">{value}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
              {[
                { label: "Monthly Spend", value: dashboard?.thisMonth?.expenses != null ? formatBaseMoney(dashboard.thisMonth.expenses) : "—", color: (dashboard?.thisMonth?.expenses ?? 0) > 0 ? "var(--ft-red)" : "var(--ft-muted)", href: (dashboard?.thisMonth?.expenses ?? 0) > 0 ? ledgerHref({ type: "expense", from: monthRange.from, to: monthRange.to }) : undefined },
                // Savings Rate is a percentage of income and "Budgets Over
                // Limit" is a status word, not a sum of rows. Both stay flat.
                { label: "Savings Rate", value: srValue, color: dashboard?.thisMonth?.savingsRate != null && dashboard.thisMonth.savingsRate !== 0 ? "var(--ft-amber)" : "var(--ft-muted)", href: undefined },
                { label: "Budgets Over Limit", value: overBudgetCount > 0 ? `${overBudgetCount} over` : "All clear", color: overBudgetCount > 0 ? "var(--ft-red)" : "var(--ft-green)", href: undefined },
              ].map(({ label, value, color, href }, i, arr) => (
                <div key={label} style={{ padding: "13px 14px", }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 7 }}>{label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color }}>
                    {href ? <Drill href={href} title="Open the rows this figure was computed from"><span className="pnum">{value}</span></Drill> : <span className="pnum">{value}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div style={{
            border: "1px solid var(--ft-border)", background: "var(--ft-surface)",
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
        </VStack>
      )}

      {/* Generating spinner */}
      {generating && (
        <VStack gap={20} align="center" padding="64px 0">
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
            <Text as="div" mono size={9} color="var(--ft-dim)" letterSpacing="0.06em">
              Analysing spending, budgets, investments and goals…
            </Text>
          </div>
        </VStack>
      )}

      {/* Generated report */}
      {briefing && !generating && (
        <VStack gap={6}>

          {/* Situation header */}
          <div style={{
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-border)",
            overflow: "hidden",
          }}>
            <HStack gap={12} align="center" justify="between" wrap padding="14px 18px">
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 5 }}>Situation Assessment · {monthLabel(ym)}</div>
                <HStack gap={10} align="baseline">
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: rating?.color, letterSpacing: "0.04em" }}>
                    {rating?.label}
                  </div>
                  <Text as="div" mono size={9} color="var(--ft-dim)">
                    {briefing.situationRating === "strong" ? "All metrics healthy" : briefing.situationRating === "healthy" ? "Generally on track" : briefing.situationRating === "cautious" ? "Some areas need attention" : "Immediate action required"}
                  </Text>
                </HStack>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", borderTop: "1px solid var(--ft-border)", borderBottom: "1px solid var(--ft-border)" }}>
                <SituationMetricCell
                  label="Net Worth"
                  value={dashboard?.netWorth != null ? formatBaseMoney(dashboard.netWorth) : "—"}
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
                  isLast
                />
              </div>
            </HStack>
            {generatedAgo != null && (
              <div style={{ borderTop: "1px solid var(--ft-border)", padding: "4px 18px", display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ft-green)", flexShrink: 0 }} />
                <Text as="span" mono size={8} color="var(--ft-dim)" letterSpacing="0.06em">
                  Generated {generatedAgo < 1 ? "just now" : `${generatedAgo}m ago`} · Data current as of session load
                </Text>
              </div>
            )}
          </div>

          {/* Executive Summary */}
          <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
            <PanelHeader>Executive Summary <Text as="span" mono size={10} color="var(--ft-muted)">01</Text></PanelHeader>
            <div style={{ padding: "10px 12px" }}>
              <NarrativeBox text={briefing.executiveSummary} icon={FileText} />
            </div>
          </div>

          {/* Key Findings */}
          <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
            <PanelHeader>Key Findings <Text as="span" mono size={10} color="var(--ft-muted)">02</Text></PanelHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px" }}>
              {briefing.keyFindings.map((finding, i) => (
                <KeyFindingRow key={i} finding={finding} index={i} />
              ))}
            </div>
          </div>

          {/* Spending Analysis */}
          <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
            <PanelHeader>Spending Analysis <Text as="span" mono size={10} color="var(--ft-muted)">03</Text></PanelHeader>
            <VStack gap={6} padding="10px 12px">
              <NarrativeBox text={briefing.spendingNarrative} icon={TrendingDown} />
              {spendingCatData && (
                <div>
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
                      range={monthRange}
                    />
                  ))}
                  <div style={{ padding: "6px 12px", borderTop: "1px solid var(--ft-border)", background: "var(--ft-raised)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Text as="span" mono size={8} color="var(--ft-dim)" letterSpacing="0.08em">TOTAL SPEND</Text>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)" }}>
                      <span className="pnum">{formatBaseMoney(spendingCatData.total)}</span>
                    </span>
                  </div>
                </div>
              )}
            </VStack>
          </div>

          {/* Budget Performance */}
          {budgetsRaw && (budgetsRaw as Budget[]).length > 0 && (
            <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
              <PanelHeader>Budget Performance <Text as="span" mono size={10} color="var(--ft-muted)">04</Text></PanelHeader>
              <VStack gap={6} padding="10px 12px">
                <NarrativeBox text={briefing.budgetNarrative} icon={Shield} />
                <div>
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
                      range={monthRange}
                    />
                  ))}
                </div>
              </VStack>
            </div>
          )}

          {/* Portfolio */}
          <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
            <PanelHeader>Portfolio Update <Text as="span" mono size={10} color="var(--ft-muted)">05</Text></PanelHeader>
            <VStack gap={6} padding="10px 12px">
              <NarrativeBox text={briefing.portfolioNarrative} icon={TrendingUp} />
              {invSummary && (
                <div style={{ display: "flex", flexWrap: "wrap", borderTop: "1px solid var(--ft-border)", borderBottom: "1px solid var(--ft-border)" }}>
                  <div style={{ padding: "14px 16px", borderRight: isMobile ? "none" : "1px solid var(--ft-border)", borderBottom: isMobile ? "1px solid var(--ft-border)" : "none", minWidth: isMobile ? 0 : 160, flex: isMobile ? "1 1 100%" : undefined }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Portfolio Value</div>
                    <Text as="div" mono size={18} weight={700} color="var(--ft-text)">
                      <span className="pnum">{formatBaseMoney((invSummary as { totalValueBase: number }).totalValueBase)}</span>
                    </Text>
                  </div>
                  {investmentsRaw && (investmentsRaw as Investment[]).length > 0 && (
                    <div style={{ flex: 1, padding: "14px 16px" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Top Holdings</div>
                      <HStack gap={8} wrap>
                        {(investmentsRaw as Investment[]).slice(0, 6).map(inv => {
                          const totalVal = (invSummary as { totalValueBase: number }).totalValueBase;
                          const pct = totalVal > 0 ? `${((inv.baseEquivalent / totalVal) * 100).toFixed(1)}%` : "—";
                          return (
                            <div key={inv.ticker} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", background: "var(--ft-raised)", padding: "4px 8px", display: "flex", gap: 6, alignItems: "baseline" }}>
                              <span style={{ color: "var(--ft-cyan)", fontWeight: 700 }}>{inv.ticker}</span>
                              <span className="pnum">{formatBaseMoney(inv.baseEquivalent)}</span>
                              <span className="pnum" style={{ color: "var(--ft-dim)", fontSize: 9 }}>{pct}</span>
                            </div>
                          );
                        })}
                      </HStack>
                    </div>
                  )}
                </div>
              )}
            </VStack>
          </div>

          {/* Recommendations */}
          <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
            <PanelHeader>Forward Guidance <Text as="span" mono size={10} color="var(--ft-muted)">06</Text></PanelHeader>
            <VStack gap={6} padding="10px 12px">
              {briefing.recommendations.map((rec, i) => (
                <RecommendationRow key={i} rec={rec} index={i} />
              ))}
            </VStack>
          </div>

          {/* Risk Register */}
          <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
            <PanelHeader>Risk Register <Text as="span" mono size={10} color="var(--ft-muted)">07</Text></PanelHeader>
            <div>
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
            <Text as="span" mono size={8} color="var(--ft-dim)" letterSpacing="0.06em">
              GENERATED {new Date(briefing.generatedAt).toLocaleString("en-GB")} · POWERED BY GROQ
            </Text>
            <HStack gap={8} align="center">
              <Text as="span" mono size={8} color="var(--ft-dim)" letterSpacing="0.06em">
                FINANCE TRACKER · {monthLabel(ym)} REPORT
              </Text>
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
            </HStack>
          </div>
        </VStack>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
