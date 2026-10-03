// The AI switch — BACKLOG § I7. AI is opt-in (Thomas, 3 Oct 2026, consent
// basis): nothing is sent to an AI provider, including the dashboard
// insights that load on mount, until the user turns AI on in Settings →
// AI Coach.
//
// The switch is the account-level key `nr-ai-enabled` (account-storage-
// keys.ts), so it follows the user across devices and the server can read
// it. The server is the authority (api-server lib/ai-consent.ts refuses an
// AI-metered request while it is off); apiFetch consults isAiEnabled()
// first so that, while it is off, no AI request leaves the device at all.
//
// Only exactly "true" is on. Absent — a new account, or a device that has
// not hydrated preferences yet — is off.
//
// Kept free of imports: api-fetch.ts imports this module.

export const AI_ENABLED_KEY = "nr-ai-enabled";

export const AI_ENABLED_CHANGE_EVENT = "numeris-ai-enabled-change";

// Same wording as the server's refusal (AI_OFF_MESSAGE in lib/ai-consent.ts).
export const AI_OFF_MESSAGE = "AI is off for this account. Turn it on in Settings → AI Coach.";

// Mirrors AI_METERED_PREFIXES in api-server app.ts, less /api/ai/status:
// that endpoint is public, carries no user data, and only reports whether
// a provider is answering.
const AI_REQUEST_PREFIXES = ["/api/ai", "/api/receipt"] as const;
const AI_STATUS_PATH = "/api/ai/status";

export function isAiRequestPath(path: string): boolean {
  const bare = path.split(/[?#]/)[0];
  if (bare === AI_STATUS_PATH) return false;
  return AI_REQUEST_PREFIXES.some((p) => bare === p || bare.startsWith(`${p}/`));
}

export function isAiEnabled(): boolean {
  try {
    return localStorage.getItem(AI_ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

// The refusal apiFetch returns in place of a request, shaped like the
// server's 403 so callers need no new error path.
export function aiOffResponse(): Response {
  return new Response(JSON.stringify({ error: AI_OFF_MESSAGE, code: "ai_off" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}
