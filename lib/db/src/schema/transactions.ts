import { pgTable, serial, text, numeric, timestamp, integer, date, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userTable } from "./auth";

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
]);

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
