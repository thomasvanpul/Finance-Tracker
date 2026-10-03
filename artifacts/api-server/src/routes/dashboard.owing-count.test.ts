import { describe, it, expect, vi } from "vitest";

// Pure arithmetic — mock only the db import so the module can load
// without DATABASE_URL, exactly as dashboard.net-worth.test.ts does.
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

const { iOweCountFrom } = await import("./dashboard");

// Reproduces finding c3de6954ba50: the seed account on 2026-10-03 had
// three owing rows — Hui Ling (they_owe_me), Priya Nair (i_owe_them),
// Alex Chen (they_owe_me) — and the mobile CLAIMED strip read
// "CLAIMED · 3 DEBTS" above a single Priya Nair row, because the label
// paired totalIOwe (one person's debt) with a count spanning both
// directions. iOweCountFrom is the fix: scoped to i_owe_them only.
describe("iOweCountFrom", () => {
  it("counts only the i_owe_them rows, not the they_owe_me rows mixed in", () => {
    const rows = [
      { direction: "they_owe_me" as const },
      { direction: "i_owe_them" as const },
      { direction: "they_owe_me" as const },
    ];
    expect(iOweCountFrom(rows)).toBe(1);
  });

  it("is 0 when every pending row is owed to the user", () => {
    const rows = [{ direction: "they_owe_me" as const }, { direction: "they_owe_me" as const }];
    expect(iOweCountFrom(rows)).toBe(0);
  });

  it("is 0, not NaN, with no pending rows at all", () => {
    expect(iOweCountFrom([])).toBe(0);
  });

  it("counts every row when all of them are i_owe_them", () => {
    const rows = [{ direction: "i_owe_them" as const }, { direction: "i_owe_them" as const }];
    expect(iOweCountFrom(rows)).toBe(2);
  });
});
