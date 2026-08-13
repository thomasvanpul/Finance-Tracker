import { useListDebts, useGetDebtSummary } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { formatGbp } from "@/lib/utils";
import { MobileEmptyState, MobileScreenHeader } from "./mobile-ui";

// Owed-to-me / I-owe totals + open debts list. Earlier mocks (MOCK_DEBTS,
// MOCK_SETTLED, MOCK_NET_HISTORY 7-day series) removed — settled history
// and daily net-owing trend have no backing API.

export function MobileOwing({ onBack }: { onBack?: () => void }) {
  const [, navigate] = useLocation();
  const { data: debts = [], isLoading } = useListDebts();
  const { data: summary } = useGetDebtSummary();

  const pending = debts.filter((d) => d.status === "pending");

  if (!isLoading && debts.length === 0) {
    return (
      <div className="mobile-scroll" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <MobileScreenHeader title="Owing" onBack={onBack} />
        <MobileEmptyState
          label="NOTHING OWED"
          title="Nothing tracked yet."
          description="Log a shared expense or a debt and Numeris keeps score."
          ctaLabel="Split a bill"
          onCta={() => navigate("/split")}
        />
      </div>
    );
  }

  const toMe = summary?.totalOwedToMe ?? 0;
  const byMe = summary?.totalIOwe ?? 0;
  const net = summary?.netGbp ?? toMe - byMe;

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
      <MobileScreenHeader title="Owing" onBack={onBack} />

      <div style={{ padding: "0 16px 6px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", color: "var(--ft-dim)" }}>
          NET · £
        </div>
        <div className="pnum" style={{ fontSize: 34, lineHeight: "34px", fontWeight: 600, letterSpacing: "-0.035em", marginTop: 6, color: net >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
          {net >= 0 ? "+" : "−"}{formatGbp(Math.abs(net))}
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 8 }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.14em" }}>
              OWED TO ME
            </div>
            <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: "var(--ft-green)" }}>
              {formatGbp(toMe)}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.14em" }}>
              I OWE
            </div>
            <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: "var(--ft-red)" }}>
              {formatGbp(byMe)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "18px 16px 0" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", color: "var(--ft-dim)", marginBottom: 6 }}>
          {pending.length} OPEN
        </div>
        {pending.map((d, i) => (
          <div
            key={d.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              minHeight: 44,
              borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
              ...(i === pending.length - 1
                ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)" }
                : {}),
              fontSize: 14,
            }}
          >
            <span>
              {d.personName}
              <span style={{ color: "var(--ft-dim)", marginLeft: 8, fontSize: 11 }}>{d.description}</span>
            </span>
            <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: d.direction === "they_owe_me" ? "var(--ft-green)" : "var(--ft-red)" }}>
              {d.direction === "they_owe_me" ? "+" : "−"}{formatGbp(Math.abs(d.gbpEquivalent))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
