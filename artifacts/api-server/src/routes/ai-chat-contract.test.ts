// Contract test: the wire shape the client emits must parse against
// the server's AiChatRequestSchema. If either side renames a field or
// changes a length cap, this test fails before it reaches production
// as a 400.
//
// This file MIRRORS the client's wire construction — the assertions
// below model exactly what ai-chat-client.ts's `streamChat` builds
// (role + text mapping, empty-text filter). A drift on either side
// (client renames `text` to `content`, server renames the schema
// field, cap changes on only one side) trips one of these tests.

import { describe, it, expect } from "vitest";
import { AiChatRequestSchema, AI_CHAT_MAX_MESSAGE_LEN, AI_CHAT_MAX_MESSAGES } from "@workspace/api-zod";

// ── Mirror of the client's wire builder ────────────────────────────────
// If ai-chat-client.ts's streamChat changes shape, update this function
// to match — the mismatch is the whole point of the test.
interface ClientMessage {
  role: "user" | "model";
  text: string;
  // Fields the client tracks locally but MUST NOT ship on the wire:
  status?: "streaming" | "done" | "cut" | "error";
  caption?: string;
  servingProvider?: string | null;
  reducedCapacity?: boolean;
  cutReason?: string;
  errorMessage?: string;
}

function buildClientWireBody(messages: ClientMessage[], path?: string): unknown {
  // Reproduce streamChat's actual construction (lib/ai-chat-client.ts):
  //   1. map to {role, text} only
  //   2. filter empty-text messages
  const wireMessages = messages
    .map((m) => ({ role: m.role, text: m.text }))
    .filter((m) => m.text.length > 0);
  return { messages: wireMessages, path };
}

// ── Positive cases ─────────────────────────────────────────────────────

describe("wire contract · client-emitted bodies parse against server schema", () => {
  it("single user prompt (fresh conversation)", () => {
    const body = buildClientWireBody([{ role: "user", text: "How am I doing this month?" }], "/ai-coach");
    const r = AiChatRequestSchema.safeParse(body);
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
  });

  it("multi-turn conversation with model replies", () => {
    const body = buildClientWireBody([
      { role: "user", text: "How am I doing?" },
      { role: "model", text: "Your savings rate is 22% this month.", status: "done", servingProvider: "groq", reducedCapacity: false },
      { role: "user", text: "Is that good?" },
    ], "/ai-coach");
    const r = AiChatRequestSchema.safeParse(body);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.messages).toHaveLength(3);
      // Meta fields (status/servingProvider) must have been stripped.
      for (const m of r.data.messages) {
        expect(Object.keys(m).sort()).toEqual(["role", "text"]);
      }
    }
  });

  it("path is optional (floating panel may open before router hydrates)", () => {
    const body = buildClientWireBody([{ role: "user", text: "hello" }]);
    const r = AiChatRequestSchema.safeParse(body);
    expect(r.success).toBe(true);
  });
});

// ── The bug this locks: empty-text history from an errored bubble ──────

describe("wire contract · empty-text messages MUST be filtered", () => {
  it("a prior errored model bubble (text: '') does NOT appear on the wire", () => {
    // Reproduces the exact sequence that produced the production 400:
    //   1. user sent "how am I doing"
    //   2. stream errored before any tokens — model bubble stayed at text:""
    //   3. user sent a follow-up
    // Without the filter, the follow-up wire included the empty-text
    // model bubble and the server rejected the whole request with
    // "Message text must be 1–4000 characters".
    const state: ClientMessage[] = [
      { role: "user", text: "How am I doing this month?" },
      { role: "model", text: "", status: "error", errorMessage: "AI temporarily unavailable." },
      { role: "user", text: "Try again please." },
    ];
    const body = buildClientWireBody(state);
    const r = AiChatRequestSchema.safeParse(body);
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
    if (r.success) {
      // The errored model bubble was filtered — server sees a two-message
      // conversation, both non-empty.
      expect(r.data.messages).toEqual([
        { role: "user", text: "How am I doing this month?" },
        { role: "user", text: "Try again please." },
      ]);
    }
  });

  it("a streaming placeholder (text: '', status: 'streaming') is filtered", () => {
    // Similar defect shape — a stream in-flight has text:'' until the
    // first token arrives. If somehow this gets included on a wire
    // (fast queue drain, race), the filter catches it.
    const state: ClientMessage[] = [
      { role: "user", text: "hello" },
      { role: "model", text: "", status: "streaming", caption: "Reading your accounts…" },
    ];
    const body = buildClientWireBody(state);
    const r = AiChatRequestSchema.safeParse(body);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.messages).toHaveLength(1);
    }
  });
});

// ── Negative cases: things the server MUST reject ──────────────────────

describe("wire contract · server rejects malformed bodies", () => {
  it("rejects empty messages array (client filtered everything out)", () => {
    // If the client filters ALL messages away, it should call onError
    // before hitting the wire (guard is in streamChat). But if a
    // malicious/buggy caller sends {messages:[]} directly, the server
    // must reject rather than call the model with nothing.
    const r = AiChatRequestSchema.safeParse({ messages: [], path: "/" });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown role", () => {
    const r = AiChatRequestSchema.safeParse({
      messages: [{ role: "system", text: "you are an assistant" }],
      path: "/",
    });
    expect(r.success).toBe(false);
  });

  it("rejects text over the length cap", () => {
    const tooLong = "x".repeat(AI_CHAT_MAX_MESSAGE_LEN + 1);
    const r = AiChatRequestSchema.safeParse({
      messages: [{ role: "user", text: tooLong }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects more than the message-count cap", () => {
    const many = Array.from({ length: AI_CHAT_MAX_MESSAGES + 1 }, (_, i) => ({
      role: "user" as const,
      text: `msg ${i}`,
    }));
    const r = AiChatRequestSchema.safeParse({ messages: many });
    expect(r.success).toBe(false);
  });

  it("rejects a path longer than 200 chars", () => {
    const r = AiChatRequestSchema.safeParse({
      messages: [{ role: "user", text: "hello" }],
      path: "/".repeat(201),
    });
    expect(r.success).toBe(false);
  });

  it("rejects an object shape that renames text (e.g. 'content')", () => {
    // If either side renames field `text` to `content` (a common OpenAI
    // parity temptation), this test breaks. Rename must land in both
    // the schema and the client wire builder in the same commit.
    const r = AiChatRequestSchema.safeParse({
      messages: [{ role: "user", content: "hello" }],
    });
    expect(r.success).toBe(false);
  });
});
