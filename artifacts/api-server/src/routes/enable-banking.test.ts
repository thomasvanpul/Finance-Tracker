// Regression test for: connecting a second bank through Enable Banking
// used to silently overwrite the connection row for the first one,
// because the upsert key was [userId, provider] and "provider" for every
// Enable Banking connection is the aggregator ("enable-banking"), not the
// institution. Fixed by keying on [userId, provider, externalId], where
// externalId identifies the ASPSP (bank) the consent was granted to.
//
// The DB is mocked with an in-memory table that reproduces the real
// unique-index semantics (connections_user_provider_external_uniq), so
// this test would have failed against the pre-fix upsert target
// ([userId, provider] only) by silently collapsing both banks into one
// row.

import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");

interface Row {
  id: number;
  userId: string;
  provider: string;
  label: string;
  status: string;
  lastError: string | null;
  credentialCiphertext: string;
  externalId: string;
}

const rows: Row[] = [];
let nextId = 1;

function reset(): void {
  rows.length = 0;
  nextId = 1;
}

vi.mock("@workspace/db", () => {
  const chain = () => {
    let payload: Partial<Row> | null = null;
    let updateSet: Partial<Row> | null = null;
    const c: any = {
      values(v: Partial<Row>) {
        payload = v;
        return c;
      },
      onConflictDoUpdate(opts: { set: Partial<Row> }) {
        updateSet = opts.set;
        return c;
      },
      returning() {
        // Mirrors the real unique index: [userId, provider, externalId].
        const existing = rows.find(
          (r) =>
            r.userId === payload!.userId &&
            r.provider === payload!.provider &&
            r.externalId === (payload!.externalId ?? ""),
        );
        if (existing && updateSet) {
          Object.assign(existing, updateSet);
          return Promise.resolve([existing]);
        }
        const row: Row = {
          id: nextId++,
          userId: payload!.userId!,
          provider: payload!.provider!,
          label: payload!.label!,
          status: payload!.status ?? "pending",
          lastError: payload!.lastError ?? null,
          credentialCiphertext: payload!.credentialCiphertext!,
          externalId: payload!.externalId ?? "",
        };
        rows.push(row);
        return Promise.resolve([row]);
      },
    };
    return c;
  };
  return {
    db: { insert: (_table: unknown) => chain() },
    connectionsTable: {
      userId: { name: "user_id" },
      provider: { name: "provider" },
      externalId: { name: "external_id" },
    },
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
}));

const exchangeCodeForSession = vi.fn();

vi.mock("../adapters/enable-banking", () => ({
  startAuth: vi.fn(),
  exchangeCodeForSession: (...args: unknown[]) => exchangeCodeForSession(...args),
  enableBankingAdapter: { provider: "enable-banking" },
}));

vi.mock("../adapters", () => ({
  AdapterError: class AdapterError extends Error {
    constructor(
      public kind: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

let server: Server;
let baseUrl: string;
const USER_ID = "test-user-1";
let __PENDING_FOR_TESTING: Map<string, any>;
let enableBankingRouter: import("express").IRouter;

beforeAll(async () => {
  const { default: express } = await import("express");
  const routeModule = await import("./enable-banking");
  enableBankingRouter = routeModule.default;
  __PENDING_FOR_TESTING = routeModule.__PENDING_FOR_TESTING;

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).userId = USER_ID;
    next();
  });
  app.use(enableBankingRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  return new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  reset();
  __PENDING_FOR_TESTING.clear();
  exchangeCodeForSession.mockReset();
});

function seedPending(state: string, aspspName: string, aspspCountry: string) {
  __PENDING_FOR_TESTING.set(state, {
    userId: USER_ID,
    aspspName,
    aspspCountry,
    validUntil: "2027-01-01",
    redirectAfter: "/settings?panel=connections",
    createdAt: Date.now(),
  });
}

async function callback(state: string, code: string) {
  return fetch(`${baseUrl}/connections/enable-banking/callback?state=${state}&code=${code}`, {
    redirect: "manual",
  });
}

describe("Enable Banking callback — connecting a second bank must not overwrite the first", () => {
  it("persists two rows when the same user connects two different institutions", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({
      session_id: "session-a",
      aspsp: { name: "Monzo", country: "GB" },
      access: { valid_until: "2027-01-01" },
    });
    seedPending("state-a", "Monzo", "GB");
    const resA = await callback("state-a", "code-a");
    expect(resA.status).toBe(302);

    exchangeCodeForSession.mockResolvedValueOnce({
      session_id: "session-b",
      aspsp: { name: "Barclays", country: "GB" },
      access: { valid_until: "2027-01-01" },
    });
    seedPending("state-b", "Barclays", "GB");
    const resB = await callback("state-b", "code-b");
    expect(resB.status).toBe(302);

    expect(rows).toHaveLength(2);
    const labels = rows.map((r) => r.label).sort();
    expect(labels).toEqual(["Barclays (GB)", "Monzo (GB)"]);
  });

  it("upserts in place when the same institution is reconnected (fresh session, same bank)", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({
      session_id: "session-a1",
      aspsp: { name: "Monzo", country: "GB" },
      access: { valid_until: "2027-01-01" },
    });
    seedPending("state-a1", "Monzo", "GB");
    await callback("state-a1", "code-a1");

    exchangeCodeForSession.mockResolvedValueOnce({
      session_id: "session-a2",
      aspsp: { name: "Monzo", country: "GB" },
      access: { valid_until: "2027-06-01" },
    });
    seedPending("state-a2", "Monzo", "GB");
    await callback("state-a2", "code-a2");

    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("active");
  });
});
