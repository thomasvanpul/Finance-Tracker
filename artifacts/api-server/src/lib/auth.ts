import type { Request, Response, NextFunction } from "express";
import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";

// Single shared-password gate for this single-user app, with optional TOTP 2FA
// on top. Not per-user auth — just enough to keep a public URL from being wide
// open to anyone who finds it.
//
// Password storage: starts as the APP_PASSWORD env var. The first time the
// user changes their password or enables 2FA, a row is lazily created in
// app_settings (bcrypt hash), which then takes over as the source of truth.
// This means existing deployments don't need any migration step.
//
// Required env vars: APP_PASSWORD (bootstrap only), SESSION_SECRET.

const COOKIE_NAME = "fintrack_session";
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SETTINGS_ROW_ID = 1;

// ── Rate limiting (per client IP) — shared across login and 2FA verification ──
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

interface AttemptRecord {
  count: number;
  windowStart: number;
  lockedUntil: number | null;
}

const attempts = new Map<string, AttemptRecord>();

function getClientKey(req: Request): string {
  return req.ip ?? "unknown";
}

function isLockedOut(key: string): number | null {
  const record = attempts.get(key);
  if (!record?.lockedUntil) return null;
  if (Date.now() >= record.lockedUntil) {
    attempts.delete(key);
    return null;
  }
  return record.lockedUntil;
}

function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const record = attempts.get(key);

  if (!record || now - record.windowStart > WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now, lockedUntil: null });
    return;
  }

  record.count++;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
  }
}

function clearAttempts(key: string): void {
  attempts.delete(key);
}

// ── Settings row helpers ──

async function getSettingsRow() {
  const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, SETTINGS_ROW_ID));
  return rows[0] ?? null;
}

/** Creates the settings row on first use, seeded from the env password. */
async function ensureSettingsRow() {
  const existing = await getSettingsRow();
  if (existing) return existing;

  if (!process.env.APP_PASSWORD) {
    throw new Error("APP_PASSWORD is not set in the environment.");
  }
  const passwordHash = await bcrypt.hash(process.env.APP_PASSWORD, 10);
  const [row] = await db
    .insert(appSettingsTable)
    .values({ id: SETTINGS_ROW_ID, passwordHash, totpEnabled: false })
    .onConflictDoNothing()
    .returning();
  return row ?? (await getSettingsRow())!;
}

async function verifyPassword(candidate: string): Promise<boolean> {
  const row = await getSettingsRow();
  if (row) return bcrypt.compare(candidate, row.passwordHash);
  if (!process.env.APP_PASSWORD) return false;
  return safeEqual(candidate, process.env.APP_PASSWORD);
}

/** Stable signing material for the session cookie — changes whenever the password changes. */
async function signingMaterial(): Promise<string> {
  const row = await getSettingsRow();
  if (row) return row.passwordHash;
  if (!process.env.APP_PASSWORD) throw new Error("APP_PASSWORD is not set in the environment.");
  return process.env.APP_PASSWORD;
}

function sign(value: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set in the environment.");
  return createHmac("sha256", secret).update(value).digest("hex");
}

async function expectedToken(): Promise<string> {
  return sign(await signingMaterial());
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

// ── Backup codes ──

function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () => randomBytes(5).toString("hex").toUpperCase());
}

async function hashBackupCodes(codes: string[]): Promise<string> {
  const hashes = await Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
  return JSON.stringify(hashes);
}

async function consumeBackupCode(row: NonNullable<Awaited<ReturnType<typeof getSettingsRow>>>, code: string): Promise<boolean> {
  if (!row.backupCodesHash) return false;
  const hashes: string[] = JSON.parse(row.backupCodesHash);
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(code, hashes[i])) {
      hashes.splice(i, 1);
      await db
        .update(appSettingsTable)
        .set({ backupCodesHash: JSON.stringify(hashes) })
        .where(eq(appSettingsTable.id, SETTINGS_ROW_ID));
      return true;
    }
  }
  return false;
}

// ── Login / logout / check ──

export async function login(req: Request, res: Response): Promise<void> {
  const key = getClientKey(req);

  const lockedUntil = isLockedOut(key);
  if (lockedUntil) {
    const retryAfterSec = Math.ceil((lockedUntil - Date.now()) / 1000);
    res.status(429).json({
      error: `Too many failed attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
    });
    return;
  }

  const { password, code } = req.body ?? {};
  if (typeof password !== "string") {
    res.status(400).json({ error: "Password required" });
    return;
  }

  const passwordOk = await verifyPassword(password);
  if (!passwordOk) {
    recordFailedAttempt(key);
    res.status(401).json({ error: "Incorrect password" });
    return;
  }

  const row = await getSettingsRow();
  if (row?.totpEnabled) {
    if (typeof code !== "string" || code.length === 0) {
      // Password was right, but 2FA is enabled and no code was supplied yet —
      // tell the frontend to prompt for one. Don't set the session cookie yet.
      res.json({ ok: false, requiresCode: true });
      return;
    }
    const totpValid = row.totpSecret ? authenticator.check(code, row.totpSecret) : false;
    const backupValid = !totpValid && (await consumeBackupCode(row, code));
    if (!totpValid && !backupValid) {
      recordFailedAttempt(key);
      res.status(401).json({ error: "Incorrect authentication code", requiresCode: true });
      return;
    }
  }

  clearAttempts(key);
  setSessionCookie(res, await expectedToken());
  res.json({ ok: true });
}

export function logout(req: Request, res: Response): void {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
}

export async function check(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[COOKIE_NAME];
  const authenticated = typeof token === "string" && token === (await expectedToken());
  res.status(authenticated ? 200 : 401).json({ authenticated });
}

/** Express middleware — 401s any request without a valid session cookie. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (typeof token === "string" && token === (await expectedToken())) {
      next();
      return;
    }
    res.status(401).json({ error: "Not authenticated" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Auth check failed" });
  }
}

// ── Settings: change password, 2FA setup/confirm/disable ──

export async function changePassword(req: Request, res: Response): Promise<void> {
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || newPassword.length < 8) {
    res.status(400).json({ error: "Current password and a new password (min 8 characters) are required." });
    return;
  }
  const ok = await verifyPassword(currentPassword);
  if (!ok) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  await ensureSettingsRow();
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(appSettingsTable).set({ passwordHash }).where(eq(appSettingsTable.id, SETTINGS_ROW_ID));

  // Password changed => signing material changed => re-issue the session cookie
  // for this client so they're not immediately logged out.
  setSessionCookie(res, await expectedToken());
  res.json({ ok: true });
}

export async function get2faStatus(req: Request, res: Response): Promise<void> {
  const row = await getSettingsRow();
  res.json({ enabled: row?.totpEnabled ?? false });
}

export async function setup2fa(req: Request, res: Response): Promise<void> {
  await ensureSettingsRow();
  const secret = authenticator.generateSecret();
  await db.update(appSettingsTable).set({ totpSecret: secret }).where(eq(appSettingsTable.id, SETTINGS_ROW_ID));

  const otpauth = authenticator.keyuri("Fintrack", "Fintrack", secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauth);
  res.json({ secret, qrCodeDataUrl });
}

export async function confirm2fa(req: Request, res: Response): Promise<void> {
  const { code } = req.body ?? {};
  const row = await getSettingsRow();
  if (typeof code !== "string" || !row?.totpSecret) {
    res.status(400).json({ error: "Set up 2FA first, then provide the 6-digit code." });
    return;
  }
  if (!authenticator.check(code, row.totpSecret)) {
    res.status(401).json({ error: "Incorrect code" });
    return;
  }
  const backupCodes = generateBackupCodes();
  const backupCodesHash = await hashBackupCodes(backupCodes);
  await db
    .update(appSettingsTable)
    .set({ totpEnabled: true, backupCodesHash })
    .where(eq(appSettingsTable.id, SETTINGS_ROW_ID));
  res.json({ ok: true, backupCodes });
}

export async function disable2fa(req: Request, res: Response): Promise<void> {
  const { password } = req.body ?? {};
  if (typeof password !== "string" || !(await verifyPassword(password))) {
    res.status(401).json({ error: "Password is incorrect" });
    return;
  }
  await db
    .update(appSettingsTable)
    .set({ totpEnabled: false, totpSecret: null, backupCodesHash: null })
    .where(eq(appSettingsTable.id, SETTINGS_ROW_ID));
  res.json({ ok: true });
}
