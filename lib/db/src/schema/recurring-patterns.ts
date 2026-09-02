import { pgTable, text, integer, date, uuid, timestamp, numeric, uniqueIndex } from "drizzle-orm/pg-core";
import { userTable } from "./auth";

export const recurringPatternsTable = pgTable("recurring_patterns", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => userTable.id, { onDelete: "cascade" }),
  normalizedKey: text("normalized_key").notNull(),
  displayName: text("display_name").notNull(),
  intervalDays: integer("interval_days").notNull(),
  expectedAmount: numeric("expected_amount", { precision: 18, scale: 4 }).notNull(),
  currency: text("currency").notNull(),
  lastOccurrence: date("last_occurrence", { mode: "string" }).notNull(),
  nextExpected: date("next_expected", { mode: "string" }),
  occurrenceCount: integer("occurrence_count").notNull().default(0),
  // 'active' = still firing; 'lapsed' = missed 2+ expected cycles
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("recurring_patterns_user_key_uniq").on(t.userId, t.normalizedKey),
]);
