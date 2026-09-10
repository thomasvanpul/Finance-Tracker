import { pgTable, serial, text, numeric, timestamp, integer, date, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { userTable } from "./auth";
import { subscriptionsTable } from "./subscriptions";

export const upcomingTable = pgTable(
  "upcoming",
  {
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
    // Set when this row was GENERATED from a subscription's recurrence
    // rule rather than entered by hand. Nullable: every row that predates
    // the rule, and every hand-entered row, keeps NULL forever.
    //
    // `on delete set null` rather than cascade, deliberately: deleting the
    // rule must not silently delete a dated obligation the user can still
    // see on UPCOMING. The row survives, orphaned, and stops advancing.
    subscriptionId: integer("subscription_id").references(() => subscriptionsTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    // The idempotency guarantee, held in the database rather than in the
    // generator. Two concurrent GETs both computing the same occurrence
    // race; without this one of them wins and the other inserts a
    // duplicate, and committedOut double-counts a subscription. Partial,
    // so the thousands of hand-entered rows with NULL subscription_id are
    // untouched by it (NULLs are not equal to each other in a plain
    // unique index either, but a partial index is smaller and states the
    // intent).
    uniqueIndex("upcoming_subscription_due_uniq")
      .on(t.subscriptionId, t.dueDate)
      .where(sql`${t.subscriptionId} is not null`),
  ],
);

export const insertUpcomingSchema = createInsertSchema(upcomingTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertUpcoming = z.infer<typeof insertUpcomingSchema>;
export type Upcoming = typeof upcomingTable.$inferSelect;
