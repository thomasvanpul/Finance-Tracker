import { describe, it, expect, vi } from "vitest";

// Pure arithmetic through processInvestments — mock the db import so the
// module loads without DATABASE_URL (same pattern as dashboard.net-worth.test.ts),
// and mock lib/market + lib/market-eod so no network/DB call happens.
vi.mock("@workspace/db", () => ({
  db: {}, accountsTable: {}, transactionsTable: {}, investmentsTable: {},
  upcomingTable: {}, debtsTable: {}, nwSnapshotsTable: {}, sharedExpensesTable: {},
  sharedExpenseParticipantsTable: {}, userTable: {},
}));

// Deterministic FX, GBP-pivoted like the real cache: USD->GBP at 1.25.
const RATES: Record<string, number> = { USD: 1.25, GBP: 1 };
vi.mock("../lib/market", () => ({
  toBase: async (amount: number, from: string, base: string): Promise<number | null> => {
    if (from === base) return amount;
    const fromRate = from === "GBP" ? 1 : RATES[from];
    const toRate = base === "GBP" ? 1 : RATES[base];
    if (!fromRate || !toRate) return null;
    return (amount / fromRate) * toRate;
  },
  txToBase: async () => null,
}));

let mockPriceMap = new Map<string, { ticker: string; price: number; currency: string; previousClose: number | null; previousSessionDate?: string | null; updatedAt: string }>();
vi.mock("../lib/market-eod", () => ({
  getValuationPrices: async () => ({
    prices: mockPriceMap,
    asOfSession: mockPriceMap.size > 0 ? "2026-09-18" : null,
    staleTickers: [],
  }),
}));

const { processInvestments, computeNetWorth } = await import("./dashboard");
const { reportableTotalValue } = await import("../lib/enrich-investment");

interface FakeInvestment { ticker: string; shares: string; costPricePerShare: string }
function inv(ticker: string, shares: string, costPricePerShare: string): FakeInvestment {
  return { ticker, shares, costPricePerShare };
}

// The exact defect the task describes: with ENABLE_MARKET_DATA off,
// getValuationPrices() returns an empty price map for every ticker. The old
// code excluded every position entirely (unavailablePositions === all of
// them, portfolioValueBase === 0), so net worth silently dropped the whole
// portfolio. Fixed by falling back to cost basis — never invented, never
// silently dropped.
describe("processInvestments — net worth must not silently drop the unpriced portfolio", () => {
  it("regression: markets fully off, one US position — portfolio value comes from cost basis, not 0", async () => {
    mockPriceMap = new Map(); // empty: no ticker has a live/EOD price
    // 10 shares * $180 cost, no suffix -> USD -> GBP at 1.25 = 1440
    const result = await processInvestments([inv("AAPL", "10", "180.00")] as never, "GBP");
    expect(result.portfolioValueBase).not.toBe(0);
    expect(result.portfolioValueBase).toBe(1440);
    expect(result.portfolioCostBase).toBe(1440);
    expect(result.unavailablePositions).toBe(0);
    expect(result.positionsAtCost).toBe(1);
  });

  it("regression: markets fully off, a non-US position — currency inferred from ticker suffix, not defaulted to USD", async () => {
    mockPriceMap = new Map();
    // 10 shares * £100 cost, .L suffix -> GBP, base GBP -> identity, 1000
    const result = await processInvestments([inv("VOD.L", "10", "100.00")] as never, "GBP");
    expect(result.portfolioValueBase).toBe(1000);
    expect(result.positionsAtCost).toBe(1);
  });

  it("all positions live-priced: unaffected by the fallback (no regression)", async () => {
    mockPriceMap = new Map([
      ["AAPL", { ticker: "AAPL", price: 210, currency: "USD", previousClose: 205, previousSessionDate: "2026-09-18", updatedAt: "2026-09-19T00:00:00Z" }],
    ]);
    const result = await processInvestments([inv("AAPL", "10", "180.00")] as never, "GBP");
    // 2100 USD / 1.25 = 1680
    expect(result.portfolioValueBase).toBe(1680);
    expect(result.positionsAtCost).toBe(0);
    expect(result.unavailablePositions).toBe(0);
    // Day change still computed for a fully live portfolio.
    expect(result.dayChangeBase).not.toBeNull();
  });

  it("mixed portfolio: one live, one cost-valued — both count toward the total", async () => {
    mockPriceMap = new Map([
      ["AAPL", { ticker: "AAPL", price: 210, currency: "USD", previousClose: 205, previousSessionDate: "2026-09-18", updatedAt: "2026-09-19T00:00:00Z" }],
      // VOD.L deliberately absent from the price map — unpriced.
    ]);
    const result = await processInvestments(
      [inv("AAPL", "10", "180.00"), inv("VOD.L", "10", "100.00")] as never,
      "GBP",
    );
    expect(result.portfolioValueBase).toBe(1680 + 1000);
    expect(result.positionsAtCost).toBe(1);
    expect(result.unavailablePositions).toBe(0);
    // A cost-valued leg has no known day movement, so it must not be
    // silently folded into the day-change baseline: the mixed portfolio's
    // day-change traces the live leg's own session, undiluted by a leg
    // that isn't dated at all.
    expect(result.dayChangeFromSession).toBe("2026-09-18");
  });

  it("still excludes a position with neither a live price nor a convertible cost basis", async () => {
    mockPriceMap = new Map();
    // Base currency THB has no FX rate in this test's RATES table, so even
    // the cost-basis fallback cannot convert. This is the one case that
    // legitimately stays excluded.
    const result = await processInvestments([inv("AAPL", "10", "180.00")] as never, "THB");
    expect(result.portfolioValueBase).toBe(0);
    expect(result.unavailablePositions).toBe(1);
    expect(result.positionsAtCost).toBe(0);
  });

  it("empty portfolio: honestly zero, not a fallback artifact", async () => {
    mockPriceMap = new Map();
    const result = await processInvestments([], "GBP");
    expect(result.portfolioValueBase).toBe(0);
    expect(result.unavailablePositions).toBe(0);
    expect(result.positionsAtCost).toBe(0);
  });
});

// L1 and L2 (BACKLOG § L, 19 Sep 2026). What the response serialises, not
// only what processInvestments sums. `reportableTotalValue` is the value the
// route puts in portfolio.totalValueBase; computeNetWorth is the headline.
describe("dashboard portfolio total and net worth — market data off (L1, L2)", () => {
  const cash = { totalCash: 1000, totalOwedToMe: 0, totalIOwe: 0, totalLiabilities: 0 };

  it("L2: markets off, one position — net worth includes it at cost basis", async () => {
    mockPriceMap = new Map();
    const r = await processInvestments([inv("AAPL", "10", "180.00")] as never, "GBP");
    expect(computeNetWorth({ ...cash, portfolioValueBase: r.portfolioValueBase })).toBe(1000 + 1440);
  });

  it("L2: markets on, the same position — net worth includes it at its close", async () => {
    mockPriceMap = new Map([["AAPL", { ticker: "AAPL", price: 200, currency: "USD", previousClose: null, updatedAt: "2026-09-18T21:00:00Z" }]]);
    const r = await processInvestments([inv("AAPL", "10", "180.00")] as never, "GBP");
    expect(computeNetWorth({ ...cash, portfolioValueBase: r.portfolioValueBase })).toBe(1000 + 1600);
  });

  it("L1: holdings that cannot be valued serialise as null, never 0", async () => {
    mockPriceMap = new Map();
    const r = await processInvestments([inv("AAPL", "10", "180.00")] as never, "THB");
    expect(reportableTotalValue(r.portfolioValueBase, 1, r.unavailablePositions)).toBeNull();
  });

  it("L1: no holdings at all is an honest 0", async () => {
    mockPriceMap = new Map();
    const r = await processInvestments([], "GBP");
    expect(reportableTotalValue(r.portfolioValueBase, 0, r.unavailablePositions)).toBe(0);
  });
});

// Found 2 Oct 2026 verifying L1 against the dev API: with every position at
// cost, no leg reaches foldDayChange, whose empty case means "nothing held"
// and returns 0. The market persona's hero then printed a £0.00 day change
// for a portfolio whose movement nobody knows.
describe("day change when nothing is priced", () => {
  it("every position at cost: the day change is unknown, not 0", async () => {
    mockPriceMap = new Map();
    const r = await processInvestments([inv("AAPL", "10", "180.00"), inv("VOD.L", "5", "100.00")] as never, "GBP");
    expect(r.dayChangeBase).toBeNull();
    expect(r.dayChangePrevValueBase).toBeNull();
  });

  it("every position unavailable: the day change is unknown, not 0", async () => {
    mockPriceMap = new Map();
    const r = await processInvestments([inv("AAPL", "10", "180.00")] as never, "THB");
    expect(r.dayChangeBase).toBeNull();
  });

  it("nothing held: still an honest 0", async () => {
    mockPriceMap = new Map();
    expect((await processInvestments([], "GBP")).dayChangeBase).toBe(0);
  });
});
