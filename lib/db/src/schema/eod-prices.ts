import { pgTable, serial, text, numeric, date, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// End-of-day closing prices, one row per (ticker, session date).
//
// ── Why this table exists ───────────────────────────────────────────────────
// J26 settled that a user's holdings are valued END OF DAY, not from a live
// quote. Until 16 Sep 2026 processInvestments valued the whole portfolio from
// getStockPrices on every dashboard read, so the aggregate on screen was
// derived from live data whichever provider lane happened to answer — and the
// primary lane is documented in market.ts as "a STOPGAP, not a launch-safe
// provider" and an "undocumented, unlicensed endpoint", while Alpaca refused
// display to third parties on any plan in writing (ticket 350117).
//
// A prior-session close carries no exchange fee and no SIP entitlement, which
// is the whole reason J26 chose it.
//
// ── Why a table and not an in-process cache ─────────────────────────────────
// This is a cache with a MEANING, not a cache for speed: the row IS the price
// the portfolio was valued at on that session, and it is expected to be
// identical on every read until the next session closes.
//
// The operational half matters as much. docs/OPERATIONS.md records that the
// API sleeps after 15 minutes idle on Render's free tier, so an in-memory map
// is empty on most first page loads of the day and would put a provider call
// behind nearly every visit. The point of moving to EOD is to call the
// providers LESS, and a per-process cache does not deliver that. One row per
// ticker per session does: the first read of a session fetches, every read
// after it is served from Postgres.
//
// ── No user_id, deliberately ────────────────────────────────────────────────
// CLAUDE.md states that every table carries userId because the app is
// multi-tenant. This one does not, and the exception is argued rather than
// assumed:
//
//   · A closing price is a public market fact keyed by ticker and date. The
//     row holds nothing derived from any user — not a quantity, not a cost
//     basis, not an account. Two users holding AAPL are owed the identical
//     number.
//   · Tenanting it would store that identical number once per user and issue
//     one provider call per user, which is precisely the exposure the table
//     exists to reduce.
//   · There is no leak to contain: knowing AAPL's 15 Sep close tells a reader
//     nothing whatsoever about any account. WHICH tickers a user holds is
//     user data, and that stays in `investments`, which is tenanted.
//
// Nothing here is user-readable except through a valuation the user already
// owns, so no route exposes this table directly.
export const eodPricesTable = pgTable(
  "eod_prices",
  {
    id: serial("id").primaryKey(),
    // Yahoo notation, matching investments.ticker (AAPL, VUSA.L, BRK-B).
    ticker: text("ticker").notNull(),
    // The trading session this close belongs to. Always a completed session
    // and always KNOWN — a row is never written from a provider field whose
    // date we had to guess. See market-eod.ts for why previousClose alone is
    // not enough to write a row from.
    sessionDate: date("session_date", { mode: "string" }).notNull(),
    // The session's closing price, in `currency`. numeric(18, 6) matches
    // investments.shares / cost_price_per_share so a multiply does not lose
    // precision against them.
    close: numeric("close", { precision: 18, scale: 6 }).notNull(),
    // The instrument's own currency (USD for AAPL, GBP for VUSA.L). NOT the
    // user's base currency — the FX leg is applied at read time, by the same
    // toBase the live path uses, so a stored price never bakes in a rate.
    currency: text("currency").notNull(),
    // Which lane supplied it. Provenance, not decoration: when a figure is
    // later questioned, "which provider said this, and when did we ask"
    // is the first thing anyone needs.
    provider: text("provider").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One row per (ticker, session). The write path is an upsert on this
    // index: a re-fetch of a session already stored overwrites in place
    // rather than accumulating rows that disagree.
    uniqueIndex("eod_prices_ticker_session_uniq").on(table.ticker, table.sessionDate),
  ],
);

export type EodPrice = typeof eodPricesTable.$inferSelect;
