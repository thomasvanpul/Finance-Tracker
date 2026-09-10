// Contract tests for the dev-only reset route.
//
// The interesting assertion is not "the reset works" — it is that the guard
// refuses in every environment shape except the one explicitly opted in, and
// in particular that an UNSET NODE_ENV refuses. That is the exact shape of a
// bug this repo has already shipped once: a check keyed to
// `NODE_ENV !== "production"` on a platform that never set NODE_ENV, which
// therefore read "not production" in production and disabled itself.
//
// Same in-memory DB stub as settings.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const store = new Map<string, { persona: string; baseCurrency: string; theme: string; onboardedAt: Date | null }>();

vi.mock("@workspace/db", () => {
  const chain = (kind: "select" | "insert" | "update") => {
    let payload: any = null;
    let updateSet: any = null;
    let filterUser: string | null = null;
    const c: any = {
      from() { return c; },
      where(pred: any) {
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
            store.set(payload.userId, { persona: "full", baseCurrency: "GBP", theme: "void", onboardedAt: null, ...payload });
          }
          return Promise.resolve([{ userId: payload.userId, ...store.get(payload.userId)! }]);
        }
        return Promise.resolve([]);
      },
    };
    return c;
  };
  return {
    db: {
      select: () => chain("select"),
      insert: () => chain("insert"),
      update: () => chain("update"),
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
const USER_ID = "test-dev-user";
const OTHER_ID = "someone-else";

// Saved and restored around every test — these tests mutate process.env and
// must not leak an ENABLE_DEV_ROUTES=1 into the rest of the suite.
const ENV_KEYS = ["NODE_ENV", "ENABLE_DEV_ROUTES"] as const;
let savedEnv: Record<string, string | undefined> = {};

beforeAll(async () => {
  const { default: express } = await import("express");
  const { default: devRouter } = await import("./dev");
  const { default: settingsRouter } = await import("./settings");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).userId = USER_ID;
    next();
  });
  app.use(devRouter);
  app.use(settingsRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  store.clear();
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k]!;
  }
});

function enableDevRoutes(): void {
  process.env.NODE_ENV = "development";
  process.env.ENABLE_DEV_ROUTES = "1";
}

const post = (path: string) => fetch(`${baseUrl}${path}`, { method: "POST" });

describe("decideDevRoutes · the guard fails closed", () => {
  it("refuses when nothing is configured — NODE_ENV and the opt-in both unset", async () => {
    const { decideDevRoutes } = await import("./dev");
    delete process.env.NODE_ENV;
    delete process.env.ENABLE_DEV_ROUTES;
    expect(decideDevRoutes()).toEqual({ allowed: false, reason: "not-enabled" });
  });

  it("refuses in production even with the opt-in set", async () => {
    const { decideDevRoutes } = await import("./dev");
    process.env.NODE_ENV = "production";
    process.env.ENABLE_DEV_ROUTES = "1";
    expect(decideDevRoutes()).toEqual({ allowed: false, reason: "production" });
  });

  it("refuses in development without the opt-in", async () => {
    const { decideDevRoutes } = await import("./dev");
    process.env.NODE_ENV = "development";
    delete process.env.ENABLE_DEV_ROUTES;
    expect(decideDevRoutes()).toEqual({ allowed: false, reason: "not-enabled" });
  });

  it("refuses on a truthy-looking opt-in that is not exactly '1'", async () => {
    const { decideDevRoutes } = await import("./dev");
    process.env.NODE_ENV = "development";
    for (const v of ["true", "yes", "0", "", "on"]) {
      process.env.ENABLE_DEV_ROUTES = v;
      expect(decideDevRoutes()).toEqual({ allowed: false, reason: "not-enabled" });
    }
  });

  it("allows only when NODE_ENV is not production AND the opt-in is exactly '1'", async () => {
    const { decideDevRoutes } = await import("./dev");
    enableDevRoutes();
    expect(decideDevRoutes()).toEqual({ allowed: true });
  });
});

describe("POST /dev/reset-onboarding", () => {
  it("403s with a reason when the routes are not enabled", async () => {
    delete process.env.ENABLE_DEV_ROUTES;
    process.env.NODE_ENV = "development";
    const r = await post("/dev/reset-onboarding");
    expect(r.status).toBe(403);
    expect(((await r.json()) as { reason: string }).reason).toBe("not-enabled");
  });

  it("403s in production regardless of the opt-in", async () => {
    process.env.NODE_ENV = "production";
    process.env.ENABLE_DEV_ROUTES = "1";
    const r = await post("/dev/reset-onboarding");
    expect(r.status).toBe(403);
    expect(((await r.json()) as { reason: string }).reason).toBe("production");
  });

  it("un-does the onboarded_at stamp that PUT /settings/persona set", async () => {
    enableDevRoutes();
    await fetch(`${baseUrl}/settings/persona`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: "market" }),
    });
    expect(await (await fetch(`${baseUrl}/settings/persona`)).json())
      .toEqual({ persona: "market", onboarded: true });

    const r = await post("/dev/reset-onboarding");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ reset: true, userId: USER_ID });

    // persona survives; only the stamp is cleared.
    expect(await (await fetch(`${baseUrl}/settings/persona`)).json())
      .toEqual({ persona: "market", onboarded: false });
  });

  it("is idempotent on an account that was never onboarded", async () => {
    enableDevRoutes();
    expect((await post("/dev/reset-onboarding")).status).toBe(200);
    expect((await post("/dev/reset-onboarding")).status).toBe(200);
    expect(await (await fetch(`${baseUrl}/settings/persona`)).json())
      .toEqual({ persona: "full", onboarded: false });
  });

  it("touches only the calling user's row", async () => {
    enableDevRoutes();
    store.set(OTHER_ID, { persona: "wealth", baseCurrency: "GBP", theme: "void", onboardedAt: new Date("2026-01-01") });
    await fetch(`${baseUrl}/settings/persona`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: "budget" }),
    });
    await post("/dev/reset-onboarding");
    expect(store.get(USER_ID)!.onboardedAt).toBeNull();
    expect(store.get(OTHER_ID)!.onboardedAt).toEqual(new Date("2026-01-01"));
  });
});
