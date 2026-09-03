// Lock: drizzle's migration journal must have strictly increasing
// `when` values.
//
// ── The defect this catches ──────────────────────────────────────────────
// drizzle decides what to apply by comparing each journal entry's
// `when` against the single most recent row in __drizzle_migrations:
//
//   drizzle-orm/migrator.cjs:55       folderMillis: journalEntry.when
//   drizzle-orm/pg-core/dialect.cjs:64
//     if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis)
//
// The comparison is strict `<` against `order by created_at desc
// limit 1` — the MAX applied timestamp. So any entry whose `when` is
// less than or equal to that maximum is skipped. Not warned about.
// Not errored on. Skipped inside a transaction that then commits,
// after which migrate() resolves and the operator is told
// "migrations applied successfully".
//
// That is exactly what happened on 0015_transfer_group and
// 0016_recurring_patterns: both were generated with `when` values a
// year early (2025-09-03 / 2025-09-04 instead of 2026-09-02), which
// put them below 0014's 1788254078762. `pnpm run migrate` reported
// success twice while applying nothing, and the real state only
// surfaced later as missing columns at boot.
//
// The invariant reduces to "a `when` value that went backwards",
// which is mechanically checkable with no judgement in it. This
// test would have failed 84f4dff before it was pushed.
//
// ── Scope ────────────────────────────────────────────────────────────────
// The source journal under lib/db/ is the one that matters — it is
// what is committed, and build.mjs copies it into
// api-server/dist/drizzle/ verbatim. Checking the source therefore
// covers both.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// src/lib → src → api-server → artifacts → repo root
const JOURNAL_PATH = join(here, "..", "..", "..", "..", "lib", "db", "drizzle", "meta", "_journal.json");

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

// Returns one violation per entry that drizzle would silently skip.
// Strict `>` mirrors the strict `<` in dialect.cjs: an equal `when`
// is skipped too, so equal is a violation, not a tie.
function findNonIncreasing(entries: JournalEntry[]): string[] {
  const violations: string[] = [];
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1]!;
    const cur = entries[i]!;
    if (!(cur.when > prev.when)) {
      violations.push(
        `${cur.tag} (when=${cur.when}) is not after ${prev.tag} (when=${prev.when}) — drizzle will skip it silently`,
      );
    }
  }
  return violations;
}

function loadJournal(): JournalEntry[] {
  return (JSON.parse(readFileSync(JOURNAL_PATH, "utf8")) as { entries: JournalEntry[] }).entries;
}

describe("drizzle migration journal", () => {
  it("has strictly increasing `when` values across every entry", () => {
    const entries = loadJournal();
    // Guard against the check passing because the journal failed to
    // load or is trivially short — a green result on 0 entries would
    // be a vacuous pass.
    expect(entries.length).toBeGreaterThan(1);
    expect(findNonIncreasing(entries)).toEqual([]);
  });

  // The two tests below run against a synthetic journal rather than
  // the real one, so that a genuine regression in lib/db fails
  // exactly one test — the one above — instead of all three.
  const SYNTHETIC: JournalEntry[] = [
    { idx: 0, when: 1000, tag: "0000_first" },
    { idx: 1, when: 2000, tag: "0001_second" },
    { idx: 2, when: 3000, tag: "0002_third" },
  ];

  it("passes a journal that is already strictly increasing", () => {
    expect(findNonIncreasing(SYNTHETIC)).toEqual([]);
  });

  it("catches an entry whose `when` went backwards", () => {
    // Prove the check bites. Without this, a checker that always
    // returned [] would pass the test above.
    const mutated = SYNTHETIC.map((e, i) => (i === 2 ? { ...e, when: 1500 } : e));
    const violations = findNonIncreasing(mutated);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("0002_third");
    expect(violations[0]).toContain("skip it silently");
  });

  it("treats an equal `when` as a violation, not a tie", () => {
    // dialect.cjs uses `<`, so a duplicate timestamp is skipped just
    // as a backwards one is.
    const mutated = SYNTHETIC.map((e, i) => (i === 2 ? { ...e, when: 2000 } : e));
    expect(findNonIncreasing(mutated)).toHaveLength(1);
  });
});
