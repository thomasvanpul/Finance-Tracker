// Bearer-token wiring for authClient · web-safety proof.
//
// The 28-Aug fix adds `fetchOptions.auth.token: getBearerTokenForAuthClient`
// to the createAuthClient config. The whole safety argument for the web
// path rests on one property: `getBearerTokenForAuthClient()` resolves to
// `undefined` when isNativeShell() is false, and @better-fetch's Bearer
// branch skips the Authorization header when the resolved token is falsy.
// If either half breaks, we silently attach an Authorization header on
// web — a regression on the surface that currently works, in service of
// fixing the one that does not.
//
// Two tests here, one per half. Between them they cover the whole chain
// with real code on both sides of the boundary:
//
//   Test group 1 · getBearerTokenForAuthClient itself. Uses the real
//     function with real loadNativeAuthToken. Only the environment
//     detection (window.Capacitor) and the @capacitor/preferences
//     module are stubbed — both are irrelevant to the getter's contract
//     (return undefined when not native). The stored token is set to a
//     non-empty string deliberately, to prove that isNativeShell short-
//     circuits BEFORE the storage read (so even if a stale token existed,
//     the web path would still return undefined).
//
//   Test group 2 · @better-fetch/fetch's Bearer branch. Uses the real
//     library (same @better-fetch version bundled with better-auth) with
//     a customFetchImpl that captures the outgoing headers. Only the
//     transport is captured; the auth-header logic is real library code.
//     Proves that undefined → no header, "value" → Bearer value.
//
// The two together = when web sends an authClient request, no
// Authorization header goes on the wire.
//
// This is NOT a runtime device test — those still live on the manual
// checklist in docs/BACKLOG.md § G13 (per the operator's rule that a
// mocked native runtime is worse than no test).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createAuthClient } from "better-auth/react";

// ── @capacitor/preferences mock ────────────────────────────────────────────
// The native storage side is UserDefaults on iOS, not runnable in vitest.
// Mocked at the module boundary so the real loadNativeAuthToken code
// exercises its whole path — the mock only supplies what would come out
// of Preferences on device.
let mockStoredToken: string | null = null;
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn(async () => ({ value: mockStoredToken })),
    set: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  },
}));

function setNativeShell(native: boolean): void {
  if (native) {
    (globalThis as unknown as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
    };
  } else {
    delete (globalThis as unknown as { Capacitor?: unknown }).Capacitor;
  }
}

beforeEach(() => {
  // Reset the module cache so native-auth's in-memory `cachedToken` +
  // `cacheHydrated` flags don't leak between tests.
  vi.resetModules();
  mockStoredToken = null;
  setNativeShell(false);
});

// ── Test group 1 · the getter returns undefined on web ─────────────────────

describe("getBearerTokenForAuthClient · web safety", () => {
  it("returns undefined when isNativeShell() is false, even if a token happens to be in storage", async () => {
    // Deliberately populate the mocked Preferences. If the isNativeShell
    // short-circuit ever regressed, this token would leak into the getter
    // and this test would catch that.
    mockStoredToken = "should-not-leak-onto-web-requests";
    setNativeShell(false);

    const { getBearerTokenForAuthClient, isNativeShell } = await import("./native-auth");
    expect(isNativeShell()).toBe(false);
    expect(await getBearerTokenForAuthClient()).toBeUndefined();
  });

  it("returns the stored token when isNativeShell() is true", async () => {
    // Same helper, opposite gate — proves the getter isn't stuck at undefined.
    mockStoredToken = "native-shell-bearer-abc123";
    setNativeShell(true);

    const { getBearerTokenForAuthClient, isNativeShell } = await import("./native-auth");
    expect(isNativeShell()).toBe(true);
    expect(await getBearerTokenForAuthClient()).toBe("native-shell-bearer-abc123");
  });

  it("returns undefined when isNativeShell() is true but Preferences has no token yet", async () => {
    // A fresh native install before sign-in — the getter must return
    // undefined so @better-fetch skips the header; a null returned by the
    // getter would type-error here (config expects string | undefined).
    mockStoredToken = null;
    setNativeShell(true);

    const { getBearerTokenForAuthClient } = await import("./native-auth");
    expect(await getBearerTokenForAuthClient()).toBeUndefined();
  });
});

// ── Test group 2 · createAuthClient honours the auth.token contract ───────
// createAuthClient uses @better-fetch/fetch internally to issue requests
// (see @better-auth/core dist/client/config.d.mts). Rather than importing
// @better-fetch as a direct dev-dep for one test, we exercise the pipeline
// through the same createAuthClient API the app uses at runtime, capturing
// outbound headers via a customFetchImpl. Every step between the
// `auth.token` resolver and the transport is real library code.

describe("createAuthClient · auth.token contract (real pipeline)", () => {
  async function captureAuthorizationHeader(
    tokenResolver: () => Promise<string | undefined>,
  ): Promise<string | null> {
    let seen: string | null = null;
    const capturedFetch = async (input: unknown, init?: RequestInit) => {
      const url = typeof input === "string" ? input : (input as { url?: string; toString: () => string }).url ?? String(input);
      const req = new Request(url, init);
      seen = req.headers.get("authorization");
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const client = createAuthClient({
      baseURL: "http://test.local/api/auth",
      fetchOptions: {
        // customFetchImpl is inside the same fetchOptions bag as
        // auth.token, matching how our real auth-client.ts is wired.
        customFetchImpl: capturedFetch as unknown as typeof fetch,
        auth: { type: "Bearer", token: tokenResolver },
      },
    });

    // Any endpoint call will trigger the pipeline; get-session is the
    // exact one useSession polls in the real app.
    await client.getSession().catch(() => { /* body shape is not what we're asserting */ });
    return seen;
  }

  it("does NOT add Authorization when the token resolver returns undefined (web case)", async () => {
    const authHeader = await captureAuthorizationHeader(async () => undefined);
    expect(authHeader).toBeNull();
  });

  it("adds Authorization: Bearer when the token resolver returns a value (native case)", async () => {
    const authHeader = await captureAuthorizationHeader(async () => "native-mock-token");
    expect(authHeader).toBe("Bearer native-mock-token");
  });
});
