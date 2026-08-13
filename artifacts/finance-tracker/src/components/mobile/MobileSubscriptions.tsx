import { useListSubscriptions } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { MobileEmptyState, MobileScreenHeader } from "./mobile-ui";

// Active subscriptions + monthly-normalised total. Earlier mocks
// (MOCK_SUBS list, MOCK_COST_HISTORY, MOCK_USAGE per-sub minutes/uses)
// removed — usage minutes have no backing source and history was fabricated.

function monthlyGbp(s: { amount: number; currency: string; frequency: string }): number {
  if (s.currency !== "GBP") return 0; // no FX in this pane
  if (s.frequency === "weekly") return s.amount * 4.33;
  if (s.frequency === "quarterly") return s.amount / 3;
  if (s.frequency === "annual") return s.amount / 12;
  return s.amount;
}

export function MobileSubscriptions({ onBack }: { onBack?: () => void }) {
  const { data: subs = [], isLoading } = useListSubscriptions();
  const active = subs.filter((s) => s.active);

  if (!isLoading && active.length === 0) {
    return (
      <div className="mobile-scroll" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <MobileScreenHeader title="Subscriptions" onBack={onBack} />
        <MobileEmptyState
          label="NO SUBSCRIPTIONS"
          title="Nothing tracked."
          description="Add a subscription and Numeris keeps a running monthly total and per-item due dates."
        />
      </div>
    );
  }

  const monthlyTotal = active.reduce((s, sub) => s + monthlyGbp(sub), 0);
  const sortedByDue = [...active].sort((a, b) => (a.nextDue ?? "").localeCompare(b.nextDue ?? ""));

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
      <MobileScreenHeader title="Subscriptions" onBack={onBack} />

      <div style={{ padding: "0 16px 6px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", color: "var(--ft-dim)" }}>
          MONTHLY TOTAL · £ · GBP ONLY
        </div>
        <div className="pnum" style={{ fontSize: 34, lineHeight: "34px", fontWeight: 600, letterSpacing: "-0.035em", marginTop: 6 }}>
          {formatGbp(monthlyTotal)}
        </div>
      </div>

      <div style={{ padding: "18px 16px 0" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", color: "var(--ft-dim)", marginBottom: 6 }}>
          {active.length} ACTIVE
        </div>
        {sortedByDue.map((s, i) => {
          const dueStr = s.nextDue ? new Date(s.nextDue + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";
          return (
            <div
              key={s.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                minHeight: 44,
                borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
                ...(i === sortedByDue.length - 1
                  ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)" }
                  : {}),
                fontSize: 14,
              }}
            >
              <span>
                {s.name}
                <span style={{ color: "var(--ft-dim)", marginLeft: 8, fontSize: 11, fontFamily: "var(--font-mono)" }}>
                  {dueStr}
                </span>
              </span>
              <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                {s.currency === "GBP" ? formatGbp(s.amount) : `${s.currency} ${s.amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
