// M10: an Enable Banking consent is closed before the row holding its
// session id is deleted. The DB is mocked, so the provider/user/id filter
// in the SQL is not exercised here — the rows below stand for what that
// query returned.

import { describe, it, expect, vi, beforeEach } from "vitest";

let selected: { id: number; credentialCiphertext: string }[] = [];
const revokeSessionMock = vi.fn(async (_id: string): Promise<"revoked" | "already-gone"> => "revoked");

vi.mock("@workspace/db", () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.from = () => chain;
  chain.where = async () => selected;
  return {
    db: chain,
    connectionsTable: { id: "id", userId: "user_id", provider: "provider", credentialCiphertext: "c" },
  };
});

// Ciphertext in these rows is the plaintext prefixed, so the test reads
// without a key.
vi.mock("./crypto", () => ({
  decryptCredential: (blob: string) => {
    if (!blob.startsWith("enc:")) throw new Error("bad ciphertext");
    return blob.slice(4);
  },
}));

vi.mock("../adapters/enable-banking", async (importOriginal) => {
  const real = await importOriginal<typeof import("../adapters/enable-banking")>();
  return {
    enableBankingAdapter: { provider: "enable-banking" },
    sessionIdFromCredential: real.sessionIdFromCredential,
    revokeSession: (id: string) => revokeSessionMock(id),
  };
});

vi.mock("./logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const { revokeBankConsents, ConsentRevokeError } = await import("./bank-consents");

const cred = (sessionId: string) => `enc:${JSON.stringify({ sessionId })}`;

beforeEach(() => {
  selected = [];
  revokeSessionMock.mockReset();
  revokeSessionMock.mockResolvedValue("revoked");
});

describe("revokeBankConsents", () => {
  it("closes the session behind every Enable Banking connection", async () => {
    selected = [{ id: 1, credentialCiphertext: cred("s-1") }, { id: 2, credentialCiphertext: cred("s-2") }];
    revokeSessionMock.mockResolvedValueOnce("revoked").mockResolvedValueOnce("already-gone");
    const summary = await revokeBankConsents("user-a");
    expect(revokeSessionMock.mock.calls.map((c) => c[0])).toEqual(["s-1", "s-2"]);
    expect(summary).toEqual({ revoked: 1, alreadyGone: 1, unreadable: 0 });
  });

  it("does nothing when the user has no bank connection", async () => {
    await expect(revokeBankConsents("user-a")).resolves.toEqual({ revoked: 0, alreadyGone: 0, unreadable: 0 });
    expect(revokeSessionMock).not.toHaveBeenCalled();
  });

  it("skips a credential it cannot read rather than blocking deletion forever", async () => {
    selected = [{ id: 1, credentialCiphertext: "garbage" }, { id: 2, credentialCiphertext: "enc:not json" }];
    const summary = await revokeBankConsents("user-a");
    expect(revokeSessionMock).not.toHaveBeenCalled();
    expect(summary.unreadable).toBe(2);
  });

  it("throws when the provider refuses, so the caller deletes nothing", async () => {
    selected = [{ id: 7, credentialCiphertext: cred("s-7") }];
    revokeSessionMock.mockRejectedValueOnce(new Error("Enable Banking 500 on /sessions/s-7"));
    await expect(revokeBankConsents("user-a")).rejects.toBeInstanceOf(ConsentRevokeError);
  });
});
