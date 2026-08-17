import { pgTable, serial, text, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { userTable } from "./auth";

// Per-user, per-month snapshot of net-worth composition. Populated
// lazily by the dashboard route: every dashboard read for the current
// month upserts a row using the live holdings buckets. Past months
// are read but never rewritten — a snapshot captured at end-of-month
// is what BANDS renders for that band.
//
// Why lazy rather than a cron job: Railway runs a single web process,
// no separate worker. The dashboard route runs on every session's
// first page load and easily hits every user monthly. If a user goes
// silent for a full month, we simply have no snapshot for that gap —
// BANDS shows the band as null, which the UI renders as an empty
// slot. This is honest — a fabricated backfill using current values
// projected backwards would show composition drift that never
// happened.
//
// Amounts are stored in the account/portfolio base currency (GBP for
// UK users, whatever getBaseCurrency() returns per user). The unit is
// major (pounds), not minor (pence) — matches the rest of the
// dashboard payload. numeric(18, 4) same as balance elsewhere.
//
// One row per (userId, month). Enforced by uniqueIndex — an upsert
// on (userId, month) is the write path.
export const nwSnapshotsTable = pgTable(
  "nw_snapshots",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => userTable.id, { onDelete: "cascade" }),
    // YYYY-MM. Not a date — a month is an inclusive-bounds concept
    // that doesn't need a day part. Kept as text so range queries
    // are ISO-lexicographic and no timezone drift creeps in.
    month: text("month").notNull(),
    cash: numeric("cash", { precision: 18, scale: 4 }).notNull(),
    investment: numeric("investment", { precision: 18, scale: 4 }).notNull(),
    pension: numeric("pension", { precision: 18, scale: 4 }).notNull(),
    property: numeric("property", { precision: 18, scale: 4 }).notNull(),
    other: numeric("other", { precision: 18, scale: 4 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    userMonthUnique: uniqueIndex("nw_snapshots_user_month_unique").on(t.userId, t.month),
  }),
);

export type NwSnapshot = typeof nwSnapshotsTable.$inferSelect;
