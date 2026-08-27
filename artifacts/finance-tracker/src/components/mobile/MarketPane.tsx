import { useMemo } from "react";
import { useLocation } from "wouter";
import {
  useListInvestments,
  useListAccounts,
  useGetMarketQuotes,
  getGetMarketQuotesQueryKey,
  type StockQuote,
} from "@workspace/api-client-react";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";
import { nfmt, CURRENCY_SYMBOLS } from "./mobile-format";
import { formatMoney } from "@/lib/utils";
import { getBaseCurrency } from "@/lib/currency-store";

// Mobile home MARKETS pane. Scope, per the F3 brief:
//   - Only instruments that touch the user's actual position — the
//     tickers they hold, and the FX pairs their currencies imply. Never
//     a generic index list.
//   - Each row states its relevance the way the approved design does:
//     "GBP/MYR −1.3% next to your RM 4,120".
//   - If a quote is unavailable, "—" per G10. Never a fabricated zero.
//   - Live-updating values must not animate. Absolute.
//
// News is out of scope for this run.

// StockQuote (regenerated 2026-08-16 with changePercent + previousClose
// added to the OpenAPI spec) now carries the runtime fields the server
// has always returned. Local widening removed.
type QuoteExt = StockQuote;

// GBP-based FX pairs mirror the api-server's FX_PAIRS map in
// lib/market.ts. Kept as a client-side constant so we can turn a user's
// currency set into Yahoo tickers to query useGetMarketQuotes with.
// If the server ever normalises fx-pair symbols on its side, this comes
// out and the query passes currencies directly.
const FX_PAIR_TICKERS: Record<string, string> = {
  USD: "GBPUSD=X",
  EUR: "GBPEUR=X",
  MYR: "GBPMYR=X",
  CNY: "GBPCNY=X",
  JPY: "GBPJPY=X",
  AUD: "GBPAUD=X",
  CAD: "GBPCAD=X",
  SGD: "GBPSGD=X",
  HKD: "GBPHKD=X",
  THB: "GBPTHB=X",
  INR: "GBPINR=X",
};

function pctColor(chg: number | null | undefined): string {
  if (chg == null) return "var(--ft-dim)";
  return chg >= 0 ? "var(--ft-green)" : "var(--ft-red)";
}
function pctLabel(chg: number | null | undefined): string {
  if (chg == null) return "—";
  return `${chg >= 0 ? "+" : "−"}${Math.abs(chg).toFixed(2)}%`;
}

interface MarketPaneProps {
  onOpenInvestments: () => void;
}

export function MarketPane({ onOpenInvestments }: MarketPaneProps) {
  const [, navigate] = useLocation();
  const { data: investments = [] } = useListInvestments();
  const { data: accounts = [] } = useListAccounts();

  // Held tickers: only positions the user owns. If they hold nothing,
  // this section shows only FX (or nothing at all).
  const heldPositions = useMemo(() => {
    // Aggregate by ticker so a user with two lots of AAPL gets one row.
    const map = new Map<string, { ticker: string; shares: number }>();
    for (const inv of investments) {
      const prev = map.get(inv.ticker);
      map.set(inv.ticker, {
        ticker: inv.ticker,
        shares: (prev?.shares ?? 0) + inv.shares,
      });
    }
    return [...map.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [investments]);

  // Foreign currencies the user actually holds. GBP is base; skip it.
  // Aggregate native balance per currency so we can render "your RM N".
  const heldForeignCurrencies = useMemo(() => {
    const totals = new Map<string, number>();
    for (const a of accounts) {
      if (a.currency === "GBP") continue;
      totals.set(a.currency, (totals.get(a.currency) ?? 0) + a.balance);
    }
    // Only currencies we have a Yahoo pair for.
    return [...totals.entries()]
      .filter(([ccy]) => FX_PAIR_TICKERS[ccy] != null)
      .map(([ccy, nativeSum]) => ({ ccy, nativeSum, pair: FX_PAIR_TICKERS[ccy] }))
      .sort((a, b) => a.ccy.localeCompare(b.ccy));
  }, [accounts]);

  // Combined ticker query: positions + FX pairs. useGetMarketQuotes hits
  // Yahoo through the api-server, cached 5 min server-side. Refetch every
  // 30 s so the pane earns its "this changes without you doing anything"
  // slot but doesn't hammer the upstream.
  const allTickers = useMemo(
    () => [
      ...heldPositions.map((p) => p.ticker),
      ...heldForeignCurrencies.map((f) => f.pair),
    ],
    [heldPositions, heldForeignCurrencies],
  );

  const tickerParam = { tickers: allTickers.join(",") };
  const { data: quotes = [] } = useGetMarketQuotes(
    tickerParam,
    {
      query: {
        queryKey: getGetMarketQuotesQueryKey(tickerParam),
        enabled: allTickers.length > 0,
        refetchInterval: 30_000,
      },
    },
  );

  const quoteMap = useMemo(() => {
    const m = new Map<string, QuoteExt>();
    for (const q of quotes as QuoteExt[]) m.set(q.ticker, q);
    return m;
  }, [quotes]);

  // Nothing to show and no holdings → don't render the pane at all.
  // A first-run user with no accounts and no positions doesn't need a
  // MARKETS section that would just show "—" everywhere.
  if (heldPositions.length === 0 && heldForeignCurrencies.length === 0) {
    return null;
  }

  return (
    <>
      {/* Header + link to the full markets tab */}
      <div
        style={{
          marginTop: 24,
          padding: "16px 18px 0",
          borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
        }}
      >
        <HStack align="baseline" justify="between">
          <MonoLabel as="span" size={11} letterSpacing="0.16em">
            MARKETS · TOUCHING YOU
          </MonoLabel>
          <a
            onClick={(e) => { e.preventDefault(); onOpenInvestments(); }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 44,
              margin: "-15px 0",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ft-dim)",
              textDecoration: "none",
              cursor: "pointer",
            }}
          >
            INVESTMENTS ›
          </a>
        </HStack>
      </div>

      <VStack paddingX={18} marginTop={6}>
        {/* Positions: one row per held ticker */}
        {heldPositions.map((p, i) => {
          const q = quoteMap.get(p.ticker);
          const isLast =
            i === heldPositions.length - 1 && heldForeignCurrencies.length === 0;
          return (
            <PositionRow
              key={`pos-${p.ticker}`}
              ticker={p.ticker}
              shares={p.shares}
              quote={q}
              isFirst={i === 0}
              isLast={isLast}
              onClick={() => navigate("/investments")}
            />
          );
        })}
        {/* FX pairs: one row per held foreign currency */}
        {heldForeignCurrencies.map((f, i) => {
          const q = quoteMap.get(f.pair);
          const isFirst = heldPositions.length === 0 && i === 0;
          const isLast = i === heldForeignCurrencies.length - 1;
          return (
            <FxRow
              key={`fx-${f.ccy}`}
              ccy={f.ccy}
              nativeSum={f.nativeSum}
              quote={q}
              isFirst={isFirst}
              isLast={isLast}
            />
          );
        })}
      </VStack>
    </>
  );
}

// ── Position row ─────────────────────────────────────────────────────────────
// TICKER · price + native ccy · change% · "your N shares" relevance line.

interface PositionRowProps {
  ticker: string;
  shares: number;
  quote?: QuoteExt;
  isFirst: boolean;
  isLast: boolean;
  onClick: () => void;
}

function PositionRow({ ticker, shares, quote, isFirst, isLast, onClick }: PositionRowProps) {
  const chg = quote?.changePercent ?? null;
  const price = typeof quote?.price === "number" && Number.isFinite(quote.price) && quote.price > 0 ? quote.price : null;
  const sym = quote?.currency && CURRENCY_SYMBOLS[quote.currency]
    ? CURRENCY_SYMBOLS[quote.currency]
    : quote?.currency
      ? `${quote.currency} `
      : "";
  return (
    <div
      onClick={onClick}
      style={{
        cursor: "pointer",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        rowGap: 2,
        columnGap: 12,
        alignItems: "baseline",
        minHeight: 52,
        padding: "10px 0",
        borderTopWidth: isFirst ? 0 : 1,
        borderTopStyle: "solid",
        borderTopColor: "var(--ft-border)",
        borderBottomWidth: isLast ? 1 : 0,
        borderBottomStyle: "solid",
        borderBottomColor: "var(--ft-border)",
      }}
    >
      {/* Row 1 — TICKER · price (native) · change% */}
      <Text as="span" mono size={13} weight={700} color="var(--ft-blue)" letterSpacing="0.02em">
        {ticker}
      </Text>
      <Text as="span" mono size={13} numeric>
        {price != null ? `${sym}${nfmt(price)}` : "—"}
      </Text>
      <Text as="span" mono size={13} weight={600} color={pctColor(chg)} numeric>
        {pctLabel(chg)}
      </Text>
      {/* Row 2 — relevance line spans all three columns */}
      <div style={{ gridColumn: "1 / -1" }}>
        <Text as="span" mono size={10} color="var(--ft-dim)" numeric>
          your {nfmt(shares, { decimals: shares < 1 ? 4 : 0 })} share{shares === 1 ? "" : "s"}
        </Text>
      </div>
    </div>
  );
}

// ── FX row ──────────────────────────────────────────────────────────────────
// GBP/XXX · rate · change% · "your XXX N ≈ £abc" relevance line.

interface FxRowProps {
  ccy: string;
  nativeSum: number;
  quote?: QuoteExt;
  isFirst: boolean;
  isLast: boolean;
}

function FxRow({ ccy, nativeSum, quote, isFirst, isLast }: FxRowProps) {
  const chg = quote?.changePercent ?? null;
  const rate = typeof quote?.price === "number" && Number.isFinite(quote.price) && quote.price > 0 ? quote.price : null;
  const baseEquivalent = rate != null && rate > 0 ? nativeSum / rate : null;
  const sym = CURRENCY_SYMBOLS[ccy] ?? `${ccy} `;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        rowGap: 2,
        columnGap: 12,
        alignItems: "baseline",
        minHeight: 52,
        padding: "10px 0",
        borderTopWidth: isFirst ? 0 : 1,
        borderTopStyle: "solid",
        borderTopColor: "var(--ft-border)",
        borderBottomWidth: isLast ? 1 : 0,
        borderBottomStyle: "solid",
        borderBottomColor: "var(--ft-border)",
      }}
    >
      {/* Row 1 — GBP/XXX · rate · change% */}
      <Text as="span" mono size={13} weight={700} color="var(--ft-blue)" letterSpacing="0.02em">
        GBP/{ccy}
      </Text>
      <Text as="span" mono size={13} numeric>
        {rate != null ? nfmt(rate, { decimals: rate < 10 ? 4 : 2 }) : "—"}
      </Text>
      <Text as="span" mono size={13} weight={600} color={pctColor(chg)} numeric>
        {pctLabel(chg)}
      </Text>
      {/* Row 2 — native holding · converted */}
      <div style={{ gridColumn: "1 / -1" }}>
        <Text as="span" mono size={10} color="var(--ft-dim)" numeric>
          your {sym}{nfmt(nativeSum)}
          {baseEquivalent != null ? ` ≈ ${formatMoney(baseEquivalent, getBaseCurrency())}` : ""}
        </Text>
      </div>
    </div>
  );
}
