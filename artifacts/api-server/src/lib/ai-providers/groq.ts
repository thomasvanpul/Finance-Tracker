// Groq provider adapter — OpenAI-compatible chat completions.
//
// ── Env-driven models ─────────────────────────────────────────────────────
// Each task's model is an env var with a sane current default. Same
// pattern as GEMINI_MODEL — the next retirement is a Render env change,
// not a code change. Groq killed llama-3.3-70b-versatile on 16 Aug 2026
// (the deprecation that motivated this whole architecture) so the
// defaults land on the current openai/gpt-oss-* family and qwen3.6-27b
// for vision.
//
// ── Models ────────────────────────────────────────────────────────────────
//   GROQ_CHAT_MODEL       (default openai/gpt-oss-120b)  — chat
//   GROQ_CATEGORIZE_MODEL (default openai/gpt-oss-20b)   — batch categorize
//   GROQ_VISION_MODEL     (default qwen/qwen3.6-27b)     — receipt scan/split
//
// The three env vars share ONE api key (GROQ_API_KEY) — Groq's key
// grants access to every model on the account. Per-task variables
// exist so we can bump chat and categorize independently (e.g. move
// chat to 120b while categorize stays on 20b for volume).

import { callOpenAICompat, type OpenAiMessage } from "./openai-compat";
import type { AiCallResult } from "./types";

const BASE_URL = "https://api.groq.com/openai/v1";

export function groqApiKey(): string {
  return process.env.GROQ_API_KEY ?? "";
}

export function groqChatModel(): string {
  return process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-120b";
}

export function groqCategorizeModel(): string {
  return process.env.GROQ_CATEGORIZE_MODEL || "openai/gpt-oss-20b";
}

export function groqVisionModel(): string {
  return process.env.GROQ_VISION_MODEL || "qwen/qwen3.6-27b";
}

// Every current + configured Groq model — used by verifyProvidersAtBoot
// to check them all against the models list endpoint in one pass.
export function groqAllModels(): string[] {
  return [groqChatModel(), groqCategorizeModel(), groqVisionModel()];
}

// ── Task-shaped callers ───────────────────────────────────────────────────
// Chain.ts calls these; adapter picks the right model per task and
// forwards to the shared OpenAI-compat helper.

export function groqChat(opts: {
  messages: OpenAiMessage[];
  route: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<AiCallResult> {
  return callOpenAICompat({
    providerName: "groq",
    baseUrl: BASE_URL,
    apiKey: groqApiKey(),
    model: groqChatModel(),
    route: opts.route,
    messages: opts.messages,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
  });
}

export function groqCategorize(opts: {
  prompt: string;
  route: string;
  maxTokens?: number;
}): Promise<AiCallResult> {
  return callOpenAICompat({
    providerName: "groq",
    baseUrl: BASE_URL,
    apiKey: groqApiKey(),
    model: groqCategorizeModel(),
    route: opts.route,
    messages: [{ role: "user", content: opts.prompt }],
    maxTokens: opts.maxTokens ?? 4096,
    temperature: 0.1,
    jsonMode: true,
  });
}

// Vision path — Groq's qwen3.6-27b accepts up to 5 images/req at 20MB
// each. Our receipt-scan/split callers only send one image at a time.
// The image_url is a data URL: `data:image/jpeg;base64,<b64>`.
export function groqVision(opts: {
  imageBase64: string;
  mimeType: string;
  prompt: string;
  route: string;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<AiCallResult> {
  return callOpenAICompat({
    providerName: "groq",
    baseUrl: BASE_URL,
    apiKey: groqApiKey(),
    model: groqVisionModel(),
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
