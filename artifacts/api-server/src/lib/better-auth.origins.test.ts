// Locks on the two origin-derived auth values whose failure mode is silent.
//
// Both were found during the financetracker.work → numeris.page migration:
//
//   1. WebAuthn origin was `allowedOrigins[0]`. During a cutover
//      ALLOWED_ORIGINS legitimately lists two hosts, and every passkey
//      ceremony from whichever host came second failed verification — no
//      CORS error, no log line the user could act on, just a sign-in that
//      did not work from one of two working URLs.
//   2. rpID was inferred from baseURL's hostname with nothing naming it.
//      rpID is baked into every stored credential, so the day API_BASE_URL
//      moves, every enrolled passkey silently stops being offered.
//
// These are runtime-env reads, so each case re-imports the module with the
// env it is asserting about.

import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {}, userTable: {}, sessionTable: {}, accountTable: {},
  verificationTable: {}, twoFactorTable: {}, passkeyTable: {},
}));

async function importWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) vi.stubEnv(k, "");
    else vi.stubEnv(k, v);
  }
  return await import("./better-auth");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("better-auth · WebAuthn origins during a domain cutover", () => {
  it("accepts EVERY configured origin, not just the first", async () => {
    const { WEBAUTHN_ORIGINS } = await importWith({
      ALLOWED_ORIGINS: "https://numeris.page,https://financetracker.work,capacitor://localhost",
      API_BASE_URL: "https://numeris.page",
    });
    expect(
      WEBAUTHN_ORIGINS,
      "Taking ALLOWED_ORIGINS[0] meant passkeys worked from one host and " +
      "silently failed from the other for the whole cutover window. " +
      "@simplewebauthn's expectedOrigin accepts an array — pass all of them.",
    ).toEqual([
      "https://numeris.page",
      "https://financetracker.work",
      "capacitor://localhost",
    ]);
  });

  it("falls back to the dev origin when nothing is configured — never to a live host", async () => {
    const { WEBAUTHN_ORIGINS } = await importWith({
      ALLOWED_ORIGINS: "",
      API_BASE_URL: "",
    });
    expect(WEBAUTHN_ORIGINS).toBe("http://localhost:4321");
  });
});

describe("better-auth · passkey rpID", () => {
  it("defaults to the hostname of the configured API origin", async () => {
    const { WEBAUTHN_RP_ID } = await importWith({
      PASSKEY_RP_ID: "",
      API_BASE_URL: "https://numeris.page",
      ALLOWED_ORIGINS: "https://numeris.page",
    });
    expect(WEBAUTHN_RP_ID).toBe("numeris.page");
  });

  it("is overridable, because changing it invalidates every enrolled passkey", async () => {
    const { WEBAUTHN_RP_ID } = await importWith({
      PASSKEY_RP_ID: "financetracker.work",
      API_BASE_URL: "https://numeris.page",
      ALLOWED_ORIGINS: "https://numeris.page",
    });
    expect(
      WEBAUTHN_RP_ID,
      "PASSKEY_RP_ID exists so the rpID move is a decision someone makes " +
      "in a deploy, not something that happens as a side effect of " +
      "editing API_BASE_URL.",
    ).toBe("financetracker.work");
  });

  it("treats a blank PASSKEY_RP_ID as unset rather than as an empty rpID", async () => {
    // Render and Vercel both let you create a key with an empty value, and
    // `??` would have passed "" straight through — an rpID no credential can
    // ever match, i.e. passkeys that never work and never say why.
    const { WEBAUTHN_RP_ID } = await importWith({
      PASSKEY_RP_ID: "   ",
      API_BASE_URL: "https://numeris.page",
      ALLOWED_ORIGINS: "https://numeris.page",
    });
    expect(WEBAUTHN_RP_ID).toBe("numeris.page");
  });
});
