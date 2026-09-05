// Contract tests for the persona + theme endpoints. In-memory DB stub
// + live express instance on a random port, same pattern as
// connections.test.ts. Focus: validation rejects bad ids, valid ids
// round-trip through GET/PUT, missing row defaults to the schema
// default ("full" for persona, "void" for theme).

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

// In-memory settings store keyed by userId.
const store = new Map<string, { persona: string; baseCurrency: string; theme: string }>();

function reset(): void { store.clear(); }

vi.mock("@workspace/db", () => {
  const chain = (kind: "select" | "insert" | "update", table?: unknown) => {
    let payload: any = null;
    let updateSet: any = null;
    let filterUser: string | null = null;
    const c: any = {
      from() { return c; },
      where(pred: any) {
        // Extract userId from the eq() stub.
        const args = pred?.__eq ?? [];
        if (args[1] && typeof args[1] === "string") filterUser = args[1];
        if (kind === "select") {
          const row = filterUser ? store.get(filterUser) : undefined;
          return Promise.resolve(row ? [{ userId: filterUser, ...row }] : []);
        }
        if (kind === "update") {
          if (filterUser && store.has(filterUser)) {
            store.set(filterUser, { ...store.get(filterUser)!, ...updateSet });
          }
          return Promise.resolve();
        }
        return c;
      },
      values(v: any) { payload = v; return c; },
      onConflictDoNothing() { return c; },
      onConflictDoUpdate() { return c; },
      set(s: any) { updateSet = s; return c; },
      returning() {
        if (kind === "insert" && payload?.userId) {
          if (!store.has(payload.userId)) {
            store.set(payload.userId, { persona: "full", baseCurrency: "GBP", theme: "void", ...payload });
          }
          const row = store.get(payload.userId)!;
          return Promise.resolve([{ userId: payload.userId, ...row }]);
        }
        return Promise.resolve([]);
      },
    };
    return c;
  };
  return {
    db: {
      select: () => chain("select"),
      insert: (t: unknown) => chain("insert", t),
      update: (t: unknown) => chain("update", t),
    },
    appSettingsTable: { userId: { name: "user_id" } },
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
}));

let server: Server;
let baseUrl: string;
const USER_ID = "test-persona-user";

beforeAll(async () => {
  const { default: express } = await import("express");
  const { default: settingsRouter } = await import("./settings");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).userId = USER_ID;
    next();
  });
  app.use(settingsRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => reset());

describe("GET /settings/persona", () => {
  it("returns full by default when no row exists", async () => {
    const r = await fetch(`${baseUrl}/settings/persona`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ persona: "full" });
  });

  it("returns the stored persona after a PUT", async () => {
    const put = await fetch(`${baseUrl}/settings/persona`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: "market" }),
    });
    expect(put.status).toBe(200);
    const get = await fetch(`${baseUrl}/settings/persona`);
    expect(await get.json()).toEqual({ persona: "market" });
  });
});

describe("PUT /settings/persona", () => {
  it.each(["market", "budget", "wealth", "social", "full"])("accepts %s", async (p) => {
    const r = await fetch(`${baseUrl}/settings/persona`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: p }),
    });
    expect(r.status).toBe(200);
  });

  it("rejects an unknown persona with 400 listing valid ids", async () => {
    const r = await fetch(`${baseUrl}/settings/persona`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: "not-a-persona" }),
    });
    expect(r.status).toBe(400);
    const body = await r.json() as { error: string };
    expect(body.error).toMatch(/must be one of/);
    expect(body.error).toMatch(/market/);
    expect(body.error).toMatch(/full/);
  });

  it("rejects a missing persona field", async () => {
    const r = await fetch(`${baseUrl}/settings/persona`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
  });
});

describe("GET /settings/theme", () => {
  it("returns void by default when no row exists", async () => {
    const r = await fetch(`${baseUrl}/settings/theme`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ theme: "void" });
  });

  it("returns the stored theme after a PUT", async () => {
    const put = await fetch(`${baseUrl}/settings/theme`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: "arctic" }),
    });
    expect(put.status).toBe(200);
    const get = await fetch(`${baseUrl}/settings/theme`);
    expect(await get.json()).toEqual({ theme: "arctic" });
  });
});

describe("PUT /settings/theme", () => {
  it.each([
    "void", "phosphor", "arctic", "parchment", "slate", "linen",
    "amber", "midnight", "matrix", "synthwave", "deep-space",
    "mario", "gilded", "bloodline",
  ])("accepts %s", async (t) => {
    const r = await fetch(`${baseUrl}/settings/theme`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: t }),
    });
    expect(r.status).toBe(200);
  });

  it("rejects an unknown theme with 400 listing valid ids", async () => {
    const r = await fetch(`${baseUrl}/settings/theme`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: "not-a-theme" }),
    });
    expect(r.status).toBe(400);
    const body = await r.json() as { error: string };
    expect(body.error).toMatch(/must be one of/);
    expect(body.error).toMatch(/void/);
    expect(body.error).toMatch(/arctic/);
  });

  it("rejects a missing theme field", async () => {
    const r = await fetch(`${baseUrl}/settings/theme`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
  });
});

describe("GET /settings/tab-slot", () => {
  it("returns null by default when no row exists (follow persona default)", async () => {
    const r = await fetch(`${baseUrl}/settings/tab-slot`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ tabSlot: null });
  });

  it("returns the stored slot after a PUT", async () => {
    const put = await fetch(`${baseUrl}/settings/tab-slot`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabSlot: "markets" }),
    });
    expect(put.status).toBe(200);
    const get = await fetch(`${baseUrl}/settings/tab-slot`);
    expect(await get.json()).toEqual({ tabSlot: "markets" });
  });
});

describe("PUT /settings/tab-slot", () => {
  it.each(["spending", "markets", "upcoming", "owing", "watchlist"])("accepts %s", async (s) => {
    const r = await fetch(`${baseUrl}/settings/tab-slot`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabSlot: s }),
    });
    expect(r.status).toBe(200);
  });

  it("accepts null and clears a previously stored slot", async () => {
    await fetch(`${baseUrl}/settings/tab-slot`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabSlot: "upcoming" }),
    });
    const clear = await fetch(`${baseUrl}/settings/tab-slot`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabSlot: null }),
    });
    expect(clear.status).toBe(200);
    const get = await fetch(`${baseUrl}/settings/tab-slot`);
    expect(await get.json()).toEqual({ tabSlot: null });
  });

  it("rejects an unknown slot with 400 listing valid ids", async () => {
    const r = await fetch(`${baseUrl}/settings/tab-slot`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabSlot: "news" }),
    });
    expect(r.status).toBe(400);
    const body = await r.json() as { error: string };
    expect(body.error).toMatch(/must be null or one of/);
    expect(body.error).toMatch(/markets/);
    expect(body.error).toMatch(/watchlist/);
  });

  it("rejects a missing tabSlot field (absent is not the same as null)", async () => {
    const r = await fetch(`${baseUrl}/settings/tab-slot`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
  });
});
