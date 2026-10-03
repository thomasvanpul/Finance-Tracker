// BACKLOG § I7 — AI is opt-in (Thomas, 3 Oct 2026, consent basis).
//
// Property: no request on an AI-metered path (/ai/*, /receipt/*) reaches a
// handler — and so no provider is called — unless the signed-in user's
// account preference `nr-ai-enabled` is exactly "true". Absent, "false", or
// any other value is OFF. The gate is the one app.ts mounts, exercised over
// HTTP; only the preference lookup and the DB module are stubbed.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
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
  userPreferencesTable: {},
}));

const getPreference = vi.fn<(userId: string, key: string) => Promise<string | null>>();
vi.mock("./lib/user-preferences-db", () => ({ getPreference }));

const { aiMeteredGate } = await import("./app");
const { AI_ENABLED_KEY } = await import("./lib/ai-consent");

let app: Express;
let server: Server;
let baseUrl: string;
let handled: string[] = [];

function fakeAuth(req: Request, _res: Response, next: NextFunction): void {
  (req as unknown as { userId: string }).userId = String(req.headers["x-test-userid"] ?? "u1");
  next();
}

beforeAll(async () => {
  app = express();
  app.use("/api", fakeAuth, aiMeteredGate, (req, res) => {
    handled.push(req.path);
    res.json({ ok: true });
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  handled = [];
  getPreference.mockReset();
});

describe("AI consent gate (I7, opt-in)", () => {
  it("refuses /ai/chat when the user has never turned AI on", async () => {
    getPreference.mockResolvedValue(null);
    const res = await fetch(`${baseUrl}/api/ai/chat`, { method: "POST" });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code?: string }).code).toBe("ai_off");
    expect(handled).toEqual([]);
    expect(getPreference).toHaveBeenCalledWith("u1", AI_ENABLED_KEY);
  });

  it("refuses /receipt/parse when AI is turned off", async () => {
    getPreference.mockResolvedValue("false");
    const res = await fetch(`${baseUrl}/api/receipt/parse`, { method: "POST" });
    expect(res.status).toBe(403);
    expect(handled).toEqual([]);
  });

  it("treats any value other than \"true\" as off", async () => {
    getPreference.mockResolvedValue("1");
    const res = await fetch(`${baseUrl}/api/ai/batch-categorize`, { method: "POST" });
    expect(res.status).toBe(403);
    expect(handled).toEqual([]);
  });

  it("lets the request through once the user has turned AI on", async () => {
    getPreference.mockResolvedValue("true");
    const res = await fetch(`${baseUrl}/api/ai/chat`, { method: "POST", headers: { "x-test-userid": "u-on" } });
    expect(res.status).toBe(200);
    expect(handled).toEqual(["/ai/chat"]);
  });

  it("fails closed when the preference cannot be read", async () => {
    getPreference.mockRejectedValue(new Error("db down"));
    const res = await fetch(`${baseUrl}/api/ai/chat`, { method: "POST" });
    expect(res.status).toBe(503);
    expect(handled).toEqual([]);
  });

  it("does not consult the preference for paths that spend no AI budget", async () => {
    const res = await fetch(`${baseUrl}/api/accounts`);
    expect(res.status).toBe(200);
    expect(handled).toEqual(["/accounts"]);
    expect(getPreference).not.toHaveBeenCalled();
  });
});
