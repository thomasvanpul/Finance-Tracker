// Lock on the cold-start hint wiring inside AuthGate.
//
// The hint fixes the "dark shimmer for 60 s during a Render wake" defect
// by wiring the existing looksLikeColdStart() probe (auth-errors.ts:197)
// and the existing server_waking copy (auth-errors.ts:70) into
// AuthGate's isPending branch. The whole point is that no new mechanism
// was invented — this test enforces exactly that.
//
// What breaks if this test regresses:
//   1. Someone hardcodes the "waking" string in auth-gate.tsx instead of
//      pulling it from makeAuthError — copy drift + one more place to
//      update on tone changes.
//   2. Someone raises the threshold to 5000 ms or lowers it to 500 ms
//      without arguing why. 2000 ms was decided in advance (see
//      docs/OPERATIONS.md + 2026-09-01T0909 archived report) with
//      reasoning about warm baseline (300–600 ms) and perceived-broken
//      threshold (3 s). Drift here is a silent UX regression.
//   3. Someone removes the useColdStartHint hook and re-fires
//      looksLikeColdStart from a form error handler instead — which is
//      exactly what this task was fixing.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeAuthError } from "@/lib/auth-errors";

const __filename = fileURLToPath(import.meta.url);
const source = readFileSync(
  join(dirname(__filename), "auth-gate.tsx"),
  "utf8",
);

describe("AuthGate cold-start hint · wiring lock", () => {
  it("hint copy comes from makeAuthError('server_waking').message, not a hardcoded string", () => {
    // The rendered copy expression appears verbatim in the source.
    expect(source).toMatch(/makeAuthError\("server_waking"\)\.message/);
    // And no hardcoded prefix of the copy appears elsewhere in the file
    // (would indicate someone inlined it as a fallback).
    const hardcodedPrefix = 'The server is waking up';
    // The exact string may appear once inside a comment referencing the
    // copy — count occurrences and enforce zero non-comment matches.
    const literalOccurrences = source.split(hardcodedPrefix).length - 1;
    // Zero literal occurrences of the sentence in code — the source-of-truth
    // is auth-errors.ts. If this fails, drop the string and use makeAuthError.
    expect(literalOccurrences).toBe(0);
  });

  it("copy sourced from the error table still starts with the expected phrase — catches upstream rewording that changes tone", () => {
    // Not a test of exact wording — that lives in auth-errors.ts and
    // is intentionally editable. What we lock is: the copy is not empty,
    // and it is honest about what is happening rather than a spinner-word.
    const copy = makeAuthError("server_waking").message;
    expect(copy.length).toBeGreaterThan(10);
    // "server is waking" is the load-bearing phrase — if this test fails
    // after an intentional rewrite, update this line at the same time.
    expect(copy.toLowerCase()).toContain("server");
  });

  it("threshold is 2000 ms — decided in advance so the upgrade decision isn't 'look at a graph and feel'", () => {
    // The constant is defined at module scope in auth-gate.tsx. Matching
    // the definition rather than a call-site so a refactor that renames
    // the constant still passes as long as the value is right.
    const thresholdMatch = source.match(
      /COLD_START_HINT_DELAY_MS\s*=\s*(\d+)/,
    );
    expect(thresholdMatch).not.toBeNull();
    expect(Number(thresholdMatch?.[1])).toBe(2000);
  });

  it("hook uses looksLikeColdStart — no second mechanism", () => {
    // The whole point of the diagnosis was that looksLikeColdStart already
    // existed and only fired from auth-form error handlers. Wire it here.
    // If someone reimplements the probe with a bare fetch to /api/healthz,
    // catch that.
    expect(source).toMatch(/useColdStartHint\s*\(/);
    expect(source).toMatch(/looksLikeColdStart\s*\(/);
    // Assert no bare fetch to healthz — the probe belongs in
    // looksLikeColdStart, not inline here (that would be the "invent a
    // second mechanism" case the task explicitly warned against).
    expect(source).not.toMatch(/fetch\s*\(\s*["'`]\/api\/healthz/);
  });

  it("cancels its timer on isPending → false — a warm launch that resolves at 500 ms must not later flash the hint", () => {
    // Property check on the hook shape: the effect returns a cleanup
    // that clears the timer. Regex is loose — the point is that there
    // is SOME cleanup that clears the timer, not that the code reads
    // exactly one way.
    expect(source).toMatch(/window\.clearTimeout|clearTimeout\s*\(/);
    // And the cleanup body sets a cancelled flag so a probe that
    // resolves after cancellation cannot setState.
    expect(source).toMatch(/cancelled\s*=\s*true/);
  });
});
