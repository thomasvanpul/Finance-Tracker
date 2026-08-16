import { pgTable, serial, text, numeric, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userTable } from "./auth";

export const accountsTable = pgTable(
  "accounts",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").references(() => userTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    currency: text("currency").notNull().default("GBP"),
    balance: numeric("balance", { precision: 18, scale: 4 }).notNull().default("0"),
    // cash | investment | pension | property | other. Every existing account
    // was Wise-linked or a manually-entered liquid account, so the migration
    // backfills all rows to 'cash' (rationale recorded in the migration's
    // accompanying commit). Users can reclassify later.
    type: text("type").notNull().default("cash"),
    // Wise-specific columns kept for backwards compatibility with the
    // dozen frontend/backend sites that read them. New provider adapters
    // populate externalProvider + externalId (below); the Wise sync path
    // still writes to both.
    isWiseLinked: boolean("is_wise_linked").notNull().default(false),
    wiseProfileId: text("wise_profile_id"),
    wiseBalanceId: text("wise_balance_id").unique(),
    // Provider-agnostic external identity. When the row comes from an
    // adapter sync (any provider), externalProvider is the provider slug
    // and externalId is the provider's account/balance id. Upserts on
    // (userId, externalProvider, externalId) instead of the old
    // Wise-specific wise_balance_id target. Nullable so manually-entered
    // accounts stay unchanged.
    externalProvider: text("external_provider"),
    externalId: text("external_id"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("accounts_user_provider_external_uniq")
      .on(t.userId, t.externalProvider, t.externalId),
  ],
);

export const insertAccountSchema = createInsertSchema(accountsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accountsTable.$inferSelect;
