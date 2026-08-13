import { useListBudgets, useListTransactions } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { MobileEmptyState, MobileScreenHeader } from "./mobile-ui";

// Per-category budget vs actual for the current month. Earlier mocks
// (weekly-spend histogram, mock category set) removed.

function firstOfMonth() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export function MobileBudget() {
  const { data: budgets = [], isLoading } = useListBudgets();
  const { data: txns = [] } = useListTransactions({ dateFrom: firstOfMonth(), dateTo: today() });

  if (!isLoading && budgets.length === 0) {
    return (
      <div className="mobile-scroll" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <MobileScreenHeader title="Budget" />
        <MobileEmptyState
          label="NO BUDGETS"
          title="Nothing to track yet."
          description="Budgets are set on the desktop for now. Once a category limit exists, the mobile screen shows how each is doing."
        />
      </div>
    );
  }

  const spendByCat = new Map<string, number>();
  for (const t of txns) {
    if (t.type !== "expense") continue;
    const k = (t.category || "Uncategorised").toLowerCase();
    spendByCat.set(k, (spendByCat.get(k) ?? 0) + Math.abs(t.gbpValue));
  }

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
      <MobileScreenHeader title="Budget" />

      <div style={{ padding: "0 16px" }}>
        {budgets.map((b, i) => {
          const spent = spendByCat.get((b.category || "").toLowerCase()) ?? 0;
          const limit = b.monthlyLimit ?? 0;
          const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
          const over = spent > limit && limit > 0;
          return (
            <div
              key={b.id ?? i}
              style={{
                borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
                ...(i === budgets.length - 1
                  ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)" }
                  : {}),
                padding: "10px 0",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontSize: 14 }}>{b.category}</span>
                <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: over ? "var(--ft-red)" : "var(--ft-text)" }}>
                  {formatGbp(spent)} <span style={{ color: "var(--ft-dim)" }}>/ {formatGbp(limit)}</span>
                </span>
              </div>
              <div style={{ height: 4, background: "var(--ft-border)", marginTop: 8 }}>
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: over ? "var(--ft-red)" : pct > 80 ? "var(--ft-amber)" : "var(--ft-accent)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
