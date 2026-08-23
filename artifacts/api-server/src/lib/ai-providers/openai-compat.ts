// Shared caller for OpenAI-compatible chat completions endpoints.
//
// Groq (api.groq.com/openai/v1) and Cerebras (api.cerebras.ai/v1) both
// speak the OpenAI shape: same request body (model + messages), same
// bearer-token auth, same response (choices[0].message.content). One
// helper serves both; the provider adapters (groq.ts, cerebras.ts)
// just supply baseUrl and defaults.
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
  providerName: "groq" | "cerebras";
  // Base URL WITHOUT trailing slash, WITHOUT /chat/completions.
  //   Groq:     https://api.groq.com/openai/v1
  //   Cerebras: https://api.cerebras.ai/v1
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
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const redacted = redactKey(message, opts.apiKey);
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
  });
}
