import { desc, inArray, sql } from "drizzle-orm";
import { db, eodPricesTable } from "@workspace/db";
import { logger } from "./logger";
import { classifyTicker } from "./market-classifier";
import { getStockPrices, sessionDateUtc, utcDayBefore, yahooDailyBars, type DailyBar, type StockPriceData } from "./market";

// ── End-of-day valuation ─────────────────────────────────────────────────────
//
// J26: a user's holdings are valued END OF DAY, never from a live quote, and
// never at a per-security price the user can read. This module is the price
// half of that. It answers ONE question — "what did this instrument close at,
// in the last completed session we know about" — and it answers it from the
// eod_prices table, going to a provider at most once per ticker per day.
//
// ── What each of the four lanes actually offers, checked 16 Sep 2026 ─────────
// The task that produced this module asked for the lane survey first. The
// short answer is that a previous close was never the missing piece: all four
// already return one alongside the live price, in the same response, at no
// extra call.
//
//   Yahoo        chart(interval:"1d") → meta.chartPreviousClose, plus DATED
//                daily bars in `quotes`.
//   Alpaca       /v2/stocks/snapshots → prevDailyBar.c          (undated)
//   Polygon      /v2/snapshot/…/tickers/X → prevDay.c           (undated)
//   Twelve Data  /quote → previous_close                        (undated)
//
// The piece that WAS missing is a date. Three of the four hand back a bare
// number with no statement of which session it closed. A table keyed by
// session date cannot be written from a number whose session is unknown
// without inventing the key, so this module writes rows only from dated bars.
//
// And the fourth, Yahoo, is worse than undated — it is wrong. `meta.
// chartPreviousClose` is the close of the session before the WINDOW'S FIRST
// BAR, not the session before today, and it moves with the window. Probed
// from this machine on 16 Sep 2026:
//
//   AAPL, 5-day window   chartPreviousClose = 326.57   (the 10 Sep close)
//   AAPL, 20-day window  chartPreviousClose = 313.45   (the 27 Aug close)
//   AAPL, prior session                       333.08   (14 Sep)
//
// market.ts has used the 5-day form as "the previous close" since it was
// written, so dayChangeBase has been computed against a close three sessions
// old. The in-source comment there describes the semantics correctly and then
// uses the value as though it meant something else; the defect is in the use.
// Valuing from dated bars fixes the valuation and the day-change together.
//
// ── Not in scope, and why ───────────────────────────────────────────────────
// CRYPTO and FX stay live, deliberately and permanently. Crypto has no
// exchange that owns the print and trades continuously, so "end of day" is
// not a property the instrument has. FX rates come from the ECB via
// Frankfurter, which publishes one reference fixing per TARGET working day
// and is openly licensed. Neither is the exposure J26 was about. `isEodValued`
// below is where that line is drawn — it is not a convenience, it is the
// scope boundary.
//
// The LIVE PATH IS UNCHANGED. getStockPrices and getStockQuotes still do
// exactly what they did; nothing was removed. What changed is what a *user's*
// portfolio VALUE is computed from.
//
// ── Not yet built ───────────────────────────────────────────────────────────
// Only Yahoo has a dated-bar lane here. Alpaca (/v2/stocks/bars?timeframe=
// 1Day), Polygon (/v2/aggs/ticker/{t}/prev) and Twelve Data (/eod) all
// publish one, but POLYGON_API_KEY and TWELVEDATA_API_KEY are unset on this
// machine, and data.alpaca.markets does not resolve from it, so none of the
// three could be written against an observed response. They are named rather
// than guessed at. Until one lands, a Yahoo failure falls back to the newest
// STORED session for that ticker (see `getEodPrices`) and, failing that,
// leaves the position unpriced — which surfaces as unavailablePositions
// rather than as a total that quietly omits a holding.

export interface EodPrice {
  ticker: string;
  /** Close of the most recent completed session we have. */
  close: number;
  /** The instrument's own currency, not the user's base. */
  currency: string;
  /** YYYY-MM-DD. Always a real session, never inferred. */
  sessionDate: string;
  /** Close of the session before `sessionDate`, or null if we only have one.
   *  This is the honest previous close — the thing chartPreviousClose is not. */
  previousClose: number | null;
  /** The session `previousClose` closed on, or null with it. A close-to-close
   *  delta spans from this date to `sessionDate` — 72 hours across a weekend,
   *  more across a holiday — so a screen must date it rather than call it 24H. */
  previousSessionDate: string | null;
  provider: string;
  /** True when this row was served from storage because the fetch failed, so
   *  the caller can tell "yesterday's close, as designed" from "an older
   *  close, because we could not reach anybody today". */
  fromStaleStore: boolean;
}

/**
 * Whether this instrument is valued from an end-of-day close.
 *
 * Securities are (us_equity, us_etf, non_us_equity, futures — all of them
 * print on an exchange that owns the data). Crypto and forex are not; see the
 * scope note above. `index` never reaches here — market.ts refuses index
 * levels before any provider is called.
 */
export function isEodValued(ticker: string): boolean {
  const kind = classifyTicker(ticker);
  return kind !== "crypto" && kind !== "forex";
}

/** Today's date in UTC. Bars are dated in UTC by the provider, and a session
 *  that has not closed anywhere is not a completed session under any local
 *  calendar either, so UTC is the conservative boundary. The arithmetic lives
 *  in market.ts, which owns exchange-calendar dates. */
function todayUtc(): string {
  return sessionDateUtc(new Date());
}

/**
 * The last two COMPLETED sessions from a dated bar series.
 *
 * "Completed" is `date < today` in UTC. Today's bar is excluded even when the
 * provider returns one, because during a session it carries the running price
 * and not a close — valuing from it would put a live figure back into the
 * total by the back door, which is the whole thing J26 removed.
 *
 * Bars with a null close are dropped rather than carried: VUSA.L returned a
 * dated bar with `close: null` on 15 Sep 2026, and treating that as zero, or
 * as the previous bar's value, would be a fabricated price.
 */
export function lastCompletedSessions(bars: readonly DailyBar[]): { latest: DailyBar; previous: DailyBar | null } | null {
  const today = todayUtc();
  const usable = bars
    .filter((b) => b.date < today && typeof b.close === "number" && Number.isFinite(b.close) && b.close > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (usable.length === 0) return null;
  return {
    latest: usable[usable.length - 1]!,
    previous: usable.length >= 2 ? usable[usable.length - 2]! : null,
  };
}

/** Rows already in the store for these tickers, newest session first. */
async function readStored(tickers: string[]) {
  if (tickers.length === 0) return new Map<string, Array<typeof eodPricesTable.$inferSelect>>();
  const rows = await db
    .select()
    .from(eodPricesTable)
    .where(inArray(eodPricesTable.ticker, tickers))
    .orderBy(desc(eodPricesTable.sessionDate));
  const byTicker = new Map<string, Array<typeof eodPricesTable.$inferSelect>>();
  for (const r of rows) {
    const list = byTicker.get(r.ticker) ?? [];
    list.push(r);
    byTicker.set(r.ticker, list);
  }
  return byTicker;
}

function toEod(
  rows: Array<typeof eodPricesTable.$inferSelect>,
  fromStaleStore: boolean,
): EodPrice | null {
  const latest = rows[0];
  if (!latest) return null;
  const close = parseFloat(latest.close);
  if (!Number.isFinite(close)) return null;
  const prevRow = rows[1];
  const prev = prevRow ? parseFloat(prevRow.close) : NaN;
  return {
    ticker: latest.ticker,
    close,
    currency: latest.currency,
    sessionDate: latest.sessionDate,
    previousClose: Number.isFinite(prev) ? prev : null,
    previousSessionDate: prevRow && Number.isFinite(prev) ? prevRow.sessionDate : null,
    provider: latest.provider,
    fromStaleStore,
  };
}

/**
 * EOD prices for `tickers`.
 *
 * ── What happens on the first read of a day ────────────────────────────────
 * A ticker is refetched when the store holds no row whose session is the last
 * completed session OR later. In practice: the first dashboard read after a
 * session closes goes to Yahoo once, writes the last two sessions, and every
 * read after it that day is served from Postgres with no provider call at all.
 *
 * The freshness test is on the SESSION, not on fetchedAt. A row for the 15th
 * is the right answer all through the 16th and asking again would change
 * nothing; that is what makes this a cache with a meaning rather than a TTL.
 *
 * Tickers that are not EOD-valued (crypto, forex) are absent from the result
 * by design — the caller keeps valuing those live.
 */
export async function getEodPrices(tickers: string[]): Promise<Map<string, EodPrice>> {
  const eligible = [...new Set(tickers)].filter(isEodValued);
  const out = new Map<string, EodPrice>();
  if (eligible.length === 0) return out;

  const stored = await readStored(eligible);
  const today = todayUtc();
  const toFetch: string[] = [];

  for (const ticker of eligible) {
    const rows = stored.get(ticker);
    // A row dated yesterday-or-later in UTC is the last completed session by
    // construction, so there is nothing newer to ask for.
    if (rows && rows[0] && rows[0].sessionDate < today) {
      const yesterdayUtc = utcDayBefore(today);
      if (rows[0].sessionDate >= yesterdayUtc) {
        const served = toEod(rows, false);
        if (served) { out.set(ticker, served); continue; }
      }
    }
    toFetch.push(ticker);
  }

  if (toFetch.length === 0) return out;

  // One provider read per ticker. Settled rather than all-or-nothing: one
  // dark ticker must not blank the other four.
  const results = await Promise.allSettled(toFetch.map(async (ticker) => {
    const bars = await yahooDailyBars(ticker);
    const sessions = lastCompletedSessions(bars);
    if (!sessions) throw new Error(`no completed session in Yahoo bars for ${ticker}`);
    return { ticker, sessions, currency: bars[0]?.currency ?? "USD" };
  }));

  const writes: Array<typeof eodPricesTable.$inferInsert> = [];
  for (let i = 0; i < toFetch.length; i += 1) {
    const ticker = toFetch[i]!;
    const r = results[i]!;
    if (r.status === "rejected") {
      // Fall back to whatever session we already hold, however old. It is a
      // real, dated close and the caller carries the date to the screen, so
      // the user is told how stale it is rather than shown nothing. Serving
      // a dated older close is not the same defect as serving a fabricated
      // one — nothing here is invented.
      const rows = stored.get(ticker);
      const served = rows ? toEod(rows, true) : null;
      logger.info(
        { ticker, err: r.reason instanceof Error ? r.reason.message : r.reason, servedStored: served != null },
        "eod fetch failed",
      );
      if (served) out.set(ticker, served);
      continue;
    }
    const { sessions, currency } = r.value;
    const { latest, previous } = sessions;
    writes.push({
      ticker, sessionDate: latest.date, close: String(latest.close),
      currency, provider: "yahoo", fetchedAt: new Date(),
    });
    if (previous) {
      writes.push({
        ticker, sessionDate: previous.date, close: String(previous.close),
        currency, provider: "yahoo", fetchedAt: new Date(),
      });
    }
    out.set(ticker, {
      ticker,
      close: latest.close,
      currency,
      sessionDate: latest.date,
      previousClose: previous ? previous.close : null,
      previousSessionDate: previous ? previous.date : null,
      provider: "yahoo",
      fromStaleStore: false,
    });
  }

  if (writes.length > 0) {
    // Upsert on (ticker, session_date). A re-fetch of a session already held
    // overwrites in place; two requests racing the same first-read-of-the-day
    // settle on the unique index rather than on luck, the same way the
    // upcoming-subscription write does.
    await db
      .insert(eodPricesTable)
      .values(writes)
      .onConflictDoUpdate({
        target: [eodPricesTable.ticker, eodPricesTable.sessionDate],
        set: {
          close: sqlExcluded("close"),
          currency: sqlExcluded("currency"),
          provider: sqlExcluded("provider"),
          fetchedAt: new Date(),
        },
      })
      .catch((err) => {
        // A failed write must not fail the read: the prices in `out` are
        // already correct and the next request simply refetches.
        logger.warn({ err }, "eod_prices upsert failed; serving fetched prices anyway");
      });
  }

  return out;
}

/** `excluded."col"` for the upsert above. */
function sqlExcluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}


// ── The valuation price map ─────────────────────────────────────────────────
//
// Every surface that puts a number on a user's portfolio goes through here:
// the dashboard aggregate, GET /investments and GET /investments/summary.
// One function so the three cannot drift — a list whose rows sum to something
// other than the total above them is the defect this repo keeps re-finding.
//
// Securities come from eod_prices. Crypto and forex keep the live chain.
// Both arrive as StockPriceData so enrichInvestment and processInvestments
// need no new shape.

export interface ValuationPrices {
  prices: Map<string, StockPriceData>;
  /** The OLDEST session contributing to this valuation, YYYY-MM-DD, or null
   *  when nothing in it was EOD-valued. Oldest rather than newest on purpose:
   *  a total is only as current as its stalest leg, and dating it by the
   *  freshest one would overstate how recent the whole figure is. */
  asOfSession: string | null;
  /** Tickers valued from a stored session because the provider could not be
   *  reached today. Already counted in `asOfSession`; surfaced separately so
   *  an operator can tell a quiet Yahoo from a quiet weekend. */
  staleTickers: string[];
}

/** The oldest of `dates`, or null when none is set. YYYY-MM-DD compares
 *  correctly as a string. Used to date an aggregate from its stalest leg. */
export function oldestSessionDate(dates: ReadonlyArray<string | null | undefined>): string | null {
  let oldest: string | null = null;
  for (const d of dates) {
    if (d && (oldest == null || d < oldest)) oldest = d;
  }
  return oldest;
}

export async function getValuationPrices(tickers: string[]): Promise<ValuationPrices> {
  const unique = [...new Set(tickers)];
  const eodTickers = unique.filter(isEodValued);
  const liveTickers = unique.filter((t) => !isEodValued(t));

  const [eod, live] = await Promise.all([
    getEodPrices(eodTickers),
    liveTickers.length > 0 ? getStockPrices(liveTickers) : Promise.resolve([]),
  ]);

  const prices = new Map<string, StockPriceData>();
  let asOfSession: string | null = null;
  const staleTickers: string[] = [];

  for (const [ticker, e] of eod) {
    prices.set(ticker, {
      ticker,
      price: e.close,
      currency: e.currency,
      previousClose: e.previousClose,
      previousSessionDate: e.previousSessionDate,
      // The instant we learned the close, not the instant of the close. The
      // SESSION is carried by asOfSession, which is what the screen dates the
      // figure by; re-stamping updatedAt to `now` is how a day-old number
      // starts reading as live, and market.ts already refuses to do it for
      // ECB fixings for the same reason.
      updatedAt: new Date().toISOString(),
      provider: e.provider,
    });
    if (asOfSession == null || e.sessionDate < asOfSession) asOfSession = e.sessionDate;
    if (e.fromStaleStore) staleTickers.push(ticker);
  }
  for (const p of live) prices.set(p.ticker, p);

  return { prices, asOfSession, staleTickers };
}
