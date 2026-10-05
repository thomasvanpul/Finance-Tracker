// A coach answer that hits the token cap must say so — audit A4, 5 Oct 2026.
//
// With AI on, the coach's answer stopped mid-sentence ("…Reducing even a
// single £10") with nothing to say it had been cut. The provider DID say:
// its stream ended finish_reason "length". openai-compat yielded that, and
// chainChatStream dropped it, so neither the route nor the page could tell
// a finished answer from one that ran out of budget. These tests hold the
// reason on the chain's done event, which the /api/ai/chat route forwards
// to the client as `finishReason`.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { chainChatStream, type ChainStreamEvent } from "./chain";
import { registerProvider, __resetProviderHealthForTesting } from "../provider-health";

function stubStream(finishReason: string | null) {
  vi.stubGlobal("fetch", async () => {
    const frames = [
      { choices: [{ delta: { content: "Reducing even a single " }, finish_reason: null }] },
      { choices: [{ delta: { content: "£10" }, finish_reason: finishReason }] },
    ];
    const sse = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join("") + "data: [DONE]\n\n";
    return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } });
  });
}

async function doneEvent(): Promise<Extract<ChainStreamEvent, { kind: "done" }>> {
  const events: ChainStreamEvent[] = [];
  for await (const ev of chainChatStream({ messages: [{ role: "user", text: "hi" }], route: "test" })) events.push(ev);
  const done = events.find((e): e is Extract<ChainStreamEvent, { kind: "done" }> => e.kind === "done");
  if (!done) throw new Error(`no done event: ${JSON.stringify(events)}`);
  return done;
}

beforeEach(() => {
  vi.stubEnv("GROQ_API_KEY", "gsk_TEST_KEY_ABC");
  vi.stubEnv("CEREBRAS_API_KEY", "csk_TEST_KEY_ABC");
  __resetProviderHealthForTesting();
  registerProvider({ name: "groq", configured: true });
  registerProvider({ name: "cerebras", configured: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("chainChatStream carries the provider's finish reason", () => {
  it("an answer cut by the token cap ends with finishReason 'length'", async () => {
    stubStream("length");
    const done = await doneEvent();
    expect(done.finishReason).toBe("length");
    expect(done.servingProvider).toBe("groq");
  });

  it("a finished answer ends with finishReason 'stop'", async () => {
    stubStream("stop");
    expect((await doneEvent()).finishReason).toBe("stop");
  });

  it("a provider that never states a reason gives null, not a guess", async () => {
    stubStream(null);
    expect((await doneEvent()).finishReason).toBeNull();
  });
});
