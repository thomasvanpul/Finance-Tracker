import { useGetDashboard } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { MobileEmptyState, MobileScreenHeader } from "./mobile-ui";
import { nfmt } from "./mobile-format";
import { computeHoldings } from "./MobileHome";
import { BlockField } from "@/components/primitives/block-field";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";

// Full page for the HOLDINGS section that home links to. Same design
// language as MobileHome:
//   - 09:41 top bar (with account count on the right)
//   - mono-uppercase headline label + premium-tier (34px) net worth
//   - month-to-date delta line, green/red per sign
//   - the same block field as home's BLOCKS view — categorised by
//     account.type + portfolio positions, area = value.
//   - per-type sections with the accounts contributing to each bucket
//   - CLAIMED strip for liabilities (outlined, no depth — a claim is
//     not material you hold)
// Depth is decorative; value is length/area only.

type Bucket = "cash" | "investment" | "pension" | "property" | "other";

const BUCKET_LABEL: Record<Bucket, string> = {
  cash: "CASH",
  investment: "INVESTED",
  pension: "PENSION",
  property: "PROPERTY",
  other: "OTHER",
};

export function MobileNetWorth({ onBack }: { onBack?: () => void }) {
  const [, navigate] = useLocation();
  const { data, isLoading } = useGetDashboard();
  const accounts = data?.accountBreakdown ?? [];

  if (!isLoading && (data == null || accounts.length === 0)) {
    return (
      <div className="mobile-scroll" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <MobileScreenHeader title="Holdings" onBack={onBack} />
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

  const now = new Date();
  const monthShortMixed = now.toLocaleDateString("en-GB", { month: "short" });

  const netWorth = data?.netWorth ?? 0;
  const mtdDelta = data?.thisMonth.netSavings ?? 0;
  const priorNw = netWorth - mtdDelta;
  const mtdPct = priorNw > 0 ? (mtdDelta / priorNw) * 100 : 0;

  const holdings = computeHoldings(data);
  const owedByMe = data?.owing.totalIOwe ?? 0;
  const pendingCount = data?.owing.pendingCount ?? 0;

  // Group accounts by type for the per-type sections. Portfolio positions
  // are surfaced only through the block field's `invested` bucket — they
  // don't have per-position rows here because that's Investments' job.
  const byType: Record<Bucket, typeof accounts> = {
    cash: [], investment: [], pension: [], property: [], other: [],
  };
  for (const a of accounts) {
    byType[a.type as Bucket]?.push(a);
  }
  // Order sections by bucket size (largest first)
  const bucketOrder: Bucket[] = (["cash", "investment", "pension", "property", "other"] as Bucket[])
    .sort((a, b) => holdings[b] - holdings[a]);

  return (
    <div
      className="mobile-scroll"
      style={{
        width: "100%",
        height: "100%",
        background: "var(--ft-base)",
        color: "var(--ft-text)",
        fontFamily: "var(--font-sans)",
        WebkitFontSmoothing: "antialiased",
        overflowY: "auto",
        overflowX: "hidden",
        paddingBottom: "calc(60px + env(safe-area-inset-bottom, 0px) + 16px)",
      }}
    >
      <MobileScreenHeader title="Holdings" onBack={onBack} />

      {/* Top bar (below the screen header so the mobile chrome sits together) */}
      <HStack justify="end" align="center" height={32} paddingX={18}>
        <Text as="span" mono size={11} color="var(--ft-dim)">
          {accounts.length} {accounts.length === 1 ? "ACCOUNT" : "ACCOUNTS"}
        </Text>
      </HStack>

      {/* Net worth headline */}
      <VStack padding="4px 18px 18px">
        <MonoLabel size={11} letterSpacing="0.16em">NET WORTH</MonoLabel>
        <HStack align="baseline" gap={4} marginTop={6}>
          <Text as="span" size={17} color="var(--ft-dim)">£</Text>
          <Text
            as="span"
            size={34}
            weight={600}
            lineHeight="34px"
            letterSpacing="-0.035em"
            numeric
          >
            {nfmt(netWorth)}
          </Text>
        </HStack>
        <Text
          as="div"
          mono
          size={12}
          mt={6}
          color={mtdDelta >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
          numeric
        >
          {nfmt(mtdDelta, { sign: true, symbol: "£" })} · {nfmt(mtdPct, { sign: true })}% since 1 {monthShortMixed}
        </Text>
      </VStack>

      {/* Block field — same visual language as home's BLOCKS view */}
      <div style={{ padding: "0 18px" }}>
        <BlockField holdings={holdings} />
      </div>

      {/* Liabilities strip (outlined, no depth) */}
      {owedByMe > 0 && (
        <HStack align="start" gap={12} padding="18px 18px 0">
          {/* Outlined glyph — a claim is not material you hold, per
              MOBILE-CONCEPT.md §"Liabilities are outlined with no depth".
              One-off surface treatment (border-only marker) stays inline;
              primitives own layout and typography, not decorative squares. */}
          <div
            style={{
              width: 14,
              height: 14,
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: "var(--ft-red)",
              boxSizing: "border-box",
              flex: "none",
              marginTop: 2,
            }}
          />
          <Text
            as="div"
            mono
            size={11}
            lineHeight="16px"
            color="var(--ft-red)"
            numeric
          >
            CLAIMED {nfmt(-owedByMe, { symbol: "£" })} · {pendingCount} {pendingCount === 1 ? "DEBT" : "DEBTS"}
          </Text>
        </HStack>
      )}

      {/* Per-type sections */}
      {bucketOrder.map((bucket) => {
        const value = holdings[bucket];
        if (value <= 0 && byType[bucket].length === 0) return null;
        return (
          <TypeSection
            key={bucket}
            label={BUCKET_LABEL[bucket]}
            total={value}
            netWorth={netWorth}
            rows={byType[bucket]}
            note={
              bucket === "investment" && (data?.portfolio.totalValueGbp ?? 0) > 0
                ? `Includes ${nfmt(data?.portfolio.totalValueGbp ?? 0, { symbol: "£" })} in portfolio positions`
                : undefined
            }
          />
        );
      })}
    </div>
  );
}


// ── Per-type section ────────────────────────────────────────────────────────
function TypeSection({
  label,
  total,
  netWorth,
  rows,
  note,
}: {
  label: string;
  total: number;
  netWorth: number;
  rows: Array<{ id: number; name: string; balance: number; gbpEquivalent: number | null; currency: string }>;
  note?: string;
}) {
  const pct = netWorth > 0 ? Math.round((total / netWorth) * 100) : 0;
  // Border-top on the section is a one-off surface treatment (a divider
  // between sections in the vertical column). Kept inline per the
  // primitives-family rule — Stack owns layout, PanelBox owns surface,
  // and there is no "divider" primitive.
  return (
    <div
      style={{
        marginTop: 22,
        padding: "14px 18px 0",
        borderTopWidth: 1,
        borderTopStyle: "solid",
        borderTopColor: "var(--ft-border)",
      }}
    >
      <HStack align="baseline" justify="between" gap={10}>
        <MonoLabel as="span" size={11} letterSpacing="0.16em">
          {label} · {pct}%
        </MonoLabel>
        <Text as="span" mono size={13} weight={600} numeric>
          £{nfmt(total)}
        </Text>
      </HStack>

      {note && (
        <Text as="div" mono size={11} color="var(--ft-dim)" mt={6}>
          {note}
        </Text>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {rows.map((a, i) => (
            // Row uses inline styles for the borders + minHeight (surface
            // + layout mixed); HStack alone can't express a rule between
            // siblings, and adding that prop would push surface concerns
            // into the layout primitive. Inline stays.
            <div
              key={a.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                minHeight: 44,
                borderTopWidth: 1,
                borderTopStyle: "solid",
                borderTopColor: "var(--ft-border)",
                ...(i === rows.length - 1
                  ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)" }
                  : {}),
                fontSize: 14,
              }}
            >
              <Text as="span" size={14}>{a.name}</Text>
              <Text as="span" mono size={13} color={a.gbpEquivalent == null ? "var(--ft-dim)" : undefined} numeric>
                {a.gbpEquivalent == null
                  ? (a.currency === "GBP" ? "—" : `${a.currency} ${nfmt(a.balance)}`)
                  : `£${nfmt(a.gbpEquivalent)}`}
              </Text>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
