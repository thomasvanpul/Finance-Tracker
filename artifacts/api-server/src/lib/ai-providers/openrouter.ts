// OpenRouter provider adapter — OpenAI-compatible chat completions.
//
// ── Role in the chain ─────────────────────────────────────────────────────
// Third and last fallback in the AI chain (Groq → Cerebras → OpenRouter).
// Replaces the Gemini lane, which was permanently red on this account
// because Google's AI Studio issues AQ.-prefixed keys and the Generative
// Language REST API only accepts AIza.
//
// OpenRouter routes free requests to a handful of vendor-hosted open
// models. Free-tier limits per live docs (2026-08-23):
//   • 20 RPM · 50 requests/day free
//   • 1,000 requests/day after a $10 credit top-up
//   • 429 on exceed
// Ample for a third fallback that only serves when the first two are
// down — the primary should never touch it under normal load.
//
// ── Env-driven models ─────────────────────────────────────────────────────
// Same pattern as Groq and Cerebras — env vars with sane current
// defaults so the next retirement is a Render config change, not a
// code change. OpenRouter's free lineup churns often (Sep 30 2026
// already scheduled to remove one model): the env overrides give the
// operator a fast recovery path when boot verify names an alternative.
//
//   OPENROUTER_CHAT_MODEL       (default nvidia/nemotron-3-super-120b-a12b:free)
//   OPENROUTER_CATEGORIZE_MODEL (default nvidia/nemotron-nano-9b-v2:free)
//   OPENROUTER_VISION_MODEL     (default google/gemma-4-31b-it:free)
//
// Default picks reasoning:
//   • chat       — 120B, 262k ctx, class-parity with Groq's gpt-oss-120b primary
//   • categorize — 9B, 128k ctx, cheap high-volume role like Groq's gpt-oss-20b
//   • vision     — same gemma-4-31b architecture Cerebras uses, proven for
//                  receipt OCR, different infra provider so the vision
//                  fallback lanes have real redundancy at the platform
//                  level even if the model family is the same.
//
// Every free-tier model on OpenRouter ends with `:free`. Overriding to
// a paid variant just means dropping the suffix — boot verify still
// works because the model list endpoint returns both.

import { callOpenAICompat, callOpenAICompatStream, type OpenAiMessage, type OpenAiStreamChunk } from "./openai-compat";
import type { AiCallResult } from "./types";

const BASE_URL = "https://openrouter.ai/api/v1";

export function openrouterApiKey(): string {
  return process.env.OPENROUTER_API_KEY ?? "";
}

export function openrouterChatModel(): string {
  return process.env.OPENROUTER_CHAT_MODEL || "nvidia/nemotron-3-super-120b-a12b:free";
}

export function openrouterCategorizeModel(): string {
  return process.env.OPENROUTER_CATEGORIZE_MODEL || "nvidia/nemotron-nano-9b-v2:free";
}

export function openrouterVisionModel(): string {
  return process.env.OPENROUTER_VISION_MODEL || "google/gemma-4-31b-it:free";
}

export function openrouterAllModels(): string[] {
  return [openrouterChatModel(), openrouterCategorizeModel(), openrouterVisionModel()];
}

// ── Task-shaped callers ───────────────────────────────────────────────────

export function openrouterChat(opts: {
  messages: OpenAiMessage[];
  route: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<AiCallResult> {
  return callOpenAICompat({
    providerName: "openrouter",
    baseUrl: BASE_URL,
    apiKey: openrouterApiKey(),
    model: openrouterChatModel(),
    route: opts.route,
    messages: opts.messages,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
  });
}

export function openrouterChatStream(opts: {
  messages: OpenAiMessage[];
  route: string;
  maxTokens?: number;
  temperature?: number;
}): AsyncGenerator<OpenAiStreamChunk> {
  return callOpenAICompatStream({
    providerName: "openrouter",
    baseUrl: BASE_URL,
    apiKey: openrouterApiKey(),
    model: openrouterChatModel(),
    route: opts.route,
    messages: opts.messages,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
  });
}

export function openrouterCategorize(opts: {
  prompt: string;
  route: string;
  maxTokens?: number;
}): Promise<AiCallResult> {
  return callOpenAICompat({
    providerName: "openrouter",
    baseUrl: BASE_URL,
    apiKey: openrouterApiKey(),
    model: openrouterCategorizeModel(),
    route: opts.route,
    messages: [{ role: "user", content: opts.prompt }],
    maxTokens: opts.maxTokens ?? 4096,
    temperature: 0.1,
    jsonMode: true,
  });
}

export function openrouterVision(opts: {
  imageBase64: string;
  mimeType: string;
  prompt: string;
  route: string;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<AiCallResult> {
  return callOpenAICompat({
    providerName: "openrouter",
    baseUrl: BASE_URL,
    apiKey: openrouterApiKey(),
    model: openrouterVisionModel(),
    route: opts.route,
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:${opts.mimeType};base64,${opts.imageBase64}` } },
        { type: "text", text: opts.prompt },
      ],
    }],
    maxTokens: opts.maxTokens ?? 1024,
    temperature: 0.1,
    jsonMode: opts.jsonMode,
  });
}
