// Locks on callGemini's three load-bearing invariants:
//
//   1. The API key never appears in the request URL. If it does, it
//      lands in fetch traces, proxy access logs, and any error stack
//      that includes the request line. Google supports both `?key=`
//      and x-goog-api-key; we're on the header form to keep the key
//      out of URLs.
//
//   2. Upstream errors (non-2xx status or 2xx-with-error-body) are
//      surfaced in the returned diagnostic. Previously every catch
//      swallowed the exception unbound; the operator got no signal
//      when a call failed. The client message is generic; the
//      diagnostic goes back to the caller for server-side logging.
//
//   3. If the key somehow ends up in a body/message that gets returned
//      as diagnostic, it's redacted. Belt-and-braces — the header path
//      shouldn't put it there, but a stack from a network layer could.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { callGemini } from "./gemini";

const REAL_KEY = "SENTINEL_GEMINI_KEY_9EE7AA";

// Track the last fetch call so tests can assert on URL/headers.
type FetchArgs = { url: string; init?: RequestInit };
let calls: FetchArgs[] = [];

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: { status: number; body: string; ok?: boolean }) {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return {
      ok: response.ok ?? (response.status >= 200 && response.status < 300),
      status: response.status,
      statusText: `HTTP ${response.status}`,
      text: async () => response.body,
      json: async () => JSON.parse(response.body),
    } as unknown as Response;
  });
}

describe("callGemini · URL / header hygiene", () => {
  it("never puts the API key in the URL query string", async () => {
    stubFetch({ status: 200, body: JSON.stringify({ candidates: [] }) });
    await callGemini({ model: "test-model", apiKey: REAL_KEY, route: "test", body: {} });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).not.toContain(REAL_KEY);
    expect(calls[0].url).not.toContain("key=");
    expect(calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent");
  });

  it("sends the API key in the x-goog-api-key header", async () => {
    stubFetch({ status: 200, body: JSON.stringify({ candidates: [] }) });
    await callGemini({ model: "test-model", apiKey: REAL_KEY, route: "test", body: {} });
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe(REAL_KEY);
    // Belt-and-braces: no Authorization header (would be wrong for
    // Gemini, and a mix would be worse than either alone).
    expect(headers["Authorization"]).toBeUndefined();
  });
});

describe("callGemini · error surfacing (formerly swallowed)", () => {
  it("returns ok=false + diagnostic when upstream returns non-2xx, with the body preserved", async () => {
    // The kind of body Google actually sends for a retired model (404)
    // — this used to be discarded silently.
    const body = JSON.stringify({
      error: {
        code: 404,
        message: "models/gemini-1.5-flash is not found for API version v1beta",
        status: "NOT_FOUND",
      },
    });
    stubFetch({ status: 404, body });
    const result = await callGemini({ model: "gemini-1.5-flash", apiKey: REAL_KEY, route: "test", body: {} });
    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    // Diagnostic must carry the upstream status AND the body — this is
    // the "single line that settles whether it's a dead model" surface.
    expect(result.diagnostic).toContain("HTTP 404");
    expect(result.diagnostic).toContain("not found for API version");
    expect(result.diagnostic).toContain("NOT_FOUND");
  });

  it("returns ok=false when a 2xx body carries an error object (validation-fail path)", async () => {
    const body = JSON.stringify({
      error: { code: 400, message: "Invalid content", status: "INVALID_ARGUMENT" },
    });
    stubFetch({ status: 200, body });
    const result = await callGemini({ model: "test-model", apiKey: REAL_KEY, route: "test", body: {} });
    expect(result.ok).toBe(false);
    expect(result.diagnostic).toContain("Invalid content");
  });

  it("returns ok=false when fetch itself throws (network / DNS / TLS), with the message preserved", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("getaddrinfo ENOTFOUND generativelanguage.googleapis.com");
    });
    const result = await callGemini({ model: "test-model", apiKey: REAL_KEY, route: "test", body: {} });
    expect(result.ok).toBe(false);
    expect(result.diagnostic).toContain("fetch threw");
    expect(result.diagnostic).toContain("ENOTFOUND");
  });

  it("returns ok=true + data on 2xx with candidates payload", async () => {
    stubFetch({
      status: 200,
      body: JSON.stringify({
        candidates: [{ content: { parts: [{ text: "hello world" }] } }],
      }),
    });
    const result = await callGemini({ model: "test-model", apiKey: REAL_KEY, route: "test", body: {} });
    expect(result.ok).toBe(true);
    expect(result.data?.candidates?.[0].content.parts[0].text).toBe("hello world");
    expect(result.diagnostic).toBe("");
  });
});

describe("callGemini · key redaction", () => {
  it("redacts the API key when it appears verbatim in the upstream error body", async () => {
    // Contrived: Google echoes the key in an error message. Shouldn't
    // happen with the header path, but if it ever did we don't want
    // it leaking into logs.
    const body = JSON.stringify({
      error: { message: `Request with key ${REAL_KEY} was rejected` },
    });
    stubFetch({ status: 400, body });
    const result = await callGemini({ model: "test-model", apiKey: REAL_KEY, route: "test", body: {} });
    expect(result.diagnostic).not.toContain(REAL_KEY);
    expect(result.diagnostic).toContain("[GEMINI_KEY_REDACTED]");
  });

  it("redacts the key from a network exception message too", async () => {
    // A hypothetical stack trace that captured the env value.
    vi.stubGlobal("fetch", async () => {
      throw new Error(`connection failed carrying header x-goog-api-key: ${REAL_KEY}`);
    });
    const result = await callGemini({ model: "test-model", apiKey: REAL_KEY, route: "test", body: {} });
    expect(result.diagnostic).not.toContain(REAL_KEY);
  });
});
