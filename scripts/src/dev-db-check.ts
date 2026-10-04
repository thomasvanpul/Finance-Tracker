// What is actually in the database DATABASE_URL points at — the checks behind
// scripts/dev-db/reset-dev-schema-only.md (BACKLOG § I10).
//
//   pnpm --filter @workspace/scripts run dev-db:check
//       Report only: row count per table, tables on one side of code/DB only,
//       migration-journal rows. Reads, never writes.
//   … dev-db:check --expect=empty
//       Exit 1 unless every table holds zero rows. Run on a new schema-only
//       branch before anything is seeded: it is the proof no data came across.
//   … dev-db:check --expect=fake-users
//       Exit 1 unless every user.email is one the seed scripts create. Prints
//       counts, never an address.
//   … dev-db:check --prime-journal [--through=<migration tag>]
//       The one write. A schema-only branch copies prod's tables and none of
//       its rows, so drizzle.__drizzle_migrations arrives empty and
//       migrateAtBoot would replay 0000 onto tables that exist (api-server
//       lib/migrate.ts, "journal wiped but tables present"). This records the
//       migrations as applied, exactly as drizzle would have. Refuses unless
//       every table the code declares is present, every table is empty, AND
//       the journal is empty.
//
// The table list comes from the database and from @workspace/db's exports at
// run time — never from a list written down here.
//
// Refuses production outright. Any other host is allowed: the new branch's
// host is not known until Neon creates it.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

import {
  diffTables,
  isFakeEmail,
  journalRows,
  primeRefusal,
  refusalFor,
  unknownArgs,
} from "./dev-db-schema-only.js";

const JOURNAL_SCHEMA = "drizzle";
const JOURNAL_TABLE = "__drizzle_migrations";

type Expect = "empty" | "fake-users" | undefined;

interface Args {
  expect: Expect;
  primeJournal: boolean;
  through: string | undefined;
}

interface TableCount {
  schema: string;
  table: string;
  rows: number;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const expect = args.find((a) => a.startsWith("--expect="))?.split("=")[1];
  const unknown = unknownArgs(args);
  if (unknown.length > 0) console.error(`[dev-db] unrecognised: ${unknown.join(" ")}`);
  if (unknown.length > 0 || (expect !== undefined && expect !== "empty" && expect !== "fake-users")) {
    console.error("Usage: dev-db-check [--expect=empty|fake-users] [--prime-journal [--through=<tag>]]");
    process.exit(1);
  }
  return {
    expect,
    primeJournal: args.includes("--prime-journal"),
    through: args.find((a) => a.startsWith("--through="))?.split("=")[1],
  };
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function isJournal(t: TableCount): boolean {
  return t.schema === JOURNAL_SCHEMA && t.table === JOURNAL_TABLE;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const url = process.env.DATABASE_URL ?? "";
  const refusal = refusalFor(url);
  if (refusal) {
    console.error(`[dev-db] refusing to run — ${refusal}`);
    process.exit(1);
  }
  console.log(`[dev-db] target host: ${new URL(url).hostname}`);

  // Imported after the guard: @workspace/db opens its pool at import.
  const dbModule = await import("@workspace/db");
  const { pool } = dbModule;

  try {
    const { rows: found } = await pool.query<{ table_schema: string; table_name: string }>(
      `SELECT table_schema, table_name FROM information_schema.tables
        WHERE table_type = 'BASE TABLE'
          AND table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name`,
    );
    const counts: TableCount[] = [];
    for (const t of found) {
      const { rows } = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${quoteIdent(t.table_schema)}.${quoteIdent(t.table_name)}`,
      );
      counts.push({ schema: t.table_schema, table: t.table_name, rows: rows[0].n });
    }

    const journalRowCount = counts.find(isJournal)?.rows ?? 0;
    const dataTables = counts.filter((t) => !isJournal(t));
    const nonEmpty = dataTables.filter((t) => t.rows > 0);
    const inCode = (Object.values(dbModule) as unknown[])
      .filter((v): v is PgTable => is(v, PgTable))
      .map((t) => getTableName(t));
    const inDb = counts.filter((t) => t.schema === "public").map((t) => t.table);
    const diff = diffTables(inCode, inDb);

    for (const t of dataTables) {
      console.log(`[dev-db]   ${`${t.schema}.${t.table}`.padEnd(44)} ${t.rows}`);
    }
    console.log(
      `[dev-db] ${dataTables.length} tables, ${nonEmpty.length} holding rows; ` +
        `${inCode.length} tables in code; journal rows: ${journalRowCount}`,
    );
    if (diff.missingInDb.length > 0) {
      console.log(`[dev-db] in code, missing from this database: ${diff.missingInDb.join(", ")}`);
    }
    if (diff.notInCode.length > 0) {
      console.log(`[dev-db] in this database, not in code: ${diff.notInCode.join(", ")}`);
    }

    let failed = false;

    if (args.expect === "empty") {
      if (nonEmpty.length > 0) {
        console.error(`[dev-db] FAIL --expect=empty: ${nonEmpty.length} tables hold rows`);
        failed = true;
      } else {
        console.log(`[dev-db] OK --expect=empty: 0 rows in all ${dataTables.length} tables`);
      }
    }

    if (args.expect === "fake-users") {
      const { rows } = await pool.query<{ email: string }>(`SELECT email FROM "user"`);
      const real = rows.filter((r) => !isFakeEmail(r.email)).length;
      if (real > 0) {
        console.error(
          `[dev-db] FAIL --expect=fake-users: ${real} of ${rows.length} users are not seed or tester accounts`,
        );
        failed = true;
      } else {
        console.log(`[dev-db] OK --expect=fake-users: all ${rows.length} users are seed or tester accounts`);
      }
    }

    if (args.primeJournal) {
      const refusalToPrime = primeRefusal({
        nonEmptyTables: nonEmpty.map((t) => `${t.schema}.${t.table}`),
        missingTables: diff.missingInDb,
        journalRowCount,
      });
      if (refusalToPrime) {
        console.error(`[dev-db] refusing --prime-journal — ${refusalToPrime}`);
        failed = true;
      } else {
        const here = dirname(fileURLToPath(import.meta.url));
        const entries = journalRows(join(here, "../../lib/db/drizzle"), args.through);
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          // Same DDL drizzle's own migrator runs (pg-core/dialect.js migrate()).
          await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(JOURNAL_SCHEMA)}`);
          await client.query(
            `CREATE TABLE IF NOT EXISTS ${quoteIdent(JOURNAL_SCHEMA)}.${quoteIdent(JOURNAL_TABLE)} (
               id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
          );
          for (const e of entries) {
            await client.query(
              `INSERT INTO ${quoteIdent(JOURNAL_SCHEMA)}.${quoteIdent(JOURNAL_TABLE)} ("hash", "created_at")
               VALUES ($1, $2)`,
              [e.hash, e.createdAt],
            );
          }
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
        console.log(
          `[dev-db] primed journal: ${entries.length} migrations recorded, through ${entries.at(-1)?.tag}`,
        );
      }
    }

    if (failed) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[dev-db] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
