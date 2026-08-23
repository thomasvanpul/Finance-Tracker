// Cerebras provider adapter — OpenAI-compatible chat completions.
//
// Fallback tier in the AI chain. Free-tier limits per live docs:
//   • 5 RPM (shared across all Cerebras models)
//   • 30K TPM, 1M TPD
//   • 65K context on free tier
//
// The 5 RPM ceiling is the thin fallback the user flagged: fine as
// second-of-three at current scale, would bind hard at ~50 concurrent
// users. The chain surfaces this via reducedCapacity in the response
// so the UI can render a quiet "reduced capacity" state whenever a
// call falls through to here — that's the "degraded but not silent"
// principle from the market stale-serve pattern.
//
// ── Models ────────────────────────────────────────────────────────────────
//   CEREBRAS_CHAT_MODEL   (default gpt-oss-120b)  — chat + categorize
//   CEREBRAS_VISION_MODEL (default gemma-4-31b)   — receipt scan/split
//
// Only two free-tier models on the platform (verified 2026-08-23). If
// Cerebras prunes again the boot verify will name whatever it does
// return — see verifyProvidersAtBoot for the fix-me sentence.

import { callOpenAICompat, type OpenAiMessage } from "./openai-compat";
import type { AiCallResult } from "./types";

const BASE_URL = "https://api.cerebras.ai/v1";

export function cerebrasApiKey(): string {
  return process.env.CEREBRAS_API_KEY ?? "";
}

export function cerebrasChatModel(): string {
  return process.env.CEREBRAS_CHAT_MODEL || "gpt-oss-120b";
}

export function cerebrasVisionModel(): string {
  return process.env.CEREBRAS_VISION_MODEL || "gemma-4-31b";
}

export function cerebrasAllModels(): string[] {
  return [cerebrasChatModel(), cerebrasVisionModel()];
}

// ── Task-shaped callers ───────────────────────────────────────────────────
// Cerebras handles chat, categorize, and vision through the same base
// helper — same as Groq, just different baseUrl and defaults.

export function cerebrasChat(opts: {
  messages: OpenAiMessage[];
  route: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<AiCallResult> {
  return callOpenAICompat({
    providerName: "cerebras",
    baseUrl: BASE_URL,
    apiKey: cerebrasApiKey(),
    model: cerebrasChatModel(),
    route: opts.route,
    messages: opts.messages,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
  });
}

export function cerebrasCategorize(opts: {
  prompt: string;
  route: string;
  maxTokens?: number;
}): Promise<AiCallResult> {
  return callOpenAICompat({
    providerName: "cerebras",
    baseUrl: BASE_URL,
    apiKey: cerebrasApiKey(),
    model: cerebrasChatModel(), // no smaller model on Cerebras free tier
    route: opts.route,
    messages: [{ role: "user", content: opts.prompt }],
    maxTokens: opts.maxTokens ?? 4096,
    temperature: 0.1,
    jsonMode: true,
  });
}

// Vision — gemma-4-31b free-tier limits: 2 images/req, 4MB payload.
// Our receipt paths send one image, well under that ceiling.
export function cerebrasVision(opts: {
  imageBase64: string;
  mimeType: string;
  prompt: string;
  route: string;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<AiCallResult> {
  return callOpenAICompat({
    providerName: "cerebras",
    baseUrl: BASE_URL,
    apiKey: cerebrasApiKey(),
    model: cerebrasVisionModel(),
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
