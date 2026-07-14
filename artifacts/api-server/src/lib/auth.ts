import type { Request, Response, NextFunction } from "express";
import { createHmac, timingSafeEqual } from "crypto";

// Single shared-password gate for this single-user app. Not per-user auth —
// just enough to keep a public URL from being wide open to anyone who finds it.
//
// Required env vars: APP_PASSWORD, SESSION_SECRET.
// Cookie holds an HMAC of the password (signed with SESSION_SECRET), not the
// password itself, so it can't be replayed if SESSION_SECRET ever rotates.

const COOKIE_NAME = "fintrack_session";
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sign(value: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set in the environment.");
  return createHmac("sha256", secret).update(value).digest("hex");
}

function expectedToken(): string {
  const password = process.env.APP_PASSWORD;
  if (!password) throw new Error("APP_PASSWORD is not set in the environment.");
  return sign(password);
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function login(req: Request, res: Response): void {
  const { password } = req.body ?? {};
  if (typeof password !== "string" || !process.env.APP_PASSWORD) {
    res.status(400).json({ error: "Password required" });
    return;
  }
  if (!safeEqual(password, process.env.APP_PASSWORD)) {
    res.status(401).json({ error: "Incorrect password" });
    return;
  }
  res.cookie(COOKIE_NAME, expectedToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_MS,
  });
  res.json({ ok: true });
}

export function logout(req: Request, res: Response): void {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
}

export function check(req: Request, res: Response): void {
  if (!process.env.APP_PASSWORD) {
    res.status(500).json({ error: "APP_PASSWORD is not configured on the server." });
    return;
  }
  const token = req.cookies?.[COOKIE_NAME];
  const authenticated = typeof token === "string" && safeEqual(token, expectedToken());
  res.status(authenticated ? 200 : 401).json({ authenticated });
}

/** Express middleware — 401s any request without a valid session cookie. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!process.env.APP_PASSWORD) {
    // Fail closed: if the password isn't configured, don't silently allow access.
    res.status(500).json({ error: "APP_PASSWORD is not configured on the server." });
    return;
  }
  const token = req.cookies?.[COOKIE_NAME];
  if (typeof token === "string" && safeEqual(token, expectedToken())) {
    next();
    return;
  }
  res.status(401).json({ error: "Not authenticated" });
}
