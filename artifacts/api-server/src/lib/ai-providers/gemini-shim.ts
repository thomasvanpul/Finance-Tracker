// Thin adapter that wraps lib/gemini.ts callGemini into the AiCallResult
// shape the chain expects. Keeps the existing callGemini header-auth /
// error-handling / key-redaction logic intact — this file only turns
// the { ok, data, diagnostic } tuple into { ok, text, diagnostic } and
// routes it through withProvider so the shared circuit breaker applies.

import { callGemini } from "../gemini";
import { withProvider } from "../provider-health";
import type { AiCallResult } from "./types";
import { getGeminiModel } from "../ai-config";

export function geminiApiKey(): string {
  return process.env.GEMINI_API_KEY ?? "";
}

// Reads the ai-config Gemini-specific getter (GEMINI_MODEL env var
// with the current stable default). Task-specific overrides aren't
// in place for Gemini today — one gemini-3.7-flash handles chat,
// categorize, and vision. If we ever need a smaller Gemini model
// for cost, add a per-task getter here mirroring groq.ts's shape.
export function geminiModel(): string {
  return getGeminiModel();
}

interface GeminiCallOpts {
  route: string;
  // Free-form Gemini generateContent body — chain builds this from
  // task-specific inputs (chat messages / vision image + prompt).
  body: unknown;
}

async function callViaWithProvider(opts: GeminiCallOpts): Promise<AiCallResult> {
  return withProvider("gemini", async () => {
    const result = await callGemini({
      model: geminiModel(),
      apiKey: geminiApiKey(),
      route: opts.route,
      body: opts.body,
    });
    if (!result.ok) {
      // callGemini already logged the upstream detail; propagate a
      // clean throw so the breaker sees the failure and the chain
      // moves on to the next lane.
      throw new Error(result.diagnostic || "gemini call failed");
    }
    const text = result.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text) {
      throw new Error("gemini returned empty content");
    }
    return { ok: true, text, diagnostic: "" };
  });
}

// ── Task-shaped callers ───────────────────────────────────────────────────

export function geminiChat(opts: {
  messages: Array<{ role: "user" | "model"; text: string }>;
  systemPrompt?: string;
  route: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<AiCallResult> {
  const contents = opts.messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));
  return callViaWithProvider({
    route: opts.route,
    body: {
      contents,
      ...(opts.systemPrompt
        ? { systemInstruction: { parts: [{ text: opts.systemPrompt }] } }
        : {}),
      generationConfig: {
        maxOutputTokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.7,
      },
    },
  });
}

export function geminiCategorize(opts: {
  prompt: string;
  route: string;
  maxTokens?: number;
}): Promise<AiCallResult> {
  return callViaWithProvider({
    route: opts.route,
    body: {
      contents: [{ parts: [{ text: opts.prompt }] }],
      generationConfig: {
        maxOutputTokens: opts.maxTokens ?? 4096,
        temperature: 0.1,
      },
    },
  });
}

export function geminiVision(opts: {
  imageBase64: string;
  mimeType: string;
  prompt: string;
  route: string;
  maxTokens?: number;
}): Promise<AiCallResult> {
  return callViaWithProvider({
    route: opts.route,
    body: {
      contents: [{
        parts: [
          { inline_data: { mime_type: opts.mimeType, data: opts.imageBase64 } },
          { text: opts.prompt },
        ],
      }],
      generationConfig: {
        maxOutputTokens: opts.maxTokens ?? 1024,
        temperature: 0.1,
      },
    },
  });
}
