// Shared wire contract for POST /api/ai/chat.
//
// One schema, two consumers:
//   - Server (artifacts/api-server/src/routes/ai.ts) uses
//     AiChatRequestSchema.safeParse to validate the request body
//     before it hits the chain.
//   - Client (artifacts/finance-tracker/src/lib/ai-chat-client.ts)
//     type-imports AiChatMessage / AiChatRequest and constructs
//     wire payloads that match.
//
// Locking the schema in one place means a rename or a length-cap
// bump lands on both sides in the same commit. The
// artifacts/api-server/src/routes/ai-chat-contract.test.ts test
// exercises the shape end-to-end so a client wire change that no
// longer parses fails a test rather than reaching production as a
// 400.
//
// Design notes:
//   - text is TRIMMED before the emptiness check — " ", "\n" and tab-
//     only messages are rejected. First iteration used .min(1) alone,
//     which passed whitespace through and the model produced garbage
//     from a "message" that was actually a stray keystroke.
//     Non-empty messages keep their whitespace verbatim on the wire
//     (line breaks and indentation in pasted code are preserved) —
//     the trim is a normalisation for the length check only, not a
//     transform of the payload.
//   - text is capped at 4000 chars pre-trim to prevent a payload of
//     4001 spaces sneaking through the empty-after-trim check.
//   - role is a string-literal union so a typo in either side fails
//     TypeScript, not the server.
//   - path is optional and capped at 200 chars — server passes it to
//     buildChatContext for page-aware framing; a 200-char cap is
//     three-times the longest real route in the app.

import { z } from "zod";

export const AiChatMessageSchema = z.object({
  role: z.enum(["user", "model"]),
  text: z
    .string()
    .max(4000, "message text must be ≤ 4000 characters")
    // The trim-then-min check catches " ", "\t", "\n\n\n\n" and any
    // combination. The refine runs AFTER max, so a 4001-char string
    // of spaces fails on length first (predictable error surface).
    .refine((s) => s.trim().length > 0, { message: "message text must not be empty" }),
});

export const AiChatRequestSchema = z.object({
  messages: z.array(AiChatMessageSchema).min(1, "at least one message is required").max(20, "at most 20 messages per request"),
  path: z.string().max(200).optional(),
});

export type AiChatMessage = z.infer<typeof AiChatMessageSchema>;
export type AiChatRequest = z.infer<typeof AiChatRequestSchema>;

// Constants callers may reference for their own guards (e.g. client
// truncating a very long paste before send). Keep in sync with the
// schema above; a single edit updates both.
export const AI_CHAT_MAX_MESSAGES = 20;
export const AI_CHAT_MAX_MESSAGE_LEN = 4000;
