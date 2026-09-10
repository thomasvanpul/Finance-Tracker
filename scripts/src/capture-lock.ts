// One capture at a time.
//
// ── The hazard ──────────────────────────────────────────────────────────────
//
// theme, persona and tab_slot are ACCOUNT-level columns on the seed user
// (app_settings.theme / .persona / .tab_slot), not per-browser-context state.
// Every capture script in this directory drives the same seed account, so two
// of them running at once are writing the same three rows. The interleaving
// that costs you is:
//
//   A: setTheme('arctic')  →  B: setTheme('void')  →  A: screenshot()
//
// and A's screenshot is a void frame in a file named arctic. account-prefs.ts
// makes that loud rather than silent — assertTheme() throws when the page is
// not rendering what the filename claims — but loud-after-the-fact is only
// half the fix. This is the other half: make the second run refuse to start.
//
// Honest note on the evidence, because it matters which of these is a
// measurement and which is a shape. desktop-persona-shot failed once when run
// back-to-back with ai-coach-shot and the failure did not reproduce. That is
// the SHAPE this hazard would take; it was never confirmed to be the cause of
// that particular failure. The lock is justified by the interleaving above
// being possible, not by that one run being diagnosed.
//
// ── Why a lockfile and not a queue ──────────────────────────────────────────
//
// A queue would make the second run wait, which reads as "the script hung".
// Refusing names the holder and its pid and exits, which is the thing you can
// act on. Captures are minutes long and started by hand; there is nothing to
// schedule.
//
// A per-run scratch account would remove the shared state entirely and is the
// real fix. It is also a sign-up, a seed, and a teardown per capture — too
// much machinery for a screenshot harness, and it was considered and declined.

import { openSync, closeSync, writeSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";

// scripts/src/capture-lock.ts → scripts/
const SCRIPTS_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// CAPTURE_LOCK_PATH exists so capture-lock.test.ts can exercise the stale-lock
// and contention paths against a temp file instead of the real one. No capture
// script sets it, and setting it by hand splits the lock in two — a second run
// pointed at a different path will not see the first one's lock at all.
export const LOCK_PATH = process.env.CAPTURE_LOCK_PATH ?? join(SCRIPTS_ROOT, ".capture-lock");

interface LockRecord {
  pid: number;
  label: string;
  startedAt: string;
}

/** Refcount, so nested acquires inside one process (a script that opens two prefs sessions) do not deadlock it against itself. */
let held = 0;
let exitHookInstalled = false;

function readLock(): LockRecord | null {
  try {
    const raw = readFileSync(LOCK_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<LockRecord>;
    if (typeof parsed.pid !== "number") return null;
    return { pid: parsed.pid, label: String(parsed.label ?? "unknown"), startedAt: String(parsed.startedAt ?? "unknown") };
  } catch {
    // Unreadable or truncated — a half-written file from a process killed
    // mid-write. Treat as stale rather than blocking every capture forever.
    return null;
  }
}

function processAlive(pid: number): boolean {
  try {
    // Signal 0 performs the permission and existence check without delivering.
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM means it exists and belongs to someone else — still alive.
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

function writeLock(label: string): void {
  // "wx" is the whole mechanism: exclusive create, fails with EEXIST rather
  // than truncating a lock someone else holds.
  const fd = openSync(LOCK_PATH, "wx");
  try {
    writeSync(fd, JSON.stringify({ pid: process.pid, label, startedAt: new Date().toISOString() } satisfies LockRecord));
  } finally {
    closeSync(fd);
  }
}

function releaseIfOurs(): void {
  const current = readLock();
  if (current && current.pid !== process.pid) return;
  try {
    unlinkSync(LOCK_PATH);
  } catch {
    // Already gone. Releasing twice is not an error.
  }
}

function installExitHook(): void {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  // Covers the ordinary end, an uncaught throw (node exits after printing it)
  // and Ctrl-C. Without these a killed capture leaves a lock that the next run
  // has to clear by hand — which is how a lockfile earns a reputation.
  process.on("exit", releaseIfOurs);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(sig, () => {
      releaseIfOurs();
      process.exit(130);
    });
  }
}

export type ReleaseLock = () => void;

/**
 * Take the capture lock, or throw naming who holds it.
 *
 * `label` defaults to the entry script's filename, which is what the refusal
 * message shows the next person — "held by ai-coach-shot.ts (pid 40122)" is
 * actionable in a way that "held by node" is not.
 */
export function acquireCaptureLock(label: string = basename(process.argv[1] ?? "unknown")): ReleaseLock {
  if (held === 0) {
    installExitHook();
    try {
      writeLock(label);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const holder = readLock();
      if (holder !== null && processAlive(holder.pid)) {
        throw new Error(
          `capture lock held by ${holder.label} (pid ${holder.pid}, since ${holder.startedAt}).\n` +
          `  Captures drive one shared seed account — theme, persona and tab_slot are account-level\n` +
          `  columns, so two runs overwrite each other and one of them photographs the other's state.\n` +
          `  Wait for it to finish, or if that process is gone: rm ${LOCK_PATH}`,
        );
      }
      // Stale: the holder is dead, or the file was unreadable.
      if (existsSync(LOCK_PATH)) {
        console.warn(`[capture-lock] clearing stale lock from ${holder ? `${holder.label} (pid ${holder.pid})` : "an unreadable lockfile"}`);
        unlinkSync(LOCK_PATH);
      }
      writeLock(label);
    }
  }
  held += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    held -= 1;
    if (held === 0) releaseIfOurs();
  };
}
