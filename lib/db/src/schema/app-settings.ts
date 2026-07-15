import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

// Singleton table — this app is single-user, so there's exactly one row (id=1),
// created lazily on first password change or 2FA setup. Until that row exists,
// auth falls back to the APP_PASSWORD env var (see lib/auth.ts).
export const appSettingsTable = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  passwordHash: text("password_hash").notNull(), // bcrypt
  totpSecret: text("totp_secret"), // base32, set once 2FA setup begins (before confirmed)
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  backupCodesHash: text("backup_codes_hash"), // JSON array of bcrypt hashes, one-time use
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AppSettings = typeof appSettingsTable.$inferSelect;
