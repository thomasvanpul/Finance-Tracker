import { useListGoals } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { MobileEmptyState, MobileScreenHeader } from "./mobile-ui";

// Per-goal progress bars. Earlier mocks (three fake goals, 3% APY interest
// projection, timeline widget only rendered in mock mode) removed.

export function MobileGoals() {
  const { data: goals = [], isLoading } = useListGoals();

  if (!isLoading && goals.length === 0) {
    return (
      <div className="mobile-scroll" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <MobileScreenHeader title="Goals" />
        <MobileEmptyState
          label="NO GOALS"
          title="No savings goals yet."
          description="Set a savings target and Numeris tracks how far you've come and how far to go."
        />
      </div>
    );
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
      <MobileScreenHeader title="Goals" />

      <div style={{ padding: "0 16px" }}>
        {goals.map((g, i) => {
          const current = g.current ?? 0;
          const target = g.target ?? 0;
          const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
          return (
            <div
              key={g.id ?? i}
              style={{
                borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
                ...(i === goals.length - 1
                  ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)" }
                  : {}),
                padding: "12px 0",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontSize: 14 }}>{g.name}</span>
                <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                  {formatGbp(current)} <span style={{ color: "var(--ft-dim)" }}>/ {formatGbp(target)}</span>
                </span>
              </div>
              <div style={{ height: 4, background: "var(--ft-border)", marginTop: 8 }}>
                <div style={{ width: `${pct}%`, height: "100%", background: "var(--ft-accent)" }} />
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", marginTop: 6 }}>
                {pct}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
