import { pgTable, serial, text, numeric, timestamp, integer, date, uniqueIndex, check, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userTable } from "./auth";

// Lock #19 cutoff — the exact timestamp of the prod FX-rate backfill
// run (2abc9c1 → apply against ep-dark-hall-ab7g28of, 30 Aug 2026).
// Every row with created_at < this timestamp is a legacy row that
// the backfill either populated (Frankfurter fill or same-currency)
// or left null (currency outside Frankfurter's set — none in prod
// or dev). Rows created AFTER the cutoff must go through
// snapshotFxRate (source='manual' path) which always sets rate_as_of
// even when the rate itself is null (FX outage).
//
// Historical-import sources ('csv', 'wise', 'file', or any adapter
// provider name) deliberately write both columns null on insert —
// their rows are backfilled from Frankfurter historical keyed on
// tx.date, which is more accurate than a today's-rate snapshot on
// a last-month's row would be. The constraint exempts source != 'manual'
// for that reason.
const LOCK_19_CUTOFF = "2026-08-30T12:31:52Z";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => userTable.id, { onDelete: "cascade" }),
  date: date("date", { mode: "string" }).notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(), // income | expense | transfer
  category: text("category").notNull(),
  accountId: integer("account_id").notNull(),
  nativeAmount: numeric("native_amount", { precision: 18, scale: 4 }).notNull(),
  currency: text("currency").notNull(),
  source: text("source").notNull().default("manual"), // manual | wise | csv | file
  externalId: text("external_id"), // wise transaction reference, or a hash for CSV/file dedup
  // native-to-base FX rate at write time. Nullable because every
  // pre-Aug-30 row and any row created during an FX outage carries
  // none — read-path falls back to live toBase() when null. Scale 8
  // is safe headroom for GBPJPY-style pairs where the integer side
  // eats ~4 significant figures. See snapshotFxRate() in
  // lib/market.ts for the write-time computation.
  nativeToBaseRate: numeric("native_to_base_rate", { precision: 18, scale: 8 }),
  // Timestamp of the FX cache observation the rate came from. Always
  // set (even when nativeToBaseRate is null — "we tried at time T
  // and had no rate"), so the backfill knows how stale a null-rate
  // row is. No rate_source column: rateAsOf carries provenance
  // implicitly. A rateAsOf near the transaction date at noon UTC
  // means backfilled from Frankfurter historical; a rateAsOf within
  // seconds of createdAt means snapshotted live at write. Don't add
  // a source column later — the timestamp already tells the story.
  rateAsOf: timestamp("rate_as_of", { withTimezone: true }),
  // Two-leg transfer support. Both columns are null for legacy one-sided
  // transfers (rows created before this migration). When both are present:
  // - transferGroupId links the debit and credit legs (same UUID on both)
  // - transferDirection 'out' = money leaving the account (debit leg)
  //                    'in'  = money arriving (credit leg)
  // balance.ts skips the early-return only when transferDirection is set,
  // so legacy rows continue to have no balance adjustment.
  transferGroupId: uuid("transfer_group_id"),
  transferDirection: text("transfer_direction"), // 'out' | 'in' | null (legacy)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  // H5 dedup index. Every row with an externalId must be unique per
  // (userId, accountId, externalId) — the file adapter derives the
  // externalId deterministically from row content so re-importing the
  // same statement produces the same externalId and the row is
  // dropped on conflict. Manual entries never carry externalId, so
  // this constraint doesn't restrict them.
  uniqueIndex("transactions_user_account_extid_uniq").on(t.userId, t.accountId, t.externalId),
  // Lock #19 · tx_rate_after_backfill.
  // Every manual-source row created after the backfill cutoff must
  // carry rate_as_of (rate itself may be null — FX outage — but the
  // attempt must be recorded). Historical-import sources are
  // exempted because they intentionally write null on insert; the
  // backfill script populates them later using Frankfurter historical
  // keyed on tx.date, which is more accurate than a today's-rate
  // snapshot on a last-month's row would be.
  //
  // WHY the cutoff is a hardcoded literal: it's the actual
  // wall-clock timestamp of the prod backfill run, captured at the
  // moment the backfill script started. Not a hand-typed date, not
  // a derived expression — the timestamp Thomas asked for in the
  // Lock #19 approval. If a future backfill of a currency
  // Frankfurter doesn't cover happens, THAT run's timestamp
  // supersedes this one and the constraint is regenerated.
  // Inlined as a literal (rather than an interpolated variable) so
  // drizzle-kit emits it into the migration SQL directly. Template
  // interpolation of a JS string produces a $1 parameter placeholder
  // in the generated ALTER, which Postgres won't accept in a CHECK.
  // See LOCK_19_CUTOFF definition above for the value's provenance.
  check(
    "tx_rate_after_backfill",
    sql`(created_at < '2026-08-30T12:31:52Z'::timestamptz) OR (source <> 'manual') OR (rate_as_of IS NOT NULL)`,
  ),
]);

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
