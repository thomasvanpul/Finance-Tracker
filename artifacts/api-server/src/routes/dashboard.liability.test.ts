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

const { assetAccountsTotal, liabilityAccountsTotal, spendableCashTotal, computeNetWorth } =
  await import("./dashboard");

// accountsTable.type had no liability member until 2026-09-11, so a loan was
// entered as `other` with a POSITIVE balance and net worth was made LARGER by
// a debt. Correcting the type moves net worth by TWICE the balance, because
// the term goes from +6,800 to -6,800. The live before/after measurement on
// the seed account is recorded in .review/report.md.
//
// The account breakdown below is the seed account's real one (the GBP
// equivalents are the ones /dashboard returned on 2026-09-11), so the
// assertions here are pinned to real rows rather than invented ones.

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

describe("assetAccountsTotal / liabilityAccountsTotal", () => {
  it("splits the seed breakdown into assets and the one liability", () => {
    expect(assetAccountsTotal(SEED_BREAKDOWN)).toBeCloseTo(207_646.03, 2);
    expect(liabilityAccountsTotal(SEED_BREAKDOWN)).toBeCloseTo(6_800.00, 2);
  });

  it("partitions exactly — every row lands in one side and no row in both", () => {
    const everything = SEED_BREAKDOWN.reduce((s, a) => s + (a.baseEquivalent ?? 0), 0);
    expect(assetAccountsTotal(SEED_BREAKDOWN) + liabilityAccountsTotal(SEED_BREAKDOWN))
      .toBeCloseTo(everything, 2);
  });

  it("returns the liability as a POSITIVE magnitude for the caller to subtract", () => {
    // Two negations — one in the helper and one at a call site that also
    // negated — is how the sign of a debt gets flipped back by accident.
    expect(liabilityAccountsTotal(SEED_BREAKDOWN)).toBeGreaterThan(0);
  });

  it("treats an unconvertible row as contributing nothing, not NaN", () => {
    expect(assetAccountsTotal([{ type: "cash", baseEquivalent: null }])).toBe(0);
    expect(liabilityAccountsTotal([{ type: "liability", baseEquivalent: null }])).toBe(0);
  });

  it("is 0, not NaN, when there are no accounts at all", () => {
    expect(assetAccountsTotal([])).toBe(0);
    expect(liabilityAccountsTotal([])).toBe(0);
  });
});

// ── The distinction the whole decision rests on ─────────────────────────────
// A negative balance on a `cash` account is an OVERDRAFT. A positive balance
// on a `liability` account is a LOAN. Thomas chose the type-carries-the-sign
// design over storing negative balances precisely so these stay
// distinguishable, and this block is what stops a future refactor collapsing
// them onto the sign "for simplicity".

describe("an overdraft is not a liability", () => {
  const OVERDRAWN = [{ type: "cash", baseEquivalent: -6800.00 }];
  const LOAN = [{ type: "liability", baseEquivalent: 6800.00 }];

  it("leaves an overdrawn cash account on the ASSET side, negative", () => {
    expect(assetAccountsTotal(OVERDRAWN)).toBe(-6800);
    expect(liabilityAccountsTotal(OVERDRAWN)).toBe(0);
  });

  it("does not let a negative cash balance be mistaken for a liability", () => {
    // The naive "negative means debt" heuristic would put this row in
    // liabilityAccountsTotal. It must not.
    expect(liabilityAccountsTotal(OVERDRAWN)).not.toBe(6800);
  });

  it("counts an overdraft against spendable cash, and a loan not at all", () => {
    // SAME magnitude, DIFFERENT answer. An overdrawn current account really
    // does reduce what can move this month; a season-ticket loan does not
    // move netLiquidity in either direction.
    expect(spendableCashTotal(OVERDRAWN)).toBe(-6800);
    expect(spendableCashTotal(LOAN)).toBe(0);
  });

  it("gives the two the SAME effect on net worth", () => {
    const asOverdraft = computeNetWorth({
      totalCash: assetAccountsTotal(OVERDRAWN),
      totalLiabilities: liabilityAccountsTotal(OVERDRAWN),
      portfolioValueBase: 0, totalOwedToMe: 0, totalIOwe: 0,
    });
    const asLoan = computeNetWorth({
      totalCash: assetAccountsTotal(LOAN),
      totalLiabilities: liabilityAccountsTotal(LOAN),
      portfolioValueBase: 0, totalOwedToMe: 0, totalIOwe: 0,
    });
    expect(asOverdraft).toBe(-6800);
    expect(asLoan).toBe(-6800);
    expect(asLoan).toBe(asOverdraft);
  });
});

// ── The seed account, end to end through the pure functions ─────────────────

describe("the seed account's £6,800 season ticket loan", () => {
  // Zero, because these assertions are all DELTAS: the portfolio term is
  // identical on both sides of every subtraction below and cancels. The seed
  // account does hold positions; their value is irrelevant to the sign of a
  // loan, which is what this block pins.
  const PORTFOLIO = 0;
  const terms = (rows: typeof SEED_BREAKDOWN) => ({
    totalCash: assetAccountsTotal(rows),
    totalLiabilities: liabilityAccountsTotal(rows),
    portfolioValueBase: PORTFOLIO,
    totalOwedToMe: 0,
    totalIOwe: 0,
  });

  it("reduces net worth by exactly its balance", () => {
    const withoutLoan = SEED_BREAKDOWN.filter((a) => a.type !== "liability");
    const delta = computeNetWorth(terms(SEED_BREAKDOWN)) - computeNetWorth(terms(withoutLoan));
    expect(delta).toBeCloseTo(-6800.00, 2);
  });

  it("swings net worth by TWICE the balance against the old `other` typing", () => {
    // The regression this task fixed. While the loan was typed `other` it was
    // summed as an asset, so correcting it moves the total by 2 × 6,800.
    const asOther = SEED_BREAKDOWN.map((a) =>
      a.type === "liability" ? { ...a, type: "other" } : a);
    const swing = computeNetWorth(terms(SEED_BREAKDOWN)) - computeNetWorth(terms(asOther));
    expect(swing).toBeCloseTo(-13_600.00, 2);
  });

  it("does not touch spendable cash — the loan was never in it", () => {
    const asOther = SEED_BREAKDOWN.map((a) =>
      a.type === "liability" ? { ...a, type: "other" } : a);
    expect(spendableCashTotal(SEED_BREAKDOWN)).toBeCloseTo(11_375.28, 2);
    expect(spendableCashTotal(SEED_BREAKDOWN)).toBe(spendableCashTotal(asOther));
  });
});
