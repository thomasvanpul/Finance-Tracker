// Email verification is ON. These lock the four facts that, if any one of
// them quietly flipped, would leave the product either insecure or bricked
// with nothing failing anywhere else.
//
// It is a CONFIG lock, not a flow test: the flow belongs to better-auth and
// is exercised against the real server. What cannot be caught by running the
// app is a constant drifting away from what another module believes.

import { describe, it, expect, vi } from "vitest";

// @workspace/db throws at import time without DATABASE_URL.
vi.mock("@workspace/db", () => ({
  db: {},
  userTable: {},
  sessionTable: {},
  accountTable: {},
  verificationTable: {},
  twoFactorTable: {},
  passkeyTable: {},
}));

const { auth } = await import("./better-auth");
const { REQUIRE_EMAIL_VERIFICATION, EMAIL_VERIFICATION_EXPIRES_IN_SECONDS } =
  await import("./auth-policy");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const options = (auth as any).options;

describe("email verification config", () => {
  it("what better-auth enforces is the constant the rest of the server reads", () => {
    // routes/auth-providers.ts tells the sign-up form whether an address
    // must be confirmed, and app.ts decides whether to refuse sign-up at
    // all — both off lib/auth-policy.ts. If better-auth stopped agreeing,
    // the form would promise one thing and the server do another, and
    // nothing would throw.
    expect(options.emailAndPassword?.requireEmailVerification)
      .toBe(REQUIRE_EMAIL_VERIFICATION);
  });

  it("a verification mail is actually wired, not just required", () => {
    // better-auth's own behaviour when requireEmailVerification is on and
    // sendVerificationEmail is absent: sign-in throws FORBIDDEN and sends
    // NOTHING (dist/api/routes/sign-in.mjs:231). Every account created
    // would be permanently unreachable, with a 403 as the only symptom.
    expect(typeof options.emailVerification?.sendVerificationEmail).toBe("function");
  });

  it("the link is sent on sign-up AND on a blocked sign-in", () => {
    // sendOnSignIn is the recovery path. Without it a user who lost the
    // first mail has no way back in from the sign-in form — better-auth
    // 403s and dispatches nothing (sign-in.mjs:232).
    expect(options.emailVerification?.sendOnSignUp).toBe(true);
    expect(options.emailVerification?.sendOnSignIn).toBe(true);
  });

  it("expiry is the policy value, and is neither absent nor absurd", () => {
    expect(options.emailVerification?.expiresIn)
      .toBe(EMAIL_VERIFICATION_EXPIRES_IN_SECONDS);
    // Sanity rails on the constant itself: an hour is hostile to someone
    // who reads mail once a day, a week gives a leaked link too much life.
    expect(EMAIL_VERIFICATION_EXPIRES_IN_SECONDS).toBeGreaterThanOrEqual(60 * 60 * 6);
    expect(EMAIL_VERIFICATION_EXPIRES_IN_SECONDS).toBeLessThanOrEqual(60 * 60 * 72);
  });

  it("password reset is still wired — the shared sender did not lose a caller", () => {
    // Both callbacks were collapsed onto one sendTransactionalEmail helper
    // on 2026-09-19. This is the cheap guard that the collapse kept both
    // ends, not just the new one.
    expect(typeof options.emailAndPassword?.sendResetPassword).toBe("function");
  });
});
