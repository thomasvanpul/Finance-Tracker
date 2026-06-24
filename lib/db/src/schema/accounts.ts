import { pgTable, serial, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const accountsTable = pgTable("accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("GBP"),
  balance: numeric("balance", { precision: 18, scale: 4 }).notNull().default("0"),
  isPlaidLinked: boolean("is_plaid_linked").notNull().default(false),
  plaidAccountId: text("plaid_account_id"),
  plaidItemId: text("plaid_item_id"),
  plaidAccessToken: text("plaid_access_token"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAccountSchema = createInsertSchema(accountsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accountsTable.$inferSelect;
