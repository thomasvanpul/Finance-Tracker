// spec-server-contract.lock.test.ts
//
// WHAT THIS GUARDS
//
// POST /api/upcoming was declared in openapi.yaml and used by the generated
// client, but routes/upcoming.ts only had POST /upcoming/installments. Twelve
// real POSTs against production all returned 404. Typecheck never caught it
// because the client is generated from the spec, not from the server — the
// contract and the implementation drifted and nothing compared them.
//
// This lock does that comparison mechanically. On every test run it reads
// openapi.yaml and all route files off disk and asserts two invariants:
//
//   Direction A: every endpoint declared in the spec has a server handler.
//   Direction B: every server handler is in the spec OR in KNOWN_SERVER_ONLY.
//
// KNOWN LISTS
//
// Two allowlists document current drift without masking new drift:
//
//   KNOWN_SPEC_ONLY   — declared in spec, not yet on server. These are
//                       unimplemented features, not bugs. Remove an entry
//                       when you implement the endpoint.
//
//   KNOWN_SERVER_ONLY — on server, not in spec. These are undocumented
//                       surface — real endpoints that predated the spec
//                       or were added without updating it. Remove an entry
//                       when you add it to the spec. Do not grow this list.
//
// A new endpoint that appears in neither list fails the test in both
// directions — direction A if it's in the spec, direction B if it's on the
// server. That is the designed behaviour.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
// This file sits at artifacts/api-server/src/routes/ — four levels up is repo root.
const REPO_ROOT = join(dirname(__filename), "..", "..", "..", "..");

// ─── openapi.yaml parser ────────────────────────────────────────────────────

function parseSpecEndpoints(): Set<string> {
  const yaml = readFileSync(join(REPO_ROOT, "lib", "api-spec", "openapi.yaml"), "utf-8");
  const lines = yaml.split("\n");
  const endpoints = new Set<string>();
  let currentPath: string | null = null;
  for (const line of lines) {
    const pathMatch = /^  (\/\S+):/.exec(line);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }
    const methodMatch = /^    (get|post|patch|put|delete):/.exec(line);
    if (methodMatch && currentPath) {
      const method = methodMatch[1].toUpperCase();
      // Normalize OpenAPI path params {id} → :id for comparison
      const norm = currentPath.replace(/\{[^}]+\}/g, ":id");
      endpoints.add(`${method} ${norm}`);
    }
  }
  return endpoints;
}

// ─── route-file scanner ─────────────────────────────────────────────────────

const ROUTE_METHODS_RE = /\b(router|app)\.(get|post|patch|put|delete)\s*\(\s*["']([^"']+)["']/g;

function parseServerEndpoints(): Set<string> {
  const routesDir = join(REPO_ROOT, "artifacts", "api-server", "src", "routes");
  // Scan all .ts files except test files
  const files = readdirSync(routesDir).filter(
    (f) => f.endsWith(".ts") && !f.includes(".test.") && !f.includes(".lock."),
  );

  const endpoints = new Set<string>();
  for (const file of files) {
    const src = readFileSync(join(routesDir, file), "utf-8");
    let m: RegExpExecArray | null;
    ROUTE_METHODS_RE.lastIndex = 0;
    while ((m = ROUTE_METHODS_RE.exec(src)) !== null) {
      const method = m[2].toUpperCase();
      const rawPath = m[3];
      // Normalize Express path params :param → :id
      const norm = rawPath.replace(/:[^/]+/g, ":id");
      endpoints.add(`${method} ${norm}`);
    }
  }
  return endpoints;
}

// ─── Known drift: spec-only (unimplemented features) ────────────────────────
//
// These are declared in the spec but have no server handler yet. Each one
// documents the reason it is not implemented. Remove it when you build it.
//
// Do NOT add "POST /upcoming" here — that was the defect this lock was built
// to catch and it is now fixed. This list is for features not yet reached,
// not for bugs that have been fixed.

const KNOWN_SPEC_ONLY = new Set<string>([
  // Empty since 2026-09-05. The five entries that lived here (2FA status/
  // setup/confirm/disable and password change) were removed from the spec:
  // better-auth already serves both features under /api/auth/* and the
  // profile page uses its client (authClient.changePassword,
  // authClient.twoFactor.enable/verifyTotp/disable). A spec-only endpoint
  // is a promise the server does not keep — add one here only with a
  // BACKLOG entry that says who will implement it and when.
]);

// ─── Known drift: server-only (undocumented surface) ────────────────────────
//
// These exist on the server but are not in openapi.yaml. Each represents
// known technical debt: real endpoints that predated the spec or were added
// without updating it. Remove an entry when you add the path to the spec.
// Do NOT add new entries — every new endpoint goes in the spec first.

const KNOWN_SERVER_ONLY = new Set<string>([
  // AI suite — added incrementally before the spec was formalised.
  // Tracked in BACKLOG § G-spec-ai.
  "GET /ai/status",
  "POST /ai/chat",
  "POST /ai/batch-categorize",
  "POST /ai/receipt-scan",
  "POST /ai/receipt-split",
  // Digest (morning briefing) and parse (natural-language entry) endpoints.
  "POST /digest/send",
  "POST /parse",
  // Enable-banking (open-banking integration) — declared on server but spec
  // coverage is pending while the feature is in beta.
  "GET /connections/enable-banking/callback",
  "POST /connections/enable-banking/start",
  "POST /connections/:id/import",
  // Shared-expenses — full CRUD exists but spec was never written.
  "GET /shared-expenses",
  "GET /shared-expenses/:id",
  "POST /shared-expenses",
  "PATCH /shared-expenses/:id",
  "DELETE /shared-expenses/:id",
  "POST /shared-expenses/:id/participants/:id/acknowledge",
  "POST /shared-expenses/:id/participants/:id/dispute",
  "POST /shared-expenses/:id/participants/:id/request",
  "POST /shared-expenses/:id/participants/:id/waive",
  // Debts — received-debts view not in spec.
  "GET /debts/received",
  "POST /debts/:id/reject",
  // Subscriptions — delete-dismissed not in spec (spec has POST dismissed only).
  "DELETE /subscriptions/dismissed/:id",
  // Market — extended endpoints added after spec was last updated.
  "GET /market/detail",
  "GET /market/history",
  "GET /market/news",
  "GET /market/news/for-user",
  "GET /market/options",
  "GET /market/providers",
  // market-live.ts registers the full path literally as "/api/market/live/:ticker"
  // (a known double-prefix bug tracked by route-mounts.test.ts). The scanner
  // picks it up as-is; the real effective path is /api/api/market/live/:ticker.
  "GET /api/market/live/:id",
  // digest.ts registers "/send" on an inner router that index.ts mounts at
  // "/digest", so the reachable path is /api/digest/send. The scanner sees
  // only the inner-router literal "/send".
  "POST /send",
  // Auth providers — helper for social login flow, not in spec.
  "GET /auth-providers",
  // Users — lookup for debt/shared-expense flows.
  "GET /users/lookup",
  // Export — tax-year report, not in spec.
  "GET /export/tax-year/:id",
]);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("spec-server-contract lock · Direction A: spec → server", () => {
  it("every endpoint declared in openapi.yaml has a route handler", () => {
    const spec = parseSpecEndpoints();
    const server = parseServerEndpoints();

    const missing: string[] = [];
    for (const endpoint of spec) {
      if (!server.has(endpoint) && !KNOWN_SPEC_ONLY.has(endpoint)) {
        missing.push(endpoint);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Endpoints declared in openapi.yaml but missing from the server:\n` +
        missing.map((e) => `  ${e}`).join("\n") +
        `\n\nEither implement the handler or (only for genuine unimplemented features) ` +
        `add the path to KNOWN_SPEC_ONLY in spec-server-contract.lock.test.ts with a comment ` +
        `explaining why it is not yet built.`,
      );
    }
    expect(missing).toEqual([]);
  });

  it("KNOWN_SPEC_ONLY has no entry that is now implemented — stale entries must be removed", () => {
    const server = parseServerEndpoints();
    const stale: string[] = [];
    for (const endpoint of KNOWN_SPEC_ONLY) {
      if (server.has(endpoint)) {
        stale.push(endpoint);
      }
    }
    if (stale.length > 0) {
      throw new Error(
        `KNOWN_SPEC_ONLY in spec-server-contract.lock.test.ts contains endpoints ` +
        `that are now implemented on the server:\n` +
        stale.map((e) => `  ${e}`).join("\n") +
        `\n\nRemove them from KNOWN_SPEC_ONLY — the allowlist must not mask live coverage.`,
      );
    }
    expect(stale).toEqual([]);
  });
});

describe("spec-server-contract lock · Direction B: server → spec", () => {
  it("every server route handler is in the spec or in KNOWN_SERVER_ONLY", () => {
    const spec = parseSpecEndpoints();
    const server = parseServerEndpoints();

    const undocumented: string[] = [];
    for (const endpoint of server) {
      if (!spec.has(endpoint) && !KNOWN_SERVER_ONLY.has(endpoint)) {
        undocumented.push(endpoint);
      }
    }

    if (undocumented.length > 0) {
      throw new Error(
        `Server route handlers not declared in openapi.yaml and not in KNOWN_SERVER_ONLY:\n` +
        undocumented.map((e) => `  ${e}`).join("\n") +
        `\n\nEvery new endpoint must be added to the spec first. If this is genuinely ` +
        `pre-existing undocumented surface, add it to KNOWN_SERVER_ONLY with a comment.`,
      );
    }
    expect(undocumented).toEqual([]);
  });

  it("KNOWN_SERVER_ONLY has no entry that is now in the spec — stale entries must be removed", () => {
    const spec = parseSpecEndpoints();
    const stale: string[] = [];
    for (const endpoint of KNOWN_SERVER_ONLY) {
      if (spec.has(endpoint)) {
        stale.push(endpoint);
      }
    }
    if (stale.length > 0) {
      throw new Error(
        `KNOWN_SERVER_ONLY in spec-server-contract.lock.test.ts contains endpoints ` +
        `that are now in the spec:\n` +
        stale.map((e) => `  ${e}`).join("\n") +
        `\n\nRemove them from KNOWN_SERVER_ONLY — the spec now covers them.`,
      );
    }
    expect(stale).toEqual([]);
  });
});
