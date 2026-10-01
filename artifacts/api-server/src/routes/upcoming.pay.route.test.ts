// Route lock: paying an upcoming item moves money out of (or into) a named
// account, or it does not pay.
//
// The pay route used to fall back to `accounts[0]` when the item carried no
// accountId — it logged a transaction against, and moved the balance of,
// whichever account happened to come back first, a real account picked by
// position (finding 4cefd5721608). 40 of 67 pending items on the dev branch
// had a null accountId when this was written, so that was the common path.
//
// Same rule as debts.settle.route.test.ts: the item's own account wins,
// otherwise the caller names one (ownership-checked), otherwise 422 and
// nothing is written.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const ownedByCaller = new Set<number>([10, 11]);
const adjustCalls: unknown[][] = [];
const updateSets: Record<string, unknown>[] = [];
const insertedTx: Record<string, unknown>[] = [];
let itemRow: Record<string, unknown> | null = null;

const upcomingTable = { name: "upcoming" };
const accountsTable = { name: "accounts" };
const transactionsTable = { name: "transactions" };

vi.mock("../lib/balance", () => ({
  isAccountOwnedBy: async (accountId: number) => ownedByCaller.has(accountId),
  adjustAccountBalance: async (...args: unknown[]) => {
    adjustCalls.push(args);
  },
}));

vi.mock("@workspace/db", () => {
  let table: unknown = null;
  const chain: Record<string, unknown> = {};
  for (const k of ["select", "where", "update", "orderBy", "limit"]) {
    chain[k] = () => chain;
  }
  chain.from = (t: unknown) => {
    table = t;
    return chain;
  };
  chain.set = (values: Record<string, unknown>) => {
    updateSets.push(values);
    return chain;
  };
  chain.insert = () => ({
    values: async (v: Record<string, unknown>) => {
      insertedTx.push(v);
    },
  });
  chain.returning = async () => (itemRow ? [{ ...itemRow, ...updateSets[updateSets.length - 1] }] : []);
  // `await db.select().from(t).where()` resolves to that table's rows.
  chain.then = (resolve: (rows: unknown[]) => unknown) => {
    if (table === accountsTable) {
      return resolve([
        { id: 10, name: "Monzo" },
        { id: 11, name: "Amex" },
      ]);
    }
    return resolve(itemRow ? [itemRow] : []);
  };
  return { db: chain, upcomingTable, accountsTable, transactionsTable };
});
vi.mock("../lib/market", () => ({
  toBase: async (n: number) => n,
  snapshotFxRate: async () => ({ rate: 1, asOf: null }),
}));
vi.mock("../lib/app-settings-db", () => ({ getBaseCurrency: async () => "GBP" }));
vi.mock("../lib/subscription-upcoming", () => ({ ensureGeneratedUpcoming: async () => {} }));

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
  app.use((await import("./upcoming")).default);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function makeItem(accountId: number | null) {
  return {
    id: 5,
    userId: "user-a",
    dueDate: "2026-10-05",
    description: "Council tax",
    category: "Bills",
    type: "expense",
    frequency: "monthly",
    status: "pending",
    nativeAmount: "120.00",
    currency: "GBP",
    accountId,
    createdAt: new Date("2026-09-01T00:00:00Z"),
  };
}

async function pay(body?: unknown) {
  return fetch(`${baseUrl}/upcoming/5/pay`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  adjustCalls.length = 0;
  updateSets.length = 0;
  insertedTx.length = 0;
  itemRow = null;
});

describe("POST /upcoming/:id/pay", () => {
  it("refuses an item with no account when the caller names none, and writes nothing", async () => {
    itemRow = makeItem(null);
    const r = await pay();
    expect(r.status).toBe(422);
    expect(adjustCalls).toEqual([]);
    expect(insertedTx).toEqual([]);
    expect(updateSets).toEqual([]);
  });

  it("pays from the account the caller names, and records it on the item", async () => {
    itemRow = makeItem(null);
    const r = await pay({ accountId: 11 });
    expect(r.status).toBe(200);
    expect(adjustCalls).toEqual([[11, "user-a", 120, "GBP", "expense"]]);
    expect(insertedTx.map((t) => t.accountId)).toEqual([11]);
    expect(updateSets).toEqual([{ status: "paid", accountId: 11 }]);
    const json = (await r.json()) as { accountId: number; accountName: string };
    expect(json.accountId).toBe(11);
    expect(json.accountName).toBe("Amex");
  });

  it("answers 404 for an account the caller does not own, and writes nothing", async () => {
    itemRow = makeItem(null);
    const r = await pay({ accountId: 99 });
    expect(r.status).toBe(404);
    expect(adjustCalls).toEqual([]);
    expect(insertedTx).toEqual([]);
    expect(updateSets).toEqual([]);
  });

  it("pays an item that already names its account without a body", async () => {
    itemRow = makeItem(10);
    const r = await pay();
    expect(r.status).toBe(200);
    expect(adjustCalls).toEqual([[10, "user-a", 120, "GBP", "expense"]]);
    expect(updateSets).toEqual([{ status: "paid" }]);
  });

  it("keeps the item's own account even when the body names another", async () => {
    itemRow = makeItem(10);
    const r = await pay({ accountId: 11 });
    expect(r.status).toBe(200);
    expect(adjustCalls).toEqual([[10, "user-a", 120, "GBP", "expense"]]);
  });
});
