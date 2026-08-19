// Contract locks on better-auth configuration properties whose failure
// mode is silent: no error at the misconfigured moment, wrong behaviour
// later. Each expect() failure message names the specific consequence,
// so a future developer who broke the lock sees why it was there
// without having to grep git history.

import { describe, it, expect, vi } from "vitest";

// @workspace/db throws at import time if DATABASE_URL is unset. The
// test environment doesn't set it. Mock the db surface so importing
// better-auth doesn't touch a real Neon connection — we only need
// the compiled auth.options object, not a live adapter.
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

describe("better-auth · trustedProviders locks", () => {
  it("github MUST NOT be in trustedProviders — auto-link is account takeover", () => {
    // Widen to readonly string[] so `.includes("github")` typechecks
    // when github isn't in the array's literal union (which is the
    // whole point of the test — the compiled type has narrowed to
    // exclude it, but we still want a runtime lock in case someone
    // re-adds it deliberately).
    const trusted = (auth.options.account?.accountLinking?.trustedProviders ?? []) as readonly string[];
    // The failure message is the reasoning, so a diff-only reviewer
    // seeing "just re-add it, it's convenient" gets the argument
    // that removed it in the first place.
    expect(
      trusted.includes("github"),
      "GitHub in trustedProviders means implicit auto-link on any OAuth callback with a matching email. " +
      "That converts control of a matching GitHub account into control of the user's Numeris account — " +
      "account takeover mediated by a third party's email policy. " +
      "Google and Apple are fine (both provide id_token-verified emails). " +
      "GitHub still works: it falls to the emailVerified gate and users link it deliberately from Settings.",
    ).toBe(false);
  });

  it("google and apple stay in trustedProviders — verified emails only, safe to trust", () => {
    const trusted = auth.options.account?.accountLinking?.trustedProviders ?? [];
    expect(trusted).toContain("google");
    expect(trusted).toContain("apple");
  });

  it("accountLinking.enabled is true — otherwise the Sign-in Methods panel's linkSocial does nothing", () => {
    expect(auth.options.account?.accountLinking?.enabled).toBe(true);
  });
});
