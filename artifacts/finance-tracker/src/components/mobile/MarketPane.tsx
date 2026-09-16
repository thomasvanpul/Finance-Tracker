import { useMemo } from "react";
import { useLocation } from "wouter";
import {
  useListInvestments,
  useListAccounts,
  useGetDashboard,
  useGetMarketQuotes,
  getGetMarketQuotesQueryKey,
  useGetFxRates,
  type StockQuote,
} from "@workspace/api-client-react";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";
import { StaleAsOf } from "@/components/StaleAsOf";
import { FixingMark, closeTagText } from "@/components/FixingMark";
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
//
// ── J27, 2026-09-16: no per-security price on this surface ──────────────────
// This pane used to print AAPL $331.34 −0.52%, BTC-USD $75,811.59 −2.32%,
// MSFT $497.12 −1.64% and VUSA.L £106.78 −0.45%, one row per holding.
// J26 settled that holdings are valued as AGGREGATES and that a
// per-security price is never displayed. The desktop index tiles came out
// on 11 Sep and the server learned to refuse index symbols, but nothing
// touched this surface because the phone had not been photographed.
//
// What is licensed and what is not:
//   · Per-security prices arrive via getStockPrices, whose chain is
//     Yahoo → Alpaca → Polygon → Twelve Data. Alpaca refused display to
//     third parties on any plan (ticket 350117, 11 Sep) and called this
//     use commercial. The PRIMARY lane is worse, not better: market.ts
//     documents Yahoo as "a STOPGAP, not a launch-safe provider" and an
//     "undocumented, unlicensed endpoint". So the exposure does not
//     depend on which lane happened to serve the row.
//   · The user's own holdings — ticker, quantity, cost basis — are their
//     record and need no licence from anybody. They stay.
//   · FX rows stay too. They are not securities, and their rate comes
//     from the FX endpoint's Yahoo → Frankfurter chain, Frankfurter being
//     the ECB's openly published reference fixings.
//
// So the positions block keeps ticker and quantity, gains ONE aggregate
// value (dashboard.portfolio.totalValueBase — the same figure the market
// persona's headline already renders, not a new metric invented to fill
// the space), and loses price and change%. The pane also stops REQUESTING
// per-security quotes: the tickers are no longer in the useGetMarketQuotes
// call, so the surface neither shows nor fetches them.

// StockQuote (regenerated 2026-08-16 with changePercent + previousClose
// added to the OpenAPI spec) now carries the runtime fields the server
// has always returned. `stale` is set by the server when serving cached
// data past the fresh window — not yet in the generated schema.
type QuoteExt = StockQuote & { stale?: boolean };

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

// Crypto quote-pair tickers, mirroring the server's classifyTicker rule in
// api-server/src/lib/market-classifier.ts. Only used to pick the noun.
const CRYPTO_TICKER = /-(USD|USDT|EUR|GBP|BTC|ETH)$/;

// "shares" is wrong for a coin — you do not hold 0.05 shares of Bitcoin.
function unitNoun(ticker: string, qty: number): string {
  const noun = CRYPTO_TICKER.test(ticker) ? "unit" : "share";
  return qty === 1 ? noun : `${noun}s`;
}

// Quantity, not money: the number rule's "two decimals for facts" is about
// currency. A holding of 8 is 8, and 0.05 of a coin is 0.05 — the stored
// scale is 6dp, so "0.050000" and the old fixed-4dp "0.0500" were both
// trailing-zero noise. Separators stay; up to 6dp, none of them padding.
function qtyLabel(qty: number): string {
  return qty.toLocaleString("en-GB", { maximumFractionDigits: 6 });
}

interface MarketPaneProps {
  onOpenInvestments: () => void;
}

export function MarketPane({ onOpenInvestments }: MarketPaneProps) {
  const [, navigate] = useLocation();
  const { data: investments = [] } = useListInvestments();
  const { data: accounts = [] } = useListAccounts();
  // Aggregate holdings value. Server-computed, already on the payload this
  // screen loads for its headline — TanStack serves it from cache.
  const { data: dashboard } = useGetDashboard();

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

  // FX pairs ONLY. Held tickers used to be in this list; J27 took them out
  // (see the note at the top of the file). Nothing on this surface renders
  // a per-security price any more, so nothing on this surface asks for one.
  // Refetch every 30 s so the pane earns its "this changes without you
  // doing anything" slot but doesn't hammer the upstream.
  const allTickers = useMemo(
    () => heldForeignCurrencies.map((f) => f.pair),
    [heldForeignCurrencies],
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

  // FX rates: the RATE for GBP/{ccy} comes from useGetFxRates, NOT from
  // useGetMarketQuotes for the =X ticker. The two endpoints answer
  // different questions (rate vs full quote) and rely on different
  // provider chains — Yahoo → Frankfurter fallback on the FX side,
  // Yahoo → Twelve Data (no Frankfurter) on the quote side. When Yahoo
  // fails on a per-symbol basis for GBPMYR=X, the FX endpoint still has
  // a rate because Frankfurter fills it in; the quote endpoint returns
  // nothing. This pane was previously reading BOTH rate and change from
  // the quote and rendering "—" for the rate while a converted account
  // balance three rows above used the working (Frankfurter) rate. The
  // screen contradicted itself. See defect #1 note (26 Aug session).
  //
  // Change % still comes from useGetMarketQuotes when the quote is
  // available. As of 2026-09-06 the quote side has its own Frankfurter
  // lane, so a =X quote can now arrive with a REAL day-change derived
  // from two consecutive ECB fixings rather than no change at all. That
  // delta is fixing-over-fixing, not a live intraday move, so the row
  // marks it (FixingMark) rather than presenting it as a live tick.
  // "—" when the quote is missing entirely is still the honest answer.
  const { data: fxRates } = useGetFxRates();

  const quoteMap = useMemo(() => {
    const m = new Map<string, QuoteExt>();
    for (const q of quotes as QuoteExt[]) m.set(q.ticker, q);
    return m;
  }, [quotes]);

  // Stale-serve indicator: find the oldest server-side updatedAt among
  // quotes the server has flagged as stale. The 45-min FX cache means
  // the user may see no movement for up to 45 minutes — this makes that
  // explicit rather than looking like a frozen screen.
  const staleTs = useMemo(() => {
    let oldest: number | null = null;
    for (const q of quotes as QuoteExt[]) {
      if (!q.stale) continue;
      const ts = new Date(q.updatedAt).getTime();
      if (oldest === null || ts < oldest) oldest = ts;
    }
    return oldest;
  }, [quotes]);

  const holdingsValueBase = dashboard?.portfolio.totalValueBase ?? null;
  // The session the securities leg was valued at, and how many positions the
  // total could not price. Both come straight from the dashboard payload —
  // the screen states them rather than deriving anything of its own.
  const closeText = closeTagText(dashboard?.portfolio.valuationAsOfSession);
  const unpriced = dashboard?.portfolio.unavailablePositions ?? 0;

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
          {/* "MARKETS · TOUCHING YOU" until 16 Sep 2026. J27 took the
              per-security prices out and left a heading promising market
              data over an aggregate portfolio value, a list of the user's
              own tickers and quantities, and the FX rows. Every row under
              this heading is now something the user holds, so that is what
              it says. The INVESTMENTS drill is unchanged. */}
          <MonoLabel as="span" size={11} letterSpacing="0.16em">
            WHAT YOU HOLD
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
        {staleTs !== null && (
          <div style={{ marginTop: 4 }}>
            <StaleAsOf ts={staleTs} isFresh={false} compact />
          </div>
        )}
      </div>

      <VStack paddingX={18} marginTop={6}>
        {/* Aggregate holdings value — one figure for the whole portfolio,
            which is the grain J26 permits. Null-safe per G10: the payload
            only carries a number once the dashboard has loaded. */}
        {heldPositions.length > 0 && (
          <div
            onClick={onOpenInvestments}
            style={{
              cursor: "pointer",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              rowGap: 2,
              columnGap: 12,
              alignItems: "baseline",
              minHeight: 52,
              padding: "10px 0",
              borderBottomWidth: 1,
              borderBottomStyle: "solid",
              borderBottomColor: "var(--ft-border)",
            }}
          >
            <Text as="span" mono size={13} weight={700} letterSpacing="0.02em">
              HOLDINGS
            </Text>
            <Text as="span" mono size={13} numeric>
              {holdingsValueBase != null
                ? formatMoney(holdingsValueBase, getBaseCurrency())
                : "—"}
            </Text>
            <div style={{ gridColumn: "1 / -1" }}>
              <Text as="span" mono size={10} color="var(--ft-dim)" numeric>
                {[
                  `your ${heldPositions.length} position${heldPositions.length === 1 ? "" : "s"}`,
                  // Not live, and said so. Crypto and FX stay live and carry
                  // no mark — they have no close to be end-of-day against.
                  closeText,
                  // G10: a leg we could not price is named, never absorbed
                  // into the total as a zero. Same wording as the desktop
                  // INVESTMENTS KPI ("N unavailable — not in value").
                  unpriced > 0 ? `${unpriced} unavailable — not in value` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </div>
          </div>
        )}
        {/* Positions: ticker + quantity. The user's own record — no price,
            no change%. J27. */}
        {heldPositions.map((p, i) => {
          const isLast =
            i === heldPositions.length - 1 && heldForeignCurrencies.length === 0;
          return (
            <PositionRow
              key={`pos-${p.ticker}`}
              ticker={p.ticker}
              shares={p.shares}
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
          // Rate from useGetFxRates (Yahoo → Frankfurter fallback).
          // Change % from useGetMarketQuotes when available; "—" when
          // the =X quote orphaned out of the yahoo/twelvedata chain.
          const rate = fxRates?.rates[f.ccy];
          const rateSafe = typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null;
          const chg = q?.changePercent ?? null;
          // Only mark when the change ITSELF came from a fixing. The
          // rate above it comes from the FX endpoint, which has had a
          // Frankfurter fallback for weeks; marking on that would put
          // the label on rows whose delta is a live Yahoo number.
          const fixingAt = q?.provider === "frankfurter" && chg != null ? q.updatedAt : null;
          return (
            <FxRow
              key={`fx-${f.ccy}`}
              ccy={f.ccy}
              nativeSum={f.nativeSum}
              rate={rateSafe}
              chg={chg}
              fixingAt={fixingAt}
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
// TICKER · quantity. No price and no change% — J27, see the note at the top
// of this file. The row is the user's own holding, which is why it survives
// the removal at all; the value of the whole set is the HOLDINGS row above.

interface PositionRowProps {
  ticker: string;
  shares: number;
  isLast: boolean;
  onClick: () => void;
}

function PositionRow({ ticker, shares, isLast, onClick }: PositionRowProps) {
  return (
    <div
      onClick={onClick}
      style={{
        cursor: "pointer",
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        columnGap: 12,
        alignItems: "baseline",
        // 44 is the Amendment's tap minimum. The row was 52 when it
        // carried two lines; it carries one now.
        minHeight: 44,
        padding: "10px 0",
        borderBottomWidth: isLast ? 1 : 0,
        borderBottomStyle: "solid",
        borderBottomColor: "var(--ft-border)",
      }}
    >
      <Text as="span" mono size={13} weight={700} color="var(--ft-blue)" letterSpacing="0.02em">
        {ticker}
      </Text>
      <Text as="span" mono size={10} color="var(--ft-dim)" numeric>
        your {qtyLabel(shares)} {unitNoun(ticker, shares)}
      </Text>
    </div>
  );
}

// ── FX row ──────────────────────────────────────────────────────────────────
// GBP/XXX · rate · change% · "your XXX N ≈ £abc" relevance line.
//
// Rate and change are separately sourced by the parent — see the comment
// on the useGetFxRates call in MarketPane. Rate is scalar and can come
// from Frankfurter when Yahoo is down; change requires previousClose and
// only comes from the quote endpoint.

interface FxRowProps {
  ccy: string;
  nativeSum: number;
  rate: number | null;
  chg: number | null;
  // ISO fixing instant when `chg` came from the Frankfurter/ECB lane;
  // null when the change is a live quote (or absent). Presence of this
  // value is what puts the FixingMark on the row.
  fixingAt: string | null;
  isFirst: boolean;
  isLast: boolean;
}

function FxRow({ ccy, nativeSum, rate, chg, fixingAt, isFirst, isLast }: FxRowProps) {
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
      {/* Row 3 — provenance, only when the change came from a fixing. */}
      {fixingAt != null && (
        <div style={{ gridColumn: "1 / -1" }}>
          <FixingMark updatedAt={fixingAt} />
        </div>
      )}
    </div>
  );
}
