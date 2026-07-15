import { pgTable, serial, text, numeric, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userTable } from "./auth";

export const upcomingTable = pgTable("upcoming", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => userTable.id, { onDelete: "cascade" }),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  type: text("type").notNull(), // income | expense
  frequency: text("frequency").notNull().default("one-time"), // one-time | weekly | monthly | quarterly | yearly
  status: text("status").notNull().default("pending"), // pending | paid | skipped
  nativeAmount: numeric("native_amount", { precision: 18, scale: 4 }).notNull(),
  currency: text("currency").notNull().default("GBP"),
  accountId: integer("account_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUpcomingSchema = createInsertSchema(upcomingTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertUpcoming = z.infer<typeof insertUpcomingSchema>;
export type Upcoming = typeof upcomingTable.$inferSelect;
