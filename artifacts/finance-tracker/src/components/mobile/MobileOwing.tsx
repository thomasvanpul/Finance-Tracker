import { useListDebts, useGetDebtSummary } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { MobileEmptyState, MobileScreenHeader } from "./mobile-ui";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";
import { nfmt, CURRENCY_SYMBOLS } from "./mobile-format";

// Owing — bills split with other people.
//
// Design signature devices applied:
//   - "People as instruments" (MOBILE-CONCEPT § Parked spines): each
//     counterparty gets a 32×32 initial glyph — a ticker-shaped mark
//     (JM, PT, AC…) that gives the row its identity in the same way
//     an account glyph does elsewhere.
//   - Premium-tier NET headline (34px) with true minus and colour;
//     OWED TO ME / I OWE sub-line named in the app's mono vocabulary.
//   - Two-level column header (WHO / EVENT / £) with hairline rule.
//   - SOLID row dividers — a debt IS real (dotted would misclassify).
//   - Native currency first, converted second for foreign debts.
//   - Age tag (mono, e.g. "51D") on each row so old debts read as old.

const AMOUNT_COL_W = 108;

interface DebtRow {
  id: number;
  personName: string;
  description: string;
  date: string;
  nativeAmount: number;
  currency: string;
  direction: "they_owe_me" | "i_owe_them";
  status: string;
  gbpEquivalent: number | null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function daysAgo(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T12:00:00");
  return Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export function MobileOwing({ onBack }: { onBack?: () => void }) {
  const [, navigate] = useLocation();
  const { data: debts = [], isLoading } = useListDebts();
  const { data: summary, isLoading: summaryLoading } = useGetDebtSummary();

  const pending: DebtRow[] = debts.filter((d) => d.status === "pending");

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

  // Distinguish loading, unknown and real zero. A `?? 0` on the summary
  // fields would render authoritative "£0.00" tiles for OWED TO ME / I OWE
  // during load. Real zeros still render 0; nulls render —.
  const toMe = summary?.totalOwedToMe ?? null;
  const byMe = summary?.totalIOwe ?? null;
  const net = summary?.netGbp ?? (toMe != null && byMe != null ? toMe - byMe : null);

  const sorted = [...pending].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div
      className="mobile-scroll"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        paddingBottom: "calc(var(--ft-tab-bar-h) + env(safe-area-inset-bottom, 0px) + 16px)",
        background: "var(--ft-base)",
        color: "var(--ft-text)",
      }}
    >
      <MobileScreenHeader title="Owing" onBack={onBack} />

      <HStack paddingX={18} height={32} justify="end" align="center">
        <MonoLabel size={11} letterSpacing="0.16em">
          {sorted.length} OPEN
        </MonoLabel>
      </HStack>

      <VStack paddingX={18} marginBottom={14}>
        <MonoLabel size={11} letterSpacing="0.16em">
          NET · £
        </MonoLabel>
        <HStack align="baseline" gap={4} marginTop={6}>
          <Text as="span" size={17} color="var(--ft-dim)">£</Text>
          <Text
            as="span"
            size={34}
            weight={600}
            letterSpacing="-0.035em"
            color={net == null ? "var(--ft-dim)" : net >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
            numeric
          >
            {summaryLoading ? "…" : net == null ? "—" : `${net < 0 ? "−" : "+"}${nfmt(Math.abs(net), { decimals: 2 })}`}
          </Text>
        </HStack>
        <HStack gap={14} marginTop={8} align="baseline">
          <HStack gap={4} align="baseline">
            <Text as="span" mono size={10} letterSpacing="0.1em" color="var(--ft-dim)">OWED TO ME</Text>
            <Text as="span" mono size={12} weight={600} color="var(--ft-green)" numeric>
              {toMe == null ? "—" : `+£${nfmt(toMe, { decimals: 2 })}`}
            </Text>
          </HStack>
          <HStack gap={4} align="baseline">
            <Text as="span" mono size={10} letterSpacing="0.1em" color="var(--ft-dim)">I OWE</Text>
            <Text as="span" mono size={12} weight={600} color="var(--ft-red)" numeric>
              {byMe == null ? "—" : `−£${nfmt(byMe, { decimals: 2 })}`}
            </Text>
          </HStack>
        </HStack>
      </VStack>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 18px 6px",
          borderBottom: "1px solid var(--ft-border2)",
        }}
      >
        <MonoLabel as="span" size={9}>WHO</MonoLabel>
        <div style={{ width: 40 }} />
        <MonoLabel as="span" size={9}>EVENT</MonoLabel>
        <div style={{ flex: 1 }} />
        <MonoLabel as="span" size={9}>£</MonoLabel>
      </div>

      {sorted.map((d) => {
        const isForeign = d.currency !== "GBP";
        const nativeSym = CURRENCY_SYMBOLS[d.currency] ?? d.currency + " ";
        const owedToMe = d.direction === "they_owe_me";
        const age = daysAgo(d.date);
        return (
          <div
            key={d.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              minHeight: 60,
              padding: "10px 18px",
              borderBottom: "1px solid var(--ft-border)",
            }}
          >
            {/* Counterparty initial glyph — ticker-shaped */}
            <div
              style={{
                width: 32,
                height: 32,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--ft-raised)",
                border: "1px solid var(--ft-border2)",
                color: owedToMe ? "var(--ft-green)" : "var(--ft-red)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.04em",
              }}
            >
              {initials(d.personName)}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <Text as="div" size={14} weight={600} truncate>{d.personName}</Text>
              <HStack gap={6} align="baseline">
                <Text as="span" size={11} color="var(--ft-dim)" truncate>{d.description}</Text>
                <Text as="span" mono size={9} letterSpacing="0.08em" color="var(--ft-dim)" nowrap>
                  · {age}D AGO
                </Text>
              </HStack>
            </div>

            <div style={{ width: AMOUNT_COL_W, flexShrink: 0, textAlign: "right" }}>
              {isForeign && (
                <Text as="div" mono size={10} color="var(--ft-dim)" numeric>
                  {nativeSym}{nfmt(d.nativeAmount, { decimals: 2 })}
                </Text>
              )}
              <Text
                as="div"
                mono
                size={14}
                weight={600}
                color={d.gbpEquivalent == null ? "var(--ft-dim)" : owedToMe ? "var(--ft-green)" : "var(--ft-red)"}
                numeric
              >
                {d.gbpEquivalent == null
                  ? "—"
                  : `${owedToMe ? "+" : "−"}£${nfmt(Math.abs(d.gbpEquivalent), { decimals: 2 })}`}
              </Text>
            </div>
          </div>
        );
      })}
    </div>
  );
}
