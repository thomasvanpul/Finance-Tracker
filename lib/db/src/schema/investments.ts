import { pgTable, serial, text, numeric, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userTable } from "./auth";

export const investmentsTable = pgTable("investments", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => userTable.id, { onDelete: "cascade" }),
  ticker: text("ticker").notNull(),
  name: text("name").notNull(),
  buyDate: date("buy_date", { mode: "string" }).notNull(),
  shares: numeric("shares", { precision: 18, scale: 6 }).notNull(),
  costPricePerShare: numeric("cost_price_per_share", { precision: 18, scale: 6 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInvestmentSchema = createInsertSchema(investmentsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertInvestment = z.infer<typeof insertInvestmentSchema>;
export type Investment = typeof investmentsTable.$inferSelect;
