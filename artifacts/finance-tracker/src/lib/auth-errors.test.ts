// The auth error taxonomy exists so that one funnel message ("Could not reach
// the server") stops standing in for unrelated causes. These tests pin the
// distinctions that have actually been got wrong.

import { describe, it, expect } from "vitest";
import { classifyAuthError, makeAuthError } from "./auth-errors";

describe("classifyAuthError — a status code is evidence the server answered", () => {
  it("403 is a server answer, not a connection problem", () => {
    // The live case: better-auth answers 403 "Invalid redirectURL" when a
    // password-reset request names an origin the server does not trust. This
    // was rendered as "Could not reach the server. Check your connection",
    // sending a reader to look at the network for a config fault.
    const e = classifyAuthError({ status: 403, message: "Invalid redirectURL" });
    expect(e.kind).toBe("server_error");
    expect(e.message).not.toMatch(/could not reach/i);
  });

  it("429 is rate limiting, ahead of every other rule", () => {
    expect(classifyAuthError({ status: 429, message: "Too many requests" }).kind)
      .toBe("rate_limited");
  });

  it("503 with the transport message is reset_transport_off, not a generic 5xx", () => {
    // app.ts refuses the reset endpoint with this exact wording when no
    // transport is live. The substring match must win over the status rule.
    const e = classifyAuthError({
      status: 503,
      message: "Password reset email transport is not configured on this server.",
    });
    expect(e.kind).toBe("reset_transport_off");
  });

  it("401 with better-auth's ambiguous credential message stays wrong_credentials", () => {
    expect(classifyAuthError({ status: 401, message: "Invalid email or password" }).kind)
      .toBe("wrong_credentials");
  });

  it("no status and nothing recognisable -> unreachable, not server_error", () => {
    // The honest bucket: we cannot tell the server ever responded, so we do
    // not put the blame on it. This is the native-shell bug's lesson.
    expect(classifyAuthError({ message: "something nobody mapped" }).kind).toBe("unreachable");
  });

  it("a fetch TypeError is a client-side network failure, not a server error", () => {
    const e = classifyAuthError(new TypeError("Failed to fetch"));
    expect(["network", "unreachable"]).toContain(e.kind);
  });
});

// ── Email verification, added 2026-09-19 with requireEmailVerification ──────
//
// Every case here was reachable BEFORE the kinds existed, and every one of
// them rendered as something false. That is the point of the taxonomy.

describe("classifyAuthError · email verification", () => {
  it("403 \"Email not verified\" is email_not_verified, not server_error", () => {
    // better-auth answers exactly this on sign-in when the address has not
    // been confirmed (dist/api/routes/sign-in.mjs:242, BASE_ERROR_CODES
    // .EMAIL_NOT_VERIFIED = "Email not verified"). Without this branch it
    // fell through to the `status >= 400` rule and told the user "the
    // server responded with an error. Try again in a moment" — a claim
    // about the server, and a retry that can never work, for something the
    // user fixes in their inbox.
    const e = classifyAuthError({ status: 403, message: "Email not verified" });
    expect(e.kind).toBe("email_not_verified");
  });

  it("email_not_verified offers to resend rather than to retry", () => {
    const e = classifyAuthError({ status: 403, message: "Email not verified" });
    expect(e.action?.intent).toBe("resend_verification");
  });

  it("the EMAIL_NOT_VERIFIED code spelling classifies the same way", () => {
    expect(classifyAuthError({ status: 403, message: "EMAIL_NOT_VERIFIED" }).kind)
      .toBe("email_not_verified");
  });

  it("503 for a closed sign-up is signup_closed, NOT reset_transport_off", () => {
    // Both server strings contain "transport is not configured". If the
    // classifier tested the shorter one first, a closed sign-up would tell
    // the user that password reset is unavailable — a true sentence about
    // the wrong feature, which is worse than a vague one.
    const e = classifyAuthError({
      status: 503,
      message: "Email verification transport is not configured on this server, so sign-up is closed.",
    });
    expect(e.kind).toBe("signup_closed");
  });

  it("the reset message still classifies as reset_transport_off", () => {
    // Guards the ordering from the other side: adding the more specific
    // branch must not have swallowed the general one.
    const e = classifyAuthError({
      status: 503,
      message: "Password reset email transport is not configured on this server.",
    });
    expect(e.kind).toBe("reset_transport_off");
  });

  it("every kind has a message and no kind's message is empty", () => {
    // Cheap completeness lock: a new kind added to the union without a
    // MESSAGES entry is a TypeScript error, but an empty string is not.
    for (const kind of [
      "email_not_verified", "signup_closed", "reset_transport_off",
    ] as const) {
      expect(makeAuthError(kind).message.trim().length).toBeGreaterThan(0);
    }
  });
});
