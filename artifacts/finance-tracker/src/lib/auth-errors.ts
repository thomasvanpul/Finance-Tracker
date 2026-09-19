import { apiFetch } from "./api-fetch";

// Auth error taxonomy.
//
// One string ("Could not reach the server") has meant: bad
// database password, a cold start, a nonexistent account. That
// funnel is the failure mode the auth rebuild targets. Every
// distinguishable failure now has its own kind and its own
// user-facing message.
//
// The mapping is deliberately narrow. If the API
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
  | "reset_transport_off"    // no mail transport on the server, so a
                             //   reset link cannot be delivered
  | "signup_closed"          // same, for sign-up: verification is required
                             //   and the server cannot send the link, so it
                             //   refuses rather than bank a dead account
  | "email_not_verified"     // correct password, but the address has never
                             //   been confirmed. 403 from better-auth.
  | "reset_token_invalid"    // reset link expired or malformed
  | "rate_limited"           // 429 from the auth-limiter middleware
  | "two_factor_wrong"       // TOTP code did not verify
  | "server_waking"          // network timeout during Render cold start
  | "server_error"           // 5xx from the API — the server DID
                             //   respond and told us it errored. Do
                             //   NOT map unknown failures here — see
                             //   `unreachable` for those.
  | "unreachable"            // request never got a response. Could be
                             //   the device (offline, DNS, CORS reject),
                             //   the network in between, a broken
                             //   build config (native shell missing
                             //   VITE_NATIVE_API_URL), or the server.
                             //   We can't tell from here.
  | "network"                // fetch itself threw a network TypeError
                             //   (offline is the common case)
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
    intent: "signup" | "signin" | "forgot" | "retry" | "resend_verification";
  };
}

const MESSAGES: Record<AuthErrorKind, string> = {
  wrong_credentials:   "Wrong email or password.",
  no_such_account:     "No account with that email.",
  email_taken:         "An account with that email already exists.",
  provider_unavailable: "That provider is not available right now.",
  reset_transport_off: "Password reset is not configured on this server. Contact the operator.",
  signup_closed:       "Sign-up is closed: this server cannot send the confirmation email. Contact the operator.",
  // Not a failure the user caused, and not one a retry fixes — so the
  // message names the next action and the action below offers to resend.
  email_not_verified:  "Confirm your email address first. The link is in the message we sent when you signed up.",
  reset_token_invalid: "This reset link has expired. Request a new one.",
  rate_limited:        "Too many attempts. Wait a minute, then try again.",
  two_factor_wrong:    "That 6-digit code did not match.",
  server_waking:       "The server is waking up. This can take up to a minute on the free tier.",
  // 5xx from the API — the server responded and reported an error on
  // its side. Do not use this for "we never got a response" — that
  // would put the blame in the wrong place.
  server_error:        "The server responded with an error. Try again in a moment.",
  // No response at all. Names the two most likely causes so a
  // reviewer / user has something to check other than "retry blindly".
  // "Something went wrong on our end" was the previous wording for
  // this case — false when the request never left the device (the
  // native-shell config bug that lost us a whole session).
  unreachable:         "Could not reach the server. Check your connection; if it still fails, this is more likely a client-side network or config issue than a server one.",
  network:             "Your device is offline. Reconnect, then try again.",
};

const DEFAULT_ACTIONS: Partial<Record<AuthErrorKind, AuthError["action"]>> = {
  no_such_account: { label: "Sign up instead", intent: "signup" },
  email_taken:     { label: "Sign in instead", intent: "signin" },
  reset_token_invalid: { label: "Request a new link", intent: "forgot" },
  email_not_verified:  { label: "Send the link again", intent: "resend_verification" },
  server_waking:   { label: "Retry", intent: "retry" },
  server_error:    { label: "Retry", intent: "retry" },
  unreachable:     { label: "Retry", intent: "retry" },
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
  // Network-layer throw (fetch failed, DNS, offline, CORS reject).
  // Distinguish "device is offline" (no network at all) from "request
  // never got a response for some other reason" (DNS, CORS, cross-
  // origin block, native shell missing VITE_NATIVE_API_URL). The
  // browser's own online/offline signal is the clearest tell we have.
  if (err instanceof TypeError && /fetch|network|failed to fetch/i.test(err.message)) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return makeAuthError("network");
    }
    return makeAuthError("unreachable");
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

  // Mail transport disabled on the server. TWO cases, and the more
  // specific one is tested FIRST — both strings contain "transport is not
  // configured", so the other order would report a closed sign-up as a
  // password-reset problem. See api-server/src/lib/email-transport.ts,
  // which owns both strings and locks this ordering in its own test.
  if (lower.includes("email verification transport is not configured")) {
    return makeAuthError("signup_closed");
  }
  if (lower.includes("transport is not configured")) return makeAuthError("reset_transport_off");

  // Correct password, unconfirmed address. better-auth answers
  // 403 "Email not verified" (dist/api/routes/sign-in.mjs:242, base error
  // code EMAIL_NOT_VERIFIED). Checked BEFORE the two-factor branch below,
  // which matches the bare substring "code" and would otherwise be reached
  // by any future wording carrying it; and well before the `status >= 400`
  // fallback, which would render this as "the server responded with an
  // error" — a claim about the server for something the user can fix in
  // their inbox.
  if (lower.includes("not verified") || lower.includes("email_not_verified")) {
    return makeAuthError("email_not_verified");
  }

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

  // Any status at all means the server answered. The `unreachable` bucket
  // below is for the case where we cannot tell that it did — see its comment.
  // This used to test only the 5xx codes, so a 403 fell through and was
  // rendered as "Could not reach the server. Check your connection", which is
  // a claim about the network that the status code already contradicts. The
  // live instance of it: better-auth answers 403 "Invalid redirectURL" when a
  // reset request names an origin the server does not trust, and the reset
  // screen reported a connection problem for a configuration one.
  if (typeof status === "number" && status >= 400) {
    return makeAuthError("server_error");
  }

  // Unknown failure. Do NOT map to `server_error` — the classifier
  // arriving here means we could not identify the failure OR
  // extract a status code, which means we do not know that the
  // server ever responded. `unreachable` is the honest bucket.
  //
  // Historical bug this prevents: a native shell whose /api call
  // resolved inside `capacitor://localhost` and never left the
  // device was rendered as "Something went wrong on our end" — a
  // literal falsehood about where the failure happened. Cost one
  // session to diagnose; the fix is a code path, not a copy tweak.
  return makeAuthError("unreachable");
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
