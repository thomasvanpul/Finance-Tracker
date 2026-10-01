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

// Numeris signs in with Google/Apple/GitHub and never calls the provider
// afterwards — nothing reads accessToken, refreshToken or idToken back
// (grep artifacts/*/src, 2026-10-01). better-auth 1.6.23 has no option to
// skip storing them, so a database hook drops them before every account
// write. A stored token is a live credential to the user's Google or
// GitHub account sitting in a finance database for no purpose.
describe("better-auth · OAuth tokens are not stored", () => {
  const TOKENS = { accessToken: "ya29.a", refreshToken: "1//r", idToken: "eyJ.i" };

  it("account create drops access, refresh and id tokens", async () => {
    const before = auth.options.databaseHooks?.account?.create?.before;
    expect(before, "no account create hook — OAuth tokens are written to the account row").toBeTypeOf("function");
    const result = await before!({ providerId: "google", accountId: "1", userId: "u", ...TOKENS } as never);
    const data = (result as { data: Record<string, unknown> }).data;
    expect(data.accessToken).toBeNull();
    expect(data.refreshToken).toBeNull();
    expect(data.idToken).toBeNull();
  });

  it("account update (updateAccountOnSignIn) drops them too", async () => {
    const before = auth.options.databaseHooks?.account?.update?.before;
    expect(before, "no account update hook — every sign-in rewrites fresh tokens").toBeTypeOf("function");
    const result = await before!({ ...TOKENS } as never);
    const data = (result as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ accessToken: null, refreshToken: null, idToken: null });
  });

  it("an update that carries no tokens is not widened — a password change stays a password change", async () => {
    const before = auth.options.databaseHooks?.account?.update?.before;
    const result = await before!({ password: "hash" } as never);
    expect((result as { data: Record<string, unknown> }).data).toEqual({ password: "hash" });
  });
});
