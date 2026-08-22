// Endpoint lock for /api/ai/status.
//
// Same shape as auth-providers.test.ts and market-providers.test.ts:
// pull the handler out of the router stack and invoke it with a fake
// res.json rather than boot Express. The behaviour under test is the
// handler's response shape, not routing.
//
// The invariants:
//   • Returns { available: <boolean> } — no more, no less.
//   • Never leaks any part of GEMINI_API_KEY (sentinel-scan).
//   • Reports true iff env var is a non-empty string.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import router from "./ai-status";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callStatus(): Promise<any> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layer = (router as any).stack.find((l: any) => l?.route?.path === "/ai/status");
    if (!layer) return reject(new Error("route not found"));
    const handler = layer.route.stack[0].handle as (req: unknown, res: unknown) => void;
    handler({} as unknown, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      json: (body: any) => resolve(body),
    } as unknown);
  });
}

const ORIGINAL_KEY = process.env.GEMINI_API_KEY;

beforeEach(() => {
  delete process.env.GEMINI_API_KEY;
});
afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = ORIGINAL_KEY;
});

describe("/api/ai/status", () => {
  it("reports available=false when GEMINI_API_KEY is unset", async () => {
    const body = await callStatus();
    expect(body).toEqual({ available: false });
  });

  it("reports available=true when GEMINI_API_KEY is set", async () => {
    process.env.GEMINI_API_KEY = "SENTINEL_GEMINI_KEY_A1B2C3";
    const body = await callStatus();
    expect(body).toEqual({ available: true });
  });

  it("does NOT leak any part of the API key in the response body", async () => {
    process.env.GEMINI_API_KEY = "SENTINEL_GEMINI_KEY_A1B2C3";
    const body = await callStatus();
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain("SENTINEL");
    expect(serialised).not.toContain("A1B2C3");
    // Locked shape: exactly one field, exactly its type. If someone
    // adds a "model" or "keyPrefix" or similar leaking value, this
    // fails before it ships.
    expect(Object.keys(body)).toEqual(["available"]);
    expect(typeof body.available).toBe("boolean");
  });

  // Note on empty-string handling: process.env values are always
  // strings when set, but an explicit empty string ("") is treated as
  // "not configured" — same rule as auth-providers. If someone sets
  // GEMINI_API_KEY="" as a placeholder in Render, the status still
  // reports false. Matches the guards in ai.ts chat/receipt-split.
  it("reports available=false when GEMINI_API_KEY is empty string", async () => {
    process.env.GEMINI_API_KEY = "";
    const body = await callStatus();
    expect(body).toEqual({ available: false });
  });
});
