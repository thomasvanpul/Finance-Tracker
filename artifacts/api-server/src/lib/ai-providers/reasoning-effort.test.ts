// gpt-oss reasoning budget — finding 327b63a2c792 (2026-10-03).
//
// openai/gpt-oss-120b is a reasoning model, and its reasoning tokens are
// spent out of max_tokens. At the provider's default effort the chat
// route's 1024 cap was consumed by reasoning alone on 3 of 4 dashboard
// insight loads: the stream closed with finish_reason "length" and no
// content, the chain fell through, and the user saw "temporarily
// unavailable". Every request to a gpt-oss model must therefore ask for
// low reasoning effort; a model outside that family must not be sent the
// parameter, since non-reasoning models reject it.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { callOpenAICompat, callOpenAICompatStream } from "./openai-compat";
import { registerProvider, __resetProviderHealthForTesting } from "../provider-health";

let bodies: Array<Record<string, unknown>> = [];

function stubFetch(stream: boolean) {
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    if (!stream) {
      const body = JSON.stringify({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] });
      return { ok: true, status: 200, statusText: "OK", text: async () => body, json: async () => JSON.parse(body) } as unknown as Response;
    }
    const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`;
    return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } });
  });
}

const base = {
  providerName: "groq" as const,
  baseUrl: "https://api.groq.com/openai/v1",
  apiKey: "gsk_TEST_KEY_ABC",
  route: "test",
  messages: [{ role: "user" as const, content: "hi" }],
  maxTokens: 1024,
};

beforeEach(() => {
  bodies = [];
  vi.stubEnv("GROQ_API_KEY", "gsk_TEST_KEY_ABC");
  __resetProviderHealthForTesting();
  registerProvider({ name: "groq", configured: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("gpt-oss requests ask for low reasoning effort", () => {
  it.each(["openai/gpt-oss-120b", "openai/gpt-oss-20b", "gpt-oss-120b"])("non-streaming %s", async (model) => {
    stubFetch(false);
    await callOpenAICompat({ ...base, model });
    expect(bodies[0]?.reasoning_effort).toBe("low");
  });

  it.each(["openai/gpt-oss-120b", "gpt-oss-120b"])("streaming %s", async (model) => {
    stubFetch(true);
    for await (const _chunk of callOpenAICompatStream({ ...base, model })) { /* drain */ }
    expect(bodies[0]?.reasoning_effort).toBe("low");
  });

  it("a non-reasoning model is not sent the parameter", async () => {
    stubFetch(false);
    await callOpenAICompat({ ...base, model: "qwen/qwen3.8-27b" });
    expect(bodies[0]).not.toHaveProperty("reasoning_effort");
  });
});
