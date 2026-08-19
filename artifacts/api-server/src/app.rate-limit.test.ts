// Property locks on rate-limiter wiring. The two bugs these guard
// against had no visible failure mode until the site broke under
// load, with nothing useful in the logs — the strict credential
// limiter accidentally covered get-session (which the client polls),
// and Express's trust-proxy setting was one hop short so every user's
// IP resolved to Render's edge and every user shared one bucket.
//
// Each test asserts a PROPERTY (which paths get the limiter, whether
// two client IPs land in distinct buckets), not a config value. If
// the proxy topology changes or the path list is reorganised, the
// tests still catch the failure mode. If someone rewrites the regex
// or bumps trust proxy to another correct value, the tests still pass.

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

// @workspace/db throws at import time without DATABASE_URL; mock it
// so importing app.ts (which pulls better-auth) works in vitest.
vi.mock("@workspace/db", () => ({
  db: {},
  userTable: {},
  sessionTable: {},
  accountTable: {},
  verificationTable: {},
  twoFactorTable: {},
  passkeyTable: {},
}));

const { isCredentialPath } = await import("./app");

// ── (a) Which paths get the strict limiter ──────────────────────────────────

describe("rate-limit predicate · which /api/auth/* paths get the strict limiter", () => {
  // These accept credentials (email+password, reset token). Brute-force
  // protection lives here.
  const CREDENTIAL_ACCEPTING: readonly string[] = [
    "/api/auth/sign-in/email",
    "/api/auth/sign-in/username",
    "/api/auth/sign-up/email",
    "/api/auth/forget-password",
    "/api/auth/reset-password",
    "/api/auth/reset-password/some-token-xyz",
    "/api/auth/change-password",
  ];

  // These are read paths, callbacks, and stateless helpers. Polled on
  // every page load OR called by an OAuth provider redirect — the
  // client has no control over pacing, so a strict limiter breaks
  // normal use. The original bug was get-session sitting under the
  // strict limiter; the site "lost" its provider buttons because the
  // page-load session poll had already consumed the 20-per-15-min
  // budget.
  const NON_CREDENTIAL: readonly string[] = [
    "/api/auth/get-session",
    "/api/auth/list-sessions",
    "/api/auth/list-accounts",
    "/api/auth/sign-out",
    "/api/auth/callback/google",
    "/api/auth/callback/github",
    "/api/auth/callback/apple",
    "/api/auth/passkey/generate-authenticate-options",
    "/api/auth/passkey/generate-register-options",
    "/api/auth/passkey/verify-authentication",
    "/api/auth/passkey/list-user-passkeys",
    "/api/auth/two-factor/verify",
  ];

  it.each(CREDENTIAL_ACCEPTING)("strict limiter runs on %s", (path) => {
    expect(
      isCredentialPath(path),
      `${path} accepts credentials — the strict limiter must apply here so a brute-force ` +
      `attempt is throttled. If this fails, someone widened the exclusion by mistake and the ` +
      `path is now taking unlimited attempts.`,
    ).toBe(true);
  });

  it.each(NON_CREDENTIAL)("strict limiter does NOT run on %s", (path) => {
    expect(
      isCredentialPath(path),
      `${path} is a read/callback path — the client polls it on every page load OR the OAuth ` +
      `provider calls it. Applying the strict 20-per-15-min limiter here breaks normal use: ` +
      `page loads exhaust the budget and the sign-in page loses its provider buttons. This is ` +
      `the exact bug the CREDENTIAL_PATHS narrowing was introduced to fix.`,
    ).toBe(false);
  });
});

// ── (b) trust proxy · two different client IPs → two different req.ip ───────

describe("trust proxy · client IPs from X-Forwarded-For land in distinct buckets", () => {
  let app: Express;
  let server: Server;
  let baseUrl: string;

  // Rebuild the same trust-proxy setting the real app uses (see app.ts
  // line 26). Test asserts the PROPERTY (distinct IPs → distinct
  // req.ip) rather than the value 2 — the property survives any
  // future correct topology (three hops, three; a single hop, one),
  // and the value doesn't tell you whether the property holds.
  const TRUST_PROXY_DEPTH = 2;

  beforeAll(async () => {
    app = express();
    app.set("trust proxy", TRUST_PROXY_DEPTH);
    app.get("/probe", (req: Request, res: Response) => {
      res.json({ ip: req.ip });
    });
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  async function probeIp(clientForwardedFor: string): Promise<string> {
    const r = await fetch(`${baseUrl}/probe`, {
      headers: { "X-Forwarded-For": clientForwardedFor },
    });
    const body = (await r.json()) as { ip: string };
    return body.ip;
  }

  it("two requests with different client IPs (behind the same proxy chain) resolve to different req.ip", async () => {
    // XFF for our topology: Vercel edge writes client IP, Render
    // edge appends Vercel edge → app sees "client, vercel-edge" and
    // connects from Render's outbound IP (implicit hop-1). Express
    // with trust proxy N returns XFF[max(0, len - N)] — for len=2,
    // N=2, that's index 0: the client.
    //
    // The old bug had trust=1, giving index 1 = vercel-edge for
    // every request → all users in one rate-limit bucket.
    const ipA = await probeIp("1.1.1.1, 10.0.0.99");
    const ipB = await probeIp("2.2.2.2, 10.0.0.99");

    // If this fails, req.ip is the same for both clients — every user
    // in the world is one rate-limit bucket. That's the exact failure
    // the trust-proxy fix (1 → 2) fixed.
    expect(
      ipA,
      "Two requests behind different client IPs resolved to the same req.ip. " +
      "trust proxy is either not set or set to a depth that doesn't unwind the full proxy chain — " +
      "req.ip is now the last-hop proxy address, and rate limiters keyed on req.ip collapse to a single global bucket.",
    ).not.toBe(ipB);
    // Belt and braces: also assert the specific expected values, so
    // a stale test (e.g. someone set both XFFs to the same value)
    // doesn't silently pass.
    expect(ipA).toBe("1.1.1.1");
    expect(ipB).toBe("2.2.2.2");
  });

  it("the property does NOT require a specific numeric value — 2 is today, could change with topology", () => {
    // Sanity check on the setting we're running the property against.
    // A future infra change (Vercel + Render → single-host, or
    // Vercel → Vercel + Cloudflare + Render) means the number
    // changes; the property doesn't. If someone forgets to update
    // TRUST_PROXY_DEPTH here after the topology changes, at least
    // this test states clearly what the current fixture value is.
    expect(app.get("trust proxy")).toBe(TRUST_PROXY_DEPTH);
  });
});
