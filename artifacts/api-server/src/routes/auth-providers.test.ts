// Tests for the /api/auth-providers endpoint AND for the
// invariant that no build-time client env decides whether a
// provider button renders. That invariant is the whole point of
// the endpoint — the wasted hour on a Google button was caused
// by a VITE_GOOGLE_OAUTH flag that was set at build time while
// the server itself lacked the credentials.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  __PROVIDER_REQUIREMENTS_FOR_TESTS as REQ,
  default as router,
} from "./auth-providers";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), "..", "..", "..", "..");
const FE_SRC = join(REPO_ROOT, "artifacts", "finance-tracker", "src");

// Snapshot then restore process.env so tests don't leak.
const ORIGINAL_ENV: Record<string, string | undefined> = {};
const KEYS_UNDER_TEST = [
  "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
  "APPLE_CLIENT_ID",  "APPLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET",
  "RESEND_API_KEY",
];

beforeEach(() => {
  for (const k of KEYS_UNDER_TEST) ORIGINAL_ENV[k] = process.env[k];
  for (const k of KEYS_UNDER_TEST) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS_UNDER_TEST) {
    if (ORIGINAL_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL_ENV[k];
  }
});

// Fake req/res just enough to exercise the express handler
// without booting the whole app.
async function call(): Promise<{ providers: string[]; passwordResetEnabled: boolean }> {
  return new Promise((resolve, reject) => {
    // The router has exactly one GET handler on /auth-providers.
    // Pull it out of the stack rather than boot a real server.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layer = (router as any).stack.find((l: any) => l?.route?.path === "/auth-providers");
    if (!layer) return reject(new Error("route not found"));
    const handler = layer.route.stack[0].handle as (req: unknown, res: unknown) => void;
    handler({} as unknown, {
      json: (body: { providers: string[]; passwordResetEnabled: boolean }) => resolve(body),
    } as unknown);
  });
}

describe("/api/auth-providers — configuration reporting", () => {
  it("empty env → empty providers, passwordResetEnabled=false", async () => {
    const body = await call();
    expect(body.providers).toEqual([]);
    expect(body.passwordResetEnabled).toBe(false);
  });

  it("google credentials set → 'google' appears", async () => {
    process.env.GOOGLE_CLIENT_ID = "gcid";
    process.env.GOOGLE_CLIENT_SECRET = "gsec";
    const body = await call();
    expect(body.providers).toContain("google");
  });

  it("apple credentials set → 'apple' appears", async () => {
    process.env.APPLE_CLIENT_ID = "acid";
    process.env.APPLE_CLIENT_SECRET = "asec";
    const body = await call();
    expect(body.providers).toContain("apple");
  });

  it("github credentials set → 'github' appears", async () => {
    process.env.GITHUB_CLIENT_ID = "ghid";
    process.env.GITHUB_CLIENT_SECRET = "ghsec";
    const body = await call();
    expect(body.providers).toContain("github");
  });

  it("half-set credentials do NOT appear (client id without secret is not enough)", async () => {
    process.env.GOOGLE_CLIENT_ID = "gcid";
    // no GOOGLE_CLIENT_SECRET
    const body = await call();
    expect(body.providers).not.toContain("google");
  });

  it("whitespace-only credentials do NOT count as configured", async () => {
    process.env.GOOGLE_CLIENT_ID = "  ";
    process.env.GOOGLE_CLIENT_SECRET = "  ";
    const body = await call();
    expect(body.providers).not.toContain("google");
  });

  it("RESEND_API_KEY set → passwordResetEnabled=true", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const body = await call();
    expect(body.passwordResetEnabled).toBe(true);
  });
});

describe("auth-providers — the requirements table is exhaustive", () => {
  it("lists exactly the three providers the app supports", () => {
    const ids = REQ.map((r) => r.id).sort();
    expect(ids).toEqual(["apple", "github", "google"]);
  });

  it("every provider requires a client-id-and-secret pair", () => {
    for (const r of REQ) {
      expect(r.envKeys).toHaveLength(2);
      expect(r.envKeys.some((k) => k.endsWith("_CLIENT_ID"))).toBe(true);
      expect(r.envKeys.some((k) => k.endsWith("_CLIENT_SECRET"))).toBe(true);
    }
  });
});

// ── The invariant that carries most of the weight ──────────────
//
// Frontend source must NEVER decide whether a provider button
// renders based on a client-side (VITE_*) env variable. Every
// provider button must consult the /api/auth-providers response.
// This test scans the frontend source tree for banned env-flag
// references so a well-meaning future edit that adds a
// VITE_APPLE_OAUTH gate fails loudly.
describe("frontend must not gate provider buttons on VITE_* envs", () => {
  const BANNED_PATTERNS = [
    /VITE_GOOGLE_OAUTH\b/,
    /VITE_APPLE_OAUTH\b/,
    /VITE_GITHUB_OAUTH\b/,
    // Any VITE_*_OAUTH / VITE_*_ENABLED / VITE_*_CLIENT_ID pattern:
    /VITE_[A-Z_]+_(OAUTH|ENABLED|CLIENT_ID|CLIENT_SECRET)\b/,
  ];

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist" || entry === "generated" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) out.push(...walk(full));
      else if (st.isFile() && (full.endsWith(".ts") || full.endsWith(".tsx"))) out.push(full);
    }
    return out;
  }

  it("no VITE_*_OAUTH-style provider gate appears in artifacts/finance-tracker/src", () => {
    const files = walk(FE_SRC);
    const hits: string[] = [];
    for (const file of files) {
      // Skip this test file's own regex sources, and skip test
      // files in general so lock-tests don't false-fire on each
      // other.
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
      const src = readFileSync(file, "utf-8");
      for (const pat of BANNED_PATTERNS) {
        const m = src.match(pat);
        if (m) hits.push(`${file}  matches  ${pat}  →  "${m[0]}"`);
      }
    }
    if (hits.length > 0) {
      throw new Error(
        `Frontend must not gate provider rendering on a VITE_* env variable. ` +
          `Every provider button must consult GET /api/auth-providers. ` +
          `Offenders:\n  ${hits.join("\n  ")}`,
      );
    }
    expect(hits).toEqual([]);
  });
});
