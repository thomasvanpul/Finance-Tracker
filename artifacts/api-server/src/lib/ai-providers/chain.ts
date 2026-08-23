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
// Same order (Groq → Cerebras → Gemini) for all three. Groq's the
// primary because of headroom (30 RPM claimed, gpt-oss-* family
// current); Cerebras is a real second (OpenAI-compatible, actually
// serves, 5 RPM but fast inference); Gemini stays as backstop
// because it works once a valid AIza key exists.
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
import { groqChat, groqCategorize, groqVision } from "./groq";
import { cerebrasChat, cerebrasCategorize, cerebrasVision } from "./cerebras";
import { geminiChat, geminiCategorize, geminiVision } from "./gemini-shim";
import type { AiCallResult, AiProviderName, ChainResult, ChatMessage } from "./types";
import type { OpenAiMessage } from "./openai-compat";

// One order for every task. If a task ever needs a different chain
// (e.g. vision skipping a text-only provider) we override per-task.
// Today all three tasks use the same three-provider walk because
// Groq/Cerebras/Gemini all support text, image, and JSON output.
const CHAIN_ORDER: AiProviderName[] = ["groq", "cerebras", "gemini"];
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

// ── Chat ──────────────────────────────────────────────────────────────────
// Groq/Cerebras use OpenAI message shape; Gemini uses its own
// (user/model roles, parts). The adapter layer translates so the
// route layer only builds one prompt shape.

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
      if (provider === "groq" || provider === "cerebras") {
        // Translate ChatMessage → OpenAI message shape. The
        // system prompt becomes a leading "system" message (both
        // Groq and Cerebras accept it in the messages array).
        const openAi: OpenAiMessage[] = [];
        if (opts.systemPrompt) openAi.push({ role: "system", content: opts.systemPrompt });
        for (const m of opts.messages) {
          const role = m.role === "model" ? "assistant" : m.role === "system" ? "system" : m.role;
          openAi.push({ role: role as "user" | "assistant" | "system", content: m.text });
        }
        const fn = provider === "groq" ? groqChat : cerebrasChat;
        return fn({
          messages: openAi,
          route: opts.route,
          maxTokens: opts.maxTokens,
          temperature: opts.temperature,
        });
      }
      // provider === "gemini": Gemini expects user/model roles.
      // System prompt goes into systemInstruction separately, not
      // as a message.
      const geminiMessages = opts.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          text: m.text,
        })) as Array<{ role: "user" | "model"; text: string }>;
      return geminiChat({
        messages: geminiMessages,
        systemPrompt: opts.systemPrompt,
        route: opts.route,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
      });
    },
  });
}

// ── Categorize ────────────────────────────────────────────────────────────
// Single-prompt batch call. Uses Groq's smaller/faster gpt-oss-20b by
// default (via GROQ_CATEGORIZE_MODEL) since categorize is high-volume
// cheap work; falls through to Cerebras (chat model) then Gemini.

export async function chainCategorize(opts: {
  prompt: string;
  route: string;
  maxTokens?: number;
}): Promise<ChainResult> {
  return walk({
    route: opts.route,
    attempt: async (provider) => {
      if (provider === "groq") return groqCategorize({ prompt: opts.prompt, route: opts.route, maxTokens: opts.maxTokens });
      if (provider === "cerebras") return cerebrasCategorize({ prompt: opts.prompt, route: opts.route, maxTokens: opts.maxTokens });
      return geminiCategorize({ prompt: opts.prompt, route: opts.route, maxTokens: opts.maxTokens });
    },
  });
}

// ── Vision ────────────────────────────────────────────────────────────────
// Receipt scan / receipt split. All three providers support vision:
//   Groq     → qwen/qwen3.6-27b (5 images/req, 20MB)
//   Cerebras → gemma-4-31b       (2 images/req, 4MB)
//   Gemini   → gemini-3.7-flash
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
      if (provider === "groq") return groqVision(opts);
      if (provider === "cerebras") return cerebrasVision(opts);
      return geminiVision({
        imageBase64: opts.imageBase64,
        mimeType: opts.mimeType,
        prompt: opts.prompt,
        route: opts.route,
        maxTokens: opts.maxTokens,
      });
    },
  });
}
