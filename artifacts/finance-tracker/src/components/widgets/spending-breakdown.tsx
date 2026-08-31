import { useState } from "react";
import { useListTransactions } from "@workspace/api-client-react";
import { formatBaseMoney } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const PALETTE = [
  "var(--ft-accent)",
  "var(--ft-cyan)",
  "var(--ft-amber)",
  "var(--ft-blue)",
  "var(--ft-green)",
  "#9D7CD8",
  "#F7768E",
  "#73DACA",
];

function monthBounds(offset: number): { dateFrom: string; dateTo: string; label: string } {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  const year = d.getFullYear();
  const month = d.getMonth();
  const dateFrom = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const dateTo = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const label = d.toLocaleString("en-GB", { month: "long", year: "numeric" });
  return { dateFrom, dateTo, label };
}

type TrendChip = { arrow: "▲" | "▼" | "→"; pct: number | null; tag: "up" | "down" | "flat" | "new" };

function getTrend(amount: number, prev: number | undefined, prevExists: boolean): TrendChip {
  if (!prevExists) return { arrow: "▲", pct: null, tag: "new" };
  if (prev === undefined || prev === 0) return { arrow: "▲", pct: null, tag: "new" };
  const delta = amount - prev;
  if (delta === 0) return { arrow: "→", pct: 0, tag: "flat" };
  const pct = Math.abs((delta / prev) * 100);
  return delta > 0
    ? { arrow: "▲", pct, tag: "up" }
    : { arrow: "▼", pct, tag: "down" };
}

function trendColor(tag: TrendChip["tag"]): string {
  if (tag === "up") return "var(--ft-red)";
  if (tag === "down") return "var(--ft-green)";
  if (tag === "new") return "var(--ft-amber)";
  return "var(--ft-dim)";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type CategoryBarRowProps = {
  cat: string;
  amount: number;
  pct: number;
  color: string;
  rank: number;
  prevHasData: boolean;
  trend: TrendChip;
};

function CategoryBarRow({ cat, amount, pct, color, rank, prevHasData, trend }: CategoryBarRowProps) {
  const [hov, setHov] = useState(false);
  const chipColor = trendColor(trend.tag);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        marginBottom: 10,
        padding: "4px 6px",
        borderRadius: 2,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-border2)", fontWeight: 700, flexShrink: 0, minWidth: 12, textAlign: "right" }}>
            {rank}
          </span>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", letterSpacing: "0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {cat}
          </span>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {prevHasData && (
            <span style={{
              fontSize: 8,
              fontWeight: 700,
              color: chipColor,
              background: `color-mix(in srgb, ${chipColor} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${chipColor} 35%, transparent)`,
              borderRadius: 2,
              padding: "1px 4px",
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
              letterSpacing: "0.02em",
            }}>
              {trend.tag === "new"
                ? "NEW"
                : trend.tag === "flat"
                  ? "—"
                  : `${trend.arrow} ${trend.pct !== null ? trend.pct.toFixed(0) : ""}%`}
            </span>
          )}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>{pct.toFixed(0)}%</span>
          <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color }}>−{formatBaseMoney(amount)}</span>
        </span>
      </div>
      <div style={{ height: 5, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.12s ease" }} />
      </div>
    </div>
  );
}

type DonutLegendItemProps = {
  cat: string;
  amt: number;
  total: number;
  color: string;
};

function DonutLegendItem({ cat, amt, total, color }: DonutLegendItemProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "1px 2px",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, transparent)" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat}</span>
      <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color }}>{total > 0 ? ((amt / total) * 100).toFixed(0) : 0}%</span>
    </div>
  );
}

type VsLastMonthRowProps = {
  cat: string;
  amount: number;
  prev: number;
  color: string;
};

function VsLastMonthRow({ cat, amount, prev, color }: VsLastMonthRowProps) {
  const [hov, setHov] = useState(false);
  const delta = amount - prev;
  const deltaColor = delta > 0 ? "var(--ft-red)" : delta < 0 ? "var(--ft-green)" : "var(--ft-dim)";
  const deltaLabel = delta === 0 ? "—" : `${delta > 0 ? "+" : ""}${formatBaseMoney(Math.abs(delta))}`;
  const pctChange = prev > 0 ? Math.round((delta / prev) * 100) : null;

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 7,
        padding: "5px 6px",
        borderBottom: "1px solid var(--ft-border)",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {cat}
      </span>
      {pctChange !== null && (
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          fontWeight: 700,
          color: deltaColor,
          background: `color-mix(in srgb, ${deltaColor} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${deltaColor} 30%, transparent)`,
          padding: "1px 4px",
          flexShrink: 0,
        }}>
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "→"} {Math.abs(pctChange)}%
        </span>
      )}
      <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: deltaColor, flexShrink: 0, minWidth: 60, textAlign: "right" }}>
        {deltaLabel}
      </span>
    </div>
  );
}

// ─── Widget ───────────────────────────────────────────────────────────────────

export function SpendingBreakdownWidget({ isExpanded }: { isExpanded?: boolean }) {
  const [offset, setOffset] = useState(0);
  const { dateFrom, dateTo, label } = monthBounds(offset);
  const { dateFrom: prevDateFrom, dateTo: prevDateTo } = monthBounds(offset - 1);

  const { data, isLoading } = useListTransactions({ type: "expense", dateFrom, dateTo });
  const { data: prevData } = useListTransactions({ type: "expense", dateFrom: prevDateFrom, dateTo: prevDateTo });

  // ── two bugs the previous shape had, fixed in this pass ──
  // 1. baseEquivalent on an expense row is NEGATIVE (signed by
  //    enrichTransaction). Summing signed values then sorting
  //    `b - a` descending put the LEAST-negative category first —
  //    the eight SMALLEST spend categories rendered as "top eight".
  //    Rent at -£925 ranked below Spotify at -£11.99. Fix: Math.abs
  //    before summing, so accumulator holds spend magnitudes.
  // 2. `(tx.baseEquivalent ?? 0)` fabricated a zero for
  //    unconvertible expenses — same defect class as the ~90-site
  //    survey and Lock #16's fabricated-zero pattern. An expense
  //    with no FX rate silently counted as £0 rather than being
  //    excluded from that category's total, under-reporting spend
  //    without a signal. Fix: explicit `if (v == null) continue`
  //    skip so unconvertible expenses drop out of the total, and
  //    the total's implicit "convertible only" scope is correct.
  const categoryTotals = (data ?? []).reduce<Record<string, number>>((acc, tx) => {
    if (tx.baseEquivalent == null) return acc;
    const cat = tx.category || "Other";
    acc[cat] = (acc[cat] ?? 0) + Math.abs(tx.baseEquivalent);
    return acc;
  }, {});

  const prevCategoryTotals = (prevData ?? []).reduce<Record<string, number>>((acc, tx) => {
    if (tx.baseEquivalent == null) return acc;
    const cat = tx.category || "Other";
    acc[cat] = (acc[cat] ?? 0) + Math.abs(tx.baseEquivalent);
    return acc;
  }, {});

  const prevHasData = Object.keys(prevCategoryTotals).length > 0;

  // Now that accumulators are magnitudes, `b - a` descending puts
  // the largest-spend categories first, which is what "top 8" was
  // always supposed to mean.
  const sorted = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const total = sorted.reduce((s, [, v]) => s + v, 0);

  const monthNav = (
    <div style={{ padding: "10px 12px 0", display: "flex", justifyContent: "space-between", alignItems: "center", minWidth: 0 }}>
      <button
        onClick={() => setOffset(o => o - 1)}
        style={{ background: "none", border: "none", color: "var(--ft-dim)", padding: "0 2px", lineHeight: 1, display: "flex", alignItems: "center" }}
        title="Previous month"
      >
        <ChevronLeft size={12} />
      </button>

      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>

      <button
        onClick={() => setOffset(o => Math.min(o + 1, 0))}
        disabled={offset >= 0}
        style={{ background: "none", border: "none", color: offset >= 0 ? "var(--ft-border2)" : "var(--ft-dim)", padding: "0 2px", lineHeight: 1, display: "flex", alignItems: "center", flexShrink: 0 }}
        title="Next month"
      >
        <ChevronRight size={12} />
      </button>

      <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-red)", flexShrink: 0, whiteSpace: "nowrap" }}>
        −{formatBaseMoney(total)}
      </span>
    </div>
  );

  const barList = sorted.length === 0 ? (
    <div style={{ padding: "24px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center" }}>
      No expenses for {label}
    </div>
  ) : (
    <div style={{ padding: "8px 12px 12px" }}>
      {sorted.map(([cat, amount], i) => {
        const pct = total > 0 ? (amount / total) * 100 : 0;
        const color = PALETTE[i % PALETTE.length];
        const prevAmt = prevCategoryTotals[cat];
        const trend = getTrend(amount, prevAmt, prevHasData);

        return (
          <CategoryBarRow
            key={cat}
            cat={cat}
            amount={amount}
            pct={pct}
            color={color ?? "var(--ft-accent)"}
            rank={i + 1}
            prevHasData={prevHasData}
            trend={trend}
          />
        );
      })}
    </div>
  );

  const donutChart = sorted.length > 0 && (
    <div style={{ padding: "12px" }}>
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--ft-dim)",
        marginBottom: 8,
        borderLeft: "3px solid var(--ft-amber)",
        paddingLeft: 8,
      }}>
        Distribution
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <ResponsiveContainer width={120} height={120}>
          <PieChart>
            <Pie
              data={sorted.map(([cat, amt]) => ({ name: cat, value: amt }))}
              cx="50%" cy="50%"
              innerRadius={36} outerRadius={52}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {sorted.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [formatBaseMoney(value), ""]}
              contentStyle={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 10 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          {sorted.slice(0, 5).map(([cat, amt], i) => (
            <DonutLegendItem
              key={cat}
              cat={cat}
              amt={amt}
              total={total}
              color={PALETTE[i % PALETTE.length] ?? "var(--ft-accent)"}
            />
          ))}
        </div>
      </div>
    </div>
  );

  const vsLastMonth = (
    <div style={{ padding: "14px 12px" }}>
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--ft-dim)",
        marginBottom: 10,
        borderLeft: "3px solid var(--ft-cyan)",
        paddingLeft: 8,
      }}>
        vs Last Month
      </div>
      {sorted.length === 0 ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center", paddingTop: 20 }}>
          No data to compare
        </div>
      ) : (
        sorted.map(([cat, amount], i) => {
          const prev = prevCategoryTotals[cat] ?? 0;
          const color = PALETTE[i % PALETTE.length] ?? "var(--ft-accent)";
          return (
            <VsLastMonthRow
              key={cat}
              cat={cat}
              amount={amount}
              prev={prev}
              color={color}
            />
          );
        })
      )}
    </div>
  );

  return (
    <WidgetShell title="Spending Breakdown" href="/transactions" linkLabel="→ Transactions" isLoading={isLoading} accent="var(--ft-amber)">
      {!isLoading && (
        isExpanded ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, height: "100%" }}>
            <div style={{ borderRight: "1px solid var(--ft-border)" }}>
              {monthNav}
              {barList}
            </div>
            <div>
              {donutChart}
              <div style={{ borderTop: "1px solid var(--ft-border)" }}>
                {vsLastMonth}
              </div>
            </div>
          </div>
        ) : (
          <>
            {monthNav}
            {barList}
          </>
        )
      )}
    </WidgetShell>
  );
}
