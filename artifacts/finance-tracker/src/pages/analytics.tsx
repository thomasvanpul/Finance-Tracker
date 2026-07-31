import React, { useMemo, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { useListTransactions, useListBudgets } from "@workspace/api-client-react";
import { Skeleton as FtSkeleton } from "@/components/skeleton";
import { ErrorState } from "@/components/error-state";
import { formatGbp } from "@/lib/utils";
import { loadPersonaIds, PERSONAS, PERSONA_COLORS } from "@/lib/persona";
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from "recharts";

// ─── annotation storage ──────────────────────────────────────────────────────

interface SpendingAnnotation {
  id: string;
  month: string; // "YYYY-MM"
  label: string;
}
const ANNOT_KEY = "ft-analytics-annotations";
function loadAnnotations(): SpendingAnnotation[] {
  try { return JSON.parse(localStorage.getItem(ANNOT_KEY) ?? "[]") as SpendingAnnotation[]; }
  catch { return []; }
}
function saveAnnotations(a: SpendingAnnotation[]): void {
  localStorage.setItem(ANNOT_KEY, JSON.stringify(a));
}

// ─── shared tooltip style ────────────────────────────────────────────────────

const monoTooltipStyle: React.CSSProperties = {
  background: "var(--ft-raised)",
  border: "1px solid var(--ft-border2)",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  boxShadow: "none",
  padding: "8px 12px",
  borderRadius: 3,
};

type TooltipEntry = { name?: string | number; value?: number | string | (number | string)[]; color?: string };

function MonoTooltip({ active, payload, label, formatter }: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  formatter?: (value: number, name: string) => [string, string];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={monoTooltipStyle}>
      {label && (
        <div style={{ fontSize: 9, color: "var(--ft-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {label}
        </div>
      )}
      {payload.map((entry, i) => {
        const rawVal = typeof entry.value === "number" ? entry.value : 0;
        const name = String(entry.name ?? "");
        const [displayVal, displayName] = formatter ? formatter(rawVal, name) : [formatGbp(rawVal), name];
        return (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {entry.color && (
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: entry.color, flexShrink: 0 }} />
            )}
            {displayName && <span style={{ color: "var(--ft-dim)", fontSize: 9 }}>{displayName}</span>}
            <span className="pnum" style={{ color: "var(--ft-text)", fontWeight: 700 }}>{displayVal}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── custom dot renderer for line charts ─────────────────────────────────────

function LineDot(props: { cx?: number; cy?: number; stroke?: string }) {
  const { cx, cy, stroke } = props;
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={3} fill={stroke ?? "var(--ft-accent)"} stroke="none" />;
}

// ─── helpers ────────────────────────────────────────────────────────────────

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getYYYYMM(d: string) { return d.slice(0, 7); }
function localDate(d: string) { return new Date(d + "T12:00:00"); }
function getDOW(d: string) { const w = localDate(d).getDay(); return w === 0 ? 6 : w - 1; }
function getWeekOfMonth(d: string) { return Math.min(Math.floor((localDate(d).getDate() - 1) / 7), 4); }

function monthsAgoStr(n: number): string {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function pctChange(prev: number, curr: number) {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
}

function cutoffDate(range: Range): Date {
  const now = new Date();
  if (range === "30d") { const d = new Date(now); d.setDate(d.getDate() - 30); return d; }
  if (range === "3m") { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d; }
  if (range === "6m") { const d = new Date(now); d.setMonth(d.getMonth() - 6); return d; }
  if (range === "12m") { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d; }
  return new Date(0);
}

// ─── shared style atoms ──────────────────────────────────────────────────────

const mono: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
};

const ftLabel: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  fontWeight: 600,
  color: "var(--ft-dim)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
};

const ftPanelLabel: React.CSSProperties = {
  ...mono,
  fontSize: 10,
  fontWeight: 500,
  color: "var(--ft-muted)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

// Terminal panel header style
const panelHeaderStyle: React.CSSProperties = {
  background: "var(--ft-raised)",
  borderBottom: "1px solid var(--ft-border)",
  padding: "0 12px",
  height: "var(--ft-panel-header-h)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexShrink: 0,
};

// Terminal panel wrapper
const panelStyle: React.CSSProperties = {
  background: "var(--ft-surface)",
  border: "1px solid var(--ft-border)",
  marginBottom: 8,
};

const th: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  fontWeight: 600,
  color: "var(--ft-muted)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  textAlign: "left",
  padding: "var(--ft-cell-py) var(--ft-cell-px)",
  borderBottom: "1px solid var(--ft-border2)",
  whiteSpace: "nowrap",
  background: "var(--ft-surface)",
};

const td: React.CSSProperties = {
  ...mono,
  fontSize: 11,
  color: "var(--ft-text)",
  padding: "var(--ft-cell-py) var(--ft-cell-px)",
  borderBottom: "1px solid var(--ft-border)",
  whiteSpace: "nowrap",
};

// Section header with accent dot
function PanelHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div style={{ ...panelHeaderStyle, flexWrap: "wrap", gap: "4px 8px", height: "auto", minHeight: "var(--ft-panel-header-h)", paddingTop: 4, paddingBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: "var(--ft-accent)", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1 }}>·</span>
        <span style={ftPanelLabel}>{title}</span>
      </div>
      {right && <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>{right}</div>}
    </div>
  );
}

// ─── sub-components ──────────────────────────────────────────────────────────

type Range = "30d" | "3m" | "6m" | "12m" | "all";

// ─── This-month split data row ────────────────────────────────────────────────

interface SplitRowProps {
  label: string;
  value: string;
  color: string;
  isLast: boolean;
  index: number;
}

function SplitRow({ label, value, color, isLast, index: i }: SplitRowProps) {
  const [hov, setHov] = React.useState(false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "5px 12px",
        borderBottom: isLast ? "none" : "1px solid var(--ft-border)",
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : i % 2 === 0 ? "transparent" : "color-mix(in srgb, var(--ft-raised) 40%, transparent)",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span style={{ ...ftLabel, fontSize: 9 }}>
        <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: color, marginRight: 5, verticalAlign: "middle" }} />
        {label}
      </span>
      <span className="pnum" style={{ ...mono, fontSize: 11, fontWeight: 600, color }}>{value}</span>
    </div>
  );
}

// ─── KPI cell (analytics bars) ───────────────────────────────────────────────

interface AnalyticsKpiCellProps {
  label: string;
  value: string;
  delta?: React.ReactNode;
  valueColor?: string;
  accentColor?: string;
}

function AnalyticsKpiCell({ label, value, delta, valueColor, accentColor = "var(--ft-accent)" }: AnalyticsKpiCellProps) {
  const isMobile = useIsMobile();
  const [hov, setHov] = React.useState(false);
  return (
    <div
      style={{
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
        padding: isMobile ? "8px 10px" : "var(--ft-metric-py) 12px",
        borderTop: `2px solid ${accentColor}`,
        minWidth: 0,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
    >
      <div style={{ ...ftLabel, marginBottom: isMobile ? 2 : 4, fontSize: isMobile ? 8 : 9 }}>{label}</div>
      <div className="pnum" style={{ ...mono, fontSize: isMobile ? 15 : 18, fontWeight: 700, color: valueColor ?? "var(--ft-text)", letterSpacing: "-0.01em", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </div>
      <div style={{ minHeight: isMobile ? 12 : 14 }}>{delta}</div>
    </div>
  );
}

// ─── Category intelligence table row ─────────────────────────────────────────

interface CategoryRowData {
  cat: string;
  total: number;
  pctOfTotal: number;
  count: number;
  avg: number;
  thisM: number;
  lastM: number;
  change: number;
}

interface CategoryRowProps {
  row: CategoryRowData;
  catMax: number;
  totalSpend: number;
  onCategoryClick: (cat: string) => void;
  rowIndex: number;
  isMobile?: boolean;
}

function CategoryRow({ row: r, catMax, totalSpend, onCategoryClick, rowIndex: ri, isMobile }: CategoryRowProps) {
  const [hov, setHov] = React.useState(false);
  const chgColor = r.change > 10 ? "var(--ft-red)" : r.change < -10 ? "var(--ft-green)" : "var(--ft-muted)";
  const arrow = r.change > 10 ? "▲" : r.change < -10 ? "▼" : "→";
  const heatIntensity = totalSpend > 0 ? Math.abs(r.total) / catMax * 0.3 : 0;
  const baseBg = ri % 2 === 0
    ? `color-mix(in srgb, var(--ft-red) ${Math.round(heatIntensity * 100)}%, transparent)`
    : `color-mix(in srgb, var(--ft-raised) 30%, color-mix(in srgb, var(--ft-red) ${Math.round(heatIntensity * 100)}%, transparent))`;
  return (
    <tr
      onClick={() => onCategoryClick(r.cat)}
      style={{
        cursor: "pointer",
        background: hov ? "var(--ft-raised)" : baseBg,
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
    >
      <td style={{ ...td, fontWeight: 600, maxWidth: isMobile ? 110 : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <span style={{ color: "var(--ft-accent)", marginRight: 5, fontSize: 9 }}>→</span>
        {r.cat}
      </td>
      <td className="pnum" style={{ ...td, textAlign: "right", color: "var(--ft-accent)" }}>{formatGbp(r.total)}</td>
      {!isMobile && <td className="pnum" style={{ ...td, textAlign: "right", color: "var(--ft-muted)" }}>{r.pctOfTotal.toFixed(1)}%</td>}
      {!isMobile && <td style={{ ...td, textAlign: "right", color: "var(--ft-muted)" }}>{r.count}</td>}
      {!isMobile && <td className="pnum" style={{ ...td, textAlign: "right", color: "var(--ft-dim)" }}>{formatGbp(r.avg)}</td>}
      <td className="pnum" style={{ ...td, textAlign: "right" }}>{r.thisM > 0 ? formatGbp(r.thisM) : "—"}</td>
      {!isMobile && <td className="pnum" style={{ ...td, textAlign: "right", color: "var(--ft-dim)" }}>{r.lastM > 0 ? formatGbp(r.lastM) : "—"}</td>}
      <td className="pnum" style={{ ...td, textAlign: "right", color: chgColor, fontWeight: 700 }}>{arrow} {r.change !== 0 ? `${Math.abs(r.change).toFixed(0)}%` : "—"}</td>
      {!isMobile && (
        <td style={{ ...td, paddingLeft: 8, paddingRight: 12 }}>
          <div style={{ height: 3, width: 60, background: "var(--ft-border)" }}>
            <div style={{ height: "100%", width: `${r.pctOfTotal}%`, background: "var(--ft-red)", opacity: 0.8 }} />
          </div>
        </td>
      )}
    </tr>
  );
}

// ─── Top merchant table row ───────────────────────────────────────────────────

interface MerchantRowData {
  desc: string;
  total: number;
  count: number;
  avg: number;
  thisM: number;
  change: number;
}

interface MerchantRowProps {
  merchant: MerchantRowData;
  maxTotal: number;
  index: number;
  isMobile?: boolean;
}

function MerchantRow({ merchant: m, maxTotal, index: i, isMobile }: MerchantRowProps) {
  const [hov, setHov] = React.useState(false);
  const barW = Math.round((m.total / maxTotal) * 100);
  const chgColor = m.change > 10 ? "var(--ft-red)" : m.change < -10 ? "var(--ft-green)" : "var(--ft-dim)";
  const baseBg = i % 2 !== 0 ? "color-mix(in srgb, var(--ft-raised) 30%, transparent)" : "transparent";
  return (
    <tr
      style={{
        background: hov ? "var(--ft-raised)" : baseBg,
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
    >
      <td style={{ ...td, color: "var(--ft-dim)", fontSize: 9, width: 20 }}>{i + 1}</td>
      <td style={{ ...td, maxWidth: isMobile ? 110 : 180, overflow: "hidden", textOverflow: "ellipsis" }}>{m.desc}</td>
      {!isMobile && (
        <td style={{ ...td, width: 72, padding: "var(--ft-cell-py) 6px" }}>
          <div style={{ height: 3, background: "var(--ft-border)" }}>
            <div style={{ height: "100%", width: `${barW}%`, background: "var(--ft-accent)" }} />
          </div>
        </td>
      )}
      <td style={{ ...td, textAlign: "right", color: "var(--ft-muted)" }}>{m.count}</td>
      <td className="pnum" style={{ ...td, textAlign: "right", color: "var(--ft-accent)", fontWeight: 600 }}>{formatGbp(m.total)}</td>
      {!isMobile && <td className="pnum" style={{ ...td, textAlign: "right", color: "var(--ft-muted)" }}>{formatGbp(m.avg)}</td>}
      <td className="pnum" style={{ ...td, textAlign: "right" }}>{m.thisM > 0 ? formatGbp(m.thisM) : "—"}</td>
      {!isMobile && (
        <td className="pnum" style={{ ...td, textAlign: "right", color: chgColor, fontSize: 10 }}>
          {m.change !== 0 ? `${m.change > 0 ? "▲" : "▼"}${Math.abs(m.change).toFixed(0)}%` : "—"}
        </td>
      )}
    </tr>
  );
}

// ─── Biggest transaction table row ───────────────────────────────────────────

interface BigTxRowProps {
  tx: Tx;
  index: number;
  max: number;
}

function BigTxRow({ tx: t, index: i, max }: BigTxRowProps) {
  const [hov, setHov] = React.useState(false);
  const baseBg = i % 2 !== 0 ? "color-mix(in srgb, var(--ft-raised) 30%, transparent)" : "transparent";
  return (
    <tr
      style={{
        position: "relative",
        background: hov ? "var(--ft-raised)" : baseBg,
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <td style={{ ...td, color: "var(--ft-dim)", fontSize: 9, width: 20 }}>{i + 1}</td>
      <td style={{ ...td, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", paddingLeft: 0, position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(t.gbpValue / max) * 4}px`, background: "var(--ft-red)", opacity: 0.4 }} />
        <span style={{ paddingLeft: 8, position: "relative" }}>{t.description || "—"}</span>
      </td>
      <td style={{ ...td, color: "var(--ft-muted)" }}>{t.category || "Other"}</td>
      <td style={{ ...td, color: "var(--ft-dim)" }}>{t.date}</td>
      <td className="pnum" style={{ ...td, textAlign: "right", color: "var(--ft-red)", fontWeight: 700 }}>{formatGbp(t.gbpValue)}</td>
    </tr>
  );
}

// ─── Recurring vs One-Off table row ──────────────────────────────────────────

interface RecurringRowProps {
  item: { desc: string; total: number; count: number };
  index: number;
}

function RecurringRow({ item: r, index: i }: RecurringRowProps) {
  const [hov, setHov] = React.useState(false);
  const baseBg = i % 2 !== 0 ? "color-mix(in srgb, var(--ft-raised) 30%, transparent)" : "transparent";
  return (
    <tr
      style={{
        background: hov ? "var(--ft-raised)" : baseBg,
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <td style={{ ...td, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{r.desc}</td>
      <td style={{ ...td, textAlign: "right", color: "var(--ft-muted)" }}>{r.count}</td>
      <td className="pnum" style={{ ...td, textAlign: "right", color: "var(--ft-amber)", fontWeight: 600 }}>{formatGbp(r.total)}</td>
    </tr>
  );
}

// ─── Income source row ────────────────────────────────────────────────────────

interface IncomeSourceRowProps {
  cat: string;
  total: number;
  grandTotal: number;
  colorIndex: number;
  isLast: boolean;
}

const PIE_COLORS_LIST = [
  "var(--ft-green)", "var(--ft-blue)", "var(--ft-cyan)", "var(--ft-amber)",
  "var(--ft-accent)", "var(--ft-muted)", "var(--ft-text)", "var(--ft-red)",
];

function IncomeSourceRow({ cat, total, grandTotal, colorIndex, isLast }: IncomeSourceRowProps) {
  const [hov, setHov] = React.useState(false);
  const pct = grandTotal > 0 ? total / grandTotal : 0;
  const color = PIE_COLORS_LIST[colorIndex % PIE_COLORS_LIST.length];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 80px 48px 110px",
        gap: 6,
        alignItems: "center",
        padding: "4px 0",
        borderBottom: isLast ? "none" : "1px solid var(--ft-border)",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ ...mono, fontSize: 11, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
        <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: color, marginRight: 6, flexShrink: 0 }} />
        {cat}
      </div>
      <div style={{ height: 3, background: "var(--ft-border)" }}>
        <div style={{ height: "100%", width: `${Math.round(pct * 100)}%`, background: color }} />
      </div>
      <div className="pnum" style={{ ...mono, fontSize: 10, color: "var(--ft-dim)", textAlign: "right" as const }}>{Math.round(pct * 100)}%</div>
      <div className="pnum" style={{ ...mono, fontSize: 11, fontWeight: 600, color, textAlign: "right" as const }}>{formatGbp(total)}</div>
    </div>
  );
}

// ─── Annotation list row ──────────────────────────────────────────────────────

interface AnnotationRowProps {
  annotation: { id: string; month: string; label: string };
  index: number;
  onDelete: (id: string) => void;
}

function AnnotationRow({ annotation: a, index: ai, onDelete }: AnnotationRowProps) {
  const [hov, setHov] = React.useState(false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 8px",
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : ai % 2 === 0 ? "transparent" : "color-mix(in srgb, var(--ft-raised) 40%, transparent)",
        borderBottom: "1px solid var(--ft-border)",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ width: 3, height: 16, background: "var(--ft-amber)", flexShrink: 0, opacity: 0.85 }} />
      <span style={{ ...mono, fontSize: 10, color: "var(--ft-amber)", flexShrink: 0, minWidth: 52 }}>{a.month}</span>
      <span style={{ ...mono, fontSize: 10, color: "var(--ft-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
      <button
        onClick={() => onDelete(a.id)}
        style={{ background: "none", border: "1px solid transparent", color: "var(--ft-dim)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1, padding: "2px 5px", flexShrink: 0 }}
        onMouseEnter={e => { e.currentTarget.style.color = "var(--ft-red)"; e.currentTarget.style.borderColor = "var(--ft-red)"; }}
        onMouseLeave={e => { e.currentTarget.style.color = "var(--ft-dim)"; e.currentTarget.style.borderColor = "transparent"; }}
        aria-label="Delete annotation"
      >×</button>
    </div>
  );
}

interface Tx { id: number; date: string; description: string; type: string; category: string; gbpValue: number; accountName: string; currency: string; nativeAmount: number; }

// ─── Demo transactions (shown when no real data exists) ──────────────────────

function makeDemoTxs(): Tx[] {
  const rows: Array<[number, string, string, string, number]> = [
    // id, type, category, description, gbpValue
    // ── month 0 (current) ──
    [1,  "income",  "Salary",        "Monthly Salary",       3700],
    [2,  "expense", "Housing",       "Rent",                 1100],
    [3,  "expense", "Groceries",     "Sainsbury's",           92],
    [4,  "expense", "Groceries",     "Tesco",                 67],
    [5,  "expense", "Transport",     "TfL Monthly",           84],
    [6,  "expense", "Transport",     "Fuel",                  65],
    [7,  "expense", "Eating Out",    "Wagamama",              34],
    [8,  "expense", "Eating Out",    "Pret A Manger",         18],
    [9,  "expense", "Subscriptions", "Netflix",               17],
    [10, "expense", "Subscriptions", "Spotify",               11],
    [11, "expense", "Subscriptions", "iCloud",                 3],
    [12, "expense", "Healthcare",    "Pharmacy",              12],
    [13, "expense", "Recreation",    "Cinema",                28],
    [14, "expense", "Clothing",      "ASOS",                  54],
    [15, "expense", "Eating Out",    "JustEat",               22],
    [16, "expense", "Groceries",     "Lidl",                  41],
    [17, "expense", "Transport",     "National Rail",         38],
    // ── month 1 ──
    [18, "income",  "Salary",        "Monthly Salary",       3700],
    [19, "expense", "Housing",       "Rent",                 1100],
    [20, "expense", "Groceries",     "Sainsbury's",           88],
    [21, "expense", "Groceries",     "Tesco",                 73],
    [22, "expense", "Transport",     "TfL Monthly",           84],
    [23, "expense", "Transport",     "Fuel",                  71],
    [24, "expense", "Eating Out",    "Pho",                   29],
    [25, "expense", "Subscriptions", "Netflix",               17],
    [26, "expense", "Subscriptions", "Spotify",               11],
    [27, "expense", "Healthcare",    "Dental",                85],
    [28, "expense", "Recreation",    "Gym",                   40],
    [29, "expense", "Recreation",    "Steam",                 19],
    [30, "expense", "Eating Out",    "Costa",                 12],
    [31, "expense", "Groceries",     "Lidl",                  38],
    // ── month 2 ──
    [32, "income",  "Salary",        "Monthly Salary",       3700],
    [33, "income",  "Freelance",     "Side Project",          450],
    [34, "expense", "Housing",       "Rent",                 1100],
    [35, "expense", "Groceries",     "Sainsbury's",           94],
    [36, "expense", "Groceries",     "Waitrose",              55],
    [37, "expense", "Transport",     "TfL Monthly",           84],
    [38, "expense", "Eating Out",    "Dishoom",               48],
    [39, "expense", "Subscriptions", "Netflix",               17],
    [40, "expense", "Subscriptions", "Spotify",               11],
    [41, "expense", "Subscriptions", "Adobe",                 55],
    [42, "expense", "Healthcare",    "Pharmacy",               8],
    [43, "expense", "Clothing",      "Zara",                  79],
    [44, "expense", "Recreation",    "Gym",                   40],
    [45, "expense", "Eating Out",    "Deliveroo",             31],
  ];

  const now = new Date();
  return rows.map(([id, type, category, description, gbpValue]) => {
    const monthOffset = id <= 17 ? 0 : id <= 31 ? 1 : 2;
    const d = new Date(now.getFullYear(), now.getMonth() - monthOffset, 5 + (id % 20));
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { id, date, description, type, category, gbpValue, accountName: "Demo Bank", currency: "GBP", nativeAmount: gbpValue };
  });
}

const DEMO_TXS = makeDemoTxs();

// ─── Category Drill-Through Drawer ───────────────────────────────────────────

interface DrillDrawerProps {
  category: string | null;
  expenses: Tx[];
  range: Range;
  onClose: () => void;
}

function CategoryDrillDrawer({ category, expenses, range, onClose }: DrillDrawerProps) {
  const [, setLocation] = useLocation();
  const isOpen = category !== null;

  const cutoff = cutoffDate(range);
  const rangedExpenses = useMemo(() => {
    if (!category) return [];
    return expenses
      .filter(t => t.category === category && new Date(t.date) >= cutoff)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [category, expenses, cutoff, range]);

  const totalForCategory = useMemo(
    () => rangedExpenses.reduce((s, t) => s + t.gbpValue, 0),
    [rangedExpenses]
  );

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 199,
            background: "rgba(0,0,0,0.35)",
          }}
        />
      )}
      <div
        style={{
          position: "fixed",
          right: 0,
          top: 48,
          bottom: 0,
          width: "min(400px, 100vw)",
          zIndex: 200,
          background: "var(--ft-surface)",
          borderLeft: "1px solid var(--ft-border)",
          display: "flex",
          flexDirection: "column",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.12s ease-out",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            borderBottom: "1px solid var(--ft-border)",
            padding: "0 16px",
            height: "var(--ft-panel-header-h)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexShrink: 0,
            background: "var(--ft-raised)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--ft-accent)", fontFamily: "var(--font-mono)", fontSize: 12 }}>·</span>
            <div>
              <div style={{ ...ftLabel, marginBottom: 1 }}>Category</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-accent)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {category ?? ""}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)" }}>
              {rangedExpenses.length} tx · <span className="pnum">{formatGbp(totalForCategory)}</span>
            </span>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", color: "var(--ft-dim)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 18, lineHeight: 1, padding: "2px 4px", flexShrink: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ft-text)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ft-dim)"; }}
              aria-label="Close drawer"
            >
              ×
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {rangedExpenses.length === 0 ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", padding: "32px 16px", textAlign: "center" }}>
              No transactions in selected range
            </div>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, background: "var(--ft-raised)", zIndex: 1 }}>
                  {["Date", "Description", "Amount", "Account"].map((h, i) => (
                    <th key={h} style={{ ...th, textAlign: i === 2 ? "right" : "left", padding: "6px 12px", fontSize: 8 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rangedExpenses.map((t, ri) => (
                  <tr key={t.id} style={{ background: ri % 2 === 0 ? "transparent" : "color-mix(in srgb, var(--ft-raised) 30%, transparent)" }}>
                    <td style={{ ...td, fontSize: 10, color: "var(--ft-dim)", padding: "6px 12px", minWidth: 80 }}>{t.date}</td>
                    <td style={{ ...td, fontSize: 11, padding: "6px 12px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{t.description || "—"}</td>
                    <td className="pnum" style={{ ...td, fontSize: 11, fontWeight: 700, color: "var(--ft-red)", textAlign: "right", padding: "6px 12px" }}>{formatGbp(t.gbpValue)}</td>
                    <td style={{ ...td, fontSize: 9, color: "var(--ft-muted)", padding: "6px 12px", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }}>{t.accountName || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ borderTop: "1px solid var(--ft-border)", padding: "10px 16px", flexShrink: 0, background: "var(--ft-raised)" }}>
          <button
            onClick={() => setLocation("/transactions")}
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em", background: "none", border: "none", color: "var(--ft-accent)", cursor: "pointer", padding: 0 }}
          >
            → View in Transactions
          </button>
        </div>
      </div>
    </>
  );
}

function RangeSelector({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const opts: { label: string; value: Range }[] = [
    { label: "30d", value: "30d" }, { label: "3M", value: "3m" },
    { label: "6M", value: "6m" }, { label: "12M", value: "12m" },
    { label: "All", value: "all" },
  ];
  return (
    <div style={{ display: "flex", gap: 0, overflowX: "auto", scrollbarWidth: "none" }}>
      {opts.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          ...mono, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase",
          padding: "4px 10px", cursor: "pointer", borderRadius: 2,
          border: value === o.value
            ? "1px solid var(--ft-border2)"
            : "1px solid var(--ft-border)",
          background: value === o.value ? "var(--ft-raised)" : "transparent",
          color: value === o.value ? "var(--ft-text)" : "var(--ft-dim)",
          fontWeight: value === o.value ? 700 : 400,
          marginLeft: 2,
        }}>{o.label}</button>
      ))}
    </div>
  );
}

// ─── Page-level KPI Bar ───────────────────────────────────────────────────────

function AnalyticsKpiBar({ expenses, allTxs, range }: { expenses: Tx[]; allTxs: Tx[]; range: Range }) {
  const now = new Date();
  const thisM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(now); prevDate.setMonth(prevDate.getMonth() - 1);
  const lastM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const cutoff = cutoffDate(range);
  const ranged = expenses.filter(t => new Date(t.date) >= cutoff);

  // Avg monthly spend (last 6 months)
  const sixMonthTotals = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const ym = monthsAgoStr(5 - i);
      return ranged.filter(t => getYYYYMM(t.date) === ym).reduce((s, t) => s + t.gbpValue, 0);
    }).filter(v => v > 0);
  }, [ranged]);
  const avgMonthly = sixMonthTotals.length > 0 ? sixMonthTotals.reduce((a, b) => a + b, 0) / sixMonthTotals.length : 0;

  // Highest category
  const catMap: Record<string, number> = {};
  for (const t of ranged) catMap[t.category || "Other"] = (catMap[t.category || "Other"] || 0) + t.gbpValue;
  const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];

  // YoY change (this month vs same month last year)
  const lastYear = now.getFullYear() - 1;
  const sameMonthLastYear = `${lastYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisMonthSpend = expenses.filter(t => getYYYYMM(t.date) === thisM).reduce((s, t) => s + t.gbpValue, 0);
  const lastYearSameMonth = expenses.filter(t => getYYYYMM(t.date) === sameMonthLastYear).reduce((s, t) => s + t.gbpValue, 0);
  const yoyPct = pctChange(lastYearSameMonth, thisMonthSpend);

  // Spend volatility (std dev of monthly totals)
  const monthTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 11; i >= 0; i--) {
      const ym = monthsAgoStr(i);
      map[ym] = expenses.filter(t => getYYYYMM(t.date) === ym).reduce((s, t) => s + t.gbpValue, 0);
    }
    return Object.values(map);
  }, [expenses]);
  const mean = monthTotals.reduce((a, b) => a + b, 0) / (monthTotals.length || 1);
  const variance = monthTotals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (monthTotals.length || 1);
  const volatility = Math.sqrt(variance);

  // Best month (lowest spend)
  const bestMonthEntries = Object.entries(
    expenses.reduce<Record<string, number>>((acc, t) => {
      const ym = getYYYYMM(t.date);
      acc[ym] = (acc[ym] || 0) + t.gbpValue;
      return acc;
    }, {})
  ).filter(([, v]) => v > 0);
  const bestMonthEntry = bestMonthEntries.sort((a, b) => a[1] - b[1])[0];
  const bestMonthLabel = bestMonthEntry
    ? (() => { const [y, m] = bestMonthEntry[0].split("-"); return `${MONTH_SHORT[parseInt(m) - 1]} ${y}`; })()
    : "—";

  // Savings rate this month
  const thisMonthIncome = allTxs.filter(t => t.type === "income" && getYYYYMM(t.date) === thisM).reduce((s, t) => s + t.gbpValue, 0);
  const savingsRate = thisMonthIncome > 0 ? Math.round(((thisMonthIncome - thisMonthSpend) / thisMonthIncome) * 100) : null;

  const cells: { label: string; value: string; delta?: React.ReactNode; valueColor?: string }[] = [
    {
      label: "Avg Monthly Spend",
      value: avgMonthly > 0 ? formatGbp(avgMonthly) : "—",
      delta: <span style={{ color: "var(--ft-dim)", fontSize: 9, fontFamily: "var(--font-mono)" }}>6-month avg</span>,
    },
    {
      label: "Highest Category",
      value: topCat ? topCat[0] : "—",
      delta: topCat ? <span className="pnum" style={{ color: "var(--ft-accent)", fontSize: 9, fontFamily: "var(--font-mono)" }}>{formatGbp(topCat[1])}</span> : null,
      valueColor: "var(--ft-text)",
    },
    {
      label: "YoY Change",
      value: lastYearSameMonth > 0 ? `${yoyPct > 0 ? "+" : ""}${yoyPct.toFixed(1)}%` : "N/A",
      valueColor: yoyPct > 0 ? "var(--ft-red)" : yoyPct < 0 ? "var(--ft-green)" : "var(--ft-muted)",
      delta: <span style={{ color: "var(--ft-dim)", fontSize: 9, fontFamily: "var(--font-mono)" }}>vs {sameMonthLastYear}</span>,
    },
    {
      label: "Volatility",
      value: volatility > 0 ? formatGbp(volatility) : "—",
      delta: <span style={{ color: "var(--ft-dim)", fontSize: 9, fontFamily: "var(--font-mono)" }}>σ monthly</span>,
    },
    {
      label: "Best Month",
      value: bestMonthLabel,
      delta: bestMonthEntry ? <span className="pnum" style={{ color: "var(--ft-green)", fontSize: 9, fontFamily: "var(--font-mono)" }}>{formatGbp(bestMonthEntry[1])}</span> : null,
      valueColor: "var(--ft-text)",
    },
    {
      label: "Savings Rate",
      value: savingsRate !== null ? `${savingsRate}%` : "—",
      valueColor: savingsRate !== null && savingsRate >= 20 ? "var(--ft-green)" : savingsRate !== null && savingsRate >= 0 ? "var(--ft-amber)" : "var(--ft-red)",
      delta: <span style={{ color: "var(--ft-dim)", fontSize: 9, fontFamily: "var(--font-mono)" }}>this month</span>,
    },
  ];

  return (
    <div
      className="ft-kpi-bar"
      style={{ display: "grid", gap: 1, background: "var(--ft-border)", gridTemplateColumns: `repeat(${cells.length}, 1fr)`, borderBottom: "1px solid var(--ft-border)", marginBottom: 8 }}
    >
      {cells.map((c) => (
        <AnalyticsKpiCell
          key={c.label}
          label={c.label}
          value={c.value}
          delta={c.delta}
          valueColor={c.valueColor}
          accentColor={
            c.label === "Highest Category" || c.label === "Best Month" ? "var(--ft-blue)"
            : c.label === "Savings Rate" ? "var(--ft-green)"
            : c.label === "YoY Change" ? "var(--ft-amber)"
            : "var(--ft-accent)"
          }
        />
      ))}
    </div>
  );
}

// ─── KPI strip (existing spending summary) ────────────────────────────────────
function KpiStrip({ expenses, range, onRangeChange }: { expenses: Tx[]; range: Range; onRangeChange: (r: Range) => void }) {
  const isMobile = useIsMobile();
  const now = new Date();
  const thisM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(now); prevDate.setMonth(prevDate.getMonth() - 1);
  const lastM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const cutoff = cutoffDate(range);
  const ranged = expenses.filter(t => new Date(t.date) >= cutoff);

  const thisMonthSpend = ranged.filter(t => getYYYYMM(t.date) === thisM).reduce((s, t) => s + t.gbpValue, 0);
  const lastMonthSpend = expenses.filter(t => getYYYYMM(t.date) === lastM).reduce((s, t) => s + t.gbpValue, 0);
  const delta = thisMonthSpend - lastMonthSpend;

  const days = range === "all" ? 365 : range === "12m" ? 365 : range === "6m" ? 180 : range === "3m" ? 90 : 30;
  const dailyAvg = ranged.reduce((s, t) => s + t.gbpValue, 0) / days;

  const largest = ranged.reduce<Tx | null>((top, t) => !top || t.gbpValue > top.gbpValue ? t : top, null);

  const catMap: Record<string, number> = {};
  for (const t of ranged) catMap[t.category || "Other"] = (catMap[t.category || "Other"] || 0) + t.gbpValue;
  const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];

  const tiles = [
    {
      label: "This Month",
      value: formatGbp(thisMonthSpend),
      sub: delta !== 0 ? (
        <span style={{ color: delta > 0 ? "var(--ft-red)" : "var(--ft-green)", fontSize: 10, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
          {delta > 0 ? "▲" : "▼"} <span className="pnum">{formatGbp(Math.abs(delta))}</span> MoM
        </span>
      ) : null,
    },
    { label: "Daily Average", value: formatGbp(dailyAvg), sub: <span style={{ ...ftLabel }}>over {days}d</span> },
    { label: "Largest Single", value: largest ? formatGbp(largest.gbpValue) : "—", sub: <span style={{ ...ftLabel, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{largest?.description ?? "—"}</span> },
    { label: "Top Category", value: topCat ? formatGbp(topCat[1]) : "—", sub: <span style={{ ...ftLabel }}>{topCat?.[0] ?? "—"}</span> },
    { label: "Transactions", value: String(ranged.length), sub: <span style={{ ...ftLabel }}>in range</span> },
  ];

  const kpiAccentColors = ["var(--ft-red)", "var(--ft-amber)", "var(--ft-red)", "var(--ft-blue)", "var(--ft-muted)"];
  return (
    <div style={{ ...panelStyle, marginBottom: 8 }}>
      <PanelHeader title="Spend Summary" right={<RangeSelector value={range} onChange={onRangeChange} />} />
      <div
        className="ft-kpi-bar"
        style={{ display: "grid", gap: 1, background: "var(--ft-border)", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : `repeat(${tiles.length}, 1fr)` }}
      >
        {tiles.map((t, i) => (
          <AnalyticsKpiCell
            key={t.label}
            label={t.label}
            value={t.value}
            delta={t.sub}
            accentColor={kpiAccentColors[i] ?? "var(--ft-accent)"}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Spending Velocity Chart ──────────────────────────────────────────────────
function SpendingVelocity({ allExpenses, budgetTotal, range, onRangeChange }: {
  allExpenses: Tx[];
  budgetTotal?: number;
  range: Range;
  onRangeChange: (r: Range) => void;
}) {
  // Build 24 months of data so we can compute a 12-month rolling average
  const data = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 23; i >= 0; i--) {
      const ym = monthsAgoStr(i);
      map[ym] = 0;
    }
    for (const t of allExpenses) {
      const ym = getYYYYMM(t.date);
      if (ym in map) map[ym] += t.gbpValue;
    }
    const entries = Object.entries(map).map(([ym, total]) => {
      const [, m] = ym.split("-");
      return { ym, month: MONTH_SHORT[parseInt(m) - 1], total: Math.round(total), rollingAvg: 0 };
    });
    // Compute 12-month rolling average for each point
    for (let i = 0; i < entries.length; i++) {
      const window = entries.slice(Math.max(0, i - 11), i + 1);
      const sum = window.reduce((s, e) => s + e.total, 0);
      entries[i].rollingAvg = Math.round(sum / window.length);
    }
    // Return only the last 12 months for display
    return entries.slice(-12);
  }, [allExpenses]);

  const avg = data.reduce((s, d) => s + d.total, 0) / (data.length || 1);

  return (
    <div style={panelStyle}>
      <PanelHeader
        title="Spending Velocity"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 16, height: 1, background: "var(--ft-cyan)", display: "inline-block" }} />
              <div style={{ width: 4, height: 4, background: "var(--ft-cyan)", borderRadius: "50%", display: "inline-block" }} />
              <span style={{ ...mono, fontSize: 8, color: "var(--ft-dim)" }}>12m avg</span>
            </div>
            <div style={{ width: 1, height: 14, background: "var(--ft-border)" }} />
            <RangeSelector value={range} onChange={onRangeChange} />
          </div>
        }
      />
      <div style={{ padding: "8px 0 8px 0" }}>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="velGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--ft-red)" stopOpacity={0.12} />
                <stop offset="100%" stopColor="var(--ft-red)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)", className: "pnum" }} axisLine={false} tickLine={false} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              content={(p) => (
                <div style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 10 }}>
                  <div style={{ color: "var(--ft-dim)", fontSize: 9, marginBottom: 4 }}>{String(p.label ?? "")}</div>
                  {(p.payload as TooltipEntry[])?.map((entry, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
                      {entry.color && <div style={{ width: 6, height: 6, borderRadius: "50%", background: entry.color, flexShrink: 0 }} />}
                      <span style={{ color: "var(--ft-dim)", fontSize: 9 }}>{String(entry.name ?? "")}</span>
                      <span className="pnum" style={{ color: "var(--ft-text)", fontWeight: 700 }}>{formatGbp(typeof entry.value === "number" ? entry.value : 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            />
            <ReferenceLine y={avg} stroke="var(--ft-accent)" strokeDasharray="4 3" strokeWidth={1} label={{ value: "avg", position: "right", fill: "var(--ft-accent)", fontSize: 8, fontFamily: "var(--font-mono)" }} />
            {budgetTotal && budgetTotal > 0 && (
              <ReferenceLine y={budgetTotal} stroke="var(--ft-green)" strokeDasharray="2 4" strokeWidth={1.5} label={{ value: "budget", position: "right", fill: "var(--ft-green)", fontSize: 8, fontFamily: "var(--font-mono)" }} />
            )}
            <Area type="monotone" dataKey="total" name="Spend" stroke="var(--ft-red)" strokeWidth={1.5} fill="url(#velGrad)" dot={false} />
            <Line type="monotone" dataKey="rollingAvg" name="12m Avg" stroke="var(--ft-cyan)" strokeWidth={1.5} dot={false} strokeDasharray="5 3" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Income vs Expense Split ──────────────────────────────────────────────────
interface IncomeExpenseSplitProps {
  allTxs: Tx[];
  annotations: SpendingAnnotation[];
  onAnnotationsChange: (a: SpendingAnnotation[]) => void;
}

function IncomeExpenseSplit({ allTxs, annotations, onAnnotationsChange }: IncomeExpenseSplitProps) {
  const [addingMonth, setAddingMonth] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState("");

  const bars = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const ym = monthsAgoStr(5 - i);
      const [, m] = ym.split("-");
      const income = allTxs.filter(t => t.type === "income" && getYYYYMM(t.date) === ym).reduce((s, t) => s + t.gbpValue, 0);
      const expense = allTxs.filter(t => t.type === "expense" && getYYYYMM(t.date) === ym).reduce((s, t) => s + t.gbpValue, 0);
      return { month: MONTH_SHORT[parseInt(m) - 1], ym, income: Math.round(income), expense: Math.round(expense), net: Math.round(income - expense) };
    });
  }, [allTxs]);

  const now = new Date();
  const thisM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const curIncome = allTxs.filter(t => t.type === "income" && getYYYYMM(t.date) === thisM).reduce((s, t) => s + t.gbpValue, 0);
  const curExpense = allTxs.filter(t => t.type === "expense" && getYYYYMM(t.date) === thisM).reduce((s, t) => s + t.gbpValue, 0);
  const savingsPct = curIncome > 0 ? Math.round(((curIncome - curExpense) / curIncome) * 100) : 0;
  const pieData = [
    { name: "Income", value: Math.max(curIncome, 0) },
    { name: "Expense", value: Math.max(curExpense, 0) },
  ];

  function handleSaveAnnotation() {
    if (!addingMonth || !labelInput.trim()) return;
    const next = [...annotations, { id: crypto.randomUUID(), month: addingMonth, label: labelInput.trim() }];
    onAnnotationsChange(next);
    setAddingMonth(null);
    setLabelInput("");
  }

  function handleDeleteAnnotation(id: string) {
    onAnnotationsChange(annotations.filter(a => a.id !== id));
  }

  const visibleAnnotations = annotations
    .filter(a => bars.some(b => b.ym === a.month))
    .slice(-4);

  return (
    <div className="ft-chart-sidebar" style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 8, marginBottom: 8 }}>
      <div style={panelStyle}>
        <PanelHeader title="Income vs Expense" />
        <div style={{ padding: "8px 0 4px 0" }}>
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={bars} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)", className: "pnum" }} axisLine={false} tickLine={false} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={(p) => <MonoTooltip active={p.active} payload={p.payload as TooltipEntry[]} label={String(p.label ?? "")} formatter={(v, n) => [formatGbp(v), n]} />} />
              <Bar dataKey="income" fill="var(--ft-green)" opacity={0.8} radius={[0, 0, 0, 0]} maxBarSize={20} />
              <Bar dataKey="expense" fill="var(--ft-red)" opacity={0.8} radius={[0, 0, 0, 0]} maxBarSize={20} />
              <Line type="monotone" dataKey="net" stroke="var(--ft-accent)" strokeWidth={1.5} dot={<LineDot stroke="var(--ft-accent)" />} activeDot={{ r: 4, fill: "var(--ft-accent)", strokeWidth: 0 }} />
              {annotations
                .filter(a => bars.some(b => b.ym === a.month))
                .map(a => (
                  <ReferenceLine
                    key={a.id}
                    x={MONTH_SHORT[parseInt(a.month.split("-")[1]) - 1]}
                    stroke="var(--ft-amber)"
                    strokeDasharray="3 3"
                    label={{ value: a.label, position: "top", fill: "var(--ft-amber)", fontSize: 8, fontFamily: "var(--font-mono)" }}
                  />
                ))
              }
            </ComposedChart>
          </ResponsiveContainer>

          {/* ── Annotation panel ── */}
          <div style={{ margin: "8px 12px 4px", borderTop: "2px solid var(--ft-border2)", paddingTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, background: "var(--ft-amber)", opacity: 0.85, flexShrink: 0 }} />
                <span style={{ ...ftLabel, color: "var(--ft-amber)" }}>Chart Annotations</span>
                {visibleAnnotations.length > 0 && (
                  <span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", padding: "0 5px", background: "var(--ft-raised)", border: "1px solid var(--ft-border)" }}>
                    {visibleAnnotations.length}
                  </span>
                )}
              </div>
              {addingMonth === null && (
                <button
                  onClick={() => { setAddingMonth(thisM); setLabelInput(""); }}
                  style={{ ...mono, fontSize: 9, padding: "3px 9px", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", cursor: "pointer", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 4 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ft-amber)"; e.currentTarget.style.color = "var(--ft-amber)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--ft-border2)"; e.currentTarget.style.color = "var(--ft-text)"; }}
                >
                  + Annotate month
                </button>
              )}
            </div>

            {addingMonth !== null && (
              <div style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-amber)", padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ ...ftLabel, color: "var(--ft-amber)", marginBottom: 8 }}>Add annotation</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ ...ftLabel, fontSize: 8 }}>Month</span>
                    <input type="month" value={addingMonth} onChange={e => setAddingMonth(e.target.value)}
                      style={{ ...mono, fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "4px 8px", outline: "none", borderRadius: 0, height: 28 }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 120 }}>
                    <span style={{ ...ftLabel, fontSize: 8 }}>Label</span>
                    <input type="text" value={labelInput} onChange={e => setLabelInput(e.target.value)} placeholder="e.g. Bonus received, Holiday spending…" maxLength={48}
                      autoFocus
                      onKeyDown={e => { if (e.key === "Enter") handleSaveAnnotation(); if (e.key === "Escape") { setAddingMonth(null); setLabelInput(""); } }}
                      style={{ ...mono, fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "4px 8px", outline: "none", borderRadius: 0, height: 28 }} />
                  </div>
                  <div style={{ display: "flex", gap: 6, alignSelf: "flex-end", paddingBottom: 0 }}>
                    <button onClick={handleSaveAnnotation} disabled={!labelInput.trim()}
                      style={{ ...mono, fontSize: 10, padding: "4px 12px", background: labelInput.trim() ? "var(--ft-amber)" : "var(--ft-raised)", border: "none", color: labelInput.trim() ? "var(--ft-base)" : "var(--ft-dim)", cursor: labelInput.trim() ? "pointer" : "not-allowed", letterSpacing: "0.04em", height: 28 }}>
                      Save
                    </button>
                    <button onClick={() => { setAddingMonth(null); setLabelInput(""); }}
                      style={{ ...mono, fontSize: 10, padding: "4px 10px", background: "transparent", border: "1px solid var(--ft-border)", color: "var(--ft-dim)", cursor: "pointer", height: 28 }}>
                      Cancel
                    </button>
                  </div>
                </div>
                <div style={{ ...ftLabel, fontSize: 8, marginTop: 6, color: "var(--ft-dim)" }}>
                  Press Enter to save · Esc to cancel · Annotated months appear as dashed lines on the chart above
                </div>
              </div>
            )}

            {visibleAnnotations.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {visibleAnnotations.map((a, ai) => (
                  <AnnotationRow
                    key={a.id}
                    annotation={a}
                    index={ai}
                    onDelete={handleDeleteAnnotation}
                  />
                ))}
              </div>
            ) : (
              <div style={{ ...ftLabel, fontStyle: "italic", padding: "6px 0", color: "var(--ft-dim)" }}>No annotations yet — click "Annotate month" to mark significant events on the chart</div>
            )}
          </div>
        </div>
      </div>

      {/* This Month split panel */}
      <div style={{ ...panelStyle, marginBottom: 0, display: "flex", flexDirection: "column" }}>
        <PanelHeader title="This Month Split" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "12px 8px" }}>
          <div style={{ position: "relative", width: 140, height: 140 }}>
            <PieChart width={140} height={140}>
              <Pie data={pieData} cx={65} cy={65} innerRadius={44} outerRadius={62} dataKey="value" strokeWidth={0}>
                <Cell fill="var(--ft-green)" opacity={0.85} />
                <Cell fill="var(--ft-red)" opacity={0.85} />
              </Pie>
            </PieChart>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
              <div className="pnum" style={{ ...mono, fontSize: 18, fontWeight: 700, color: savingsPct >= 0 ? "var(--ft-green)" : "var(--ft-red)", lineHeight: 1 }}>{savingsPct}%</div>
              <div style={{ ...ftLabel, fontSize: 8, marginTop: 2 }}>saved</div>
            </div>
          </div>

          {/* Split panel data rows */}
          <div style={{ width: "100%", borderTop: "1px solid var(--ft-border)", marginTop: 10 }}>
            {[
              { label: "Income", value: formatGbp(curIncome), color: "var(--ft-green)" },
              { label: "Expense", value: formatGbp(curExpense), color: "var(--ft-red)" },
              { label: "Net", value: formatGbp(curIncome - curExpense), color: curIncome >= curExpense ? "var(--ft-green)" : "var(--ft-red)" },
            ].map((row, i) => (
              <SplitRow
                key={row.label}
                label={row.label}
                value={row.value}
                color={row.color}
                isLast={i === 2}
                index={i}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Category Intelligence ────────────────────────────────────────────────────
interface CategoryIntelligenceProps {
  expenses: Tx[];
  range: Range;
  onCategoryClick: (category: string) => void;
}

function CategoryIntelligence({ expenses, range, onCategoryClick }: CategoryIntelligenceProps) {
  const isMobile = useIsMobile();
  const [sortBy, setSortBy] = useState<"total" | "count" | "change">("total");
  const now = new Date();
  const thisM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(now); prevDate.setMonth(prevDate.getMonth() - 1);
  const lastM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  const cutoff = cutoffDate(range);
  const ranged = expenses.filter(t => new Date(t.date) >= cutoff);
  const totalSpend = ranged.reduce((s, t) => s + t.gbpValue, 0);

  const rows = useMemo(() => {
    const map: Record<string, { total: number; count: number; thisM: number; lastM: number }> = {};
    for (const t of ranged) {
      const c = t.category || "Other";
      if (!map[c]) map[c] = { total: 0, count: 0, thisM: 0, lastM: 0 };
      map[c].total += t.gbpValue; map[c].count += 1;
      if (getYYYYMM(t.date) === thisM) map[c].thisM += t.gbpValue;
      if (getYYYYMM(t.date) === lastM) map[c].lastM += t.gbpValue;
    }
    return Object.entries(map).map(([cat, v]) => ({
      cat, ...v, avg: v.count > 0 ? v.total / v.count : 0,
      pctOfTotal: totalSpend > 0 ? (v.total / totalSpend) * 100 : 0,
      change: pctChange(v.lastM, v.thisM),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, range, thisM, lastM]);

  const sorted = [...rows].sort((a, b) =>
    sortBy === "total" ? b.total - a.total :
    sortBy === "count" ? b.count - a.count :
    b.change - a.change
  );

  const catMax = Math.max(...sorted.map(r => r.total), 1);

  const sortBtn = (key: typeof sortBy, btnLabel: string) => (
    <button onClick={() => setSortBy(key)} style={{
      ...mono, fontSize: 9, padding: "2px 6px",
      background: sortBy === key ? "var(--ft-accent)" : "transparent",
      color: sortBy === key ? "var(--ft-base)" : "var(--ft-muted)",
      border: "1px solid var(--ft-border)", cursor: "pointer", letterSpacing: "0.04em",
    }}>{btnLabel}</button>
  );

  return (
    <div style={panelStyle}>
      <PanelHeader
        title="Category Intelligence"
        right={<>{sortBtn("total","Total")} {sortBtn("count","Count")} {sortBtn("change","Change")}</>}
      />
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {(isMobile
                ? ["Category", "Total", "This Month", "Change"]
                : ["Category", "Total", "% Spend", "Count", "Avg/Tx", "This Month", "Last Month", "Change"]
              ).map(h => (
                <th key={h} style={{ ...th, textAlign: h === "Category" ? "left" : "right" }}>{h}</th>
              ))}
              {!isMobile && <th style={{ ...th, textAlign: "left", minWidth: 60 }}>Share</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, ri) => (
              <CategoryRow
                key={r.cat}
                row={r}
                catMax={catMax}
                totalSpend={totalSpend}
                onCategoryClick={onCategoryClick}
                rowIndex={ri}
                isMobile={isMobile}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "4px 12px 6px", borderTop: "1px solid var(--ft-border)" }}>
        <span style={{ ...ftLabel }}>Click row to drill into transactions · Total in range: </span>
        <span className="pnum" style={{ ...mono, fontSize: 9, color: "var(--ft-accent)" }}>{formatGbp(totalSpend)}</span>
      </div>
    </div>
  );
}

// ─── Calendar Heatmap ─────────────────────────────────────────────────────────
const CAL_MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

interface HeatmapDay {
  day: number;
  date: string;
  total: number;
  txs: Tx[];
}

// Use CSS variable-based intensity instead of hardcoded colors
function intensityStyle(amount: number): React.CSSProperties {
  if (amount === 0) return { background: "var(--ft-surface)" };
  if (amount < 25) return { background: "color-mix(in srgb, var(--ft-green) 15%, var(--ft-surface))" };
  if (amount < 75) return { background: "color-mix(in srgb, var(--ft-amber) 30%, var(--ft-surface))" };
  if (amount < 150) return { background: "color-mix(in srgb, var(--ft-red) 40%, var(--ft-surface))" };
  return { background: "color-mix(in srgb, var(--ft-red) 75%, var(--ft-surface))" };
}

function CalendarHeatmap({ expenses }: { expenses: Tx[] }) {
  const isMobile = useIsMobile();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [tooltip, setTooltip] = useState<{ day: HeatmapDay; x: number; y: number } | null>(null);

  const navigateMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setMonth(m);
    setYear(y);
    setTooltip(null);
  };

  const y = year;
  const m = month;

  const days = useMemo<HeatmapDay[]>(() => {
    const ym = `${y}-${String(m + 1).padStart(2, "0")}`;
    const monthTxs = expenses.filter(t => t.date.startsWith(ym));
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const result: HeatmapDay[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${ym}-${String(d).padStart(2, "0")}`;
      const txs = monthTxs.filter(t => t.date === dateStr);
      result.push({ day: d, date: dateStr, total: txs.reduce((s, t) => s + t.gbpValue, 0), txs });
    }
    return result;
  }, [expenses, y, m]);

  const firstDOW = (() => {
    const d = new Date(y, m, 1).getDay();
    return d === 0 ? 6 : d - 1;
  })();

  const gridCells: (HeatmapDay | null)[] = [];
  for (let i = 0; i < firstDOW; i++) gridCells.push(null);
  for (const d of days) gridCells.push(d);
  while (gridCells.length % 7 !== 0) gridCells.push(null);

  const rows: (HeatmapDay | null)[][] = [];
  for (let i = 0; i < gridCells.length; i += 7) rows.push(gridCells.slice(i, i + 7));

  const CELL_W = isMobile ? 38 : 44;
  const CELL_H = isMobile ? 34 : 40;

  return (
    <div style={panelStyle}>
      <PanelHeader
        title={`Daily Spend Heatmap · ${CAL_MONTH_NAMES[m]} ${y}`}
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={() => navigateMonth(-1)}
              style={{ ...mono, background: "none", border: "1px solid var(--ft-border)", color: "var(--ft-muted)", cursor: "pointer", padding: "2px 7px", fontSize: 12, lineHeight: 1 }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--ft-text)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--ft-muted)"; }}>‹</button>
            <span style={{ ...mono, fontSize: 10, color: "var(--ft-text)", minWidth: 110, textAlign: "center" }}>{CAL_MONTH_NAMES[m].toUpperCase().slice(0, 3)} {y}</span>
            <button onClick={() => navigateMonth(1)}
              style={{ ...mono, background: "none", border: "1px solid var(--ft-border)", color: "var(--ft-muted)", cursor: "pointer", padding: "2px 7px", fontSize: 12, lineHeight: 1 }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--ft-text)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--ft-muted)"; }}>›</button>
          </div>
        }
      />
      <div style={{ padding: "8px 12px" }}>
        <div className="ft-scroll-x" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        {/* Day-of-week headers */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(7, ${CELL_W}px)`, gap: 2, marginBottom: 2, minWidth: `${7 * CELL_W + 6 * 2}px` }}>
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
            <div key={d} style={{ ...ftLabel, textAlign: "center", fontSize: 8, padding: "2px 0" }}>{d}</div>
          ))}
        </div>

        <div style={{ position: "relative", minWidth: `${7 * CELL_W + 6 * 2}px` }} data-heatmap-root="">
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {rows.map((row, ri) => (
              <div key={ri} style={{ display: "grid", gridTemplateColumns: `repeat(7, ${CELL_W}px)`, gap: 2 }}>
                {row.map((cell, ci) => {
                  if (!cell) return <div key={ci} style={{ width: CELL_W, height: CELL_H, background: "transparent" }} />;
                  const bgStyle = intensityStyle(cell.total);
                  const isToday = cell.date === now.toISOString().slice(0, 10);
                  const isHighSpend = cell.total >= 150;
                  return (
                    <div
                      key={ci}
                      onMouseEnter={e => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const parent = e.currentTarget.closest<HTMLElement>("[data-heatmap-root]");
                        const parentRect = parent?.getBoundingClientRect() ?? rect;
                        setTooltip({ day: cell, x: rect.left - parentRect.left + CELL_W / 2, y: rect.top - parentRect.top });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      style={{
                        width: CELL_W,
                        height: CELL_H,
                        ...bgStyle,
                        border: isToday ? "1px solid var(--ft-accent)" : "1px solid var(--ft-border)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: cell.txs.length > 0 ? "pointer" : "default",
                        gap: 1,
                      }}
                    >
                      <span style={{ ...mono, fontSize: 9, color: isHighSpend ? "var(--ft-text)" : "var(--ft-muted)", lineHeight: 1 }}>
                        {cell.day}
                      </span>
                      {cell.total > 0 && (
                        <span className="pnum" style={{ ...mono, fontSize: 8, fontWeight: 700, color: isHighSpend ? "var(--ft-text)" : "var(--ft-muted)", lineHeight: 1 }}>
                          £{Math.round(cell.total)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {tooltip && tooltip.day.txs.length > 0 && (
            <div style={{
              position: "absolute",
              left: tooltip.x,
              top: tooltip.y - 8,
              transform: "translate(-50%, -100%)",
              background: "var(--ft-raised)",
              border: "1px solid var(--ft-border)",
              padding: "8px 10px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              zIndex: 50,
              pointerEvents: "none",
              minWidth: 160,
              maxWidth: 240,
              boxShadow: "none",
            }}>
              <div style={{ fontSize: 9, color: "var(--ft-dim)", marginBottom: 5, letterSpacing: "0.06em" }}>
                {tooltip.day.date} · <span className="pnum">{formatGbp(tooltip.day.total)}</span>
              </div>
              {tooltip.day.txs.slice(0, 5).map(t => (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
                  <span style={{ color: "var(--ft-muted)", fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>
                    {t.description || t.category || "—"}
                  </span>
                  <span className="pnum" style={{ color: "var(--ft-red)", fontWeight: 700, fontSize: 9, flexShrink: 0 }}>{formatGbp(t.gbpValue)}</span>
                </div>
              ))}
              {tooltip.day.txs.length > 5 && (
                <div style={{ color: "var(--ft-dim)", fontSize: 8, marginTop: 3 }}>+{tooltip.day.txs.length - 5} more</div>
              )}
            </div>
          )}
        </div>

        </div>{/* end ft-scroll-x */}
        {/* Legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <span style={{ ...ftLabel, fontSize: 8 }}>Intensity:</span>
          {[
            { style: intensityStyle(0), label: "None" },
            { style: intensityStyle(10), label: "<£25" },
            { style: intensityStyle(50), label: "£25-75" },
            { style: intensityStyle(100), label: "£75-150" },
            { style: intensityStyle(200), label: "£150+" },
          ].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 10, height: 10, border: "1px solid var(--ft-border)", opacity: 0.7, ...l.style }} />
              <span style={{ ...ftLabel, fontSize: 8 }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Spending Heatmap (day × week) ───────────────────────────────────────────
function SpendingHeatmap({ expenses }: { expenses: Tx[] }) {
  const WEEK_LABELS = ["Wk 1","Wk 2","Wk 3","Wk 4","Wk 5"];
  const heatmap = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => Array(5).fill(0));
    for (const t of expenses) { grid[getDOW(t.date)][getWeekOfMonth(t.date)] += t.gbpValue; }
    return grid;
  }, [expenses]);
  const maxVal = Math.max(...heatmap.flat(), 0.01);
  const rowTotals = heatmap.map(r => r.reduce((s, v) => s + v, 0));
  const colTotals = Array.from({ length: 5 }, (_, wi) => heatmap.reduce((s, r) => s + r[wi], 0));

  return (
    <div style={{ ...panelStyle, marginBottom: 0 }}>
      <PanelHeader title="Spending Pattern · Day × Week" />
      <div style={{ overflowX: "auto", padding: "0 0 4px 0" }}>
        <table style={{ borderCollapse: "collapse", minWidth: 360 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 36 }}></th>
              {WEEK_LABELS.map(w => <th key={w} style={{ ...th, textAlign: "center", minWidth: 66 }}>{w}</th>)}
              <th style={{ ...th, textAlign: "right", paddingLeft: 12 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {DOW_LABELS.map((day, di) => (
              <tr key={day}>
                <td style={{ ...td, color: "var(--ft-dim)", fontSize: 9, paddingRight: 8 }}>{day}</td>
                {heatmap[di].map((val, wi) => {
                  const intensity = maxVal > 0 ? val / maxVal : 0;
                  const heatBg = val === 0
                    ? "transparent"
                    : `color-mix(in srgb, var(--ft-red) ${Math.round(Math.max(6, intensity * 60))}%, transparent)`;
                  const isMax = val === maxVal && val > 0;
                  return (
                    <td key={wi} style={{ padding: "3px 3px" }}>
                      <div title={formatGbp(val)} className="pnum" style={{
                        background: heatBg,
                        border: isMax ? "1px solid var(--ft-amber)" : "1px solid var(--ft-border)",
                        height: 32,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "var(--font-mono)",
                        fontVariantNumeric: "tabular-nums",
                        fontSize: val === 0 ? 9 : 10,
                        color: intensity > 0.5 ? "var(--ft-text)" : "var(--ft-muted)",
                        minWidth: 58,
                        cursor: "default",
                      }}>{val === 0 ? "—" : formatGbp(val)}</div>
                    </td>
                  );
                })}
                <td className="pnum" style={{ ...td, textAlign: "right", color: "var(--ft-accent)", paddingLeft: 12 }}>{formatGbp(rowTotals[di])}</td>
              </tr>
            ))}
            <tr style={{ borderTop: "1px solid var(--ft-border2)" }}>
              <td style={{ ...td, color: "var(--ft-dim)", fontSize: 9, fontWeight: 600 }}>Total</td>
              {colTotals.map((v, wi) => <td key={wi} className="pnum" style={{ ...td, textAlign: "center", color: "var(--ft-accent)" }}>{formatGbp(v)}</td>)}
              <td className="pnum" style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formatGbp(expenses.reduce((s, t) => s + t.gbpValue, 0))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Day of Week Patterns ─────────────────────────────────────────────────────
function DayOfWeekPatterns({ expenses }: { expenses: Tx[] }) {
  const data = useMemo(() => {
    const totals = Array(7).fill(0);
    const counts = Array(7).fill(0);
    for (const t of expenses) { const d = getDOW(t.date); totals[d] += t.gbpValue; counts[d] += 1; }
    return DOW_LABELS.map((name, i) => ({ name, total: Math.round(totals[i]), count: counts[i], weekend: i >= 5 }));
  }, [expenses]);

  return (
    <div style={{ ...panelStyle, marginBottom: 0 }}>
      <PanelHeader title="Spend by Day of Week" />
      <div style={{ padding: "4px 0" }}>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)", className: "pnum" }} axisLine={false} tickLine={false} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={(p) => <MonoTooltip active={p.active} payload={p.payload as TooltipEntry[]} label={String(p.label ?? "")} formatter={(v) => [formatGbp(v), "Spend"]} />} />
            <Bar dataKey="total" radius={[0, 0, 0, 0]} maxBarSize={28}>
              {data.map((d, i) => <Cell key={i} fill={d.weekend ? "var(--ft-amber)" : "var(--ft-accent)"} opacity={0.85} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", justifyContent: "space-around", marginTop: 2, paddingBottom: 6 }}>
          {data.map(d => (
            <div key={d.name} style={{ textAlign: "center" }}>
              <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>{d.count}x</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Top Merchants ────────────────────────────────────────────────────────────
function TopMerchants({ expenses }: { expenses: Tx[] }) {
  const isMobile = useIsMobile();
  const now = new Date();
  const thisM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(now); prevDate.setMonth(prevDate.getMonth() - 1);
  const lastM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const merchants = useMemo(() => {
    const map: Record<string, { total: number; count: number; thisM: number; lastM: number }> = {};
    for (const t of expenses) {
      const d = t.description?.trim() || "(No description)";
      if (!map[d]) map[d] = { total: 0, count: 0, thisM: 0, lastM: 0 };
      map[d].total += t.gbpValue; map[d].count += 1;
      if (getYYYYMM(t.date) === thisM) map[d].thisM += t.gbpValue;
      if (getYYYYMM(t.date) === lastM) map[d].lastM += t.gbpValue;
    }
    return Object.entries(map)
      .map(([desc, v]) => ({ desc, ...v, avg: v.count > 0 ? v.total / v.count : 0, change: pctChange(v.lastM, v.thisM) }))
      .sort((a, b) => b.total - a.total).slice(0, 15);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, thisM, lastM]);

  const maxTotal = merchants[0]?.total ?? 1;

  return (
    <div style={panelStyle}>
      <PanelHeader title="Top Merchants / Payees" />
      {merchants.length === 0 ? (
        <div style={{ ...ftLabel, textAlign: "center", padding: "20px 0" }}>No expense data yet</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {(isMobile
                  ? ["#","Merchant","Times","Total","This Month"]
                  : ["#","Merchant","Bar","Times","Total","Avg/Visit","This Month","vs Last"]
                ).map((h, i) => (
                  <th key={i} style={{ ...th, textAlign: i <= (isMobile ? 1 : 2) ? "left" : "right" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {merchants.map((m, i) => (
                <MerchantRow key={m.desc} merchant={m} maxTotal={maxTotal} index={i} isMobile={isMobile} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Month Day Pattern ────────────────────────────────────────────────────────
function MonthDayPattern({ expenses }: { expenses: Tx[] }) {
  const data = useMemo(() => {
    const bars = Array(31).fill(0);
    for (const t of expenses) bars[new Date(t.date).getDate() - 1] += t.gbpValue;
    return bars.map((v, i) => ({ day: i + 1, total: Math.round(v) }));
  }, [expenses]);

  const maxVal = Math.max(...data.map(d => d.total), 1);

  return (
    <div style={panelStyle}>
      <PanelHeader title="Month Day Spending Pattern" />
      <div style={{ padding: "4px 0" }}>
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <XAxis dataKey="day" tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} interval={4} />
            <YAxis tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)", className: "pnum" }} axisLine={false} tickLine={false} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={(p) => <MonoTooltip active={p.active} payload={p.payload as TooltipEntry[]} label={p.label != null ? `Day ${p.label}` : ""} formatter={(v) => [formatGbp(v), "Day total"]} />} />
            <Bar dataKey="total" radius={[0, 0, 0, 0]} maxBarSize={12}>
              {data.map((d, i) => {
                const intensity = d.total / maxVal;
                return <Cell key={i} fill={intensity > 0.7 ? "var(--ft-accent)" : "var(--ft-blue)"} opacity={0.3 + intensity * 0.7} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Biggest Transactions ─────────────────────────────────────────────────────
function BiggestTransactions({ expenses }: { expenses: Tx[] }) {
  const top8 = useMemo(() =>
    [...expenses].sort((a, b) => b.gbpValue - a.gbpValue).slice(0, 8)
  , [expenses]);
  const max = top8[0]?.gbpValue ?? 1;

  return (
    <div style={{ ...panelStyle, marginBottom: 0 }}>
      <PanelHeader title="Biggest Transactions · All Time" />
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {["#","Description","Category","Date","Amount"].map((h, i) => (
                <th key={h} style={{ ...th, textAlign: i >= 4 ? "right" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {top8.map((t, i) => (
              <BigTxRow key={t.id} tx={t} index={i} max={max} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Recurring vs One-Off ─────────────────────────────────────────────────────
function RecurringVsOneOff({ expenses }: { expenses: Tx[] }) {
  const { recurring, oneOff, recurringList } = useMemo(() => {
    const descMap: Record<string, { total: number; months: Set<string>; count: number }> = {};
    for (const t of expenses) {
      const d = t.description?.trim() || "(No description)";
      if (!descMap[d]) descMap[d] = { total: 0, months: new Set(), count: 0 };
      descMap[d].total += t.gbpValue; descMap[d].count += 1; descMap[d].months.add(getYYYYMM(t.date));
    }
    let rec = 0, one = 0;
    const recList: { desc: string; total: number; count: number }[] = [];
    for (const [desc, v] of Object.entries(descMap)) {
      if (v.count >= 3 && v.months.size >= 2) { rec += v.total; recList.push({ desc, total: v.total, count: v.count }); }
      else one += v.total;
    }
    return { recurring: rec, oneOff: one, recurringList: recList.sort((a, b) => b.total - a.total).slice(0, 12) };
  }, [expenses]);

  const total = recurring + oneOff || 1;
  const recPct = Math.round((recurring / total) * 100);

  return (
    <div style={{ ...panelStyle, marginBottom: 0 }}>
      <PanelHeader title="Recurring vs One-Off" />
      <div style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ ...mono, fontSize: 11, color: "var(--ft-amber)" }}>Recurring <span className="pnum">{formatGbp(recurring)}</span> (<span className="pnum">{recPct}%</span>)</span>
          <span style={{ ...mono, fontSize: 11, color: "var(--ft-muted)" }}>One-off <span className="pnum">{formatGbp(oneOff)}</span> (<span className="pnum">{100 - recPct}%</span>)</span>
        </div>
        <div style={{ height: 16, background: "var(--ft-border)", overflow: "hidden", display: "flex" }}>
          <div style={{ width: `${recPct}%`, background: "var(--ft-amber)", opacity: 0.85 }} />
          <div style={{ flex: 1, background: "var(--ft-surface)" }} />
        </div>
      </div>
      {recurringList.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={th}>Recurring Description</th>
                <th style={{ ...th, textAlign: "right" }}>Times</th>
                <th style={{ ...th, textAlign: "right" }}>All-time Total</th>
              </tr>
            </thead>
            <tbody>
              {recurringList.map((r, i) => (
                <RecurringRow key={r.desc} item={r} index={i} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Income Source Breakdown ──────────────────────────────────────────────────
// PIE_COLORS_LIST defined above at module level (see IncomeSourceRow)
const PIE_COLORS = PIE_COLORS_LIST;

function IncomeSourceBreakdown({ allTxs }: { allTxs: Tx[] }) {
  const categories = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of allTxs) {
      if (t.type !== "income") continue;
      const cat = t.category || "Uncategorised";
      map[cat] = (map[cat] ?? 0) + t.gbpValue;
    }
    return Object.entries(map)
      .map(([cat, total]) => ({ cat, total: Math.round(total) }))
      .sort((a, b) => b.total - a.total);
  }, [allTxs]);

  const total = categories.reduce((s, c) => s + c.total, 0);

  if (categories.length === 0) return null;

  return (
    <div className="ft-chart-sidebar" style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 8, marginBottom: 8 }}>
      <div style={panelStyle}>
        <PanelHeader title="Income Sources" />
        <div style={{ padding: "8px 12px" }}>
          {categories.slice(0, 10).map((c, i) => (
            <IncomeSourceRow
              key={c.cat}
              cat={c.cat}
              total={c.total}
              grandTotal={total}
              colorIndex={i}
              isLast={i === Math.min(categories.length, 10) - 1}
            />
          ))}
        </div>
      </div>
      <div style={panelStyle}>
        <PanelHeader title="Income Share" />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8px 0" }}>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={categories.slice(0, 8)} dataKey="total" nameKey="cat" cx="50%" cy="50%" outerRadius={64} innerRadius={30} strokeWidth={0}>
                {categories.slice(0, 8).map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={(p) => <MonoTooltip active={p.active} payload={p.payload as TooltipEntry[]} label={String(p.label ?? "")} formatter={(v, n) => [formatGbp(v as number), n]} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pnum" style={{ ...mono, fontSize: 10, color: "var(--ft-dim)", textAlign: "center", marginTop: 4 }}>
            Total: {formatGbp(total)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Savings Rate Trend ───────────────────────────────────────────────────────
function SavingsRateTrend({ allTxs }: { allTxs: Tx[] }) {
  const data = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const ym = monthsAgoStr(11 - i);
      const [, m] = ym.split("-");
      const inc = allTxs.filter(t => t.type === "income" && getYYYYMM(t.date) === ym).reduce((s, t) => s + t.gbpValue, 0);
      const exp = allTxs.filter(t => t.type === "expense" && getYYYYMM(t.date) === ym).reduce((s, t) => s + t.gbpValue, 0);
      const rate = inc > 0 ? Math.round(((inc - exp) / inc) * 100) : null;
      return { month: MONTH_SHORT[parseInt(m) - 1], ym, rate, income: Math.round(inc), expense: Math.round(exp) };
    });
  }, [allTxs]);

  const validRates = data.filter(d => d.rate !== null).map(d => d.rate as number);
  const avgRate = validRates.length > 0 ? Math.round(validRates.reduce((a, b) => a + b, 0) / validRates.length) : 0;
  const latestRate = validRates[validRates.length - 1] ?? null;

  return (
    <div style={panelStyle}>
      <PanelHeader
        title="Savings Rate Trend (12 months)"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {latestRate !== null && (
              <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: latestRate >= 20 ? "var(--ft-green)" : latestRate >= 0 ? "var(--ft-amber)" : "var(--ft-red)" }}>
                <span className="pnum">{latestRate}%</span> this month
              </span>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 14, height: 1, borderTop: "2px dashed var(--ft-accent)", display: "inline-block" }} />
              <span style={{ ...mono, fontSize: 8, color: "var(--ft-dim)" }}>target 20%</span>
            </div>
          </div>
        }
      />
      <div style={{ padding: "8px 0 4px 0" }}>
        <ResponsiveContainer width="100%" height={160}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--ft-green)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--ft-green)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)", className: "pnum" }}
              axisLine={false} tickLine={false}
              tickFormatter={v => `${v}%`}
              domain={[-10, 60]}
            />
            <Tooltip
              content={(p) => {
                if (!p.active || !p.payload?.length) return null;
                const d = p.payload[0]?.payload as { rate: number | null; income: number; expense: number };
                return (
                  <div style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 10 }}>
                    <div style={{ color: "var(--ft-dim)", fontSize: 9, marginBottom: 4 }}>{String(p.label ?? "")}</div>
                    <div style={{ color: "var(--ft-text)", fontWeight: 700, marginBottom: 2 }}>
                      Rate: {d.rate !== null ? `${d.rate}%` : "—"}
                    </div>
                    <div style={{ color: "var(--ft-green)", fontSize: 9 }}>Income: <span className="pnum">{formatGbp(d.income)}</span></div>
                    <div style={{ color: "var(--ft-red)", fontSize: 9 }}>Expense: <span className="pnum">{formatGbp(d.expense)}</span></div>
                  </div>
                );
              }}
            />
            <ReferenceLine y={20} stroke="var(--ft-accent)" strokeDasharray="4 3" strokeWidth={1} label={{ value: "20%", position: "right", fill: "var(--ft-accent)", fontSize: 8, fontFamily: "var(--font-mono)", className: "pnum" }} />
            <ReferenceLine y={avgRate} stroke="var(--ft-blue)" strokeDasharray="3 3" strokeWidth={1} label={{ value: `avg ${avgRate}%`, position: "right", fill: "var(--ft-blue)", fontSize: 8, fontFamily: "var(--font-mono)", className: "pnum" }} />
            <ReferenceLine y={0} stroke="var(--ft-border2)" strokeWidth={1} />
            <Area type="monotone" dataKey="rate" name="Savings Rate" stroke="var(--ft-green)" strokeWidth={2} fill="url(#savingsGrad)" dot={(props: { cx?: number; cy?: number; payload?: { rate: number | null } }) => {
              const { cx, cy, payload } = props;
              if (cx == null || cy == null || payload?.rate == null) return <g key="empty" />;
              const r = payload.rate;
              const color = r >= 20 ? "var(--ft-green)" : r >= 0 ? "var(--ft-amber)" : "var(--ft-red)";
              return <circle key={`dot-${cx}`} cx={cx} cy={cy} r={3} fill={color} stroke="none" />;
            }} activeDot={{ r: 4, fill: "var(--ft-green)", strokeWidth: 0 }} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Spending Volatility (σ analysis) ───────────────────────────────────────

function SpendingVolatility({ expenses }: { expenses: Tx[] }) {
  const data = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const ym = monthsAgoStr(11 - i);
      const [, m] = ym.split("-");
      const total = expenses.filter(t => getYYYYMM(t.date) === ym).reduce((s: number, t) => s + t.gbpValue, 0);
      return { ym, label: MONTH_SHORT[parseInt(m) - 1], total };
    }).filter((d: { ym: string; label: string; total: number }) => d.total > 0);

    if (months.length < 3) return null;
    const mean = months.reduce((s: number, d: { total: number }) => s + d.total, 0) / months.length;
    const variance = months.reduce((s: number, d: { total: number }) => s + Math.pow(d.total - mean, 2), 0) / months.length;
    const sigma = Math.sqrt(variance);
    const cv = mean > 0 ? Math.round((sigma / mean) * 100) : 0;
    const max = Math.max(...months.map((d: { total: number }) => d.total));
    return { months, mean, sigma, cv, max };
  }, [expenses]);

  if (!data) return null;

  const { months, mean, sigma, cv, max } = data;
  const cvColor = cv < 15 ? "var(--ft-green)" : cv < 35 ? "var(--ft-amber)" : "var(--ft-red)";
  const cvLabel = cv < 15 ? "LOW VOLATILITY" : cv < 35 ? "MOD VOLATILITY" : "HIGH VOLATILITY";

  // Category-level σ — top 5 most volatile
  const catVolatility = useMemo(() => {
    const catMap = new Map<string, number[]>();
    for (let i = 1; i <= 12; i++) {
      const ym = monthsAgoStr(12 - i);
      const monthExp = expenses.filter(t => getYYYYMM(t.date) === ym);
      const cats = new Set(monthExp.map(t => t.category));
      cats.forEach(cat => {
        const total = monthExp.filter(t => t.category === cat).reduce((s, t) => s + t.gbpValue, 0);
        const arr = catMap.get(cat) ?? [];
        arr.push(total);
        catMap.set(cat, arr);
      });
    }
    return [...catMap.entries()]
      .filter(([, vals]) => vals.length >= 3 && vals.some(v => v > 0))
      .map(([cat, vals]) => {
        const m = vals.reduce((s, v) => s + v, 0) / vals.length;
        const v = vals.reduce((s, x) => s + Math.pow(x - m, 2), 0) / vals.length;
        const s = Math.sqrt(v);
        const c = m > 0 ? Math.round((s / m) * 100) : 0;
        return { cat, cv: c, mean: m };
      })
      .filter(r => r.cv > 0)
      .sort((a, b) => b.cv - a.cv)
      .slice(0, 5);
  }, [expenses]);

  return (
    <div style={panelStyle}>
      <PanelHeader
        title="Spending Volatility (σ)"
        right={
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: cvColor, letterSpacing: "0.08em" }}>
            CV {cv}% · {cvLabel}
          </span>
        }
      />
      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Mini bar chart — 12-month spend bars */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 56 }}>
          {months.map((d) => {
            const pct = max > 0 ? (d.total / max) * 100 : 0;
            const isMean = Math.abs(d.total - mean) < sigma * 0.5;
            const isHigh = d.total > mean + sigma;
            const barCol = isHigh ? "var(--ft-red)" : isMean ? "var(--ft-green)" : "var(--ft-accent)";
            return (
              <div key={d.ym} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 0 }}>
                <div style={{ width: "100%", height: `${pct}%`, background: barCol, minHeight: 2 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", whiteSpace: "nowrap" }}>{d.label}</span>
              </div>
            );
          })}
        </div>
        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "var(--ft-border)" }}>
          {([["MEAN/MO", formatGbp(mean), "var(--ft-text)"], ["STD DEV (σ)", formatGbp(sigma), cvColor], ["COEFF VAR", `${cv}%`, cvColor]] as [string, string, string][]).map(([lbl, val, col]) => (
            <div key={lbl} style={{ background: "var(--ft-surface)", padding: "7px 10px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>{lbl}</div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: col, fontVariantNumeric: "tabular-nums" }}>{val}</div>
            </div>
          ))}
        </div>
        {/* Category σ breakdown */}
        {catVolatility.length > 0 && (
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
              MOST VOLATILE CATEGORIES
            </div>
            {catVolatility.map((r, i) => {
              const col = r.cv < 30 ? "var(--ft-amber)" : "var(--ft-red)";
              return (
                <div key={r.cat} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: i < catVolatility.length - 1 ? "1px solid var(--ft-border)" : "none" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)" }}>{r.cat}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", fontVariantNumeric: "tabular-nums" }}><span className="pnum">{formatGbp(r.mean)}</span>/mo avg</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: col, fontVariantNumeric: "tabular-nums" }}>CV <span className="pnum">{r.cv}%</span></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Income Stability ─────────────────────────────────────────────────────────
function IncomeStability({ allTxs }: { allTxs: Tx[] }) {
  const { months, mean, cv, bestM, worstM, latestMom } = useMemo(() => {
    const ms = Array.from({ length: 12 }, (_, i) => {
      const ym = monthsAgoStr(11 - i);
      const [, m] = ym.split("-");
      const total = allTxs.filter(t => t.type === "income" && getYYYYMM(t.date) === ym).reduce((s: number, t) => s + t.gbpValue, 0);
      return { ym, label: MONTH_SHORT[parseInt(m) - 1], total };
    });
    const nonZero = ms.filter(m => m.total > 0);
    if (nonZero.length < 2) return { months: ms, mean: 0, cv: 0, bestM: null, worstM: null, latestMom: null };
    const avg = nonZero.reduce((s: number, m) => s + m.total, 0) / nonZero.length;
    const variance = nonZero.reduce((s: number, m) => s + Math.pow(m.total - avg, 2), 0) / nonZero.length;
    const sigma = Math.sqrt(variance);
    const coefVar = avg > 0 ? Math.round((sigma / avg) * 100) : 0;
    const best = [...nonZero].sort((a, b) => b.total - a.total)[0];
    const worst = [...nonZero].sort((a, b) => a.total - b.total)[0];
    const thisInc = ms[ms.length - 1].total;
    const lastInc = ms[ms.length - 2].total;
    const mom = lastInc > 0 ? Math.round(((thisInc - lastInc) / lastInc) * 100) : null;
    return { months: ms, mean: avg, cv: coefVar, bestM: best, worstM: worst, latestMom: mom };
  }, [allTxs]);

  if (mean === 0) return null;

  const maxTotal = Math.max(...months.map(m => m.total), 1);
  const stabilityLabel = cv < 10 ? "STABLE" : cv < 25 ? "MODERATE" : "VOLATILE";
  const stabilityColor = cv < 10 ? "var(--ft-green)" : cv < 25 ? "var(--ft-amber)" : "var(--ft-red)";

  return (
    <div style={panelStyle}>
      <PanelHeader title="Income Stability (12 months)"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>CV {cv}%</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: stabilityColor, border: `1px solid ${stabilityColor}44`, padding: "2px 7px", letterSpacing: "0.07em" }}>{stabilityLabel}</span>
          </div>
        }
      />
      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* 12M income bar chart */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 64 }}>
          {months.map((m) => {
            const barH = m.total > 0 ? Math.max(3, (m.total / maxTotal) * 56) : 0;
            const isAbove = m.total > mean;
            const col = m.total === 0 ? "var(--ft-raised)" : isAbove ? "var(--ft-green)" : "var(--ft-amber)";
            const isBest = bestM?.ym === m.ym;
            return (
              <div key={m.ym} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ width: "100%", height: barH, background: col, opacity: m.total > 0 ? (isBest ? 1 : 0.75) : 0.2 }} />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: isBest ? "var(--ft-green)" : "var(--ft-dim)", fontWeight: isBest ? 700 : 400, lineHeight: 1 }}>
                  {m.label}
                </div>
              </div>
            );
          })}
        </div>
        {/* Mean line label */}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: -6, borderTop: "1px dashed var(--ft-border2)", paddingTop: 4 }}>
          avg <span className="pnum">{formatGbp(mean)}</span>/mo
        </div>
        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 1, background: "var(--ft-border)" }}>
          {([
            ["BEST MONTH",  bestM  ? `${bestM.label} ${formatGbp(bestM.total)}`   : "—", "var(--ft-green)"],
            ["WORST MONTH", worstM ? `${worstM.label} ${formatGbp(worstM.total)}` : "—", "var(--ft-amber)"],
            ["STAB (CV)",   `${cv}%`,                                                     stabilityColor  ],
            ["MoM CHANGE",  latestMom != null ? `${latestMom > 0 ? "+" : ""}${latestMom}%` : "—", latestMom != null && latestMom > 0 ? "var(--ft-green)" : latestMom != null ? "var(--ft-red)" : "var(--ft-dim)"],
          ] as [string, string, string][]).map(([lbl, val, col]) => (
            <div key={lbl} style={{ background: "var(--ft-surface)", padding: "7px 9px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>{lbl}</div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: col, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Seasonality Index ───────────────────────────────────────────────────────
function SeasonalityIndex({ expenses }: { expenses: Tx[] }) {
  const data = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const ym = monthsAgoStr(11 - i);
      const [, m] = ym.split("-");
      const total = expenses.filter(t => getYYYYMM(t.date) === ym).reduce((s: number, t) => s + t.gbpValue, 0);
      return { ym, label: MONTH_SHORT[parseInt(m) - 1], total };
    });
    const nonZero = months.filter(m => m.total > 0);
    if (nonZero.length < 3) return null;
    const mean = nonZero.reduce((s: number, m) => s + m.total, 0) / nonZero.length;
    const indexed = months.map(m => ({ ...m, idx: mean > 0 ? Math.round((m.total / mean) * 100) : 0 }));
    const peak = [...indexed].sort((a, b) => b.idx - a.idx)[0];
    const trough = [...indexed].filter(m => m.total > 0).sort((a, b) => a.idx - b.idx)[0];
    return { indexed, mean, peak, trough };
  }, [expenses]);

  if (!data) return null;
  const { indexed, mean, peak, trough } = data;
  const maxIdx = Math.max(...indexed.map(m => m.idx), 120);

  return (
    <div style={panelStyle}>
      <PanelHeader title="Spending Seasonality (12M Index)"
        right={<span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>100 = monthly average · <span className="pnum">{formatGbp(mean)}</span>/mo</span>}
      />
      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Index bar chart */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 60 }}>
          {indexed.map((m) => {
            const barH = m.total > 0 ? Math.max(4, (m.idx / maxIdx) * 52) : 0;
            const col = m.idx === 0 ? "var(--ft-raised)" : m.idx > 120 ? "var(--ft-red)" : m.idx > 105 ? "var(--ft-amber)" : m.idx < 80 ? "var(--ft-cyan)" : "var(--ft-green)";
            const isExtreme = peak?.ym === m.ym || trough?.ym === m.ym;
            return (
              <div key={m.ym} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                {isExtreme && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 6.5, color: col, fontWeight: 700, lineHeight: 1 }}>
                    {peak?.ym === m.ym ? "▲" : "▼"}
                  </div>
                )}
                {!isExtreme && <div style={{ height: 9 }} />}
                <div style={{ width: "100%", height: barH, background: col, opacity: m.total > 0 ? 0.85 : 0.2 }} />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: isExtreme ? col : "var(--ft-dim)", fontWeight: isExtreme ? 700 : 400, lineHeight: 1, whiteSpace: "nowrap" }}>
                  {m.label}
                </div>
                {m.total > 0 && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 6.5, color: "var(--ft-dim)", lineHeight: 1 }}>
                    {m.idx}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Baseline rule */}
        <div style={{ borderTop: "1px dashed var(--ft-border2)", marginTop: -4, paddingTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 14 }}>
            {([["▲ Peak", peak?.label, "var(--ft-red)"], ["▼ Trough", trough?.label, "var(--ft-cyan)"]] as [string, string | undefined, string][]).map(([key, val, col]) => (
              <div key={key} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: col, fontWeight: 700 }}>{key}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-text)" }}>{val ?? "—"}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {([["RED", ">120", "var(--ft-red)"], ["AMB", "105–120", "var(--ft-amber)"], ["GRN", "<80", "var(--ft-cyan)"]] as [string, string, string][]).map(([lbl, range, col]) => (
              <div key={lbl} style={{ display: "flex", gap: 3, alignItems: "center" }}>
                <div style={{ width: 6, height: 6, background: col, opacity: 0.8 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>{range}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Category Momentum ────────────────────────────────────────────────────────
function CategoryMomentum({ expenses }: { expenses: Tx[] }) {
  const rows = useMemo(() => {
    const thisYm = monthsAgoStr(0);
    const lastYm = monthsAgoStr(1);
    const twoAgoYm = monthsAgoStr(2);

    const catTotals = new Map<string, { this: number; last: number; twoAgo: number }>();
    for (const t of expenses) {
      const ym = getYYYYMM(t.date);
      if (ym !== thisYm && ym !== lastYm && ym !== twoAgoYm) continue;
      const cat = t.category ?? "Other";
      const entry = catTotals.get(cat) ?? { this: 0, last: 0, twoAgo: 0 };
      if (ym === thisYm) entry.this += t.gbpValue;
      else if (ym === lastYm) entry.last += t.gbpValue;
      else entry.twoAgo += t.gbpValue;
      catTotals.set(cat, entry);
    }

    return [...catTotals.entries()]
      .filter(([, v]) => v.last > 0 || v.this > 0)
      .map(([cat, v]) => {
        const mom = v.last > 0 ? Math.round(((v.this - v.last) / v.last) * 100) : null;
        const prevMom = v.twoAgo > 0 ? Math.round(((v.last - v.twoAgo) / v.twoAgo) * 100) : null;
        const acceleration = mom != null && prevMom != null ? mom - prevMom : null;
        return { cat, this: v.this, last: v.last, mom, acceleration };
      })
      .sort((a, b) => (b.last + b.this) - (a.last + a.this))
      .slice(0, 8);
  }, [expenses]);

  if (rows.length === 0) return null;

  const momColor = (m: number | null): string => {
    if (m == null) return "var(--ft-dim)";
    if (m > 20) return "var(--ft-red)";
    if (m > 5) return "var(--ft-amber)";
    if (m < -5) return "var(--ft-green)";
    return "var(--ft-dim)";
  };

  return (
    <div style={panelStyle}>
      <PanelHeader title="Category Momentum (MoM Δ)" />
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {(["Category", "Last Month", "This Month", "MoM Δ", "Trend"] as const).map(h => (
                <th key={h} style={{ ...th, textAlign: h === "Category" ? "left" : "right" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const col = momColor(r.mom);
              const arrow = r.mom == null ? "—" : r.mom > 0 ? `+${r.mom}%` : `${r.mom}%`;
              const accel = r.acceleration;
              const accelLabel = accel == null ? "" : accel > 10 ? "ACCEL" : accel < -10 ? "DECEL" : "STABLE";
              const accelCol = accel == null ? "var(--ft-dim)" : accel > 10 ? "var(--ft-red)" : accel < -10 ? "var(--ft-green)" : "var(--ft-dim)";
              const isLast = i === rows.length - 1;
              return (
                <tr key={r.cat} style={{ background: i % 2 === 0 ? "transparent" : "var(--ft-raised)" }}>
                  <td style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", fontSize: 10, fontWeight: 500, color: "var(--ft-text)" }}>{r.cat}</td>
                  <td className="pnum" style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", textAlign: "right", color: "var(--ft-muted)" }}>{r.last > 0 ? formatGbp(r.last) : "—"}</td>
                  <td className="pnum" style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", textAlign: "right", color: "var(--ft-text)" }}>{r.this > 0 ? formatGbp(r.this) : "—"}</td>
                  <td className="pnum" style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", textAlign: "right", color: col, fontWeight: 700 }}>{arrow}</td>
                  <td style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", textAlign: "right" }}>
                    {accelLabel && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: accelCol, fontWeight: 700, letterSpacing: "0.08em", border: `1px solid ${accelCol}44`, padding: "1px 5px" }}>
                        {accelLabel}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Cash Flow Waterfall ─────────────────────────────────────────────────────

function SpendingWaterfall({ allTxs, expenses }: { allTxs: Tx[]; expenses: Tx[] }) {
  const current = new Date().toISOString().slice(0, 7);
  const prevYYMM = monthsAgoStr(1);

  const incomeThisMonth = allTxs.filter(t => t.gbpValue > 0 && t.date.startsWith(current)).reduce((s, t) => s + t.gbpValue, 0);
  const income = incomeThisMonth > 50 ? incomeThisMonth : 3700;

  const thisMonthExp = expenses.filter(t => t.date.startsWith(current));
  const prevMonthExp = expenses.filter(t => t.date.startsWith(prevYYMM));

  const bucketAmounts: Record<string, number> = {};
  for (const tx of thisMonthExp) {
    const cat = (tx.category || "Other").split(" ").map((w: string) => w[0].toUpperCase() + w.slice(1)).join(" ");
    bucketAmounts[cat] = (bucketAmounts[cat] || 0) + Math.abs(tx.gbpValue);
  }

  const useMock = Object.keys(bucketAmounts).length < 2;
  const mockBuckets: [string, number][] = [
    ["Housing",       800], ["Groceries", 280], ["Transport", 190],
    ["Eating Out",    145], ["Subscriptions", 95], ["Other", 190],
  ];
  const activeBuckets: [string, number][] = useMock
    ? mockBuckets
    : Object.entries(bucketAmounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const totalExp = activeBuckets.reduce((s, [, v]) => s + v, 0);
  const savings  = income - totalExp;
  const savingsRate = income > 0 ? (savings / income) * 100 : 0;
  const savingsColor = savings >= 0 ? "var(--ft-green)" : "var(--ft-red)";

  const prevBuckets: Record<string, number> = {};
  for (const tx of prevMonthExp) {
    const cat = (tx.category || "Other").split(" ").map((w: string) => w[0].toUpperCase() + w.slice(1)).join(" ");
    prevBuckets[cat] = (prevBuckets[cat] || 0) + Math.abs(tx.gbpValue);
  }

  const rows: { label: string; amount: number; pct: number; color: string; sign: 1 | -1; prev?: number }[] = [
    { label: "INCOME",    amount: income,  pct: 100,                       color: "var(--ft-green)",  sign: 1 },
    ...activeBuckets.map(([label, amount]) => ({
      label: label.toUpperCase().slice(0, 12),
      amount,
      pct: (amount / income) * 100,
      color: "var(--ft-accent)",
      sign: -1 as const,
      prev: prevBuckets[label],
    })),
    { label: "NET SAVED", amount: Math.abs(savings), pct: Math.abs(savingsRate), color: savingsColor, sign: savings >= 0 ? 1 : -1 },
  ];

  return (
    <div style={panelStyle}>
      <PanelHeader
        title="Cash Flow Waterfall"
        right={
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: savingsColor, fontWeight: 700, letterSpacing: "0.06em" }}>
            {savingsRate >= 0 ? "+" : ""}{savingsRate.toFixed(0)}% saved · {useMock ? "demo data" : "this month"}
          </span>
        }
      />
      <div style={{ paddingBottom: 4 }}>
        {rows.map((row, i) => {
          const isFirst = i === 0;
          const isLast  = i === rows.length - 1;
          const mom = row.prev != null && row.prev > 0 ? Math.round(((row.amount - row.prev) / row.prev) * 100) : null;
          return (
            <div
              key={row.label}
              style={{
                display: "grid", gridTemplateColumns: "100px 1fr 78px 46px",
                alignItems: "center", gap: 10,
                padding: "5px 16px",
                borderBottom: isLast ? "none" : "1px solid var(--ft-border)",
                borderTop: isFirst ? "none" : undefined,
              }}
            >
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.07em", color: isFirst || isLast ? "var(--ft-text)" : "var(--ft-dim)", fontWeight: isFirst || isLast ? 700 : 400 }}>
                {row.label}
              </div>
              <div style={{ height: isFirst || isLast ? 10 : 7, background: "var(--ft-raised)", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(100, row.pct)}%`, background: row.color, opacity: 0.85 }} />
              </div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: isFirst || isLast ? 700 : 400, color: row.sign === 1 ? "var(--ft-text)" : "var(--ft-dim)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {row.sign === -1 ? "−" : ""}{formatGbp(row.amount)}
              </div>
              <div style={{ textAlign: "right" }}>
                {mom != null && !isFirst && !isLast ? (
                  <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, fontWeight: 700, color: mom > 0 ? "var(--ft-red)" : "var(--ft-green)", letterSpacing: "0.04em" }}>
                    {mom > 0 ? "+" : ""}{mom}%
                  </span>
                ) : (
                  <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-muted)" }}>
                    {row.pct.toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "5px 16px 8px", borderTop: "1px solid var(--ft-border)", display: "flex", gap: 16 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>right column = MoM change vs last month</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)", marginLeft: "auto" }}>income → expenses → net savings</span>
      </div>
    </div>
  );
}

// ─── Category Benchmark vs UK Averages ───────────────────────────────────────

const UK_BENCHMARKS: { cat: string; monthly: number; mapKeys: string[] }[] = [
  { cat: "Housing",      monthly: 748,  mapKeys: ["housing", "rent", "mortgage", "utilities", "bills"] },
  { cat: "Food",         monthly: 290,  mapKeys: ["groceries", "food", "supermarket", "shopping"] },
  { cat: "Transport",    monthly: 320,  mapKeys: ["transport", "travel", "fuel", "car", "train", "bus", "tube"] },
  { cat: "Eating Out",   monthly: 183,  mapKeys: ["eating out", "restaurants", "takeaway", "coffee"] },
  { cat: "Recreation",   monthly: 197,  mapKeys: ["recreation", "entertainment", "sport", "hobby", "cinema", "gym"] },
  { cat: "Clothing",     monthly: 113,  mapKeys: ["clothing", "clothes", "fashion", "shoes"] },
  { cat: "Subscriptions",monthly: 97,   mapKeys: ["subscriptions", "subscription", "streaming", "software", "phone", "communication"] },
  { cat: "Healthcare",   monthly: 93,   mapKeys: ["healthcare", "health", "dental", "pharmacy", "medical"] },
];

function CategoryBenchmark({ expenses }: { expenses: Tx[] }) {
  const rows = useMemo(() => {
    const last3 = monthsAgoStr(0);
    const last3Start = monthsAgoStr(2);
    const filtered = expenses.filter(t => t.date >= last3Start && t.date <= last3 + "-31");

    const catTotals: Record<string, number> = {};
    for (const tx of filtered) {
      const raw = (tx.category || "other").toLowerCase();
      catTotals[raw] = (catTotals[raw] || 0) + Math.abs(tx.gbpValue);
    }

    const usesMock = Object.keys(catTotals).length < 2;

    const mockSpend: Record<string, number> = {
      housing: 2250, groceries: 870, transport: 540, "eating out": 390,
      recreation: 420, clothing: 160, subscriptions: 269, healthcare: 45,
    };

    return UK_BENCHMARKS.map(b => {
      let actual = 0;
      if (usesMock) {
        actual = (mockSpend[b.mapKeys[0]] ?? b.monthly * 2.8) / 3;
      } else {
        for (const key of b.mapKeys) {
          actual += catTotals[key] ?? 0;
        }
        actual /= 3; // monthly avg over 3 months
      }
      const diff = actual > 0 ? Math.round(((actual - b.monthly) / b.monthly) * 100) : null;
      return { cat: b.cat, actual: Math.round(actual), benchmark: b.monthly, diff, hasMock: usesMock };
    }).filter(r => r.actual > 0);
  }, [expenses]);

  const maxVal = Math.max(...rows.flatMap(r => [r.actual, r.benchmark]));

  return (
    <div style={panelStyle}>
      <PanelHeader
        title="Category Benchmark · UK Avg"
        right={
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
            ONS Family Spending 2022/23 · 3-month avg
          </span>
        }
      />
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {(["Category", "Your Avg/mo", "UK Avg/mo", "vs Avg", "Distribution"] as const).map(h => (
              <th key={h} style={{ ...th, textAlign: h === "Category" || h === "Distribution" ? "left" : "right", paddingLeft: h === "Distribution" ? 16 : undefined }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isLast = i === rows.length - 1;
            const overBy = r.diff != null && r.diff > 0;
            const underBy = r.diff != null && r.diff < 0;
            const diffColor = overBy ? "var(--ft-red)" : underBy ? "var(--ft-green)" : "var(--ft-dim)";
            const diffLabel = r.diff == null ? "—" : r.diff > 0 ? `+${r.diff}%` : `${r.diff}%`;
            const yourPct = maxVal > 0 ? (r.actual / maxVal) * 100 : 0;
            const ukPct   = maxVal > 0 ? (r.benchmark / maxVal) * 100 : 0;
            return (
              <tr key={r.cat} style={{ background: i % 2 === 0 ? "transparent" : "var(--ft-raised)" }}>
                <td style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", fontSize: 10, fontWeight: 500 }}>{r.cat}</td>
                <td className="pnum" style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", textAlign: "right", fontWeight: 700 }}>{r.actual > 0 ? formatGbp(r.actual) : "—"}</td>
                <td className="pnum" style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", textAlign: "right", color: "var(--ft-muted)" }}>{formatGbp(r.benchmark)}</td>
                <td className="pnum" style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", textAlign: "right", fontWeight: 700, color: diffColor }}>{diffLabel}</td>
                <td style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", paddingLeft: 16, minWidth: 120 }}>
                  <div style={{ position: "relative", height: 12 }}>
                    <div style={{ position: "absolute", left: 0, top: 3, height: 6, width: `${ukPct}%`, background: "var(--ft-border2)", borderRadius: 1 }} />
                    <div style={{ position: "absolute", left: 0, top: 3, height: 6, width: `${yourPct}%`, background: overBy ? "var(--ft-red)" : "var(--ft-green)", opacity: 0.8, borderRadius: 1 }} />
                    {r.diff != null && Math.abs(r.diff) > 3 && (
                      <div style={{
                        position: "absolute",
                        left: `${ukPct}%`, top: 0, width: 1, height: 12,
                        background: "var(--ft-dim)", opacity: 0.6,
                      }} />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ padding: "5px 16px 8px", borderTop: "1px solid var(--ft-border)", display: "flex", gap: 14, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 12, height: 4, background: "var(--ft-border2)", borderRadius: 1 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>UK avg</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 12, height: 4, background: "var(--ft-green)", opacity: 0.8, borderRadius: 1 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>under avg</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 12, height: 4, background: "var(--ft-red)", opacity: 0.8, borderRadius: 1 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>over avg</span>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)", marginLeft: "auto" }}>
          {rows[0]?.hasMock ? "demo data — connect accounts to see real comparison" : "3-month rolling avg"}
        </span>
      </div>
    </div>
  );
}

// ─── Spending Anomaly Detector ───────────────────────────────────────────────

function SpendingAnomalies({ expenses, isDemo }: { expenses: Tx[]; isDemo: boolean }) {
  const rows = useMemo(() => {
    const m0 = monthsAgoStr(0);
    const m1 = monthsAgoStr(1);
    const m2 = monthsAgoStr(2);
    const m3 = monthsAgoStr(3);

    // Build 3-month category average (months 1-3, not current)
    const baseline: Record<string, number[]> = {};
    for (const tx of expenses) {
      const ym = tx.date.slice(0, 7);
      if (ym !== m0 && ym >= m3) {
        const cat = tx.category || "Other";
        if (!baseline[cat]) baseline[cat] = [];
        baseline[cat].push(tx.gbpValue);
      }
    }

    // Current month transactions with z-score style outlier detection
    const thisMonth = expenses.filter(t => t.date.startsWith(m0));
    const useMock = isDemo || thisMonth.length < 3;

    const mockAnomalies = [
      { description: "Weekend in Edinburgh", category: "Travel", amount: 312, catAvg: 54, sigma: 4.8, date: m0 + "-06" },
      { description: "IKEA furniture run", category: "Home",     amount: 228, catAvg: 0,  sigma: 9.9, date: m0 + "-14" },
      { description: "Michelin restaurant", category: "Eating Out", amount: 147, catAvg: 31, sigma: 3.8, date: m0 + "-21" },
      { description: "Annual gym membership", category: "Recreation", amount: 480, catAvg: 40, sigma: 5.5, date: m0 + "-03" },
      { description: "Emergency dentist", category: "Healthcare", amount: 195, catAvg: 0, sigma: 9.9, date: m0 + "-18" },
    ];

    if (useMock) return { rows: mockAnomalies, isMock: true };

    const catStats: Record<string, { mean: number; std: number }> = {};
    for (const [cat, vals] of Object.entries(baseline)) {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const std  = Math.sqrt(vals.map(v => (v - mean) ** 2).reduce((a, b) => a + b, 0) / vals.length);
      catStats[cat] = { mean, std };
    }

    const anomalies = thisMonth
      .map(tx => {
        const s = catStats[tx.category];
        if (!s || s.std < 1) return null;
        const sigma = (tx.gbpValue - s.mean) / s.std;
        if (sigma < 2) return null;
        return { description: tx.description, category: tx.category, amount: tx.gbpValue, catAvg: s.mean, sigma, date: tx.date };
      })
      .filter(Boolean)
      .sort((a, b) => (b!.sigma - a!.sigma))
      .slice(0, 8) as { description: string; category: string; amount: number; catAvg: number; sigma: number; date: string }[];

    return { rows: anomalies, isMock: false };
  }, [expenses]);

  const { rows: anomalies, isMock } = rows;

  if (anomalies.length === 0) return null;

  return (
    <div style={panelStyle}>
      <PanelHeader
        title="Spending Anomalies"
        right={
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
            {isMock ? "demo data" : "vs 3-month category baseline · current month"}
          </span>
        }
      />
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Description", "Category", "Amount", "Cat. Avg", "Deviation", "Signal"].map(h => (
              <th key={h} style={{ ...th, textAlign: h === "Description" || h === "Category" ? "left" : "right", width: h === "Signal" ? 100 : undefined }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {anomalies.map((r, i) => {
            const isLast = i === anomalies.length - 1;
            const sigmaLabel = r.sigma >= 9 ? "NEW CAT" : `${r.sigma.toFixed(1)}σ`;
            const sigmaColor = r.sigma >= 4 ? "var(--ft-red)" : r.sigma >= 2.5 ? "var(--ft-amber)" : "var(--ft-dim)";
            const barW = Math.min(100, (r.sigma / 8) * 100);
            return (
              <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "var(--ft-raised)" }}>
                <td style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", fontSize: 10, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description}</td>
                <td style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", color: "var(--ft-dim)" }}>{r.category}</td>
                <td className="pnum" style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", textAlign: "right", fontWeight: 700, color: "var(--ft-red)" }}>{formatGbp(r.amount)}</td>
                <td className="pnum" style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", textAlign: "right", color: "var(--ft-muted)" }}>{r.catAvg > 0 ? formatGbp(r.catAvg) : "—"}</td>
                <td style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", textAlign: "right", fontWeight: 700, color: sigmaColor }}>{sigmaLabel}</td>
                <td style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", paddingLeft: 12, minWidth: 100 }}>
                  <div style={{ height: 8, background: "var(--ft-raised)", position: "relative" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${barW}%`, background: sigmaColor, opacity: 0.75 }} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ padding: "4px 16px 8px", borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>
        σ = standard deviations above your 3-month category mean · NEW CAT = first transaction in that category
      </div>
    </div>
  );
}

// ─── Net Worth Decomposition (monthly delta breakdown) ───────────────────────

function NetWorthDelta({ allTxs }: { allTxs: Tx[] }) {
  const data = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => monthsAgoStr(5 - i));
    const useMock = allTxs.length < 10;

    if (useMock) {
      const mockBase = 14200;
      return months.map((ym, i) => {
        const inc = 3700 + (i % 3 === 0 ? 450 : 0);
        const exp = 1100 + 280 + 190 + 74 + 31 + 47 + 35;
        const saved = inc - exp;
        return { month: ym.slice(5), income: inc, expenses: exp, saved, cumulative: mockBase + saved * (i + 1) };
      });
    }

    let cum = 0;
    return months.map(ym => {
      const txs = allTxs.filter(t => t.date.startsWith(ym));
      const income   = txs.filter(t => t.type === "income").reduce((s, t) => s + t.gbpValue, 0);
      const expenses = txs.filter(t => t.type === "expense").reduce((s, t) => s + t.gbpValue, 0);
      const saved    = income - expenses;
      cum += saved;
      return { month: ym.slice(5), income, expenses, saved, cumulative: cum };
    });
  }, [allTxs]);

  const maxVal = Math.max(...data.map(d => Math.max(d.income, d.expenses)));

  return (
    <div style={panelStyle}>
      <PanelHeader title="Monthly Net Delta · 6M" right={
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>income vs expenses · monthly delta</span>
      } />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 1, background: "var(--ft-border)", margin: "0 0 1px" }}>
        {data.map((d) => {
          const incH  = maxVal > 0 ? Math.round((d.income   / maxVal) * 80) : 0;
          const expH  = maxVal > 0 ? Math.round((d.expenses / maxVal) * 80) : 0;
          const pos   = d.saved >= 0;
          return (
            <div key={d.month} style={{ background: "var(--ft-surface)", padding: "10px 10px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.04em" }}>{d.month}</div>
              <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 80 }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <div style={{ height: incH, background: "var(--ft-green)", opacity: 0.7 }} />
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <div style={{ height: expH, background: "var(--ft-accent)", opacity: 0.7 }} />
                </div>
              </div>
              <div style={{ height: 1, background: "var(--ft-border)" }} />
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: pos ? "var(--ft-green)" : "var(--ft-red)", fontVariantNumeric: "tabular-nums" }}>
                {pos ? "+" : ""}{formatGbp(d.saved)}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-green)", fontVariantNumeric: "tabular-nums" }}>{formatGbp(d.income)}</div>
                <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", fontVariantNumeric: "tabular-nums" }}>{formatGbp(d.expenses)}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "4px 16px 8px", display: "flex", gap: 14 }}>
        <span style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <span style={{ display: "inline-block", width: 10, height: 4, background: "var(--ft-green)", opacity: 0.7 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>income</span>
        </span>
        <span style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <span style={{ display: "inline-block", width: 10, height: 4, background: "var(--ft-accent)", opacity: 0.7 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>expenses</span>
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)", marginLeft: "auto" }}>delta = net saved / month</span>
      </div>
    </div>
  );
}

// ─── Category Forecast ───────────────────────────────────────────────────────

function CategoryForecast({ expenses }: { expenses: Tx[] }) {
  const rows = useMemo(() => {
    const cats = ["Housing", "Groceries", "Transport", "Eating Out", "Subscriptions", "Recreation", "Clothing", "Healthcare"];

    // Gather 3-month history per category
    const months = [monthsAgoStr(2), monthsAgoStr(1), monthsAgoStr(0)];
    const catMonths: Record<string, number[]> = {};

    for (const cat of cats) {
      catMonths[cat] = months.map(ym =>
        expenses.filter(t => t.date.startsWith(ym) && (t.category || "").toLowerCase().includes(cat.toLowerCase()))
          .reduce((s, t) => s + t.gbpValue, 0)
      );
    }

    const useMock = expenses.length < 10;
    const mockHistory: Record<string, [number, number, number]> = {
      Housing:       [1100, 1100, 1100],
      Groceries:     [199,  183,  200],
      Transport:     [155,  187,  142],
      "Eating Out":  [61,   65,   74],
      Subscriptions: [45,   45,   31],
      Recreation:    [59,   42,   28],
      Clothing:      [79,   54,   0],
      Healthcare:    [8,    85,   12],
    };

    return cats.map(cat => {
      const history = useMock ? mockHistory[cat] ?? [0, 0, 0] : catMonths[cat];
      const m3 = history[0], m2 = history[1], m1 = history[2];
      const avg = (m3 + m2 + m1) / 3;
      // weighted forecast: recent months weighted more
      const forecast = (m3 * 0.2 + m2 * 0.3 + m1 * 0.5);
      const trend = m1 > m2 ? "up" : m1 < m2 ? "down" : "flat";
      const changePct = m2 > 0 ? Math.round(((m1 - m2) / m2) * 100) : null;
      return { cat, m3, m2, m1, avg: Math.round(avg), forecast: Math.round(forecast), trend, changePct };
    }).filter(r => r.avg > 0);
  }, [expenses]);

  const maxVal = Math.max(...rows.map(r => Math.max(r.m3, r.m2, r.m1, r.forecast)));

  return (
    <div style={panelStyle}>
      <PanelHeader title="Category Forecast · Next Month" right={
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>weighted 3-month trend projection</span>
      } />
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Category", "2mo ago", "Last mo", "This mo", "3mo Avg", "Forecast", "Trend"].map(h => (
              <th key={h} style={{ ...th, textAlign: h === "Category" || h === "Trend" ? "left" : "right" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isLast = i === rows.length - 1;
            const fColor = r.forecast > r.avg * 1.1 ? "var(--ft-red)" : r.forecast < r.avg * 0.9 ? "var(--ft-green)" : "var(--ft-text)";
            const trendIcon = r.trend === "up" ? "▲" : r.trend === "down" ? "▼" : "─";
            const trendColor = r.trend === "up" ? "var(--ft-red)" : r.trend === "down" ? "var(--ft-green)" : "var(--ft-dim)";
            const sparkW = maxVal > 0 ? (r.forecast / maxVal) * 80 : 0;
            return (
              <tr key={r.cat} style={{ background: i % 2 === 0 ? "transparent" : "var(--ft-raised)" }}>
                <td style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", fontSize: 10, fontWeight: 500 }}>{r.cat}</td>
                <td className="pnum" style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", textAlign: "right", color: "var(--ft-muted)" }}>{r.m3 > 0 ? formatGbp(r.m3) : "—"}</td>
                <td className="pnum" style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", textAlign: "right", color: "var(--ft-muted)" }}>{r.m2 > 0 ? formatGbp(r.m2) : "—"}</td>
                <td className="pnum" style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", textAlign: "right" }}>{r.m1 > 0 ? formatGbp(r.m1) : "—"}</td>
                <td className="pnum" style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", textAlign: "right", color: "var(--ft-dim)" }}>{formatGbp(r.avg)}</td>
                <td className="pnum" style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", textAlign: "right", fontWeight: 700, color: fColor }}>{formatGbp(r.forecast)}</td>
                <td style={{ ...td, borderBottom: isLast ? "none" : "1px solid var(--ft-border)", minWidth: 80 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: trendColor, fontWeight: 700 }}>{trendIcon}</span>
                    <div style={{ flex: 1, height: 5, background: "var(--ft-raised)", position: "relative" }}>
                      <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${sparkW}%`, background: fColor, opacity: 0.7 }} />
                    </div>
                    {r.changePct != null && (
                      <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: trendColor, whiteSpace: "nowrap" }}>
                        {r.changePct > 0 ? "+" : ""}{r.changePct}%
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ padding: "4px 16px 8px", borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>
        Forecast = 0.5×this + 0.3×last + 0.2×prior · trend arrow = MoM direction · red = projected over 10% above avg
      </div>
    </div>
  );
}

// ─── Transaction Amount Distribution ─────────────────────────────────────────

function TxAmountDistribution({ expenses }: { expenses: Tx[] }) {
  const data = useMemo(() => {
    const buckets = [
      { label: "< £10",    min: 0,   max: 10   },
      { label: "£10–25",   min: 10,  max: 25   },
      { label: "£25–50",   min: 25,  max: 50   },
      { label: "£50–100",  min: 50,  max: 100  },
      { label: "£100–250", min: 100, max: 250  },
      { label: "£250+",    min: 250, max: Infinity },
    ];

    const useMock = expenses.length < 10;
    const mockAmounts = [18, 43, 67, 11, 8, 2, 33, 74, 22, 95, 1100, 310, 88, 12, 45, 66, 28, 14, 41, 55, 17, 85, 3, 195, 39, 480];

    const amounts = useMock ? mockAmounts : expenses.map(t => t.gbpValue);

    return buckets.map(b => {
      const items = amounts.filter(a => a >= b.min && a < b.max);
      const total = items.reduce((s, v) => s + v, 0);
      return { label: b.label, count: items.length, total, avg: items.length > 0 ? total / items.length : 0 };
    });
  }, [expenses]);

  const maxCount = Math.max(...data.map(d => d.count));

  return (
    <div style={panelStyle}>
      <PanelHeader title="Transaction Size Distribution" right={
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>all-time expenses · count histogram</span>
      } />
      <div style={{ padding: "12px 16px 4px", display: "flex", flexDirection: "column", gap: 6 }}>
        {data.map((d, i) => {
          const barW = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
          const pct = data.reduce((s, r) => s + r.count, 0) > 0
            ? Math.round((d.count / data.reduce((s, r) => s + r.count, 0)) * 100)
            : 0;
          return (
            <div key={d.label} style={{ display: "grid", gridTemplateColumns: "72px 1fr 50px 72px", alignItems: "center", gap: 10 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, color: "var(--ft-dim)", letterSpacing: "0.04em" }}>{d.label}</div>
              <div style={{ height: 14, background: "var(--ft-raised)", position: "relative" }}>
                <div style={{
                  position: "absolute", left: 0, top: 0, height: "100%", width: `${barW}%`,
                  background: i < 2 ? "var(--ft-green)" : i < 4 ? "var(--ft-accent)" : "var(--ft-red)",
                  opacity: 0.75,
                }} />
                <span style={{ position: "absolute", left: `${Math.min(barW + 1, 60)}%`, top: "50%", transform: "translateY(-50%)", fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>
                  {d.count}
                </span>
              </div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-muted)", textAlign: "right" }}>{pct}%</div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textAlign: "right" }}>{d.total > 0 ? formatGbp(d.total) : "—"}</div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "4px 16px 10px", display: "flex", gap: 14, alignItems: "center" }}>
        {[["< £50", "var(--ft-green)"], ["£50–250", "var(--ft-accent)"], ["£250+", "var(--ft-red)"]].map(([l, c]) => (
          <span key={l} style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <span style={{ display: "inline-block", width: 10, height: 4, background: c as string, opacity: 0.75 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>{l}</span>
          </span>
        ))}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)", marginLeft: "auto" }}>right column = total spend in bucket</span>
      </div>
    </div>
  );
}

// ─── Weekly Spending Pulse ───────────────────────────────────────────────────

function WeeklySpendingPulse({ expenses }: { expenses: Tx[] }) {
  const isMobile = useIsMobile();

  const { weeks, thisWeek, lastWeek, avgWeek } = useMemo(() => {
    const now = new Date();
    const todayDow = now.getDay() === 0 ? 6 : now.getDay() - 1; // Mon=0
    const weekBuckets: { label: string; total: number; weekStart: string }[] = [];

    for (let w = 7; w >= 0; w--) {
      const ms = new Date(now);
      ms.setDate(now.getDate() - todayDow - w * 7);
      ms.setHours(0, 0, 0, 0);
      const me = new Date(ms);
      me.setDate(ms.getDate() + 6);
      const startStr = ms.toISOString().slice(0, 10);
      const endStr = me.toISOString().slice(0, 10);
      const total = expenses
        .filter(t => t.date >= startStr && t.date <= endStr && t.gbpValue > 0)
        .reduce((s, t) => s + t.gbpValue, 0);
      const mo = ms.getMonth();
      const label = `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][mo]} ${ms.getDate()}`;
      weekBuckets.push({ label, total, weekStart: startStr });
    }

    const filled = weekBuckets.filter((_, i) => i < 7);
    const avgWeek = filled.length > 0 ? filled.reduce((s, w) => s + w.total, 0) / filled.length : 0;
    return {
      weeks: weekBuckets,
      thisWeek: weekBuckets[7]?.total ?? 0,
      lastWeek: weekBuckets[6]?.total ?? 0,
      avgWeek,
    };
  }, [expenses]);

  const maxVal = Math.max(...weeks.map(w => w.total), 1);
  const wowChange = lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek) * 100 : 0;
  const vsAvg = avgWeek > 0 ? ((thisWeek - avgWeek) / avgWeek) * 100 : 0;

  return (
    <div style={panelStyle}>
      <PanelHeader title="Weekly Spending Pulse" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: "1px solid var(--ft-border)" }}>
        {[
          { label: "This Week", value: thisWeek, delta: wowChange, show: true },
          { label: "Last Week", value: lastWeek, delta: null, show: true },
          { label: "8-Wk Avg", value: avgWeek, delta: vsAvg, show: true },
        ].map((cell, i) => (
          <div key={cell.label} style={{ padding: isMobile ? "10px 10px" : "12px 14px", borderRight: i < 2 ? "1px solid var(--ft-border)" : "none" }}>
            <div style={{ ...ftLabel, marginBottom: 4 }}>{cell.label}</div>
            <div className="pnum" style={{ ...mono, fontSize: isMobile ? 14 : 17, fontWeight: 700, color: "var(--ft-text)", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {formatGbp(cell.value)}
            </div>
            {cell.delta != null && (
              <div style={{ ...mono, fontSize: 9, marginTop: 3, color: cell.delta <= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                {cell.delta >= 0 ? "▲" : "▼"} <span className="pnum">{Math.abs(cell.delta).toFixed(1)}%</span> vs {i === 0 ? "prior wk" : "avg"}
              </div>
            )}
          </div>
        ))}
      </div>
      {/* 8-week bar chart */}
      <div style={{ padding: "12px 14px 8px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 60 }}>
          {weeks.map((w, i) => {
            const isThisWeek = i === 7;
            const h = Math.round((w.total / maxVal) * 52);
            const isOverAvg = w.total > avgWeek * 1.15;
            const col = isThisWeek ? "var(--ft-accent)" : isOverAvg ? "var(--ft-amber)" : "var(--ft-muted)";
            return (
              <div key={w.weekStart} style={{ flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 3 }}>
                <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                  <div title={`${w.label}: ${formatGbp(w.total)}`} style={{ width: "100%", height: Math.max(h, w.total > 0 ? 2 : 0), background: col, opacity: isThisWeek ? 1 : 0.6 }} />
                </div>
                <div style={{ ...mono, fontSize: 7, color: isThisWeek ? "var(--ft-accent)" : "var(--ft-dim)", whiteSpace: "nowrap" as const, overflow: "hidden", textAlign: "center" as const, width: "100%" }}>
                  {isThisWeek ? "NOW" : w.label.split(" ")[1]}
                </div>
              </div>
            );
          })}
        </div>
        {/* Average reference line label */}
        <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", marginTop: 4, textAlign: "right" as const }}>
          avg line: <span className="pnum">{formatGbp(avgWeek)}</span>/wk
        </div>
      </div>
    </div>
  );
}

// ─── Subscription Tracker ────────────────────────────────────────────────────

function SubscriptionTracker({ expenses }: { expenses: Tx[] }) {
  const isMobile = useIsMobile();

  const subscriptions = useMemo(() => {
    const isSubCat = (c: string) => {
      const lc = c.toLowerCase();
      return lc.includes("subscript") || lc.includes("streaming") || lc.includes("saas") || lc.includes("membership");
    };

    const subTxIds = new Set<number>();
    const subCatTxs = expenses.filter(t => t.gbpValue > 0 && isSubCat(t.category || ""));
    subCatTxs.forEach(t => subTxIds.add(t.id));

    // Also detect recurring non-sub-category items (same description appearing 3+ months)
    const byDesc = new Map<string, Tx[]>();
    for (const t of expenses) {
      if (t.gbpValue <= 0) continue;
      const key = (t.description || "").trim().toLowerCase().slice(0, 40);
      if (!byDesc.has(key)) byDesc.set(key, []);
      byDesc.get(key)!.push(t);
    }
    const extraRecurring: Tx[] = [];
    for (const txs of byDesc.values()) {
      if (txs.length >= 3) {
        const months = new Set(txs.map(t => t.date.slice(0, 7)));
        if (months.size >= 2 && !subTxIds.has(txs[0].id)) {
          txs.forEach(t => subTxIds.add(t.id));
          extraRecurring.push(...txs);
        }
      }
    }

    const allSubTxs = [...subCatTxs, ...extraRecurring];
    const grouped = new Map<string, { txs: Tx[]; desc: string }>();
    for (const t of allSubTxs) {
      const key = (t.description || "").trim().toLowerCase().slice(0, 40);
      if (!grouped.has(key)) grouped.set(key, { txs: [], desc: t.description || key });
      grouped.get(key)!.txs.push(t);
    }

    return Array.from(grouped.values())
      .filter(g => g.txs.length >= 2)
      .map(({ txs, desc }) => {
        const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
        const total = txs.reduce((s, t) => s + t.gbpValue, 0);
        const months = new Set(txs.map(t => t.date.slice(0, 7))).size;
        const monthlyEst = months > 0 ? total / months : total / txs.length;
        return { desc, count: txs.length, lastDate: sorted[0].date, monthlyEst };
      })
      .sort((a, b) => b.monthlyEst - a.monthlyEst)
      .slice(0, 15);
  }, [expenses]);

  const totalMonthly = subscriptions.reduce((s, sub) => s + sub.monthlyEst, 0);
  const totalAnnual = totalMonthly * 12;

  if (subscriptions.length === 0) return null;

  return (
    <div style={panelStyle}>
      <PanelHeader
        title="Subscription Tracker"
        right={
          <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
            <span className="pnum" style={{ ...mono, fontSize: 12, fontWeight: 700, color: "var(--ft-red)" }}>
              {formatGbp(totalMonthly)}<span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", fontWeight: 400 }}>/mo</span>
            </span>
            <span style={{ ...mono, fontSize: 10, color: "var(--ft-dim)" }}><span className="pnum">{formatGbp(totalAnnual)}</span>/yr</span>
          </div>
        }
      />
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 24 }}>#</th>
              <th style={th}>SERVICE</th>
              {!isMobile && <th style={{ ...th, textAlign: "right" }}>LAST CHARGED</th>}
              {!isMobile && <th style={{ ...th, textAlign: "right" }}>CHARGES</th>}
              <th style={{ ...th, textAlign: "right" }}>MO. COST</th>
              <th style={{ ...th, textAlign: "right" }}>ANNUAL</th>
              {!isMobile && <th style={{ ...th, width: 80 }}>SHARE</th>}
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((sub, i) => {
              const annualCost = sub.monthlyEst * 12;
              const sharePct = totalMonthly > 0 ? (sub.monthlyEst / totalMonthly) * 100 : 0;
              const baseBg = i % 2 !== 0 ? "color-mix(in srgb, var(--ft-raised) 30%, transparent)" : "transparent";
              return (
                <tr key={sub.desc} style={{ background: baseBg }}>
                  <td style={{ ...td, color: "var(--ft-dim)", fontSize: 9 }}>{i + 1}</td>
                  <td style={{ ...td, maxWidth: isMobile ? 130 : 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub.desc}</td>
                  {!isMobile && <td style={{ ...td, textAlign: "right", color: "var(--ft-dim)" }}>{sub.lastDate}</td>}
                  {!isMobile && <td style={{ ...td, textAlign: "right", color: "var(--ft-muted)" }}>{sub.count}×</td>}
                  <td className="pnum" style={{ ...td, textAlign: "right", color: "var(--ft-red)", fontWeight: 600 }}>{formatGbp(sub.monthlyEst)}</td>
                  <td className="pnum" style={{ ...td, textAlign: "right", color: "var(--ft-dim)" }}>{formatGbp(annualCost)}</td>
                  {!isMobile && (
                    <td style={{ ...td }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ flex: 1, height: 3, background: "var(--ft-border)" }}>
                          <div style={{ height: "100%", width: `${Math.round(sharePct)}%`, background: "var(--ft-red)", opacity: 0.7 }} />
                        </div>
                        <span className="pnum" style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", width: 32, textAlign: "right" }}>{sharePct.toFixed(0)}%</span>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ borderTop: "1px solid var(--ft-border)", padding: "6px 12px", display: "flex", gap: 12, alignItems: "center", background: "var(--ft-raised)", flexWrap: "wrap" as const }}>
        <span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>{subscriptions.length} subscriptions detected</span>
        <span style={{ ...mono, fontSize: 9, color: "var(--ft-border2)" }}>·</span>
        <span style={{ ...mono, fontSize: 9, color: "var(--ft-muted)" }}>
          <span className="pnum" style={{ color: "var(--ft-red)", fontWeight: 700 }}>{formatGbp(totalMonthly)}</span>/mo
        </span>
        <span style={{ ...mono, fontSize: 9, color: "var(--ft-border2)" }}>·</span>
        <span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}><span className="pnum">{formatGbp(totalAnnual)}</span>/yr</span>
      </div>
    </div>
  );
}

// ─── Financial Runway ────────────────────────────────────────────────────────

function FinancialRunway({ allTxs }: { allTxs: Tx[] }) {
  const data = useMemo(() => {
    const useMock = allTxs.filter(t => t.type === "expense").length < 5;
    if (useMock) {
      return {
        monthlyBurn: 2185,
        netSavings: 8500,
        runwayMonths: 3.9,
        monthlyIncome: 3700,
        savingsRate: 40.9,
        trend: [1200, 980, 1450, 870, 2100, 1380, 1950, 1100, 1750, 1280, 1620, 2185],
      };
    }
    const now = new Date();
    const months: number[] = [];
    for (let i = 0; i < 6; i++) {
      const ym = monthsAgoStr(i);
      const burn = allTxs.filter(t => t.type === "expense" && getYYYYMM(t.date) === ym).reduce((s, t) => s + t.gbpValue, 0);
      months.push(burn);
    }
    const recentBurn = months.slice(0, 3).reduce((s, v) => s + v, 0) / 3;
    const totalIncome = allTxs.filter(t => t.type === "income").reduce((s, t) => s + t.gbpValue, 0);
    const totalExpenses = allTxs.filter(t => t.type === "expense").reduce((s, t) => s + t.gbpValue, 0);
    const netSavings = Math.max(0, totalIncome - totalExpenses);
    const monthCount = Math.max(1, new Set(allTxs.map(t => getYYYYMM(t.date))).size);
    const monthlyIncome = totalIncome / monthCount;
    const savingsRate = monthlyIncome > 0 ? ((monthlyIncome - recentBurn) / monthlyIncome) * 100 : 0;
    return {
      monthlyBurn: recentBurn,
      netSavings,
      runwayMonths: recentBurn > 0 ? netSavings / recentBurn : Infinity,
      monthlyIncome,
      savingsRate,
      trend: months.reverse(),
    };
  }, [allTxs]);

  const { runwayMonths, monthlyBurn, netSavings, monthlyIncome, savingsRate, trend } = data;
  const isInfinite = !isFinite(runwayMonths);
  const runwayLabel = isInfinite ? "∞" : runwayMonths >= 12 ? `${(runwayMonths / 12).toFixed(1)}y` : `${runwayMonths.toFixed(1)}m`;
  const runwayColor = isInfinite || runwayMonths >= 6 ? "var(--ft-green)" : runwayMonths >= 3 ? "var(--ft-amber)" : "var(--ft-red)";
  const runwayStatus = isInfinite || runwayMonths >= 6 ? "COMFORTABLE" : runwayMonths >= 3 ? "MODERATE" : "LOW";
  const runwayStatusColor = isInfinite || runwayMonths >= 6 ? "var(--ft-green)" : runwayMonths >= 3 ? "var(--ft-amber)" : "var(--ft-red)";

  const maxTrend = Math.max(...trend, 1);
  const mono: React.CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

  return (
    <div style={panelStyle}>
      <PanelHeader title="Financial Runway" right={
        <span style={{ ...mono, fontSize: 9, padding: "2px 7px", border: `1px solid ${runwayStatusColor}`, color: runwayStatusColor, letterSpacing: "0.06em" }}>{runwayStatus}</span>
      } />
      <div style={{ padding: "12px 14px", display: "grid", gridTemplateColumns: "minmax(140px, auto) 1fr", gap: "12px 28px", alignItems: "start" }} className="ft-two-col-auto">
        {/* Left: key metrics */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 140 }}>
          <div>
            <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>RUNWAY</div>
            <div style={{ ...mono, fontSize: 36, fontWeight: 700, color: runwayColor, letterSpacing: "-0.04em", lineHeight: 1 }}>{runwayLabel}</div>
            <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", marginTop: 3 }}>at <span className="pnum">£{monthlyBurn.toFixed(0)}</span>/mo burn rate</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, paddingTop: 8, borderTop: "1px solid var(--ft-border)" }}>
            <div>
              <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>Net Saved</div>
              <div className="pnum" style={{ ...mono, fontSize: 13, fontWeight: 700, color: netSavings >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>{formatGbp(netSavings)}</div>
            </div>
            <div>
              <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>Save Rate</div>
              <div className="pnum" style={{ ...mono, fontSize: 13, fontWeight: 700, color: savingsRate >= 20 ? "var(--ft-green)" : savingsRate >= 10 ? "var(--ft-amber)" : "var(--ft-red)" }}>{savingsRate.toFixed(1)}%</div>
            </div>
            <div>
              <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>Mo. Income</div>
              <div className="pnum" style={{ ...mono, fontSize: 13, fontWeight: 700, color: "var(--ft-text)" }}>{formatGbp(monthlyIncome)}</div>
            </div>
            <div>
              <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>Mo. Burn</div>
              <div className="pnum" style={{ ...mono, fontSize: 13, fontWeight: 700, color: "var(--ft-red)" }}>{formatGbp(monthlyBurn)}</div>
            </div>
          </div>
        </div>
        {/* Right: micro burn rate chart + runway bar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>6-MONTH BURN RATE</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 48 }}>
              {trend.map((v, i) => {
                const h = Math.max(4, (v / maxTrend) * 44);
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                    <div style={{ background: i === trend.length - 1 ? "var(--ft-red)" : "var(--ft-border2)", height: h, minWidth: 6, opacity: i === trend.length - 1 ? 0.9 : 0.5 }} />
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>RUNWAY DIAL · 12-month target</div>
            <div style={{ position: "relative", height: 8, background: "var(--ft-border)", overflow: "hidden" }}>
              {[3, 6].map(m => (
                <div key={m} style={{ position: "absolute", top: 0, bottom: 0, left: `${(m / 12) * 100}%`, width: 1, background: "var(--ft-border2)", zIndex: 1 }} />
              ))}
              <div style={{ height: "100%", width: `${Math.min(100, (isInfinite ? 100 : runwayMonths) / 12 * 100)}%`, background: runwayColor, opacity: 0.8 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              {["0", "3m", "6m", "9m", "12m+"].map(l => (
                <span key={l} style={{ ...mono, fontSize: 7, color: "var(--ft-dim)" }}>{l}</span>
              ))}
            </div>
          </div>
          <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", lineHeight: 1.6, paddingTop: 4, borderTop: "1px solid var(--ft-border)" }}>
            {isInfinite || runwayMonths >= 6
              ? "You're saving more than you spend. Keep growing the buffer."
              : runwayMonths >= 3
              ? "Runway is moderate. Aim for 6 months of expenses as your safety net."
              : "Runway is below 3 months. Prioritise cutting discretionary spend."}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Savings Compound Projection ─────────────────────────────────────────────

function SavingsProjection({ allTxs }: { allTxs: Tx[] }) {
  const [rate, setRate] = useState(5);

  const data = useMemo(() => {
    const useMock = allTxs.filter(t => t.type === "income").length === 0;
    const monthlyIncome = useMock ? 3700 : (() => {
      const inc = allTxs.filter(t => t.type === "income").reduce((s, t) => s + t.gbpValue, 0);
      const months = Math.max(1, new Set(allTxs.map(t => getYYYYMM(t.date))).size);
      return inc / months;
    })();
    const monthlyExpenses = useMock ? 2185 : (() => {
      const exp = allTxs.filter(t => t.type === "expense").reduce((s, t) => s + t.gbpValue, 0);
      const months = Math.max(1, new Set(allTxs.map(t => getYYYYMM(t.date))).size);
      return exp / months;
    })();
    const monthlySavings = Math.max(0, monthlyIncome - monthlyExpenses);
    const r = rate / 100 / 12;
    const points: Array<{ year: number; conservative: number; current: number; optimistic: number }> = [];
    for (let y = 0; y <= 10; y++) {
      const n = y * 12;
      const fv = (s: number) => r > 0 ? s * ((Math.pow(1 + r, n) - 1) / r) : s * n;
      points.push({
        year: y,
        conservative: Math.round(fv(monthlySavings * 0.8)),
        current: Math.round(fv(monthlySavings)),
        optimistic: Math.round(fv(monthlySavings * 1.2)),
      });
    }
    return { points, monthlySavings };
  }, [allTxs, rate]);

  const { points, monthlySavings } = data;
  const maxVal = Math.max(...points.map(p => p.optimistic), 1);
  const mono: React.CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

  return (
    <div style={panelStyle}>
      <PanelHeader title="Savings Projection" right={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>Return:</span>
          {[3, 5, 7, 10].map(r => (
            <button key={r} onClick={() => setRate(r)} style={{ ...mono, fontSize: 9, padding: "2px 7px", background: rate === r ? "var(--ft-accent)" : "transparent", color: rate === r ? "var(--ft-base)" : "var(--ft-muted)", border: "1px solid var(--ft-border)", cursor: "pointer", fontWeight: rate === r ? 700 : 400 }}>
              {r}%
            </button>
          ))}
        </div>
      } />
      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 20, alignItems: "baseline" }}>
          <div>
            <span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>Monthly savings · </span>
            <span className="pnum" style={{ ...mono, fontSize: 13, fontWeight: 700, color: "var(--ft-green)" }}>{formatGbp(monthlySavings)}</span>
          </div>
          <div>
            <span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>10yr projection · </span>
            <span className="pnum" style={{ ...mono, fontSize: 13, fontWeight: 700, color: "var(--ft-text)" }}>{formatGbp(points[10]?.current ?? 0)}</span>
          </div>
          <div>
            <span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>at {rate}% p.a.</span>
          </div>
        </div>
        <div style={{ height: 120, position: "relative" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="year" tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} tickFormatter={v => v === 0 ? "Now" : `${v}y`} />
              <YAxis hide domain={[0, maxVal * 1.05]} />
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div style={{ ...monoTooltipStyle }}>
                    <div style={{ fontSize: 9, color: "var(--ft-dim)", marginBottom: 4 }}>{label === 0 ? "Now" : `Year ${label}`}</div>
                    {payload.map((e, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, justifyContent: "space-between", fontSize: 9, color: (e as { color?: string }).color ?? "var(--ft-text)" }}>
                        <span>{e.name}</span>
                        <span className="pnum">{formatGbp(e.value as number)}</span>
                      </div>
                    ))}
                  </div>
                );
              }} />
              <Area type="monotone" dataKey="optimistic" name="Optimistic (+20%)" stroke="var(--ft-green)" fill="var(--ft-green)" fillOpacity={0.08} strokeWidth={1} strokeDasharray="4 3" dot={false} />
              <Area type="monotone" dataKey="current" name="Current rate" stroke="var(--ft-accent)" fill="var(--ft-accent)" fillOpacity={0.15} strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="conservative" name="Conservative (−20%)" stroke="var(--ft-amber)" fill="var(--ft-amber)" fillOpacity={0.06} strokeWidth={1} strokeDasharray="3 2" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" as const }}>
          {[{ label: "Conservative", color: "var(--ft-amber)", v: points[10]?.conservative ?? 0 }, { label: "Current rate", color: "var(--ft-accent)", v: points[10]?.current ?? 0 }, { label: "Optimistic", color: "var(--ft-green)", v: points[10]?.optimistic ?? 0 }].map(s => (
            <div key={s.label} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ display: "inline-block", width: 20, height: 2, background: s.color }} />
              <span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>{s.label}</span>
              <span className="pnum" style={{ ...mono, fontSize: 9, fontWeight: 700, color: s.color }}>{formatGbp(s.v)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Paycheck Allocation ──────────────────────────────────────────────────────

function PaycheckAllocation({ allTxs }: { allTxs: Tx[] }) {
  const data = useMemo(() => {
    const useMock = allTxs.filter(t => t.type === "income").length === 0;
    if (useMock) {
      const inc = 3700;
      const cats = [
        { category: "Housing",       spend: 1100, color: "var(--ft-blue)" },
        { category: "Groceries",     spend: 280,  color: "var(--ft-green)" },
        { category: "Transport",     spend: 95,   color: "var(--ft-cyan)" },
        { category: "Eating Out",    spend: 165,  color: "var(--ft-amber)" },
        { category: "Subscriptions", spend: 42,   color: "var(--ft-accent)" },
        { category: "Health",        spend: 55,   color: "var(--ft-red)" },
        { category: "Other",         spend: 448,  color: "var(--ft-muted)" },
        { category: "Savings",       spend: 1515, color: "var(--ft-green)", isSavings: true },
      ];
      return { cats: cats.map(c => ({ ...c, pct: (c.spend / inc) * 100 })), totalIncome: inc };
    }
    const totalIncome = allTxs.filter(t => t.type === "income").reduce((s, t) => s + t.gbpValue, 0);
    if (totalIncome === 0) return { cats: [], totalIncome: 0 };
    const months = Math.max(1, new Set(allTxs.map(t => getYYYYMM(t.date))).size);
    const monthlyIncome = totalIncome / months;
    const catMap: Record<string, number> = {};
    for (const t of allTxs.filter(t2 => t2.type === "expense")) {
      catMap[t.category || "Other"] = (catMap[t.category || "Other"] || 0) + t.gbpValue / months;
    }
    const totalExpenses = Object.values(catMap).reduce((s, v) => s + v, 0);
    const savings = Math.max(0, monthlyIncome - totalExpenses);
    const CAT_COLORS = ["var(--ft-blue)","var(--ft-cyan)","var(--ft-green)","var(--ft-amber)","var(--ft-red)","var(--ft-accent)","var(--ft-muted)","var(--ft-dim)"];
    const catList = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .map(([category, spend], i) => ({ category, spend, color: CAT_COLORS[i % CAT_COLORS.length], pct: (spend / monthlyIncome) * 100 }));
    if (savings > 0) catList.push({ category: "Savings", spend: savings, color: "var(--ft-green)", pct: (savings / monthlyIncome) * 100 });
    return { cats: catList, totalIncome: monthlyIncome };
  }, [allTxs]);

  const { cats, totalIncome } = data;
  const mono: React.CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

  if (cats.length === 0) return null;

  return (
    <div style={panelStyle}>
      <PanelHeader title="Paycheck Allocation" right={
        <span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>per <span className="pnum">£{totalIncome.toFixed(0)}</span> monthly income</span>
      } />
      <div style={{ padding: "10px 14px" }}>
        {/* Stacked bar */}
        <div style={{ display: "flex", height: 14, marginBottom: 12, overflow: "hidden" }}>
          {cats.map((c, i) => (
            <div key={c.category} title={`${c.category}: ${c.pct.toFixed(1)}%`} style={{ width: `${c.pct}%`, background: c.color, opacity: 0.8, borderLeft: i > 0 ? "1px solid var(--ft-base)" : "none" }} />
          ))}
        </div>
        {/* Row list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {cats.map((c, i) => (
            <div key={c.category} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: i < cats.length - 1 ? "1px solid var(--ft-border)" : "none" }}>
              <div style={{ width: 8, height: 8, background: c.color, flexShrink: 0, opacity: 0.85 }} />
              <span style={{ ...mono, fontSize: 10, color: "var(--ft-text)", flex: 1 }}>{c.category}</span>
              <div style={{ flex: 2, minWidth: 80, height: 4, background: "var(--ft-border)", position: "relative" }}>
                <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: `${c.pct}%`, background: c.color, opacity: 0.7 }} />
              </div>
              <span className="pnum" style={{ ...mono, fontSize: 10, fontWeight: 700, color: c.color, minWidth: 38, textAlign: "right" }}>{c.pct.toFixed(1)}%</span>
              <span className="pnum" style={{ ...mono, fontSize: 10, color: "var(--ft-dim)", minWidth: 60, textAlign: "right" }}>{formatGbp(c.spend)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── FIRE Tracker ────────────────────────────────────────────────────────────

function FireTracker({ allTxs }: { allTxs: Tx[] }) {
  const isMobile = useIsMobile();

  const { fiNumber, currentNW, monthlyContrib, yearsToFI, progressPct, monthlyBurn } = useMemo(() => {
    const now = new Date();
    const m3ago = monthsAgoStr(3);

    const recentExpenses = allTxs.filter(t => t.type === "expense" && t.date >= m3ago);
    const recentIncome = allTxs.filter(t => t.type === "income" && t.date >= m3ago);

    const monthlyBurn = recentExpenses.length > 0
      ? recentExpenses.reduce((s, t) => s + t.gbpValue, 0) / 3
      : 1500;
    const monthlyIncome = recentIncome.length > 0
      ? recentIncome.reduce((s, t) => s + t.gbpValue, 0) / 3
      : 2500;
    const monthlyContrib = Math.max(0, monthlyIncome - monthlyBurn);

    const annualExpenses = monthlyBurn * 12;
    const fiNumber = annualExpenses * 25;

    // Estimate current NW from cumulative net cash flows (rough proxy when no accounts data)
    const allSorted = [...allTxs].sort((a, b) => a.date.localeCompare(b.date));
    const currentNW = allSorted.reduce((s, t) => t.type === "income" ? s + t.gbpValue : t.type === "expense" ? s - t.gbpValue : s, 0);
    const nw = Math.max(0, currentNW);

    // Time to FI: FV formula with 5% real growth
    let yearsToFI = 0;
    if (monthlyContrib > 0 && fiNumber > nw) {
      const r = 0.05 / 12;
      let bal = nw;
      let months = 0;
      while (bal < fiNumber && months < 600) {
        bal = bal * (1 + r) + monthlyContrib;
        months++;
      }
      yearsToFI = months / 12;
    } else if (nw >= fiNumber) {
      yearsToFI = 0;
    }

    const progressPct = fiNumber > 0 ? Math.min(100, (nw / fiNumber) * 100) : 0;

    return { fiNumber, currentNW: nw, monthlyContrib, yearsToFI, progressPct, monthlyBurn };
  }, [allTxs]);

  const useMock = allTxs.length < 10;
  const displayNW = useMock ? 15340 : currentNW;
  const displayFI = useMock ? 540000 : fiNumber;
  const displayPct = useMock ? (15340 / 540000) * 100 : progressPct;
  const displayYears = useMock ? 22.4 : yearsToFI;
  const displayMonthlyBurn = useMock ? 1800 : monthlyBurn;
  const displayContrib = useMock ? 1515 : monthlyContrib;

  const gaugeColor = displayPct >= 75 ? "var(--ft-green)" : displayPct >= 40 ? "var(--ft-amber)" : "var(--ft-accent)";

  return (
    <div style={panelStyle}>
      <PanelHeader
        title="FIRE Tracker"
        right={
          useMock
            ? <span style={{ ...mono, fontSize: 9, color: "var(--ft-amber)" }}>demo data</span>
            : null
        }
      />
      <div style={{ padding: isMobile ? "14px 12px" : "16px 16px", display: "flex", flexDirection: "column" as const, gap: 16 }}>

        {/* Progress arc + FI number */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "200px 1fr", gap: 16, alignItems: "center" }}>
          {/* Gauge (simple progress bar styled as arc approximation) */}
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            <div style={{ position: "relative", height: 8, background: "var(--ft-border)", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${displayPct}%`, background: gaugeColor, transition: "width 0.6s ease" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div>
                <div style={{ ...ftLabel, marginBottom: 2 }}>FI Progress</div>
                <div className="pnum" style={{ ...mono, fontSize: 28, fontWeight: 700, color: gaugeColor, lineHeight: 1 }}>{displayPct.toFixed(1)}%</div>
              </div>
              <div style={{ textAlign: "right" as const }}>
                {displayYears === 0 ? (
                  <div style={{ ...mono, fontSize: 11, color: "var(--ft-green)", fontWeight: 700 }}>FIRE REACHED</div>
                ) : (
                  <>
                    <div style={{ ...ftLabel, marginBottom: 1 }}>Est. Time to FI</div>
                    <div className="pnum" style={{ ...mono, fontSize: 16, fontWeight: 700, color: "var(--ft-text)" }}>{displayYears.toFixed(1)} yrs</div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Key metrics grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--ft-border)" }}>
            {[
              { label: "FI Number (25× annual)", value: formatGbp(displayFI), color: "var(--ft-accent)" },
              { label: "Current Net Worth", value: formatGbp(displayNW), color: "var(--ft-text)" },
              { label: "Monthly Spend", value: `${formatGbp(displayMonthlyBurn)}/mo`, color: "var(--ft-red)" },
              { label: "Monthly Savings", value: `${formatGbp(displayContrib)}/mo`, color: "var(--ft-green)" },
            ].map(cell => (
              <div key={cell.label} style={{ background: "var(--ft-surface)", padding: "10px 12px" }}>
                <div style={{ ...ftLabel, marginBottom: 3, fontSize: 8 }}>{cell.label}</div>
                <div className="pnum" style={{ ...mono, fontSize: 13, fontWeight: 700, color: cell.color }}>{cell.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", borderTop: "1px solid var(--ft-border)", paddingTop: 8, lineHeight: 1.6 }}>
          Based on 4% safe withdrawal rate (25× annual expenses). Assumes 5% real annual portfolio growth. Connect accounts for a more accurate net worth estimate.
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const PERSONA_ANALYTICS_FOCUS: Record<string, { tip: string; highlights: string[] }> = {
  market:  { tip: "Track income vs expenses to maximise your investable surplus each month.", highlights: ["Income / Expense Split", "Spending Velocity"] },
  budget:  { tip: "Spot where the money is going — category breakdown and calendar heatmap are your best friends.", highlights: ["Category Intelligence", "Calendar Heatmap"] },
  wealth:  { tip: "Focus on savings rate trends. Recurring vs one-off spend reveals your true fixed cost base.", highlights: ["Income / Expense Split", "Recurring vs One-Off"] },
  social:  { tip: "Watch one-off spikes — these often map to shared outings and split costs.", highlights: ["Biggest Transactions", "Recurring vs One-Off"] },
};

type AnalyticsTab = "overview" | "categories" | "patterns" | "income";

const ANALYTICS_TABS: { id: AnalyticsTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "categories", label: "Categories" },
  { id: "patterns", label: "Patterns" },
  { id: "income", label: "Income" },
];

export default function Analytics() {
  const isMobile = useIsMobile();
  const { data: txs, isLoading, isError, error } = useListTransactions({});
  const { data: rawBudgets = [] } = useListBudgets();
  const [range, setRange] = useState<Range>("3m");
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");
  const [drillCategory, setDrillCategory] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<SpendingAnnotation[]>(() => loadAnnotations());
  const handleAnnotationsChange = useCallback((next: SpendingAnnotation[]) => {
    setAnnotations(next);
    saveAnnotations(next);
  }, []);

  const rawTxs = (txs ?? []) as Tx[];
  const isDemo = rawTxs.length === 0;
  const allTxs = isDemo ? DEMO_TXS : rawTxs;
  const expenses = useMemo(() => allTxs.filter(t => t.type === "expense"), [allTxs]);
  const budgetTotal = useMemo(
    () => (rawBudgets as Array<{ monthlyLimit?: number }>).reduce((s, b) => s + (b.monthlyLimit ?? 0), 0),
    [rawBudgets]
  );

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {/* KPI Bar skeleton */}
        <div className="ft-kpi-bar" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 1, background: "var(--ft-border)", borderBottom: "1px solid var(--ft-border)", marginBottom: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ padding: "10px 12px", background: "var(--ft-surface)" }}>
              <FtSkeleton width="60%" height={9} />
              <div style={{ marginTop: 6 }}><FtSkeleton width="85%" height={16} /></div>
              <div style={{ marginTop: 4 }}><FtSkeleton width="40%" height={9} /></div>
            </div>
          ))}
        </div>
        {/* Panel skeletons */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ ...panelStyle }}>
            <div style={panelHeaderStyle}>
              <FtSkeleton width={160} height={10} />
            </div>
            <div style={{ padding: "12px" }}>
              <FtSkeleton width="100%" height={120} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return <ErrorState message={(error as Error)?.message ?? "Could not load transaction data. Check your connection and try again."} />;
  }

  const tabs = ANALYTICS_TABS;

  return (
    <div>
      {/* ── All-time KPI bar ── */}
      <AnalyticsKpiBar expenses={expenses} allTxs={allTxs} range={range} />

      {/* ── Persona focus strip ── */}
      {(() => {
        const pid = loadPersonaIds()[0];
        const focus = pid ? PERSONA_ANALYTICS_FOCUS[pid] : null;
        const persona = pid ? PERSONAS.find(p => p.id === pid) : null;
        if (!focus || !persona) return null;
        const color = PERSONA_COLORS[persona.id] ?? "var(--ft-amber)";
        return (
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ft-dim)",
            borderLeft: `2px solid ${color}`,
            borderBottom: "1px solid var(--ft-border)",
            background: "var(--ft-surface)",
            padding: "6px 14px",
            marginBottom: 0,
            display: "flex",
            gap: 12,
            alignItems: "baseline",
            flexWrap: "wrap",
          }}>
            <span style={{ color, fontWeight: 700, letterSpacing: "0.06em" }}>{persona.code}</span>
            <span style={{ color: "var(--ft-text)" }}>{focus.tip}</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
              {focus.highlights.map(h => (
                <span key={h} style={{ border: "1px solid var(--ft-border)", padding: "1px 6px", fontSize: 9, letterSpacing: "0.04em", color: "var(--ft-dim)" }}>{h}</span>
              ))}
            </span>
          </div>
        );
      })()}

      {/* ── Demo mode banner ── */}
      {isDemo && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "5px 14px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-surface)", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
          <span style={{ color: "var(--ft-amber)", fontWeight: 700 }}>DEMO MODE</span>
          <span>Showing sample data · import transactions to see your real analytics</span>
          <a href="/import" style={{ marginLeft: "auto", color: "var(--ft-accent)", textDecoration: "none", fontWeight: 700, flexShrink: 0 }}>IMPORT →</a>
        </div>
      )}

      {/* ── Tab navigation ── */}
      <div
        role="tablist"
        aria-label="Analytics sections"
        style={{
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid var(--ft-border)",
          background: "var(--ft-surface)",
          padding: isMobile ? "0 8px" : "0 16px",
          gap: 0,
          overflowX: "auto",
          scrollbarWidth: "none" as const,
          marginBottom: 8,
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(e) => {
              const idx = tabs.findIndex(t => t.id === tab.id);
              if (e.key === "ArrowRight") { e.preventDefault(); setActiveTab(tabs[(idx + 1) % tabs.length].id); }
              if (e.key === "ArrowLeft") { e.preventDefault(); setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length].id); }
              if (e.key === "Home") { e.preventDefault(); setActiveTab(tabs[0].id); }
              if (e.key === "End") { e.preventDefault(); setActiveTab(tabs[tabs.length - 1].id); }
            }}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: isMobile ? 11 : 10,
              fontWeight: activeTab === tab.id ? 700 : 400,
              color: activeTab === tab.id ? "var(--ft-text)" : "var(--ft-dim)",
              background: "none",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid var(--ft-accent)" : "2px solid transparent",
              padding: isMobile ? "11px 10px 10px" : "10px 16px 9px",
              cursor: "pointer",
              letterSpacing: isMobile ? "0.04em" : "0.08em",
              textTransform: "uppercase" as const,
              whiteSpace: "nowrap" as const,
              flexShrink: 0,
              outline: "none",
            }}
          >
            {tab.label}
          </button>
        ))}
        {!isMobile && (
          <div style={{ marginLeft: "auto", padding: "0 0 0 16px", flexShrink: 0 }}>
            <RangeSelector value={range} onChange={setRange} />
          </div>
        )}
      </div>

      {/* ── Mobile range selector row (hidden on desktop) ── */}
      {isMobile && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "6px 12px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-surface)", marginBottom: 8 }}>
          <RangeSelector value={range} onChange={setRange} />
        </div>
      )}

      {/* ── Tab: Overview ── */}
      {activeTab === "overview" && (
        <>
          <KpiStrip expenses={expenses} range={range} onRangeChange={setRange} />
          <FinancialRunway allTxs={allTxs} />
          <SpendingVelocity allExpenses={expenses} budgetTotal={budgetTotal} range={range} onRangeChange={setRange} />
          <WeeklySpendingPulse expenses={expenses} />
          <SavingsRateTrend allTxs={allTxs} />
          <IncomeExpenseSplit allTxs={allTxs} annotations={annotations} onAnnotationsChange={handleAnnotationsChange} />
          <SpendingWaterfall allTxs={allTxs} expenses={expenses} />
          <NetWorthDelta allTxs={allTxs} />
          <CategoryForecast expenses={expenses} />
          <SavingsProjection allTxs={allTxs} />
        </>
      )}

      {/* ── Tab: Categories ── */}
      {activeTab === "categories" && (
        <>
          <CategoryIntelligence
            expenses={expenses}
            range={range}
            onCategoryClick={(cat) => setDrillCategory(cat)}
          />
          <CalendarHeatmap expenses={expenses} />
          <TopMerchants expenses={expenses} />
          <CategoryBenchmark expenses={expenses} />
          <SpendingAnomalies expenses={expenses} isDemo={isDemo} />
          <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <BiggestTransactions expenses={expenses} />
            <RecurringVsOneOff expenses={expenses} />
          </div>
          <SubscriptionTracker expenses={expenses} />
        </>
      )}

      {/* ── Tab: Patterns ── */}
      {activeTab === "patterns" && (
        <>
          <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <SpendingHeatmap expenses={expenses} />
            <DayOfWeekPatterns expenses={expenses} />
          </div>
          <MonthDayPattern expenses={expenses} />
          <SpendingVolatility expenses={expenses} />
          <SeasonalityIndex expenses={expenses} />
          <CategoryMomentum expenses={expenses} />
          <TxAmountDistribution expenses={expenses} />
        </>
      )}

      {/* ── Tab: Income ── */}
      {activeTab === "income" && (
        <>
          <IncomeStability allTxs={allTxs} />
          <PaycheckAllocation allTxs={allTxs} />
          <IncomeSourceBreakdown allTxs={allTxs} />
          <FireTracker allTxs={allTxs} />
        </>
      )}

      {/* ── Category drill-through drawer (global, shown on any tab) ── */}
      <CategoryDrillDrawer
        category={drillCategory}
        expenses={expenses}
        range={range}
        onClose={() => setDrillCategory(null)}
      />
    </div>
  );
}
