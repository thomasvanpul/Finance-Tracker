// Ownership lock on the money-write path.
//
// Until 10-Sep `adjustAccountBalance` looked its account up by id alone,
// and so did its UPDATE, in a multi-tenant app. Seven call sites passed
// ids that no route had checked, so a request naming another user's
// account moved that user's balance. Probed live: POST /api/transactions
// with `accountId: 999999` returned 201.
//
// These assert the two halves that make that impossible: the lookup is
// scoped to the caller, and when the lookup finds nothing NO write is
// issued at all. The source lock below is the third half — that no call
// site can omit the userId in the first place.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const recorded: { wherePredicates: unknown[]; executed: unknown[] } = {
  wherePredicates: [],
  executed: [],
};
let accountRows: Array<{ id: number; currency: string }> = [];

vi.mock("@workspace/db", () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: (pred: unknown) => {
      recorded.wherePredicates.push(pred);
      return Promise.resolve(accountRows);
    },
    execute: (q: unknown) => {
      recorded.executed.push(q);
      return Promise.resolve(undefined);
    },
  };
  return { db: chain, accountsTable: { id: "accounts.id", userId: "accounts.userId", currency: "accounts.currency" } };
});

vi.mock("./market", () => ({
  toGbp: async (n: number) => n,
  gbpTo: async (n: number) => n,
}));

const { adjustAccountBalance, isAccountOwnedBy } = await import("./balance");

beforeEach(() => {
  recorded.wherePredicates = [];
  recorded.executed = [];
  accountRows = [{ id: 1, currency: "GBP" }];
});

describe("adjustAccountBalance · the caller must own the account", () => {
  it("scopes its account lookup by userId, not by id alone", async () => {
    await adjustAccountBalance(1, "user-a", 100, "GBP", "expense");
    expect(recorded.wherePredicates).toHaveLength(1);
    // drizzle's and() carries its clauses; two of them means id AND userId.
    const pred = recorded.wherePredicates[0] as { queryChunks?: unknown[] };
    const rendered = JSON.stringify(pred);
    expect(rendered).toContain("accounts.id");
    expect(rendered).toContain("accounts.userId");
  });

  it("issues NO write when the account is not the caller's", async () => {
    accountRows = []; // the scoped lookup found nothing — not ours
    await adjustAccountBalance(1, "user-b", 100, "GBP", "expense");
    expect(recorded.executed).toHaveLength(0);
  });

  it("issues exactly one write when the account is the caller's", async () => {
    await adjustAccountBalance(1, "user-a", 100, "GBP", "expense");
    expect(recorded.executed).toHaveLength(1);
  });

  it("carries userId into the UPDATE, not only into the lookup", async () => {
    await adjustAccountBalance(1, "user-a", 100, "GBP", "expense");
    expect(JSON.stringify(recorded.executed[0])).toContain("user-a");
  });
});

describe("isAccountOwnedBy", () => {
  it("is true when the scoped lookup finds the account", async () => {
    expect(await isAccountOwnedBy(1, "user-a")).toBe(true);
  });

  it("is false when it does not", async () => {
    accountRows = [];
    expect(await isAccountOwnedBy(1, "user-b")).toBe(false);
  });
});

// ── Source lock ─────────────────────────────────────────────────────────
//
// The type system already fails a call site that omits userId. This locks
// the two things the type system cannot: that the parameter stays
// REQUIRED (an optional one with a default would compile everywhere and
// reopen the hole silently), and that the UPDATE stays scoped.

const SRC = join(__dirname, "..");
const balanceSrc = readFileSync(join(SRC, "lib/balance.ts"), "utf-8");

describe("source lock · adjustAccountBalance cannot be called without a userId", () => {
  it("declares userId as a required parameter, not optional and not defaulted", () => {
    const sig = balanceSrc.slice(
      balanceSrc.indexOf("export async function adjustAccountBalance("),
      balanceSrc.indexOf("): Promise<void> {"),
    );
    expect(sig).toContain("userId: string");
    expect(sig).not.toContain("userId?:");
    expect(sig).not.toMatch(/userId\s*:\s*string\s*=/);
  });

  it("keeps user_id in the balance UPDATE, not only in the SELECT", () => {
    const update = balanceSrc.slice(balanceSrc.indexOf("UPDATE accounts SET balance"));
    expect(update).toContain("user_id = ${userId}");
  });

  it("every call site in routes/ passes userId as the second argument", () => {
    const routeFiles = ["transactions.ts", "upcoming.ts", "debts.ts"];
    const calls: string[] = [];
    for (const f of routeFiles) {
      const src = readFileSync(join(SRC, "routes", f), "utf-8");
      // Match the call and its first two arguments, across line breaks.
      for (const m of src.matchAll(/adjustAccountBalance\(\s*([^,]+),\s*([^,]+),/g)) {
        calls.push(`${f}: ${m[2]!.trim()}`);
      }
    }
    // Seven call sites, every one of them passing userId second.
    expect(calls).toHaveLength(7);
    for (const c of calls) expect(c.endsWith("userId")).toBe(true);
  });
});
