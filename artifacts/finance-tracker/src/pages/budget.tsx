import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { PersonaQuickStart } from "@/components/persona-quick-start";
import { loadPersonaIds, PERSONA_COLORS } from "@/lib/persona";
import { Skeleton as FtSkeleton } from "@/components/skeleton";
import { ErrorState } from "@/components/error-state";
import {
  useListTransactions,
  useGetDashboard,
  useListBudgets,
  useCreateBudget,
  useUpdateBudget,
  useDeleteBudget,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListBudgetsQueryKey } from "@workspace/api-client-react";
import { oneShotInsight } from "@/lib/ai-chat-client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { formatBaseMoney } from "@/lib/utils";
import type { Transaction } from "@workspace/api-client-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { HStack, MonoLabel, PanelBox, Text, VStack } from "@/components/primitives";

// ── Types ────────────────────────────────────────────────────────────────────

interface Budget {
  id: number;
  category: string;
  limit: number;
}

interface CopyCandidate {
  category: string;
  total: number;
  confirmed: boolean;
}

// ── Rollover types ───────────────────────────────────────────────────────────

interface RolloverEntry {
  enabled: boolean;
  accumulated: number;
}

type RolloverMap = Record<string, RolloverEntry>;

const ROLLOVER_KEY = "ft-budget-rollover";
const ROLLOVER_MONTH_KEY = "ft-budget-rollover-month";

function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function loadRolloverMap(): RolloverMap {
  try {
    const raw = localStorage.getItem(ROLLOVER_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as RolloverMap;
  } catch {
    return {};
  }
}

function saveRolloverMap(map: RolloverMap): void {
  localStorage.setItem(ROLLOVER_KEY, JSON.stringify(map));
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getFirstOfMonth(year: number, month: number): string {
  return toDateStr(year, month, 1);
}

function getLastOfMonth(year: number, month: number): string {
  const lastDay = new Date(year, month, 0).getDate();
  return toDateStr(year, month, lastDay);
}

// ── Bar colour helper ─────────────────────────────────────────────────────────

function barColor(pct: number): string {
  if (pct >= 1) return "var(--ft-red)";
  if (pct >= 0.9) return "var(--ft-red)";
  if (pct >= 0.8) return "var(--ft-amber)";
  return "var(--ft-green)";
}

function progressFill(pct: number): string {
  if (pct >= 1) return "var(--ft-red)";
  if (pct >= 0.8) return "var(--ft-amber)";
  return "var(--ft-green)";
}

// ── Budget health status ──────────────────────────────────────────────────────

type HealthStatus = "exceeded" | "warning" | "on-track" | "under" | "empty";

interface HealthInfo {
  status: HealthStatus;
  label: string;
  color: string;
  bg: string;
}

function getBudgetHealth(pct: number, spent: number): HealthInfo {
  if (spent === 0) return { status: "empty", label: "NO SPEND", color: "var(--ft-dim)", bg: "transparent" };
  if (pct >= 1)    return { status: "exceeded", label: "EXCEEDED",  color: "var(--ft-red)",   bg: "color-mix(in srgb, var(--ft-red) 12%, transparent)" };
  if (pct >= 0.9)  return { status: "warning",  label: "AT LIMIT",  color: "var(--ft-red)",   bg: "color-mix(in srgb, var(--ft-red) 8%, transparent)" };
  if (pct >= 0.8)  return { status: "warning",  label: "WARNING",   color: "var(--ft-amber)", bg: "color-mix(in srgb, var(--ft-amber) 10%, transparent)" };
  if (pct >= 0.5)  return { status: "on-track", label: "ON TRACK",  color: "var(--ft-green)", bg: "transparent" };
  return                   { status: "under",   label: "UNDER",     color: "var(--ft-cyan)",  bg: "transparent" };
}

// ── Portfolio-style health score (0-100) ─────────────────────────────────────

function computeOverallHealthScore(
  budgets: Budget[],
  spentByCategory: Record<string, number>,
  rolloverMap: RolloverMap,
): number {
  if (budgets.length === 0) return 100;
  let totalScore = 0;
  for (const b of budgets) {
    const spent = spentByCategory[b.category.toLowerCase()] ?? 0;
    const entry = rolloverMap[b.category];
    const effective = b.limit + (entry?.enabled ? (entry.accumulated ?? 0) : 0);
    const pct = effective > 0 ? spent / effective : 0;
    // Score per category: 100 if 0 spend, 0 if 2x over budget, linear scale
    const catScore = Math.max(0, Math.min(100, Math.round((1 - pct) * 100)));
    totalScore += catScore;
  }
  return Math.round(totalScore / budgets.length);
}

function healthScoreColor(score: number): string {
  if (score >= 80) return "var(--ft-green)";
  if (score >= 60) return "var(--ft-amber)";
  return "var(--ft-red)";
}

// ── Heat cell helper — background intensity scales with deviation from budget ─

function heatCellStyle(pct: number): React.CSSProperties {
  const opacity = Math.min(Math.abs(pct) * 0.35, 0.35);
  if (pct >= 1) {
    return { background: `color-mix(in srgb, var(--ft-red) ${Math.round(opacity * 100)}%, transparent)` };
  }
  if (pct >= 0.8) {
    return { background: `color-mix(in srgb, var(--ft-amber) ${Math.round(opacity * 100)}%, transparent)` };
  }
  const greenOpacity = Math.min((1 - pct) * 0.25, 0.25);
  return { background: `color-mix(in srgb, var(--ft-green) ${Math.round(greenOpacity * 100)}%, transparent)` };
}

// ── Shared style constants ────────────────────────────────────────────────────

const INPUT_STYLE: React.CSSProperties = {
  background: "var(--ft-raised)",
  border: "1px solid var(--ft-border2)",
  color: "var(--ft-text)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  height: 28,
  padding: "0 8px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 0,
};

const BTN_ACCENT: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  background: "var(--ft-accent)",
  color: "var(--ft-base)",
  border: "none",
  padding: "6px 16px",
  cursor: "pointer",
  borderRadius: 0,
};

const BTN_GHOST: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  background: "transparent",
  color: "var(--ft-muted)",
  border: "1px solid var(--ft-border2)",
  padding: "6px 12px",
  cursor: "pointer",
  borderRadius: 0,
};

// ── KPI cell sub-component ───────────────────────────────────────────────────

interface BudgetKpiCellProps {
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  extra?: React.ReactNode;
  isPriv?: boolean;
}

function BudgetKpiCell({ label, value, sub, extra, isPriv = false }: BudgetKpiCellProps) {
  const [hov, setHov] = React.useState(false);
  return (
    <div
      style={{
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
        padding: "10px 14px",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.10em", textTransform: "uppercase" as const, marginBottom: 4, fontWeight: 600 }}>
        {label}
      </div>
      {/* clamp() on font-size per docs/MOBILE-CONCEPT.md § Desktop
          port: primary tier scales with column width. Prevents a
          6-digit figure from pushing the cell wider than its
          neighbours on a narrow desktop. */}
      <div
        className={isPriv ? "pnum" : undefined}
        style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(14px, 1.4vw, 18px)", fontWeight: 700, color: "var(--ft-text)", lineHeight: 1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
      >
        {value}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
        {sub}
      </div>
      {extra}
    </div>
  );
}

// ── Health summary chip sub-component ────────────────────────────────────────

interface HealthSummaryChipProps {
  category: string;
  spent: number;
  effectiveLimit: number;
  pct: number;
  health: HealthInfo;
  isOver: boolean;
  title: string;
}

function HealthSummaryChip({ category, spent: _spent, effectiveLimit: _eff, pct, health, isOver, title }: HealthSummaryChipProps) {
  const [hov, setHov] = React.useState(false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px 4px 6px",
        border: `1px solid ${isOver ? "var(--ft-red)" : "var(--ft-border2)"}`,
        background: hov
          ? isOver
            ? "color-mix(in srgb, var(--ft-red) 10%, var(--ft-raised))"
            : "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-raised))"
          : isOver
          ? "color-mix(in srgb, var(--ft-red) 5%, var(--ft-raised))"
          : "var(--ft-raised)",
        transition: "background 0.1s",
        cursor: "default",
      }}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ width: 6, height: 6, background: health.color, borderRadius: 0, flexShrink: 0 }} />
      <Text as="span" mono size={10} weight={isOver ? 700 : 400} color={isOver ? "var(--ft-red)" : "var(--ft-text)"} nowrap>
        {category}
      </Text>
      <div style={{ width: 32, height: 3, background: "var(--ft-border)", borderRadius: 0, overflow: "hidden", flexShrink: 0 }}>
        <div style={{ height: "100%", width: `${Math.min(pct * 100, 100)}%`, background: health.color, borderRadius: 0 }} />
      </div>
      <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: health.color, fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" as const }}>
        {Math.round(pct * 100)}%
      </span>
    </div>
  );
}

// ── Forecast at-risk row sub-component ───────────────────────────────────────

interface ForecastAtRiskRowProps {
  category: string;
  effectiveLimit: number;
  projectedSpend: number;
  projectedOverspend: number;
}

function ForecastAtRiskRow({ category, effectiveLimit, projectedSpend, projectedOverspend }: ForecastAtRiskRowProps) {
  const [hov, setHov] = React.useState(false);
  const barPct = Math.min((effectiveLimit / projectedSpend) * 100, 100);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 4%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
        borderRadius: 0,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span style={{ minWidth: 110, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, fontSize: 11 }}>
        {category}
      </span>
      <div style={{ flex: 1, height: 3, background: "var(--ft-border)", borderRadius: 0, overflow: "hidden", position: "relative" as const }}>
        <div style={{ position: "absolute" as const, height: "100%", width: `${barPct}%`, background: "var(--ft-amber)", borderRadius: 0 }} />
      </div>
      <span className="pnum" style={{ color: "var(--ft-dim)", minWidth: 65, fontSize: 9, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{formatBaseMoney(effectiveLimit)} limit</span>
      <span className="pnum" style={{ color: "var(--ft-amber)", fontSize: 9, fontWeight: 700, minWidth: 70, textTransform: "uppercase" as const, letterSpacing: "0.04em", flexShrink: 0 }}>→ {formatBaseMoney(projectedSpend)}</span>
      <span className="pnum" style={{ color: "var(--ft-red)", fontWeight: 700, minWidth: 72, textAlign: "right" as const, fontSize: 10, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>+{formatBaseMoney(projectedOverspend)}</span>
    </div>
  );
}

// ── Unbudgeted category button sub-component ──────────────────────────────────

interface UnbudgetedCategoryBtnProps {
  displayCat: string;
  amount: number;
  onClick: () => void;
}

function UnbudgetedCategoryBtn({ displayCat, amount, onClick }: UnbudgetedCategoryBtnProps) {
  const [hov, setHov] = React.useState(false);
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        padding: "3px 8px",
        border: `1px solid ${hov ? "var(--ft-amber)" : "var(--ft-border2)"}`,
        background: hov ? "color-mix(in srgb, var(--ft-amber) 6%, var(--ft-raised))" : "var(--ft-raised)",
        color: hov ? "var(--ft-text)" : "var(--ft-muted)",
        cursor: "pointer",
        display: "flex",
        gap: 6,
        alignItems: "center",
        borderRadius: 0,
        transition: "border-color 0.1s, background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span>{displayCat}</span>
      <span className="pnum" style={{ color: "var(--ft-amber)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        {formatBaseMoney(amount)}
      </span>
    </button>
  );
}

// ── Copy candidate checkbox row ───────────────────────────────────────────────

interface CopyCandidateRowProps {
  candidate: { category: string; total: number; confirmed: boolean };
  index: number;
  onChange: (index: number, checked: boolean) => void;
}

function CopyCandidateRow({ candidate: c, index, onChange }: CopyCandidateRowProps) {
  const [hov, setHov] = React.useState(false);
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        color: c.confirmed ? "var(--ft-text)" : "var(--ft-dim)",
        padding: "3px 6px",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <input
        type="checkbox"
        checked={c.confirmed}
        onChange={(e) => onChange(index, e.target.checked)}
        style={{ accentColor: "var(--ft-accent)", width: 12, height: 12 }}
      />
      <span style={{ flex: 1 }}>{c.category}</span>
      <span className="pnum" style={{ fontWeight: 700, color: "var(--ft-accent)", minWidth: 80, textAlign: "right" as const, fontVariantNumeric: "tabular-nums" }}>
        {formatBaseMoney(Math.ceil(c.total))}
      </span>
    </label>
  );
}

// ── Panel header helper ───────────────────────────────────────────────────────

function PanelHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "var(--ft-panel-header-h)",
        padding: "0 14px",
        background: "var(--ft-raised)",
        borderBottom: "1px solid var(--ft-border)",
        gap: 8,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase" as const,
          color: "var(--ft-muted)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Text as="span" color="var(--ft-accent)">·</Text>
        {title}
      </div>
      {right && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {right}
        </div>
      )}
    </div>
  );
}

const BUDGET_AI_CACHE_KEY = "ft-budget-ai-insight";

// ── AiBudgetInsight component ─────────────────────────────────────────────────
// Server reads budgets + this-month spend by category via
// buildChatContext(userId, "/budget"). This component sends only the
// prompt — the local budget-vs-spend arithmetic below is used for
// local UI rendering (bar chart, chips), NEVER for prompt assembly.

interface AiBudgetInsightProps {
  budgets: Budget[];
  spentByCategory: Record<string, number>;
  totalBudgeted: number;
  totalSpent: number;
  overBudgetCount: number;
}

function AiBudgetInsight(_props: AiBudgetInsightProps) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  async function fetchInsight(force = false) {
    if (!force) {
      const cached = sessionStorage.getItem(BUDGET_AI_CACHE_KEY);
      if (cached) {
        setInsight(cached);
        setLoading(false);
        return;
      }
    }
    setLoading(true);
    try {
      const result = await oneShotInsight({
        path: "/budget",
        prompt: "In 2-3 sentences, analyze my budget adherence this month and give me the most important action to take.",
      });
      sessionStorage.setItem(BUDGET_AI_CACHE_KEY, result.text);
      setInsight(result.text);
    } catch {
      setInsight(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const timer = setTimeout(() => fetchInsight(), 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loading && insight === null) return null;

  return (
    <div
      style={{
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        borderLeft: "3px solid var(--ft-amber)",
      }}
    >
      <PanelHeader
        title="AI Analysis"
        right={
          !loading ? (
            <button
              onClick={() => {
                sessionStorage.removeItem(BUDGET_AI_CACHE_KEY);
                fetchedRef.current = false;
                fetchInsight(true);
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--ft-dim)",
                padding: 2,
                display: "flex",
                alignItems: "center",
                transition: "color 0.1s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ft-amber)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ft-dim)"; }}
              title="Refresh AI insight"
            >
              <RefreshCw size={11} />
            </button>
          ) : undefined
        }
      />
      <div style={{ padding: "10px 14px" }}>
        {loading ? (
          <div
            style={{
              height: 10,
              background: "var(--ft-border)",
              opacity: 0.7,
            }}
          />
        ) : (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ft-muted)",
              lineHeight: 1.6,
            }}
          >
            {insight}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Custom recharts tooltip ───────────────────────────────────────────────────

function BudgetTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; fill: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        background: "var(--ft-raised)",
        border: "1px solid var(--ft-border2)",
        padding: "8px 12px",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        borderRadius: 0,
      }}
    >
      <div
        style={{
          color: "var(--ft-accent)",
          fontWeight: 700,
          marginBottom: 4,
          textTransform: "uppercase" as const,
          letterSpacing: "0.05em",
          fontSize: 9,
        }}
      >
        {label}
      </div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.fill, marginBottom: 2 }}>
          {p.name}: <span className="pnum">{formatBaseMoney(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

// ── Budget table row sub-component ───────────────────────────────────────────

interface BudgetTableRowProps {
  budget: Budget;
  rowIdx: number;
  spent: number;
  lastSpent: number;
  rolloverEnabled: boolean;
  rolloverAccumulated: number;
  effectiveLimit: number;
  pct: number;
  rem: number;
  isOver: boolean;
  isEditing: boolean;
  editingLimit: string;
  deleteConfirmId: number | null;
  isCurrentMonth: boolean;
  dayOfMonth: number | null;
  daysInMonth: number;
  isMobile?: boolean;
  onEditLimitChange: (val: string) => void;
  onStartEdit: (category: string, currentLimit: number) => void;
  onCommitEdit: (category: string) => void;
  onCancelEdit: () => void;
  onToggleRollover: (category: string) => void;
  onResetRollover: (category: string) => void;
  onDeleteClick: (id: number) => void;
}

function BudgetTableRow({
  budget, rowIdx, spent, lastSpent, rolloverEnabled, rolloverAccumulated,
  effectiveLimit, pct, rem, isOver, isEditing, editingLimit,
  deleteConfirmId, isCurrentMonth, dayOfMonth, daysInMonth, isMobile = false,
  onEditLimitChange, onStartEdit, onCommitEdit, onCancelEdit,
  onToggleRollover, onResetRollover, onDeleteClick,
}: BudgetTableRowProps) {
  const fillColor = progressFill(pct);
  const delta = spent - lastSpent;
  const health = getBudgetHealth(pct, spent);

  if (isMobile) {
    const rowBgM = isOver
      ? "color-mix(in srgb, var(--ft-red) 5%, var(--ft-surface))"
      : "var(--ft-surface)";
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: 0,
          background: rowBgM,
          borderBottom: "1px solid var(--ft-border2)",
          borderLeft: isOver ? "3px solid var(--ft-red)" : `3px solid ${fillColor}`,
          padding: "9px 10px 9px 12px",
        }}
        onTouchStart={e => { (e.currentTarget as HTMLDivElement).style.background = isOver ? "color-mix(in srgb, var(--ft-red) 10%, var(--ft-surface))" : "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"; }}
        onTouchEnd={e => { (e.currentTarget as HTMLDivElement).style.background = rowBgM; }}
        onTouchCancel={e => { (e.currentTarget as HTMLDivElement).style.background = rowBgM; }}
      >
        {/* Left: category + bar + spent/limit */}
        <div style={{ minWidth: 0 }}>
          <HStack gap={6} align="center" marginBottom={5}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: isOver ? "var(--ft-red)" : "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {budget.category}
            </span>
            {health.status !== "empty" && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.06em", color: health.color, background: health.bg, border: `1px solid ${health.color}`, padding: "1px 4px", whiteSpace: "nowrap", flexShrink: 0, lineHeight: 1.4 }}>
                {health.label}
              </span>
            )}
          </HStack>
          {/* Progress bar */}
          <div style={{ height: 4, background: "var(--ft-border)", overflow: "hidden", marginBottom: 5 }}>
            <div style={{ height: "100%", width: `${Math.min(pct * 100, 100)}%`, background: isOver ? "var(--ft-red)" : fillColor, transition: "width 0.1s ease" }} />
          </div>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", display: "flex", gap: 6, alignItems: "baseline" }}>
            <Text as="span" size={12} weight={700} color={isOver ? "var(--ft-red)" : "var(--ft-text)"}>{formatBaseMoney(spent)}</Text>
            <span>/ {formatBaseMoney(effectiveLimit)}</span>
            {rolloverEnabled && rolloverAccumulated > 0 && (
              <Text as="span" size={9} color="var(--ft-cyan)">↻+{formatBaseMoney(rolloverAccumulated)}</Text>
            )}
          </div>
        </div>
        {/* Right: % used + remaining + edit */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, paddingLeft: 10, flexShrink: 0 }}>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: isOver ? "var(--ft-red)" : fillColor }}>
            {Math.round(pct * 100)}%
          </div>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: isOver ? "var(--ft-red)" : "var(--ft-green)", fontWeight: 600 }}>
            {isOver ? `+${formatBaseMoney(Math.abs(rem))}` : formatBaseMoney(rem)} {isOver ? "over" : "left"}
          </div>
          <button
            onClick={() => onStartEdit(budget.category, budget.limit)}
            style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", background: "none", border: "1px solid var(--ft-border2)", padding: "2px 6px", cursor: "pointer" }}
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  let paceLabel: string | null = null;
  let paceColor = "var(--ft-dim)";
  if (isCurrentMonth && dayOfMonth && daysInMonth && effectiveLimit > 0 && spent > 0) {
    const expectedPct = dayOfMonth / daysInMonth;
    const actualPct = spent / effectiveLimit;
    if (actualPct > expectedPct * 1.15) { paceLabel = "HOT"; paceColor = "var(--ft-amber)"; }
    else if (actualPct < expectedPct * 0.75) { paceLabel = "UNDER"; paceColor = "var(--ft-green)"; }
    else { paceLabel = "ON PACE"; paceColor = "var(--ft-dim)"; }
  }

  const rowBg = isOver
    ? "color-mix(in srgb, var(--ft-red) 5%, var(--ft-surface))"
    : rowIdx % 2 === 1
    ? "color-mix(in srgb, var(--ft-raised) 40%, transparent)"
    : "var(--ft-surface)";

  return (
    <div
      className="xls-row"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 100px 120px 70px 80px 90px 100px 120px 80px",
        background: rowBg,
        borderBottom: isOver ? "1px solid color-mix(in srgb, var(--ft-red) 25%, var(--ft-border2))" : "1px solid var(--ft-border2)",
        borderLeft: isOver ? "3px solid var(--ft-red)" : `2px solid ${fillColor}`,
        minWidth: 800,
        alignItems: "center",
        transition: "background 0.12s ease",
        outline: isOver ? "1px solid color-mix(in srgb, var(--ft-red) 15%, transparent)" : "none",
        outlineOffset: -1,
      }}
      onMouseEnter={(e) => {
        if (isOver) {
          e.currentTarget.style.background = "color-mix(in srgb, var(--ft-red) 9%, var(--ft-surface))";
        } else {
          e.currentTarget.style.background = "color-mix(in srgb, var(--ft-raised) 70%, transparent)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = rowBg;
      }}
    >
      {/* Category */}
      <div style={{ padding: "6px 0 6px 12px" }}>
        <HStack gap={6} align="center" minWidth0>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 600,
              color: isOver ? "var(--ft-red)" : "var(--ft-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap" as const,
              minWidth: 0,
            }}
          >
            {budget.category}
          </div>
          {health.status !== "empty" && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 7,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: health.color,
                background: health.bg,
                border: `1px solid ${health.color}`,
                padding: "1px 4px",
                whiteSpace: "nowrap" as const,
                flexShrink: 0,
                lineHeight: 1.4,
                opacity: health.status === "on-track" ? 0.7 : 1,
              }}
            >
              {health.label}
            </span>
          )}
        </HStack>
        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
          {rolloverEnabled && rolloverAccumulated > 0 && (
            <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-cyan)", letterSpacing: "0.04em" }}>
              ↻ +{formatBaseMoney(rolloverAccumulated)}
            </span>
          )}
          {paceLabel && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: paceColor, letterSpacing: "0.08em", textTransform: "uppercase" as const, fontWeight: 600 }}>
              {paceLabel}
            </span>
          )}
          {isOver && (
            <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-red)", fontWeight: 700, letterSpacing: "0.04em" }}>
              +{formatBaseMoney(Math.abs(rem))} over
            </span>
          )}
        </div>
      </div>

      {/* Limit (inline edit) */}
      <div style={{ padding: "6px 14px 6px 0", textAlign: "right" as const }}>
        {isEditing ? (
          <input
            type="number"
            value={editingLimit}
            onChange={(e) => onEditLimitChange(e.target.value)}
            onBlur={() => onCommitEdit(budget.category)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitEdit(budget.category);
              if (e.key === "Escape") onCancelEdit();
            }}
            autoFocus
            className="ft-filter-input"
            style={{ ...INPUT_STYLE, height: 22, width: "100%", fontSize: 11 }}
          />
        ) : (
          <button
            title="Click to edit limit"
            onClick={() => onStartEdit(budget.category, budget.limit)}
            className="pnum"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--ft-muted)",
              padding: 0,
              textAlign: "right" as const,
              width: "100%",
              display: "block",
              fontVariantNumeric: "tabular-nums",
              transition: "color 0.1s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ft-accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ft-muted)"; }}
          >
            {rolloverEnabled ? formatBaseMoney(effectiveLimit) : formatBaseMoney(budget.limit)}
          </button>
        )}
      </div>

      {/* Spent — heat cell */}
      <div
        className="pnum"
        style={{
          padding: "6px 14px 6px 0",
          textAlign: "right" as const,
          fontVariantNumeric: "tabular-nums",
          ...heatCellStyle(pct),
        }}
      >
        <Text as="div" mono size={13} weight={700} color={isOver ? "var(--ft-red)" : "var(--ft-text)"}>
          {formatBaseMoney(spent)}
        </Text>
        <Text as="div" mono size={11} color="var(--ft-dim)">
          / {rolloverEnabled ? formatBaseMoney(effectiveLimit) : formatBaseMoney(budget.limit)}
        </Text>
      </div>

      {/* vs Last Month delta */}
      <div
        className="pnum"
        style={{
          padding: "6px 14px 6px 0",
          textAlign: "right" as const,
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          color: lastSpent === 0
            ? "var(--ft-dim)"
            : delta > 0
            ? "var(--ft-red)"
            : delta < 0
            ? "var(--ft-green)"
            : "var(--ft-dim)",
        }}
        title={lastSpent > 0 ? `Last month: ${formatBaseMoney(lastSpent)}` : "No data for last month"}
      >
        {lastSpent === 0 ? "—" : delta === 0 ? "=" : `${delta > 0 ? "+" : ""}${formatBaseMoney(delta)}`}
      </div>

      {/* Inline progress bar */}
      <div style={{ padding: "6px 8px" }}>
        {isOver ? (
          <div>
            <div
              style={{
                width: 72,
                height: 5,
                background: "color-mix(in srgb, var(--ft-red) 20%, var(--ft-border))",
                borderRadius: 0,
                overflow: "hidden",
                position: "relative" as const,
              }}
            >
              <div style={{ height: "100%", width: "100%", background: "var(--ft-red)", borderRadius: 0 }} />
              {[25, 50, 75].map((pos) => (
                <div
                  key={pos}
                  style={{
                    position: "absolute" as const,
                    top: 0,
                    left: `${pos}%`,
                    width: 1,
                    height: "100%",
                    background: "color-mix(in srgb, var(--ft-base) 20%, transparent)",
                  }}
                />
              ))}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-red)", marginTop: 2, letterSpacing: "0.06em", fontWeight: 700 }}>
              OVER {Math.round((pct - 1) * 100)}%
            </div>
          </div>
        ) : (
          <div>
            <div style={{ width: 72, height: 5, background: "var(--ft-border)", borderRadius: 0, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(pct * 100, 100)}%`,
                  background: fillColor,
                  borderRadius: 0,
                  transition: "width 0.1s ease",
                }}
              />
            </div>
            {pct >= 0.8 && !isOver && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-amber)", marginTop: 2, letterSpacing: "0.04em" }}>
                {Math.round(pct * 100)}% used
              </div>
            )}
          </div>
        )}
      </div>

      {/* % Used — heat cell */}
      <div
        className="pnum"
        style={{
          padding: "6px 14px 6px 0",
          textAlign: "right" as const,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 700,
          color: isOver ? "var(--ft-red)" : fillColor,
          fontVariantNumeric: "tabular-nums",
          ...heatCellStyle(pct),
        }}
      >
        {Math.round(pct * 100)}%
      </div>

      {/* Remaining */}
      <div
        className="pnum"
        style={{
          padding: "6px 14px 6px 0",
          textAlign: "right" as const,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: isOver ? "var(--ft-red)" : "var(--ft-green)",
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {isOver ? (
          <Text as="span" mono size={9} weight={700} color="var(--ft-red)" letterSpacing="0.04em">
            OVER {formatBaseMoney(Math.abs(rem))}
          </Text>
        ) : formatBaseMoney(rem)}
      </div>

      {/* Rollover controls */}
      <VStack gap={3} padding="6px 8px">
        <button
          onClick={() => onToggleRollover(budget.category)}
          title={rolloverEnabled ? "Disable rollover" : "Enable rollover — unused budget carries to next month"}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.04em",
            padding: "3px 6px",
            border: `1px solid ${rolloverEnabled ? "var(--ft-cyan)" : "var(--ft-border2)"}`,
            background: rolloverEnabled ? "color-mix(in srgb, var(--ft-cyan) 12%, transparent)" : "transparent",
            color: rolloverEnabled ? "var(--ft-cyan)" : "var(--ft-dim)",
            cursor: "pointer",
            whiteSpace: "nowrap" as const,
            borderRadius: 0,
          }}
        >
          ↻ {rolloverEnabled ? "On" : "Rollover"}
        </button>
        {rolloverEnabled && rolloverAccumulated > 0 && (
          <button
            onClick={() => onResetRollover(budget.category)}
            title="Reset accumulated rollover to zero"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              letterSpacing: "0.04em",
              padding: "2px 6px",
              border: "1px solid var(--ft-border2)",
              background: "transparent",
              color: "var(--ft-dim)",
              cursor: "pointer",
              whiteSpace: "nowrap" as const,
              borderRadius: 0,
              transition: "color 0.1s, border-color 0.1s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--ft-red)";
              e.currentTarget.style.borderColor = "var(--ft-red)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--ft-dim)";
              e.currentTarget.style.borderColor = "var(--ft-border2)";
            }}
          >
            Reset
          </button>
        )}
      </VStack>

      {/* Delete */}
      <HStack justify="end" padding="6px 10px">
        <button
          onClick={() => onDeleteClick(budget.id)}
          style={{
            background: deleteConfirmId === budget.id ? "var(--ft-red)" : "none",
            border: "none",
            color: deleteConfirmId === budget.id ? "var(--ft-base)" : "var(--ft-dim)",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: deleteConfirmId === budget.id ? 8 : 14,
            fontWeight: deleteConfirmId === budget.id ? 700 : undefined,
            lineHeight: 1,
            padding: deleteConfirmId === budget.id ? "3px 6px" : 4,
            borderRadius: 0,
          }}
          title={deleteConfirmId === budget.id ? "Click again to confirm delete" : `Delete ${budget.category} budget`}
          aria-label={`Delete ${budget.category} budget`}
        >
          {deleteConfirmId === budget.id ? "DEL?" : "×"}
        </button>
      </HStack>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Budget() {
  const now = new Date();
  const isMobile = useIsMobile();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  // budgets from API
  const { data: rawBudgets = [], isLoading: budgetsLoading, isError: budgetsError, error: budgetsErrorObj } = useListBudgets();
  const budgets: Budget[] = rawBudgets.map(b => ({ id: b.id, category: b.category, limit: b.monthlyLimit }));
  const createBudget = useCreateBudget();
  const updateBudget = useUpdateBudget();
  const deleteBudget = useDeleteBudget();
  const queryClient = useQueryClient();

  // add/edit form
  const [formCategory, setFormCategory] = useState("");
  const [formLimit, setFormLimit] = useState("");
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingLimit, setEditingLimit] = useState("");

  // zero-based budgeting toggle
  const [zbEnabled, setZbEnabled] = useState(false);

  // copy-last-month panel
  const [showCopyPanel, setShowCopyPanel] = useState(false);
  const [copyCandidates, setCopyCandidates] = useState<CopyCandidate[]>([]);

  // ── Rollover state ───────────────────────────────────────────────────────────

  const [rolloverMap, setRolloverMapState] = useState<RolloverMap>(() => loadRolloverMap());
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Persist rollover map whenever it changes
  const setRolloverMap = useCallback((updater: (prev: RolloverMap) => RolloverMap) => {
    setRolloverMapState(prev => {
      const next = updater(prev);
      saveRolloverMap(next);
      return next;
    });
  }, []);

  // ── Date strings for API calls ──────────────────────────────────────────────

  const dateFrom = useMemo(
    () => getFirstOfMonth(selectedYear, selectedMonth),
    [selectedYear, selectedMonth]
  );

  const lastMonthYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
  const lastMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
  const lastMonthFrom = useMemo(
    () => getFirstOfMonth(lastMonthYear, lastMonth),
    [lastMonthYear, lastMonth]
  );
  const lastMonthTo = useMemo(
    () => getLastOfMonth(lastMonthYear, lastMonth),
    [lastMonthYear, lastMonth]
  );

  // ── Hooks ───────────────────────────────────────────────────────────────────

  const { data: expenseTxs } = useListTransactions({
    type: "expense",
    dateFrom,
  });

  const { data: lastMonthTxs } = useListTransactions({
    type: "expense",
    dateFrom: lastMonthFrom,
    dateTo: lastMonthTo,
  });

  const { data: allTxs } = useListTransactions({});

  const { data: dashboard } = useGetDashboard();

  // ── Month-rollover accumulation logic ────────────────────────────────────────

  const spentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    if (!expenseTxs) return map;
    expenseTxs.forEach((tx: Transaction) => {
      const key = tx.category.toLowerCase();
      map[key] = (map[key] ?? 0) + (tx.gbpValue ?? 0);
    });
    return map;
  }, [expenseTxs]);

  const lastMonthSpentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    if (!lastMonthTxs) return map;
    lastMonthTxs.forEach((tx: Transaction) => {
      const key = tx.category.toLowerCase();
      map[key] = (map[key] ?? 0) + (tx.gbpValue ?? 0);
    });
    return map;
  }, [lastMonthTxs]);

  useEffect(() => {
    const isCurrentMonthView =
      selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1;
    if (!isCurrentMonthView) return;
    if (budgets.length === 0) return;
    if (!lastMonthTxs) return;

    const thisMonth = currentMonthStr();
    const storedMonth = localStorage.getItem(ROLLOVER_MONTH_KEY);
    if (storedMonth === thisMonth) return;

    setRolloverMap(prev => {
      const next = { ...prev };
      for (const budget of budgets) {
        const entry = next[budget.category];
        if (!entry?.enabled) continue;
        const spent = lastMonthSpentByCategory[budget.category.toLowerCase()] ?? 0;
        const unused = Math.max(budget.limit - spent, 0);
        next[budget.category] = {
          ...entry,
          accumulated: (entry.accumulated ?? 0) + unused,
        };
      }
      return next;
    });

    localStorage.setItem(ROLLOVER_MONTH_KEY, thisMonth);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgets.length, selectedYear, selectedMonth, lastMonthSpentByCategory]);

  // ── Rollover helpers ─────────────────────────────────────────────────────────

  function toggleRollover(category: string) {
    setRolloverMap(prev => {
      const entry = prev[category];
      return {
        ...prev,
        [category]: {
          enabled: !entry?.enabled,
          accumulated: entry?.accumulated ?? 0,
        },
      };
    });
  }

  function resetRollover(category: string) {
    setRolloverMap(prev => ({
      ...prev,
      [category]: {
        enabled: prev[category]?.enabled ?? false,
        accumulated: 0,
      },
    }));
  }

  // ── Category suggestions ─────────────────────────────────────────────────────

  const categorySuggestions = useMemo(() => {
    if (!allTxs) return [];
    const cats = new Set<string>();
    allTxs.forEach((tx: Transaction) => {
      if (tx.type === "expense") cats.add(tx.category);
    });
    return Array.from(cats).sort();
  }, [allTxs]);

  // ── Total spent ──────────────────────────────────────────────────────────────

  const totalSpent = useMemo(
    () => expenseTxs?.reduce((s: number, tx: Transaction) => s + (tx.gbpValue ?? 0), 0) ?? 0,
    [expenseTxs]
  );

  // ── Summary values ───────────────────────────────────────────────────────────

  const totalBudgeted = useMemo(
    () => budgets.reduce((s, b) => {
      const entry = rolloverMap[b.category];
      const effective = b.limit + (entry?.enabled ? (entry.accumulated ?? 0) : 0);
      return s + effective;
    }, 0),
    [budgets, rolloverMap]
  );

  const overBudgetCount = useMemo(
    () =>
      budgets.filter((b) => {
        const spent = spentByCategory[b.category.toLowerCase()] ?? 0;
        const entry = rolloverMap[b.category];
        const effective = b.limit + (entry?.enabled ? (entry.accumulated ?? 0) : 0);
        return spent >= effective;
      }).length,
    [budgets, spentByCategory, rolloverMap]
  );

  const overallPct = totalBudgeted > 0 ? totalSpent / totalBudgeted : 0;
  const remaining = totalBudgeted - totalSpent;

  const healthScore = useMemo(
    () => computeOverallHealthScore(budgets, spentByCategory, rolloverMap),
    [budgets, spentByCategory, rolloverMap]
  );

  // ── Monthly income (for zero-based) ─────────────────────────────────────────

  const monthlyIncome = dashboard?.thisMonth?.income ?? 0;
  const zbRemaining = monthlyIncome - totalBudgeted;

  // ── Days remaining in period ─────────────────────────────────────────────────

  const isCurrentMonth =
    selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1;
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const dayOfMonth = isCurrentMonth ? now.getDate() : null;
  const daysLeft = isCurrentMonth ? daysInMonth - now.getDate() : null;

  // ── Sort budgets by % used descending ───────────────────────────────────────

  const sortedBudgets = useMemo(
    () =>
      [...budgets].sort((a, b) => {
        const entryA = rolloverMap[a.category];
        const effectiveA = a.limit + (entryA?.enabled ? (entryA.accumulated ?? 0) : 0);
        const pA = (spentByCategory[a.category.toLowerCase()] ?? 0) / (effectiveA || 1);

        const entryB = rolloverMap[b.category];
        const effectiveB = b.limit + (entryB?.enabled ? (entryB.accumulated ?? 0) : 0);
        const pB = (spentByCategory[b.category.toLowerCase()] ?? 0) / (effectiveB || 1);

        return pB - pA;
      }),
    [budgets, spentByCategory, rolloverMap]
  );

  // ── Chart data ───────────────────────────────────────────────────────────────

  const chartData = useMemo(
    () =>
      sortedBudgets.map((b) => {
        const spent = spentByCategory[b.category.toLowerCase()] ?? 0;
        const entry = rolloverMap[b.category];
        const effective = b.limit + (entry?.enabled ? (entry.accumulated ?? 0) : 0);
        return { category: b.category, Budget: effective, Actual: spent };
      }),
    [sortedBudgets, spentByCategory, rolloverMap]
  );

  // ── Forecast ─────────────────────────────────────────────────────────────────

  const forecastData = useMemo(() => {
    if (!isCurrentMonth || !dayOfMonth || dayOfMonth < 3) return null;
    const results = sortedBudgets
      .filter((b) => (spentByCategory[b.category.toLowerCase()] ?? 0) > 0)
      .map((b) => {
        const spent = spentByCategory[b.category.toLowerCase()] ?? 0;
        const rolloverEntry = rolloverMap[b.category];
        const effectiveLimit = b.limit + (rolloverEntry?.enabled ? (rolloverEntry.accumulated ?? 0) : 0);
        const projectedSpend = Math.round((spent / dayOfMonth) * daysInMonth);
        const projectedOverspend = projectedSpend - effectiveLimit;
        const onTrack = projectedSpend <= effectiveLimit;
        return { category: b.category, spent, effectiveLimit, projectedSpend, projectedOverspend, onTrack };
      });
    return results.length > 0 ? results : null;
  }, [isCurrentMonth, dayOfMonth, daysInMonth, sortedBudgets, spentByCategory, rolloverMap]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleAddBudget() {
    const trimmed = formCategory.trim();
    const limit = parseFloat(formLimit);
    if (!trimmed || isNaN(limit) || limit <= 0) return;
    if (budgets.some((b) => b.category.toLowerCase() === trimmed.toLowerCase())) return;
    await createBudget.mutateAsync({ data: { category: trimmed, monthlyLimit: limit } });
    queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
    setFormCategory("");
    setFormLimit("");
  }

  async function handleDeleteBudget(id: number) {
    await deleteBudget.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
  }

  function startEdit(category: string, currentLimit: number) {
    setEditingCategory(category);
    setEditingLimit(String(currentLimit));
  }

  async function commitEdit(category: string) {
    const newLimit = parseFloat(editingLimit);
    const budget = budgets.find(b => b.category === category);
    if (!isNaN(newLimit) && newLimit > 0 && budget) {
      await updateBudget.mutateAsync({ id: budget.id, data: { monthlyLimit: newLimit } });
      queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
    }
    setEditingCategory(null);
    setEditingLimit("");
  }

  // ── Copy last month ──────────────────────────────────────────────────────────

  const buildCopyCandidates = useCallback(() => {
    if (!lastMonthTxs) return;
    const map: Record<string, number> = {};
    lastMonthTxs.forEach((tx: Transaction) => {
      if (!tx.date.startsWith(`${lastMonthYear}-${String(lastMonth).padStart(2, "0")}`)) return;
      const key = tx.category;
      map[key] = (map[key] ?? 0) + (tx.gbpValue ?? 0);
    });
    const candidates: CopyCandidate[] = Object.entries(map)
      .filter(([, total]) => total > 0)
      .map(([category, total]) => ({ category, total, confirmed: true }));
    setCopyCandidates(candidates);
    setShowCopyPanel(true);
  }, [lastMonthTxs, lastMonthYear, lastMonth]);

  async function applyLastMonthActuals() {
    const toAdd = copyCandidates.filter((c) => c.confirmed);
    for (const c of toAdd) {
      const existing = budgets.find(b => b.category.toLowerCase() === c.category.toLowerCase());
      const limit = Math.ceil(c.total);
      if (existing) {
        await updateBudget.mutateAsync({ id: existing.id, data: { monthlyLimit: limit } });
      } else {
        await createBudget.mutateAsync({ data: { category: c.category, monthlyLimit: limit } });
      }
    }
    queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
    setShowCopyPanel(false);
    setCopyCandidates([]);
  }

  // ── Month navigation ─────────────────────────────────────────────────────────

  const MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  function prevMonth() {
    if (selectedMonth === 1) {
      setSelectedYear((y) => y - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (selectedMonth === 12) {
      setSelectedYear((y) => y + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Loading / Error guards
  // ─────────────────────────────────────────────────────────────────────────────

  if (budgetsLoading) {
    return (
      <VStack gap={0}>
        {/* KPI bar skeleton */}
        <div className="ft-kpi-bar" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ padding: "10px 14px", borderRight: "1px solid var(--ft-border)" }}>
              <FtSkeleton width="60%" height={9} />
              <div style={{ marginTop: 6 }}><FtSkeleton width="80%" height={18} /></div>
            </div>
          ))}
        </div>
        {/* Budget rows skeleton */}
        <div style={{ border: "1px solid var(--ft-border)", marginTop: 12 }}>
          <div style={{ height: "var(--ft-panel-header-h)", background: "var(--ft-raised)", borderBottom: "1px solid var(--ft-border)", padding: "0 14px", display: "flex", alignItems: "center" }}>
            <FtSkeleton width={160} height={10} />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            isMobile ? (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", padding: "10px 12px", gap: 8, alignItems: "center", borderBottom: "1px solid var(--ft-border)" }}>
                <VStack gap={5}>
                  <FtSkeleton width="55%" height={12} />
                  <FtSkeleton width="100%" height={4} />
                  <FtSkeleton width="45%" height={11} />
                </VStack>
                <VStack gap={4} align="end">
                  <FtSkeleton width={36} height={14} />
                  <FtSkeleton width={60} height={10} />
                </VStack>
              </div>
            ) : (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 100px 80px 80px 100px 80px", padding: "var(--ft-cell-py) 14px", gap: 8, alignItems: "center", borderBottom: "1px solid var(--ft-border)" }}>
                <FtSkeleton width="70%" height={12} />
                <FtSkeleton width={70} height={12} />
                <FtSkeleton width={90} height={12} />
                <FtSkeleton width={80} height={12} />
                <FtSkeleton width="90%" height={4} />
                <FtSkeleton width={40} height={11} />
                <FtSkeleton width={60} height={11} />
                <FtSkeleton width={20} height={14} />
              </div>
            )
          ))}
        </div>
      </VStack>
    );
  }

  if (budgetsError) {
    return (
      <ErrorState message={(budgetsErrorObj as Error)?.message ?? "Could not load budget data. Check your connection and try again."} />
    );
  }

  // ── First-time / empty state ──────────────────────────────────────────────────
  if (sortedBudgets.length === 0 && !showCopyPanel) {
    const QUICK_CATEGORIES = ["Groceries", "Transport", "Eating Out", "Entertainment", "Utilities", "Health", "Clothing", "Subscriptions"];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Terminal-style empty state */}
        <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
          <PanelHeader
            title="Budget Monitor"
            right={
              <MonoLabel as="span" size={8} letterSpacing="0.10em">
                NO CATEGORIES DEFINED
              </MonoLabel>
            }
          />
          <div style={{ padding: "32px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            {/* ASCII preview */}
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--ft-border2)",
                lineHeight: 1.55,
                userSelect: "none" as const,
                marginBottom: 24,
                whiteSpace: "pre" as const,
                textAlign: "left" as const,
                padding: "12px 16px",
                border: "1px solid var(--ft-border)",
                background: "var(--ft-raised)",
              }}
            >
              {"┌──────────────────────────────────────┐\n│  CATEGORY      LIMIT    SPENT   PCT  │\n│  ──────────────────────────────────  │\n│  Groceries     £400     ████░░░ 55%  │\n│  Transport     £150     ████░░░ 60%  │\n│  Eating Out    £200     ██░░░░░ 30%  │\n│  Entertainment £100     ░░░░░░░  0%  │\n│                                      │\n│  Health Score: 85 · 0 over budget    │\n└──────────────────────────────────────┘"}
            </div>

            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 700,
                color: "var(--ft-text)",
                marginBottom: 6,
                textAlign: "center" as const,
                letterSpacing: "0.06em",
                textTransform: "uppercase" as const,
              }}
            >
              Set Your Monthly Limits
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--ft-dim)",
                textAlign: "center" as const,
                marginBottom: 20,
                maxWidth: 400,
                lineHeight: 1.7,
              }}
            >
              Define spending caps per category. Transactions are matched automatically — your health score updates in real time.
            </div>

            {/* Quick category chips */}
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap" as const,
                justifyContent: "center" as const,
                marginBottom: 16,
                maxWidth: 480,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  color: "var(--ft-dim)",
                  width: "100%",
                  textAlign: "center" as const,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase" as const,
                  marginBottom: 4,
                }}
              >
                Quick add →
              </div>
              {QUICK_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFormCategory(cat)}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    padding: "3px 8px",
                    border: formCategory === cat ? "1px solid var(--ft-accent)" : "1px solid var(--ft-border2)",
                    background: formCategory === cat ? "color-mix(in srgb, var(--ft-accent) 10%, var(--ft-raised))" : "var(--ft-raised)",
                    color: formCategory === cat ? "var(--ft-accent)" : "var(--ft-muted)",
                    cursor: "pointer",
                    borderRadius: 0,
                    transition: "all 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (formCategory !== cat) {
                      e.currentTarget.style.borderColor = "var(--ft-accent)";
                      e.currentTarget.style.color = "var(--ft-accent)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (formCategory !== cat) {
                      e.currentTarget.style.borderColor = "var(--ft-border2)";
                      e.currentTarget.style.color = "var(--ft-muted)";
                    }
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Input row */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, justifyContent: "center" as const, width: "100%", maxWidth: 480 }}>
              <input
                list="budget-category-suggestions"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddBudget()}
                placeholder="Category (e.g. Groceries)"
                style={{ ...INPUT_STYLE, flex: 2, minWidth: 180 }}
              />
              <datalist id="budget-category-suggestions">
                {categorySuggestions.map(c => <option key={c} value={c} />)}
              </datalist>
              <input
                type="number" min={1} placeholder="Monthly limit (£)"
                value={formLimit}
                onChange={(e) => setFormLimit(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddBudget()}
                style={{ ...INPUT_STYLE, width: 160 }}
              />
              <button onClick={handleAddBudget} style={BTN_ACCENT}>+ Add</button>
            </div>

            {/* Import shortcut */}
            <div
              style={{
                marginTop: 16,
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--ft-dim)",
                textAlign: "center" as const,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ width: 40, height: 1, background: "var(--ft-border)", display: "inline-block" }} />
              <span>or</span>
              <span style={{ width: 40, height: 1, background: "var(--ft-border)", display: "inline-block" }} />
            </div>
            <button
              onClick={buildCopyCandidates}
              style={{
                ...BTN_GHOST,
                marginTop: 10,
                borderColor: "var(--ft-accent)",
                color: "var(--ft-accent)",
                fontSize: 9,
                letterSpacing: "0.06em",
              }}
            >
              Import Last Month's Categories →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ft-row-gap)" }}>
      {(() => { const ids = loadPersonaIds(); return ids[0] === "budget"; })() && <PersonaQuickStart />}

      {/* ── KPI Bar — border-as-gap grid ── */}
      <div
        className="ft-kpi-bar"
        style={{
          display: "grid",
          gap: 1,
          gridTemplateColumns: "repeat(6, 1fr)",
          border: "1px solid var(--ft-border)",
          background: "var(--ft-border)",
        }}
      >
        {[
          {
            label: "Total Budgeted",
            value: <span style={{ color: "var(--ft-accent)" }}>{formatBaseMoney(totalBudgeted)}</span>,
            rawValue: formatBaseMoney(totalBudgeted),
            sub: `${budgets.length} categories`,
            isPriv: true,
            extra: null,
          },
          {
            label: "Total Spent",
            value: <Text as="span" color={totalSpent > totalBudgeted ? "var(--ft-red)" : "var(--ft-text)"}>{formatBaseMoney(totalSpent)}</Text>,
            rawValue: formatBaseMoney(totalSpent),
            color: totalSpent > totalBudgeted ? "var(--ft-red)" : "var(--ft-text)",
            sub: `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`,
            isPriv: true,
            extra: null,
          },
        ].map((item) => (
          <BudgetKpiCell key={item.label} label={item.label} value={item.value} sub={item.sub} isPriv={item.isPriv} />
        ))}
        <BudgetKpiCell
          label="Remaining"
          value={<span className="pnum" style={{ color: remaining < 0 ? "var(--ft-red)" : "var(--ft-green)" }}>{formatBaseMoney(Math.abs(remaining))}</span>}
          sub={remaining < 0 ? "over budget" : "available"}
          isPriv
        />
        <BudgetKpiCell
          label="% Used"
          value={<Text as="span" color={overallPct >= 1 ? "var(--ft-red)" : overallPct >= 0.8 ? "var(--ft-amber)" : "var(--ft-green)"}>{Math.round(overallPct * 100)}%</Text>}
          sub={overBudgetCount > 0 ? `${overBudgetCount} over limit` : "all within limits"}
          extra={
            <div style={{ marginTop: 5, height: 3, background: "var(--ft-border)", borderRadius: 0, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(overallPct * 100, 100)}%`, background: overallPct >= 1 ? "var(--ft-red)" : overallPct >= 0.8 ? "var(--ft-amber)" : "var(--ft-green)", transition: "width 0.12s ease", borderRadius: 0 }} />
            </div>
          }
        />
        <BudgetKpiCell
          label="Days Left"
          value={<Text as="span" color={daysLeft !== null && daysLeft <= 5 ? "var(--ft-amber)" : "var(--ft-text)"}>{daysLeft !== null ? String(daysLeft) : "—"}</Text>}
          sub={`of ${daysInMonth} in period`}
          extra={daysLeft !== null ? (
            <div style={{ marginTop: 5, height: 3, background: "var(--ft-border)", borderRadius: 0, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round(((daysInMonth - daysLeft) / daysInMonth) * 100)}%`, background: daysLeft <= 5 ? "var(--ft-amber)" : "var(--ft-dim)", transition: "width 0.12s ease", borderRadius: 0 }} />
            </div>
          ) : null}
        />
        <BudgetKpiCell
          label="Health Score"
          value={<span style={{ color: healthScoreColor(healthScore) }}>{healthScore}</span>}
          sub={healthScore >= 80 ? "healthy" : healthScore >= 60 ? "needs attention" : "critical"}
          extra={
            <div style={{ marginTop: 5, height: 3, background: "var(--ft-border)", borderRadius: 0, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${healthScore}%`, background: healthScoreColor(healthScore), transition: "width 0.12s ease", borderRadius: 0 }} />
            </div>
          }
        />
      </div>

      {/* ── Month navigator + controls row ── */}
      <div
        className="ft-filter-bar"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid var(--ft-border)",
          paddingBottom: "var(--ft-row-gap)",
          flexWrap: "wrap",
        }}
      >
        {/* Month selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, border: "1px solid var(--ft-border2)", background: "var(--ft-raised)" }}>
          <button onClick={prevMonth} style={{ background: "none", border: "none", color: "var(--ft-muted)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12, padding: "4px 8px", lineHeight: 1 }}>‹</button>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: isCurrentMonth ? "var(--ft-accent)" : "var(--ft-text)", padding: "4px 10px", minWidth: 80, textAlign: "center", letterSpacing: "0.04em" }}>
            {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
          </span>
          <button onClick={nextMonth} style={{ background: "none", border: "none", color: "var(--ft-muted)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12, padding: "4px 8px", lineHeight: 1 }}>›</button>
        </div>
        <button
          onClick={() => setZbEnabled((v) => !v)}
          style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase" as const, padding: "5px 12px", border: `1px solid ${zbEnabled ? "var(--ft-cyan)" : "var(--ft-border2)"}`, background: zbEnabled ? "color-mix(in srgb, var(--ft-cyan) 10%, transparent)" : "transparent", color: zbEnabled ? "var(--ft-cyan)" : "var(--ft-dim)", cursor: "pointer", borderRadius: 0 }}
        >
          {zbEnabled ? "ZBB On" : "ZBB"}
        </button>

        {/* Persona strip — compact single-row chips */}
        {(() => {
          const pid = loadPersonaIds()[0];
          if (!pid) return null;
          const msgs: Record<string, string | null> = {
            budget: "Budget Commander active — enforce category limits, track zero-based allocations.",
            wealth: "Budget control is the engine of wealth — every pound saved compounds in Portfolio.",
            market: "Keep monthly expenses controlled so investable surplus stays consistent.",
            social: "Personal budget tracked here — group expenses live in Group Expenses.",
            full: null,
          };
          const msg = msgs[pid];
          if (!msg) return null;
          const color = PERSONA_COLORS[pid as keyof typeof PERSONA_COLORS] ?? "var(--ft-accent)";
          return (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", border: `1px solid ${color}`, background: "color-mix(in srgb, var(--ft-surface) 90%, transparent)", padding: "4px 10px", display: "flex", gap: 6, alignItems: "center", borderRadius: 0 }}>
              <span style={{ color, fontWeight: 700, flexShrink: 0 }}>·</span>
              <Text as="span" letterSpacing="0.04em">{msg}</Text>
            </div>
          );
        })()}
      </div>

      {/* ── Budget Health Summary ── */}
      {sortedBudgets.length > 0 && (
        <div
          style={{
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-border)",
          }}
        >
          <PanelHeader
            title="Budget Health Summary"
            right={
              <div className="ft-hide-mobile" style={{ display: "flex", gap: 12, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                {(["exceeded", "warning", "on-track", "under", "empty"] as HealthStatus[]).map((s) => {
                  const info = getBudgetHealth(s === "exceeded" ? 1.1 : s === "warning" ? 0.85 : s === "on-track" ? 0.6 : s === "under" ? 0.2 : 0, s === "empty" ? 0 : 1);
                  const count = sortedBudgets.filter((b) => {
                    const sp = spentByCategory[b.category.toLowerCase()] ?? 0;
                    const re = rolloverMap[b.category];
                    const eff = b.limit + (re?.enabled ? (re.accumulated ?? 0) : 0);
                    const p = eff > 0 ? sp / eff : 0;
                    return getBudgetHealth(p, sp).status === s;
                  }).length;
                  if (count === 0) return null;
                  return (
                    <span key={s} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <span style={{ display: "inline-block", width: 6, height: 6, background: info.color, borderRadius: 0, flexShrink: 0 }} />
                      <span style={{ color: info.color, fontWeight: 700 }}>{count}</span>
                      <Text as="span" upper size={8} color="var(--ft-dim)" letterSpacing="0.06em">{s}</Text>
                    </span>
                  );
                })}
              </div>
            }
          />
          <HStack gap={6} wrap padding="8px 14px 10px">
            {sortedBudgets.map((b) => {
              const sp = spentByCategory[b.category.toLowerCase()] ?? 0;
              const re = rolloverMap[b.category];
              const eff = b.limit + (re?.enabled ? (re.accumulated ?? 0) : 0);
              const p = eff > 0 ? sp / eff : 0;
              const h = getBudgetHealth(p, sp);
              const isOv = sp >= eff;
              return (
                <HealthSummaryChip
                  key={b.category}
                  category={b.category}
                  spent={sp}
                  effectiveLimit={eff}
                  pct={p}
                  health={h}
                  isOver={isOv}
                  title={`${b.category}: ${formatBaseMoney(sp)} of ${formatBaseMoney(eff)} (${Math.round(p * 100)}%)`}
                />
              );
            })}
          </HStack>
        </div>
      )}

      {/* ── AI Budget Insight ── */}
      {sortedBudgets.length > 0 && (
        <AiBudgetInsight
          budgets={budgets}
          spentByCategory={spentByCategory}
          totalBudgeted={totalBudgeted}
          totalSpent={totalSpent}
          overBudgetCount={overBudgetCount}
        />
      )}

      {/* ── Zero-based budgeting panel ── */}
      {zbEnabled && (
        <div
          style={{
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-border)",
            borderLeft: "3px solid var(--ft-cyan)",
          }}
        >
          <PanelHeader title="Zero-Based Budget" />
          <div
            style={{
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: 20,
              fontFamily: "var(--font-mono)",
              flexWrap: "wrap",
            }}
          >
            <Text as="span" size={11} color="var(--ft-text)">
              Income:{" "}
              <strong className="pnum" style={{ color: "var(--ft-green)", fontVariantNumeric: "tabular-nums" }}>
                {formatBaseMoney(monthlyIncome)}
              </strong>
            </Text>
            <Text as="span" size={11} color="var(--ft-text)">
              Budgeted:{" "}
              <strong className="pnum" style={{ color: "var(--ft-accent)", fontVariantNumeric: "tabular-nums" }}>
                {formatBaseMoney(totalBudgeted)}
              </strong>
            </Text>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: zbRemaining < 0 ? "var(--ft-red)" : "var(--ft-green)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span className="pnum">
                {zbRemaining < 0
                  ? `Over-allocated by ${formatBaseMoney(Math.abs(zbRemaining))}`
                  : zbRemaining === 0
                  ? "Every £ allocated"
                  : `${formatBaseMoney(zbRemaining)} unallocated`}
              </span>
            </span>
            {monthlyIncome > 0 && (
              <div
                style={{
                  height: 4,
                  flex: 1,
                  minWidth: 120,
                  background: "var(--ft-border)",
                  borderRadius: 0,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min((totalBudgeted / Math.max(monthlyIncome, 1)) * 100, 100)}%`,
                    background: "var(--ft-cyan)",
                    borderRadius: 0,
                    transition: "width 0.15s ease",
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Month-end spending forecast ── */}
      {forecastData && (() => {
        const atRisk = forecastData.filter((f) => !f.onTrack);
        const onTrackCount = forecastData.filter((f) => f.onTrack).length;
        const totalProjectedOverspend = atRisk.reduce((s, f) => s + f.projectedOverspend, 0);
        const accentColor = atRisk.length > 0 ? "var(--ft-amber)" : "var(--ft-green)";
        return (
          <div
            style={{
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border)",
              borderLeft: `3px solid ${accentColor}`,
            }}
          >
            <PanelHeader
              title="Month-End Forecast"
              right={
                <div className="ft-hide-mobile" style={{ display: "flex", gap: 16, fontFamily: "var(--font-mono)", fontSize: 10 }}>
                  <span>
                    <span style={{ color: "var(--ft-dim)", fontSize: 8, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>on track </span>
                    <Text as="span" weight={700} color="var(--ft-green)">{onTrackCount}</Text>
                  </span>
                  <span>
                    <Text as="span" upper size={8} color="var(--ft-dim)" letterSpacing="0.06em">at risk </Text>
                    <Text as="span" weight={700} color={atRisk.length > 0 ? "var(--ft-red)" : "var(--ft-dim)"}>{atRisk.length}</Text>
                  </span>
                  {atRisk.length > 0 && (
                    <span>
                      <Text as="span" upper size={8} color="var(--ft-dim)" letterSpacing="0.06em">projected overspend </Text>
                      <span className="pnum" style={{ color: "var(--ft-red)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatBaseMoney(totalProjectedOverspend)}</span>
                    </span>
                  )}
                </div>
              }
            />
            <div style={{ padding: "8px 14px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
              Day {dayOfMonth} of {daysInMonth} · current burn rate extrapolated
            </div>
            {atRisk.length > 0 && (
              <div className="ft-scroll-x" style={{ padding: "0 14px 10px" }}>
                <VStack gap={5} minWidth={500}>
                  {atRisk.map((f) => (
                    <ForecastAtRiskRow
                      key={f.category}
                      category={f.category}
                      effectiveLimit={f.effectiveLimit}
                      projectedSpend={f.projectedSpend}
                      projectedOverspend={f.projectedOverspend}
                    />
                  ))}
                </VStack>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Budget table ── */}
      {sortedBudgets.length === 0 ? (
        <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)", borderLeft: "3px solid var(--ft-accent)" }}>
          <PanelHeader title="Monthly Targets" />
          <div
            style={{
              padding: "28px 14px",
              fontFamily: "var(--font-mono)",
              textAlign: "center" as const,
              display: "flex",
              flexDirection: "column" as const,
              alignItems: "center",
              gap: 6,
            }}
          >
            <div style={{ fontSize: 10, color: "var(--ft-muted)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
              NO BUDGET CATEGORIES DEFINED
            </div>
            <div style={{ fontSize: 10, color: "var(--ft-dim)", lineHeight: 1.6, maxWidth: 320, letterSpacing: "0.02em" }}>
              Use the form below to add a category — transactions are matched automatically.
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            border: "1px solid var(--ft-border)",
            background: "var(--ft-surface)",
            borderLeft: "3px solid var(--ft-accent)",
          }}
        >
          <PanelHeader
            title="Monthly Targets"
            right={
              <MonoLabel as="span" size={8} letterSpacing="0.12em">
                SORTED BY % USED ▼
              </MonoLabel>
            }
          />
          {/* Table scroll wrapper — desktop only; mobile renders cards above */}
          <div className={isMobile ? undefined : "ft-scroll-x"}>
            {/* Column headers — desktop only */}
            {!isMobile && <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 100px 120px 70px 80px 90px 100px 120px 80px",
                background: "var(--ft-raised)",
                borderBottom: "2px solid var(--ft-border2)",
                minWidth: 800,
              }}
            >
              {[
                { label: "Category", align: "left" as const },
                { label: "Limit", align: "right" as const },
                { label: "Spent", align: "right" as const },
                { label: "vs Last Mo", align: "right" as const },
                { label: "Bar", align: "left" as const },
                { label: "% Used", align: "right" as const },
                { label: "Remaining", align: "right" as const },
                { label: "Rollover", align: "left" as const },
                { label: "", align: "left" as const },
              ].map((h, i) => (
                <div
                  key={i}
                  className="xls-col-header"
                  style={{
                    textAlign: h.align,
                    paddingLeft: h.align === "left" ? 14 : 0,
                    paddingRight: h.align === "right" ? 14 : 0,
                  }}
                >
                  {h.label}
                </div>
              ))}
            </div>}

            {sortedBudgets.map((budget, rowIdx) => {
              const spent = spentByCategory[budget.category.toLowerCase()] ?? 0;
              const lastSpent = lastMonthSpentByCategory[budget.category.toLowerCase()] ?? 0;
              const rolloverEntry = rolloverMap[budget.category];
              const rolloverEnabled = rolloverEntry?.enabled ?? false;
              const rolloverAccumulated = rolloverEntry?.accumulated ?? 0;
              const effectiveLimit = budget.limit + (rolloverEnabled ? rolloverAccumulated : 0);
              const pct = effectiveLimit > 0 ? spent / effectiveLimit : 0;
              const rem = effectiveLimit - spent;
              const isOver = spent >= effectiveLimit;
              const isEditing = editingCategory === budget.category;
              return (
                <BudgetTableRow
                  key={budget.category}
                  budget={budget}
                  rowIdx={rowIdx}
                  spent={spent}
                  lastSpent={lastSpent}
                  rolloverEnabled={rolloverEnabled}
                  rolloverAccumulated={rolloverAccumulated}
                  effectiveLimit={effectiveLimit}
                  pct={pct}
                  rem={rem}
                  isOver={isOver}
                  isEditing={isEditing}
                  editingLimit={editingLimit}
                  deleteConfirmId={deleteConfirmId}
                  isCurrentMonth={isCurrentMonth}
                  dayOfMonth={dayOfMonth}
                  daysInMonth={daysInMonth}
                  isMobile={isMobile}
                  onEditLimitChange={setEditingLimit}
                  onStartEdit={startEdit}
                  onCommitEdit={commitEdit}
                  onCancelEdit={() => { setEditingCategory(null); setEditingLimit(""); }}
                  onToggleRollover={toggleRollover}
                  onResetRollover={resetRollover}
                  onDeleteClick={(id) => {
                    if (deleteConfirmId === id) {
                      handleDeleteBudget(id);
                      setDeleteConfirmId(null);
                    } else {
                      setDeleteConfirmId(id);
                      setTimeout(() => setDeleteConfirmId(null), 3000);
                    }
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Add budget form ── */}
      <div
        style={{
          background: "var(--ft-surface)",
          border: "1px solid var(--ft-border)",
        }}
      >
        <PanelHeader title="Add Budget Category" />
        <div style={{ padding: "12px 14px" }}>
          <HStack gap={8} align="end" wrap>
            <div style={{ flex: 2, minWidth: 180 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 4, fontWeight: 600 }}>
                Category
              </div>
              <input
                list="category-suggestions"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddBudget()}
                placeholder="e.g. Groceries"
                style={INPUT_STYLE}
              />
              <datalist id="category-suggestions">
                {categorySuggestions.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 4, fontWeight: 600 }}>
                Monthly Limit (£)
              </div>
              <input
                type="number"
                value={formLimit}
                onChange={(e) => setFormLimit(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddBudget()}
                placeholder="0.00"
                min="0"
                style={INPUT_STYLE}
              />
            </div>
            <button onClick={handleAddBudget} style={BTN_ACCENT}>+ Add</button>
            <button
              onClick={buildCopyCandidates}
              style={{ ...BTN_GHOST, borderColor: "var(--ft-accent)", color: "var(--ft-accent)" }}
              title={`Copy ${MONTH_NAMES[lastMonth - 1]} actuals as budget suggestions`}
            >
              Copy Last Month
            </button>
          </HStack>
        </div>
      </div>

      {/* ── Copy-last-month panel ── */}
      {showCopyPanel && copyCandidates.length > 0 && (
        <div
          style={{
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-border)",
            borderLeft: "3px solid var(--ft-accent)",
          }}
        >
          <PanelHeader title={`${MONTH_NAMES[lastMonth - 1]} ${lastMonthYear} Actuals — Confirm to Import`} />
          <div style={{ padding: "12px 14px" }}>
            <VStack gap={2} marginBottom={12}>
              {copyCandidates.map((c, i) => (
                <CopyCandidateRow
                  key={c.category}
                  candidate={c}
                  index={i}
                  onChange={(idx, checked) => {
                    setCopyCandidates((prev) => prev.map((x, j) => j === idx ? { ...x, confirmed: checked } : x));
                  }}
                />
              ))}
            </VStack>
            <HStack gap={8}>
              <button onClick={applyLastMonthActuals} style={BTN_ACCENT}>Apply Selected</button>
              <button
                onClick={() => { setShowCopyPanel(false); setCopyCandidates([]); }}
                style={BTN_GHOST}
              >
                Cancel
              </button>
            </HStack>
          </div>
        </div>
      )}

      {/* ── Budget vs Actuals chart ── */}
      {chartData.length > 0 && (
        <div
          style={{
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-border)",
          }}
        >
          <PanelHeader
            title="Budget vs Actuals"
            right={
              <div style={{ display: "flex", gap: 12, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                <HStack gap={4} align="center">
                  <span style={{ display: "inline-block", width: 8, height: 8, background: "var(--ft-dim)", opacity: 0.4, borderRadius: 0 }} />
                  Budget
                </HStack>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, background: "var(--ft-green)", borderRadius: 0 }} />
                  &lt;80%
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, background: "var(--ft-amber)", borderRadius: 0 }} />
                  80-99%
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, background: "var(--ft-red)", borderRadius: 0 }} />
                  &gt;=100%
                </span>
              </div>
            }
          />
          <div style={{ padding: "12px 14px 16px" }}>
            <ResponsiveContainer width="100%" height={Math.max(chartData.length * 36, 120)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
                barCategoryGap="28%"
                barGap={3}
              >
                <XAxis
                  type="number"
                  tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)", className: "pnum" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `£${v}`}
                />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={100}
                  tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--ft-muted)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<BudgetTooltip />} />
                <Bar dataKey="Budget" fill="var(--ft-dim)" radius={0} opacity={0.4} />
                <Bar dataKey="Actual" radius={0}>
                  {chartData.map((entry) => {
                    const pctVal = entry.Budget > 0 ? entry.Actual / entry.Budget : 0;
                    return <Cell key={entry.category} fill={barColor(pctVal)} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Unbudgeted categories notice ── */}
      {(() => {
        const budgetedLower = new Set(budgets.map((b) => b.category.toLowerCase()));
        const unbudgeted = Object.keys(spentByCategory).filter(
          (k) => !budgetedLower.has(k) && spentByCategory[k] > 0
        );
        if (unbudgeted.length === 0) return null;
        return (
          <div
            style={{
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border)",
              borderLeft: "3px solid var(--ft-amber)",
            }}
          >
            <PanelHeader title="Unbudgeted Spending This Month" />
            <div style={{ padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {unbudgeted.map((cat) => {
                const displayCat = Object.keys(spentByCategory).find(
                  (k) => k.toLowerCase() === cat
                ) ?? cat;
                return (
                  <UnbudgetedCategoryBtn
                    key={cat}
                    displayCat={displayCat}
                    amount={spentByCategory[cat]}
                    onClick={() => {
                      setFormCategory(
                        (expenseTxs ?? []).find(
                          (tx: Transaction) => tx.category.toLowerCase() === cat
                        )?.category ?? cat
                      );
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
