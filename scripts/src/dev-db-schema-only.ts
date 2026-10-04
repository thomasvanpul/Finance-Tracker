// Pure helpers for scripts/dev-db/reset-dev-schema-only.md (BACKLOG § I10).
//
// No *live* database import here — @workspace/db's main entry throws at
// import without DATABASE_URL, and these are what dev-db-schema-only.test.ts
// locks. @workspace/db/hosts is a side-effect-free subpath (just the two
// branch hostnames), so importing it does not need DATABASE_URL set. The CLI
// that touches a database is dev-db-check.ts.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { PROD_DB_HOST } from "@workspace/db/hosts";

export { PROD_DB_HOST };

// Every account the seed scripts create: seed-credentials.ts SEED_EMAIL and
// seed-testers.ts TESTER_EMAIL_RE. Any other address is a real person's.
const SEED_EMAIL = "seed@numeris.local";
const TESTER_EMAIL_RE = /^tester[1-9][0-9]*@numeris\.local$/;

export interface JournalRow {
  tag: string;
  hash: string;
  createdAt: number;
}

interface JournalEntry {
  tag: string;
  when: number;
}

/** Why this DATABASE_URL must not be touched, or null when it may be. */
export function refusalFor(databaseUrl: string): string | null {
  if (!databaseUrl) return "DATABASE_URL is not set";
  if (databaseUrl.includes(PROD_DB_HOST)) {
    return `DATABASE_URL points at production ("${PROD_DB_HOST}")`;
  }
  return null;
}

/**
 * The rows drizzle's migrator would have written to
 * drizzle.__drizzle_migrations had it applied every migration up to and
 * including `through` (default: all of them). Hash and timestamp come from
 * drizzle's own readMigrationFiles, so they cannot drift from what the boot
 * migrator compares against.
 */
export function journalRows(migrationsFolder: string, through?: string): JournalRow[] {
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, "meta/_journal.json"), "utf8"),
  ) as { entries: JournalEntry[] };
  const files = readMigrationFiles({ migrationsFolder });

  const rows = journal.entries.map((entry, i) => {
    if (files[i].folderMillis !== entry.when) {
      throw new Error(`journal entry ${entry.tag} does not line up with its migration file`);
    }
    return { tag: entry.tag, hash: files[i].hash, createdAt: entry.when };
  });
  if (through === undefined) return rows;

  const last = rows.findIndex((r) => r.tag === through);
  if (last === -1) throw new Error(`--through=${through} is not in the journal`);
  return rows.slice(0, last + 1);
}

/**
 * Why the journal must not be primed, or null when it may be. Priming tells
 * the boot migrator "every migration is applied"; that is only true of a
 * database whose tables came from a schema-only copy and hold nothing yet.
 */
export function primeRefusal(state: {
  nonEmptyTables: readonly string[];
  missingTables: readonly string[];
  journalRowCount: number;
}): string | null {
  if (state.journalRowCount > 0) {
    return `the migration journal already has ${state.journalRowCount} rows — nothing to prime`;
  }
  // A database with no schema would pass the emptiness check; priming it
  // would tell the migrator to create nothing, ever.
  if (state.missingTables.length > 0) {
    return `${state.missingTables.length} tables the code declares are missing — this is not a schema copy`;
  }
  if (state.nonEmptyTables.length > 0) {
    return `${state.nonEmptyTables.length} tables hold rows — this is not a fresh schema-only branch`;
  }
  return null;
}

export function diffTables(
  inCode: readonly string[],
  inDb: readonly string[],
): { missingInDb: string[]; notInCode: string[] } {
  return {
    missingInDb: inCode.filter((t) => !inDb.includes(t)),
    notInCode: inDb.filter((t) => !inCode.includes(t)),
  };
}

export function isFakeEmail(email: string): boolean {
  return email === SEED_EMAIL || TESTER_EMAIL_RE.test(email);
}

const KNOWN_ARG_RE = /^--(expect=.+|prime-journal|through=.+)$/;

/** Arguments the CLI does not recognise. `--expect empty` must not pass as "no expectation". */
export function unknownArgs(args: readonly string[]): string[] {
  return args.filter((a) => !KNOWN_ARG_RE.test(a));
}
