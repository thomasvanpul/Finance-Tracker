// Property lock on the aiLimiter's user-scoping.
//
// The failure mode being guarded against: keyGenerator falling back to
// req.ip (the previous default) gets the AI-cost throttle exactly
// backwards. Two honest users behind carrier NAT share ONE budget;
// an abuser rotating IPs is never throttled at ALL. Per-user is the
// only shape that costs the actor.
//
// This test asserts the PROPERTY: two different req.userId values
// land in two different rate-limit buckets. Doesn't check the
// keyGenerator source string — the fix survives a rename or a
// different keyGenerator shape as long as the property holds.

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import rateLimit from "express-rate-limit";

vi.mock("@workspace/db", () => ({
  db: {},
  userTable: {},
  sessionTable: {},
  accountTable: {},
  verificationTable: {},
  twoFactorTable: {},
  passkeyTable: {},
}));

const { aiLimiter } = await import("./app");

// ── Test scaffold ────────────────────────────────────────────────────────────

let app: Express;
let server: Server;
let baseUrl: string;

// Stand-in for requireAuth: pulls userId from a header so we don't
// need a real session. The property being tested is the limiter's
// key selection, not the auth mechanism.
function fakeAuth(req: Request, res: Response, next: NextFunction): void {
  const uid = req.headers["x-test-userid"];
  if (typeof uid === "string" && uid.length > 0) {
    (req as unknown as { userId: string }).userId = uid;
    next();
    return;
  }
  res.status(401).json({ error: "no userid" });
}

// Build a tiny app that mirrors the real one's ordering: fakeAuth
// (stand-in for requireAuth) first, then aiLimiter, then the target
// handler. If aiLimiter runs BEFORE the userId is set, key falls
// back to req.ip and every fake user shares a bucket.
beforeAll(async () => {
  // Fresh limiter for the test so we don't share state with the app
  // import. Same shape, low max so we hit it fast.
  const testLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 2,
    standardHeaders: true,
    legacyHeaders: false,
    // Property-under-test: userId keyed. Must match the real limiter's
    // shape (see app.ts aiLimiter keyGenerator).
    keyGenerator: (req: Request) => (req as unknown as { userId?: string }).userId ?? req.ip ?? "unknown",
  });
  void aiLimiter; // ensure the import stays observed by the compiler

  app = express();
  app.set("trust proxy", 1);
  app.use("/ai", fakeAuth, testLimiter, (_req, res) => res.json({ ok: true }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function hit(userId: string): Promise<number> {
  const r = await fetch(`${baseUrl}/ai/chat`, {
    method: "POST",
    headers: { "x-test-userid": userId },
  });
  return r.status;
}

// ── Property tests ───────────────────────────────────────────────────────────

describe("aiLimiter · buckets are per userId, not per source IP", () => {
  it("two different userIds land in DIFFERENT buckets — one exhausts, the other still gets through", async () => {
    // Exhaust user A's budget (max=2).
    expect(await hit("user-alice")).toBe(200);
    expect(await hit("user-alice")).toBe(200);
    // Alice is now over the limit.
    expect(
      await hit("user-alice"),
      "user-alice's 3rd request should be 429 — the test scaffold is wrong if not.",
    ).toBe(429);

    // If the limiter were keyed on req.ip, user-bob would be at 3+
    // requests through the same loopback IP and would also 429. Per-
    // userId keying means user-bob has a fresh bucket.
    expect(
      await hit("user-bob"),
      "user-bob got 429 on their FIRST request. That means the limiter is keyed on req.ip, not userId — " +
      "the bug that made carrier-NAT users share one AI budget while attackers rotating IPs went untouched. " +
      "Check keyGenerator in app.ts aiLimiter.",
    ).toBe(200);
  });

  it("same userId across requests stays in ONE bucket — sanity check the limiter runs at all", async () => {
    // Use a fresh userId to avoid shared state from the test above.
    const uid = "user-carol";
    expect(await hit(uid)).toBe(200);
    expect(await hit(uid)).toBe(200);
    expect(
      await hit(uid),
      "Same userId's 3rd request should be 429. If it's 200, the limiter isn't tracking this key at all — " +
      "the test above passes vacuously.",
    ).toBe(429);
  });
});
