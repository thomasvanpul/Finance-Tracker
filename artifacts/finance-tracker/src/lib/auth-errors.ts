import { apiFetch } from "./api-fetch";

// Auth error taxonomy.
//
// One string ("Could not reach the server") has meant: bad
// database password, a cold start, a nonexistent account. That
// funnel is the failure mode the auth rebuild targets. Every
// distinguishable failure now has its own kind and its own
// user-facing message.
//
// The mapping is deliberately narrow: eight kinds. If the API
// starts surfacing more distinct failures, add them here rather
// than smuggling a raw error.message into the UI.
//
// Cold-start handling is worth naming: the Render free tier
// sleeps after ~15 min idle, and the wake takes up to ~60s.
// A pure timeout is indistinguishable from a hung server, so
// the fetch layer marks the first fetch attempt as "coldstart-
// possible" and the UI renders that as an explicit "server
// waking" line rather than a generic spinner.

export type AuthErrorKind =
  | "wrong_credentials"     // email/password did not match
  | "no_such_account"        // no user with that email
  | "email_taken"            // sign-up email already in use
  | "provider_unavailable"   // OAuth click hit a provider that
                             // isn't actually configured (shouldn't
                             // happen if useAuthProviders is fresh)
  | "reset_transport_off"    // RESEND_API_KEY not set on server
  | "reset_token_invalid"    // reset link expired or malformed
  | "rate_limited"           // 429 from the auth-limiter middleware
  | "two_factor_wrong"       // TOTP code did not verify
  | "server_waking"          // network timeout during Render cold start
  | "server_error"           // 500 or unknown API failure
  | "network"                // fetch itself threw (offline, DNS, …)
  ;

export interface AuthError {
  kind: AuthErrorKind;
  // User-facing message, single sentence, no emoji, no
  // technical detail beyond what the user can act on.
  message: string;
  // Optional hint for a follow-up action the UI can render as a
  // small link/button (e.g. "Try sign up instead" for no_such_account).
  action?: {
    label: string;
    intent: "signup" | "signin" | "forgot" | "retry";
  };
}

const MESSAGES: Record<AuthErrorKind, string> = {
  wrong_credentials:   "Wrong email or password.",
  no_such_account:     "No account with that email.",
  email_taken:         "An account with that email already exists.",
  provider_unavailable: "That provider is not available right now.",
  reset_transport_off: "Password reset is not configured on this server. Contact the operator.",
  reset_token_invalid: "This reset link has expired. Request a new one.",
  rate_limited:        "Too many attempts. Wait a minute, then try again.",
  two_factor_wrong:    "That 6-digit code did not match.",
  server_waking:       "The server is waking up. This can take up to a minute on the free tier.",
  server_error:        "Something went wrong on our end. Try again in a moment.",
  network:             "Could not reach the server. Check your connection.",
};

const DEFAULT_ACTIONS: Partial<Record<AuthErrorKind, AuthError["action"]>> = {
  no_such_account: { label: "Sign up instead", intent: "signup" },
  email_taken:     { label: "Sign in instead", intent: "signin" },
  reset_token_invalid: { label: "Request a new link", intent: "forgot" },
  server_waking:   { label: "Retry", intent: "retry" },
  server_error:    { label: "Retry", intent: "retry" },
  network:         { label: "Retry", intent: "retry" },
};

export function makeAuthError(kind: AuthErrorKind): AuthError {
  return { kind, message: MESSAGES[kind], action: DEFAULT_ACTIONS[kind] };
}

// Classify a better-auth error object OR a network exception.
// Better-auth surfaces failures on the `res.error` field with a
// `message` and often a `statusText` / `status`. Anything the
// mapping doesn't recognise falls through to "server_error"
// (which the UI renders with a Retry action).
//
// The classifier is deliberately conservative — matching on
// substrings means a new provider message on the server that
// nobody expected here will simply route to "server_error"
// rather than misclaim a specific cause.
export function classifyAuthError(err: unknown): AuthError {
  // Network-layer throw (fetch failed, DNS, offline)
  if (err instanceof TypeError && /fetch|network|failed to fetch/i.test(err.message)) {
    return makeAuthError("network");
  }

  // Better-auth error object shape
  type BAErr = {
    message?: string;
    statusText?: string;
    status?: number;
    error?: { message?: string };
  };
  const be = err as BAErr;
  const raw = (be?.message ?? be?.error?.message ?? be?.statusText ?? "").toString();
  const lower = raw.toLowerCase();
  const status = typeof be?.status === "number" ? be.status : undefined;

  if (status === 429) return makeAuthError("rate_limited");

  // Reset transport disabled (thrown from sendResetPassword in
  // better-auth.ts when RESEND_API_KEY is missing).
  if (lower.includes("transport is not configured")) return makeAuthError("reset_transport_off");

  // Reset link expired / invalid
  if (lower.includes("invalid token") || lower.includes("expired") || lower.includes("token") && lower.includes("invalid")) {
    return makeAuthError("reset_token_invalid");
  }

  // Two-factor
  if (lower.includes("two") || lower.includes("2fa") || lower.includes("factor") || lower.includes("totp") || lower.includes("code")) {
    return makeAuthError("two_factor_wrong");
  }

  // Email already in use (sign-up)
  if (lower.includes("already exists") || lower.includes("already in use") || lower.includes("user_already_exists")) {
    return makeAuthError("email_taken");
  }

  // No such account. Better-auth's default is a deliberately
  // ambiguous "Invalid email or password" — we don't try to
  // fingerprint the difference for sign-in, per security best
  // practice. But EXPLICIT "user not found" from a reset-request
  // path does route here.
  if (lower.includes("user not found") || lower.includes("no such user") || lower.includes("no account")) {
    return makeAuthError("no_such_account");
  }

  // Wrong credentials — the common sign-in failure.
  if (
    lower.includes("invalid email or password") ||
    lower.includes("invalid credentials") ||
    lower.includes("incorrect password") ||
    lower.includes("wrong password")
  ) {
    return makeAuthError("wrong_credentials");
  }

  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return makeAuthError("server_error");
  }

  return makeAuthError("server_error");
}

// Cold-start heuristic. Called AFTER an initial fetch failure.
// Pings the health endpoint with a 3s soft timeout — if the
// health endpoint responds within the timeout the failure was
// something else (probably rate-limit or a real 500); if it
// doesn't, the server is likely cold-starting on Render's free
// tier. Callers upgrade a `network` to `server_waking` when
// this returns true.
export async function looksLikeColdStart(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    // apiFetch prepends the native API base on Capacitor iOS — otherwise
    // the health probe resolves inside the local bundle and returns
    // "ok" instantly, hiding a genuinely cold server.
    const res = await apiFetch("/api/healthz", {
      method: "GET",
      signal: controller.signal,
    });
    // Health endpoint responded quickly → server was NOT cold.
    return !res.ok;
  } catch {
    // No response within 3s → probably cold-starting.
    return true;
  } finally {
    clearTimeout(timeout);
  }
}
