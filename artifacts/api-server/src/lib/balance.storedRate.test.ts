// Regression test for: editing/deleting an old foreign-currency
// transaction used to reprice it at today's live FX rate instead of the
// rate that was actually stored on that transaction row (nativeToBaseRate
// / rateAsOf, frozen at write time by snapshotFxRate). Fixed by having
// adjustAccountBalance accept that stored rate and use it instead of
// re-fetching a live one.

import { describe, it, expect, vi, beforeEach } from "vitest";

const recorded: { executed: unknown[] } = { executed: [] };
let accountRows: Array<{ id: number; currency: string }> = [];

vi.mock("@workspace/db", () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => Promise.resolve(accountRows),
    execute: (q: unknown) => {
      recorded.executed.push(q);
      return Promise.resolve(undefined);
    },
  };
  return { db: chain, accountsTable: { id: "accounts.id", userId: "accounts.userId", currency: "accounts.currency" } };
});

// The live rate is deliberately absurd (10x) so a test that accidentally
// falls through to the live path is unmistakably wrong rather than
// coincidentally close to the stored-rate answer.
const LIVE_RATE_MULTIPLIER = 10;
vi.mock("./market", () => ({
  toGbp: async (n: number) => n * LIVE_RATE_MULTIPLIER,
  gbpTo: async (n: number) => n * LIVE_RATE_MULTIPLIER,
  toBase: async (n: number) => n * LIVE_RATE_MULTIPLIER,
}));

const { adjustAccountBalance } = await import("./balance");

beforeEach(() => {
  recorded.executed = [];
  accountRows = [{ id: 1, currency: "GBP" }];
});

function lastDelta(): number {
  // The mocked db.execute receives drizzle's tagged-template `sql` result.
  // Interpolated values sit as bare entries in queryChunks; literal
  // segments are wrapped as { value: [...] }. The UPDATE template is
  // `... + ${delta} WHERE id = ${accountId} AND user_id = ${userId}`, so
  // the delta is queryChunks[1].
  const q = recorded.executed.at(-1) as { queryChunks: unknown[] };
  expect(typeof q.queryChunks[1]).toBe("number");
  return q.queryChunks[1] as number;
}

describe("adjustAccountBalance · storedRate", () => {
  it("uses the transaction's frozen rate, not the live one, when reversing it", async () => {
    // Transaction was written when USD->GBP was 0.5 (nativeToBaseRate).
    // The live rate has since moved to LIVE_RATE_MULTIPLIER via the mock.
    await adjustAccountBalance(
      1,
      "user-a",
      100, // native amount, USD
      "USD",
      "expense",
      true, // reverse
      undefined,
      undefined,
      { nativeToBaseRate: "0.5", baseCurrency: "GBP" },
    );
    // Account currency (GBP) === storedRate.baseCurrency, so the delta is
    // exactly nativeAmount * storedRate with no live lookup: 100 * 0.5 = 50.
    // reverse=true and txType="expense" cancel out (both flip sign), so
    // the net delta is +50.
    expect(lastDelta()).toBeCloseTo(50, 6);
  });

  it("falls back to the live rate when no stored rate is available (legacy row)", async () => {
    await adjustAccountBalance(1, "user-a", 100, "USD", "expense", true, undefined, undefined, null);
    // toGbp(100) -> 1000, gbpTo(1000) -> 10000 via the live mock; expense+reverse -> +10000.
    expect(lastDelta()).toBeCloseTo(10000, 6);
  });

  it("falls back to the live rate when the stored rate is null (FX outage at write time)", async () => {
    await adjustAccountBalance(1, "user-a", 100, "USD", "expense", true, undefined, undefined, {
      nativeToBaseRate: null,
      baseCurrency: "GBP",
    });
    expect(lastDelta()).toBeCloseTo(10000, 6);
  });
});
