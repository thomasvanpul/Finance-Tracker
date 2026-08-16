import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { userTable } from "./auth";

// One row per user — created lazily on first settings access.
//
// persona: text column, not an enum, so adding a sixth persona is one
// deploy not two. Runtime values: market | budget | wealth | social |
// full. Default = 'full' — the same "everything visible" preset
// existing users effectively had before persistence, and what anyone
// who skips onboarding gets. See lib/persona.ts on the frontend for
// the runtime meaning of each id.
export const appSettingsTable = pgTable("app_settings", {
  userId: text("user_id").primaryKey().references(() => userTable.id, { onDelete: "cascade" }),
  baseCurrency: text("base_currency").notNull().default("GBP"),
  persona: text("persona").notNull().default("full"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AppSettings = typeof appSettingsTable.$inferSelect;
