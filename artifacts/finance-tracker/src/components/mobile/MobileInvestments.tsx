import { useListInvestments, useGetInvestmentSummary } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { MobileEmptyState, MobileScreenHeader } from "./mobile-ui";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";
import { nfmt } from "./mobile-format";

// Portfolio total + per-position list.
//
// Design signature devices applied:
//   - Premium-tier 34px PORTFOLIO VALUE headline; P&L sub-line with true
//     minus and colour.
//   - Two-level column header: TICKER / NAME / P&L / £.
//   - Fixed-width TICKER column (uppercase mono, weight 700) — the
//     "ticker glyph" per-row identity from MOBILE-CONCEPT § People as
//     instruments.
//   - Rows sorted by GBP value descending — largest position reads first.
//   - When the market API supplies no P&L (rate-limited / cold), rows
//     show a plain "—" for the percent column instead of "0.00%".

const TICKER_COL_W = 74;
const PL_COL_W = 62;
const AMOUNT_COL_W = 96;

interface Position {
  id: number;
  ticker: string;
  name: string;
  shares: number;
  costPricePerShare: number;
  gbpValue: number;
  plGbp: number;
  plPercent: number;
}

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

  const positions: Position[] = investments as Position[];
  const totalValue = summary?.totalValueGbp ?? positions.reduce((s, i) => s + i.gbpValue, 0);
  const totalPl = summary?.totalPlGbp ?? positions.reduce((s, i) => s + i.plGbp, 0);
  const totalPlPct = summary?.totalPlPercent ?? 0;
  const sorted = [...positions].sort((a, b) => b.gbpValue - a.gbpValue);

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
      <MobileScreenHeader title="Investments" />

      <HStack paddingX={18} height={32} justify="end" align="center">
        <MonoLabel size={11} letterSpacing="0.16em">
          {sorted.length} {sorted.length === 1 ? "POSITION" : "POSITIONS"}
        </MonoLabel>
      </HStack>

      <VStack paddingX={18} marginBottom={14}>
        <MonoLabel size={11} letterSpacing="0.16em">
          PORTFOLIO VALUE · £
        </MonoLabel>
        <HStack align="baseline" gap={4} marginTop={6}>
          <Text as="span" size={17} color="var(--ft-dim)">£</Text>
          <Text as="span" size={34} weight={600} letterSpacing="-0.035em" numeric>
            {nfmt(totalValue, { decimals: 2 })}
          </Text>
        </HStack>
        <HStack gap={10} marginTop={6} align="baseline">
          <Text as="span" mono size={10} letterSpacing="0.1em" color="var(--ft-dim)">P&L</Text>
          <Text
            as="span"
            mono
            size={13}
            weight={600}
            color={totalPl >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
            numeric
          >
            {totalPl >= 0 ? "+" : "−"}£{nfmt(Math.abs(totalPl), { decimals: 2 })}
          </Text>
          <Text
            as="span"
            mono
            size={11}
            color={totalPl >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
            numeric
          >
            {totalPl >= 0 ? "+" : "−"}{nfmt(Math.abs(totalPlPct), { decimals: 2 })}%
          </Text>
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
        <div style={{ width: TICKER_COL_W }}>
          <MonoLabel as="span" size={9}>TICKER</MonoLabel>
        </div>
        <div style={{ flex: 1 }}>
          <MonoLabel as="span" size={9}>NAME</MonoLabel>
        </div>
        <div style={{ width: PL_COL_W, textAlign: "right" }}>
          <MonoLabel as="span" size={9}>P&L</MonoLabel>
        </div>
        <div style={{ width: AMOUNT_COL_W, textAlign: "right" }}>
          <MonoLabel as="span" size={9}>£</MonoLabel>
        </div>
      </div>

      {sorted.map((h) => {
        const hasPl = h.plGbp !== 0 || h.plPercent !== 0;
        const plColor = h.plGbp >= 0 ? "var(--ft-green)" : "var(--ft-red)";
        return (
          <div
            key={h.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minHeight: 52,
              padding: "10px 18px",
              borderBottom: "1px solid var(--ft-border)",
            }}
          >
            <div style={{ width: TICKER_COL_W, flexShrink: 0 }}>
              <Text as="div" mono size={13} weight={700} letterSpacing="0.02em">
                {h.ticker}
              </Text>
              <Text as="div" mono size={9} letterSpacing="0.08em" color="var(--ft-dim)">
                {nfmt(h.shares, { decimals: h.shares < 1 ? 4 : 0 })} sh
              </Text>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text as="div" size={13} truncate>{h.name}</Text>
            </div>
            <div style={{ width: PL_COL_W, flexShrink: 0, textAlign: "right" }}>
              {hasPl ? (
                <Text as="span" mono size={12} weight={600} color={plColor} numeric>
                  {h.plGbp >= 0 ? "+" : "−"}{nfmt(Math.abs(h.plPercent), { decimals: 2 })}%
                </Text>
              ) : (
                <Text as="span" mono size={12} color="var(--ft-dim)">—</Text>
              )}
            </div>
            <div style={{ width: AMOUNT_COL_W, flexShrink: 0, textAlign: "right" }}>
              <Text as="div" mono size={14} weight={600} numeric>
                £{nfmt(h.gbpValue, { decimals: 2 })}
              </Text>
            </div>
          </div>
        );
      })}
    </div>
  );
}
