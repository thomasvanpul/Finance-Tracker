// Source-level lock: the reconciliation snapshot query keeps today's rows.
//
// THE DEFECT BEING LOCKED
//   GET /accounts/reconciliation and the allocation route's Input 4 both
//   read snapshots with `lt(accountBalanceSnapshotsTable.date, today)`.
//   computeReconciliation already refuses a same-day baseline itself
//   (completeBaselineDates skips `date >= today`), so the route filter
//   added nothing except hiding today's snapshot from dataAvailableSince.
//   A user whose only snapshot was today's got dataAvailableSince = null,
//   and the panel told them "No balance snapshot has been taken; the first
//   is written the next time the dashboard loads" — false, and the promised
//   write had already happened (finding 59ce67851bdd, 2026-10-01).
//
// The pure function is covered by lib/reconciliation.test.ts, which passes
// a today-dated snapshot and expects dataAvailableSince to be today. That
// test cannot see a route that never passes the row in, so this lock reads
// the two call sites off disk.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function source(file: string): string {
  return readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8");
}

function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  expect(from, `marker not found: ${start}`).toBeGreaterThanOrEqual(0);
  const to = text.indexOf(end, from);
  expect(to, `marker not found after ${start}: ${end}`).toBeGreaterThan(from);
  return text.slice(from, to);
}

const TODAY_BOUND = /lt\(\s*accountBalanceSnapshotsTable\.date\s*,\s*today\s*\)/;

describe("reconciliation snapshot queries do not drop today's snapshot", () => {
  it("GET /accounts/reconciliation", () => {
    const handler = between(source("accounts.ts"), 'router.get("/accounts/reconciliation"', "computeReconciliation(");
    expect(handler).toContain("accountBalanceSnapshotsTable");
    expect(handler).not.toMatch(TODAY_BOUND);
  });

  it("allocation Input 4", () => {
    const block = between(source("allocation.ts"), "Input 4", "computeReconciliation(");
    expect(block).toContain("accountBalanceSnapshotsTable");
    expect(block).not.toMatch(TODAY_BOUND);
  });
});
