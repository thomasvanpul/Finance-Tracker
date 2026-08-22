// Locks on verifyModelAtBoot and the AI-health state it writes.
//
// The invariants:
//
//   1. GEMINI_MODEL env var takes precedence over the default. Bumping
//      the default to 3.7-flash was today's fix; the env var is the
//      permanent recovery mechanism.
//
//   2. Verification is a real fetch against Google's models list with
//      x-goog-api-key header — never with the key in the URL, since
//      Google's server logs the URL and the URL should not carry the
//      credential.
//
//   3. When the configured model is absent from the returned list,
//      verifyModelAtBoot writes `modelVerified: false` AND logs at
//      error level with the fix-me sentence. A dead model was
//      invisible for three months last time; the next occurrence
//      must be unmissable in Render's log output.
//
//   4. Network failures and non-2xx upstream responses set
//      modelVerified to `null` (unknown), NOT `false` (broken). A
//      deploy-time hiccup shouldn't permanently report AI as dead.
//
//   5. Nothing throws out of verifyModelAtBoot — errors go to state.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  verifyModelAtBoot,
  getAiHealth,
  __resetAiHealthForTesting,
} from "./ai-config";

const REAL_KEY = "SENTINEL_KEY_ABC123";
const ORIGINAL_KEY = process.env.GEMINI_API_KEY;
const ORIGINAL_MODEL = process.env.GEMINI_MODEL;

// Track the last fetch call so tests can assert on URL/headers.
type FetchArgs = { url: string; init?: RequestInit };
let calls: FetchArgs[] = [];

function stubFetch(response: { status: number; body: string; ok?: boolean } | { throws: string }) {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if ("throws" in response) throw new Error(response.throws);
    return {
      ok: response.ok ?? (response.status >= 200 && response.status < 300),
      status: response.status,
      statusText: `HTTP ${response.status}`,
      text: async () => response.body,
      json: async () => JSON.parse(response.body),
    } as unknown as Response;
  });
}

beforeEach(() => {
  calls = [];
  __resetAiHealthForTesting();
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_MODEL === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = ORIGINAL_MODEL;
});

describe("getAiHealth · env var precedence", () => {
  it("uses GEMINI_MODEL env var when set", () => {
    process.env.GEMINI_MODEL = "gemini-3.5-flash";
    __resetAiHealthForTesting();
    expect(getAiHealth().model).toBe("gemini-3.5-flash");
  });

  it("falls back to gemini-3.7-flash when GEMINI_MODEL unset", () => {
    delete process.env.GEMINI_MODEL;
    __resetAiHealthForTesting();
    expect(getAiHealth().model).toBe("gemini-3.7-flash");
  });

  it("keyConfigured reflects GEMINI_API_KEY presence, live per-call", () => {
    delete process.env.GEMINI_API_KEY;
    expect(getAiHealth().keyConfigured).toBe(false);
    process.env.GEMINI_API_KEY = REAL_KEY;
    expect(getAiHealth().keyConfigured).toBe(true);
  });
});

describe("verifyModelAtBoot · HTTP hygiene", () => {
  it("hits the models list endpoint with x-goog-api-key header, key NOT in URL", async () => {
    process.env.GEMINI_API_KEY = REAL_KEY;
    process.env.GEMINI_MODEL = "gemini-3.7-flash";
    __resetAiHealthForTesting();
    stubFetch({
      status: 200,
      body: JSON.stringify({ models: [{ name: "models/gemini-3.7-flash" }] }),
    });
    await verifyModelAtBoot();
    expect(calls).toHaveLength(1);
    // URL is exactly the list endpoint — no ?key=, no other params.
    expect(calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/models");
    expect(calls[0].url).not.toContain(REAL_KEY);
    // Key is in the header, verbatim.
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe(REAL_KEY);
  });

  it("skips the fetch entirely when GEMINI_API_KEY is unset", async () => {
    delete process.env.GEMINI_API_KEY;
    __resetAiHealthForTesting();
    stubFetch({ status: 200, body: "{}" });
    await verifyModelAtBoot();
    expect(calls).toHaveLength(0);
    const health = getAiHealth();
    expect(health.modelVerified).toBeNull();
    expect(health.lastError).toContain("GEMINI_API_KEY is not set");
  });
});

describe("verifyModelAtBoot · outcomes", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = REAL_KEY;
  });

  it("sets modelVerified=true when the configured model is in the list", async () => {
    process.env.GEMINI_MODEL = "gemini-3.7-flash";
    __resetAiHealthForTesting();
    stubFetch({
      status: 200,
      body: JSON.stringify({
        models: [
          { name: "models/gemini-2.5-flash" },
          { name: "models/gemini-3.7-flash" },
          { name: "models/text-embedding-004" },
        ],
      }),
    });
    await verifyModelAtBoot();
    const health = getAiHealth();
    expect(health.modelVerified).toBe(true);
    expect(health.lastError).toBeNull();
    expect(health.modelVerifiedAt).not.toBeNull();
  });

  it("sets modelVerified=false when the configured model is ABSENT (dead model)", async () => {
    // The 2026-06-01 gemini-2.0-flash shutdown scenario. Regression
    // lock: the exact condition that was invisible for three months
    // must now write modelVerified=false and the fix-me sentence.
    process.env.GEMINI_MODEL = "gemini-2.0-flash";
    __resetAiHealthForTesting();
    stubFetch({
      status: 200,
      body: JSON.stringify({
        models: [
          { name: "models/gemini-2.5-flash" },
          { name: "models/gemini-3.5-flash" },
          { name: "models/gemini-3.7-flash" },
        ],
      }),
    });
    await verifyModelAtBoot();
    const health = getAiHealth();
    expect(health.modelVerified).toBe(false);
    // The fix-me sentence must name the dead model AND at least one
    // live alternative — that's the "log alone tells you how to fix
    // it" property.
    expect(health.lastError).toContain("gemini-2.0-flash");
    expect(health.lastError).toContain("gemini-3.7-flash");
    expect(health.lastError).toContain("CONFIGURED AI MODEL IS DEAD");
    expect(health.lastError).toContain("GEMINI_MODEL");
    expect(health.lastError).toContain("redeploy");
  });

  it("sets modelVerified=null (unknown, not false) when Google returns non-2xx", async () => {
    // A 429 rate limit or a 500 from Google shouldn't permanently
    // report the model as dead. Verdict stays unknown, retry next
    // boot. Same rule for network errors — see below.
    process.env.GEMINI_MODEL = "gemini-3.7-flash";
    __resetAiHealthForTesting();
    stubFetch({ status: 500, body: '{"error":{"message":"internal"}}' });
    await verifyModelAtBoot();
    const health = getAiHealth();
    expect(health.modelVerified).toBeNull();
    expect(health.lastError).toContain("HTTP 500");
  });

  it("sets modelVerified=null when fetch throws (network/DNS/TLS)", async () => {
    process.env.GEMINI_MODEL = "gemini-3.7-flash";
    __resetAiHealthForTesting();
    stubFetch({ throws: "getaddrinfo ENOTFOUND generativelanguage.googleapis.com" });
    await verifyModelAtBoot();
    const health = getAiHealth();
    expect(health.modelVerified).toBeNull();
    expect(health.lastError).toContain("ENOTFOUND");
  });

  it("never throws out of verifyModelAtBoot — errors go into state, not up the stack", async () => {
    process.env.GEMINI_MODEL = "gemini-3.7-flash";
    __resetAiHealthForTesting();
    stubFetch({ throws: "boom" });
    // If verifyModelAtBoot rethrew, the boot in index.ts would crash
    // the whole server on a Gemini hiccup — obviously wrong.
    await expect(verifyModelAtBoot()).resolves.not.toThrow();
  });

  it("redacts the API key if the upstream error body ever echoes it", async () => {
    process.env.GEMINI_MODEL = "gemini-3.7-flash";
    __resetAiHealthForTesting();
    stubFetch({
      status: 401,
      body: JSON.stringify({ error: { message: `bad key ${REAL_KEY}` } }),
    });
    await verifyModelAtBoot();
    const health = getAiHealth();
    expect(health.lastError).not.toContain(REAL_KEY);
    expect(health.lastError).toContain("[GEMINI_KEY_REDACTED]");
  });
});
