import { useListTransactions } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { formatGbp } from "@/lib/utils";
import { MobileEmptyState, MobileScreenHeader } from "./mobile-ui";

// Category totals + income/expense split for the current month.
// Earlier mocks (weekday spend, previous-month comparison, daily-spend
// heatmap, 6-month history, top merchants) removed — none derive honestly
// from just this month's transaction list.

export function MobileAnalytics({ onBack }: { onBack?: () => void }) {
  const [, navigate] = useLocation();
  const now = new Date();
  const dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const dateTo = now.toISOString().slice(0, 10);
  const { data: txns = [], isLoading } = useListTransactions({ dateFrom, dateTo });

  if (!isLoading && txns.length === 0) {
    return (
      <div className="mobile-scroll" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <MobileScreenHeader title="Analytics" onBack={onBack} />
        <MobileEmptyState
          label="NO TRANSACTIONS"
          title="No analytics yet."
          description="Log or import transactions and Analytics fills in — spend by category, income vs expense, month-over-month."
          ctaLabel="Import transactions"
          onCta={() => navigate("/import")}
        />
      </div>
    );
  }

  const expenses = txns.filter((t) => t.type === "expense");
  const incomes = txns.filter((t) => t.type === "income");
  const totalSpend = expenses.reduce((s, t) => s + Math.abs(t.gbpValue), 0);
  const totalIncome = incomes.reduce((s, t) => s + t.gbpValue, 0);

  function byCat(list: typeof txns) {
    const map = new Map<string, number>();
    for (const t of list) {
      const k = t.category || "Uncategorised";
      map.set(k, (map.get(k) ?? 0) + Math.abs(t.gbpValue));
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amount]) => ({ cat, amount }));
  }
  const spendRows = byCat(expenses);
  const incomeRows = byCat(incomes);

  return (
    <div
      className="mobile-scroll"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        paddingBottom: "calc(74px + env(safe-area-inset-bottom, 0px) + 16px)",
      }}
    >
      <MobileScreenHeader title="Analytics" onBack={onBack} />

      <div style={{ padding: "0 16px 4px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", color: "var(--ft-dim)" }}>
          {now.toLocaleDateString("en-GB", { month: "long", year: "numeric" }).toUpperCase()} · £
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.14em" }}>
              INCOME
            </div>
            <div className="pnum" style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ft-green)" }}>
              {formatGbp(totalIncome)}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.14em" }}>
              SPEND
            </div>
            <div className="pnum" style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.02em" }}>
              {formatGbp(totalSpend)}
            </div>
          </div>
        </div>
      </div>

      <Section title="SPEND BY CATEGORY" rows={spendRows} total={totalSpend} />
      <Section title="INCOME BY CATEGORY" rows={incomeRows} total={totalIncome} />
    </div>
  );
}

function Section({ title, rows, total }: { title: string; rows: Array<{ cat: string; amount: number }>; total: number }) {
  if (!rows.length) return null;
  return (
    <div style={{ padding: "18px 16px 0" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", color: "var(--ft-dim)", marginBottom: 6 }}>
        {title}
      </div>
      {rows.map((r, i) => (
        <div
          key={r.cat}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            minHeight: 44,
            borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
            ...(i === rows.length - 1
              ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)" }
              : {}),
            fontSize: 14,
          }}
        >
          <span>
            {r.cat}
            <span style={{ marginLeft: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>
              {total > 0 ? `${Math.round((r.amount / total) * 100)}%` : ""}
            </span>
          </span>
          <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
            {formatGbp(r.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}
