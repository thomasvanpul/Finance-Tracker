// Endpoint lock: /api/market/providers is public, no secrets leak, shape stable.
//
// Follows the auth-providers.test.ts pattern: pull the route handler out of
// the router stack and invoke it with a fake res.json rather than boot a
// real Express server or add supertest as a dep. The behaviour under test
// is the handler + provider-health snapshot, not Express routing itself.

import { describe, it, expect, beforeEach } from "vitest";
import router from "./market-providers";
import { __resetProviderHealthForTesting, registerProvider } from "../lib/provider-health";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callProviders(): Promise<any> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layer = (router as any).stack.find((l: any) => l?.route?.path === "/market/providers");
    if (!layer) return reject(new Error("route not found"));
    const handler = layer.route.stack[0].handle as (req: unknown, res: unknown) => void;
    handler({} as unknown, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      json: (body: any) => resolve(body),
    } as unknown);
  });
}

beforeEach(() => {
  __resetProviderHealthForTesting();
});

describe("/api/market/providers · shape and secrecy", () => {
  it("returns a providers array in alphabetical order", async () => {
    registerProvider({ name: "yahoo", configured: true });
    registerProvider({ name: "frankfurter", configured: true });
    registerProvider({ name: "alpaca", configured: true });
    registerProvider({ name: "polygon", configured: true });
    registerProvider({ name: "twelvedata", configured: true, creditsBudget: 800 });

    const body = await callProviders();
    expect(Array.isArray(body.providers)).toBe(true);
    // Alphabetical lock — a diff-friendly stable order rather than
    // insertion order (which was previously non-deterministic across
    // module-load races).
    const names = body.providers.map((p: { name: string }) => p.name);
    expect(names).toEqual(["alpaca", "frankfurter", "polygon", "twelvedata", "yahoo"]);
  });

  it("surfaces configured=false when a provider's env key is missing", async () => {
    registerProvider({ name: "twelvedata", configured: false, creditsBudget: 800 });
    const body = await callProviders();
    const td = body.providers.find((p: { name: string }) => p.name === "twelvedata");
    // Present in the list even when unconfigured — the "provider
    // offline: no key" surface. Silent omission would let the operator
    // conclude Twelve Data isn't a supported lane at all.
    expect(td).toBeDefined();
    expect(td.configured).toBe(false);
  });

  it("does NOT leak any API-key value in the response body", async () => {
    // Sentinel values distinct from anything else in the codebase.
    process.env.ALPACA_KEY_ID = "SENTINEL_ALPACA_ID_9EE7";
    process.env.ALPACA_SECRET_KEY = "SENTINEL_ALPACA_SECRET_9EE7";
    process.env.POLYGON_API_KEY = "SENTINEL_POLYGON_9EE7";
    process.env.TWELVEDATA_API_KEY = "SENTINEL_TD_9EE7";
    registerProvider({ name: "alpaca", configured: true });
    registerProvider({ name: "polygon", configured: true });
    registerProvider({ name: "twelvedata", configured: true, creditsBudget: 800 });

    const body = await callProviders();
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain("SENTINEL_ALPACA_ID_9EE7");
    expect(serialised).not.toContain("SENTINEL_ALPACA_SECRET_9EE7");
    expect(serialised).not.toContain("SENTINEL_POLYGON_9EE7");
    expect(serialised).not.toContain("SENTINEL_TD_9EE7");
  });

  it("exposes exactly the diagnostic fields and no others", async () => {
    registerProvider({ name: "yahoo", configured: true });
    const body = await callProviders();
    const yahoo = body.providers.find((p: { name: string }) => p.name === "yahoo");
    // Locked field set. If someone adds a field carrying anything
    // sensitive (a userId, a key hash, an internal URL), this fails
    // before it ships. Adding a genuinely diagnostic field only
    // requires updating this expectation, forcing a review.
    expect(new Set(Object.keys(yahoo))).toEqual(
      new Set([
        "name",
        "configured",
        "breaker",
        "consecutiveFailures",
        "cooldownUntil",
        "lastOk",
        "lastError",
        "creditsUsedToday",
        "creditsBudget",
        "creditsResetAt",
      ]),
    );
  });
});
