import { pgTable, serial, text, numeric, timestamp, date, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { userTable } from "./auth";

// Per-user daily net worth, as the dashboard computed it. The only source
// of net worth over time: `nw_snapshots` carries asset buckets per month
// with no liabilities and no owing, and `account_balance_snapshots` carries
// accounts with no portfolio value and no IOUs, so neither can be summed
// into the figure the app labels net worth (decision of 1 Oct 2026, option
// (b), .review/archive/2026-10-01T1439-findings-sweep.report.md).
//
// Each row holds the four terms of computeNetWorth (api-server
// routes/dashboard.ts) and their result, so a later change to the formula
// does not silently rewrite history, and a consumer can show what moved.
//
// Same write rules as account_balance_snapshots:
//   - LAZY, on the dashboard read. A day with no read has no row.
//   - WRITE-ONCE per (userId, date): the first read of the day captures,
//     later reads no-op (onConflictDoNothing).
//   - NO BACKFILL. Nothing before the first capture was measured.
//
// Amounts are major units in `baseCurrency` as it was at capture. A user
// who switches base currency has history in the old one; consumers read
// the rows matching the current base and say so, rather than converting
// past figures at today's rate.
export const netWorthSnapshotsTable = pgTable(
  "net_worth_snapshots",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => userTable.id, { onDelete: "cascade" }),
    // Local date (YYYY-MM-DD), same shape as account_balance_snapshots.date.
    date: date("date", { mode: "string" }).notNull(),
    baseCurrency: text("base_currency").notNull(),
    // computeNetWorth's terms. assets = totalCash (every non-liability
    // account in base); liabilities is a POSITIVE magnitude; owingNet is
    // totalOwedToMe - totalIOwe (pending debts and shared-expense shares).
    assets: numeric("assets", { precision: 18, scale: 4 }).notNull(),
    portfolio: numeric("portfolio", { precision: 18, scale: 4 }).notNull(),
    liabilities: numeric("liabilities", { precision: 18, scale: 4 }).notNull(),
    owingNet: numeric("owing_net", { precision: 18, scale: 4 }).notNull(),
    netWorth: numeric("net_worth", { precision: 18, scale: 4 }).notNull(),
    // True when the dashboard's figure was itself partial that day: an
    // account had no FX rate, or a holding had neither a price nor a
    // convertible cost. The figure is still what the user was shown.
    partial: boolean("partial").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("net_worth_snapshots_user_date_uniq").on(t.userId, t.date),
  ],
);

export type NetWorthSnapshot = typeof netWorthSnapshotsTable.$inferSelect;
