-- Reverses drizzle/0026_drop_totp_credential.sql.
--
-- drizzle-kit writes no down migrations, and the boot migrator
-- (api-server lib/migrate.ts) only moves forward, so this is run by hand:
--   psql "$DATABASE_URL" -f lib/db/drizzle-down/0026_drop_totp_credential.down.sql
-- Then remove 0026 from drizzle/ and meta/_journal.json, or the next boot
-- applies it again, and restore totpTable in lib/db/src/schema/auth.ts.
--
-- It recreates the table empty. Nothing in production ever wrote to it (the
-- live TOTP second factor is better-auth's twoFactor plugin, in two_factor),
-- so an empty table is the state it was dropped in. DDL copied from 0000.
--
-- The DELETE removes the migrator's record of 0026, matched by the journal's
-- `when` for this migration.

BEGIN;
CREATE TABLE "totp_credential" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"secret" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "totp_credential_user_id_unique" UNIQUE("user_id")
);
ALTER TABLE "totp_credential" ADD CONSTRAINT "totp_credential_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1790997062732;
COMMIT;
