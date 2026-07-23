import { pgTable, serial, text, numeric, timestamp, json } from "drizzle-orm/pg-core";
import { userTable } from "./auth";

export interface GoalHistoryEntry {
  date: string;
  amount: number;
}

export const goalsTable = pgTable("goals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => userTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  target: numeric("target", { precision: 18, scale: 4 }).notNull(),
  current: numeric("current", { precision: 18, scale: 4 }).notNull().default("0"),
  deadline: text("deadline"),
  emoji: text("emoji"),
  color: text("color"),
  image: text("image"),
  monthlyContribution: numeric("monthly_contribution", { precision: 18, scale: 4 }),
  history: json("history").$type<GoalHistoryEntry[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Goal = typeof goalsTable.$inferSelect;
