// Lock on the FX-miss null propagation in the 12-month history fold.
//
// The bug: dashboard/monthlyHistory.income was `number` (not nullable),
// so a month with any unconvertible transaction rendered as £0 —
// indistinguishable from "no transactions this month". Same class as
// the RM 4,120 → £4,120 bug that pnum-invariant guards against for
// individual figures. A £0 income month reads as "nothing happened"
// when the reality is "we don't know the true income because we can't
// convert some of it."
//
// Both the pre-parallelisation code (per-tx `continue` on null gbp)
// AND the post-parallelisation code (skip null buckets) had this
// defect — the aggregation collapse just made it slightly more
// obvious.
//
// The test locks THREE cases in the fold contract:
//   (a) Month with all convertible buckets → summed numbers.
//   (b) Month with any null bucket → null (poisons the whole month).
//   (c) Month with no buckets at all → not present in map (caller
//       emits 0 as the honest "nothing happened" number).

import { describe, it, expect, vi } from "vitest";

// The fold reads no external state — pure function. Mock only the db
// import so the module can load without DATABASE_URL.
vi.mock("@workspace/db", () => ({
  db: {},
  accountsTable: {},
  transactionsTable: {},
  investmentsTable: {},
  upcomingTable: {},
  debtsTable: {},
  nwSnapshotsTable: {},
  sharedExpensesTable: {},
  sharedExpenseParticipantsTable: {},
  userTable: {},
}));

const { foldMonthlyConverted } = await import("./dashboard");

describe("foldMonthlyConverted · FX-miss propagation", () => {
  it("(a) month with all convertible buckets → summed", () => {
    const m = foldMonthlyConverted([
      { month: "2026-07", type: "income",  gbp: 3000 },
      { month: "2026-07", type: "expense", gbp: 800  },
      { month: "2026-07", type: "expense", gbp: 200  },
    ]);
    expect(m.get("2026-07")).toEqual({ income: 3000, expenses: 1000 });
  });

  it("(b) month with any single null bucket → whole month is null, not partial totals", () => {
    // A user with USD salary (converts fine) and one MYR expense
    // (MYR/GBP rate missing). The old code silently dropped the MYR
    // and emitted { income: 3000, expenses: 500 } as if MYR wasn't
    // there. The fold must emit null instead.
    const m = foldMonthlyConverted([
      { month: "2026-07", type: "income",  gbp: 3000 },
      { month: "2026-07", type: "expense", gbp: 500  },
      { month: "2026-07", type: "expense", gbp: null }, // MYR, FX missing
    ]);
    expect(
      m.get("2026-07"),
      "A month with any unconvertible bucket must be null, not a partial sum. " +
      "£3000 income shown when the true income might be £3000 + the unconvertible MYR is a fabricated figure — " +
      "the pnum invariant applied at the month level.",
    ).toBeNull();
  });

  it("(b) null bucket arriving FIRST poisons subsequent convertible buckets in the same month", () => {
    // Bucket order out of SQL is unstable; the fold must not depend on it.
    const m = foldMonthlyConverted([
      { month: "2026-07", type: "expense", gbp: null }, // null first
      { month: "2026-07", type: "income",  gbp: 3000 },
      { month: "2026-07", type: "expense", gbp: 500  },
    ]);
    expect(m.get("2026-07")).toBeNull();
  });

  it("(b) a null in one month does NOT poison other months", () => {
    const m = foldMonthlyConverted([
      { month: "2026-07", type: "income",  gbp: 3000 },
      { month: "2026-08", type: "expense", gbp: null },
      { month: "2026-09", type: "income",  gbp: 4000 },
      { month: "2026-09", type: "expense", gbp: 500 },
    ]);
    expect(m.get("2026-07")).toEqual({ income: 3000, expenses: 0 });
    expect(m.get("2026-08")).toBeNull();
    expect(m.get("2026-09")).toEqual({ income: 4000, expenses: 500 });
  });

  it("(c) month with zero buckets → NOT emitted, caller distinguishes from null", () => {
    // The distinction lets the handler emit an honest £0 for months
    // with no transactions vs. explicit null for months that had
    // transactions we couldn't convert. `has(month)` is the signal.
    const m = foldMonthlyConverted([
      { month: "2026-07", type: "income", gbp: 100 },
    ]);
    expect(m.has("2026-06")).toBe(false);
    expect(m.has("2026-07")).toBe(true);
    // Sanity check the has/get semantic used by the handler.
    expect(m.get("2026-06")).toBeUndefined();
  });

  it("empty input → empty map", () => {
    expect(foldMonthlyConverted([]).size).toBe(0);
  });
});
