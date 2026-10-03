// Lock on the landing-page pin in openAccountPrefs.
//
// nr-default-page is account-synced. When the seed account holds anything
// but "/", App.tsx follows it from "/", so every capture that photographs
// HOME silently photographs another screen — on 3 Oct 2026 it was
// /portfolio, and phone-rules-sweep's "home" was byte-identical to "worth".
// openAccountPrefs pins it to "/" for the run and restore() puts the
// account's own value back. Asserted here against a fake request context,
// so it runs in the gate with no browser and no api-server.
//
// node:test, matching capture-lock.test.ts. CAPTURE_LOCK_PATH points at a
// temp file so a real capture holding the real lock neither fails this nor
// is stolen by it.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserContext } from "playwright";

const dir = mkdtempSync(join(tmpdir(), "account-prefs-"));
process.env.CAPTURE_LOCK_PATH = join(dir, ".capture-lock");

// Imported AFTER the env var is set — LOCK_PATH is resolved at module load.
const { openAccountPrefs } = await import("./account-prefs.js");

after(() => rmSync(dir, { recursive: true, force: true }));

type Call = { method: string; path: string; body?: unknown };

function fakeContext(preferences: Record<string, string>): { ctx: BrowserContext; calls: Call[] } {
  const calls: Call[] = [];
  const respond = (body: unknown) => ({
    ok: () => true,
    status: () => 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
  });
  const route = (method: string) => async (url: string, opts?: { data?: unknown }) => {
    const path = new URL(url).pathname;
    calls.push({ method, path, body: opts?.data });
    if (path === "/api/settings/theme") return respond({ theme: "void" });
    if (path === "/api/settings/persona") return respond({ persona: "budget", onboarded: true });
    if (path === "/api/settings/preferences") return respond({ preferences });
    return respond({});
  };
  const request = { get: route("GET"), put: route("PUT"), patch: route("PATCH"), post: route("POST") };
  return { ctx: { request } as unknown as BrowserContext, calls };
}

const defaultPagePatches = (calls: Call[]) =>
  calls
    .filter((c) => c.method === "PATCH" && c.path === "/api/settings/preferences")
    .map((c) => (c.body as { preferences: Record<string, unknown> }).preferences["nr-default-page"]);

test("an account landing on /portfolio is pinned to / for the run and restored after", async () => {
  const { ctx, calls } = fakeContext({ "nr-default-page": "/portfolio" });
  const prefs = await openAccountPrefs(ctx, "cookie");
  assert.deepEqual(defaultPagePatches(calls), ["/"]);
  await prefs.restore();
  assert.deepEqual(defaultPagePatches(calls), ["/", "/portfolio"]);
});

test("an account already landing on / is not written to", async () => {
  const { ctx, calls } = fakeContext({ "nr-default-page": "/" });
  const prefs = await openAccountPrefs(ctx, "cookie");
  await prefs.restore();
  assert.deepEqual(defaultPagePatches(calls), []);
});

test("an account with no landing preference is not written to", async () => {
  const { ctx, calls } = fakeContext({});
  const prefs = await openAccountPrefs(ctx, "cookie");
  await prefs.restore();
  assert.deepEqual(defaultPagePatches(calls), []);
});

// drill-sweep-shot, 3 Oct 2026: a socket hang-up inside its route proxy was
// rethrown from the route callback, an unhandled rejection that ended the
// process before the script's `finally { restore() }` ran, and the seed
// account was left pinned to "/". The capture lock already survives that (its
// exit hook); this asserts the account does too.
test("a crash outside the script's try/finally still restores the account", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const fixture = fileURLToPath(new URL("./account-prefs.crash-fixture.ts", import.meta.url));
  const child = spawnSync(process.execPath, [...process.execArgv, fixture], {
    env: { ...process.env, CAPTURE_LOCK_PATH: join(dir, ".capture-lock-crash") },
    encoding: "utf8",
    timeout: 20000,
  });
  const calls = child.stdout
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l) as Call);
  assert.notEqual(child.status, 0, "the crash must still fail the run");
  assert.deepEqual(defaultPagePatches(calls), ["/", "/portfolio"]);
});
