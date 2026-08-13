import { useGetTransactionSummary } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { formatGbp } from "@/lib/utils";
import { MobileEmptyState, MobileScreenHeader } from "./mobile-ui";

// 6-month income / expense / net-savings table using real per-month
// TransactionSummary hooks. Earlier mocks (6-month summaries, category
// current+prev, best/worst month indices, savings-rate widgets, YTD, 50/30/20,
// tax, year-end outlook, milestones) removed — those either had no backing
// API or aggregated fake summaries.

function getLast6Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

function MonthRow({ month, isLast }: { month: string; isLast: boolean }) {
  const { data } = useGetTransactionSummary({ month });
  const label = new Date(`${month}-01`).toLocaleString("default", { month: "short", year: "2-digit" });
  const now = new Date();
  const isCurrentMonth = month === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  if (!data) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "60px 1fr 1fr 1fr",
          alignItems: "center",
          gap: 8,
          padding: "12px 14px",
          borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
          ...(isLast ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)" } : {}),
        }}
      >
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>{label}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "right" }}>—</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "right" }}>—</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "right" }}>—</div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "60px 1fr 1fr 1fr",
        alignItems: "center",
        gap: 8,
        padding: "12px 14px",
        borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
        ...(isLast ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)" } : {}),
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: isCurrentMonth ? "var(--ft-accent)" : "var(--ft-dim)", fontWeight: isCurrentMonth ? 700 : 400 }}>
        {label}
      </div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-green)", textAlign: "right" }}>
        {formatGbp(data.totalIncome)}
      </div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-red)", textAlign: "right" }}>
        {formatGbp(data.totalExpenses)}
      </div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: data.netSavings >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 700, textAlign: "right" }}>
        {formatGbp(data.netSavings)}
      </div>
    </div>
  );
}

export function MobileReports({ onBack }: { onBack?: () => void }) {
  const [, navigate] = useLocation();
  const months = getLast6Months();

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
      <MobileScreenHeader title="Reports" onBack={onBack} />

      <div style={{ padding: "0 16px 8px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", color: "var(--ft-dim)" }}>
          LAST 6 MONTHS · £
        </div>
      </div>

      <div style={{ padding: "0 16px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "60px 1fr 1fr 1fr",
            gap: 8,
            padding: "8px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.12em",
            color: "var(--ft-dim)",
          }}
        >
          <div />
          <div style={{ textAlign: "right" }}>INCOME</div>
          <div style={{ textAlign: "right" }}>SPEND</div>
          <div style={{ textAlign: "right" }}>NET</div>
        </div>
        {months.map((m, i) => (
          <MonthRow key={m} month={m} isLast={i === months.length - 1} />
        ))}
      </div>

      <div style={{ padding: "16px 16px 0", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>
        Months with no transactions show as —{" "}
        <span onClick={() => navigate("/import")} style={{ color: "var(--ft-accent)", cursor: "pointer" }}>
          Import transactions ›
        </span>
      </div>
    </div>
  );
}
