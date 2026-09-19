// The refusal that stops this server banking an account nobody can ever
// sign into.
//
// With emailAndPassword.requireEmailVerification on, better-auth creates the
// user with emailVerified=false, returns no session, and 403s every later
// sign-in until a link is opened. If no mail transport is configured, that
// link is never sent: the account exists, is unreachable, and its owner has
// no way to delete it. The only honest answer is to refuse the sign-up.
//
// It has to be refused HERE, before better-auth, for the same measured
// reason the password-reset refusal is: better-auth 1.6.23 dispatches
// sendVerificationEmail through runInBackgroundOrAwait
// (dist/api/routes/sign-up.mjs:241), so a throw inside the callback never
// reaches the response. The endpoint would answer 200 and the UI would show
// "check your inbox" for a mail nobody sent.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {},
  userTable: {},
  sessionTable: {},
  accountTable: {},
  verificationTable: {},
  twoFactorTable: {},
  passkeyTable: {},
}));

const { isVerificationDependentPath } = await import("./app");
const { isEmailDeliverable, VERIFICATION_TRANSPORT_OFF_MESSAGE } =
  await import("./lib/email-transport");
const { REQUIRE_EMAIL_VERIFICATION } = await import("./lib/auth-policy");

// ── (a) Which paths the refusal covers ──────────────────────────────────────

describe("sign-up refusal · which /api/auth/* paths depend on a mail transport", () => {
  const MUST_BE_COVERED: readonly string[] = [
    // Creates the account.
    "/api/auth/sign-up/email",
    // The "didn't get it?" button. Uncovered, it would report success for
    // a mail nobody sent — the same silent lie, one screen later.
    "/api/auth/send-verification-email",
  ];

  const MUST_NOT_BE_COVERED: readonly string[] = [
    // Signing IN does not need to send anything when the address is
    // already confirmed. Refusing it would lock out every existing user
    // the moment the mail provider lapsed — turning a degraded feature
    // into a total outage.
    "/api/auth/sign-in/email",
    "/api/auth/sign-in/social",
    // Polled on every page load. Never refuse it.
    "/api/auth/get-session",
    "/api/auth/callback/google",
    "/api/auth/sign-out",
    // Reset has its own refusal with its own message; it must not be
    // swallowed by this one, or the user is told the wrong thing.
    "/api/auth/request-password-reset",
  ];

  it.each(MUST_BE_COVERED)("%s is gated on the mail transport", (path) => {
    expect(isVerificationDependentPath(path)).toBe(true);
  });

  it.each(MUST_NOT_BE_COVERED)("%s is NOT gated on the mail transport", (path) => {
    expect(isVerificationDependentPath(path)).toBe(false);
  });
});

// ── (b) The refusal only exists because verification is required ────────────

describe("sign-up refusal · the condition it hangs on", () => {
  const SAVED: Record<string, string | undefined> = {};
  const KEYS = ["RESEND_API_KEY", "DEV_EMAIL_LOG", "NODE_ENV"];

  beforeEach(() => {
    for (const k of KEYS) SAVED[k] = process.env[k];
    for (const k of KEYS) delete process.env[k];
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (SAVED[k] === undefined) delete process.env[k];
      else process.env[k] = SAVED[k];
    }
  });

  it("with verification required and no transport, sign-up must be refused", () => {
    // This is the whole proposition, stated as the two facts app.ts ANDs
    // together. Asserting the predicate rather than booting a server keeps
    // it true through any reorganisation of the middleware.
    expect(REQUIRE_EMAIL_VERIFICATION).toBe(true);
    expect(isEmailDeliverable()).toBe(false);
    expect(
      REQUIRE_EMAIL_VERIFICATION
      && isVerificationDependentPath("/api/auth/sign-up/email")
      && !isEmailDeliverable(),
    ).toBe(true);
  });

  it("a live transport reopens sign-up — the refusal is a capability gate, not a ban", () => {
    process.env.RESEND_API_KEY = "re_live_x";
    expect(isEmailDeliverable()).toBe(true);
    expect(
      REQUIRE_EMAIL_VERIFICATION
      && isVerificationDependentPath("/api/auth/sign-up/email")
      && !isEmailDeliverable(),
    ).toBe(false);
  });

  it("the dev-log transport also reopens it, so local work is not blocked", () => {
    process.env.DEV_EMAIL_LOG = "1";
    expect(isEmailDeliverable()).toBe(true);
  });

  it("the refusal message names verification, not password reset", () => {
    // Two 503s leave this server with almost the same shape. The frontend
    // classifier tells them apart on this wording alone.
    expect(VERIFICATION_TRANSPORT_OFF_MESSAGE.toLowerCase())
      .toContain("email verification transport is not configured");
    expect(VERIFICATION_TRANSPORT_OFF_MESSAGE.toLowerCase()).toContain("sign-up");
  });
});
