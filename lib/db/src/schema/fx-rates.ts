import { pgTable, serial, text, numeric, date, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Foreign exchange reference rates, one row per (fixing date, base, quote,
// provider). BACKLOG J28.
//
// ── Why this table exists ───────────────────────────────────────────────────
// Every converted figure in the product depends on a rate, and until 4 Oct
// 2026 the only copy of any rate was a five-minute in-process cache in
// api-server lib/market.ts. Once it expired there was no record of which
// rate a figure had been computed with, and no way to say so later. With
// ENABLE_MARKET_DATA off, every rate is the ECB's daily reference fixing via
// Frankfurter; this stores each fixing as it is fetched, with the date the
// ECB published it for and the provider that supplied it.
//
// Rows are written only from a successful provider response. Nothing here is
// ever a fallback or an estimate (CLAUDE.md: never show a number the API did
// not supply).
//
// ── No user_id, deliberately ────────────────────────────────────────────────
// Same argument as eod_prices: a fixing is a public fact keyed by date and
// currency pair, holds nothing derived from any user, and every user is owed
// the identical number. Which currencies a user holds stays in `accounts`,
// which is tenanted. No route exposes this table directly.
export const fxRatesTable = pgTable(
  "fx_rates",
  {
    id: serial("id").primaryKey(),
    // The date the provider says the rate is FOR (Frankfurter's `date`, the
    // ECB fixing day). Not the day we asked: on a Sunday it is Friday.
    date: date("date", { mode: "string" }).notNull(),
    base: text("base").notNull(),
    quote: text("quote").notNull(),
    // Units of `quote` per one `base`. Scale 8 matches
    // transactions.native_to_base_rate.
    // why fixed: column precision is schema, changed only by a migration.
    rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
    // "ecb" for the ECB reference fixing (served by Frankfurter).
    provider: text("provider").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A fixing does not change once published, so a second fetch of the same
    // day is a no-op rather than a second row.
    uniqueIndex("fx_rates_date_pair_provider_uniq").on(table.date, table.base, table.quote, table.provider),
  ],
);

export type FxRate = typeof fxRatesTable.$inferSelect;
