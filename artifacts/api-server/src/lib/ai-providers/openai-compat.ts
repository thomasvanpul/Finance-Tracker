// Shared caller for OpenAI-compatible chat completions endpoints.
//
// Groq (api.groq.com/openai/v1) and Cerebras (api.cerebras.ai/v1) both
// speak the OpenAI shape: same request body (model + messages), same
// bearer-token auth, same response (choices[0].message.content). One
// helper serves both; the provider adapters (groq.ts, cerebras.ts)
// just supply baseUrl and defaults.
//
// ── Per-fetch timeout ────────────────────────────────────────────────────
// PROVIDER_TIMEOUT_MS caps each fetch (connection + body read) with an
// AbortController. Without it, a hung provider silently stacks its full
// wait across every lane in the chain: Groq 60s + Cerebras 60s + OpenRouter
// 60s = 180s of dead air before we serve the client failure, while
// Render's edge (and every browser's patience) closes the socket long
// before that. A chain built for redundancy shouldn't become slower than
// a single provider under failure — this cap enforces that. 12s is
// generous for a first token AND leaves room for two fallthroughs
// inside a sensible total.
//
// Wrapped in withProvider() from provider-health.ts so the shared
// circuit breaker and per-provider health registry apply — identical
// treatment to the market-data chain in lib/market-adapters.ts.
//
// ── Error surfacing ────────────────────────────────────────────────────────
// Every failure path (fetch throws, non-2xx, 2xx with empty body,
// missing content, key echoed in an error body) is logged at warn
// level with the route + provider + upstream body, and returned in
// diagnostic. Same rule as callGemini — the operator gets the detail,
// the caller (chain.ts) gets a clean ok/text/diagnostic tuple, the
// client sees only the generic "AI temporarily unavailable" message
// when the whole chain fails.
//
// ── Vision (image_url content parts) ──────────────────────────────────────
// The messages array accepts either a plain-text string OR an OpenAI
// content-parts array with text + image_url parts. Callers doing OCR
// build the parts array; chat callers pass strings. The response is
// always text — vision models return a text description/JSON of what
// they saw.

import { withProvider } from "../provider-health";
import { logger } from "../logger";
import type { AiCallResult } from "./types";

// 12s per provider fetch. Chain of three providers gives a worst-case
// upper bound of 36s (12s × 3) plus context assembly + serving overhead.
// Well under Render's socket idle timeout (~100s free / 300s paid) so
// even the worst case surfaces as an honest "AI temporarily unavailable"
// response rather than a browser-side "Failed to fetch".
export const PROVIDER_TIMEOUT_MS = 12_000;

export interface OpenAiContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}
export type OpenAiMessageContent = string | OpenAiContentPart[];

export interface OpenAiMessage {
  role: "system" | "user" | "assistant";
  content: OpenAiMessageContent;
}

export interface CallOpenAiCompatOpts {
  // Provider name registered via registerProvider() so withProvider can
  // find its breaker state. Must match exactly.
  providerName: "groq" | "cerebras" | "openrouter";
  // Base URL WITHOUT trailing slash, WITHOUT /chat/completions.
  //   Groq:       https://api.groq.com/openai/v1
  //   Cerebras:   https://api.cerebras.ai/v1
  //   OpenRouter: https://openrouter.ai/api/v1
  baseUrl: string;
  apiKey: string;
  model: string;
  route: string; // e.g. "ai.chat", "ai.receipt-scan" — for log correlation
  messages: OpenAiMessage[];
  maxTokens?: number;
  temperature?: number;
  // response_format: { type: "json_object" } tells the model to
  // return valid JSON. Both Groq and Cerebras honour it for the
  // OpenAI-compatible endpoint.
  jsonMode?: boolean;
}

// Redact API key from any string that might be logged. Belt-and-braces
// — bearer auth shouldn't put the key in URLs or response bodies, but
// a stack trace from a network layer could still capture the header
// value. Matches the callGemini pattern.
function redactKey(text: string, apiKey: string): string {
  if (!apiKey || apiKey.length < 8) return text;
  return text.split(apiKey).join(`[${apiKey.slice(0, 4).toUpperCase()}_KEY_REDACTED]`);
}

// OpenAI-compatible response shape. Only the fields we consume.
interface ChatCompletion {
  choices?: Array<{
    message?: { content?: string };
    // Both Groq and Cerebras include finish_reason; useful in diagnostics
    // when the model was cut off vs completed vs refused.
    finish_reason?: string;
  }>;
  error?: { message?: string; type?: string; code?: string };
}

// ── Streaming variant ────────────────────────────────────────────────────
// Groq, Cerebras, and OpenRouter all implement OpenAI's SSE-format
// chat completions stream. Each delta arrives as one `data: {...}` line
// terminated by an empty line, and the stream ends with `data: [DONE]`.
// We yield {kind: "token"} for each content chunk and {kind: "done"} on
// completion — the chain layer consumes both to build the final result.
//
// AbortController semantics: same 12s per-provider cap as the non-
// streaming path. undici propagates the signal into body-read cursors,
// so a hung stream (headers arrive but no data flows) still aborts.
//
// Partial-stream failure: if we've already yielded tokens and then the
// stream dies, we throw. The chain sees the throw and MUST NOT
// fall through in that state — the client already saw partial text
// from provider A; producing a full different answer from provider B
// would be a lie about what came from where. Chain layer enforces
// this by tracking "tokensEmitted" before deciding to fall through.

export type OpenAiStreamChunk =
  | { kind: "token"; text: string }
  | { kind: "done"; finishReason: string | null };

interface StreamedDelta {
  choices?: Array<{
    delta?: { content?: string; role?: string };
    finish_reason?: string | null;
  }>;
  error?: { message?: string };
}

export async function* callOpenAICompatStream(opts: CallOpenAiCompatOpts): AsyncGenerator<OpenAiStreamChunk> {
  const url = `${opts.baseUrl}/chat/completions`;
  const body = {
    model: opts.model,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.7,
    stream: true,
    ...(opts.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
  };

  // We can't wrap the generator body in withProvider() the same way as
  // the non-streaming call — withProvider expects a Promise, and a
  // generator's error handling has to be explicit around the fetch.
  // We still respect the breaker: if withProvider's inner check fails
  // pre-flight (unregistered / open breaker / missing key) the wrapper
  // below throws before we start.
  const check = await withProvider(opts.providerName, async () => "ok" as const);
  if (check !== "ok") {
    // withProvider would have thrown; this branch is unreachable but
    // keeps the type checker happy.
    throw new Error("provider pre-flight failed");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${opts.apiKey}`,
          "Accept": "text/event-stream",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "AbortError";
      if (timedOut) {
        logger.warn(
          { provider: opts.providerName, route: opts.route, model: opts.model, timeoutMs: PROVIDER_TIMEOUT_MS },
          "openai-compat stream fetch timed out — chain will try next provider",
        );
        throw new Error(`timeout after ${PROVIDER_TIMEOUT_MS}ms`);
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`stream fetch threw: ${redactKey(message, opts.apiKey)}`);
    }

    if (!response.ok) {
      let respBody = "";
      try { respBody = await response.text(); } catch { /* ignore */ }
      const safeBody = redactKey(respBody, opts.apiKey).slice(0, 1000);
      logger.warn(
        { provider: opts.providerName, route: opts.route, model: opts.model, status: response.status, body: safeBody },
        "openai-compat stream returned non-2xx",
      );
      throw new Error(`HTTP ${response.status}: ${safeBody.slice(0, 200)}`);
    }
    if (!response.body) throw new Error("stream response had no body");

    // SSE parser: split on \n\n event boundaries, dispatch `data:` lines.
    // The provider may pack multiple `data:` lines into one event; take
    // the last one (per SSE spec). We accumulate a text buffer across
    // reads because a chunk boundary can land mid-line.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done = false;
    let finishReason: string | null = null;
    let tokensEmitted = 0;
    while (!done) {
      const { value, done: readerDone } = await reader.read();
      if (readerDone) break;
      buffer += decoder.decode(value, { stream: true });
      // Extract complete SSE events (terminated by \n\n).
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        // Collect data: lines. Ignore comments (:) and event: lines
        // (OpenAI-compat streams don't use `event:` — everything comes
        // on the default `message` event, so we don't need to route).
        const dataLines: string[] = [];
        for (const line of rawEvent.split("\n")) {
          if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        }
        if (dataLines.length === 0) continue;
        const dataPayload = dataLines.join("\n");
        if (dataPayload === "[DONE]") {
          done = true;
          break;
        }
        let parsed: StreamedDelta;
        try {
          parsed = JSON.parse(dataPayload) as StreamedDelta;
        } catch {
          // Provider sent malformed JSON mid-stream. If we haven't
          // emitted any tokens, throw so the chain can move on. If
          // we've already emitted, cut the stream cleanly rather
          // than crashing the client.
          if (tokensEmitted === 0) throw new Error("malformed stream payload");
          logger.warn(
            { provider: opts.providerName, route: opts.route, tokensEmitted, sample: dataPayload.slice(0, 200) },
            "openai-compat stream: malformed payload mid-stream, cutting",
          );
          done = true;
          break;
        }
        if (parsed.error) {
          const safeErr = redactKey(parsed.error.message ?? "", opts.apiKey);
          if (tokensEmitted === 0) throw new Error(`stream error: ${safeErr}`);
          logger.warn(
            { provider: opts.providerName, route: opts.route, tokensEmitted, err: safeErr },
            "openai-compat stream: error payload after tokens started, cutting",
          );
          done = true;
          break;
        }
        const choice = parsed.choices?.[0];
        if (!choice) continue;
        const text = choice.delta?.content;
        if (typeof text === "string" && text.length > 0) {
          tokensEmitted += 1;
          yield { kind: "token", text };
        }
        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }
      }
    }
    // Some providers close the stream without sending `[DONE]` after
    // finish_reason — treat that as a normal completion.
    if (tokensEmitted === 0) {
      // Zero content on a "successful" stream is the same failure the
      // non-streaming path guards against — refuse it so the chain
      // falls through to the next provider.
      throw new Error(`empty stream (finish_reason: ${finishReason ?? "unknown"})`);
    }
    yield { kind: "done", finishReason };
  } finally {
    clearTimeout(timer);
  }
}

export async function callOpenAICompat(opts: CallOpenAiCompatOpts): Promise<AiCallResult> {
  const url = `${opts.baseUrl}/chat/completions`;
  const body = {
    model: opts.model,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.7,
    ...(opts.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
  };

  return withProvider(opts.providerName, async () => {
    // Per-fetch timeout: aborts the fetch AND any in-progress body
    // read (undici respects the signal through the full lifecycle).
    // Cleared in finally regardless of outcome so a fast success
    // doesn't hold a timer.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    let response: Response;
    try {
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${opts.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const redacted = redactKey(message, opts.apiKey);
        const timedOut = err instanceof Error && err.name === "AbortError";
        if (timedOut) {
          logger.warn(
            { provider: opts.providerName, route: opts.route, model: opts.model, timeoutMs: PROVIDER_TIMEOUT_MS },
            "openai-compat fetch timed out — chain will try next provider",
          );
          throw new Error(`timeout after ${PROVIDER_TIMEOUT_MS}ms`);
        }
        logger.warn(
          { provider: opts.providerName, route: opts.route, model: opts.model, err: redacted },
          "openai-compat fetch threw before response",
        );
        // withProvider requires we throw so the breaker sees the
        // failure; caller (chain.ts) catches per-provider throws
        // and moves to the next lane.
        throw new Error(`fetch threw: ${redacted}`);
      }

      if (!response.ok) {
        let respBody = "";
        try { respBody = await response.text(); } catch { /* ignore */ }
        const safeBody = redactKey(respBody, opts.apiKey).slice(0, 1000);
        logger.warn(
          {
            provider: opts.providerName,
            route: opts.route,
            model: opts.model,
            status: response.status,
            statusText: response.statusText,
            body: safeBody,
          },
          "openai-compat returned non-2xx",
        );
        throw new Error(`HTTP ${response.status}: ${safeBody.slice(0, 200)}`);
      }

      let data: ChatCompletion;
      try {
        data = (await response.json()) as ChatCompletion;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const timedOut = err instanceof Error && err.name === "AbortError";
        if (timedOut) {
          logger.warn(
            { provider: opts.providerName, route: opts.route, model: opts.model, timeoutMs: PROVIDER_TIMEOUT_MS },
            "openai-compat body read timed out — chain will try next provider",
          );
          throw new Error(`timeout after ${PROVIDER_TIMEOUT_MS}ms`);
        }
        logger.warn(
          { provider: opts.providerName, route: opts.route, model: opts.model, err: message },
          "openai-compat 2xx body failed to parse as JSON",
        );
        throw new Error(`json parse failed: ${message}`);
      }

      if (data.error) {
        const redacted = redactKey(data.error.message ?? "", opts.apiKey);
        logger.warn(
          { provider: opts.providerName, route: opts.route, model: opts.model, error: data.error },
          "openai-compat 2xx body carried an error object",
        );
        throw new Error(`body error: ${redacted}`);
      }

      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text) {
        // Empty content on a 200 is not a network failure but IS a
        // useless response — refuse it so the chain falls through to
        // the next provider rather than serving a blank chat bubble.
        const finishReason = data.choices?.[0]?.finish_reason ?? "unknown";
        logger.warn(
          { provider: opts.providerName, route: opts.route, model: opts.model, finishReason },
          "openai-compat returned empty content on 2xx",
        );
        throw new Error(`empty content (finish_reason: ${finishReason})`);
      }

      return { ok: true, text, diagnostic: "" };
    } finally {
      clearTimeout(timer);
    }
  });
}
