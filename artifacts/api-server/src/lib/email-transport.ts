// Can this server put an email in front of the person it is about?
//
// One function, consulted by five places that would otherwise each answer it
// against RESEND_API_KEY:
//
//   1. routes/auth-providers.ts — decides whether the UI shows
//      "Forgot password?" at all.
//   2. app.ts — refuses POST /api/auth/request-password-reset outright
//      when nothing can be delivered.
//   3. app.ts — refuses sign-up outright when email verification is
//      required and nothing can be delivered (see the lockout note below).
//   4. lib/better-auth.ts sendResetPassword — the actual delivery.
//   5. lib/better-auth.ts sendVerificationEmail — the actual delivery.
//
// Named for the capability, not the caller. It was
// `password-reset-transport.ts` until email verification became the second
// thing that cannot ship without it; the question both ask is identical.
//
// ── Why (2) and (3) exist, and why the throw in (4)/(5) is not enough ───────
//
// better-auth 1.6.23 runs sendResetPassword AND sendVerificationEmail as
// BACKGROUND TASKS (`runInBackgroundOrAwait`, dist/api/routes/sign-up.mjs:241
// and dist/api/routes/password.mjs). A throw inside either never reaches the
// HTTP response: request-password-reset still answers 200
// {"status":true,"message":"If this email exists in our system, check your
// email for the reset link"} and the server logs "Failed to run background
// task". Measured against the local API on 2026-09-19 with RESEND_API_KEY
// unset.
//
// So the old defence — "we THROW so better-auth returns an error the client
// can render" — did not hold. The client saw success and showed "Check your
// inbox" for a mail that was never dispatched: the exact silent-lie failure
// the reset path was written to avoid. The only thing hiding it was the UI
// gate in (1), which is a display decision, not a guarantee. The refusals in
// (2) and (3) run BEFORE better-auth and are therefore the parts that hold.
//
// ── The lockout that (3) prevents ──────────────────────────────────────────
//
// With emailAndPassword.requireEmailVerification on, sign-up creates the user
// with emailVerified=false and returns NO session, and every later sign-in
// answers 403 "Email not verified" until a link is clicked. If no transport is
// live, that link is never sent — so an account is created that can never be
// signed into and never be deleted by the person who made it. Refusing the
// sign-up is the only honest answer: the server is missing a capability, and
// it says so instead of banking a dead account.
//
// ── The dev-log transport ──────────────────────────────────────────────────
//
// With no mail provider there is still a way to exercise the whole flow
// locally: print the link to the server log. That is a genuine recovery path
// for a developer at a terminal and NOT one for a user, so it is fenced the
// same way routes/dev.ts is fenced, for the same recorded reason — a check
// keyed only to `NODE_ENV !== "production"` silently disables itself on a
// platform that never sets NODE_ENV, which this repo has already shipped once.
//
//   BOTH required:
//     1. DEV_EMAIL_LOG === "1"            ← the load-bearing opt-in
//     2. NODE_ENV !== "production"        ← only ever adds a refusal
//
// Unset means OFF. Email always wins when both are configured.

export type EmailTransport =
  /** RESEND_API_KEY is set — the link is emailed to the user. */
  | { kind: "email" }
  /** Dev opt-in — the link is written to the server log and nothing is sent. */
  | { kind: "dev-log" }
  /** Nothing can be delivered. The request must be refused, not accepted. */
  | { kind: "none" };

type Env = Record<string, string | undefined>;

function isSet(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function resolveEmailTransport(env: Env = process.env): EmailTransport {
  if (isSet(env.RESEND_API_KEY)) return { kind: "email" };
  if (env.DEV_EMAIL_LOG === "1" && env.NODE_ENV !== "production") {
    return { kind: "dev-log" };
  }
  return { kind: "none" };
}

/** True when a transactional email can be honoured by some means. */
export function isEmailDeliverable(env: Env = process.env): boolean {
  return resolveEmailTransport(env).kind !== "none";
}

// The single wording for "this server cannot deliver a reset". The frontend
// classifier (finance-tracker/src/lib/auth-errors.ts) matches the substring
// "transport is not configured" to render `reset_transport_off`, so this
// string is a contract, not a message. Changing it without changing the
// classifier turns a precise error back into the generic funnel the auth
// taxonomy was written to break up.
export const RESET_TRANSPORT_OFF_MESSAGE =
  "Password reset email transport is not configured on this server.";

// Same kind of contract, for the sign-up refusal. NOTE the classifier checks
// this longer phrase BEFORE the reset one: this string also contains
// "transport is not configured", so a naive ordering would report a closed
// sign-up as a password-reset problem. Two capabilities, two messages.
export const VERIFICATION_TRANSPORT_OFF_MESSAGE =
  "Email verification transport is not configured on this server, so sign-up is closed.";
