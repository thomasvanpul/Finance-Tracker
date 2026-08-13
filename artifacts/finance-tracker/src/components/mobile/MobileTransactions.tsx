import { useListTransactions } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { MobileEmptyState, MobileScreenHeader } from "./mobile-ui";

// Note: this screen is not reachable through the unified mobile footer
// (HOME/MONTH/+/MOVE/FIND). /transactions on mobile falls through to the
// desktop page, which has swipe-to-delete. Kept in the codebase for legacy
// deep-links only. Earlier mocks (MOCK_TXN_DATA with Tesco/Netflix/Spotify)
// removed.

export function MobileTransactions() {
  const { data: txns = [], isLoading } = useListTransactions({});

  if (!isLoading && txns.length === 0) {
    return (
      <div className="mobile-scroll" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <MobileScreenHeader title="Transactions" />
        <MobileEmptyState
          label="NO TRANSACTIONS"
          title="Nothing logged yet."
          description="Log your first transaction, or import a bank statement, to see it here."
        />
      </div>
    );
  }

  const sorted = [...txns].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

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
      <MobileScreenHeader title="Transactions" />

      <div style={{ padding: "0 16px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", color: "var(--ft-dim)", marginBottom: 6 }}>
          {sorted.length} {sorted.length === 1 ? "ENTRY" : "ENTRIES"}
        </div>
        {sorted.map((t, i) => {
          const dateStr = t.date ? new Date(t.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";
          const signed = t.type === "expense" ? -Math.abs(t.gbpValue) : Math.abs(t.gbpValue);
          return (
            <div
              key={t.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                minHeight: 44,
                borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
                ...(i === sorted.length - 1
                  ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)" }
                  : {}),
                fontSize: 14,
              }}
            >
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.description}
                <span style={{ color: "var(--ft-dim)", marginLeft: 8, fontSize: 11, fontFamily: "var(--font-mono)" }}>
                  {dateStr}
                </span>
              </span>
              <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: signed >= 0 ? "var(--ft-green)" : "var(--ft-text)", whiteSpace: "nowrap" }}>
                {signed >= 0 ? "+" : "−"}{formatGbp(Math.abs(signed))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
