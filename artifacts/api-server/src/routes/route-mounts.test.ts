// Property lock on router mount prefixes.
//
// The bug this guards against: routes/index.ts mounts sub-routers into
// a router that is ITSELF mounted at /api by app.ts. Writing
//   router.use("/api/receipt", receiptRouter)
// makes the handler visible at /api/api/receipt/... rather than
// /api/receipt/... — every UI call to /api/receipt/parse and
// /api/digest/send 404'd silently. Users saw "Could not reach server"
// on the digest button and a bare error on receipt scan. Two features
// that had never worked for any user, discovered by a sweep looking
// for something unrelated.
//
// The fix (mount at "/digest" and "/receipt") lands the handlers at
// the right paths; this test locks the shape so the next mount added
// with the same typo fails at build time rather than in production
// after a user reports it.

import { describe, it, expect, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

vi.mock("@workspace/db", () => ({
  db: {},
  userTable: {},
  sessionTable: {},
  accountTable: {},
  verificationTable: {},
  twoFactorTable: {},
  passkeyTable: {},
}));

const routerModule = await import("./index");
const router = routerModule.default;

// ── 1 · Class-of-typo: no mount inside `router` starts with "/api" ───────────

describe("route-mounts · every sub-router mount is RELATIVE, not /api-prefixed", () => {
  it("no mount inside router uses a path that starts with /api", () => {
    const violations = collectRouterMountPaths(router).filter((p) => p.startsWith("/api"));
    if (violations.length > 0) {
      const detail = violations
        .map((p) => `  ${p} → real path becomes /api${p}/…, every UI call 404s. Change to "${p.replace(/^\/api/, "") || "/"}".`)
        .join("\n");
      throw new Error(
        `Router mounts starting with "/api" — this router is itself mounted at /api by app.ts, ` +
        `so any /api-prefixed sub-mount double-prefixes and 404s.\n${detail}`,
      );
    }
    expect(violations).toEqual([]);
  });
});

// Walks the router stack and returns the mount path of every
// sub-router mount (skipping route handlers).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectRouterMountPaths(r: any): string[] {
  const paths: string[] = [];
  const stack = r?.stack ?? [];
  for (const layer of stack) {
    // Sub-router mounts have layer.handle.stack (they're nested
    // routers). layer.route is set for route handlers. layer.name
    // varies across express versions. The reliable signal is
    // `layer.handle.stack` being an array.
    if (layer?.route) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle: any = layer?.handle;
    if (!handle?.stack || !Array.isArray(handle.stack)) continue;
    // Prefer layer.path (present in modern express); fall back to
    // parsing the regexp source. Root-mount ("/" prefix) returns "/".
    const p: string | undefined = layer.path ?? extractPathFromRegexp(layer.regexp);
    if (p) paths.push(p);
  }
  return paths;
}

// Extract the literal mount path from express's compiled regexp. The
// regexp source for `router.use("/receipt", …)` in express 5 looks
// like /^\/receipt(?=\/|$)/i. For root mounts (`router.use(sub)`)
// there's no prefix. Returns "/" for root mounts so the property still
// tests something meaningful.
function extractPathFromRegexp(re: RegExp | undefined): string | undefined {
  if (!re) return undefined;
  const src = re.source;
  // Root-mount regexps observed across express versions.
  if (src === "^\\/?(?=\\/|$)" || src === "^\\/?$" || src === "^\\/") return "/";
  // Match a leading escaped-slash + literal-chars sequence, ignoring
  // any express suffix (\/, ?=\/|$, etc).
  const m = /^\^((?:\\\/[A-Za-z0-9_-]+)+)/.exec(src);
  if (!m) return "/";
  return m[1].replace(/\\\//g, "/");
}

// ── 2 · The two specific mounts land where the frontend calls them ──────────

describe("route-mounts · receipt and digest are reachable at their frontend paths", () => {
  // Boot the router on a random port, hit the paths WITHOUT auth
  // (which would 401 before showing us whether the path resolves).
  // A path that MATCHES a handler that then bypasses auth (say, if
  // we had one) would give a real status. Otherwise we need to
  // observe the router-layer match directly.
  //
  // Approach: mount router directly at /api, provide a bypass
  // "requireAuth" that just calls next(), then hit the paths. A
  // matched path returns whatever the handler returns; a 404 means
  // the handler is at a different URL (the bug).
  let server: Server;
  let baseUrl: string;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    // Bypass auth — the real requireAuth sits in front of `router`
    // in app.ts but is out of scope for this property test.
    app.use("/api", (req, _res, next) => {
      (req as unknown as { userId: string }).userId = "test-user";
      next();
    }, router);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("POST /api/receipt/parse does NOT 404 — matches the receiptRouter handler", async () => {
    const r = await fetch(`${baseUrl}/api/receipt/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(
      r.status,
      "POST /api/receipt/parse returned 404 — receipt-parse handler is unreachable. " +
      "The typo is likely `router.use('/api/receipt', receiptRouter)` in routes/index.ts, which " +
      "double-prefixes and lands the handler at /api/api/receipt/parse instead.",
    ).not.toBe(404);
  });

  it("POST /api/digest/send does NOT 404 — matches the digestRouter handler", async () => {
    const r = await fetch(`${baseUrl}/api/digest/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(
      r.status,
      "POST /api/digest/send returned 404 — digest-send handler is unreachable. " +
      "Same typo class as receipt above: change to `router.use('/digest', digestRouter)`.",
    ).not.toBe(404);
  });

  it("POST /api/api/receipt/parse RETURNS 404 — sanity check the old double-prefixed path is gone", async () => {
    const r = await fetch(`${baseUrl}/api/api/receipt/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(404);
  });
});

// Import shims so vitest's beforeAll/afterAll are found — see also
// app.rate-limit.test.ts. Kept at the bottom rather than muddled with
// the other imports because vi.mock must be lifted to the top.
import { beforeAll, afterAll } from "vitest";
