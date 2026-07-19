import { pgTable, serial, text, numeric, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userTable } from "./auth";

export const debtsTable = pgTable("debts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => userTable.id, { onDelete: "cascade" }),
  personName: text("person_name").notNull(),
  description: text("description").notNull(),
  date: text("date").notNull(), // ISO date string YYYY-MM-DD
  nativeAmount: numeric("native_amount", { precision: 18, scale: 4 }).notNull(),
  currency: text("currency").notNull().default("GBP"),
  direction: text("direction").notNull().default("i_owe_them"),
  status: text("status").notNull().default("pending"), // pending | settled
  notes: text("notes"),
  accountId: integer("account_id"),
  // Linked IOU columns
  linkedEmail: text("linked_email"),
  linkedUserId: text("linked_user_id").references(() => userTable.id, { onDelete: "set null" }),
  isReceived: boolean("is_received").notNull().default(false),
  sourceDebtId: integer("source_debt_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDebtSchema = createInsertSchema(debtsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertDebt = z.infer<typeof insertDebtSchema>;
export type Debt = typeof debtsTable.$inferSelect;
