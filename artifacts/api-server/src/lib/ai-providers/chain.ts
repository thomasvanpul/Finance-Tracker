// AI provider chain dispatch.
//
// Each task (chat, categorize, vision) walks a fixed provider order
// and takes the first success. On fall-through, the response carries
// reducedCapacity=true so the UI can render a quiet "reduced capacity"
// state — same principle as the market stale-serve pattern: degraded
// is fine, degraded-and-silent is not. That's especially load-bearing
// with Cerebras (5 RPM free-tier cap) as our second lane: fine for
// current scale, would bind hard at ~50 concurrent users, and the
// operator + user both need to know when we're serving from there.
//
// ── Provider order per task ──
// Same order (Groq → Cerebras → OpenRouter) for all three. Groq's the
// primary because of headroom (30 RPM claimed, gpt-oss-* family
// current); Cerebras is a real second (OpenAI-compatible, actually
// serves, 5 RPM but fast inference); OpenRouter is the tertiary
// backstop (20 RPM / 50 RPD free-tier, all vendor-hosted open models,
// OpenAI-compatible so no translation).
//
// (Gemini was the tertiary until 2026-08-23. Removed because this
// account's key was AQ.-prefixed and the Generative Language REST
// API only accepts AIza — a permanently red lane made /api/ai/status
// dishonest. OpenRouter uses a genuinely working key, closing the
// "third lane exists but never serves" gap.)
//
// If a provider's breaker is open, key is missing, or model was not
// verified at boot, withProvider() throws pre-flight — the chain
// catches, records, moves on. No wasted latency on a known-dead lane.
//
// ── Return shape ──
// { ok, text, servingProvider, reducedCapacity, triedProviders }
//   servingProvider   — which provider actually answered (null if all failed)
//   reducedCapacity   — true iff servingProvider is NOT the primary
//                       ("groq" for every task today)
//   triedProviders    — in-order attempt list, for logs
//
// The route layer forwards servingProvider + reducedCapacity to the
// client so the UI can render the reduced-capacity chrome.

import { logger } from "../logger";
import { groqChat, groqChatStream, groqCategorize, groqVision } from "./groq";
import { cerebrasChat, cerebrasChatStream, cerebrasCategorize, cerebrasVision } from "./cerebras";
import { openrouterChat, openrouterChatStream, openrouterCategorize, openrouterVision } from "./openrouter";
import type { AiCallResult, AiProviderName, ChainResult, ChatMessage } from "./types";
import type { OpenAiMessage, OpenAiStreamChunk } from "./openai-compat";

// One order for every task. If a task ever needs a different chain
// (e.g. vision skipping a text-only provider) we override per-task.
// Today all three tasks use the same three-provider walk because
// Groq/Cerebras/OpenRouter all support text, image, and JSON output
// via their OpenAI-compatible endpoints.
const CHAIN_ORDER: AiProviderName[] = ["groq", "cerebras", "openrouter"];
const PRIMARY: AiProviderName = "groq";

// Walk providers in order, take first success. Every attempt is
// logged with its outcome so the fallthrough is diagnosable from
// logs alone. On total failure returns servingProvider=null and
// the caller renders the client-facing generic error.
async function walk(opts: {
  route: string;
  order?: AiProviderName[];
  attempt: (provider: AiProviderName) => Promise<AiCallResult>;
}): Promise<ChainResult> {
  const order = opts.order ?? CHAIN_ORDER;
  const tried: AiProviderName[] = [];
  for (const provider of order) {
    tried.push(provider);
    try {
      const result = await opts.attempt(provider);
      if (result.ok) {
        const reduced = provider !== PRIMARY;
        if (reduced) {
          logger.warn(
            { route: opts.route, servingProvider: provider, tried, primary: PRIMARY },
            "AI chain fell through to fallback provider — reducedCapacity=true",
          );
        } else {
          logger.info({ route: opts.route, servingProvider: provider }, "AI chain served from primary");
        }
        return {
          ok: true,
          text: result.text,
          servingProvider: provider,
          reducedCapacity: reduced,
          triedProviders: tried,
        };
      }
      // Adapter returned ok:false without throwing — unusual but
      // possible if it caught internally. Move on.
      logger.info(
        { route: opts.route, provider, diagnostic: result.diagnostic },
        "AI provider returned ok:false, chain continues",
      );
    } catch (err) {
      // withProvider throws for breaker-open / no-key / upstream
      // errors. Chain records and continues to next lane. This is
      // the load-bearing path: never let one provider's failure
      // fail the whole request when we have others.
      const message = err instanceof Error ? err.message : String(err);
      logger.info(
        { route: opts.route, provider, err: message },
        "AI provider threw, chain continues",
      );
    }
  }
  logger.error(
    { route: opts.route, tried },
    "AI chain exhausted every provider — request fails",
  );
  return { ok: false, text: "", servingProvider: null, reducedCapacity: false, triedProviders: tried };
}

// Translate the neutral ChatMessage shape into OpenAI message shape,
// prepending the system prompt (if any) as a leading system message.
// All three current providers are OpenAI-compatible and accept a
// system message in the messages array — one translator serves all.
function toOpenAiMessages(messages: ChatMessage[], systemPrompt?: string): OpenAiMessage[] {
  const out: OpenAiMessage[] = [];
  if (systemPrompt) out.push({ role: "system", content: systemPrompt });
  for (const m of messages) {
    const role = m.role === "model" ? "assistant" : m.role;
    out.push({ role: role as "user" | "assistant" | "system", content: m.text });
  }
  return out;
}

// ── Chat ──────────────────────────────────────────────────────────────────
// System prompt owned by the route layer (ai.ts) and passed in — the
// chain doesn't opine on prompt content, only on transport.
export async function chainChat(opts: {
  messages: ChatMessage[];
  systemPrompt?: string;
  route: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<ChainResult> {
  return walk({
    route: opts.route,
    attempt: async (provider) => {
      const openAi = toOpenAiMessages(opts.messages, opts.systemPrompt);
      const fn =
        provider === "groq" ? groqChat
        : provider === "cerebras" ? cerebrasChat
        : openrouterChat;
      return fn({
        messages: openAi,
        route: opts.route,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
      });
    },
  });
}

// ── Streaming chat ────────────────────────────────────────────────────────
// Same walk order as chainChat, with one added invariant: once ANY
// tokens have been yielded from a provider, we do NOT fall through
// on a later error. Falling through mid-stream would swap the model
// producing the answer partway through, and the user would see a
// hybrid of two different completions — a lie about what came from
// where. Cut the stream instead. If provider A errors before its
// first token, we can safely fall through (client has seen nothing
// from A yet). Client renders errors from `error` events.

export type ChainStreamEvent =
  | { kind: "attempt"; provider: AiProviderName; attemptIndex: number }
  | { kind: "fallthrough"; from: AiProviderName; to: AiProviderName; reason: string }
  | { kind: "token"; text: string }
  | { kind: "done"; servingProvider: AiProviderName; reducedCapacity: boolean; triedProviders: AiProviderName[] }
  | { kind: "cut"; servingProvider: AiProviderName; reason: string; triedProviders: AiProviderName[] }
  | { kind: "exhausted"; triedProviders: AiProviderName[] };

export async function* chainChatStream(opts: {
  messages: ChatMessage[];
  systemPrompt?: string;
  route: string;
  maxTokens?: number;
  temperature?: number;
}): AsyncGenerator<ChainStreamEvent> {
  const openAi = toOpenAiMessages(opts.messages, opts.systemPrompt);
  const order = CHAIN_ORDER;
  const tried: AiProviderName[] = [];
  let previousProvider: AiProviderName | null = null;

  for (let i = 0; i < order.length; i++) {
    const provider = order[i];
    tried.push(provider);
    if (previousProvider) {
      yield { kind: "fallthrough", from: previousProvider, to: provider, reason: "previous provider failed before any tokens" };
    }
    yield { kind: "attempt", provider, attemptIndex: i };

    let tokensEmitted = 0;
    try {
      const streamFn =
        provider === "groq" ? groqChatStream
        : provider === "cerebras" ? cerebrasChatStream
        : openrouterChatStream;
      const stream = streamFn({
        messages: openAi,
        route: opts.route,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
      });
      for await (const chunk of stream) {
        if (chunk.kind === "token") {
          tokensEmitted += 1;
          yield { kind: "token", text: chunk.text };
        } else if (chunk.kind === "done") {
          // Success — stream ended cleanly.
          const reduced = provider !== PRIMARY;
          if (reduced) {
            logger.warn(
              { route: opts.route, servingProvider: provider, tried, primary: PRIMARY, tokensEmitted },
              "AI chain (streaming) served from fallback provider — reducedCapacity=true",
            );
          } else {
            logger.info({ route: opts.route, servingProvider: provider, tokensEmitted }, "AI chain (streaming) served from primary");
          }
          yield { kind: "done", servingProvider: provider, reducedCapacity: reduced, triedProviders: tried };
          return;
        }
      }
      // Stream ended without an explicit "done" chunk — treat as clean
      // completion if we got tokens, otherwise fall through.
      if (tokensEmitted > 0) {
        const reduced = provider !== PRIMARY;
        yield { kind: "done", servingProvider: provider, reducedCapacity: reduced, triedProviders: tried };
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (tokensEmitted > 0) {
        // Mid-stream failure. Do NOT fall through — swapping providers
        // now would blend two different completions. Cut cleanly and
        // tell the caller.
        logger.warn(
          { route: opts.route, provider, tokensEmitted, err: message },
          "AI chain (streaming) provider failed mid-stream — cutting cleanly, not falling through",
        );
        yield { kind: "cut", servingProvider: provider, reason: message, triedProviders: tried };
        return;
      }
      // No tokens emitted — safe to move on.
      logger.info(
        { route: opts.route, provider, err: message },
        "AI provider (streaming) threw before first token, chain continues",
      );
      previousProvider = provider;
      continue;
    }
    previousProvider = provider;
  }

  logger.error({ route: opts.route, tried }, "AI chain (streaming) exhausted every provider — request fails");
  yield { kind: "exhausted", triedProviders: tried };
}

// ── Categorize ────────────────────────────────────────────────────────────
// Single-prompt batch call. Uses Groq's smaller/faster gpt-oss-20b by
// default (via GROQ_CATEGORIZE_MODEL) since categorize is high-volume
// cheap work; falls through to Cerebras (chat model) then OpenRouter
// (nano 9b by default — same small/fast role as Groq's categorize).

export async function chainCategorize(opts: {
  prompt: string;
  route: string;
  maxTokens?: number;
}): Promise<ChainResult> {
  return walk({
    route: opts.route,
    attempt: async (provider) => {
      const fn =
        provider === "groq" ? groqCategorize
        : provider === "cerebras" ? cerebrasCategorize
        : openrouterCategorize;
      return fn({ prompt: opts.prompt, route: opts.route, maxTokens: opts.maxTokens });
    },
  });
}

// ── Vision ────────────────────────────────────────────────────────────────
// Receipt scan / receipt split. All three providers support vision:
//   Groq       → qwen/qwen3.6-27b (5 images/req, 20MB)
//   Cerebras   → gemma-4-31b       (2 images/req, 4MB)
//   OpenRouter → google/gemma-4-31b:free (same architecture as Cerebras,
//                different infra route — real redundancy at the
//                platform level even if the model family is the same)
// One image per request in all our current callers.

export async function chainVision(opts: {
  imageBase64: string;
  mimeType: string;
  prompt: string;
  route: string;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<ChainResult> {
  return walk({
    route: opts.route,
    attempt: async (provider) => {
      const fn =
        provider === "groq" ? groqVision
        : provider === "cerebras" ? cerebrasVision
        : openrouterVision;
      return fn(opts);
    },
  });
}
