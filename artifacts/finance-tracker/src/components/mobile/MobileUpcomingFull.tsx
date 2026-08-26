import { useListUpcoming, useGetUpcomingSummary } from "@workspace/api-client-react";
import { MobileEmptyState, MobileScreenHeader } from "./mobile-ui";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";
import { nfmt, CURRENCY_SYMBOLS } from "./mobile-format";

// Upcoming — bills and expected income on their known dates.
//
// Design signature devices applied:
//   - dotted row underlines (bottom border) — every row is a not-yet-real
//     event, so the whole list carries the dotted signature.
//   - native currency first, converted second on foreign-denominated rows.
//   - premium-tier NET headline with true minus, mono, tabular figures.
//   - two-level column header (DUE / EVENT / £) with hairline rule.
//   - fixed-width DUE column so dates align down the screen.
//   - per-row identity via a small mono type mark (income/expense).

const DUE_COL_W = 68;
const AMOUNT_COL_W = 108;

interface UpcomingItem {
  id: number;
  dueDate: string;
  description: string;
  category: string;
  type: "income" | "expense";
  nativeAmount: number;
  currency: string;
  gbpEquivalent: number | null;
  status: string;
}

function daysUntil(dueDate: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + "T12:00:00");
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function shortDate(dueDate: string): string {
  return new Date(dueDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function MobileUpcomingFull({ onBack }: { onBack?: () => void }) {
  const { data: items = [], isLoading } = useListUpcoming();
  const { data: summary, isLoading: summaryLoading } = useGetUpcomingSummary();
  const pending: UpcomingItem[] = items.filter((i) => i.status === "pending");

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

  const sortedPending = [...pending].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  // See dashboard/mobile-hero refactor — never coerce a missing API field to 0
  // in a rendered value slot. Loading, unknown and real zero are three states.
  const expectedIn = summary?.expectedIncome30d ?? null;
  const committedOut = summary?.committedOutgoings30d ?? null;
  const net30 = expectedIn != null && committedOut != null ? expectedIn - committedOut : null;

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
      <MobileScreenHeader title="Upcoming" onBack={onBack} />

      <HStack paddingX={18} height={32} justify="end" align="center">
        <MonoLabel size={11} letterSpacing="0.16em">
          {sortedPending.length} {sortedPending.length === 1 ? "PENDING" : "PENDING"}
        </MonoLabel>
      </HStack>

      {/* Headline: net over 30 days */}
      <VStack paddingX={18} marginBottom={14}>
        <MonoLabel size={11} letterSpacing="0.16em">
          NET · 30 DAYS · £
        </MonoLabel>
        <HStack align="baseline" gap={4} marginTop={6}>
          <Text as="span" size={17} color="var(--ft-dim)">£</Text>
          <Text
            as="span"
            size={34}
            weight={600}
            letterSpacing="-0.035em"
            color={net30 == null ? "var(--ft-dim)" : net30 >= 0 ? "var(--ft-text)" : "var(--ft-red)"}
            numeric
          >
            {summaryLoading ? "…" : net30 == null ? "—" : `${net30 < 0 ? "−" : ""}${nfmt(Math.abs(net30), { decimals: 2 })}`}
          </Text>
        </HStack>
        <HStack gap={14} marginTop={8} align="baseline">
          <HStack gap={4} align="baseline">
            <Text as="span" mono size={10} letterSpacing="0.1em" color="var(--ft-dim)">IN</Text>
            <Text as="span" mono size={12} weight={600} color="var(--ft-green)" numeric>
              {expectedIn == null ? "—" : `+£${nfmt(expectedIn, { decimals: 2 })}`}
            </Text>
          </HStack>
          <HStack gap={4} align="baseline">
            <Text as="span" mono size={10} letterSpacing="0.1em" color="var(--ft-dim)">OUT</Text>
            <Text as="span" mono size={12} weight={600} color="var(--ft-red)" numeric>
              {committedOut == null ? "—" : `−£${nfmt(committedOut, { decimals: 2 })}`}
            </Text>
          </HStack>
        </HStack>
      </VStack>

      {/* Two-level column header: DUE / EVENT / £ */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 18px 6px",
          borderBottom: "1px solid var(--ft-border2)",
        }}
      >
        <MonoLabel as="span" size={9}>DUE</MonoLabel>
        <div style={{ width: DUE_COL_W - 30 }} />
        <MonoLabel as="span" size={9}>EVENT</MonoLabel>
        <div style={{ flex: 1 }} />
        <MonoLabel as="span" size={9}>£</MonoLabel>
      </div>

      {sortedPending.map((it) => {
        const days = daysUntil(it.dueDate);
        const isForeign = it.currency !== "GBP";
        const nativeSym = CURRENCY_SYMBOLS[it.currency] ?? it.currency + " ";
        const isIncome = it.type === "income";
        return (
          <div
            key={it.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minHeight: 60,
              padding: "10px 18px",
              // Dotted signature: every upcoming row is not-yet-real.
              borderBottom: "1px dotted var(--ft-border)",
            }}
          >
            {/* Fixed-width DUE column */}
            <div style={{ width: DUE_COL_W, flexShrink: 0 }}>
              <Text as="div" mono size={12} weight={600}>{shortDate(it.dueDate)}</Text>
              <Text as="div" mono size={9} letterSpacing="0.08em" color="var(--ft-dim)">
                {days === 0 ? "TODAY" : days === 1 ? "TOMORROW" : `IN ${days}D`}
              </Text>
            </div>

            {/* Event column — grows */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text as="div" size={14} truncate>{it.description}</Text>
              <Text as="div" mono size={9} letterSpacing="0.08em" color="var(--ft-dim)">
                {it.category.toUpperCase()}
              </Text>
            </div>

            {/* Amount column — fixed-width, right-aligned, native+converted on foreign */}
            <div style={{ width: AMOUNT_COL_W, flexShrink: 0, textAlign: "right" }}>
              {isForeign && (
                <Text as="div" mono size={10} color="var(--ft-dim)" numeric>
                  {nativeSym}{nfmt(Math.abs(it.nativeAmount), { decimals: 2 })}
                </Text>
              )}
              <Text
                as="div"
                mono
                size={14}
                weight={600}
                color={it.gbpEquivalent == null ? "var(--ft-dim)" : isIncome ? "var(--ft-green)" : "var(--ft-red)"}
                numeric
              >
                {it.gbpEquivalent == null
                  ? "—"
                  : `${isIncome ? "+" : "−"}£${nfmt(Math.abs(it.gbpEquivalent), { decimals: 2 })}`}
              </Text>
            </div>
          </div>
        );
      })}
    </div>
  );
}
