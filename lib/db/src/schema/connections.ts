import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userTable } from "./auth";

// Per-user connection to a data provider (Wise, IBKR, Alpaca, an
// open-banking aggregator, …). One connection per user per provider is
// the initial constraint; a user with two Wise personas can be modelled
// later by lifting the unique index.
//
// The credential itself never lives in a column of its own — the
// encrypted blob is the only representation. See
// artifacts/api-server/src/lib/crypto.ts for the wire format
// (base64(iv || ciphertext || authTag), AES-256-GCM).
export const connectionsTable = pgTable(
  "connections",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    // Provider slug — "wise" for now; more added as adapters land.
    provider: text("provider").notNull(),
    // Human label the user gives the connection. Not necessarily unique.
    label: text("label").notNull(),
    // pending: created, awaiting first sync
    // active:  last sync succeeded
    // error:   last sync failed (see lastError)
    // revoked: user or provider revoked; credential unusable
    status: text("status").notNull().default("pending"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    // Last human-readable error surfaced to the user. Provider details
    // that could leak the credential are stripped by the adapter layer
    // before they reach this field.
    lastError: text("last_error"),
    // Encrypted at rest. base64 of iv||ciphertext||authTag.
    credentialCiphertext: text("credential_ciphertext").notNull(),
    // H5: file adapter carries metadata about the import source
    // instead of a live credential. `institution` names the source
    // (e.g. "monzo", "hsbc", "maybank"), `format` names the file
    // format (e.g. "csv", "ofx"). Both null for pull-adapters (Wise,
    // Alpaca, Kraken) where the credential is the source of identity.
    // A file connection still uses credentialCiphertext to satisfy
    // the not-null constraint — it stores the encrypted institution
    // slug so no plaintext identifier hits disk.
    institution: text("institution"),
    format: text("format"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("connections_user_provider_uniq").on(t.userId, t.provider)],
);

export const insertConnectionSchema = createInsertSchema(connectionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertConnection = z.infer<typeof insertConnectionSchema>;
export type Connection = typeof connectionsTable.$inferSelect;
