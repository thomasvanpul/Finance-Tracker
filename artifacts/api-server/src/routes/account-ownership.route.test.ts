// Route-level ownership lock.
//
// The helper being scoped is not enough on its own: before 10-Sep an
// unknown account made adjustAccountBalance log "account not found,
// skipping" and the request still returned 201, so the API told the
// caller their transaction had been recorded against an account that did
// not take it. That is the API asserting something untrue.
//
// Every write path naming a user-supplied account id must answer 404 —
// not 403, which would confirm that another user's id exists — and must
// move no money. "Moved no money" is asserted here as
// adjustAccountBalance never being called at all, which is the seam that
// matters and does not depend on faking a SQL UPDATE. That the helper
// itself is scoped, and writes nothing when the lookup fails, is locked
// separately in lib/balance.ownership.test.ts.
//
// DELETE is deliberately absent from the 404 cases: it takes no account
// id from the request, only the one already stored on the row it is
// deleting. Its protection is the scoped helper, which is why the
// arity lock in lib/balance.ownership.test.ts covers both of its call
// sites.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

// Which account ids the "database" says belong to the current caller.
let ownedByCaller = new Set<number>([10, 11]);
const adjustCalls: unknown[][] = [];

vi.mock("../lib/balance", () => ({
  isAccountOwnedBy: async (accountId: number) => ownedByCaller.has(accountId),
  adjustAccountBalance: async (...args: unknown[]) => {
    adjustCalls.push(args);
  },
}));

// The 404 fires before any of these are reached; they exist so the route
// modules can be imported at all.
vi.mock("@workspace/db", () => {
  const chain: Record<string, unknown> = {};
  for (const k of ["select", "from", "where", "insert", "values", "update", "set", "delete", "orderBy", "limit", "innerJoin", "onConflictDoUpdate"]) {
    chain[k] = () => chain;
  }
  (chain as { returning: () => Promise<unknown[]> }).returning = async () => [];
  (chain as { then?: unknown }).then = undefined;
  return {
    db: { ...chain, transaction: async (cb: (t: unknown) => unknown) => cb(chain) },
    transactionsTable: {}, accountsTable: {}, upcomingTable: {}, debtsTable: {}, userTable: {},
  };
});
vi.mock("../lib/market", () => ({
  snapshotFxRate: async () => ({ rate: 1, asOf: new Date() }),
  txToBase: async () => 0,
  toBase: async () => 0,
}));
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
  app.use((await import("./transactions")).default);
  app.use((await import("./upcoming")).default);
  app.use((await import("./debts")).default);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  ownedByCaller = new Set([10, 11]);
  adjustCalls.length = 0;
});

async function send(method: string, path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const FOREIGN = 999; // exists, belongs to someone else
const MINE = 10;

const tx = (over: Record<string, unknown> = {}) => ({
  date: "2026-09-10", description: "d", type: "expense", category: "Other",
  accountId: MINE, nativeAmount: 5, currency: "GBP", ...over,
});

describe("a write naming an account the caller does not own is refused", () => {
  it("POST /transactions → 404, and no balance is moved", async () => {
    const r = await send("POST", "/transactions", tx({ accountId: FOREIGN }));
    expect(r.status).toBe(404);
    expect(adjustCalls).toHaveLength(0);
  });

  it("POST /transactions transfer → 404 on the DESTINATION id, and no balance is moved", async () => {
    // The source is the caller's; only toAccountId is foreign. This leg
    // had never been checked at all.
    const r = await send("POST", "/transactions", tx({ type: "transfer", accountId: MINE, toAccountId: FOREIGN }));
    expect(r.status).toBe(404);
    expect(adjustCalls).toHaveLength(0);
  });

  it("PATCH /transactions/:id → 404 when re-pointed at a foreign account", async () => {
    const r = await send("PATCH", "/transactions/1", { accountId: FOREIGN });
    expect(r.status).toBe(404);
    expect(adjustCalls).toHaveLength(0);
  });

  it("POST /upcoming → 404, so the id pay() will later spend from is never stored", async () => {
    const r = await send("POST", "/upcoming", {
      dueDate: "2026-09-20", description: "d", category: "Other", type: "expense",
      frequency: "one-time", nativeAmount: 5, currency: "GBP", accountId: FOREIGN,
    });
    expect(r.status).toBe(404);
    expect(adjustCalls).toHaveLength(0);
  });

  it("POST /debts → 404, so the id settle() will later spend from is never stored", async () => {
    const r = await send("POST", "/debts", {
      personName: "p", description: "d", date: "2026-09-10",
      nativeAmount: 5, currency: "GBP", direction: "i_owe_them", accountId: FOREIGN,
    });
    expect(r.status).toBe(404);
    expect(adjustCalls).toHaveLength(0);
  });

  it("answers 404 rather than 403, so the response does not confirm the id exists", async () => {
    const r = await send("POST", "/transactions", tx({ accountId: FOREIGN }));
    expect(r.status).toBe(404);
    expect(r.status).not.toBe(403);
  });

  // Negative control: the gate must not pass merely because everything
  // 404s. An owned id has to get past the ownership check.
  it("does NOT refuse an account the caller does own", async () => {
    const r = await send("POST", "/transactions", tx({ accountId: MINE }));
    expect(r.status).not.toBe(404);
  });
});
