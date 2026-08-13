import { useListUpcoming, useGetUpcomingSummary } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { MobileEmptyState, MobileScreenHeader } from "./mobile-ui";

// Pending upcoming items grouped by day. Earlier mocks (MOCK_UPCOMING with
// Netflix/etc., MOCK_SUMMARY totals) removed.

export function MobileUpcomingFull({ onBack }: { onBack?: () => void }) {
  const { data: items = [], isLoading } = useListUpcoming();
  const { data: summary } = useGetUpcomingSummary();

  const pending = items.filter((i) => i.status === "pending");

  if (!isLoading && items.length === 0) {
    return (
      <div className="mobile-scroll" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <MobileScreenHeader title="Upcoming" onBack={onBack} />
        <MobileEmptyState
          label="NOTHING UPCOMING"
          title="No bills or income scheduled."
          description="Add subscriptions or recurring items and they'll appear here on their due date."
        />
      </div>
    );
  }

  const sortedPending = [...pending].sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

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
      <MobileScreenHeader title="Upcoming" onBack={onBack} />

      {summary && (
        <div style={{ padding: "0 16px 6px" }}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.14em" }}>
                EXPECTED INCOME · 30D
              </div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: "var(--ft-green)" }}>
                {formatGbp(summary.expectedIncome30d ?? 0)}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.14em" }}>
                COMMITTED OUT · 30D
              </div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: "var(--ft-red)" }}>
                {formatGbp(summary.committedOutgoings30d ?? 0)}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "18px 16px 0" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", color: "var(--ft-dim)", marginBottom: 6 }}>
          {sortedPending.length} PENDING
        </div>
        {sortedPending.map((it, i) => {
          const dueStr = it.dueDate ? new Date(it.dueDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";
          const signed = it.type === "expense" ? -Math.abs(it.gbpEquivalent) : Math.abs(it.gbpEquivalent);
          return (
            <div
              key={it.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                minHeight: 44,
                borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
                ...(i === sortedPending.length - 1
                  ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)" }
                  : {}),
                fontSize: 14,
              }}
            >
              <span>
                {it.description}
                <span style={{ color: "var(--ft-dim)", marginLeft: 8, fontSize: 11, fontFamily: "var(--font-mono)" }}>
                  {dueStr}
                </span>
              </span>
              <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: signed >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                {signed >= 0 ? "+" : "−"}{formatGbp(Math.abs(signed))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
