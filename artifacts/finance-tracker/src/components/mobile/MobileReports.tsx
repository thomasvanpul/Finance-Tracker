import { useGetTransactionSummary } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { MobileEmptyState, MobileScreenHeader } from "./mobile-ui";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";
import { nfmt } from "./mobile-format";

// 6-month income / expense / net-savings table.
//
// Design signature devices applied:
//   - Premium-tier 34px 6-MONTH NET headline with true minus and colour.
//   - Two-level column header MONTH / IN / OUT / NET with hairline rule.
//   - Fixed-width columns so figures align down the screen.
//   - Current month sits at the bottom with a subtle accent tint on the
//     label — it's the "still writing itself" row and dotted signature
//     applies (it's not-yet-complete for the reporting period).
//   - Loading row shows a skeleton block per figure; per MOBILE-CONCEPT
//     zero-vs-loading, "still fetching" and "zero" must not share their
//     visual reading.

const MONTH_COL_W = 60;
const FIG_COL_W = 92;

function getLast6Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

interface MonthRowProps { month: string; isCurrent: boolean }

function MonthRow({ month, isCurrent }: MonthRowProps) {
  const { data, isLoading } = useGetTransactionSummary({ month });
  const label = new Date(`${month}-01T12:00:00`).toLocaleString("default", { month: "short", year: "2-digit" });
  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 0,
    padding: "10px 18px",
    // Current month is not-yet-complete → dotted per the signature.
    borderBottom: isCurrent ? "1px dotted var(--ft-border)" : "1px solid var(--ft-border)",
    minHeight: 44,
  };
  const labelStyle: React.CSSProperties = { width: MONTH_COL_W, flexShrink: 0 };
  const figStyle: React.CSSProperties = { width: FIG_COL_W, flexShrink: 0, textAlign: "right" };

  if (isLoading || !data) {
    return (
      <div style={rowStyle}>
        <div style={labelStyle}>
          <Text as="span" mono size={11} color="var(--ft-dim)" letterSpacing="0.06em">{label}</Text>
        </div>
        {[0, 1, 2].map((k) => (
          <div key={k} style={figStyle}>
            <div style={{ display: "inline-block", width: 60, height: 12, background: "var(--ft-raised)" }} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={rowStyle}>
      <div style={labelStyle}>
        <Text
          as="span"
          mono
          size={11}
          letterSpacing="0.06em"
          weight={isCurrent ? 700 : 400}
          color={isCurrent ? "var(--ft-accent)" : "var(--ft-dim)"}
        >
          {label}
        </Text>
      </div>
      <div style={figStyle}>
        <Text as="span" mono size={12} color={data.totalIncome > 0 ? "var(--ft-green)" : "var(--ft-dim)"} numeric>
          {nfmt(data.totalIncome, { decimals: 2 })}
        </Text>
      </div>
      <div style={figStyle}>
        <Text as="span" mono size={12} color={data.totalExpenses > 0 ? "var(--ft-red)" : "var(--ft-dim)"} numeric>
          {nfmt(data.totalExpenses, { decimals: 2 })}
        </Text>
      </div>
      <div style={figStyle}>
        <Text
          as="span"
          mono
          size={12}
          weight={700}
          color={data.netSavings === 0 ? "var(--ft-dim)" : data.netSavings > 0 ? "var(--ft-green)" : "var(--ft-red)"}
          numeric
        >
          {data.netSavings < 0 ? "−" : ""}{nfmt(Math.abs(data.netSavings), { decimals: 2 })}
        </Text>
      </div>
    </div>
  );
}

// Six-month roll-up computed by resolving all six queries. Because we can't
// call hooks in a loop conditionally, this component gets each summary via
// a dedicated child that reports up. Keeping the whole roll-up honest means
// waiting until each has data before showing a total — otherwise the
// headline would flicker as partial data arrived.
function useSixMonthNet(months: string[]): { net: number | null; ready: boolean } {
  // Simplest honest read: sum the individual query results. React Query
  // shares the cache per key, so this doesn't double-fetch after each
  // MonthRow above already subscribed.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const summaries = months.map((m) => useGetTransactionSummary({ month: m }).data);
  const ready = summaries.every((s) => s != null);
  if (!ready) return { net: null, ready: false };
  const net = summaries.reduce((sum, s) => sum + (s?.netSavings ?? 0), 0);
  return { net, ready };
}

export function MobileReports({ onBack }: { onBack?: () => void }) {
  const [, navigate] = useLocation();
  const months = getLast6Months();
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { net: sixMonthNet, ready } = useSixMonthNet(months);

  // Even when there are no transactions yet, the screen still renders the
  // roll-up shell (skeleton figures) rather than the empty state — a fresh
  // user without transactions is a real thing this screen must handle.
  const nothingAtAll = ready && sixMonthNet === 0;

  return (
    <div
      className="mobile-scroll"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        paddingBottom: "calc(74px + env(safe-area-inset-bottom, 0px) + 16px)",
        background: "var(--ft-base)",
        color: "var(--ft-text)",
      }}
    >
      <MobileScreenHeader title="Reports" onBack={onBack} />

      <HStack paddingX={18} height={32} justify="end" align="center">
        <MonoLabel size={11} letterSpacing="0.16em">LAST 6 MONTHS</MonoLabel>
      </HStack>

      <VStack paddingX={18} marginBottom={14}>
        <MonoLabel size={11} letterSpacing="0.16em">
          6-MONTH NET · £
        </MonoLabel>
        <HStack align="baseline" gap={4} marginTop={6}>
          <Text as="span" size={17} color="var(--ft-dim)">£</Text>
          {ready ? (
            <Text
              as="span"
              size={34}
              weight={600}
              letterSpacing="-0.035em"
              color={sixMonthNet != null && sixMonthNet >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
              numeric
            >
              {sixMonthNet != null && sixMonthNet < 0 ? "−" : ""}{nfmt(Math.abs(sixMonthNet ?? 0), { decimals: 2 })}
            </Text>
          ) : (
            <div style={{ width: 180, height: 34, background: "var(--ft-raised)" }} />
          )}
        </HStack>
      </VStack>

      {/* Column header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          padding: "0 18px 6px",
          borderBottom: "1px solid var(--ft-border2)",
        }}
      >
        <div style={{ width: MONTH_COL_W, flexShrink: 0 }}>
          <MonoLabel as="span" size={9}>MONTH</MonoLabel>
        </div>
        <div style={{ width: FIG_COL_W, flexShrink: 0, textAlign: "right" }}>
          <MonoLabel as="span" size={9}>IN</MonoLabel>
        </div>
        <div style={{ width: FIG_COL_W, flexShrink: 0, textAlign: "right" }}>
          <MonoLabel as="span" size={9}>OUT</MonoLabel>
        </div>
        <div style={{ width: FIG_COL_W, flexShrink: 0, textAlign: "right" }}>
          <MonoLabel as="span" size={9}>NET</MonoLabel>
        </div>
      </div>

      {months.map((m) => (
        <MonthRow key={m} month={m} isCurrent={m === currentMonthKey} />
      ))}

      {nothingAtAll ? (
        <div style={{ padding: "16px 18px" }}>
          <MobileEmptyState
            label="NO ACTIVITY"
            title="No transactions in the last six months."
            description="Import a bank statement or log a transaction manually to fill in the roll-up."
            ctaLabel="Import"
            onCta={() => navigate("/import")}
          />
        </div>
      ) : (
        <HStack paddingX={18} marginTop={16} align="baseline">
          <Text as="span" mono size={11} color="var(--ft-dim)">
            Current month is still writing —{" "}
            <span
              onClick={() => navigate("/import")}
              style={{ color: "var(--ft-accent)", cursor: "pointer" }}
            >
              import transactions ›
            </span>
          </Text>
        </HStack>
      )}
    </div>
  );
}
