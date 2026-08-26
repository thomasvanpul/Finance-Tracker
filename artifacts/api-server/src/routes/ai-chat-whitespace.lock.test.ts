// Source-level lock: the client's whitespace filter.
//
// WHY THIS FILE EXISTS, AND WHY ai-chat-contract.test.ts IS NOT ENOUGH.
//
// ai-chat-contract.test.ts asserts the wire shape against a LOCAL
// re-implementation of the client's filter (`buildClientWireBody`).
// That mirror cannot fail when the source it mirrors regresses.
// Proven on 2026-08-23 by injecting the exact historical defect into
// artifacts/finance-tracker/src/lib/ai-chat-client.ts:
//
//     .filter((m) => m.text.trim().length > 0)   ->   .filter((m) => m.text.length > 0)
//
// and running both suites: 291 api-server + 148 frontend, all green.
// The mirror stayed green because it never reads the file it claims
// to mirror. A lock that has never failed proves nothing.
//
// This lock reads ai-chat-client.ts off disk and asserts on the text
// of the filter itself, exactly as ai-context.leak-lock.test.ts reads
// SPA source to enforce endpoint ownership. Reintroducing the untrimmed
// filter fails here.
//
// THE DEFECT BEING LOCKED
//   A whitespace-only message (" ", "\n", "\t") passes an untrimmed
//   length check, reaches the wire, and is rejected by the server's
//   trim-then-refine rule as "message text must not be empty". The
//   user sees a hung follow-up. Both sides must trim before treating
//   text as content. The trim NORMALISES the emptiness check only —
//   a non-empty message keeps its internal whitespace verbatim on the
//   wire (line breaks and indentation in pasted code are preserved).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), "..", "..", "..", "..");
const CLIENT_REL = "artifacts/finance-tracker/src/lib/ai-chat-client.ts";
const CLIENT_ABS = join(REPO_ROOT, CLIENT_REL);

function clientSource(): string {
  return readFileSync(CLIENT_ABS, "utf-8");
}

function lineOf(text: string, pattern: RegExp): number | null {
  const m = pattern.exec(text);
  return m ? text.slice(0, m.index).split("\n").length : null;
}

describe("AI chat whitespace lock · the SHIPPED client filter, read from disk", () => {
  it("ai-chat-client.ts exists at the path this lock guards", () => {
    // If the file moves, this lock silently stops guarding anything.
    // Fail loudly instead so the mover updates CLIENT_REL.
    expect(() => clientSource(), `${CLIENT_REL} not found — if it moved, update CLIENT_REL in this lock`).not.toThrow();
  });

  it("the wire filter trims before the emptiness check", () => {
    const src = clientSource();
    const trimmed = /\.filter\(\s*\(\s*m\s*\)\s*=>\s*m\.text\.trim\(\)\.length\s*>\s*0\s*\)/;
    if (!trimmed.test(src)) {
      throw new Error(
        `${CLIENT_REL} no longer filters on m.text.trim().length > 0.\n\n` +
        `A whitespace-only message would reach the wire and the server would 400 with ` +
        `"message text must not be empty", which surfaces to the user as a hung follow-up. ` +
        `Restore the trim. Do NOT resolve this by relaxing the server schema — the server's ` +
        `refine is the belt to this filter's braces, and both are required.`,
      );
    }
    expect(trimmed.test(src)).toBe(true);
  });

  it("no untrimmed length check survives anywhere in the file", () => {
    // The regression shape is a filter/guard on `.text.length > 0`
    // WITHOUT the .trim(). Catch it wherever it appears, not just at
    // the one call site, so a second copy cannot creep in.
    const src = clientSource();
    const untrimmed = /\.text\.length\s*>\s*0/;
    const line = lineOf(src, untrimmed);
    if (line !== null) {
      throw new Error(
        `${CLIENT_REL}:${line} checks .text.length > 0 without trimming. ` +
        `" " has length 1 and passes this check. Use .text.trim().length > 0.`,
      );
    }
    expect(line).toBeNull();
  });

  it("the empty-wire guard still short-circuits before fetch", () => {
    // Trimming alone is not the whole fix: once whitespace-only
    // messages are filtered out the array can be empty, and posting
    // an empty array 400s on the schema's messages.min(1). The client
    // must fail fast with its own message instead.
    const src = clientSource();
    expect(
      /wireMessages\.length\s*===\s*0/.test(src),
      `${CLIENT_REL} lost the empty-wire guard. After filtering, an all-whitespace ` +
      `conversation yields [] and the server 400s on messages.min(1). Keep the ` +
      `local short-circuit so the user gets a real message, not a server error.`,
    ).toBe(true);
  });

  it("the guard's short-circuit precedes the fetch call in source order", () => {
    // Guard AFTER the fetch is the same defect wearing the right words.
    // Accept `/api/ai/chat` in a string literal ("…"), a template literal
    // (`…`) or the apiFetch("…") form added in G13 · 3/5 — the invariant
    // is guard-before-fetch, not a specific quote character.
    const src = clientSource();
    const guardAt = src.indexOf("wireMessages.length === 0");
    const fetchMatch = /(?:apiFetch|fetch)\(["'`]\/api\/ai\/chat/.exec(src);
    expect(guardAt, "empty-wire guard not found").toBeGreaterThan(-1);
    expect(fetchMatch, "fetch/apiFetch to /api/ai/chat not found").not.toBeNull();
    const fetchAt = fetchMatch!.index;
    expect(
      guardAt < fetchAt,
      `${CLIENT_REL}: the empty-wire guard must run BEFORE the fetch, not after it.`,
    ).toBe(true);
  });
});

describe("AI chat whitespace lock · the server half must stay in place", () => {
  it("AiChatMessageSchema trims before the non-empty check", () => {
    const schema = readFileSync(join(REPO_ROOT, "lib", "api-zod", "src", "ai-chat.ts"), "utf-8");
    expect(
      /\.refine\(\s*\(\s*s\s*\)\s*=>\s*s\.trim\(\)\.length\s*>\s*0/.test(schema),
      `lib/api-zod/src/ai-chat.ts lost its trim-then-refine on message text. ` +
      `A bare .min(1) accepts " " (length 1) and forwards a stray keystroke to the model.`,
    ).toBe(true);
  });

  it("the length cap runs before the emptiness refine, so 4001 spaces fails on length", () => {
    const schema = readFileSync(join(REPO_ROOT, "lib", "api-zod", "src", "ai-chat.ts"), "utf-8");
    const maxAt = schema.indexOf(".max(4000");
    const refineAt = schema.indexOf(".refine(");
    expect(maxAt, ".max(4000) not found in schema").toBeGreaterThan(-1);
    expect(refineAt, ".refine() not found in schema").toBeGreaterThan(-1);
    expect(
      maxAt < refineAt,
      `lib/api-zod/src/ai-chat.ts: .max must precede .refine so an oversized ` +
      `whitespace payload fails on length first and the error surface stays predictable.`,
    ).toBe(true);
  });
});
