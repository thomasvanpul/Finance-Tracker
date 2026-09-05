import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { userTable } from "./auth";

// Account-level UI preferences that used to live only in localStorage
// (BACKLOG § G20/B — "the stranded keys"). One row per (user, key); the
// value is the same string the client keeps in localStorage, so the
// server never needs to know the shape of any single preference and a
// new account-level key is a client-side classification change, not a
// migration.
//
// Not for money. Balances, transactions and everything the API
// computes from them live in their own tables; this table holds what
// the user chose (dashboard layout, notes on transactions, alert
// rules, tax country …) and follows them from laptop to phone.
//
// Device-local keys (density, mask mode, sidebar width, caches) never
// come here — see artifacts/finance-tracker/src/lib/account-storage.ts
// for the classification and the lock test that enforces it.
export const userPreferencesTable = pgTable(
  "user_preferences",
  {
    userId: text("user_id").notNull().references(() => userTable.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export type UserPreference = typeof userPreferencesTable.$inferSelect;
