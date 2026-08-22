// AI configuration + boot-time model verification.
//
// ── Why this module exists ─────────────────────────────────────────────────
// gemini-2.0-flash was shut down 1 June 2026 and the app kept calling it
// for nearly three months. Every call returned a 404 that our silent
// catches (fixed in the prior commit) threw away, and /api/ai/status kept
// reporting {available: true} the whole time because it only checked
// whether an API key was set.
//
// Google has retired flash-family models three times in eighteen months
// and has more scheduled. Hardcoding the model name across four call
// sites made every retirement a code change and a deploy; leaving the
// health endpoint to check only key-presence made a dead model
// undetectable until a user hit it.
//
// This module gives both problems a permanent shape:
//
//   1. GEMINI_MODEL env var with `gemini-3.7-flash` as the default. One
//      surface, one source of truth. The next retirement is a Render
//      env change, not a code change.
//
//   2. verifyModelAtBoot() hits Google's models list once at server
//      startup, checks whether the configured model appears, and
//      writes the outcome to a state object. If the model is absent,
//      it logs at error level with the configured name, the available
//      names, and the exact fix — the log alone tells an operator how
//      to recover without them having to look anything up.
//
//   3. getAiHealth() exposes { keyConfigured, model, modelVerified,
//      lastError } for the /api/ai/status endpoint so the health
//      surface reports what it actually knows rather than
//      "we have a key". "available: true" now means the thing works.

import { logger } from "./logger";

// Default lands on gemini-3.7-flash. Picked over 2.5-flash on risk
// asymmetry — one secondary source (unverified against Google's live
// deprecation page) claimed 2.5 shuts down 16 Oct 2026; if that's true
// picking 2.5 breaks the AI again in weeks. 3.7 is the newest stable
// flash with no announced shutdown; same intro pricing ($0.75/$3.75
// per 1M through Dec 2026) as 3.6 so no reason to pick middle when
// newest costs the same. All current app use is on the free tier so
// paid pricing doesn't apply today.
const DEFAULT_MODEL = "gemini-3.7-flash";

const GEMINI_LIST_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export interface AiHealth {
  // Env-key presence. First gate — if false, model verification is
  // skipped because there's nothing to verify against.
  keyConfigured: boolean;
  // The model string that will be sent to Gemini. Reads GEMINI_MODEL
  // env var; falls back to DEFAULT_MODEL. Reported so the operator can
  // confirm from /api/ai/status what's actually active without a shell.
  model: string;
  // Whether the model was found in Google's models list at boot.
  //   • true   → confirmed live at last check
  //   • false  → checked and NOT found (the AI IS broken condition)
  //   • null   → check hasn't run or errored (verdict unknown)
  modelVerified: boolean | null;
  // ISO timestamp of the last verification attempt, whatever the
  // outcome. null if the check hasn't run.
  modelVerifiedAt: string | null;
  // When modelVerified is false OR null, a brief non-secret message
  // explaining why (network error, HTTP status, or the fix-me sentence
  // if the model is absent). Never contains the API key.
  lastError: string | null;
}

// Module-scoped health state. Initialised on module import so callers
// that hit /api/ai/status before verifyModelAtBoot completes still get
// a coherent shape (modelVerified: null, lastError explains).
const state: AiHealth = {
  keyConfigured: !!process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
  modelVerified: null,
  modelVerifiedAt: null,
  lastError: null,
};

export function getAiHealth(): AiHealth {
  // Re-read keyConfigured each call in case the env changes between
  // process events (won't happen in Render's model — env is fixed for
  // the process lifetime — but reads are cheap).
  state.keyConfigured = !!process.env.GEMINI_API_KEY;
  return { ...state };
}

// Google's models list response shape (only the fields we consume).
interface GeminiModelsResponse {
  models?: Array<{
    name?: string;                       // e.g. "models/gemini-3.7-flash"
    supportedGenerationMethods?: string[];
  }>;
  error?: { message?: string; code?: number };
}

/**
 * Fetches the Gemini models list and verifies the configured model appears
 * in it. Called once at server startup from app.ts. Writes result to state
 * so /api/ai/status can report the current truth.
 *
 * Design choices:
 *   • Runs async, does not block server startup. If Google is slow, we
 *     still bind :3001 and start serving. The health endpoint reports
 *     modelVerified=null until this resolves.
 *   • Never throws. Errors go into state.lastError, not up the stack.
 *   • Logs LOUDLY on the "configured model is absent" path — error
 *     level, top-level message string that reads well in Render logs,
 *     structured fields for grep. The log alone tells an operator how
 *     to recover.
 */
export async function verifyModelAtBoot(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // No key → nothing to verify against, and this is a legitimate
    // "AI not configured" state, not a broken state. Report as such.
    state.modelVerified = null;
    state.modelVerifiedAt = new Date().toISOString();
    state.lastError = "GEMINI_API_KEY is not set — model verification skipped";
    return;
  }

  let response: Response;
  try {
    response = await fetch(GEMINI_LIST_URL, {
      method: "GET",
      headers: {
        // Header auth — key never in URL. Same rule as callGemini.
        "x-goog-api-key": apiKey,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    state.modelVerified = null;
    state.modelVerifiedAt = new Date().toISOString();
    state.lastError = `models list fetch threw: ${message}`;
    logger.warn(
      { model: state.model, err: message },
      "AI model verification failed at boot (network) — /api/ai/status will report unverified",
    );
    return;
  }

  if (!response.ok) {
    let body = "";
    try { body = await response.text(); } catch { /* ignore */ }
    // Truncate + strip the key just in case the body echoes it.
    const safeBody = body.replaceAll(apiKey, "[GEMINI_KEY_REDACTED]").slice(0, 500);
    state.modelVerified = null;
    state.modelVerifiedAt = new Date().toISOString();
    state.lastError = `models list HTTP ${response.status}: ${safeBody}`;
    logger.warn(
      { model: state.model, status: response.status, body: safeBody },
      "AI model verification failed at boot (upstream error) — /api/ai/status will report unverified",
    );
    return;
  }

  let data: GeminiModelsResponse;
  try {
    data = (await response.json()) as GeminiModelsResponse;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    state.modelVerified = null;
    state.modelVerifiedAt = new Date().toISOString();
    state.lastError = `models list JSON parse failed: ${message}`;
    logger.warn({ model: state.model, err: message }, "AI model verification failed at boot (json)");
    return;
  }

  // The list returns full names like "models/gemini-3.7-flash". Strip
  // the "models/" prefix so we can compare against the bare string
  // stored in state.model.
  const availableModels = (data.models ?? [])
    .map((m) => (m.name ?? "").replace(/^models\//, ""))
    .filter((n) => n.length > 0);

  const found = availableModels.includes(state.model);
  state.modelVerified = found;
  state.modelVerifiedAt = new Date().toISOString();

  if (found) {
    state.lastError = null;
    logger.info(
      { model: state.model, availableCount: availableModels.length },
      "AI model verified live at boot",
    );
    return;
  }

  // ── The load-bearing loud log ──────────────────────────────────────────
  // A dead model was invisible for three months last time. This log
  // exists so the next occurrence is unmissable — error level, top
  // message is a sentence an operator can act on without opening any
  // other tab. Structured fields carry the machine-readable version.
  //
  // Deliberately narrows the available list to flash models — the full
  // list can have 40+ entries (embedding, image, tuning variants) that
  // aren't candidates for GEMINI_MODEL. If a shortlist ever misleads,
  // the full list is one field below (`availableModels`) for scripting.
  const flashCandidates = availableModels
    .filter((n) => n.includes("flash") && !n.includes("thinking") && !n.includes("live"))
    .sort();
  const shortlist = flashCandidates.length > 0 ? flashCandidates : availableModels.slice(0, 10);
  const fixMe =
    `CONFIGURED AI MODEL IS DEAD. GEMINI_MODEL="${state.model}" is not in ` +
    `Google's current models list. Set GEMINI_MODEL to one of: ` +
    `${shortlist.join(", ")} and redeploy. ` +
    `Full list: https://ai.google.dev/gemini-api/docs/models`;
  state.lastError = fixMe;
  logger.error(
    {
      configuredModel: state.model,
      availableFlashCandidates: flashCandidates,
      availableModels,
      fix: `Set GEMINI_MODEL env var to one of the availableFlashCandidates and redeploy.`,
    },
    fixMe,
  );
}

// Test helpers. Never called by production code.
export function __setAiHealthForTesting(patch: Partial<AiHealth>): void {
  Object.assign(state, patch);
}
export function __resetAiHealthForTesting(): void {
  state.keyConfigured = !!process.env.GEMINI_API_KEY;
  state.model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  state.modelVerified = null;
  state.modelVerifiedAt = null;
  state.lastError = null;
}
