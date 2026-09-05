import { useMemo, useState, useEffect, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQueryClient } from "@tanstack/react-query";
import { useListTransactions, useUpdateTransaction, getListTransactionsQueryKey } from "@workspace/api-client-react";
import { formatBaseMoney } from "@/lib/utils";
import { detectRecurring, type RecurringPattern } from "@/lib/recurring-detect";
import { loadPersonaIds, PERSONA_COLORS } from "@/lib/persona";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Repeat2 } from "lucide-react";
import { HStack, MonoLabel, PanelBox, PanelHeader, Text, VStack } from "@/components/primitives";

// ─── types ───────────────────────────────────────────────────────────────────

interface Tx {
  id: number;
  date: string;
  description: string;
  type: string;
  category: string;
  baseEquivalent: number;
  nativeAmount: number;
  currency: string;
  accountId: number;
}

interface RecurringRule {
  id: string;
  matchText: string;
  category: string;
  notes: string;
  isActive: boolean;
}

// ─── style atoms ─────────────────────────────────────────────────────────────

const mono: React.CSSProperties = { fontFamily: "var(--font-mono)" };
const labelStyle: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  color: "var(--ft-dim)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
const card: React.CSSProperties = {
  background: "var(--ft-surface)",
  border: "1px solid var(--ft-border)",
  padding: 20,
  marginBottom: 6,
};
const th: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  color: "var(--ft-dim)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  textAlign: "left",
  padding: "4px 10px",
  fontWeight: 400,
  borderBottom: "1px solid var(--ft-border)",
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  ...mono,
  fontSize: 11,
  color: "var(--ft-text)",
  padding: "7px 10px",
  borderBottom: "1px solid var(--ft-border)",
  whiteSpace: "nowrap",
};
const BTN: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  padding: "4px 10px",
  border: "none",
  background: "var(--ft-accent)",
  color: "var(--ft-base)",
  cursor: "pointer",
};
const BTN_GHOST: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  padding: "4px 10px",
  border: "1px solid var(--ft-border)",
  background: "transparent",
  color: "var(--ft-muted)",
  cursor: "pointer",
};

const STORAGE_KEY = "nr-recurring-rules";

// ─── helpers ─────────────────────────────────────────────────────────────────

function loadRules(): RecurringRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecurringRule[];
  } catch {
    return [];
  }
}

function saveRules(rules: RecurringRule[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

// ─── KPI bar ─────────────────────────────────────────────────────────────────

interface KpiBarProps {
  patterns: RecurringPattern[];
  rules: RecurringRule[];
}

function KpiBar({ patterns, rules }: KpiBarProps) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const in7Days = new Date(today.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);

  const activePatterns = patterns.filter((p) => {
    if (!p.nextEstimated) return false;
    return true;
  });

  const monthlyTotal = useMemo(() => {
    return activePatterns.reduce((sum, p) => {
      if (p.frequency === "weekly") return sum + p.estimatedAmount * 4.33;
      if (p.frequency === "monthly") return sum + p.estimatedAmount;
      if (p.frequency === "quarterly") return sum + p.estimatedAmount / 3;
      if (p.frequency === "yearly") return sum + p.estimatedAmount / 12;
      if (p.intervalDays > 0) return sum + (p.estimatedAmount / p.intervalDays) * 30.44;
      return sum;
    }, 0);
  }, [activePatterns]);

  const annualTotal = monthlyTotal * 12;

  const dueWithin7 = useMemo(() => {
    return patterns.filter(
      (p) => p.nextEstimated && p.nextEstimated >= todayStr && p.nextEstimated <= in7Days
    );
  }, [patterns, todayStr, in7Days]);

  const activeRules = rules.filter((r) => r.isActive).length;

  const kpis = [
    {
      label: "Monthly Commitment",
      value: formatBaseMoney(monthlyTotal),
      sub: `${patterns.length} active patterns`,
      color: monthlyTotal > 0 ? "var(--ft-red)" : "var(--ft-muted)",
    },
    {
      label: "Annual Total",
      value: formatBaseMoney(annualTotal),
      sub: "projected recurring",
      color: annualTotal > 0 ? "var(--ft-amber)" : "var(--ft-muted)",
    },
    {
      label: "Due Within 7 Days",
      value: String(dueWithin7.length),
      sub: dueWithin7.length > 0
        ? dueWithin7.slice(0, 2).map((p) => p.merchantName.slice(0, 14)).join(", ") + (dueWithin7.length > 2 ? "…" : "")
        : "nothing due soon",
      color: dueWithin7.length > 0 ? "var(--ft-amber)" : "var(--ft-green)",
    },
    {
      label: "Active Rules",
      value: String(activeRules),
      sub: `${rules.length} total rules`,
      color: "var(--ft-accent)",
    },
  ];

  const isMobile = useIsMobile();
  const cols = isMobile ? 2 : 4;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, border: "1px solid var(--ft-border)", background: "var(--ft-surface)", marginBottom: 6 }}>
      {kpis.map((k, i) => (
        <div
          key={k.label}
          style={{
            background: "var(--ft-surface)",
            borderRight: i % cols === cols - 1 ? undefined : "1px solid var(--ft-border)",
            borderBottom: i < kpis.length - cols ? "1px solid var(--ft-border)" : undefined,
            padding: isMobile ? "8px 12px" : "10px 16px",
            minWidth: 0,
          }}
        >
          <div style={{ ...labelStyle, marginBottom: 4 }}>{k.label}</div>
          <div style={{
            ...mono,
            fontSize: 18,
            fontWeight: 700,
            color: k.color,
            lineHeight: 1,
            marginBottom: 3,
          }}>
            <span className="pnum">{k.value}</span>
          </div>
          <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {k.sub}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Category breakdown (CSS donut) ─────────────────────────────────────────

const CATEGORY_COLORS = [
  "var(--ft-blue)", "var(--ft-green)", "var(--ft-amber)",
  "var(--ft-cyan)", "var(--ft-red)", "var(--ft-accent)",
  "var(--ft-muted)", "#a78bfa",
];

interface CategoryLegendRowProps {
  category: string;
  monthly: number;
  pct: number;
  color: string;
}

function CategoryLegendRow({ category, monthly, pct, color }: CategoryLegendRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
        padding: "1px 4px",
      }}
    >
      <div style={{ width: 8, height: 8, background: color, flexShrink: 0 }} />
      <span style={{ ...mono, fontSize: 10, color: "var(--ft-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {category}
      </span>
      <span style={{ ...mono, fontSize: 10, color: "var(--ft-text)" }}>
        <span className="pnum">{formatBaseMoney(monthly)}</span>
      </span>
      <span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", width: 30, textAlign: "right" }}>
        <span className="pnum">{pct.toFixed(0)}</span>%
      </span>
    </div>
  );
}

function CategoryBreakdown({ patterns }: { patterns: RecurringPattern[] }) {
  const breakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of patterns) {
      let monthly = p.estimatedAmount;
      if (p.frequency === "weekly") monthly = p.estimatedAmount * 4.33;
      else if (p.frequency === "quarterly") monthly = p.estimatedAmount / 3;
      else if (p.frequency === "yearly") monthly = p.estimatedAmount / 12;
      else if (p.frequency !== "monthly" && p.intervalDays > 0) {
        monthly = (p.estimatedAmount / p.intervalDays) * 30.44;
      }
      const cat = p.category || "Uncategorised";
      map.set(cat, (map.get(cat) ?? 0) + monthly);
    }
    return Array.from(map.entries())
      .map(([category, monthly]) => ({ category, monthly }))
      .sort((a, b) => b.monthly - a.monthly);
  }, [patterns]);

  const total = breakdown.reduce((s, b) => s + b.monthly, 0);

  if (breakdown.length === 0) {
    return (
      <div style={{ ...labelStyle, textAlign: "center", padding: "20px 0", letterSpacing: "0.08em" }}>
        — NO CATEGORY DATA — patterns need categories assigned
      </div>
    );
  }

  let cumulativePct = 0;
  const segments = breakdown.map((b, i) => {
    const pct = total > 0 ? (b.monthly / total) * 100 : 0;
    const start = cumulativePct;
    cumulativePct += pct;
    return { ...b, pct, start, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] };
  });

  const conicGradient = segments
    .map((s) => `${s.color} ${s.start.toFixed(1)}% ${(s.start + s.pct).toFixed(1)}%`)
    .join(", ");

  return (
    <HStack gap={20} align="start">
      {/* Donut */}
      <div style={{ flexShrink: 0, position: "relative", width: 80, height: 80 }}>
        <div style={{
          width: 80, height: 80,
          background: `conic-gradient(${conicGradient})`,
          borderRadius: "50%",
        }} />
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 44, height: 44, background: "var(--ft-surface)",
          borderRadius: "50%",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)" }}>TOTAL</div>
          <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--ft-text)" }}>
            <span className="pnum">{formatBaseMoney(total)}</span>
          </div>
        </div>
      </div>
      {/* Legend */}
      <VStack gap={2} grow>
        {segments.slice(0, 6).map((s) => (
          <CategoryLegendRow
            key={s.category}
            category={s.category}
            monthly={s.monthly}
            pct={s.pct}
            color={s.color}
          />
        ))}
        {segments.length > 6 && (
          <div style={{ ...labelStyle }}>+{segments.length - 6} more categories</div>
        )}
      </VStack>
    </HStack>
  );
}

// ─── Calendar cell ────────────────────────────────────────────────────────────

interface CalendarCellProps {
  day: number;
  payments: RecurringPattern[];
  isToday: boolean;
  isPast: boolean;
}

function CalendarCell({ day, payments, isToday, isPast }: CalendarCellProps) {
  const [hov, setHov] = useState(false);
  const hasPayments = payments.length > 0;
  const dayTotal = payments.reduce((s, p) => s + p.estimatedAmount, 0);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={hasPayments ? payments.map((p) => `${p.merchantName} — ${formatBaseMoney(p.estimatedAmount)}`).join("\n") : undefined}
      style={{
        height: 44,
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 8%, var(--ft-surface))"
          : isToday
          ? "var(--ft-accent)22"
          : hasPayments
          ? "var(--ft-red)18"
          : "var(--ft-base)",
        border: isToday
          ? "1px solid var(--ft-accent)88"
          : hasPayments
          ? "1px solid var(--ft-red)44"
          : "1px solid var(--ft-border)",
        padding: "3px 4px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        opacity: isPast ? 0.5 : 1,
        cursor: hasPayments ? "default" : undefined,
        transition: "background 0.1s",
      }}
    >
      <div style={{ ...mono, fontSize: 9, color: isToday ? "var(--ft-accent)" : "var(--ft-dim)", fontWeight: isToday ? 700 : 400 }}>
        {day}
      </div>
      {hasPayments && (
        <VStack gap={1}>
          {payments.slice(0, 2).map((p) => (
            <div key={p.id} style={{ ...mono, fontSize: 7, color: "var(--ft-red)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.merchantName.slice(0, 8)}
            </div>
          ))}
          {dayTotal > 0 && (
            <div style={{ ...mono, fontSize: 7, color: "var(--ft-red)", fontWeight: 700 }}>
              <span className="pnum">{formatBaseMoney(dayTotal)}</span>
            </div>
          )}
        </VStack>
      )}
    </div>
  );
}

// ─── Calendar view ────────────────────────────────────────────────────────────

function CalendarView({ patterns }: { patterns: RecurringPattern[] }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const dayMap = useMemo(() => {
    const map = new Map<number, RecurringPattern[]>();
    for (const p of patterns) {
      if (!p.nextEstimated) continue;
      const next = new Date(p.nextEstimated);
      if (next.getFullYear() === year && next.getMonth() === month) {
        const d = next.getDate();
        if (!map.has(d)) map.set(d, []);
        map.get(d)!.push(p);
      }
    }
    return map;
  }, [patterns, year, month]);

  const monthTotal = useMemo(() => {
    let total = 0;
    dayMap.forEach((ps) => ps.forEach((p) => { total += p.estimatedAmount; }));
    return total;
  }, [dayMap]);

  const DOW_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const todayDate = today.getDate();
  const currentMonth = today.getMonth() === month && today.getFullYear() === year;

  return (
    <div>
      <HStack align="baseline" justify="between" marginBottom={10}>
        <Text as="div" mono size={10} weight={700} upper letterSpacing="0.1em">
          {today.toLocaleDateString("en-GB", { month: "long", year: "numeric" }).toUpperCase()} — PAYMENT CALENDAR
        </Text>
        {monthTotal > 0 && (
          <div style={{ ...mono, fontSize: 10, color: "var(--ft-red)" }}>
            <span className="pnum">{formatBaseMoney(monthTotal)}</span> due this month
          </div>
        )}
      </HStack>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
        {DOW_LABELS.map((d) => (
          <div key={d} style={{ ...labelStyle, textAlign: "center", padding: "2px 0" }}>{d}</div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} style={{ height: 44, background: "var(--ft-base)", opacity: 0.3 }} />;
          }
          const payments = dayMap.get(day) ?? [];
          const isToday = currentMonth && day === todayDate;
          const isPast = currentMonth && day < todayDate;

          return (
            <CalendarCell
              key={day}
              day={day}
              payments={payments}
              isToday={isToday}
              isPast={isPast}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Trend strip ─────────────────────────────────────────────────────────────

function TrendStrip({ txs }: { txs: Tx[] }) {
  const { thisYear, lastYear, delta, pct } = useMemo(() => {
    const now = new Date();
    const cy = now.getFullYear();
    const ly = cy - 1;
    let thisYear = 0;
    let lastYear = 0;
    for (const tx of txs) {
      if (tx.type !== "expense") continue;
      const yr = parseInt(tx.date.slice(0, 4), 10);
      if (yr === cy) thisYear += Math.abs(tx.baseEquivalent);
      else if (yr === ly) lastYear += Math.abs(tx.baseEquivalent);
    }
    const delta = thisYear - lastYear;
    const pct = lastYear > 0 ? (delta / lastYear) * 100 : null;
    return { thisYear, lastYear, delta, pct };
  }, [txs]);

  if (lastYear === 0 && thisYear === 0) return null;

  const up = delta > 0;
  const color = up ? "var(--ft-red)" : "var(--ft-green)";
  const sign = up ? "+" : "";

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "auto 1fr",
      marginBottom: 6,
      border: "1px solid var(--ft-border)",
      background: "var(--ft-surface)",
    }}>
      <div style={{ background: "var(--ft-surface)", borderRight: "1px solid var(--ft-border)", padding: "8px 14px" }}>
        <div style={{ ...labelStyle, marginBottom: 2 }}>Recurring Spend Trend</div>
      </div>
      <div style={{ background: "var(--ft-surface)", padding: "8px 14px", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ ...labelStyle }}>Last Year</div>
          <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: "var(--ft-text)" }}>
            <span className="pnum">{formatBaseMoney(lastYear)}</span>
          </div>
        </div>
        <div style={{ ...mono, fontSize: 14, color: "var(--ft-dim)" }}>→</div>
        <div>
          <div style={{ ...labelStyle }}>This Year</div>
          <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: "var(--ft-text)" }}>
            <span className="pnum">{formatBaseMoney(thisYear)}</span>
          </div>
        </div>
        <div style={{ ...mono, fontSize: 13, fontWeight: 700, color }}>
          <span className="pnum">{sign}{formatBaseMoney(Math.abs(delta))}</span>
          {pct !== null && (
            <span style={{ fontSize: 10, marginLeft: 4 }}>(<span className="pnum">{sign}{pct.toFixed(0)}</span>%)</span>
          )}
        </div>
        <div style={{ ...mono, fontSize: 10, color: "var(--ft-dim)" }}>
          {up ? "↑ recurring costs rising" : "↓ recurring costs down"}
        </div>
      </div>
    </div>
  );
}

// ─── Confidence Badge ─────────────────────────────────────────────────────────

interface ConfidenceBadgeProps {
  score: number;
}

function ConfidenceBadge({ score: rawScore }: ConfidenceBadgeProps) {
  // Clamp at the render as a second line; the detector is where the fix lives.
  const score = Math.min(100, Math.max(0, rawScore));
  const color =
    score >= 80 ? "var(--ft-green)" :
    score >= 50 ? "var(--ft-amber)" : "var(--ft-red)";
  return (
    <span style={{
      ...mono,
      fontSize: 8,
      padding: "1px 5px",
      background: `${color}22`,
      color,
      border: `1px solid ${color}44`,
      letterSpacing: "0.04em",
    }}>
      <span className="pnum">{score}</span>% CONF
    </span>
  );
}

// ─── Pattern Card ─────────────────────────────────────────────────────────────

interface PatternCardProps {
  pattern: RecurringPattern;
  today: string;
  in7d: string;
  onAddRule: (p: RecurringPattern) => void;
}

function PatternCard({ pattern: p, today, in7d, onAddRule }: PatternCardProps) {
  const [hov, setHov] = useState(false);
  const isDueSoon = p.nextEstimated != null && p.nextEstimated >= today && p.nextEstimated <= in7d;
  const isOverdue = p.nextEstimated != null && p.nextEstimated < today;

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
      style={{
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-base))" : "var(--ft-base)",
        border: isDueSoon
          ? "1px solid var(--ft-amber)66"
          : isOverdue
          ? "1px solid var(--ft-red)44"
          : "1px solid var(--ft-border)",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        transition: "background 0.1s",
      }}
    >
      {/* Title row */}
      <HStack gap={8} align="start" justify="between">
        <div style={{ ...mono, fontSize: 12, color: "var(--ft-text)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {p.merchantName}
        </div>
        <HStack gap={4} shrink={false}>
          <span style={{ ...mono, fontSize: 9, padding: "1px 6px", background: "var(--ft-accent)22", color: "var(--ft-accent)" }}>
            {p.frequency}
          </span>
        </HStack>
      </HStack>

      {/* Confidence bar */}
      <HStack gap={8} align="center">
        <ConfidenceBadge score={p.confidence} />
        <div style={{ flex: 1, height: 2, background: "var(--ft-border)" }}>
          <div style={{
            height: "100%",
            width: `${Math.min(100, Math.max(0, p.confidence))}%`,
            background: p.confidence >= 80 ? "var(--ft-green)" : p.confidence >= 50 ? "var(--ft-amber)" : "var(--ft-red)",
          }} />
        </div>
      </HStack>

      {/* Amounts + dates */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ ...labelStyle, marginBottom: 2 }}>Est. amount</div>
          <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: "var(--ft-red)" }}>
            -<span className="pnum">{formatBaseMoney(p.estimatedAmount)}</span>
          </div>
        </div>
        <div>
          <div style={{ ...labelStyle, marginBottom: 2 }}>Last seen</div>
          <div style={{ ...mono, fontSize: 10, color: "var(--ft-muted)" }}>{p.lastOccurrence}</div>
        </div>
        {p.nextEstimated && (
          <div>
            <div style={{ ...labelStyle, marginBottom: 2 }}>Next est.</div>
            <div style={{ ...mono, fontSize: 10, color: isDueSoon ? "var(--ft-amber)" : isOverdue ? "var(--ft-red)" : "var(--ft-muted)" }}>
              {p.nextEstimated}
              {isDueSoon && <svg style={{ marginLeft: 4, verticalAlign: "middle" }} width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 1v3.5M4.5 6.5v.5"/><path d="M1 8h7L4.5 1 1 8z"/></svg>}
              {isOverdue && <svg style={{ marginLeft: 4, verticalAlign: "middle" }} width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="4.5" cy="4.5" r="3.5"/><path d="M4.5 3v1.75M4.5 6.25v.25"/></svg>}
            </div>
          </div>
        )}
        <div>
          <div style={{ ...labelStyle, marginBottom: 2 }}>Count</div>
          <div style={{ ...mono, fontSize: 10, color: "var(--ft-muted)" }}><span className="pnum">{p.occurrences}</span>×</div>
        </div>
      </div>

      {p.category && (
        <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", padding: "1px 6px", background: "var(--ft-raised)", alignSelf: "flex-start" }}>
          {p.category}
        </div>
      )}

      <button
        onClick={() => onAddRule(p)}
        style={{ ...BTN, alignSelf: "flex-start", marginTop: 2 }}
      >
        + Add Rule
      </button>
    </div>
  );
}

// ─── Auto-Detected Section ────────────────────────────────────────────────────

function AutoDetected({
  patterns,
  onAddRule,
}: {
  patterns: RecurringPattern[];
  onAddRule: (p: RecurringPattern) => void;
}) {
  const [search, setSearch] = useState("");
  const [freqFilter, setFreqFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"cards" | "calendar" | "category">("cards");

  const allFreqs = useMemo(() => {
    const set = new Set(patterns.map((p) => p.frequency));
    return Array.from(set).sort();
  }, [patterns]);

  const visible = useMemo(() => {
    return patterns.filter((p) => {
      const matchSearch = !search || p.merchantName.toLowerCase().includes(search.toLowerCase());
      const matchFreq = freqFilter === "all" || p.frequency === freqFilter;
      return matchSearch && matchFreq;
    });
  }, [patterns, search, freqFilter]);

  const hasFilters = search || freqFilter !== "all";

  const today = new Date().toISOString().slice(0, 10);
  const in7d = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  return (
    <div style={{ ...card, padding: 0 }}>
      <PanelHeader right={
          <HStack gap={4}>
            {(["cards", "calendar", "category"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                style={{
                  ...BTN_GHOST,
                  fontSize: 8,
                  background: viewMode === m ? "var(--ft-accent)22" : "transparent",
                  color: viewMode === m ? "var(--ft-accent)" : "var(--ft-dim)",
                  borderColor: viewMode === m ? "var(--ft-accent)66" : "var(--ft-border)",
                  padding: "3px 8px",
                }}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </HStack>
        }>AUTO-DETECTED RECURRING TRANSACTIONS <Text as="span" mono size={10} color="var(--ft-muted)">Matched by description + interval + amount within ±10% · Confidence scored 0–100</Text></PanelHeader>
      <div style={{ padding: 20 }}>

      {viewMode === "calendar" && (
        <div style={{ marginBottom: 8 }}>
          <CalendarView patterns={visible} />
        </div>
      )}

      {viewMode === "category" && (
        <div style={{ marginBottom: 8 }}>
          <CategoryBreakdown patterns={visible} />
        </div>
      )}

      {viewMode === "cards" && (
        <>
          {patterns.length > 0 && (
            <div className="ft-filter-bar" style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search merchant…"
                style={{
                  ...mono,
                  fontSize: 11,
                  background: "var(--ft-base)",
                  border: "1px solid var(--ft-border)",
                  color: "var(--ft-text)",
                  padding: "5px 10px",
                  outline: "none",
                  flex: "1 1 160px",
                  minWidth: 120,
                }}
              />
              <select
                value={freqFilter}
                onChange={(e) => setFreqFilter(e.target.value)}
                style={{
                  ...mono,
                  fontSize: 10,
                  background: "var(--ft-base)",
                  border: "1px solid var(--ft-border)",
                  color: "var(--ft-text)",
                  padding: "5px 10px",
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                <option value="all">All frequencies</option>
                {allFreqs.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              {hasFilters && (
                <button
                  onClick={() => { setSearch(""); setFreqFilter("all"); }}
                  style={{ ...BTN_GHOST, fontSize: 9 }}
                >
                  Clear
                </button>
              )}
              {hasFilters && (
                <span style={{ ...labelStyle, alignSelf: "center" }}>
                  <span className="pnum">{visible.length}</span> of <span className="pnum">{patterns.length}</span>
                </span>
              )}
            </div>
          )}

          {visible.length === 0 && patterns.length > 0 ? (
            <div style={{ ...labelStyle, textAlign: "center", padding: "24px 0", letterSpacing: "0.08em" }}>
              — NO PATTERNS MATCH CURRENT FILTERS —
            </div>
          ) : patterns.length === 0 ? (
            <div style={{ ...labelStyle, textAlign: "center", padding: "24px 0", letterSpacing: "0.08em" }}>
              — NO RECURRING PATTERNS DETECTED — add more transactions to build history
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 8 }}>
              {visible.map((p) => (
                <PatternCard key={p.id} pattern={p} today={today} in7d={in7d} onAddRule={onAddRule} />
              ))}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}

// ─── Rule Table Row ───────────────────────────────────────────────────────────

interface RuleTableRowProps {
  rule: RecurringRule;
  matchCount: number;
  isTesting: boolean;
  testMatches: Tx[];
  deleteConfirmId: string | null;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onStartEdit: (rule: RecurringRule) => void;
  onSetTesting: (id: string | null) => void;
  onSetDeleteConfirm: (id: string | null) => void;
}

function RuleTableRow({
  rule,
  matchCount,
  isTesting,
  testMatches,
  deleteConfirmId,
  onToggle,
  onDelete,
  onStartEdit,
  onSetTesting,
  onSetDeleteConfirm,
}: RuleTableRowProps) {
  const [hov, setHov] = useState(false);

  return (
    <>
      <tr
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          opacity: rule.isActive ? 1 : 0.5,
          background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
          transition: "background 0.1s",
        }}
      >
        <td style={{ ...td, width: 52 }}>
          <button
            onClick={() => onToggle(rule.id)}
            style={{
              ...mono, fontSize: 9, padding: "2px 6px", border: "none", cursor: "pointer",
              background: rule.isActive ? "var(--ft-green)22" : "var(--ft-border)",
              color: rule.isActive ? "var(--ft-green)" : "var(--ft-dim)",
            }}
          >
            {rule.isActive ? "ON" : "OFF"}
          </button>
        </td>
        <td style={{ ...td, fontWeight: 600, color: "var(--ft-accent)" }}>
          {rule.matchText}
        </td>
        <td style={td}>
          <span style={{ fontSize: 9, padding: "1px 6px", background: "var(--ft-raised)", color: "var(--ft-muted)" }}>
            {rule.category}
          </span>
        </td>
        <td style={{ ...td, color: "var(--ft-dim)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
          {rule.notes || "—"}
        </td>
        <td style={{ ...td, textAlign: "right" }}>
          <button
            onClick={() => onSetTesting(isTesting ? null : rule.id)}
            style={{
              ...BTN_GHOST, fontSize: 9,
              color: matchCount > 0 ? "var(--ft-amber)" : "var(--ft-dim)",
            }}
          >
            <span className="pnum">{matchCount}</span> match{matchCount !== 1 ? "es" : ""} {isTesting ? "▲" : "▼"}
          </button>
        </td>
        <td style={{ ...td, textAlign: "right" }}>
          <HStack gap={4} justify="end">
            <button
              onClick={() => onStartEdit(rule)}
              style={{ ...BTN_GHOST, fontSize: 8, color: "var(--ft-cyan)", borderColor: "var(--ft-cyan)44", padding: "2px 6px" }}
            >
              Edit
            </button>
            <button
              onClick={() => {
                if (deleteConfirmId === rule.id) { onDelete(rule.id); onSetDeleteConfirm(null); }
                else { onSetDeleteConfirm(rule.id); setTimeout(() => onSetDeleteConfirm(null), 3000); }
              }}
              style={{
                ...BTN_GHOST,
                background: deleteConfirmId === rule.id ? "var(--ft-red)" : undefined,
                color: deleteConfirmId === rule.id ? "#fff" : "var(--ft-red)",
                borderColor: "var(--ft-red)44",
              }}
              title={deleteConfirmId === rule.id ? "Click again to confirm" : "Delete rule"}
            >
              {deleteConfirmId === rule.id ? "Confirm?" : "Del"}
            </button>
          </HStack>
        </td>
      </tr>
      {isTesting && testMatches.length > 0 && (
        <tr>
          <td colSpan={6} style={{ ...td, padding: 0 }}>
            <div style={{
              background: "var(--ft-amber)08", border: "1px solid var(--ft-amber)33",
              padding: "10px 14px",
            }}>
              <div style={{ ...labelStyle, color: "var(--ft-amber)", marginBottom: 8 }}>
                Top matching transactions (showing up to 5)
              </div>
              {testMatches.map((t) => (
                <div key={t.id} style={{ display: "flex", gap: 16, marginBottom: 4, alignItems: "center" }}>
                  <span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", width: 80 }}>{t.date}</span>
                  <span style={{ ...mono, fontSize: 10, color: "var(--ft-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description}</span>
                  <span style={{ ...mono, fontSize: 9, color: "var(--ft-muted)" }}>{t.category || "—"}</span>
                  <span style={{ ...mono, fontSize: 9, color: "var(--ft-amber)" }}>→ {rule.category}</span>
                  <span style={{ ...mono, fontSize: 10, color: "var(--ft-red)" }}>
                    <span className="pnum">{formatBaseMoney(t.baseEquivalent)}</span>
                  </span>
                </div>
              ))}
              {matchCount > 5 && (
                <div style={{ ...labelStyle, marginTop: 4 }}>…and <span className="pnum">{matchCount - 5}</span> more</div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Manual Rules CSV export ──────────────────────────────────────────────────

function exportRulesCSV(rules: RecurringRule[], allTxs: Tx[]): void {
  const header = ["Match Text", "Category", "Notes", "Active", "Matches"].join(",");
  const matchCount = (rule: RecurringRule) =>
    allTxs.filter((t) => t.description.toLowerCase().includes(rule.matchText.toLowerCase())).length;
  const rows = rules.map((r) => {
    const count = matchCount(r);
    return [
      `"${r.matchText.replace(/"/g, '""')}"`,
      `"${r.category.replace(/"/g, '""')}"`,
      `"${r.notes.replace(/"/g, '""')}"`,
      r.isActive ? "Yes" : "No",
      count,
    ].join(",");
  });
  const csv = [header, ...rows].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `recurring-rules-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Preview Table Row ────────────────────────────────────────────────────────

interface PreviewTableRowProps {
  tx: Tx;
  newCategory: string;
  rule: RecurringRule;
}

function PreviewTableRow({ tx, newCategory, rule }: PreviewTableRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <td style={{ ...td, color: "var(--ft-dim)" }}>{tx.date}</td>
      <td style={{ ...td, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{tx.description}</td>
      <td style={{ ...td, color: "var(--ft-muted)" }}>{tx.category || <em style={{ color: "var(--ft-dim)" }}>none</em>}</td>
      <td style={{ ...td, color: "var(--ft-accent)", fontSize: 9 }}>{rule.matchText}</td>
      <td style={td}>
        <span style={{ fontSize: 9, padding: "1px 6px", background: "var(--ft-green)22", color: "var(--ft-green)" }}>
          {newCategory}
        </span>
      </td>
    </tr>
  );
}

// ─── Manual Rules Section ─────────────────────────────────────────────────────

function ManualRules({
  rules,
  allTxs,
  onToggle,
  onDelete,
  onAddRule,
}: {
  rules: RecurringRule[];
  allTxs: Tx[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onAddRule: (rule: RecurringRule) => void;
}) {
  const [form, setForm] = useState({ matchText: "", category: "", notes: "" });
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ matchText: "", category: "", notes: "" });

  const matchCount = (rule: RecurringRule) =>
    allTxs.filter((t) =>
      t.description.toLowerCase().includes(rule.matchText.toLowerCase())
    ).length;

  const handleAdd = () => {
    if (!form.matchText.trim()) return;
    const rule: RecurringRule = {
      id: `rule-${Date.now()}`,
      matchText: form.matchText.trim(),
      category: form.category.trim() || "Other",
      notes: form.notes.trim(),
      isActive: true,
    };
    onAddRule(rule);
    setForm({ matchText: "", category: "", notes: "" });
  };

  const startEdit = (rule: RecurringRule) => {
    setEditingId(rule.id);
    setEditForm({ matchText: rule.matchText, category: rule.category, notes: rule.notes });
  };

  const CATEGORIES = ["Subscriptions", "Utilities", "Insurance", "Transport", "Food & Drink", "Health", "Entertainment", "Education", "Other"];

  return (
    <div style={{ ...card, padding: 0 }}>
      <PanelHeader right={
          rules.length > 0 ? (
            <button
              onClick={() => exportRulesCSV(rules, allTxs)}
              style={{ ...BTN_GHOST, fontSize: 9, color: "var(--ft-cyan)", borderColor: "var(--ft-cyan)44", flexShrink: 0 }}
            >
              ↓ CSV
            </button>
          ) : undefined
        }>MANUAL RULES <Text as="span" mono size={10} color="var(--ft-muted)">Define rules to auto-categorize transactions by description keyword</Text></PanelHeader>
      <div style={{ padding: 20 }}>

      {/* Add form */}
      <div className="ft-filter-bar" style={{
        background: "var(--ft-base)",
        border: "1px solid var(--ft-border)",
        padding: "14px 16px",
        marginBottom: 16,
        display: "flex",
        gap: 10,
        alignItems: "flex-end",
        flexWrap: "wrap",
      }}>
        <VStack gap={4} grow={2} minWidth={140}>
          <div style={labelStyle}>Match text (substring)</div>
          <input
            value={form.matchText}
            onChange={(e) => setForm((f) => ({ ...f, matchText: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            placeholder="e.g. Netflix"
            style={{
              ...mono, fontSize: 11,
              background: "var(--ft-surface)", border: "1px solid var(--ft-border)",
              color: "var(--ft-text)", padding: "6px 10px", outline: "none",
            }}
          />
        </VStack>
        <VStack gap={4} grow minWidth={120}>
          <div style={labelStyle}>Assign category</div>
          <input
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            list="rule-categories"
            placeholder="e.g. Subscriptions"
            style={{
              ...mono, fontSize: 11,
              background: "var(--ft-surface)", border: "1px solid var(--ft-border)",
              color: "var(--ft-text)", padding: "6px 10px", outline: "none",
            }}
          />
          <datalist id="rule-categories">
            {CATEGORIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </VStack>
        <VStack gap={4} grow={2} minWidth={120}>
          <div style={labelStyle}>Notes (optional)</div>
          <input
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="e.g. Monthly subscription"
            style={{
              ...mono, fontSize: 11,
              background: "var(--ft-surface)", border: "1px solid var(--ft-border)",
              color: "var(--ft-text)", padding: "6px 10px", outline: "none",
            }}
          />
        </VStack>
        <button
          onClick={handleAdd}
          disabled={!form.matchText.trim()}
          style={{
            ...BTN,
            opacity: !form.matchText.trim() ? 0.5 : 1,
            cursor: !form.matchText.trim() ? "not-allowed" : "pointer",
            padding: "8px 16px",
          }}
        >
          + Add Rule
        </button>
      </div>

      {rules.length === 0 ? (
        <div style={{ ...labelStyle, textAlign: "center", padding: "16px 0", letterSpacing: "0.08em" }}>
          — NO MANUAL RULES — add one above
        </div>
      ) : (
        <div className="ft-scroll-x">
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
            <thead>
              <tr>
                {["Active", "Match Text", "Category", "Notes", "Matches", "Actions"].map((h, i) => (
                  <th key={h} style={{ ...th, textAlign: i >= 4 ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const count = matchCount(rule);
                const isTesting = testingId === rule.id;
                const isEditing = editingId === rule.id;
                const testMatches = isTesting
                  ? allTxs.filter((t) =>
                      t.description.toLowerCase().includes(rule.matchText.toLowerCase())
                    ).slice(0, 5)
                  : [];

                if (isEditing) {
                  return (
                    <tr key={`${rule.id}-edit`}>
                      <td colSpan={6} style={{ ...td, padding: 0 }}>
                        <div style={{
                          background: "var(--ft-accent)08", border: "1px solid var(--ft-accent)33",
                          padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap",
                        }}>
                          <VStack gap={4} grow={2} minWidth={120}>
                            <div style={labelStyle}>Match text</div>
                            <input
                              value={editForm.matchText}
                              onChange={(e) => setEditForm((f) => ({ ...f, matchText: e.target.value }))}
                              style={{ ...mono, fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", color: "var(--ft-text)", padding: "5px 8px", outline: "none" }}
                            />
                          </VStack>
                          <VStack gap={4} grow minWidth={100}>
                            <div style={labelStyle}>Category</div>
                            <input
                              value={editForm.category}
                              onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                              list="rule-categories"
                              style={{ ...mono, fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", color: "var(--ft-text)", padding: "5px 8px", outline: "none" }}
                            />
                          </VStack>
                          <VStack gap={4} grow={2} minWidth={100}>
                            <div style={labelStyle}>Notes</div>
                            <input
                              value={editForm.notes}
                              onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                              style={{ ...mono, fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", color: "var(--ft-text)", padding: "5px 8px", outline: "none" }}
                            />
                          </VStack>
                          <HStack gap={6}>
                            <button
                              onClick={() => {
                                if (!editForm.matchText.trim()) return;
                                onAddRule({ ...rule, matchText: editForm.matchText.trim(), category: editForm.category.trim() || "Other", notes: editForm.notes.trim() });
                                onDelete(rule.id);
                                setEditingId(null);
                              }}
                              style={{ ...BTN, padding: "6px 12px" }}
                            >
                              Save
                            </button>
                            <button onClick={() => setEditingId(null)} style={{ ...BTN_GHOST, padding: "6px 12px" }}>
                              Cancel
                            </button>
                          </HStack>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <RuleTableRow
                    key={rule.id}
                    rule={rule}
                    matchCount={count}
                    isTesting={isTesting}
                    testMatches={testMatches}
                    deleteConfirmId={deleteConfirmId}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    onStartEdit={startEdit}
                    onSetTesting={setTestingId}
                    onSetDeleteConfirm={setDeleteConfirmId}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}

// ─── Apply Rules section ──────────────────────────────────────────────────────

function ApplyRules({
  rules,
  allTxs,
}: {
  rules: RecurringRule[];
  allTxs: Tx[];
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const confirmAreaRef = useRef<HTMLDivElement>(null);
  const updateTx = useUpdateTransaction();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!confirmApply) return;
    const id = setTimeout(() => setConfirmApply(false), 5000);
    return () => clearTimeout(id);
  }, [confirmApply]);

  useEffect(() => {
    if (!confirmApply) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (confirmAreaRef.current && !confirmAreaRef.current.contains(e.target as Node)) {
        setConfirmApply(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [confirmApply]);

  const activeRules = rules.filter((r) => r.isActive);

  const preview = useMemo(() => {
    const changes: { tx: Tx; newCategory: string; rule: RecurringRule }[] = [];
    for (const tx of allTxs) {
      if (tx.category) continue;
      for (const rule of activeRules) {
        if (tx.description.toLowerCase().includes(rule.matchText.toLowerCase())) {
          changes.push({ tx, newCategory: rule.category, rule });
          break;
        }
      }
    }
    return changes;
  }, [allTxs, activeRules]);

  const handleApply = async () => {
    if (preview.length === 0 || applying) return;
    setApplying(true);
    try {
      await Promise.all(
        preview.map(({ tx, newCategory }) =>
          updateTx.mutateAsync({
            id: tx.id,
            data: {
              date: tx.date,
              description: tx.description,
              type: tx.type as "income" | "expense" | "transfer",
              category: newCategory,
              nativeAmount: tx.nativeAmount,
              currency: tx.currency,
              accountId: tx.accountId,
            },
          })
        )
      );
      await queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      toast({ title: `Applied ${preview.length} rule${preview.length !== 1 ? "s" : ""}`, description: "Transactions re-categorised successfully." });
      setShowPreview(false);
      setConfirmApply(false);
    } catch {
      toast({ title: "Failed to apply rules", description: "Some transactions could not be updated.", variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const handleApplyClick = () => {
    if (!confirmApply) {
      setConfirmApply(true);
    } else {
      void handleApply();
    }
  };

  return (
    <div style={{ ...card, padding: 0 }}>
      <PanelHeader>APPLY RULES <Text as="span" mono size={10} color="var(--ft-muted)">Preview and apply active rules to un-categorized transactions</Text></PanelHeader>
      <div style={{ padding: 20 }}>

      <HStack gap={10} align="start" wrap marginBottom={16}>
        <div style={{ ...mono, fontSize: 11, color: "var(--ft-text)", alignSelf: "center" }}>
          <span className="pnum">{activeRules.length}</span> active rule{activeRules.length !== 1 ? "s" : ""} · <span className="pnum">{preview.length}</span> un-categorized transaction{preview.length !== 1 ? "s" : ""} would be updated
        </div>
        <button
          onClick={() => setShowPreview((v) => !v)}
          disabled={preview.length === 0}
          style={{ ...BTN_GHOST, opacity: preview.length === 0 ? 0.5 : 1, cursor: preview.length === 0 ? "not-allowed" : "pointer", alignSelf: "center" }}
        >
          {showPreview ? "Hide" : "Show"} Preview (<span className="pnum">{preview.length}</span>)
        </button>
        <div ref={confirmAreaRef} style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <button
            onClick={handleApplyClick}
            disabled={preview.length === 0 || applying}
            style={{
              ...BTN_GHOST,
              background: applying ? undefined : confirmApply ? "rgba(210,140,0,0.12)" : preview.length > 0 ? "var(--ft-blue)18" : undefined,
              color: applying ? "var(--ft-dim)" : confirmApply ? "var(--ft-amber)" : preview.length > 0 ? "var(--ft-blue)" : "var(--ft-dim)",
              borderColor: applying ? undefined : confirmApply ? "rgba(210,140,0,0.4)" : preview.length > 0 ? "var(--ft-blue)44" : undefined,
              opacity: preview.length === 0 || applying ? 0.5 : 1,
              cursor: preview.length === 0 || applying ? "not-allowed" : "pointer",
              transition: "background 0.15s, color 0.15s, border-color 0.15s",
            }}
          >
            {applying ? "Applying…" : confirmApply ? `Confirm Apply (${preview.length}) →` : `Apply ${preview.length > 0 ? `(${preview.length})` : ""}`}
          </button>
          {confirmApply && !applying && (
            <div style={{ ...mono, fontSize: 9, color: "var(--ft-amber)", letterSpacing: "0.04em", opacity: 0.85 }}>
              This will update <span className="pnum">{preview.length}</span> transaction{preview.length !== 1 ? "s" : ""}. Click again to confirm.
            </div>
          )}
        </div>
      </HStack>

      {showPreview && preview.length > 0 && (
        <div className="ft-scroll-x">
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
            <thead>
              <tr>
                {["Date", "Description", "Current Category", "Rule", "New Category"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.slice(0, 50).map(({ tx, newCategory, rule }) => (
                <PreviewTableRow key={tx.id} tx={tx} newCategory={newCategory} rule={rule} />
              ))}
              {preview.length > 50 && (
                <tr>
                  <td colSpan={5} style={{ ...td, textAlign: "center", color: "var(--ft-dim)" }}>
                    …and <span className="pnum">{preview.length - 50}</span> more rows
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showPreview && preview.length === 0 && (
        <div style={{ ...labelStyle, textAlign: "center", padding: "16px 0", letterSpacing: "0.08em" }}>
          — ALL TRANSACTIONS CATEGORIZED — no active rules match uncategorized transactions
        </div>
      )}
      </div>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function RecurringPage() {
  const { data: rawTxs, isLoading } = useListTransactions({});
  const allTxs = (rawTxs ?? []) as Tx[];

  const [rules, setRules] = useState<RecurringRule[]>(loadRules);

  const patterns = useMemo(() => detectRecurring(allTxs), [allTxs]);

  const handleAddRuleFromPattern = (p: RecurringPattern) => {
    const rule: RecurringRule = {
      id: `rule-${Date.now()}`,
      matchText: p.merchantName,
      category: p.category || "Subscriptions",
      notes: `Auto-detected · ${p.frequency} · ~${formatBaseMoney(p.estimatedAmount)} · ${p.confidence}% conf`,
      isActive: true,
    };
    setRules((prev) => {
      const updated = [...prev, rule];
      saveRules(updated);
      return updated;
    });
  };

  const handleAddRule = (rule: RecurringRule) => {
    setRules((prev) => {
      if (prev.some((r) => r.matchText.toLowerCase() === rule.matchText.toLowerCase())) return prev;
      const updated = [...prev, rule];
      saveRules(updated);
      return updated;
    });
  };

  const handleToggle = (id: string) => {
    setRules((prev) => {
      const updated = prev.map((r) => r.id === id ? { ...r, isActive: !r.isActive } : r);
      saveRules(updated);
      return updated;
    });
  };

  const handleDelete = (id: string) => {
    setRules((prev) => {
      const updated = prev.filter((r) => r.id !== id);
      saveRules(updated);
      return updated;
    });
  };

  if (isLoading) {
    return (
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", padding: "40px 0", textAlign: "center", letterSpacing: "0.08em" }}>
        — LOADING TRANSACTION DATA —
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        icon={Repeat2}
        title="RECURRING RULES"
        subtitle="auto-detect and categorize recurring transactions"
        actions={
          <HStack gap={16} align="center">
            <div style={{ textAlign: "right" }}>
              <div style={{ ...labelStyle, marginBottom: 2 }}>Detected patterns</div>
              <Text as="div" mono size={16} weight={700} color="var(--ft-text)">
                <span className="pnum">{patterns.length}</span>
              </Text>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ ...labelStyle, marginBottom: 2 }}>Active rules</div>
              <Text as="div" mono size={16} weight={700} color="var(--ft-accent)">
                <span className="pnum">{rules.filter((r) => r.isActive).length}</span>
              </Text>
            </div>
          </HStack>
        }
      />

      {/* Persona context strip */}
      {(() => {
        const pid = loadPersonaIds()[0];
        if (!pid || pid === "full") return null;
        const activeCount = rules.filter(r => r.isActive).length;
        const msgs: Record<string, string | null> = {
          budget:  activeCount > 0 ? `${activeCount} auto-categorization rules active — these keep your spending breakdown accurate as new transactions arrive.` : `Set up recurring rules to auto-categorize transactions and keep your budget analysis clean.`,
          wealth:  `Auto-categorizing recurring costs separates your fixed overhead from variable spending — key for FIRE planning accuracy.`,
          market:  null,
          social:  null,
        };
        const msg = msgs[pid];
        if (!msg) return null;
        const color = PERSONA_COLORS[pid as keyof typeof PERSONA_COLORS] ?? "var(--ft-accent)";
        return (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", border: "1px solid var(--ft-border)", background: "var(--ft-surface)", padding: "7px 12px", marginBottom: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color, fontWeight: 700, flexShrink: 0 }}>·</span>
            <span>{msg}</span>
          </div>
        );
      })()}

      <KpiBar patterns={patterns} rules={rules} />
      <TrendStrip txs={allTxs} />
      <AutoDetected patterns={patterns} onAddRule={handleAddRuleFromPattern} />
      <ManualRules
        rules={rules}
        allTxs={allTxs}
        onToggle={handleToggle}
        onDelete={handleDelete}
        onAddRule={handleAddRule}
      />
      <ApplyRules rules={rules} allTxs={allTxs} />
    </div>
  );
}
