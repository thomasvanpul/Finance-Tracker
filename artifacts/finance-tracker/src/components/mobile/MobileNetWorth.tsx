import { useGetDashboard } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { formatGbp } from "@/lib/utils";
import { MobileEmptyState, MobileScreenHeader } from "./mobile-ui";

// Header + net worth + per-account breakdown. Earlier mocks (milestone rings,
// synthetic monthlyHistory, hardcoded account list) removed — the API's
// DashboardSummary carries netWorth, totalCash, portfolio, accountBreakdown
// and (optionally) monthlyHistory, but not milestone thresholds or
// asset-composition history. Anything not in the schema is not shown.

export function MobileNetWorth({ onBack }: { onBack?: () => void }) {
  const [, navigate] = useLocation();
  const { data, isLoading } = useGetDashboard();
  const accounts = data?.accountBreakdown ?? [];

  if (!isLoading && (data == null || accounts.length === 0)) {
    return (
      <div className="mobile-scroll" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <MobileScreenHeader title="Net Worth" onBack={onBack} />
        <MobileEmptyState
          label="NO NET WORTH"
          title="Nothing tracked yet."
          description="Connect an account to start tracking net worth over time."
          ctaLabel="Manage accounts"
          onCta={() => navigate("/settings")}
        />
      </div>
    );
  }

  const netWorth = data?.netWorth ?? 0;

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
      <MobileScreenHeader title="Net Worth" onBack={onBack} />

      <div style={{ padding: "0 16px 6px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", color: "var(--ft-dim)" }}>
          NET WORTH · £
        </div>
        <div className="pnum" style={{ fontSize: 34, lineHeight: "34px", fontWeight: 600, letterSpacing: "-0.035em", marginTop: 6 }}>
          {formatGbp(netWorth)}
        </div>
      </div>

      <div style={{ padding: "18px 16px 0" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", color: "var(--ft-dim)", marginBottom: 6 }}>
          {accounts.length} {accounts.length === 1 ? "ACCOUNT" : "ACCOUNTS"}
        </div>
        {accounts.map((a, i) => (
          <div
            key={a.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              minHeight: 44,
              borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
              ...(i === accounts.length - 1
                ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)" }
                : {}),
              fontSize: 14,
            }}
          >
            <span>{a.name}</span>
            <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
              {formatGbp(a.gbpEquivalent)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
