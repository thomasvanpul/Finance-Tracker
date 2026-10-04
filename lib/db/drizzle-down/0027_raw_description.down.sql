-- Reverses drizzle/0027_raw_description.sql.
--
-- drizzle-kit writes no down migrations, and the boot migrator
-- (api-server lib/migrate.ts) only moves forward, so this is run by hand:
--   psql "$DATABASE_URL" -f lib/db/drizzle-down/0027_raw_description.down.sql
-- Then remove 0027 from drizzle/ and meta/_journal.json, or the next boot
-- applies it again, and remove rawDescription from
-- lib/db/src/schema/transactions.ts.
--
-- This DROPS the bank strings stored since 0027. They exist nowhere else.
--
-- The DELETE removes the migrator's record of 0027, matched by the journal's
-- `when` for this migration.

BEGIN;
ALTER TABLE "transactions" DROP COLUMN "raw_description";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1791139201362;
COMMIT;
