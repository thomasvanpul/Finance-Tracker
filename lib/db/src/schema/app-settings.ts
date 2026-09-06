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
  // onboardedAt: when the user first answered the onboarding questions,
  // NULL if they never have. It exists because `persona` cannot answer
  // that question: the column is notNull().default("full") and the row
  // is created lazily by ensureSettings() on the first GET, so "never
  // chose" and "deliberately chose full" are the same string over the
  // wire. A brand-new user was being skipped past onboarding onto an
  // empty dashboard as a result.
  //
  // A NULL timestamp says "unknown" in the type system rather than in a
  // convention someone has to remember — the alternative considered was
  // an empty-string persona default, which puts a value outside the
  // OpenAPI enum on the wire and encodes "no answer" as a magic value.
  //
  // Rows that predate migration 0020 were backfilled there to their
  // then-current updated_at, so post-migration NULL means exactly one
  // thing: no choice has been recorded. For those backfilled rows the
  // instant is an approximation of "some time before the migration" —
  // only the non-NULL-ness is load-bearing, and the wire surface is a
  // boolean (PersonaState.onboarded), so the approximate instant is
  // never shown to anyone.
  //
  // Set by setPersona() via COALESCE, so it records the FIRST choice and
  // a later persona change in settings does not overwrite it.
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AppSettings = typeof appSettingsTable.$inferSelect;
