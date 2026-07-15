import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { userTable } from "./auth";

// One row per user — created lazily on first settings access.
export const appSettingsTable = pgTable("app_settings", {
  userId: text("user_id").primaryKey().references(() => userTable.id, { onDelete: "cascade" }),
  baseCurrency: text("base_currency").notNull().default("GBP"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AppSettings = typeof appSettingsTable.$inferSelect;
