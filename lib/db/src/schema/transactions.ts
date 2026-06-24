import { pgTable, serial, text, numeric, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  date: date("date", { mode: "string" }).notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(), // income | expense | transfer
  category: text("category").notNull(),
  accountId: integer("account_id").notNull(),
  nativeAmount: numeric("native_amount", { precision: 18, scale: 4 }).notNull(),
  currency: text("currency").notNull(),
  source: text("source").notNull().default("manual"), // manual | plaid
  plaidTransactionId: text("plaid_transaction_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
