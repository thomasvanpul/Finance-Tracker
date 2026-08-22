// Endpoint lock for /api/ai/status.
//
// The endpoint's semantic contract changed with the "dead-model-was-
// invisible-for-three-months" fix: `available` now means BOTH the key
// is set AND the configured model was verified live at last boot.
// Key-presence alone is no longer enough. If someone reintroduces the
// old shape by accident, these tests catch it.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import router from "./ai-status";
import { __setAiHealthForTesting, __resetAiHealthForTesting } from "../lib/ai-config";

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
const ORIGINAL_MODEL = process.env.GEMINI_MODEL;

beforeEach(() => {
  __resetAiHealthForTesting();
});
afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_MODEL === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = ORIGINAL_MODEL;
});

describe("/api/ai/status · available field truthfulness", () => {
  it("available=false when the key is missing (obvious case)", async () => {
    delete process.env.GEMINI_API_KEY;
    __setAiHealthForTesting({ keyConfigured: false, modelVerified: null });
    const body = await callStatus();
    expect(body.available).toBe(false);
    expect(body.keyConfigured).toBe(false);
  });

  it("available=false when the key IS set but model verification hasn't run (null)", async () => {
    // The three-month bug: prior endpoint reported available=true
    // because the key was set, while the configured model was dead.
    // Null verification (boot check pending or errored) now counts
    // as NOT available — better to over-report broken than to
    // under-report broken. Once boot check confirms, this flips.
    process.env.GEMINI_API_KEY = "SENTINEL_KEY";
    __setAiHealthForTesting({
      keyConfigured: true,
      model: "gemini-3.7-flash",
      modelVerified: null,
      lastError: null,
    });
    const body = await callStatus();
    expect(body.available).toBe(false);
    expect(body.keyConfigured).toBe(true);
    expect(body.modelVerified).toBeNull();
  });

  it("available=false when the model verification FAILED (dead model)", async () => {
    // Regression lock for the specific "gemini-2.0-flash was shut
    // down but /ai/status kept saying available=true" defect.
    process.env.GEMINI_API_KEY = "SENTINEL_KEY";
    __setAiHealthForTesting({
      keyConfigured: true,
      model: "gemini-2.0-flash",
      modelVerified: false,
      lastError: 'CONFIGURED AI MODEL IS DEAD. GEMINI_MODEL="gemini-2.0-flash" is not in Google\'s current models list.',
    });
    const body = await callStatus();
    expect(body.available).toBe(false);
    expect(body.modelVerified).toBe(false);
    expect(body.lastError).toContain("MODEL IS DEAD");
  });

  it("available=true ONLY when key is set AND model was verified live", async () => {
    process.env.GEMINI_API_KEY = "SENTINEL_KEY";
    __setAiHealthForTesting({
      keyConfigured: true,
      model: "gemini-3.7-flash",
      modelVerified: true,
      modelVerifiedAt: "2026-08-22T12:00:00.000Z",
      lastError: null,
    });
    const body = await callStatus();
    expect(body.available).toBe(true);
    expect(body.keyConfigured).toBe(true);
    expect(body.modelVerified).toBe(true);
    expect(body.model).toBe("gemini-3.7-flash");
  });
});

describe("/api/ai/status · response shape", () => {
  it("exposes exactly the fields an operator needs, no more", async () => {
    __setAiHealthForTesting({
      keyConfigured: true,
      model: "gemini-3.7-flash",
      modelVerified: true,
      modelVerifiedAt: "2026-08-22T12:00:00.000Z",
      lastError: null,
    });
    const body = await callStatus();
    // Locked field set. Widening this response requires updating the
    // test — no field can be added silently that might leak (a key
    // hash, a userId, a full model list, etc.).
    expect(new Set(Object.keys(body))).toEqual(
      new Set([
        "available",
        "keyConfigured",
        "model",
        "modelVerified",
        "modelVerifiedAt",
        "lastError",
      ]),
    );
  });

  it("does not leak the API key in any field", async () => {
    process.env.GEMINI_API_KEY = "SENTINEL_GEMINI_KEY_9EE7AA";
    __setAiHealthForTesting({
      keyConfigured: true,
      model: "gemini-3.7-flash",
      modelVerified: true,
      lastError: null,
    });
    const body = await callStatus();
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain("SENTINEL");
    expect(serialised).not.toContain("9EE7AA");
  });
});
