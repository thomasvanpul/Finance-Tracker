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
