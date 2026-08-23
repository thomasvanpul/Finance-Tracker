// Chain-dispatch invariants — the load-bearing correctness of the whole
// Groq → Cerebras → OpenRouter architecture.
//
// The rules that carry weight and must not silently regress:
//
//   1. Primary success → serving=groq, reducedCapacity=false.
//   2. Primary throws → next lane tried. Fallback success →
//      serving=fallback, reducedCapacity=true. Every fallthrough
//      MUST flip reducedCapacity — the UI reads this to render the
//      "reduced capacity" chrome, and silent-fallthrough is the exact
//      "degraded-and-silent" defect the market stale-serve pattern
//      already forbids.
//   3. All providers throw → ok=false, servingProvider=null. The
//      route surfaces CLIENT_FAILURE; the chain does not fabricate.
//   4. Attempts happen in order (groq, cerebras, openrouter) and stop
//      at the first success — subsequent providers are not called.
//   5. triedProviders reports the exact walk for logging.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { chainChat } from "./chain";
import { registerProvider, __resetProviderHealthForTesting } from "../provider-health";

// Track fetch calls so we can assert on which providers were invoked.
type FetchArgs = { url: string; init?: RequestInit };
let calls: FetchArgs[] = [];

function stubProviderFetch(byUrl: Record<string, { status: number; body: string } | { throws: string }>) {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    for (const [matcher, response] of Object.entries(byUrl)) {
      if (url.includes(matcher)) {
        if ("throws" in response) throw new Error(response.throws);
        return {
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
          statusText: `HTTP ${response.status}`,
          text: async () => response.body,
          json: async () => JSON.parse(response.body),
        } as unknown as Response;
      }
    }
    throw new Error(`unmatched fetch to ${url}`);
  });
}

// All three providers speak the OpenAI chat-completions shape now that
// Gemini has been removed — one response builder covers every lane.
function openAi200(text: string): string {
  return JSON.stringify({
    choices: [{ message: { content: text }, finish_reason: "stop" }],
  });
}

const KEYS = {
  GROQ_API_KEY: "gsk_TEST_KEY_ABC",
  CEREBRAS_API_KEY: "csk_TEST_KEY_ABC",
  OPENROUTER_API_KEY: "sk-or-v1-TEST_KEY_ABC",
};

beforeEach(() => {
  // Full re-key so every provider is configured for the tests. The
  // per-test scenarios then decide whether each responds ok / throws.
  Object.assign(process.env, KEYS);
  calls = [];
  __resetProviderHealthForTesting();
  registerProvider({ name: "groq", configured: true });
  registerProvider({ name: "cerebras", configured: true });
  registerProvider({ name: "openrouter", configured: true });
  vi.unstubAllGlobals();
});

const MSG = { role: "user" as const, text: "hello" };

describe("chainChat · primary success", () => {
  it("returns groq's response with reducedCapacity=false", async () => {
    stubProviderFetch({
      "api.groq.com": { status: 200, body: openAi200("from groq") },
    });
    const result = await chainChat({ messages: [MSG], route: "test" });
    expect(result.ok).toBe(true);
    expect(result.text).toBe("from groq");
    expect(result.servingProvider).toBe("groq");
    expect(result.reducedCapacity).toBe(false);
    expect(result.triedProviders).toEqual(["groq"]);
    // Only groq was called — no wasted attempts on the fallback lanes.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.groq.com");
  });
});

describe("chainChat · fallthrough to secondary (reducedCapacity=true)", () => {
  it("Groq throws → Cerebras answers → reducedCapacity=true", async () => {
    stubProviderFetch({
      "api.groq.com":     { throws: "ECONNRESET" },
      "api.cerebras.ai":  { status: 200, body: openAi200("from cerebras") },
    });
    const result = await chainChat({ messages: [MSG], route: "test" });
    expect(result.ok).toBe(true);
    expect(result.text).toBe("from cerebras");
    expect(result.servingProvider).toBe("cerebras");
    // The load-bearing invariant: any non-primary serve flips this to
    // true so the UI shows "reduced capacity". Silent fallthrough is
    // the exact defect this whole architecture prevents.
    expect(result.reducedCapacity).toBe(true);
    expect(result.triedProviders).toEqual(["groq", "cerebras"]);
    // OpenRouter was NOT called — chain stopped at first success.
    expect(calls.filter((c) => c.url.includes("openrouter.ai"))).toHaveLength(0);
  });

  it("Groq returns non-2xx → Cerebras answers → reducedCapacity=true", async () => {
    // Non-network failure (a real Groq HTTP error) should also fall
    // through cleanly. This covers the "Groq up but sad" case as
    // distinct from "Groq down".
    stubProviderFetch({
      "api.groq.com":     { status: 429, body: '{"error":{"message":"rate limit"}}' },
      "api.cerebras.ai":  { status: 200, body: openAi200("from cerebras") },
    });
    const result = await chainChat({ messages: [MSG], route: "test" });
    expect(result.servingProvider).toBe("cerebras");
    expect(result.reducedCapacity).toBe(true);
  });
});

describe("chainChat · fallthrough to tertiary (reducedCapacity=true)", () => {
  it("Groq + Cerebras both throw → OpenRouter answers → reducedCapacity=true", async () => {
    stubProviderFetch({
      "api.groq.com":     { throws: "ECONNRESET" },
      "api.cerebras.ai":  { throws: "ECONNRESET" },
      "openrouter.ai":    { status: 200, body: openAi200("from openrouter") },
    });
    const result = await chainChat({ messages: [MSG], route: "test" });
    expect(result.ok).toBe(true);
    expect(result.text).toBe("from openrouter");
    expect(result.servingProvider).toBe("openrouter");
    expect(result.reducedCapacity).toBe(true);
    expect(result.triedProviders).toEqual(["groq", "cerebras", "openrouter"]);
  });
});

describe("chainChat · all providers fail", () => {
  it("every provider throws → ok=false, servingProvider=null, no fabricated text", async () => {
    stubProviderFetch({
      "api.groq.com":     { throws: "ECONNRESET" },
      "api.cerebras.ai":  { throws: "ECONNRESET" },
      "openrouter.ai":    { throws: "ECONNRESET" },
    });
    const result = await chainChat({ messages: [MSG], route: "test" });
    expect(result.ok).toBe(false);
    expect(result.text).toBe("");
    expect(result.servingProvider).toBeNull();
    // Every provider was attempted — chain didn't give up early.
    expect(result.triedProviders).toEqual(["groq", "cerebras", "openrouter"]);
    // reducedCapacity false when nothing served — there's no capacity
    // to report as reduced. The route reads ok=false and returns the
    // generic CLIENT_FAILURE.
    expect(result.reducedCapacity).toBe(false);
  });

  it("empty-content 200 counts as failure (chain continues past a blank response)", async () => {
    // If a provider returns a 200 with content: "", the openai-compat
    // helper throws inside withProvider so the chain moves on. This
    // guards against serving a blank chat bubble to the user.
    stubProviderFetch({
      "api.groq.com":     { status: 200, body: JSON.stringify({ choices: [{ message: { content: "" }, finish_reason: "length" }] }) },
      "api.cerebras.ai":  { status: 200, body: openAi200("real answer") },
    });
    const result = await chainChat({ messages: [MSG], route: "test" });
    expect(result.text).toBe("real answer");
    expect(result.servingProvider).toBe("cerebras");
    expect(result.reducedCapacity).toBe(true);
  });
});

describe("chainChat · per-provider timeout (12s AbortController)", () => {
  it("hanging Groq gets aborted at 12s and chain falls through to Cerebras", async () => {
    // Load-bearing property: a chain built for redundancy MUST NOT
    // become slower than a single provider under failure. Without
    // the AbortController each hang stacked its full wait (60s+) →
    // 3× hang could exceed 3 minutes and blow past Render's socket
    // timeout — the client saw "Failed to fetch" while Node was
    // still waiting on the first provider.
    //
    // Use fake timers to advance past PROVIDER_TIMEOUT_MS without
    // actually sleeping. The fetch mock returns a promise that
    // RESOLVES on abort signal (mirrors undici's real behaviour),
    // so the fetch's own .catch fires.
    vi.useFakeTimers();
    const callSequence: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      callSequence.push(url);
      if (url.includes("api.groq.com")) {
        // Hang until aborted. Resolves rejecting with AbortError
        // when the signal fires, matching undici's contract.
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted") as Error & { name: string };
            err.name = "AbortError";
            reject(err);
          });
        });
      }
      if (url.includes("api.cerebras.ai")) {
        return {
          ok: true, status: 200, statusText: "OK",
          text: async () => openAi200("cerebras served after groq timeout"),
          json: async () => JSON.parse(openAi200("cerebras served after groq timeout")),
        } as unknown as Response;
      }
      throw new Error(`unmatched fetch to ${url}`);
    });

    const chainPromise = chainChat({ messages: [MSG], route: "test" });
    // Advance past the 12s timeout so the AbortController fires
    // for Groq. The chain should then move to Cerebras, which
    // resolves immediately.
    await vi.advanceTimersByTimeAsync(13_000);
    const result = await chainPromise;

    expect(result.ok).toBe(true);
    expect(result.text).toBe("cerebras served after groq timeout");
    expect(result.servingProvider).toBe("cerebras");
    expect(result.reducedCapacity).toBe(true);
    expect(result.triedProviders).toEqual(["groq", "cerebras"]);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});

describe("chainChat · unconfigured providers are skipped", () => {
  it("no GROQ key → skips groq, tries cerebras first, serving=cerebras, reducedCapacity=true", async () => {
    // The reducedCapacity flip when a provider is unconfigured is
    // important: even if we THINK we're only running on Cerebras +
    // OpenRouter today, we're still not on the primary chain. Same
    // signal to the UI as a runtime fallthrough.
    delete process.env.GROQ_API_KEY;
    __resetProviderHealthForTesting();
    registerProvider({ name: "groq", configured: false });
    registerProvider({ name: "cerebras", configured: true });
    registerProvider({ name: "openrouter", configured: true });
    stubProviderFetch({
      "api.cerebras.ai": { status: 200, body: openAi200("from cerebras") },
    });
    const result = await chainChat({ messages: [MSG], route: "test" });
    expect(result.servingProvider).toBe("cerebras");
    expect(result.reducedCapacity).toBe(true);
    // Groq was NOT called — withProvider refuses pre-flight.
    expect(calls.filter((c) => c.url.includes("api.groq.com"))).toHaveLength(0);
  });
});
