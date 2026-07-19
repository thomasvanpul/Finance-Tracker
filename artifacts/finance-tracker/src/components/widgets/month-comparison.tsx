import { useListTransactions } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
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

  // Income comparison
  const thisIncome = thisMonthTxs
    .filter((tx) => tx.type === "income")
    .reduce((s, tx) => s + tx.gbpValue, 0);
  const lastIncome = lastMonthTxs
    .filter((tx) => tx.type === "income")
    .reduce((s, tx) => s + tx.gbpValue, 0);

  // Category expense totals
  const thisCats = thisMonthTxs
    .filter((tx) => tx.type === "expense")
    .reduce<Record<string, number>>((acc, tx) => {
      const cat = tx.category || "Other";
      acc[cat] = (acc[cat] ?? 0) + tx.gbpValue;
      return acc;
    }, {});

  const lastCats = lastMonthTxs
    .filter((tx) => tx.type === "expense")
    .reduce<Record<string, number>>((acc, tx) => {
      const cat = tx.category || "Other";
      acc[cat] = (acc[cat] ?? 0) + tx.gbpValue;
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

  const hasData = rows.length > 0 || thisIncome > 0 || lastIncome > 0;

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
        <div style={{ padding: "12px 14px" }}>
          {/* Income comparison header */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8 }}>
              Income
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 80px 60px", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--ft-border2)" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)" }}>Total Income</div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", textAlign: "right" }}>{formatGbp(lastIncome)}</div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-cyan)", textAlign: "right" }}>{formatGbp(thisIncome)}</div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, textAlign: "right", color: thisIncome >= lastIncome ? "var(--ft-green)" : "var(--ft-red)" }}>
                {thisIncome >= lastIncome ? "+" : ""}{formatGbp(thisIncome - lastIncome)}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 2, background: thisIncome >= lastIncome ? "rgba(63,185,80,0.15)" : "rgba(248,81,73,0.15)", color: thisIncome >= lastIncome ? "var(--ft-green)" : "var(--ft-red)", fontFamily: "var(--font-mono)" }}>
                  {thisIncome >= lastIncome ? "▲" : "▼"}
                </span>
              </div>
            </div>
          </div>

          {/* Category table */}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8 }}>
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
            rows.map((row) => {
              const decreased = row.delta < 0;
              const deltaColor = row.delta === 0 ? "var(--ft-dim)" : decreased ? "var(--ft-green)" : "var(--ft-red)";
              const trendBg = row.delta === 0 ? "rgba(255,255,255,0.05)" : decreased ? "rgba(63,185,80,0.15)" : "rgba(248,81,73,0.15)";
              return (
                <div key={row.category} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 80px 60px", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--ft-border)" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.category}</div>
                  <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", textAlign: "right" }}>{formatGbp(row.lastMonth)}</div>
                  <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-cyan)", textAlign: "right" }}>{formatGbp(row.thisMonth)}</div>
                  <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, textAlign: "right", color: deltaColor }}>
                    {row.delta === 0 ? "—" : `${decreased ? "-" : "+"}${formatGbp(Math.abs(row.delta))}`}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 2, background: trendBg, color: deltaColor, fontFamily: "var(--font-mono)" }}>
                      {row.delta === 0 ? "—" : decreased ? "▼" : "▲"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : !isLoading ? (
        /* Compact: top 6 category bar comparison */
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
            rows.map((row) => {
              const thisW = maxVal > 0 ? (row.thisMonth / maxVal) * 100 : 0;
              const lastW = maxVal > 0 ? (row.lastMonth / maxVal) * 100 : 0;
              const decreased = row.delta < 0;
              const chipColor = row.delta === 0 ? "var(--ft-dim)" : decreased ? "var(--ft-green)" : "var(--ft-red)";
              const chipBg = row.delta === 0 ? "rgba(255,255,255,0.05)" : decreased ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.12)";
              return (
                <div key={row.category} style={{ marginBottom: 9 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>
                      {row.category}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)" }}>{formatGbp(row.thisMonth)}</span>
                      <span className="pnum" style={{ fontSize: 9, padding: "1px 5px", borderRadius: 2, background: chipBg, color: chipColor, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                        {row.delta === 0 ? "=" : decreased ? `↓${formatGbp(Math.abs(row.delta))}` : `↑${formatGbp(Math.abs(row.delta))}`}
                      </span>
                    </div>
                  </div>
                  {/* Last month thin bar */}
                  <div style={{ height: 3, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden", marginBottom: 2 }}>
                    <div style={{ height: "100%", width: `${lastW}%`, background: "var(--ft-dim)", borderRadius: 2, transition: "width 0.4s ease" }} />
                  </div>
                  {/* This month thicker bar */}
                  <div style={{ height: 5, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${thisW}%`, background: "var(--ft-cyan)", borderRadius: 2, transition: "width 0.4s ease" }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </WidgetShell>
  );
}
