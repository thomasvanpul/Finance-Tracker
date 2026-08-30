// Lock #19 — every post-backfill manual-source transaction must
// carry rate_as_of.
//
// Two layers of enforcement:
//
//   1. Postgres CHECK constraint tx_rate_after_backfill on the
//      transactions table (migration 0012_certain_gladiator.sql).
//      Rejects an INSERT that violates the rule at DB level. This is
//      the runtime bite — nothing sneaks past.
//
//   2. This source-scan test on the schema declaration. Catches
//      "someone silently removed the check() call from
//      lib/db/src/schema/transactions.ts" — a schema change that
//      doesn't emit a migration would be invisible until the
//      constraint was actually dropped by hand. Vitest test runs on
//      every CI, no DB access required.
//
// Live-DB bite proof (does the constraint actually reject a
// violating INSERT?) is a separate concern from source-scan drift
// and lives in scripts/src/verify-tx-rate-lock.ts. Run it on demand
// against dev to confirm the constraint does what its declaration
// says. See that file for the two-way bite (violating insert
// rejected; exempted source accepted).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const SCHEMA_PATH = join(
  dirname(__filename),
  "..", "..", "..", "..",
  "lib", "db", "src", "schema", "transactions.ts",
);

const CUTOFF = "2026-08-30T12:31:52Z";

describe("Lock #19 · tx_rate_after_backfill — schema declaration is intact", () => {
  const source = readFileSync(SCHEMA_PATH, "utf8");

  it("declares check(\"tx_rate_after_backfill\", ...) on transactionsTable", () => {
    expect(source).toMatch(/check\(\s*"tx_rate_after_backfill"/);
  });

  it("uses the actual prod-backfill cutoff timestamp — not a hand-edited one", () => {
    // Cutoff is the wall-clock timestamp of the prod backfill run
    // (captured in the backfill commit; embedded literally in the
    // check() body). If someone changes it, either a new backfill
    // run happened and this test should be updated to match, or
    // someone weakened the lock — either way, the deliberate change
    // gets a visible diff.
    expect(source).toContain(`'${CUTOFF}'::timestamptz`);
  });

  it("exempts historical-import sources via source <> 'manual'", () => {
    // Only manual-source rows are required to carry rate_as_of at
    // insert time. Adapter/CSV writes intentionally leave both
    // columns null; they get backfilled from Frankfurter historical
    // keyed on tx.date. Weakening this exemption to include manual
    // would break every CSV import; tightening it (removing the
    // exemption) would require rewriting the import paths.
    expect(source).toMatch(/source\s*<>\s*'manual'/);
  });

  it("requires rate_as_of IS NOT NULL for post-cutoff manual rows", () => {
    // The rate itself may be null (FX outage at write time), but
    // rate_as_of MUST be set — it proves snapshotFxRate was called.
    // A row created after the cutoff with source='manual' and
    // rate_as_of IS NULL means either snapshotFxRate wasn't called
    // OR someone bypassed the write path entirely.
    expect(source).toMatch(/rate_as_of\s+IS\s+NOT\s+NULL/);
  });

  it("keeps the LOCK_19_CUTOFF constant documented next to the check", () => {
    // Cutoff has to be readable in one place, next to the reason
    // it's that specific value. Don't split them.
    expect(source).toContain("LOCK_19_CUTOFF");
    expect(source).toContain(CUTOFF);
  });
});
