import { useListInvestments, useGetInvestmentSummary } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { formatGbp } from "@/lib/utils";
import { MobileEmptyState, MobileScreenHeader } from "./mobile-ui";

// Portfolio total + per-position list. Earlier mocks (MOCK_HOLDINGS,
// MOCK_SPARKLINES, MOCK_DIVIDEND_YIELD, MOCK_SECTORS) removed — the API
// doesn't carry per-position sparklines, dividend yields, or sector tags
// for holdings, so those widgets went with them.

export function MobileInvestments() {
  const [, navigate] = useLocation();
  const { data: investments = [], isLoading } = useListInvestments();
  const { data: summary } = useGetInvestmentSummary();

  if (!isLoading && investments.length === 0) {
    return (
      <div className="mobile-scroll" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <MobileScreenHeader title="Investments" />
        <MobileEmptyState
          label="NO INVESTMENTS"
          title="No holdings yet."
          description="Add a position to see current value, unrealised P&L and per-ticker performance."
          ctaLabel="Open Portfolio"
          onCta={() => navigate("/portfolio")}
        />
      </div>
    );
  }

  const totalValue = summary?.totalValueGbp ?? investments.reduce((s, i) => s + i.gbpValue, 0);
  const totalPl = summary?.totalPlGbp ?? investments.reduce((s, i) => s + i.plGbp, 0);
  const totalPlPct = summary?.totalPlPercent ?? 0;

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
      <MobileScreenHeader title="Investments" />

      <div style={{ padding: "0 16px 6px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", color: "var(--ft-dim)" }}>
          PORTFOLIO VALUE · £
        </div>
        <div className="pnum" style={{ fontSize: 34, lineHeight: "34px", fontWeight: 600, letterSpacing: "-0.035em", marginTop: 6 }}>
          {formatGbp(totalValue)}
        </div>
        <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 6, color: totalPl >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
          {totalPl >= 0 ? "+" : "−"}{formatGbp(Math.abs(totalPl))} · {totalPl >= 0 ? "+" : "−"}{Math.abs(totalPlPct).toFixed(2)}%
        </div>
      </div>

      <div style={{ padding: "18px 16px 0" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", color: "var(--ft-dim)", marginBottom: 6 }}>
          {investments.length} {investments.length === 1 ? "POSITION" : "POSITIONS"}
        </div>
        {[...investments].sort((a, b) => b.gbpValue - a.gbpValue).map((h, i) => (
          <div
            key={h.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              minHeight: 44,
              borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
              ...(i === investments.length - 1
                ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)" }
                : {}),
              fontSize: 14,
            }}
          >
            <span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{h.ticker}</span>
              <span style={{ color: "var(--ft-dim)", marginLeft: 8, fontSize: 11 }}>{h.name}</span>
            </span>
            <span style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: h.plGbp >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                {h.plGbp >= 0 ? "+" : "−"}{Math.abs(h.plPercent).toFixed(2)}%
              </span>
              <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                {formatGbp(h.gbpValue)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
