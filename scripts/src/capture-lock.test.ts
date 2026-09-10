// Lock on the capture lock.
//
// The failure this guards is not "the lock does not work" — it is the two
// ways a lockfile becomes something people delete by hand and then stop
// trusting: it blocks on a holder that is already dead, or it blocks on a
// file that was never fully written. Both are asserted here, alongside the
// case it exists for (a live holder must refuse the second run).
//
// node:test rather than vitest, matching app-routes.test.ts — scripts/ has no
// test runner and this does not justify adding one.
//
// Every test points CAPTURE_LOCK_PATH at a temp file, so running the suite
// while a real capture holds the real lock neither fails nor steals it.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "capture-lock-"));
const LOCK = join(dir, ".capture-lock");
process.env.CAPTURE_LOCK_PATH = LOCK;

// Imported AFTER the env var is set — LOCK_PATH is resolved at module load.
const { acquireCaptureLock, LOCK_PATH } = await import("./capture-lock.js");

// A process that is definitely alive, and one that is definitely dead. Both
// are real pids: `process.kill(pid, 0)` is the thing under test, and a made-up
// number would only prove the arithmetic.
let alive: ChildProcess;
let deadPid: number;

before(async () => {
  alive = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 60000)"], { stdio: "ignore" });
  const doomed = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  deadPid = doomed.pid!;
  await new Promise<void>((resolve) => doomed.on("exit", () => resolve()));
});

after(() => {
  alive.kill("SIGKILL");
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => rmSync(LOCK, { force: true }));

test("LOCK_PATH honours the test override", () => {
  assert.equal(LOCK_PATH, LOCK);
});

test("acquire writes the lockfile, release removes it", () => {
  const release = acquireCaptureLock("first.ts");
  assert.ok(existsSync(LOCK));
  const rec = JSON.parse(readFileSync(LOCK, "utf-8"));
  assert.equal(rec.pid, process.pid);
  assert.equal(rec.label, "first.ts");
  release();
  assert.equal(existsSync(LOCK), false);
});

test("release is idempotent", () => {
  const release = acquireCaptureLock("a.ts");
  release();
  release();
  assert.equal(existsSync(LOCK), false);
});

test("nested acquires in one process refcount rather than deadlock", () => {
  // onboarding-shot.ts opens a second prefs session after restoring the
  // first. A non-reentrant lock would make that script refuse itself.
  const outer = acquireCaptureLock("outer.ts");
  const inner = acquireCaptureLock("inner.ts");
  assert.ok(existsSync(LOCK));
  inner();
  assert.ok(existsSync(LOCK), "inner release must not drop the lock the outer scope still holds");
  outer();
  assert.equal(existsSync(LOCK), false);
});

test("refuses while a LIVE process holds it, and names the holder", () => {
  writeFileSync(LOCK, JSON.stringify({ pid: alive.pid, label: "ai-coach-shot.ts", startedAt: "2026-09-10T00:00:00.000Z" }));
  assert.throws(
    () => acquireCaptureLock("desktop-persona-shot.ts"),
    (e: Error) => /ai-coach-shot\.ts/.test(e.message) && new RegExp(`pid ${alive.pid}\\b`).test(e.message),
  );
  // And it left the holder's lock alone.
  assert.equal(JSON.parse(readFileSync(LOCK, "utf-8")).pid, alive.pid);
});

test("clears a lock whose holder is gone", () => {
  writeFileSync(LOCK, JSON.stringify({ pid: deadPid, label: "crashed.ts", startedAt: "2026-09-10T00:00:00.000Z" }));
  const release = acquireCaptureLock("next.ts");
  assert.equal(JSON.parse(readFileSync(LOCK, "utf-8")).pid, process.pid);
  release();
});

test("clears a truncated or unparseable lockfile", () => {
  // A process killed between open and write leaves an empty file. Blocking
  // forever on it is how a lockfile stops being trusted.
  writeFileSync(LOCK, '{"pid":');
  const release = acquireCaptureLock("next.ts");
  assert.equal(JSON.parse(readFileSync(LOCK, "utf-8")).label, "next.ts");
  release();
});

test("a released lock can be taken again", () => {
  acquireCaptureLock("one.ts")();
  const second = acquireCaptureLock("two.ts");
  assert.equal(JSON.parse(readFileSync(LOCK, "utf-8")).label, "two.ts");
  second();
});
