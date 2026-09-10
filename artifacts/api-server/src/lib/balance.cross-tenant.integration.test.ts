// Cross-tenant balance write, against a real Postgres (the Neon dev
// branch locally). Skipped unless NUMERIS_DB_TESTS=1, so it is NOT
// gate-covered — the gate must not depend on the network. Run by hand:
//
//   cd artifacts/api-server && set -a && . ../../lib/db/.env && set +a \
//     && NUMERIS_DB_TESTS=1 npx vitest run balance.cross-tenant
//
// The unit tests in balance.ownership.test.ts prove the SELECT and the
// UPDATE both carry user_id by inspecting the calls. This proves the
// consequence against a real database: user A naming user B's account
// moves no money in it, and user B's own write still lands. Without the
// user_id predicate on the UPDATE the first assertion fails by 100.00.

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const enabled = process.env.NUMERIS_DB_TESTS === "1" && !!process.env.DATABASE_URL;
const NEON_TIMEOUT_MS = 120_000;

describe.skipIf(!enabled)("adjustAccountBalance · cross-tenant (real database)", () => {
  let balance: typeof import("./balance");
  let s: typeof import("@workspace/db");
  let eq: typeof import("drizzle-orm").eq;

  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const userA = `xt-a-${stamp}`;
  const userB = `xt-b-${stamp}`;
  let accountB = 0;

  const balanceOfB = async (): Promise<number> => {
    const [row] = await s.db.select({ balance: s.accountsTable.balance })
      .from(s.accountsTable).where(eq(s.accountsTable.id, accountB));
    return Number(row!.balance);
  };

  beforeAll(async () => {
    balance = await import("./balance");
    s = await import("@workspace/db");
    eq = (await import("drizzle-orm")).eq;

    await s.db.insert(s.userTable).values([
      { id: userA, name: "A", email: `xt-a-${stamp}@numeris.invalid` },
      { id: userB, name: "B", email: `xt-b-${stamp}@numeris.invalid` },
    ]);
    const [acct] = await s.db.insert(s.accountsTable)
      .values({ userId: userB, name: "B current", currency: "GBP", balance: "1000" })
      .returning({ id: s.accountsTable.id });
    accountB = acct!.id;
  }, NEON_TIMEOUT_MS);

  afterAll(async () => {
    if (!enabled) return;
    await s.db.delete(s.accountsTable).where(eq(s.accountsTable.userId, userB));
    await s.db.delete(s.userTable).where(eq(s.userTable.id, userA));
    await s.db.delete(s.userTable).where(eq(s.userTable.id, userB));
  }, NEON_TIMEOUT_MS);

  it("moves nothing when user A names user B's account", async () => {
    const before = await balanceOfB();
    await balance.adjustAccountBalance(accountB, userA, 100, "GBP", "income");
    expect(await balanceOfB()).toBe(before);
  }, NEON_TIMEOUT_MS);

  it("still moves user B's own balance, so the check is not simply refusing everything", async () => {
    const before = await balanceOfB();
    await balance.adjustAccountBalance(accountB, userB, 100, "GBP", "income");
    expect(await balanceOfB()).toBe(before + 100);
  }, NEON_TIMEOUT_MS);

  it("isAccountOwnedBy tells the two apart", async () => {
    expect(await balance.isAccountOwnedBy(accountB, userB)).toBe(true);
    expect(await balance.isAccountOwnedBy(accountB, userA)).toBe(false);
  }, NEON_TIMEOUT_MS);
});
