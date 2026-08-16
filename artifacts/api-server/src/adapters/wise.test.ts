// Wise adapter tests. Stub global fetch so no real Wise call fires.
// Covers the three paths that the connections router relies on:
//   - validateCredential returns a friendly label on success
//   - validateCredential surfaces a typed auth error, not a raw HTTP body
//   - listAccounts maps Wise balances to AdapterAccount
//   - fetchTransactionsSince translates Wise's signed amounts to
//     AdapterTransaction (keeps the sign)

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { wiseAdapter } from "./wise";
import { AdapterError } from "./types";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetch(handler: (url: string, init?: RequestInit) => Response): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url, init);
  }) as unknown as typeof fetch;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("wiseAdapter.validateCredential", () => {
  it("returns ok with the personal profile's fullName on success", async () => {
    stubFetch(() => jsonResponse(200, [{ id: 1, type: "personal", fullName: "Alice Example" }]));
    const result = await wiseAdapter.validateCredential("token-good");
    expect(result).toEqual({ ok: true, label: "Alice Example" });
  });

  it("returns a not-ok result on 401 without leaking the response body", async () => {
    stubFetch(() =>
      jsonResponse(401, { error: "unauthorized", raw: "some wise diagnostic" }),
    );
    const result = await wiseAdapter.validateCredential("token-bad");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Wise rejected the token");
      expect(result.error).not.toContain("some wise diagnostic");
    }
  });

  it("returns not-ok when the profile list is empty", async () => {
    stubFetch(() => jsonResponse(200, []));
    const result = await wiseAdapter.validateCredential("token-empty");
    expect(result).toEqual({ ok: false, error: "Wise token has no accessible profile" });
  });
});

describe("wiseAdapter.listAccounts", () => {
  it("maps Wise balances into AdapterAccount with the profile id in providerMeta", async () => {
    let call = 0;
    stubFetch((url) => {
      call += 1;
      if (url.endsWith("/v2/profiles")) {
        return jsonResponse(200, [{ id: 42, type: "personal", fullName: "Alice" }]);
      }
      if (url.includes("/v4/profiles/42/balances")) {
        return jsonResponse(200, [
          { id: 100, currency: "GBP", amount: { value: 1234.56, currency: "GBP" } },
          { id: 101, currency: "EUR", amount: { value: 500, currency: "EUR" } },
        ]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const accounts = await wiseAdapter.listAccounts("token");
    expect(call).toBe(2);
    expect(accounts).toEqual([
      {
        externalId: "100",
        label: "Wise (GBP)",
        currency: "GBP",
        balance: "1234.56",
        providerMeta: { profileId: "42" },
      },
      {
        externalId: "101",
        label: "Wise (EUR)",
        currency: "EUR",
        balance: "500",
        providerMeta: { profileId: "42" },
      },
    ]);
  });

  it("throws AdapterError('auth') on 401", async () => {
    stubFetch(() => jsonResponse(401, { error: "no" }));
    await expect(wiseAdapter.listAccounts("token")).rejects.toBeInstanceOf(AdapterError);
    await expect(wiseAdapter.listAccounts("token")).rejects.toMatchObject({
      kind: "auth",
    });
  });

  it("throws AdapterError('rate_limit') on 429", async () => {
    stubFetch(() => jsonResponse(429, { error: "slow down" }));
    await expect(wiseAdapter.listAccounts("token")).rejects.toMatchObject({
      kind: "rate_limit",
    });
  });

  it("throws AdapterError('network') when fetch itself throws", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    await expect(wiseAdapter.listAccounts("token")).rejects.toMatchObject({
      kind: "network",
    });
  });
});

describe("wiseAdapter.fetchTransactionsSince", () => {
  it("keeps the sign — negative Wise amounts stay negative", async () => {
    stubFetch(() =>
      jsonResponse(200, {
        transactions: [
          {
            type: "DEBIT",
            date: "2026-08-01T09:15:00Z",
            amount: { value: -42.5, currency: "GBP" },
            totalFees: { value: 0, currency: "GBP" },
            details: {
              type: "CARD",
              description: "COFFEE SHOP",
              merchant: { name: "Coffee Shop" },
            },
            referenceNumber: "REF-123",
          },
          {
            type: "CREDIT",
            date: "2026-08-02T14:00:00Z",
            amount: { value: 100, currency: "GBP" },
            totalFees: { value: 0, currency: "GBP" },
            details: { type: "TRANSFER", description: "SALARY" },
            referenceNumber: "REF-124",
          },
        ],
      }),
    );
    const txs = await wiseAdapter.fetchTransactionsSince(
      "token",
      {
        externalId: "100",
        label: "Wise (GBP)",
        currency: "GBP",
        balance: "0",
        providerMeta: { profileId: "42" },
      },
      new Date("2026-07-01"),
    );
    expect(txs).toEqual([
      {
        externalId: "REF-123",
        date: "2026-08-01T09:15:00Z",
        description: "Coffee Shop",
        nativeAmount: "-42.5",
        currency: "GBP",
      },
      {
        externalId: "REF-124",
        date: "2026-08-02T14:00:00Z",
        description: "SALARY",
        nativeAmount: "100",
        currency: "GBP",
      },
    ]);
  });

  it("throws invalid_response if the account is not a Wise-shaped one", async () => {
    // Missing providerMeta.profileId — the adapter refuses rather than
    // silently returning an empty result set.
    await expect(
      wiseAdapter.fetchTransactionsSince(
        "token",
        {
          externalId: "100",
          label: "Wise (GBP)",
          currency: "GBP",
          balance: "0",
          providerMeta: {},
        },
        new Date(),
      ),
    ).rejects.toMatchObject({ kind: "invalid_response" });
  });
});
