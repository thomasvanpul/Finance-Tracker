// PATCH /transactions/:id moves the account balance.
//
// Until 30-Sep the handler updated the row and never called
// adjustAccountBalance, so editing an amount, currency, account or type
// left the balance describing a transaction that no longer existed.
// DELETE had already been taught (9117db2) to reverse a row at the FX
// rate frozen on it; PATCH now reverses the old row the same way and
// applies the new one at the rate stored on the edited row.
//
// This drives the real route and the real adjustAccountBalance against an
// in-memory database, so what is asserted is the balance itself, not
// which helper was called with what.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

type Row = Record<string, unknown>;
type Pred = { col?: string; val?: unknown; and?: Pred[] };

const USER = "user-a";
const tables: { accounts: Row[]; transactions: Row[] } = { accounts: [], transactions: [] };

// FX. `snapshotRate` is what a write freezes onto a row; `liveRate` is what
// the live toGbp path would use. Keeping them separate is what lets a test
// tell "reversed at the stored rate" apart from "reversed at today's rate".
const fx = { snapshotRate: 1, liveRate: 1 };

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (col: string, val: unknown): Pred => ({ col, val }),
    and: (...preds: Pred[]): Pred => ({ and: preds }),
  };
});

vi.mock("@workspace/db", () => {
  const cols = (...names: string[]) => Object.fromEntries(names.map((n) => [n, n]));
  const accountsTable = { __name: "accounts", ...cols("id", "userId", "currency", "name") };
  const transactionsTable = {
    __name: "transactions",
    ...cols("id", "userId", "accountId", "type", "category", "date", "transferGroupId"),
  };
  const rowsOf = (t: { __name: string }) => tables[t.__name as "accounts" | "transactions"];
  const matches = (row: Row, p: Pred | undefined): boolean =>
    p == null ? true : p.and ? p.and.every((q) => matches(row, q)) : row[p.col as string] === p.val;
  const settle = <T>(v: T) => Object.assign(Promise.resolve(v), { for: () => Promise.resolve(v), orderBy: () => Promise.resolve(v) });

  let nextId = 1;
  const db = {
    select: () => ({
      from: (t: { __name: string }) => ({
        where: (p: Pred) => settle(rowsOf(t).filter((r) => matches(r, p)).map((r) => ({ ...r }))),
      }),
    }),
    insert: (t: { __name: string }) => ({
      values: (v: Row | Row[]) => ({
        returning: async () => {
          const created = (Array.isArray(v) ? v : [v]).map((r) => ({
            source: "manual", externalId: null, transferGroupId: null, transferDirection: null,
            ...r, id: nextId++, createdAt: new Date("2026-09-30T12:00:00Z"),
          }));
          rowsOf(t).push(...created);
          return created.map((r) => ({ ...r }));
        },
      }),
    }),
    update: (t: { __name: string }) => ({
      set: (data: Row) => ({
        where: (p: Pred) => ({
          returning: async () =>
            rowsOf(t)
              .filter((r) => matches(r, p))
              .map((r) => Object.assign(r, data))
              .map((r) => ({ ...r })),
        }),
      }),
    }),
    // adjustAccountBalance's only write:
    //   UPDATE accounts SET balance = ... + ${delta} WHERE id = ${id} AND user_id = ${userId}
    // Interpolated values are the bare entries of queryChunks.
    execute: async (q: { queryChunks: unknown[] }) => {
      const params = q.queryChunks.filter((c) => typeof c === "number" || typeof c === "string");
      const [delta, id, userId] = params as [number, number, string];
      const acct = tables.accounts.find((a) => a.id === id && a.userId === userId);
      if (acct) acct.balance = (acct.balance as number) + delta;
    },
    transaction: async <T>(cb: (tx: unknown) => Promise<T>) => cb(db),
  };
  return { db, accountsTable, transactionsTable };
});

vi.mock("../lib/market", () => ({
  snapshotFxRate: async (currency: string) => ({
    rate: currency === "GBP" ? 1 : fx.snapshotRate,
    asOf: new Date(),
  }),
  toGbp: async (n: number, currency: string) => (currency === "GBP" ? n : n * fx.liveRate),
  gbpTo: async (n: number) => n,
  toBase: async (n: number) => n,
  txToBase: async () => 0,
}));
vi.mock("../lib/app-settings-db", () => ({ getBaseCurrency: async () => "GBP" }));

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const express = (await import("express")).default;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = USER;
    next();
  });
  app.use((await import("./transactions")).default);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const A = 10;
const B = 11;

beforeEach(() => {
  tables.accounts = [
    { id: A, userId: USER, name: "Current", currency: "GBP", balance: 1000 },
    { id: B, userId: USER, name: "Savings", currency: "GBP", balance: 1000 },
  ];
  tables.transactions = [];
  fx.snapshotRate = 1;
  fx.liveRate = 1;
});

async function send(method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as { id: number } };
}

const balance = (id: number) => tables.accounts.find((a) => a.id === id)!.balance as number;
const row = (id: number) => tables.transactions.find((t) => t.id === id)!;

const expense = (over: Record<string, unknown> = {}) => ({
  date: "2026-09-10", description: "Lunch", type: "expense", category: "Food",
  accountId: A, nativeAmount: 100, currency: "USD", ...over,
});

describe("PATCH /transactions/:id · balance follows the edit", () => {
  it("reverses the old amount at its frozen rate and applies the new one at a fresh rate", async () => {
    // Written when USD→GBP was 0.8: 100 USD = £80 out of £1000.
    fx.snapshotRate = 0.8;
    fx.liveRate = 0.8;
    const created = await send("POST", "/transactions", expense());
    expect(created.status).toBe(201);
    expect(balance(A)).toBeCloseTo(920, 6);

    // The rate moves to 0.5 before the edit.
    fx.snapshotRate = 0.5;
    fx.liveRate = 0.5;
    const r = await send("PATCH", `/transactions/${created.body.id}`, { nativeAmount: 200 });
    expect(r.status).toBe(200);

    // Reverse the old row at its own 0.8 (+£80 → £1000), then apply 200 USD
    // at the freshly snapshotted 0.5 (−£100 → £900).
    //   today's bug (no adjustment at all):        £920
    //   reversing at the live rate instead (+£50): £870
    expect(balance(A)).toBeCloseTo(900, 6);
    expect(row(created.body.id).nativeToBaseRate).toBe("0.5");
  });

  it("moves nothing and keeps the frozen rate when the edit is only a recategorise", async () => {
    // The client sends the whole row back, currency included. Presence of
    // a field is not a change to it.
    // POST applies at the live rate and freezes the snapshot; in
    // production they are the same moment's rate.
    fx.snapshotRate = 0.8;
    fx.liveRate = 0.8;
    const created = await send("POST", "/transactions", expense());
    fx.snapshotRate = 0.5;
    fx.liveRate = 0.5;

    const r = await send("PATCH", `/transactions/${created.body.id}`, expense({ category: "Travel" }));
    expect(r.status).toBe(200);
    expect(balance(A)).toBeCloseTo(920, 6);
    expect(row(created.body.id).nativeToBaseRate).toBe("0.8");
    expect(row(created.body.id).category).toBe("Travel");
  });

  it("moves the amount from the old account to the new one when re-pointed", async () => {
    const created = await send("POST", "/transactions", expense({ currency: "GBP", nativeAmount: 50 }));
    expect(balance(A)).toBe(950);

    const r = await send("PATCH", `/transactions/${created.body.id}`, { accountId: B });
    expect(r.status).toBe(200);
    expect(balance(A)).toBe(1000);
    expect(balance(B)).toBe(950);
  });

  it("flips the sign when an expense is re-typed as income", async () => {
    const created = await send("POST", "/transactions", expense({ currency: "GBP", nativeAmount: 30 }));
    expect(balance(A)).toBe(970);

    await send("PATCH", `/transactions/${created.body.id}`, { type: "income" });
    expect(balance(A)).toBe(1030);
  });

  it("re-prices through the new currency's rate when the currency changes", async () => {
    // POST applies at the live rate and freezes the snapshot; in
    // production they are the same moment's rate.
    fx.snapshotRate = 0.8;
    fx.liveRate = 0.8;
    const created = await send("POST", "/transactions", expense());
    expect(balance(A)).toBeCloseTo(920, 6);

    const r = await send("PATCH", `/transactions/${created.body.id}`, { currency: "GBP" });
    expect(r.status).toBe(200);
    // +£80 back at the frozen USD rate, −£100 as a GBP row.
    expect(balance(A)).toBeCloseTo(900, 6);
    expect(row(created.body.id).nativeToBaseRate).toBe("1");
  });

  it("moves only the edited transfer leg's account; the paired leg's row and balance are untouched", async () => {
    const created = await send("POST", "/transactions", {
      date: "2026-09-10", description: "To savings", type: "transfer", category: "Transfer",
      accountId: A, toAccountId: B, nativeAmount: 100, currency: "GBP",
    });
    expect(created.status).toBe(201);
    expect(balance(A)).toBe(900);
    expect(balance(B)).toBe(1100);
    const outLeg = created.body.id;
    const inLeg = tables.transactions.find((t) => t.transferDirection === "in")!;

    const r = await send("PATCH", `/transactions/${outLeg}`, { nativeAmount: 150 });
    expect(r.status).toBe(200);
    expect(balance(A)).toBe(850);
    expect(balance(B)).toBe(1100);
    expect(inLeg.nativeAmount).toBe("100");
  });

  it("answers 404 for a transaction that is not the caller's, and moves nothing", async () => {
    tables.transactions.push({
      id: 500, userId: "user-b", accountId: A, type: "expense", nativeAmount: "10", currency: "GBP",
      nativeToBaseRate: "1", transferDirection: null,
    });
    const r = await send("PATCH", "/transactions/500", { nativeAmount: 999 });
    expect(r.status).toBe(404);
    expect(balance(A)).toBe(1000);
    expect(row(500).nativeAmount).toBe("10");
  });
});
