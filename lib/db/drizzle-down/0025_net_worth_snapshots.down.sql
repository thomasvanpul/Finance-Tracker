-- Reverses drizzle/0025_net_worth_snapshots.sql.
--
-- drizzle-kit writes no down migrations, and the boot migrator
-- (api-server lib/migrate.ts) only moves forward, so this is run by hand:
--   psql "$DATABASE_URL" -f lib/db/drizzle-down/0025_net_worth_snapshots.down.sql
-- Then remove 0025 from drizzle/ and meta/_journal.json, or the next boot
-- applies it again.
--
-- It drops every captured day of net-worth history. That history cannot be
-- rebuilt: nothing else recorded it.
--
-- The DELETE removes the migrator's record of 0025, matched by the journal's
-- `when` for this migration. The migrator applies whatever is newer than its
-- latest record, so without it a re-run of 0025 would be skipped.

BEGIN;
DROP TABLE IF EXISTS "net_worth_snapshots";
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1790881993935;
COMMIT;
