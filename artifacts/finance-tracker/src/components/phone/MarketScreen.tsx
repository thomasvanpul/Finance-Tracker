// MARKETS tab screen — the phone-native view for market-first users.
//
// Shows only what touches the user's actual position: portfolio total +
// day change, held tickers, FX pairs for currencies they hold, and
// position-tied news. No generic index list. Never a fabricated zero.
//
// Data reuse: MarketPane already aggregates positions + FX and renders
// them with live quotes. This screen wraps it with a portfolio hero
// (from dashboard.portfolio — the same data HOME uses) and a news strip
// (NewsPane). No new data contracts needed.

import { useGetDashboard } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";
import { MarketPane } from "@/components/mobile/MarketPane";
import { NewsPane } from "@/components/mobile/NewsPane";
import { PhoneScreenSkeleton } from "./PhoneScreenSkeleton";
import { nfmt } from "@/components/mobile/mobile-format";
import { getBaseCurrency } from "@/lib/currency-store";
import type { DashboardSummaryPortfolio } from "@workspace/api-client-react";

function PortfolioHero({ portfolio }: { portfolio: DashboardSummaryPortfolio }) {
  const baseCcy = getBaseCurrency();
  const sym = baseCcy === "GBP" ? "£" : baseCcy === "USD" ? "$" : `${baseCcy} `;
  const dBase = portfolio.dayChangeBase;
  const dPct = portfolio.dayChangePercent;
  const col = dBase != null ? (dBase >= 0 ? "var(--ft-green)" : "var(--ft-red)") : "var(--ft-dim)";

  return (
    <VStack padding="18px 18px 0">
      <MonoLabel size={11} letterSpacing="0.16em">PORTFOLIO</MonoLabel>
      <HStack align="baseline" gap={4} marginTop={6}>
        <Text as="span" size={17} color="var(--ft-dim)">{sym}</Text>
        <Text
          as="span"
          size={34}
          weight={600}
          lineHeight="34px"
          letterSpacing="-0.035em"
          numeric
        >
          {nfmt(portfolio.totalValueBase)}
        </Text>
      </HStack>
      <Text as="div" mono size={12} mt={6} color={col} numeric>
        {dBase == null
          ? "24H · —"
          : `${nfmt(dBase, { sign: true, symbol: sym })}${dPct != null ? ` · ${nfmt(dPct, { sign: true })}%` : ""} · 24H`}
      </Text>
    </VStack>
  );
}

export function MarketScreen() {
  const [, navigate] = useLocation();
  const { data: dashboard, isLoading } = useGetDashboard();

  if (isLoading && !dashboard) {
    return <PhoneScreenSkeleton shape="header-list" />;
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
        paddingBottom: 24,
      }}
    >
      {dashboard?.portfolio != null ? (
        <PortfolioHero portfolio={dashboard.portfolio} />
      ) : (
        <VStack padding="18px 18px 0">
          <MonoLabel size={11} letterSpacing="0.16em">PORTFOLIO</MonoLabel>
          <Text as="div" mono size={34} color="var(--ft-dim)" mt={6}>—</Text>
        </VStack>
      )}

      <MarketPane onOpenInvestments={() => navigate("/investments")} />

      {/* News strip. MarketPane's last row already ends on a hairline and
          NewsPane draws its own header rule, so no separator here — the
          one that was here produced an empty ruled band on device. */}
      <div style={{ marginTop: 16 }}>
        <NewsPane />
      </div>
    </div>
  );
}
