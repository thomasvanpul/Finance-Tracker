import { describe, it, expect, vi } from "vitest";

// Pure arithmetic — mock only the db import so the module can load
// without DATABASE_URL, exactly as dashboard.monthly-fold.test.ts does.
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

const { computeNetWorth } = await import("./dashboard");

// Net worth omitted its liabilities term until 10-Sep: a user who owed
// £2,000 was told they were £2,000 richer than they are, on a figure
// labelled *net* worth in the sidebar footer, the phone shell and every
// KPI bar. These assertions are what stop it being dropped again — the
// route handler itself needs a live DB and Yahoo Finance to exercise,
// so this pure function is where the arithmetic is pinned.

describe("computeNetWorth", () => {
  const base = { totalCash: 10_000, portfolioValueBase: 5_000, totalOwedToMe: 0, totalIOwe: 0 };

  it("sums cash and portfolio when nothing is owed either way", () => {
    expect(computeNetWorth(base)).toBe(15_000);
  });

  it("subtracts what the user owes", () => {
    expect(computeNetWorth({ ...base, totalIOwe: 2_000 })).toBe(13_000);
  });

  it("adds what is owed to the user", () => {
    expect(computeNetWorth({ ...base, totalOwedToMe: 2_000 })).toBe(17_000);
  });

  it("nets the two directions rather than taking the larger", () => {
    expect(computeNetWorth({ ...base, totalOwedToMe: 2_000, totalIOwe: 500 })).toBe(16_500);
  });

  it("goes below the asset total when liabilities exceed receivables", () => {
    const owing = computeNetWorth({ ...base, totalOwedToMe: 100, totalIOwe: 900 });
    expect(owing).toBeLessThan(base.totalCash + base.portfolioValueBase);
    expect(owing).toBe(14_200);
  });

  // The property the term exists for. Creating a debt does not move an
  // account balance; settling one that carries an accountId does
  // (debts.ts:227). So across that transition — cash falls by the amount,
  // the liability leaves `owing` — the total must not move. Measured on
  // the seed account 10-Sep: 230,134.93 → create £100 i_owe_them →
  // 230,034.93 → settle → 230,034.93, cash −100.
  it("is unchanged when a linked debt settles", () => {
    const pending = computeNetWorth({ ...base, totalIOwe: 100 });
    const settled = computeNetWorth({ ...base, totalCash: base.totalCash - 100, totalIOwe: 0 });
    expect(settled).toBe(pending);
  });

  it("is unchanged when a linked receivable settles", () => {
    const pending = computeNetWorth({ ...base, totalOwedToMe: 100 });
    const settled = computeNetWorth({ ...base, totalCash: base.totalCash + 100, totalOwedToMe: 0 });
    expect(settled).toBe(pending);
  });
});
