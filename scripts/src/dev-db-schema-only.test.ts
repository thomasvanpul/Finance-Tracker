// Lock on the helpers behind scripts/dev-db/reset-dev-schema-only.md.
//
// The failure this guards is a dev database that will not boot, or one that
// quietly still carries real data. A Neon schema-only branch copies prod's
// tables and none of its rows — including the rows of
// drizzle.__drizzle_migrations. With that journal empty the boot migrator
// replays 0000 against tables that already exist and the api-server exits.
// journalRows() rebuilds the journal from lib/db/drizzle, so it has to record
// exactly what drizzle's own migrator would have recorded.
//
// node:test rather than vitest, matching capture-lock.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";

import {
  PROD_DB_HOST,
  diffTables,
  isFakeEmail,
  journalRows,
  primeRefusal,
  refusalFor,
  unknownArgs,
} from "./dev-db-schema-only.js";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(here, "../../lib/db/drizzle");

test("journalRows records what drizzle's migrator would record, in order", () => {
  const expected = readMigrationFiles({ migrationsFolder: MIGRATIONS });

  const rows = journalRows(MIGRATIONS);

  assert.ok(rows.length > 0);
  assert.deepEqual(
    rows.map((r) => ({ hash: r.hash, createdAt: r.createdAt })),
    expected.map((m) => ({ hash: m.hash, createdAt: m.folderMillis })),
  );
});

test("journal timestamps strictly increase — the migrator compares only the newest", () => {
  const rows = journalRows(MIGRATIONS);

  for (let i = 1; i < rows.length; i++) {
    assert.ok(
      rows[i].createdAt > rows[i - 1].createdAt,
      `${rows[i].tag} is not newer than ${rows[i - 1].tag}`,
    );
  }
});

test("journalRows stops at --through, inclusive", () => {
  const all = journalRows(MIGRATIONS);
  const cut = all[2].tag;

  const rows = journalRows(MIGRATIONS, cut);

  assert.equal(rows.length, 3);
  assert.equal(rows.at(-1)?.tag, cut);
});

test("journalRows throws on a tag that is not in the journal", () => {
  assert.throws(() => journalRows(MIGRATIONS, "9999_not_a_migration"), /not in the journal/);
});

test("refusalFor refuses production, pooled or not, and an unset URL", () => {
  assert.match(refusalFor(`postgres://u:p@${PROD_DB_HOST}.eu-west-2.aws.neon.tech/db`) ?? "", /production/);
  assert.match(refusalFor(`postgres://u:p@${PROD_DB_HOST}-pooler.eu-west-2.aws.neon.tech/db`) ?? "", /production/);
  assert.match(refusalFor("") ?? "", /not set/);
});

test("refusalFor accepts any other host", () => {
  assert.equal(refusalFor("postgres://u:p@ep-some-new-branch.eu-west-2.aws.neon.tech/db"), null);
});

test("diffTables names tables on one side only", () => {
  const diff = diffTables(["user", "accounts", "goals"], ["user", "accounts", "legacy_thing"]);

  assert.deepEqual(diff, { missingInDb: ["goals"], notInCode: ["legacy_thing"] });
});

test("isFakeEmail accepts only the seed account and tester<N>", () => {
  assert.equal(isFakeEmail("seed@numeris.local"), true);
  assert.equal(isFakeEmail("tester12@numeris.local"), true);
  assert.equal(isFakeEmail("tester0@numeris.local"), false);
  assert.equal(isFakeEmail("someone@gmail.com"), false);
  assert.equal(isFakeEmail("tester1@numeris.local.evil.com"), false);
});

test("primeRefusal allows priming only an empty database with an empty journal", () => {
  assert.equal(primeRefusal({ nonEmptyTables: [], missingTables: [], journalRowCount: 0 }), null);
});

test("primeRefusal refuses a database that holds rows — it is not the schema-only branch", () => {
  assert.match(primeRefusal({ nonEmptyTables: ["user", "accounts"], missingTables: [], journalRowCount: 0 }) ?? "", /2 tables hold rows/);
});

test("primeRefusal refuses a journal that already has entries", () => {
  assert.match(primeRefusal({ nonEmptyTables: [], missingTables: [], journalRowCount: 27 }) ?? "", /already has 27/);
});

test("primeRefusal refuses a database missing tables the code declares — priming would hide them", () => {
  const refusal = primeRefusal({ nonEmptyTables: [], missingTables: ["user", "goals"], journalRowCount: 0 });

  assert.match(refusal ?? "", /2 tables the code declares are missing/);
});

test("unknownArgs names anything the CLI would otherwise ignore", () => {
  assert.deepEqual(unknownArgs(["--expect=empty", "--prime-journal", "--through=0025_x"]), []);
  assert.deepEqual(unknownArgs(["--expect", "empty"]), ["--expect", "empty"]);
  assert.deepEqual(unknownArgs(["--prime"]), ["--prime"]);
});
