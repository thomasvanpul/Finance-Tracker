// Route lock: PATCH /debts/:id must never move a debt to "settled" on its
// own. Settling moves cash (debts.settle.route.test.ts) and does so only
// through POST /debts/:id/settle, which requires an account and adjusts its
// balance. PATCH used to accept `status: "settled"` straight into the same
// column with no account check and no balance adjustment — a second,
// unguarded settle path (finding 0e48f19b97d2). The fix removed `status`
// from UpdateDebtBody/DebtUpdate, so a client sending it now has the field
// silently stripped by zod rather than applied.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const adjustCalls: unknown[][] = [];
const updateSets: Record<string, unknown>[] = [];
let debtRow: Record<string, unknown> | null = null;

vi.mock("../lib/balance", () => ({
  isAccountOwnedBy: async () => true,
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

async function patch(body: unknown) {
  return fetch(`${baseUrl}/debts/7`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  adjustCalls.length = 0;
  updateSets.length = 0;
  debtRow = makeDebt(10);
});

describe("PATCH /debts/:id", () => {
  it("drops a status field instead of settling the debt or moving money", async () => {
    const r = await patch({ status: "settled" });
    expect(r.status).toBe(200);
    expect(adjustCalls).toEqual([]);
    expect(updateSets).toEqual([{}]);
    expect(((await r.json()) as { status: string }).status).toBe("pending");
  });

  it("still applies fields the schema does carry", async () => {
    const r = await patch({ personName: "Sam T" });
    expect(r.status).toBe(200);
    expect(updateSets).toEqual([{ personName: "Sam T" }]);
  });
});
