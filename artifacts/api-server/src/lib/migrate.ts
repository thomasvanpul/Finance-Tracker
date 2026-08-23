// Boot-time database migrations.
//
// ── Why this is in-process rather than a prestart hook ────────────────────
// The natural shape is a `prestart` npm script that runs `drizzle-kit
// migrate` before `node dist/index.mjs`. Two reasons that doesn't work
// here:
//
//   1. drizzle-kit is a DEV dep of @workspace/db, and Render's runtime
//      image runs `pnpm install --prod` (or equivalent) which strips
//      dev deps. drizzle-kit simply isn't there at boot.
//   2. Even if it were, a folded `migrate && node …` start command
//      is a second child process — the ordering guarantee is still
//      what we want, but the observability (structured pino output,
//      exit code) is worse than running the migrator inline.
//
// This module uses `drizzle-orm/node-postgres/migrator` — a runtime
// dep already in api-server's dependencies via drizzle-orm. It reads
// the compiled SQL folder (copied into `dist/drizzle` by build.mjs)
// and applies pending migrations idempotently using the same
// `__drizzle_migrations` state table drizzle-kit does. If already
// applied, it's a no-op that adds ~50ms to boot.
//
// ── Failure behaviour ────────────────────────────────────────────────────
// A migration error THROWS. The caller (index.ts) catches, logs at
// ERROR level with the exact reason, and calls process.exit(1) BEFORE
// app.listen() runs. Render sees the deploy fail and keeps the
// previous instance serving. This is the "loud at deploy time"
// property — no half-migrated server ever accepts traffic.
//
// ── The Aug 2026 backstop for a specific past defect ─────────────────────
// The journal was empty in production while 0000's tables existed —
// almost certainly the outcome of an old force-push that wiped the
// journal file but not the DB. On the recovery run this appeared as
// drizzle-kit wanting to replay the baseline; the operator (Thomas)
// baselined 0000-0002 as applied but found 0001+0002 were actually
// missing, only after 0007 failed on the absent connections table.
//
// The programmatic migrator here has the same limitation on first
// contact with a partially-primed prod: if a table exists but the
// journal doesn't record it, CREATE TABLE runs and fails. The
// verifySchemaAtBoot check (src/lib/verify-schema.ts) is the
// second belt — it introspects information_schema and flags drift
// between the code's expectations and the DB reality, whether or
// not that drift came from a missing migration OR a missing
// journal entry.

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "@workspace/db";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./logger";

export async function migrateAtBoot(): Promise<void> {
  // Migrations folder lives beside the bundled dist. build.mjs copies
  // lib/db/drizzle/ → api-server/dist/drizzle/ so this __dirname-
  // relative resolve is stable across dev + Render + local prod
  // builds. If someone changes the copy target, this path breaks —
  // the throw below will name the missing folder rather than fail
  // silently.
  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = join(here, "drizzle");
  logger.info({ migrationsFolder }, "database migrations: starting");
  const start = process.hrtime.bigint();
  await migrate(db, { migrationsFolder });
  const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
  logger.info({ ms: Math.round(ms) }, "database migrations: complete");
}
