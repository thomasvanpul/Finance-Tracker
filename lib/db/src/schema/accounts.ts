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
    // cash | investment | pension | property | other | liability.
    //
    // A plain text column, NOT a pgEnum, and deliberately left that way:
    // adding `liability` (2026-09-11) needed no migration at all, whereas a
    // pgEnum would have needed ALTER TYPE ... ADD VALUE, which Postgres
    // forbids using in the same transaction that adds it — and drizzle's
    // migrator runs each file in a transaction. The allowed set is enforced
    // at the API boundary by the generated zod enum (lib/api-zod, from
    // lib/api-spec/openapi.yaml), which is where a bad value can actually
    // arrive from.
    //
    // `liability` carries a POSITIVE balance and the type supplies the sign:
    // net worth subtracts it (see computeNetWorth in routes/dashboard.ts). A
    // negative balance on a `cash` account is a genuine OVERDRAFT and is a
    // different thing — collapsing both onto the sign would destroy that
    // distinction permanently, which is why the type exists.
    //
    // Every account predating 2026-08 was Wise-linked or a manually-entered
    // liquid account, so the original migration backfilled all rows to
    // 'cash'. Nothing is re-typed automatically: which of a user's accounts
    // is a liability is the user's judgement, not a heuristic over names.
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
