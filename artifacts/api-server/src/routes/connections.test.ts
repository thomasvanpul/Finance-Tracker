// The important test on this router is the negative one: the plaintext
// credential the caller submits must not appear in ANY endpoint's
// serialised response body, and the encrypted ciphertext must not
// appear either. Asserting on the JSON string (not the object passed to
// res.json) catches the failure mode where someone bypasses toPublic()
// and does res.json(row) directly.
//
// The DB layer is mocked with an in-memory table so this suite has no
// external dependencies. The Wise adapter is mocked to always accept
// (that behaviour is exercised in the adapter's own tests). The
// crypto module is real — its round-trip test lives in crypto.test.ts.

import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

// Set the encryption key before any import that touches crypto.ts.
process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");

// The distinctive plaintext this test suite never wants to see in any
// response. Use a fixed string so `expect(body).not.toContain(SECRET)`
// is a stable check.
const SECRET_PLAINTEXT = "wise-live-token-DO-NOT-LEAK-ZZZZ-1234567890";

// In-memory table row shape mirrors the drizzle inferred Select type.
interface Row {
  id: number;
  userId: string;
  provider: string;
  label: string;
  status: string;
  lastSyncedAt: Date | null;
  lastError: string | null;
  credentialCiphertext: string;
  createdAt: Date;
  updatedAt: Date;
}

const rows: Row[] = [];
let nextId = 1;

function reset(): void {
  rows.length = 0;
  nextId = 1;
}

// A minimal drizzle-shaped mock. Only the methods the connections
// router actually calls are implemented; anything else throws so a
// route change that starts using a new drizzle helper fails the test
// loudly rather than silently returning undefined.
vi.mock("@workspace/db", () => {
  const chain = (kind: "select" | "insert" | "update" | "delete", args?: unknown) => {
    let filter: ((r: Row) => boolean) | null = null;
    let payload: Partial<Row> | null = null;
    let updateSet: Partial<Row> | null = null;
    const c: any = {
      from() { return c; },
      where(_predicate: unknown) {
        // We can't introspect the drizzle predicate cheaply, so all
        // .where in these tests is user-scoped by id/userId. The route
        // layer runs these one at a time in this suite. Return
        // everything in the mock table and let the caller assert.
        return kind === "select" ? Promise.resolve(rows) : c;
      },
      values(v: Partial<Row>) { payload = v; return c; },
      onConflictDoUpdate(opts: { set: Partial<Row> }) { updateSet = opts.set; return c; },
      set(s: Partial<Row>) { updateSet = s; return c; },
      returning(_cols?: unknown) {
        if (kind === "insert") {
          // Upsert semantics: if a row exists with same userId+provider
          // (values must include them for connectionsTable inserts),
          // update in place; otherwise insert.
          const existing = rows.find(
            (r) => r.userId === payload!.userId && r.provider === payload!.provider,
          );
          if (existing && updateSet) {
            Object.assign(existing, updateSet, { updatedAt: new Date() });
            return Promise.resolve([existing]);
          }
          const row: Row = {
            id: nextId++,
            userId: payload!.userId!,
            provider: payload!.provider!,
            label: payload!.label!,
            status: payload!.status ?? "pending",
            lastSyncedAt: payload!.lastSyncedAt ?? null,
            lastError: payload!.lastError ?? null,
            credentialCiphertext: payload!.credentialCiphertext!,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          rows.push(row);
          return Promise.resolve([row]);
        }
        if (kind === "delete") {
          // We can't introspect the predicate; instead the test drives
          // this by matching on id, which the route puts in the URL.
          const removed = rows.splice(0, rows.length);
          return Promise.resolve(removed.map((r) => ({ id: r.id })));
        }
        return Promise.resolve(rows);
      },
    };
    return c;
  };
  return {
    db: {
      select: () => chain("select"),
      insert: (_table: unknown) => chain("insert"),
      update: (_table: unknown) => chain("update"),
      delete: (_table: unknown) => chain("delete"),
    },
    connectionsTable: {
      // The predicate helpers `eq`/`and` from drizzle-orm are called
      // with these — return placeholder objects; our mock ignores the
      // predicate content.
      id: { name: "id" },
      userId: { name: "user_id" },
      provider: { name: "provider" },
    },
    accountsTable: { wiseBalanceId: { name: "wise_balance_id" } },
    transactionsTable: {
      externalId: { name: "external_id" },
      userId: { name: "user_id" },
      id: { name: "id" },
    },
  };
});

// Any drizzle helper (eq, and) called in the router receives the
// column stubs above; return values are opaque objects the mock
// ignores.
vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
}));

// Adapter mocked to always accept the SECRET_PLAINTEXT and reject
// everything else. This isolates the router from the network.
vi.mock("../adapters", async () => {
  return {
    getAdapter: (p: string) =>
      p === "wise"
        ? {
            provider: "wise",
            validateCredential: async (cred: string) =>
              cred === SECRET_PLAINTEXT
                ? { ok: true, label: "Test User" }
                : { ok: false, error: "bad token" },
            listAccounts: async () => [],
            fetchTransactionsSince: async () => [],
          }
        : null,
    AdapterError: class AdapterError extends Error {
      constructor(public kind: string, message: string) {
        super(message);
      }
    },
  };
});

// Boot an express app with just the connections router + a fake
// requireAuth middleware. Route imports happen inside beforeAll so the
// vi.mock hoisting order stays right.
let server: Server;
let baseUrl: string;
const USER_ID = "test-user-1";

beforeAll(async () => {
  const { default: express } = await import("express");
  const { default: connectionsRouter } = await import("./connections");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).userId = USER_ID;
    next();
  });
  app.use(connectionsRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  return new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => reset());

async function json(res: Response): Promise<{ status: number; body: string; parsed: unknown }> {
  const body = await res.text();
  return {
    status: res.status,
    body,
    parsed: body.length > 0 ? JSON.parse(body) : null,
  };
}

describe("connections router — credential never leaves the server", () => {
  it("POST /connections responds with a Connection that omits the credential (plaintext AND ciphertext)", async () => {
    const res = await fetch(`${baseUrl}/connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "wise", credential: SECRET_PLAINTEXT }),
    });
    const { status, body, parsed } = await json(res);
    expect(status).toBe(201);
    // Assert on the raw serialised bytes.
    expect(body).not.toContain(SECRET_PLAINTEXT);
    expect(body).not.toContain("credentialCiphertext");
    expect(body).not.toContain("credential_ciphertext");
    // And on the parsed structure for good measure.
    const p = parsed as Record<string, unknown>;
    expect(p).toHaveProperty("id");
    expect(p).toHaveProperty("provider", "wise");
    expect(p).toHaveProperty("status", "active");
    expect(p).not.toHaveProperty("credential");
    expect(p).not.toHaveProperty("credentialCiphertext");
    // The row was persisted encrypted — the in-memory table has a
    // ciphertext that is neither the plaintext nor empty.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.credentialCiphertext).not.toBe(SECRET_PLAINTEXT);
    expect(rows[0]!.credentialCiphertext.length).toBeGreaterThan(0);
  });

  it("POST /connections with a bad credential returns 400 and does not persist", async () => {
    const res = await fetch(`${baseUrl}/connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "wise", credential: "wrong-token" }),
    });
    const { status, body } = await json(res);
    expect(status).toBe(400);
    // The wrong token also must not be echoed back.
    expect(body).not.toContain("wrong-token");
    expect(rows).toHaveLength(0);
  });

  it("POST /connections with an unknown provider returns 400 without hitting an adapter", async () => {
    const res = await fetch(`${baseUrl}/connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "not-a-real-provider", credential: SECRET_PLAINTEXT }),
    });
    const { status, body } = await json(res);
    expect(status).toBe(400);
    expect(body).not.toContain(SECRET_PLAINTEXT);
  });

  it("GET /connections lists rows but omits the credential from every item", async () => {
    // Seed via POST so the ciphertext is real.
    await fetch(`${baseUrl}/connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "wise", credential: SECRET_PLAINTEXT }),
    });
    const res = await fetch(`${baseUrl}/connections`);
    const { status, body, parsed } = await json(res);
    expect(status).toBe(200);
    expect(body).not.toContain(SECRET_PLAINTEXT);
    expect(body).not.toContain("credentialCiphertext");
    expect(body).not.toContain("credential_ciphertext");
    // And on the parsed array.
    const arr = parsed as Array<Record<string, unknown>>;
    expect(arr.length).toBeGreaterThan(0);
    for (const item of arr) {
      expect(item).not.toHaveProperty("credential");
      expect(item).not.toHaveProperty("credentialCiphertext");
    }
  });

  it("DELETE /connections/:id returns 204 with an empty body — nothing to leak", async () => {
    await fetch(`${baseUrl}/connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "wise", credential: SECRET_PLAINTEXT }),
    });
    const id = rows[0]!.id;
    const res = await fetch(`${baseUrl}/connections/${id}`, { method: "DELETE" });
    expect(res.status).toBe(204);
    const body = await res.text();
    expect(body).toBe("");
    expect(rows).toHaveLength(0);
  });
});
