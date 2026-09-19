// The gate that decides whether this server will accept a password-reset
// request or a sign-up at all. Five call sites depend on it agreeing with
// itself (routes/auth-providers.ts, app.ts twice, lib/better-auth.ts twice),
// so it is tested as a pure function over an env object rather than through
// any of them.

import { describe, it, expect } from "vitest";
import {
  resolveEmailTransport,
  isEmailDeliverable,
  RESET_TRANSPORT_OFF_MESSAGE,
  VERIFICATION_TRANSPORT_OFF_MESSAGE,
} from "./email-transport";

describe("resolveEmailTransport", () => {
  it("empty env -> none. Unset means off, never on", () => {
    expect(resolveEmailTransport({})).toEqual({ kind: "none" });
    expect(isEmailDeliverable({})).toBe(false);
  });

  it("RESEND_API_KEY set -> email", () => {
    expect(resolveEmailTransport({ RESEND_API_KEY: "re_live_x" })).toEqual({ kind: "email" });
  });

  it("whitespace-only RESEND_API_KEY is not a key", () => {
    // A blank env var in a dashboard is the classic way a check reads as
    // configured while nothing can be delivered.
    expect(resolveEmailTransport({ RESEND_API_KEY: "   " })).toEqual({ kind: "none" });
  });

  it("DEV_EMAIL_LOG=1 outside production -> dev-log", () => {
    expect(resolveEmailTransport({ DEV_EMAIL_LOG: "1", NODE_ENV: "development" }))
      .toEqual({ kind: "dev-log" });
  });

  it("DEV_EMAIL_LOG=1 with NODE_ENV unset -> dev-log", () => {
    // Deliberate. The opt-in is the load-bearing half; a deployment that
    // never sets NODE_ENV must not be able to turn this on by omission,
    // and it cannot, because it would still have to set the flag itself.
    expect(resolveEmailTransport({ DEV_EMAIL_LOG: "1" })).toEqual({ kind: "dev-log" });
  });

  it("DEV_EMAIL_LOG=1 in production -> none", () => {
    expect(resolveEmailTransport({ DEV_EMAIL_LOG: "1", NODE_ENV: "production" }))
      .toEqual({ kind: "none" });
  });

  it.each(["0", "true", "yes", "", " 1 "])(
    "DEV_EMAIL_LOG=%j is not an opt-in — only the exact string \"1\" is",
    (value) => {
      expect(resolveEmailTransport({ DEV_EMAIL_LOG: value })).toEqual({ kind: "none" });
    },
  );

  it("email wins over dev-log when both are set", () => {
    expect(resolveEmailTransport({ RESEND_API_KEY: "re_live_x", DEV_EMAIL_LOG: "1" }))
      .toEqual({ kind: "email" });
  });
});


describe("the two off-messages the frontend classifier keys on", () => {
  it("RESET_TRANSPORT_OFF_MESSAGE contains the substring the classifier matches", () => {
    // finance-tracker/src/lib/auth-errors.ts maps this to
    // `reset_transport_off`. If the wording drifts, a precise error
    // silently degrades into the generic "unreachable" bucket.
    expect(RESET_TRANSPORT_OFF_MESSAGE.toLowerCase()).toContain("transport is not configured");
  });

  it("VERIFICATION_TRANSPORT_OFF_MESSAGE names email verification, not reset", () => {
    expect(VERIFICATION_TRANSPORT_OFF_MESSAGE.toLowerCase())
      .toContain("email verification transport is not configured");
  });

  it("the verification message is a STRICT extension of the reset substring", () => {
    // Both contain "transport is not configured". That is why the
    // classifier must test the longer, more specific phrase first — this
    // test exists so that ordering requirement is visible from the strings
    // themselves rather than only from a comment in the classifier.
    const generic = "transport is not configured";
    expect(RESET_TRANSPORT_OFF_MESSAGE.toLowerCase()).toContain(generic);
    expect(VERIFICATION_TRANSPORT_OFF_MESSAGE.toLowerCase()).toContain(generic);
    expect(VERIFICATION_TRANSPORT_OFF_MESSAGE).not.toEqual(RESET_TRANSPORT_OFF_MESSAGE);
  });
});
