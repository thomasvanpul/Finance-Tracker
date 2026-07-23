import { pgTable, serial, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { userTable } from "./auth";

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => userTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
  currency: text("currency").notNull().default("GBP"),
  frequency: text("frequency").notNull().default("monthly"),
  category: text("category").notNull().default("Other"),
  nextDue: text("next_due"),
  startDate: text("start_date").notNull(),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  manuallyAdded: boolean("manually_added").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const dismissedSubscriptionsTable = pgTable("dismissed_subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => userTable.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Subscription = typeof subscriptionsTable.$inferSelect;
