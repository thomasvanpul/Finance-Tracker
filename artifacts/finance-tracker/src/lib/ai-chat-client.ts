// Shared SSE streaming client for /api/ai/chat.
//
// Both ai-agent.tsx (the floating assistant) and ai-coach.tsx (the
// dedicated Coach page) drive the same endpoint. Keeping the wire
// format + no-data watchdog in one place means:
//
//   1. The endpoint contract has one client-side owner. When the
//      server SSE format changes, one file changes.
//
//   2. Both surfaces get the same "20s of silence → real error
//      message" behaviour. Nobody sees a bare "Failed to fetch"
//      whose cause is invisible.
//
//   3. Neither caller can accidentally reintroduce the client-side
//      buildContext leak — no `context` field is exposed here,
//      only `path` (a short display-name string).
//
// If a third surface ever needs a non-streaming call, wrap this
// generator and collect() its tokens — don't add a JSON variant
// that would drift.

const API_BASE = import.meta.env.DEV ? "" : (import.meta.env.VITE_API_URL ?? "");

// No-bytes-received watchdog. A streaming response is fine as long
// as bytes keep flowing; what we're guarding against is the socket
// silently going dead — Render's edge, a network stall, or a hung
// provider our server's 12s cap somehow missed. 20s between events
// is deeply abnormal (the server emits progress or tokens every
// hundred ms once running).
export const NO_DATA_TIMEOUT_MS = 20_000;

// Wire shape mirrors AiChatMessage in @workspace/api-zod's ai-chat
// module. Kept hand-typed here rather than type-imported to keep
// zod out of the client bundle (a type-only import gets erased,
// but the marginal risk of drift is caught by the
// ai-chat-contract test in api-server).
export interface ChatWireMessage {
  role: "user" | "model";
  text: string;
}

// SSE event shapes emitted by the server. Type-only — the client
// consumer switches on `type` and each branch narrows.
export type ChatServerEvent =
  | { type: "progress"; stage: string; detail: string }
  | { type: "attempt"; provider: string; attemptIndex: number }
  | { type: "fallthrough"; from: string; to: string; reason: string }
  | { type: "token"; text: string }
  | { type: "done"; servingProvider: string; reducedCapacity: boolean; triedProviders: string[] }
  | { type: "cut"; servingProvider: string; reason: string; triedProviders: string[] }
  | { type: "error"; message: string; triedProviders?: string[] };

async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatServerEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let evt = "message";
      const dataLines: string[] = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) evt = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      if (dataLines.length === 0) continue;
      try {
        const data = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
        yield { type: evt, ...data } as ChatServerEvent;
      } catch {
        // Malformed data line — stay tolerant, server logs its own
        // emission failures; here we don't want to blow up the whole
        // stream on one bad frame.
      }
    }
  }
}

export interface StreamChatCallbacks {
  onEvent: (event: ChatServerEvent) => void;
  onError: (message: string) => void;
}

// One-shot insight: same wire contract as streamChat, but collects
// tokens into a single string and returns a Promise. For pages that
// only want a plain-text answer (goals coach, budget insight,
// portfolio commentary, monthly briefing, dashboard insights,
// markets TL;DR) — none of them stream a conversation, they all
// render one final answer.
//
// Same server, same context assembly, same providers, same
// telemetry. Callers pass a page-path so buildChatContext on the
// server can page-aware its framing. They pass a prompt that
// describes what they WANT, not what's true — the true stuff comes
// from the server-assembled context.
export interface OneShotInsightResult {
  text: string;
  servingProvider: string | null;
  reducedCapacity: boolean;
  cut: boolean;         // true if the stream ended early after starting
  cutReason?: string;
}

export async function oneShotInsight(opts: {
  path: string;
  prompt: string;
}): Promise<OneShotInsightResult> {
  const messages: ChatWireMessage[] = [{ role: "user", text: opts.prompt }];
  let text = "";
  let servingProvider: string | null = null;
  let reducedCapacity = false;
  let cut = false;
  let cutReason: string | undefined;
  let errorMessage: string | null = null;

  await streamChat(messages, opts.path, {
    onEvent: (event) => {
      if (event.type === "token") text += event.text;
      else if (event.type === "done") {
        servingProvider = event.servingProvider;
        reducedCapacity = event.reducedCapacity;
      } else if (event.type === "cut") {
        servingProvider = event.servingProvider;
        cut = true;
        cutReason = event.reason;
      } else if (event.type === "error") {
        errorMessage = event.message;
      }
    },
    onError: (message) => { errorMessage = message; },
  });

  if (errorMessage && !text) {
    throw new Error(errorMessage);
  }
  return { text, servingProvider, reducedCapacity, cut, cutReason };
}

export async function streamChat(
  messages: ChatWireMessage[],
  path: string,
  cb: StreamChatCallbacks,
): Promise<void> {
  const controller = new AbortController();
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const armWatchdog = (): void => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => controller.abort(), NO_DATA_TIMEOUT_MS);
  };
  armWatchdog();

  try {
    // Only role + text on the wire. Nothing else (status/caption/etc)
    // is a wire concern. If the caller passes a richer Message shape
    // (which the AI Agent does) it must map to ChatWireMessage first.
    //
    // Filter WHITESPACE-ONLY messages BEFORE sending. First iteration
    // filtered `length > 0` which passed " " through — server then
    // 400'd with "message text must not be empty" (its trim-then-check
    // rule). Both sides trim before treating a message as content:
    //   · here — filter on m.text.trim().length so " ", "\n", tabs
    //     never reach the wire
    //   · server — AiChatMessageSchema in @workspace/api-zod trims
    //     before .min(1)
    // The trim is a NORMALISATION for the emptiness check, not for
    // the payload — actual whitespace inside a non-empty message
    // (line breaks, indentation in code the user pasted) is preserved
    // and sent verbatim.
    const wireMessages: ChatWireMessage[] = messages
      .map((m) => ({ role: m.role, text: m.text }))
      .filter((m) => m.text.trim().length > 0);
    if (wireMessages.length === 0) {
      cb.onError("No message to send.");
      return;
    }
    const res = await fetch(`${API_BASE}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
      credentials: "include",
      body: JSON.stringify({ messages: wireMessages, path }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const message = (errBody as { error?: string }).error ?? `Server returned ${res.status}`;
      cb.onError(message);
      return;
    }
    if (!res.body) {
      cb.onError("Server returned an empty response stream.");
      return;
    }
    for await (const event of readSse(res.body)) {
      armWatchdog();
      cb.onEvent(event);
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      cb.onError(`The AI went silent for over ${NO_DATA_TIMEOUT_MS / 1000}s. Try again.`);
      return;
    }
    cb.onError(err instanceof Error ? err.message : String(err));
  } finally {
    if (watchdog) clearTimeout(watchdog);
  }
}
