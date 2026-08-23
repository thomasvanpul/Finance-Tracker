// AI configuration + per-provider boot-time model verification.
//
// ── Why this module exists ─────────────────────────────────────────────────
// gemini-2.0-flash was shut down 1 June 2026 and the app kept calling it
// for nearly three months. Groq killed llama-3.3-70b-versatile and
// llama-3.1-8b-instant on 16 Aug 2026. Cerebras pruned its catalogue in
// May. OpenRouter's free lineup rotates on a monthly cadence and has at
// least one model already scheduled to sunset. Every provider retires
// models on a cadence of months to a year — hardcoding a model anywhere
// is a bug waiting to trip.
//
// This module gives all three providers (Groq, Cerebras, OpenRouter)
// the same permanent shape:
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
// The Gemini lane was removed 2026-08-23. Google's AI Studio issues
// this account AQ.-prefixed keys and the Generative Language REST
// API only accepts AIza — the lane was permanently red, verifyGemini
// always emitted the fix-me, /api/ai/status always reported one dead
// provider. Replaced with OpenRouter, which uses genuinely working
// keys and 18 free models to pick from.
//
// The circuit breaker + call-counting + per-provider registry come
// from lib/provider-health.ts — same machinery the market chain uses.
// This module handles boot verification and health reporting only.

import { logger } from "./logger";
import { registerProvider } from "./provider-health";
import { groqAllModels, groqApiKey } from "./ai-providers/groq";
import { cerebrasAllModels, cerebrasApiKey } from "./ai-providers/cerebras";
import { openrouterAllModels, openrouterApiKey } from "./ai-providers/openrouter";

// Per-provider model list endpoints. All three follow the same pattern
// (GET /models with bearer auth) and all three return the same shape
// ({ data: [{ id }] }) — verifyOneProvider handles each with the same
// parser. Kept as separate functions so provider-specific fix-me
// sentences can name that provider's alternatives.
const GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models";
const CEREBRAS_MODELS_URL = "https://api.cerebras.ai/v1/models";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export type AiProviderName = "groq" | "cerebras" | "openrouter";

export interface AiProviderHealth {
  name: AiProviderName;
  keyConfigured: boolean;
  // Every model this provider is CONFIGURED to use, across all tasks.
  // For Groq that's chat + categorize + vision; for Cerebras chat +
  // vision; for OpenRouter chat + categorize + vision.
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
  state.set("openrouter", {
    name: "openrouter",
    keyConfigured: !!openrouterApiKey(),
    models: openrouterAllModels(),
    modelsVerified: null,
    verifiedAt: null,
    lastError: !openrouterApiKey() ? "OPENROUTER_API_KEY not set" : "verification pending",
  });
}
initState();

// Register providers with the shared circuit-breaker registry. The
// chain's withProvider() calls need each name pre-registered; without
// this the first call throws "not registered".
registerProvider({ name: "groq", configured: !!groqApiKey() });
registerProvider({ name: "cerebras", configured: !!cerebrasApiKey() });
registerProvider({ name: "openrouter", configured: !!openrouterApiKey() });

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

function providerKeyConfigured(name: AiProviderName): boolean {
  if (name === "groq") return !!groqApiKey();
  if (name === "cerebras") return !!cerebrasApiKey();
  return !!openrouterApiKey();
}

// ── Provider-specific verification ────────────────────────────────────────

// All three providers return the same OpenAI-shape { data: [{ id }] }
// from their /models endpoint. Groq additionally carries an `active`
// flag we filter on; the others just list what's callable.
interface ModelsResponse {
  data?: Array<{ id: string; active?: boolean }>;
  error?: { message?: string };
}

// Redact the API key from any string that might land in a log or the
// health endpoint. Same pattern as callOpenAICompat.
function redactKey(text: string, apiKey: string): string {
  if (!apiKey || apiKey.length < 8) return text;
  return text.split(apiKey).join(`[${apiKey.slice(0, 4).toUpperCase()}_KEY_REDACTED]`);
}

// Model-name filter: from a raw list of every model the provider
// exposes, narrow to just the "chat-flavour" candidates suitable as
// GROQ_CHAT_MODEL etc. Callers who want the full list can log it
// separately for the operator.
function shortlistCandidates(names: string[]): string[] {
  return names
    .filter((n) => {
      // Drop obvious non-chat outputs. Groq's list includes whisper +
      // embedding + guard; Cerebras is smaller; OpenRouter's full
      // catalogue is massive — the filter cuts image/audio/embedding
      // variants so the operator sees text-model candidates.
      if (/whisper|embedding|guard|orpheus|tts|imagen|veo|image-|tuning|dall-e|stable-diffusion/i.test(n)) return false;
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

// Generic verify-one-provider — parametrised on URL / key / configured
// models / env vars for the fix-me sentence. All three providers speak
// the same models-list shape so one implementation covers them.
// Boot-time verify runs once per provider — capped shorter than the
// runtime chain timeout because a slow /models list at boot shouldn't
// block the process from serving traffic. If a provider takes >8s just
// to enumerate its models, treat that as an outage for verification
// purposes; the runtime chain will still try it (with its own 12s cap).
const VERIFY_TIMEOUT_MS = 8_000;

async function verifyOneProvider(opts: {
  provider: AiProviderName;
  url: string;
  apiKey: string;
  keyEnvVar: string;
  configuredModels: string[];
  modelEnvVars: string[];
}): Promise<void> {
  const { provider, url, apiKey, keyEnvVar, configuredModels, modelEnvVars } = opts;
  if (!apiKey) {
    writeOutcome(provider, { verified: null, lastError: `${keyEnvVar} not set — verification skipped` });
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { "Authorization": `Bearer ${apiKey}` },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    const timedOut = err instanceof Error && err.name === "AbortError";
    if (timedOut) {
      writeOutcome(provider, { verified: null, lastError: `models list timed out after ${VERIFY_TIMEOUT_MS}ms` });
      logger.warn({ provider, timeoutMs: VERIFY_TIMEOUT_MS }, "AI provider verification timed out at boot");
      return;
    }
    writeOutcome(provider, { verified: null, lastError: `models list fetch threw: ${redactKey(message, apiKey)}` });
    logger.warn({ provider, err: message }, "AI provider verification failed at boot (network)");
    return;
  }
  clearTimeout(timer);
  if (!response.ok) {
    let body = ""; try { body = await response.text(); } catch { /* ignore */ }
    const safe = redactKey(body, apiKey).slice(0, 500);
    writeOutcome(provider, { verified: null, lastError: `models list HTTP ${response.status}: ${safe}` });
    logger.warn({ provider, status: response.status, body: safe }, "AI provider verification failed at boot (upstream)");
    return;
  }
  let data: ModelsResponse;
  try { data = (await response.json()) as ModelsResponse; }
  catch (err) {
    writeOutcome(provider, { verified: null, lastError: `models list JSON parse failed: ${String(err)}` });
    return;
  }
  const available = (data.data ?? [])
    // Groq marks retired models with active:false; Cerebras and
    // OpenRouter omit the field, which passes this filter as expected.
    .filter((m) => m.active !== false)
    .map((m) => m.id)
    .filter((n): n is string => typeof n === "string" && n.length > 0);
  const missing = configuredModels.filter((m) => !available.includes(m));
  if (missing.length === 0) {
    writeOutcome(provider, { verified: true, lastError: null });
    logger.info({ provider, models: configuredModels, availableCount: available.length }, "AI provider verified live at boot");
    return;
  }
  const fixMe = emitFixMe({
    provider,
    envVars: modelEnvVars,
    configuredMissing: missing,
    availableAll: available,
  });
  writeOutcome(provider, { verified: false, lastError: fixMe });
}

/**
 * Verifies every configured AI provider's models against its live models
 * list. Called from index.ts after the server binds. Non-blocking — all
 * three run in parallel and never throw out (errors go into state).
 */
export async function verifyProvidersAtBoot(): Promise<void> {
  await Promise.all([
    verifyOneProvider({
      provider: "groq",
      url: GROQ_MODELS_URL,
      apiKey: groqApiKey(),
      keyEnvVar: "GROQ_API_KEY",
      configuredModels: groqAllModels(),
      modelEnvVars: ["GROQ_CHAT_MODEL", "GROQ_CATEGORIZE_MODEL", "GROQ_VISION_MODEL"],
    }),
    verifyOneProvider({
      provider: "cerebras",
      url: CEREBRAS_MODELS_URL,
      apiKey: cerebrasApiKey(),
      keyEnvVar: "CEREBRAS_API_KEY",
      configuredModels: cerebrasAllModels(),
      modelEnvVars: ["CEREBRAS_CHAT_MODEL", "CEREBRAS_VISION_MODEL"],
    }),
    verifyOneProvider({
      provider: "openrouter",
      url: OPENROUTER_MODELS_URL,
      apiKey: openrouterApiKey(),
      keyEnvVar: "OPENROUTER_API_KEY",
      configuredModels: openrouterAllModels(),
      modelEnvVars: ["OPENROUTER_CHAT_MODEL", "OPENROUTER_CATEGORIZE_MODEL", "OPENROUTER_VISION_MODEL"],
    }),
  ]);
  // Re-register with the current keyConfigured state, in case env
  // was set between module load and the boot verify call. Belt-and-
  // braces: initState reads env, but so does this.
  registerProvider({ name: "groq", configured: !!groqApiKey() });
  registerProvider({ name: "cerebras", configured: !!cerebrasApiKey() });
  registerProvider({ name: "openrouter", configured: !!openrouterApiKey() });
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
