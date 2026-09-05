import { useState } from "react";
import { useListTransactions } from "@workspace/api-client-react";
import { formatBaseMoney } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";

function getMonthBounds(monthOffset: number): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + monthOffset;
  const d = new Date(year, month, 1);
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const end = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

interface CategoryRow {
  category: string;
  thisMonth: number;
  lastMonth: number;
  delta: number;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type TotalsKpiCellProps = {
  label: string;
  amount: number;
  color: string;
  savingsRate: number;
  income: number | null;
  badge?: React.ReactNode;
  incomeDeltaLabel?: React.ReactNode;
  isLast?: boolean;
};

function TotalsKpiCell({ label, amount, color, savingsRate, income, badge, incomeDeltaLabel, isLast }: TotalsKpiCellProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "10px 12px",
        borderRight: isLast ? undefined : "1px solid var(--ft-border)",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
          {label}
        </span>
        {badge}
      </div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color, letterSpacing: "-0.02em", lineHeight: 1 }}>
        {formatBaseMoney(amount)}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>
        <span className="pnum">{savingsRate.toFixed(0)}%</span> saved
        {income !== null && income > 0 && <span className="pnum"> · {formatBaseMoney(income)} income</span>}
        {incomeDeltaLabel}
      </div>
    </div>
  );
}

type CategoryTableRowProps = {
  row: CategoryRow;
};

function CategoryTableRow({ row }: CategoryTableRowProps) {
  const [hov, setHov] = useState(false);
  const decreased = row.delta < 0;
  const deltaColor = row.delta === 0 ? "var(--ft-dim)" : decreased ? "var(--ft-green)" : "var(--ft-red)";
  const trendBg = row.delta === 0 ? "rgba(255,255,255,0.05)" : decreased ? "rgba(63,185,80,0.15)" : "rgba(248,81,73,0.15)";
  const pctChange = row.lastMonth > 0 ? Math.round((row.delta / row.lastMonth) * 100) : null;

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 100px 100px 80px 60px",
        gap: 8,
        padding: "6px 4px",
        borderBottom: "1px solid var(--ft-border)",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.category}</div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", textAlign: "right" }}>{formatBaseMoney(row.lastMonth)}</div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-cyan)", textAlign: "right" }}>{formatBaseMoney(row.thisMonth)}</div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, textAlign: "right", color: deltaColor }}>
        {row.delta === 0 ? "—" : `${decreased ? "-" : "+"}${formatBaseMoney(Math.abs(row.delta))}`}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 3 }}>
        <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 2, background: trendBg, color: deltaColor, fontFamily: "var(--font-mono)" }}>
          {row.delta === 0 ? "—" : decreased ? "▼" : "▲"}
        </span>
        {pctChange !== null && (
          <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
            {Math.abs(pctChange)}%
          </span>
        )}
      </div>
    </div>
  );
}

type CategoryBarRowProps = {
  row: CategoryRow;
  maxVal: number;
};

function CategoryBarRow({ row, maxVal }: CategoryBarRowProps) {
  const [hov, setHov] = useState(false);
  const thisW = maxVal > 0 ? (row.thisMonth / maxVal) * 100 : 0;
  const lastW = maxVal > 0 ? (row.lastMonth / maxVal) * 100 : 0;
  const decreased = row.delta < 0;
  const chipColor = row.delta === 0 ? "var(--ft-dim)" : decreased ? "var(--ft-green)" : "var(--ft-red)";
  const chipBg = row.delta === 0 ? "rgba(255,255,255,0.05)" : decreased ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.12)";
  const pctChange = row.lastMonth > 0 ? Math.round((row.delta / row.lastMonth) * 100) : null;

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        marginBottom: 9,
        padding: "3px 4px",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>
          {row.category}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)" }}>{formatBaseMoney(row.thisMonth)}</span>
          <span className="pnum" style={{ fontSize: 9, padding: "1px 5px", borderRadius: 2, background: chipBg, color: chipColor, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
            {row.delta === 0 ? "=" : decreased ? `↓${formatBaseMoney(Math.abs(row.delta))}` : `↑${formatBaseMoney(Math.abs(row.delta))}`}
          </span>
          {pctChange !== null && (
            <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
              {Math.abs(pctChange)}%
            </span>
          )}
        </div>
      </div>
      {/* Last month thin bar */}
      <div style={{ height: 3, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden", marginBottom: 2 }}>
        <div style={{ height: "100%", width: `${lastW}%`, background: "var(--ft-dim)", borderRadius: 2, transition: "width 0.25s ease" }} />
      </div>
      {/* This month thicker bar */}
      <div style={{ height: 5, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${thisW}%`, background: "var(--ft-cyan)", borderRadius: 2, transition: "width 0.25s ease" }} />
      </div>
    </div>
  );
}

// ─── Widget ───────────────────────────────────────────────────────────────────

export function MonthComparisonWidget({ isExpanded }: { isExpanded?: boolean }) {
  const thisMonthBounds = getMonthBounds(0);
  const lastMonthBounds = getMonthBounds(-1);

  const { data: allTxs, isLoading } = useListTransactions({});

  const thisMonthTxs = (allTxs ?? []).filter(
    (tx) => tx.date >= thisMonthBounds.start && tx.date <= thisMonthBounds.end
  );
  const lastMonthTxs = (allTxs ?? []).filter(
    (tx) => tx.date >= lastMonthBounds.start && tx.date <= lastMonthBounds.end
  );

  // Signed baseEquivalent (fix 31 Aug): expense reduces below summed
  // signed negatives, then `sort((a, b) => b.thisMonth -
  // a.thisMonth)` DESC put the LEAST-negative (smallest spend)
  // categories first. "Top 6" was showing the 6 smallest categories.
  // Same class as spending-breakdown's bug. Also income reduces had
  // `?? 0` which fabricated zeros for unconvertible rows.
  // Fix: Math.abs on the expense reduces so they carry magnitudes
  // (sort DESC then means largest first); skip unconvertible on
  // both income and expense reduces.
  const thisIncome = thisMonthTxs
    .filter((tx) => tx.type === "income")
    .reduce((s, tx) => tx.baseEquivalent == null ? s : s + Math.abs(tx.baseEquivalent), 0);
  const lastIncome = lastMonthTxs
    .filter((tx) => tx.type === "income")
    .reduce((s, tx) => tx.baseEquivalent == null ? s : s + Math.abs(tx.baseEquivalent), 0);

  // Category expense totals — MAGNITUDES so the sort below actually
  // puts biggest spend first.
  const thisCats = thisMonthTxs
    .filter((tx) => tx.type === "expense")
    .reduce<Record<string, number>>((acc, tx) => {
      if (tx.baseEquivalent == null) return acc;
      const cat = tx.category || "Other";
      acc[cat] = (acc[cat] ?? 0) + Math.abs(tx.baseEquivalent);
      return acc;
    }, {});

  const lastCats = lastMonthTxs
    .filter((tx) => tx.type === "expense")
    .reduce<Record<string, number>>((acc, tx) => {
      if (tx.baseEquivalent == null) return acc;
      const cat = tx.category || "Other";
      acc[cat] = (acc[cat] ?? 0) + Math.abs(tx.baseEquivalent);
      return acc;
    }, {});

  const allCats = Array.from(new Set([...Object.keys(thisCats), ...Object.keys(lastCats)]));

  const rows: CategoryRow[] = allCats
    .map((cat) => ({
      category: cat,
      thisMonth: thisCats[cat] ?? 0,
      lastMonth: lastCats[cat] ?? 0,
      delta: (thisCats[cat] ?? 0) - (lastCats[cat] ?? 0),
    }))
    .sort((a, b) => b.thisMonth - a.thisMonth)
    .slice(0, 6);

  const maxVal = Math.max(...rows.map((r) => Math.max(r.thisMonth, r.lastMonth)), 1);

  const thisExpenses = Object.values(thisCats).reduce((s, v) => s + v, 0);
  const lastExpenses = Object.values(lastCats).reduce((s, v) => s + v, 0);
  const thisSavings = thisIncome - thisExpenses;
  const lastSavings = lastIncome - lastExpenses;
  const thisSavingsRate = thisIncome > 0 ? (thisSavings / thisIncome) * 100 : 0;
  const lastSavingsRate = lastIncome > 0 ? (lastSavings / lastIncome) * 100 : 0;
  const expenseDelta = thisExpenses - lastExpenses;
  const incomeDelta = thisIncome - lastIncome;

  const now = new Date();
  const thisMonthLabel = now.toLocaleString("en-GB", { month: "short" }).toUpperCase();
  const lastMonthLabel = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleString("en-GB", { month: "short" }).toUpperCase();

  const hasData = rows.length > 0 || thisIncome > 0 || lastIncome > 0;

  // Border-as-gap KPI strip for totals header
  const totalsHeader = hasData && (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid var(--ft-border)" }}>
      <TotalsKpiCell
        label={`${lastMonthLabel} SPEND`}
        amount={lastExpenses}
        color="var(--ft-muted)"
        savingsRate={lastSavingsRate}
        income={lastIncome}
      />
      <TotalsKpiCell
        label={`${thisMonthLabel} SPEND`}
        amount={thisExpenses}
        color="var(--ft-cyan)"
        savingsRate={thisSavingsRate}
        income={null}
        isLast
        badge={
          lastExpenses > 0 ? (
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              fontWeight: 700,
              color: expenseDelta <= 0 ? "var(--ft-green)" : "var(--ft-red)",
              background: `color-mix(in srgb, ${expenseDelta <= 0 ? "var(--ft-green)" : "var(--ft-red)"} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${expenseDelta <= 0 ? "var(--ft-green)" : "var(--ft-red)"} 30%, transparent)`,
              padding: "1px 4px",
              letterSpacing: "0.04em",
            }}>
              {expenseDelta <= 0 ? "▼" : "▲"} <span className="pnum">{formatBaseMoney(Math.abs(expenseDelta))}</span>
            </span>
          ) : undefined
        }
        incomeDeltaLabel={
          incomeDelta !== 0 ? (
            <span> · income {incomeDelta > 0 ? "▲" : "▼"} <span className="pnum">{formatBaseMoney(Math.abs(incomeDelta))}</span></span>
          ) : undefined
        }
      />
    </div>
  );

  return (
    <WidgetShell
      title="MoM Comparison"
      href="/transactions"
      linkLabel="→ Transactions"
      isLoading={isLoading}
      accent="var(--ft-cyan)"
    >
      {!isLoading && !hasData ? (
        <div style={{ padding: "24px 12px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>
          No transaction data available
        </div>
      ) : !isLoading && isExpanded ? (
        /* Expanded: full comparison table */
        <div>
          {totalsHeader}
          <div style={{ padding: "12px 14px" }}>
          {/* Income comparison header */}
          <div style={{ marginBottom: 14 }}>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ft-dim)",
              marginBottom: 8,
            }}>
              Income
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 100px 100px 80px 60px",
                gap: 8,
                padding: "6px 4px",
                borderBottom: "1px solid var(--ft-border2)",
                background: "color-mix(in srgb, var(--ft-accent) 3%, transparent)",
              }}
            >
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)" }}>Total Income</div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", textAlign: "right" }}>{formatBaseMoney(lastIncome)}</div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-cyan)", textAlign: "right" }}>{formatBaseMoney(thisIncome)}</div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, textAlign: "right", color: thisIncome >= lastIncome ? "var(--ft-green)" : "var(--ft-red)" }}>
                {thisIncome >= lastIncome ? "+" : ""}{formatBaseMoney(thisIncome - lastIncome)}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 2, background: thisIncome >= lastIncome ? "rgba(63,185,80,0.15)" : "rgba(248,81,73,0.15)", color: thisIncome >= lastIncome ? "var(--ft-green)" : "var(--ft-red)", fontFamily: "var(--font-mono)" }}>
                  {thisIncome >= lastIncome ? "▲" : "▼"}
                </span>
              </div>
            </div>
          </div>

          {/* Category table */}
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ft-dim)",
            marginBottom: 8,
          }}>
            Expenses by Category
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 80px 60px", gap: 8, padding: "4px 0", marginBottom: 4 }}>
            {["Category", "Last Month", "This Month", "Change", "Trend"].map((h) => (
              <div key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em", textAlign: h === "Category" ? "left" : "right" }}>
                {h}
              </div>
            ))}
          </div>
          {rows.length === 0 ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center", padding: "16px 0" }}>
              No expense data
            </div>
          ) : (
            rows.map((row) => (
              <CategoryTableRow key={row.category} row={row} />
            ))
          )}
          </div>
        </div>
      ) : !isLoading ? (
        /* Compact: top 6 category bar comparison */
        <>
          {totalsHeader}
          <div style={{ padding: "10px 12px 12px" }}>
          {/* Legend */}
          <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 3, background: "var(--ft-dim)", borderRadius: 1 }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em" }}>Last month</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 5, background: "var(--ft-cyan)", borderRadius: 1 }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em" }}>This month</span>
            </div>
          </div>
          {rows.length === 0 ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center", padding: "16px 0" }}>
              No expense data yet this month
            </div>
          ) : (
            rows.map((row) => (
              <CategoryBarRow key={row.category} row={row} maxVal={maxVal} />
            ))
          )}
          </div>
        </>
      ) : null}
    </WidgetShell>
  );
}
