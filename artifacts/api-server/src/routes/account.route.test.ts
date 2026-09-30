// Step-up auth on account deletion. A valid session (cookie or bearer
// token) is proof a device once signed in, not proof the request is the
// owner acting now — see the comment at the top of account.ts for the
// fuller reasoning. This locks the gate itself: a credential account
// without the right password never reaches deleteUserAccount, and an
// account with no password (passkey-only, OAuth-only) is unaffected.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const CORRECT_PASSWORD = "the-real-password";

// Rows the "credential" lookup answers with — set per test.
let credentialRows: { password: string | null }[] = [];
const deleteUserAccountMock = vi.fn(async (_userId: string) => ({ deletedRows: 3, tables: { user: 1 } }));

vi.mock("@workspace/db", () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.from = () => chain;
  chain.where = async () => credentialRows;
  return { db: chain, accountTable: { userId: "user_id", providerId: "provider_id", password: "password" } };
});

vi.mock("better-auth/crypto", () => ({
  verifyPassword: vi.fn(async ({ password }: { hash: string; password: string }) => password === CORRECT_PASSWORD),
}));

vi.mock("../lib/account-deletion", () => ({
  deleteUserAccount: (userId: string) => deleteUserAccountMock(userId),
}));

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const express = (await import("express")).default;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = "user-a";
    (req as unknown as { user: { email: string } }).user = { email: "owner@example.com" };
    next();
  });
  app.use((await import("./account")).default);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  credentialRows = [];
  deleteUserAccountMock.mockClear();
});

async function deleteAccount(body: unknown) {
  return fetch(`${baseUrl}/account/delete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /account/delete", () => {
  it("rejects a mismatched email before any password check", async () => {
    credentialRows = [{ password: "hash-of-real-password" }];
    const res = await deleteAccount({ email: "not-the-owner@example.com", password: CORRECT_PASSWORD });
    expect(res.status).toBe(400);
    expect(deleteUserAccountMock).not.toHaveBeenCalled();
  });

  it("rejects a correct email with no password when the account has one", async () => {
    credentialRows = [{ password: "hash-of-real-password" }];
    const res = await deleteAccount({ email: "owner@example.com" });
    expect(res.status).toBe(400);
    expect(deleteUserAccountMock).not.toHaveBeenCalled();
  });

  it("rejects a correct email with the wrong password", async () => {
    credentialRows = [{ password: "hash-of-real-password" }];
    const res = await deleteAccount({ email: "owner@example.com", password: "guessed-wrong" });
    expect(res.status).toBe(400);
    expect(deleteUserAccountMock).not.toHaveBeenCalled();
  });

  it("deletes once the email and password both check out", async () => {
    credentialRows = [{ password: "hash-of-real-password" }];
    const res = await deleteAccount({ email: "owner@example.com", password: CORRECT_PASSWORD });
    expect(res.status).toBe(200);
    expect(deleteUserAccountMock).toHaveBeenCalledWith("user-a");
  });

  it("falls back to email-only for an account with no password credential", async () => {
    credentialRows = [];
    const res = await deleteAccount({ email: "owner@example.com" });
    expect(res.status).toBe(200);
    expect(deleteUserAccountMock).toHaveBeenCalledWith("user-a");
  });
});
