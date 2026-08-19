// Cookie-size budget on a complete email/password sign-in.
//
// The failure mode this locks against: Vercel's edge rejects incoming
// requests with a Cookie header above ~32 KB (returns 431) or ~48 KB
// (returns 494). That reject happens BEFORE our handler runs, so we
// can't catch it at request time — the site simply breaks for every
// signed-in user with no useful log. The two known contributors:
//
//   1. cookieCache (session.cookieCache.enabled) serialises the user
//      record into a per-request cookie to save a DB read. On a
//      near-empty account it was already 987 bytes; it grows with
//      the user record. Disabled deliberately — see the note in
//      better-auth.ts.
//   2. OAuth state cookies (SameSite=None) accumulated across failed
//      or abandoned OAuth flows because browsers won't send SameSite=
//      None expiring cookies with the request that clears them.
//      Now sameSite: "Lax" (also in better-auth.ts) with Max-Age.
//
// The test runs a real sign-in against an in-memory better-auth
// instance configured with OUR critical options and sums the bytes
// of every Set-Cookie header. Budget is 1024 bytes: bare session
// cookie signs to ~300–500 bytes, so a doubling means data has
// started leaking back into cookies. Loud, specific.

import { describe, it, expect, beforeAll } from "vitest";
import { getTestInstance } from "better-auth/test";

// getTestInstance handles sqlite migrations for us and returns a
// fully bootstrapped auth object + client. We override the options
// that are load-bearing for cookie size — cookieCache off, sameSite
// Lax — so this test EXERCISES the same behaviour the real
// better-auth.ts config produces. Other options (plugins, social
// providers, adapters, rate limits) are irrelevant to what the
// Set-Cookie header carries.

const BUDGET_BYTES = 1024;
// Realistic budget: bare session_token cookie signs to ~300–500
// bytes at rest. 1024 is a comfortable ceiling that catches the
// two named regressions from the incident:
//   - cookieCache adding session_data (~987 bytes on a mostly-
//     empty account, growing with the user record).
//   - OAuth state cookies with SameSite=None accumulating across
//     abandoned flows (multiple 100–200 byte state cookies stack).
// Anything past 1024 means data has started leaking back into
// cookies and the loud signal here catches it before Vercel's
// edge starts rejecting requests at ~32 KB (431) or ~48 KB (494).

interface Auth { handler: (req: Request) => Promise<Response>; }
let auth: Auth;

beforeAll(async () => {
  const inst = await getTestInstance(
    {
      session: {
        // The property under test — locked off in better-auth.ts.
        cookieCache: { enabled: false },
      },
      advanced: {
        // Second property under test — Lax, not None. Keeps OAuth
        // state cookies from accumulating on repeated flows.
        defaultCookieAttributes: { sameSite: "Lax", secure: false },
      },
    },
    { disableTestUser: false },
  );
  auth = inst.auth as Auth;
});

async function measureSignInCookieBytes(): Promise<{ total: number; breakdown: { name: string; bytes: number }[] }> {
  // Default test user credentials from getTestInstance — see
  // better-auth/test-utils/test-instance.mjs.
  const res = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@test.com",
        password: "test123456",
      }),
    }),
  );

  // Prefer getSetCookie (returns array) over get("set-cookie")
  // (single string that merges multiples with commas — misleading
  // for byte counting).
  const cookies: string[] =
    typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie") as string] : []);

  const breakdown = cookies.map((c) => {
    const name = c.split("=")[0]?.trim() ?? "?";
    return { name, bytes: c.length };
  });
  const total = breakdown.reduce((s, b) => s + b.bytes, 0);
  return { total, breakdown };
}

// Observed on the current config: 155 bytes (one better-auth.session_token
// cookie). The 1024 budget carries ~6.6x headroom, enough that adding one
// small cookie doesn't flip the test but re-enabling cookieCache (which
// adds ~987 bytes of session_data) does — verified by injecting exactly
// that regression during development.

describe("cookie budget · complete email/password sign-in", () => {
  it(`total Set-Cookie bytes stay under ${BUDGET_BYTES}`, async () => {
    const { total, breakdown } = await measureSignInCookieBytes();

    // If this fails, print the breakdown so the reviewer sees WHICH
    // cookie ballooned. The two named suspects from the last
    // incident: session_data (cookieCache) and stale OAuth state
    // cookies. A new suspect (a plugin stashing something in Set-
    // Cookie) shows up here as an unfamiliar cookie name.
    if (total >= BUDGET_BYTES) {
      const detail = breakdown
        .map((b) => `  ${b.name.padEnd(40)} ${String(b.bytes).padStart(5)} bytes`)
        .join("\n");
      throw new Error(
        `Sign-in Set-Cookie total is ${total} bytes, exceeding the ${BUDGET_BYTES}-byte budget.\n` +
        `The two known contributors: session.cookieCache serialising user data (should be disabled), ` +
        `and OAuth state cookies with SameSite=None accumulating (should be Lax). ` +
        `If it's neither, a new plugin is stashing data in Set-Cookie — the audit lock exists to catch this.\n` +
        `Vercel's edge rejects headers above ~32-48 KB, so a growing Set-Cookie set breaks signed-in requests ` +
        `before they reach our code (494 REQUEST_HEADER_TOO_LARGE).\n\nBreakdown:\n${detail}`,
      );
    }
    expect(total).toBeLessThan(BUDGET_BYTES);
  });

  it("bare session cookie is present — sanity check the test actually exercised sign-in", async () => {
    const { breakdown } = await measureSignInCookieBytes();
    const hasSessionCookie = breakdown.some((b) => b.name.includes("session_token"));
    expect(
      hasSessionCookie,
      "No session_token cookie set on the sign-in response. Either the test setup failed silently " +
      "(making the byte count vacuously small) or better-auth changed its cookie name — either way, " +
      "the budget test above is no longer meaningful and needs updating.",
    ).toBe(true);
  });
});
