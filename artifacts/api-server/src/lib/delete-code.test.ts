// The account-deletion code: single use, one guess, expires, never stored
// in the clear. The route test mocks this module; this one runs it against
// an in-memory stand-in for the verification table.

import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = { id: string; identifier: string; value: string; expiresAt: Date };
let rows: Row[] = [];
let deliverable = true;
const sent: { to: string; code?: string }[] = [];

vi.mock("drizzle-orm", () => ({ eq: (_col: unknown, value: string) => value }));
vi.mock("@workspace/db", () => ({
  verificationTable: { identifier: "identifier", value: "value", expiresAt: "expires_at" },
  db: {
    insert: () => ({ values: async (row: Row) => { rows.push(row); } }),
    delete: () => ({
      where: (identifier: string) => {
        const taken = rows.filter((r) => r.identifier === identifier);
        rows = rows.filter((r) => r.identifier !== identifier);
        return Object.assign(Promise.resolve(), { returning: async () => taken });
      },
    }),
  },
}));
vi.mock("./better-auth", () => ({
  sendTransactionalEmail: async (mail: { to: string; code?: string }) => { sent.push(mail); },
}));
vi.mock("./email-transport", () => ({ isEmailDeliverable: () => deliverable }));

const { issueDeleteCode, consumeDeleteCode } = await import("./delete-code");

beforeEach(() => {
  rows = [];
  sent.length = 0;
  deliverable = true;
});

async function issue(): Promise<string> {
  expect(await issueDeleteCode("u1", "owner@example.com")).toBe("sent");
  return sent.at(-1)!.code!;
}

describe("account deletion code", () => {
  it("mails a six-digit code and stores only its hash", async () => {
    const code = await issue();
    expect(code).toMatch(/^\d{6}$/);
    expect(sent.at(-1)!.to).toBe("owner@example.com");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.value).not.toContain(code);
  });

  it("accepts the code once and only once", async () => {
    const code = await issue();
    expect(await consumeDeleteCode("u1", code)).toBe(true);
    expect(await consumeDeleteCode("u1", code)).toBe(false);
  });

  it("burns the code on a wrong guess", async () => {
    const code = await issue();
    const wrong = code === "000000" ? "000001" : "000000";
    expect(await consumeDeleteCode("u1", wrong)).toBe(false);
    expect(await consumeDeleteCode("u1", code)).toBe(false);
  });

  it("refuses an expired code", async () => {
    const code = await issue();
    rows[0]!.expiresAt = new Date(Date.now() - 1000);
    expect(await consumeDeleteCode("u1", code)).toBe(false);
  });

  it("replaces an earlier code when a new one is issued", async () => {
    const first = await issue();
    const second = await issue();
    expect(rows).toHaveLength(1);
    if (first !== second) expect(await consumeDeleteCode("u1", first)).toBe(false);
    else expect(await consumeDeleteCode("u1", second)).toBe(true);
  });

  it("does not satisfy another user's request", async () => {
    const code = await issue();
    expect(await consumeDeleteCode("u2", code)).toBe(false);
  });

  it("sends nothing and stores nothing when mail cannot be delivered", async () => {
    deliverable = false;
    expect(await issueDeleteCode("u1", "owner@example.com")).toBe("no-transport");
    expect(rows).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });
});
