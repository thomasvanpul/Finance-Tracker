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
//
// theme: text column, same reasoning — not enumerated so a new theme
// is a one-deploy change. Runtime values are the FintrackTheme union
// in contexts/theme-context.tsx. Default = 'void' — the signed-out
// first-impression default; a signed-in user's stored value overrides.
export const appSettingsTable = pgTable("app_settings", {
  userId: text("user_id").primaryKey().references(() => userTable.id, { onDelete: "cascade" }),
  baseCurrency: text("base_currency").notNull().default("GBP"),
  persona: text("persona").notNull().default("full"),
  theme: text("theme").notNull().default("void"),
  // tabSlot: the one user-chosen position in the phone tab bar
  // (HOME · WORTH · [slot] · DIRECTORY). NULL = no override, follow the
  // persona default. Text, not an enum, for the same one-deploy reason
  // as persona. Runtime values: spending | markets | upcoming | owing |
  // watchlist — see artifacts/finance-tracker/src/lib/tab-slot.ts.
  // Account-level on purpose: a nav choice that did not follow the user
  // from laptop to phone would be one more stranded localStorage key
  // (BACKLOG § G20).
  tabSlot: text("tab_slot"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AppSettings = typeof appSettingsTable.$inferSelect;
