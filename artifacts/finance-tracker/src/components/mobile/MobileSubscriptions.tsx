import { useListSubscriptions } from "@workspace/api-client-react";
import { MobileEmptyState, MobileScreenHeader } from "./mobile-ui";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";
import { nfmt, CURRENCY_SYMBOLS } from "./mobile-format";

// Active subscriptions.
//
// Design signature devices applied:
//   - Premium-tier 34px MONTHLY TOTAL headline. GBP-only per the Numeris
//     rule — the API doesn't supply fx-converted subscription totals, so
//     summing across currencies would be an invented number.
//   - Two-level column header: DUE / NAME / £.
//   - Dotted bottom border on every row — the next payment is a
//     not-yet-real event.
//   - Fixed-width DUE column with mono days-until countdown.
//   - Per-row frequency mark (MO / WK / QT / AN) — the "type" glyph.
//   - Foreign rows show native amount only; no plausible converted figure
//     is derived without an API-supplied rate.

const DUE_COL_W = 68;
const AMOUNT_COL_W = 108;

interface SubRow {
  id: number;
  name: string;
  amount: number;
  currency: string;
  frequency: "weekly" | "monthly" | "quarterly" | "annual";
  category: string;
  nextDue?: string;
  active: boolean;
}

const FREQ_MARK: Record<SubRow["frequency"], string> = {
  weekly: "WK",
  monthly: "MO",
  quarterly: "QT",
  annual: "AN",
};

function monthlyGbp(s: SubRow): number {
  if (s.currency !== "GBP") return 0;
  if (s.frequency === "weekly") return s.amount * 4.33;
  if (s.frequency === "quarterly") return s.amount / 3;
  if (s.frequency === "annual") return s.amount / 12;
  return s.amount;
}

function daysUntil(dueDate: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + "T12:00:00");
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
function shortDate(dueDate: string): string {
  return new Date(dueDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function MobileSubscriptions({ onBack }: { onBack?: () => void }) {
  const { data: subs = [], isLoading } = useListSubscriptions();
  const active: SubRow[] = subs.filter((s) => s.active);

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

  const monthlyTotalGbp = active.reduce((s, sub) => s + monthlyGbp(sub), 0);
  const gbpCount = active.filter((s) => s.currency === "GBP").length;
  const foreignCount = active.length - gbpCount;

  const sortedByDue = [...active].sort((a, b) => (a.nextDue ?? "").localeCompare(b.nextDue ?? ""));

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
      <MobileScreenHeader title="Subscriptions" onBack={onBack} />

      <HStack paddingX={18} height={32} justify="end" align="center">
        <MonoLabel size={11} letterSpacing="0.16em">
          {active.length} ACTIVE
        </MonoLabel>
      </HStack>

      <VStack paddingX={18} marginBottom={14}>
        <MonoLabel size={11} letterSpacing="0.16em">
          MONTHLY TOTAL · £ · GBP ONLY
        </MonoLabel>
        <HStack align="baseline" gap={4} marginTop={6}>
          <Text as="span" size={17} color="var(--ft-dim)">£</Text>
          <Text
            as="span"
            size={34}
            weight={600}
            letterSpacing="-0.035em"
            numeric
          >
            {nfmt(monthlyTotalGbp, { decimals: 2 })}
          </Text>
        </HStack>
        <HStack gap={8} marginTop={6}>
          <Text as="span" mono size={10} letterSpacing="0.1em" color="var(--ft-dim)">
            {gbpCount} GBP
          </Text>
          {foreignCount > 0 && (
            <Text as="span" mono size={10} letterSpacing="0.1em" color="var(--ft-dim)">
              · {foreignCount} FOREIGN · NOT SUMMED
            </Text>
          )}
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
        <MonoLabel as="span" size={9}>DUE</MonoLabel>
        <div style={{ width: DUE_COL_W - 30 }} />
        <MonoLabel as="span" size={9}>NAME</MonoLabel>
        <div style={{ flex: 1 }} />
        <MonoLabel as="span" size={9}>£</MonoLabel>
      </div>

      {sortedByDue.map((s) => {
        const isForeign = s.currency !== "GBP";
        const nativeSym = CURRENCY_SYMBOLS[s.currency] ?? s.currency + " ";
        const dueStr = s.nextDue ? shortDate(s.nextDue) : "—";
        const days = s.nextDue ? daysUntil(s.nextDue) : null;
        const daysStr = days === null ? "" : days < 0 ? `${-days}D LATE` : days === 0 ? "TODAY" : days === 1 ? "TOMORROW" : `IN ${days}D`;
        return (
          <div
            key={s.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minHeight: 60,
              padding: "10px 18px",
              borderBottom: "1px dotted var(--ft-border)",
            }}
          >
            <div style={{ width: DUE_COL_W, flexShrink: 0 }}>
              <Text as="div" mono size={12} weight={600}>{dueStr}</Text>
              {daysStr && (
                <Text as="div" mono size={9} letterSpacing="0.08em" color={days !== null && days < 0 ? "var(--ft-red)" : "var(--ft-dim)"}>
                  {daysStr}
                </Text>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <HStack gap={8} align="center">
                <Text as="span" size={14} truncate>{s.name}</Text>
                <span
                  style={{
                    fontSize: 11,
                    padding: "1px 5px",
                    borderRadius: 2,
                    background: "var(--ft-raised)",
                    color: "var(--ft-dim)",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    flexShrink: 0,
                  }}
                >
                  {FREQ_MARK[s.frequency]}
                </span>
              </HStack>
              {s.category && (
                <Text as="div" mono size={9} letterSpacing="0.08em" color="var(--ft-dim)">
                  {s.category.toUpperCase()}
                </Text>
              )}
            </div>

            <div style={{ width: AMOUNT_COL_W, flexShrink: 0, textAlign: "right" }}>
              <Text as="div" mono size={14} weight={600} numeric>
                {isForeign ? nativeSym : "£"}{nfmt(s.amount, { decimals: 2 })}
              </Text>
            </div>
          </div>
        );
      })}
    </div>
  );
}
