import { useState } from "react";
import { useListTransactions } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

export function SpendingBreakdownWidget({ isExpanded }: { isExpanded?: boolean }) {
  const [offset, setOffset] = useState(0);
  const { dateFrom, dateTo, label } = monthBounds(offset);
  const { dateFrom: prevDateFrom, dateTo: prevDateTo } = monthBounds(offset - 1);

  const { data, isLoading } = useListTransactions({ type: "expense", dateFrom, dateTo });
  const { data: prevData } = useListTransactions({ type: "expense", dateFrom: prevDateFrom, dateTo: prevDateTo });

  const categoryTotals = (data ?? []).reduce<Record<string, number>>((acc, tx) => {
    const cat = tx.category || "Other";
    acc[cat] = (acc[cat] ?? 0) + tx.gbpValue;
    return acc;
  }, {});

  const prevCategoryTotals = (prevData ?? []).reduce<Record<string, number>>((acc, tx) => {
    const cat = tx.category || "Other";
    acc[cat] = (acc[cat] ?? 0) + tx.gbpValue;
    return acc;
  }, {});

  const prevHasData = Object.keys(prevCategoryTotals).length > 0;

  const sorted = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const total = sorted.reduce((s, [, v]) => s + v, 0);

  const monthNav = (
    <div style={{ padding: "10px 12px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <button
        onClick={() => setOffset(o => o - 1)}
        style={{ background: "none", border: "none", color: "var(--ft-dim)", padding: "0 2px", lineHeight: 1, display: "flex", alignItems: "center" }}
        title="Previous month"
      >
        <ChevronLeft size={12} />
      </button>

      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>

      <button
        onClick={() => setOffset(o => Math.min(o + 1, 0))}
        disabled={offset >= 0}
        style={{ background: "none", border: "none", color: offset >= 0 ? "var(--ft-border2)" : "var(--ft-dim)", padding: "0 2px", lineHeight: 1, display: "flex", alignItems: "center" }}
        title="Next month"
      >
        <ChevronRight size={12} />
      </button>

      <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-red)" }}>
        −{formatGbp(total)}
      </span>
    </div>
  );

  const barList = sorted.length === 0 ? (
    <div style={{ padding: "20px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center" }}>
      No expenses for {label}
    </div>
  ) : (
    <div style={{ padding: "10px 12px 12px" }}>
      {sorted.map(([cat, amount], i) => {
        const pct = total > 0 ? (amount / total) * 100 : 0;
        const color = PALETTE[i % PALETTE.length];
        const prevAmt = prevCategoryTotals[cat];
        const trend = getTrend(amount, prevAmt, prevHasData);
        const chipColor = trendColor(trend.tag);

        return (
          <div key={cat} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, alignItems: "center" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", letterSpacing: "0.04em", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {cat}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                {prevHasData && (
                  <span style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: chipColor,
                    background: `${chipColor}18`,
                    border: `1px solid ${chipColor}40`,
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
                <span style={{ color: "var(--ft-dim)" }}>{pct.toFixed(0)}%</span>
                <span className="pnum" style={{ color }}>−{formatGbp(amount)}</span>
              </span>
            </div>
            <div style={{ height: 3, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.4s ease" }} />
            </div>
          </div>
        );
      })}
    </div>
  );

  const vsLastMonth = (
    <div style={{ padding: "14px 12px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 10 }}>
        vs Last Month
      </div>
      {sorted.length === 0 ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center", paddingTop: 20 }}>
          No data to compare
        </div>
      ) : (
        sorted.map(([cat, amount], i) => {
          const prev = prevCategoryTotals[cat] ?? 0;
          const delta = amount - prev;
          const deltaColor = delta > 0 ? "var(--ft-red)" : delta < 0 ? "var(--ft-green)" : "var(--ft-dim)";
          const deltaLabel = delta === 0 ? "—" : `${delta > 0 ? "+" : ""}${formatGbp(Math.abs(delta))}`;
          const color = PALETTE[i % PALETTE.length];
          return (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, padding: "5px 0", borderBottom: "1px solid var(--ft-border)" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {cat}
              </span>
              <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: deltaColor, flexShrink: 0, minWidth: 60, textAlign: "right" }}>
                {deltaLabel}
              </span>
            </div>
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
              {vsLastMonth}
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
