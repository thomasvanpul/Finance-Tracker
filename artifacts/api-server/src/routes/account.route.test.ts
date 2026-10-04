// Step-up auth on account deletion. A valid session (cookie or bearer
// token) is proof a device once signed in, not proof the request is the
// owner acting now — see the comment at the top of account.ts for the
// fuller reasoning. This locks the gate itself: a credential account
// without the right password never reaches deleteUserAccount, and an
// account with no password (passkey-only, OAuth-only) must prove control
// of its email with a single-use code before anything is deleted.

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

// Bank consents are closed before deletion (M10). Default: nothing to
// close; a test can make it fail.
const revokeBankConsentsMock = vi.fn(async (_userId: string) => ({ revoked: 0, alreadyGone: 0, unreadable: 0 }));
vi.mock("../lib/bank-consents", () => {
  class ConsentRevokeError extends Error {}
  return {
    ConsentRevokeError,
    revokeBankConsents: (userId: string) => revokeBankConsentsMock(userId),
  };
});

// Google/GitHub grants are revoked best-effort before deletion. Default:
// nothing to revoke.
const revokeOAuthGrantsMock = vi.fn(async (_userId: string) => ({ revoked: [] as string[], remaining: [] as string[] }));
vi.mock("../lib/oauth-grants", () => ({
  revokeOAuthGrants: (userId: string) => revokeOAuthGrantsMock(userId),
}));

// Emailed step-up code for accounts with no password. "123456" is the
// code the mock accepts; issuing records the call.
const GOOD_CODE = "123456";
const issueDeleteCodeMock = vi.fn(async (_userId: string, _email: string) => "sent" as "sent" | "no-transport");
const consumeDeleteCodeMock = vi.fn(async (_userId: string, code: string) => code === GOOD_CODE);
vi.mock("../lib/delete-code", () => ({
  issueDeleteCode: (userId: string, email: string) => issueDeleteCodeMock(userId, email),
  consumeDeleteCode: (userId: string, code: string) => consumeDeleteCodeMock(userId, code),
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
  revokeBankConsentsMock.mockClear();
  revokeOAuthGrantsMock.mockClear();
  issueDeleteCodeMock.mockClear();
  consumeDeleteCodeMock.mockClear();
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

  it("emails a code instead of deleting when the account has no password", async () => {
    credentialRows = [];
    const res = await deleteAccount({ email: "owner@example.com" });
    expect(res.status).toBe(202);
    expect(((await res.json()) as { status: string }).status).toBe("code_sent");
    expect(issueDeleteCodeMock).toHaveBeenCalledWith("user-a", "owner@example.com");
    expect(deleteUserAccountMock).not.toHaveBeenCalled();
  });

  it("refuses, deleting nothing, when no code can be delivered", async () => {
    credentialRows = [];
    issueDeleteCodeMock.mockImplementationOnce(async () => "no-transport");
    const res = await deleteAccount({ email: "owner@example.com" });
    expect(res.status).toBe(503);
    expect(deleteUserAccountMock).not.toHaveBeenCalled();
  });

  it("rejects a wrong code for an account with no password", async () => {
    credentialRows = [];
    const res = await deleteAccount({ email: "owner@example.com", code: "000000" });
    expect(res.status).toBe(400);
    expect(deleteUserAccountMock).not.toHaveBeenCalled();
  });

  it("does not issue or check a code before the email matches", async () => {
    credentialRows = [];
    const res = await deleteAccount({ email: "someone-else@example.com", code: GOOD_CODE });
    expect(res.status).toBe(400);
    expect(issueDeleteCodeMock).not.toHaveBeenCalled();
    expect(consumeDeleteCodeMock).not.toHaveBeenCalled();
  });

  it("deletes an account with no password once the emailed code checks out", async () => {
    credentialRows = [];
    const res = await deleteAccount({ email: "owner@example.com", code: GOOD_CODE });
    expect(res.status).toBe(200);
    expect(consumeDeleteCodeMock).toHaveBeenCalledWith("user-a", GOOD_CODE);
    expect(deleteUserAccountMock).toHaveBeenCalledWith("user-a");
  });

  it("closes bank consents before deleting", async () => {
    const order: string[] = [];
    revokeBankConsentsMock.mockImplementationOnce(async () => {
      order.push("revoke");
      return { revoked: 1, alreadyGone: 0, unreadable: 0 };
    });
    deleteUserAccountMock.mockImplementationOnce(async () => {
      order.push("delete");
      return { deletedRows: 3, tables: { user: 1 } };
    });
    const res = await deleteAccount({ email: "owner@example.com", code: GOOD_CODE });
    expect(res.status).toBe(200);
    expect(revokeBankConsentsMock).toHaveBeenCalledWith("user-a");
    expect(order).toEqual(["revoke", "delete"]);
  });

  it("revokes sign-in grants before deleting and reports what is still live", async () => {
    const order: string[] = [];
    revokeOAuthGrantsMock.mockImplementationOnce(async () => {
      order.push("grants");
      return { revoked: ["github"], remaining: ["google"] };
    });
    deleteUserAccountMock.mockImplementationOnce(async () => {
      order.push("delete");
      return { deletedRows: 3, tables: { user: 1 } };
    });
    const res = await deleteAccount({ email: "owner@example.com", code: GOOD_CODE });
    expect(res.status).toBe(200);
    expect(order).toEqual(["grants", "delete"]);
    expect(((await res.json()) as { oauthGrants: unknown }).oauthGrants).toEqual({ revoked: ["github"], remaining: ["google"] });
  });

  it("still deletes when no sign-in grant could be revoked", async () => {
    revokeOAuthGrantsMock.mockImplementationOnce(async () => ({ revoked: [], remaining: ["google", "github"] }));
    const res = await deleteAccount({ email: "owner@example.com", code: GOOD_CODE });
    expect(res.status).toBe(200);
    expect(deleteUserAccountMock).toHaveBeenCalledWith("user-a");
  });

  it("deletes nothing when a bank consent cannot be closed", async () => {
    const { ConsentRevokeError } = await import("../lib/bank-consents");
    revokeBankConsentsMock.mockImplementationOnce(async () => {
      throw new ConsentRevokeError(1, new Error("Enable Banking 500"));
    });
    const res = await deleteAccount({ email: "owner@example.com", code: GOOD_CODE });
    expect(res.status).toBe(502);
    expect(deleteUserAccountMock).not.toHaveBeenCalled();
  });
});
