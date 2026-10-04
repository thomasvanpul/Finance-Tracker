-- Reverses drizzle/0028_fx_rates.sql.
--
-- drizzle-kit writes no down migrations, and the boot migrator
-- (api-server lib/migrate.ts) only moves forward, so this is run by hand:
--   psql "$DATABASE_URL" -f lib/db/drizzle-down/0028_fx_rates.down.sql
-- Then remove 0028 from drizzle/ and meta/_journal.json, or the next boot
-- applies it again, and remove lib/db/src/schema/fx-rates.ts and its line in
-- schema/index.ts.
--
-- Drops the stored fixings. Each is re-fetchable from Frankfurter's
-- historical endpoint by date, so nothing is lost that cannot be rebuilt.

BEGIN;
DROP TABLE "fx_rates";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1791139681601;
COMMIT;
