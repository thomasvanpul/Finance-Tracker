// Lock: the verification rows an account deletion must remove are the
// ones better-auth actually writes, and every one of them that names a
// user carries the user id as its whole `value`.
//
// The verification table has no FK to user — better-auth owns it and its
// `identifier` is a free string — so verificationRowsFor matches by
// `value = user.id` or `identifier = email`. That is only exact if the
// installed better-auth writes rows of the shapes we expect. This test
// reads every createVerificationValue call in the modules this app loads
// (core routes, OAuth state, the two plugins in lib/better-auth.ts) and
// compares them with the catalogue below. A better-auth upgrade or a new
// plugin that adds, removes or reshapes a writer fails here, and whoever
// updates the catalogue has to classify the new row.
//
// Measured against better-auth 1.6.23 on 2026-10-01: no writer keys a row
// by the bare email, so `identifier = email` matches nothing this config
// writes; it stays as an exact, harmless match for rows written by an
// older version.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";

const DIST = dirname(createRequire(import.meta.url).resolve("better-auth"));

// Modules this app's auth config can reach. plugins/ is limited to the two
// plugins lib/better-auth.ts installs (twoFactor, bearer).
const SCAN = ["api", "state.mjs", "plugins/two-factor", "plugins/bearer"];

type Kind =
  | "user-id-in-value"  // matched by value = user.id
  | "no-user-data";     // carries no user identity; expires in minutes

// file | first line of the value expression | identifier expression
const CATALOGUE: Record<string, Kind> = {
  "api/routes/password.mjs | user.user.id | `reset-password:${verificationToken}`": "user-id-in-value",
  "api/routes/update-user.mjs | session.user.id | `delete-account-${token}`": "user-id-in-value",
  "plugins/two-factor/index.mjs | data.user.id | identifier": "user-id-in-value",
  "plugins/two-factor/index.mjs | data.user.id | newTrustIdentifier": "user-id-in-value",
  "plugins/two-factor/verify-two-factor.mjs | user.id | trustIdentifier": "user-id-in-value",
  // attempt counter beside the 2FA challenge row; value is a number
  "plugins/two-factor/index.mjs | \"0\" | `2fa-attempts-${identifier}`": "no-user-data",
  "plugins/two-factor/verify-two-factor.mjs | `${count}` | identifier": "no-user-data",
  // 2FA OTP by email/SMS: unreachable here — twoFactor() is configured
  // without otpOptions.sendOTP, so send-otp throws before writing
  "plugins/two-factor/otp/index.mjs | `${hashedCode}:0` | `2fa-otp-${key}`": "no-user-data",
  "plugins/two-factor/otp/index.mjs | `${otp}:${attempts + 1}` | `2fa-otp-${key}`": "no-user-data",
  // OAuth state (database strategy, the default with a DB adapter). A
  // sign-in state carries no user; a linkSocial state would embed
  // link.userId in the JSON, but no client calls linkSocial.
  "state.mjs | JSON.stringify({ | state": "no-user-data",
};

function walk(path: string): string[] {
  if (!statSync(path).isDirectory()) return path.endsWith(".mjs") ? [path] : [];
  return readdirSync(path).flatMap((e) => walk(join(path, e)));
}

function writers(): string[] {
  const out: string[] = [];
  for (const root of SCAN) {
    for (const file of walk(join(DIST, root))) {
      const src = readFileSync(file, "utf-8");
      // Every writer sets expiresAt after value and identifier; it bounds
      // the call without tripping on a nested `})` in the value expression.
      for (const m of src.matchAll(/createVerificationValue\(\{([\s\S]*?)\bexpiresAt\b/g)) {
        const body = m[1];
        const value = body.match(/\bvalue:\s*([^\n]*?),?\s*$/m)?.[1]?.trim() ?? "?";
        const ident = body.match(/\bidentifier(?::\s*([^,\n]+))?\s*[,\n]/)?.[1]?.trim() ?? "identifier";
        out.push(`${relative(DIST, file)} | ${value} | ${ident}`);
      }
    }
  }
  return out.sort();
}

describe("account deletion · better-auth verification writers", () => {
  it("every writer in the installed better-auth is catalogued, and nothing else is", () => {
    expect(writers()).toEqual(Object.keys(CATALOGUE).sort());
  });
});
