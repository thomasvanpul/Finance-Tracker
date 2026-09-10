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

const { spendableCashTotal } = await import("./dashboard");

// netLiquidity was built on totalCash until 11-Sep, and totalCash counts
// EVERY account type. Measured on the seed account against the live
// endpoint on 2026-09-11: /dashboard.netLiquidity read 213,217.97 while
// /allocation.availableNow — same user, same instant, cash accounts only —
// read 11,375.28. The 203,070.75 difference was a Kuala Lumpur flat
// (MYR 850,000, type `property`), a SIPP (£27,500), an ISA (£14,200), and a
// season-ticket LOAN of £6,800 — which sat in type `other` until 2026-09-11
// and was being counted as money in hand. That loan is type `liability`
// below; spendableCashTotal's answer is unchanged by the re-typing, which is
// itself one of the assertions.
//
// The seed breakdown below is the real one, so the numbers in these
// assertions are the numbers the endpoint returned.

const SEED_BREAKDOWN = [
  { type: "cash", baseEquivalent: 2450.30 },        // Monzo Current, GBP
  { type: "cash", baseEquivalent: 8100.00 },        // Barclays Savings, GBP
  { type: "cash", baseEquivalent: 464.92 },         // Wise EUR
  { type: "cash", baseEquivalent: 360.06 },         // Maybank MYR
  { type: "investment", baseEquivalent: 14200.00 }, // Vanguard ISA
  { type: "pension", baseEquivalent: 27500.00 },    // Aviva SIPP
  { type: "property", baseEquivalent: 154570.75 },  // Flat, Kuala Lumpur
  { type: "liability", baseEquivalent: 6800.00 },   // Season ticket loan
];

describe("spendableCashTotal", () => {
  it("counts only cash accounts, matching /allocation.availableNow on the seed data", () => {
    expect(spendableCashTotal(SEED_BREAKDOWN)).toBeCloseTo(11_375.28, 2);
  });

  it("excludes property, pension and investment — the net-worth-only types", () => {
    const cashOnly = SEED_BREAKDOWN.filter((a) => a.type === "cash");
    expect(spendableCashTotal(SEED_BREAKDOWN)).toBeCloseTo(spendableCashTotal(cashOnly), 2);
  });

  it("does not let a liability add to spendable cash", () => {
    // The loan carries a POSITIVE balance — the `liability` type supplies the
    // sign, net worth subtracts it, and spendable cash ignores it entirely.
    // Any total that included it would be made larger by a debt. This is the
    // assertion that matters most.
    const withoutLoan = SEED_BREAKDOWN.filter((a) => a.type !== "liability");
    expect(spendableCashTotal(SEED_BREAKDOWN)).toBe(spendableCashTotal(withoutLoan));
  });

  it("does not let a liability SUBTRACT from spendable cash either", () => {
    // The other direction, and the easier one to get wrong when the
    // liability term lands in net worth. A season-ticket loan does not
    // reduce what can move this month; only an overdraft does, and an
    // overdraft is a negative `cash` balance, asserted below.
    const loanOnly = [{ type: "liability", baseEquivalent: 6800.00 }];
    expect(spendableCashTotal(loanOnly)).toBe(0);
  });

  it("counts an overdrawn cash account as negative spendable cash", () => {
    // The distinction the `liability` type exists to preserve: same
    // magnitude, opposite treatment here. See dashboard.liability.test.ts.
    expect(spendableCashTotal([{ type: "cash", baseEquivalent: -250 }])).toBe(-250);
  });

  it("treats an unconvertible cash account as contributing nothing, not NaN", () => {
    const rows = [{ type: "cash", baseEquivalent: 100 }, { type: "cash", baseEquivalent: null }];
    expect(spendableCashTotal(rows)).toBe(100);
  });

  it("is 0, not NaN, when there are no accounts at all", () => {
    expect(spendableCashTotal([])).toBe(0);
  });
});
