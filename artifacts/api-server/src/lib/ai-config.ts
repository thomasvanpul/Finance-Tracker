// AI configuration + per-provider boot-time model verification.
//
// ── Why this module exists ─────────────────────────────────────────────────
// gemini-2.0-flash was shut down 1 June 2026 and the app kept calling it
// for nearly three months. Groq killed llama-3.3-70b-versatile and
// llama-3.1-8b-instant on 16 Aug 2026. Cerebras pruned its catalogue in
// May. Every provider retires flash-family models on a cadence of months
// to a year — hardcoding a model anywhere is a bug waiting to trip.
//
// This module gives all three providers (Groq, Cerebras, Gemini) the
// same permanent shape:
//
//   1. Per-provider env vars for each task's model (default to a sane
//      current name). The next retirement is a Render env change, not
//      a code change.
//
//   2. verifyProvidersAtBoot() hits each provider's models list at
//      server startup. If a configured model is absent, error-level
//      log with a provider-specific fix-me sentence naming that
//      provider's live alternatives — a Groq retirement gets Groq's
//      current models, not a generic list. The log alone tells an
//      operator how to recover without opening any other tab.
//
//   3. getAiHealth() reports every provider: { name, keyConfigured,
//      models, modelsVerified, verifiedAt, lastError }. /api/ai/status
//      exposes this so the operator can `curl` production and see
//      every provider's state.
//
// The circuit breaker + call-counting + per-provider registry come
// from lib/provider-health.ts — same machinery the market chain uses.
// This module handles boot verification and health reporting only.

import { logger } from "./logger";
import { registerProvider } from "./provider-health";
import { groqAllModels, groqApiKey } from "./ai-providers/groq";
import { cerebrasAllModels, cerebrasApiKey } from "./ai-providers/cerebras";
import { geminiApiKey } from "./ai-providers/gemini-shim";

const DEFAULT_GEMINI_MODEL = "gemini-3.7-flash";

// Per-provider model list endpoints. All three follow the same pattern
// (GET /models with bearer or header auth) but differ in URL and
// response shape — verifyOneProvider handles each accordingly.
const GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models";
const CEREBRAS_MODELS_URL = "https://api.cerebras.ai/v1/models";
const GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export type AiProviderName = "groq" | "cerebras" | "gemini";

export interface AiProviderHealth {
  name: AiProviderName;
  keyConfigured: boolean;
  // Every model this provider is CONFIGURED to use, across all tasks.
  // For Groq that's chat + categorize + vision; for Cerebras chat +
  // vision; for Gemini a single model handles all three tasks today.
  models: string[];
  // true → every configured model appeared in the provider's models
  //        list at last check.
  // false → at least one was missing (the AI-IS-BROKEN condition).
  // null → check hasn't run or errored (verdict unknown — treated as
  //        unavailable to be safe).
  modelsVerified: boolean | null;
  verifiedAt: string | null;
  // Fix-me sentence when modelsVerified is false; network / HTTP
  // error message when null-from-error; null when verified true.
  lastError: string | null;
}

export interface AiHealth {
  // true iff at least one provider has keyConfigured=true AND
  // modelsVerified=true. This is what /api/ai/status exposes as
  // `available` and what "the chain has a live lane" means.
  available: boolean;
  providers: AiProviderHealth[];
}

// Per-provider state store. Registered at module load so getAiHealth()
// always returns a coherent shape even before verifyProvidersAtBoot
// completes (each provider's modelsVerified starts as null with a
// "verification pending" lastError).
const state = new Map<AiProviderName, AiProviderHealth>();

function initState(): void {
  state.set("groq", {
    name: "groq",
    keyConfigured: !!groqApiKey(),
    models: groqAllModels(),
    modelsVerified: null,
    verifiedAt: null,
    lastError: !groqApiKey() ? "GROQ_API_KEY not set" : "verification pending",
  });
  state.set("cerebras", {
    name: "cerebras",
    keyConfigured: !!cerebrasApiKey(),
    models: cerebrasAllModels(),
    modelsVerified: null,
    verifiedAt: null,
    lastError: !cerebrasApiKey() ? "CEREBRAS_API_KEY not set" : "verification pending",
  });
  state.set("gemini", {
    name: "gemini",
    keyConfigured: !!geminiApiKey(),
    models: [process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL],
    modelsVerified: null,
    verifiedAt: null,
    lastError: !geminiApiKey() ? "GEMINI_API_KEY not set" : "verification pending",
  });
}
initState();

// Register providers with the shared circuit-breaker registry. The
// chain's withProvider() calls need each name pre-registered; without
// this the first call throws "not registered".
registerProvider({ name: "groq", configured: !!groqApiKey() });
registerProvider({ name: "cerebras", configured: !!cerebrasApiKey() });
registerProvider({ name: "gemini", configured: !!geminiApiKey() });

export function getAiHealth(): AiHealth {
  // Refresh keyConfigured live per call — Render pins env for the
  // process lifetime but reading env is cheap and future-proofs
  // against runtime rotation.
  const providers = Array.from(state.values()).map((p) => ({
    ...p,
    keyConfigured: providerKeyConfigured(p.name),
  }));
  const available = providers.some((p) => p.keyConfigured && p.modelsVerified === true);
  return { available, providers };
}

// Legacy shape kept for a single caller in gemini-shim (which reads
// the Gemini model string only). Returns the Gemini model so existing
// getAiHealth().model consumers don't break; new callers should
// prefer the multi-provider getAiHealth() shape.
export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
}

function providerKeyConfigured(name: AiProviderName): boolean {
  if (name === "groq") return !!groqApiKey();
  if (name === "cerebras") return !!cerebrasApiKey();
  return !!geminiApiKey();
}

// ── Provider-specific verification ────────────────────────────────────────

interface GroqModelsResponse {
  data?: Array<{ id: string; active?: boolean }>;
  error?: { message?: string };
}
interface CerebrasModelsResponse {
  data?: Array<{ id: string }>;
  error?: { message?: string };
}
interface GeminiModelsResponse {
  models?: Array<{ name?: string }>;
  error?: { message?: string; code?: number };
}

// Redact the API key from any string that might land in a log or the
// health endpoint. Same pattern as callGemini + callOpenAICompat.
function redactKey(text: string, apiKey: string): string {
  if (!apiKey || apiKey.length < 8) return text;
  return text.split(apiKey).join(`[${apiKey.slice(0, 4).toUpperCase()}_KEY_REDACTED]`);
}

// Model-name filter: from a raw list of every model the provider
// exposes, narrow to just the "chat-flavour" candidates suitable as
// GROQ_CHAT_MODEL etc. Callers who want the full list can log it
// separately for the operator. Deliberately generic — matches the
// pattern the Gemini fix-me sentence already uses.
function shortlistCandidates(names: string[]): string[] {
  return names
    .filter((n) => {
      // Drop obvious non-chat outputs. Groq's list includes whisper +
      // embedding + guard; Cerebras is smaller; Gemini has embedding +
      // image + tuning variants.
      if (/whisper|embedding|guard|orpheus|tts|imagen|veo|image-|tuning/i.test(n)) return false;
      return true;
    })
    .sort();
}

// Common outcome-writing so each provider's verify function stays short.
function writeOutcome(
  name: AiProviderName,
  outcome: {
    verified: boolean | null;
    lastError: string | null;
  },
): void {
  const p = state.get(name);
  if (!p) return;
  p.modelsVerified = outcome.verified;
  p.verifiedAt = new Date().toISOString();
  p.lastError = outcome.lastError;
}

// Emits the load-bearing loud log when a configured model is absent.
// Provider-specific — names THAT provider's alternatives, and the env
// var to set for the retirement.
function emitFixMe(opts: {
  provider: AiProviderName;
  envVars: string[];       // e.g. ["GROQ_CHAT_MODEL", "GROQ_CATEGORIZE_MODEL", "GROQ_VISION_MODEL"]
  configuredMissing: string[];
  availableAll: string[];
}): string {
  const shortlist = shortlistCandidates(opts.availableAll).slice(0, 20);
  const fixMe =
    `CONFIGURED AI MODEL IS DEAD (${opts.provider}). Missing model(s): ` +
    `${opts.configuredMissing.join(", ")}. Set one of ${opts.envVars.join(" / ")} ` +
    `to a live model and redeploy. Currently available (${opts.provider}): ` +
    `${shortlist.join(", ")}`;
  logger.error(
    {
      provider: opts.provider,
      configuredMissing: opts.configuredMissing,
      envVars: opts.envVars,
      availableCandidates: shortlist,
      availableAll: opts.availableAll,
    },
    fixMe,
  );
  return fixMe;
}

// ── Groq verification ─────────────────────────────────────────────────────
// GET https://api.groq.com/openai/v1/models
// Response: OpenAI-shape { data: [{ id, active, ... }] }

async function verifyGroq(): Promise<void> {
  const apiKey = groqApiKey();
  if (!apiKey) {
    writeOutcome("groq", { verified: null, lastError: "GROQ_API_KEY not set — verification skipped" });
    return;
  }
  let response: Response;
  try {
    response = await fetch(GROQ_MODELS_URL, {
      method: "GET",
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeOutcome("groq", { verified: null, lastError: `models list fetch threw: ${redactKey(message, apiKey)}` });
    logger.warn({ provider: "groq", err: message }, "AI provider verification failed at boot (network)");
    return;
  }
  if (!response.ok) {
    let body = ""; try { body = await response.text(); } catch { /* ignore */ }
    const safe = redactKey(body, apiKey).slice(0, 500);
    writeOutcome("groq", { verified: null, lastError: `models list HTTP ${response.status}: ${safe}` });
    logger.warn({ provider: "groq", status: response.status, body: safe }, "AI provider verification failed at boot (upstream)");
    return;
  }
  let data: GroqModelsResponse;
  try { data = (await response.json()) as GroqModelsResponse; }
  catch (err) {
    writeOutcome("groq", { verified: null, lastError: `models list JSON parse failed: ${String(err)}` });
    return;
  }
  const available = (data.data ?? [])
    .filter((m) => m.active !== false)
    .map((m) => m.id)
    .filter((n) => typeof n === "string" && n.length > 0);
  const configured = groqAllModels();
  const missing = configured.filter((m) => !available.includes(m));
  if (missing.length === 0) {
    writeOutcome("groq", { verified: true, lastError: null });
    logger.info({ provider: "groq", models: configured, availableCount: available.length }, "AI provider verified live at boot");
    return;
  }
  const fixMe = emitFixMe({
    provider: "groq",
    envVars: ["GROQ_CHAT_MODEL", "GROQ_CATEGORIZE_MODEL", "GROQ_VISION_MODEL"],
    configuredMissing: missing,
    availableAll: available,
  });
  writeOutcome("groq", { verified: false, lastError: fixMe });
}

// ── Cerebras verification ─────────────────────────────────────────────────
// GET https://api.cerebras.ai/v1/models
// Response: OpenAI-shape { data: [{ id }] }

async function verifyCerebras(): Promise<void> {
  const apiKey = cerebrasApiKey();
  if (!apiKey) {
    writeOutcome("cerebras", { verified: null, lastError: "CEREBRAS_API_KEY not set — verification skipped" });
    return;
  }
  let response: Response;
  try {
    response = await fetch(CEREBRAS_MODELS_URL, {
      method: "GET",
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeOutcome("cerebras", { verified: null, lastError: `models list fetch threw: ${redactKey(message, apiKey)}` });
    logger.warn({ provider: "cerebras", err: message }, "AI provider verification failed at boot (network)");
    return;
  }
  if (!response.ok) {
    let body = ""; try { body = await response.text(); } catch { /* ignore */ }
    const safe = redactKey(body, apiKey).slice(0, 500);
    writeOutcome("cerebras", { verified: null, lastError: `models list HTTP ${response.status}: ${safe}` });
    logger.warn({ provider: "cerebras", status: response.status, body: safe }, "AI provider verification failed at boot (upstream)");
    return;
  }
  let data: CerebrasModelsResponse;
  try { data = (await response.json()) as CerebrasModelsResponse; }
  catch (err) {
    writeOutcome("cerebras", { verified: null, lastError: `models list JSON parse failed: ${String(err)}` });
    return;
  }
  const available = (data.data ?? []).map((m) => m.id).filter((n) => typeof n === "string" && n.length > 0);
  const configured = cerebrasAllModels();
  const missing = configured.filter((m) => !available.includes(m));
  if (missing.length === 0) {
    writeOutcome("cerebras", { verified: true, lastError: null });
    logger.info({ provider: "cerebras", models: configured, availableCount: available.length }, "AI provider verified live at boot");
    return;
  }
  const fixMe = emitFixMe({
    provider: "cerebras",
    envVars: ["CEREBRAS_CHAT_MODEL", "CEREBRAS_VISION_MODEL"],
    configuredMissing: missing,
    availableAll: available,
  });
  writeOutcome("cerebras", { verified: false, lastError: fixMe });
}

// ── Gemini verification ───────────────────────────────────────────────────
// GET https://generativelanguage.googleapis.com/v1beta/models
// Response: { models: [{ name: "models/gemini-3.7-flash", ... }] }

async function verifyGemini(): Promise<void> {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    writeOutcome("gemini", { verified: null, lastError: "GEMINI_API_KEY not set — verification skipped" });
    return;
  }
  let response: Response;
  try {
    response = await fetch(GEMINI_MODELS_URL, {
      method: "GET",
      headers: { "x-goog-api-key": apiKey },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeOutcome("gemini", { verified: null, lastError: `models list fetch threw: ${redactKey(message, apiKey)}` });
    logger.warn({ provider: "gemini", err: message }, "AI provider verification failed at boot (network)");
    return;
  }
  if (!response.ok) {
    let body = ""; try { body = await response.text(); } catch { /* ignore */ }
    const safe = redactKey(body, apiKey).slice(0, 500);
    writeOutcome("gemini", { verified: null, lastError: `models list HTTP ${response.status}: ${safe}` });
    logger.warn({ provider: "gemini", status: response.status, body: safe }, "AI provider verification failed at boot (upstream)");
    return;
  }
  let data: GeminiModelsResponse;
  try { data = (await response.json()) as GeminiModelsResponse; }
  catch (err) {
    writeOutcome("gemini", { verified: null, lastError: `models list JSON parse failed: ${String(err)}` });
    return;
  }
  const available = (data.models ?? [])
    .map((m) => (m.name ?? "").replace(/^models\//, ""))
    .filter((n) => n.length > 0);
  const configured = [getGeminiModel()];
  const missing = configured.filter((m) => !available.includes(m));
  if (missing.length === 0) {
    writeOutcome("gemini", { verified: true, lastError: null });
    logger.info({ provider: "gemini", models: configured, availableCount: available.length }, "AI provider verified live at boot");
    return;
  }
  const fixMe = emitFixMe({
    provider: "gemini",
    envVars: ["GEMINI_MODEL"],
    configuredMissing: missing,
    availableAll: available.filter((n) => /flash|pro/.test(n)),
  });
  writeOutcome("gemini", { verified: false, lastError: fixMe });
}

/**
 * Verifies every configured AI provider's models against its live models
 * list. Called from index.ts after the server binds. Non-blocking — all
 * three run in parallel and never throw out (errors go into state).
 */
export async function verifyProvidersAtBoot(): Promise<void> {
  await Promise.all([verifyGroq(), verifyCerebras(), verifyGemini()]);
  // Re-register with the current keyConfigured state, in case env
  // was set between module load and the boot verify call. Belt-and-
  // braces: initState reads env, but so does this.
  registerProvider({ name: "groq", configured: !!groqApiKey() });
  registerProvider({ name: "cerebras", configured: !!cerebrasApiKey() });
  registerProvider({ name: "gemini", configured: !!geminiApiKey() });
}

// ── Test helpers ──────────────────────────────────────────────────────────

export function __setProviderHealthForTesting(name: AiProviderName, patch: Partial<AiProviderHealth>): void {
  const p = state.get(name);
  if (!p) return;
  Object.assign(p, patch);
}
export function __resetAiHealthForTesting(): void {
  state.clear();
  initState();
}
