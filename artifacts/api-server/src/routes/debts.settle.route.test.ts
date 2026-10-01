// Route lock: settling a debt moves money out of (or into) a named account,
// or it does not settle.
//
// Net worth counts a pending debt (dashboard.ts, computeNetWorth), and the
// settle path used to adjust a balance only `if (existing.accountId)`. A
// debt created without an account therefore settled with no cash movement:
// the liability vanished and net worth jumped by the full amount — measured
// on the seed account 229,934.93 → 230,034.93, and all three of its real
// debts had a null accountId (finding 2f12ed386aab).
//
// The fix is that the caller names the account when the debt has none, and
// the server refuses rather than guessing. upcoming.ts falls back to "the
// first account"; that is not copied here, because it would assert that a
// specific account paid when nothing said so.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const ownedByCaller = new Set<number>([10, 11]);
const adjustCalls: unknown[][] = [];
const updateSets: Record<string, unknown>[] = [];
let debtRow: Record<string, unknown> | null = null;

vi.mock("../lib/balance", () => ({
  isAccountOwnedBy: async (accountId: number) => ownedByCaller.has(accountId),
  adjustAccountBalance: async (...args: unknown[]) => {
    adjustCalls.push(args);
  },
}));

vi.mock("@workspace/db", () => {
  const chain: Record<string, unknown> = {};
  for (const k of ["select", "from", "where", "update", "orderBy", "limit"]) {
    chain[k] = () => chain;
  }
  chain.set = (values: Record<string, unknown>) => {
    updateSets.push(values);
    return chain;
  };
  chain.returning = async () => (debtRow ? [{ ...debtRow, ...updateSets[updateSets.length - 1] }] : []);
  // `await db.select().from().where()` resolves to the stored debt.
  chain.then = (resolve: (rows: unknown[]) => unknown) => resolve(debtRow ? [debtRow] : []);
  return { db: chain, debtsTable: {}, userTable: {} };
});
vi.mock("../lib/market", () => ({ toBase: async (n: number) => n }));
vi.mock("../lib/app-settings-db", () => ({ getBaseCurrency: async () => "GBP" }));

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const express = (await import("express")).default;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = "user-a";
    next();
  });
  app.use((await import("./debts")).default);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function makeDebt(accountId: number | null) {
  return {
    id: 7,
    userId: "user-a",
    personName: "Sam",
    description: "dinner",
    date: "2026-09-10",
    nativeAmount: "100.00",
    currency: "GBP",
    direction: "i_owe_them",
    status: "pending",
    notes: null,
    accountId,
    createdAt: new Date("2026-09-10T00:00:00Z"),
    linkedEmail: null,
    linkedUserId: null,
    isReceived: false,
    sourceDebtId: null,
  };
}

async function settle(body?: unknown) {
  return fetch(`${baseUrl}/debts/7/settle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  adjustCalls.length = 0;
  updateSets.length = 0;
  debtRow = null;
});

describe("POST /debts/:id/settle", () => {
  it("refuses a debt with no account when the caller names none, and moves nothing", async () => {
    debtRow = makeDebt(null);
    const r = await settle();
    expect(r.status).toBe(422);
    expect(adjustCalls).toEqual([]);
    expect(updateSets).toEqual([]);
  });

  it("settles from the account the caller names, and records it on the debt", async () => {
    debtRow = makeDebt(null);
    const r = await settle({ accountId: 10 });
    expect(r.status).toBe(200);
    expect(adjustCalls).toEqual([[10, "user-a", 100, "GBP", "expense"]]);
    expect(updateSets).toEqual([{ status: "settled", accountId: 10 }]);
    expect(((await r.json()) as { accountId: number }).accountId).toBe(10);
  });

  it("answers 404 for an account the caller does not own, and moves nothing", async () => {
    debtRow = makeDebt(null);
    const r = await settle({ accountId: 99 });
    expect(r.status).toBe(404);
    expect(adjustCalls).toEqual([]);
    expect(updateSets).toEqual([]);
  });

  it("settles a debt that already names its account without a body", async () => {
    debtRow = makeDebt(11);
    const r = await settle();
    expect(r.status).toBe(200);
    expect(adjustCalls).toEqual([[11, "user-a", 100, "GBP", "expense"]]);
  });

  it("keeps the debt's own account even when the body names another", async () => {
    debtRow = makeDebt(11);
    const r = await settle({ accountId: 10 });
    expect(r.status).toBe(200);
    expect(adjustCalls).toEqual([[11, "user-a", 100, "GBP", "expense"]]);
  });
});
