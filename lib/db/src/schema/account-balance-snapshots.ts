import { pgTable, serial, text, numeric, timestamp, integer, date, uniqueIndex } from "drizzle-orm/pg-core";
import { userTable } from "./auth";
import { accountsTable } from "./accounts";

// Per-account daily balance snapshot. The prerequisite for the
// reconciliation gap ("£40 unaccounted this month") and for
// forward-looking safe-to-spend. Without this table, gap/safe-to-spend
// have to work off `nw_snapshots`, which aggregates by TYPE across
// accounts (not per-account) and is lazily upserted per-MONTH (so the
// "start-of-month" reference is really "as of the user's last
// dashboard read in that month" — drift scales with browsing
// habits). See the 2026-08-31 diagnosis for the full story.
//
// Design (2026-09-01, all decisions recorded in .review/archive/):
//   1. LAZY write on heavy user paths (dashboard route, initially).
//      A day with no snapshot is a discrete missing row; consumers
//      fall back to the nearest prior snapshot with a staleness
//      threshold. Daily grain makes holes recoverable in a way
//      monthly grain never was.
//   2. WRITE-ONCE per (accountId, date). First read of the day
//      captures; later reads no-op. Prevents the drift that
//      nw_snapshots' upsert-on-current-month reintroduced at
//      day granularity. Same principle as FX-at-write: record
//      what we knew at capture time, don't rewrite.
//   3. ALL accounts, not just cash. Downstream (the gap) filters by
//      accounts.type = 'cash' to avoid market movement swamping the
//      signal. Storage is cheap (~5–6 rows per user per day) and
//      other features (per-account trend charts, daily-grain net-worth
//      history) benefit for free.
//   4. NATIVE + rate + rateAsOf. Symmetric with the FX-at-write
//      pattern on transactions. Storing base equivalent would fossilise
//      a value that becomes stale when the user switches base currency;
//      native + rate lets consumers re-derive against any base and
//      lets the same base-switch bulk recompute (FX plan option B)
//      run against snapshots the same way it runs against transactions.
//   5. NO BACKFILL POSSIBLE. `accounts.balance` is a live scalar with
//      no history. The series starts empty and accumulates. Every
//      consumer must degrade gracefully below its own threshold and
//      expose `dataAvailableSince` so the UI can name the limitation.
//
// One row per (accountId, date). Enforced by uniqueIndex. Backend
// write path uses onConflictDoNothing so the write-once semantics
// hold even under concurrent reads.
export const accountBalanceSnapshotsTable = pgTable(
  "account_balance_snapshots",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => userTable.id, { onDelete: "cascade" }),
    accountId: integer("account_id").notNull().references(() => accountsTable.id, { onDelete: "cascade" }),
    // Local date (YYYY-MM-DD). Same shape as transactions.date — not
    // a timestamp, no timezone drift, ISO-lexicographic ordering.
    date: date("date", { mode: "string" }).notNull(),
    // Native balance at capture time — ground truth from the account.
    balance: numeric("balance", { precision: 18, scale: 4 }).notNull(),
    // Mirror of accounts.currency at snapshot time. If the account
    // re-currencies later, the historical snapshot still reads honestly
    // in its own currency.
    currency: text("currency").notNull(),
    // Native-to-base FX rate at capture time. Nullable when FX was
    // unavailable at capture — same shape as transactions. Read
    // path multiplies balance * rate; fallback via toBase() when null.
    nativeToBaseRate: numeric("native_to_base_rate", { precision: 18, scale: 8 }),
    // Timestamp of the FX cache observation the rate came from.
    // Always set when the snapshot was captured through
    // snapshotFxRate (even for null rate — "we tried at T").
    rateAsOf: timestamp("rate_as_of", { withTimezone: true }),
    // Wall-clock of the capture itself. Distinct from date (the
    // local-date bucket the snapshot belongs to) — capturedAt tells
    // consumers whether a same-day PATCH edit landed before or after
    // the snapshot, and how close to midnight the capture ran.
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("account_balance_snapshots_account_date_uniq").on(t.accountId, t.date),
  ],
);

export type AccountBalanceSnapshot = typeof accountBalanceSnapshotsTable.$inferSelect;
