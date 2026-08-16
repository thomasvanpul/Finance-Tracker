// Alpaca adapter tests. Same shape as wise.test.ts: stubbed fetch,
// no live Alpaca calls, focused on the interface contract and the
// JSON-credential parsing which is new in H3.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { alpacaAdapter } from "./alpaca";
import { AdapterError } from "./types";

const originalFetch = globalThis.fetch;
beforeEach(() => vi.restoreAllMocks());
afterEach(() => { globalThis.fetch = originalFetch; });

function stubFetch(handler: (url: string, init?: RequestInit) => Response): void {
  globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
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

const validCred = JSON.stringify({ keyId: "AKIA123", secret: "shh" });

describe("alpacaAdapter — credential shape", () => {
  it("rejects a non-JSON credential without hitting Alpaca", async () => {
    stubFetch(() => { throw new Error("should not fetch"); });
    const r = await alpacaAdapter.validateCredential("not-json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not valid JSON/);
  });

  it("rejects a JSON credential missing keyId or secret", async () => {
    stubFetch(() => { throw new Error("should not fetch"); });
    const r = await alpacaAdapter.validateCredential(JSON.stringify({ keyId: "x" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/missing keyId\/secret/);
  });
});

describe("alpacaAdapter.validateCredential", () => {
  it("returns ok with the account number as label on success", async () => {
    stubFetch(() => jsonResponse(200, {
      id: "acct-1", account_number: "12345", currency: "USD", cash: "1000.00", equity: "1500.00", status: "ACTIVE",
    }));
    const r = await alpacaAdapter.validateCredential(validCred);
    expect(r).toEqual({ ok: true, label: "Alpaca 12345" });
  });

  it("returns not-ok on 401 without leaking response body", async () => {
    stubFetch(() => jsonResponse(401, { message: "internal alpaca error text" }));
    const r = await alpacaAdapter.validateCredential(validCred);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("Alpaca rejected the key/secret");
      expect(r.error).not.toContain("internal alpaca error text");
    }
  });
});

describe("alpacaAdapter.listAccounts", () => {
  it("sends the key + secret in the correct headers", async () => {
    let sawHeaders: Record<string, string> = {};
    stubFetch((_url, init) => {
      sawHeaders = init?.headers as Record<string, string>;
      return jsonResponse(200, {
        id: "acct-1", account_number: "12345", currency: "USD",
        cash: "1234.56", equity: "2000", status: "ACTIVE",
      });
    });
    const accts = await alpacaAdapter.listAccounts(validCred);
    expect(sawHeaders["APCA-API-KEY-ID"]).toBe("AKIA123");
    expect(sawHeaders["APCA-API-SECRET-KEY"]).toBe("shh");
    expect(accts).toEqual([
      {
        externalId: "acct-1",
        label: "Alpaca 12345",
        currency: "USD",
        balance: "1234.56",
        providerMeta: { equity: "2000", status: "ACTIVE" },
      },
    ]);
  });

  it("throws AdapterError('rate_limit') on 429", async () => {
    stubFetch(() => jsonResponse(429, {}));
    await expect(alpacaAdapter.listAccounts(validCred)).rejects.toBeInstanceOf(AdapterError);
    await expect(alpacaAdapter.listAccounts(validCred)).rejects.toMatchObject({ kind: "rate_limit" });
  });
});

describe("alpacaAdapter.fetchTransactionsSince", () => {
  it("maps FILL and DIV activities into AdapterTransaction; keeps the sign", async () => {
    stubFetch(() => jsonResponse(200, [
      {
        id: "act-1", activity_type: "FILL",
        transaction_time: "2026-08-01T15:30:00Z",
        symbol: "AAPL", side: "buy", qty: "10", price: "150",
        net_amount: "-1500.00",
      },
      {
        id: "act-2", activity_type: "DIV",
        date: "2026-08-05",
        symbol: "MSFT", net_amount: "12.34",
      },
    ]));
    const txs = await alpacaAdapter.fetchTransactionsSince(
      validCred,
      { externalId: "acct-1", label: "Alpaca", currency: "USD", balance: "0", providerMeta: {} },
      new Date("2026-07-01"),
    );
    expect(txs).toEqual([
      { externalId: "act-1", date: "2026-08-01T15:30:00Z", description: "BUY 10 AAPL", nativeAmount: "-1500.00", currency: "USD" },
      { externalId: "act-2", date: "2026-08-05T00:00:00Z", description: "Dividend MSFT", nativeAmount: "12.34", currency: "USD" },
    ]);
  });
});
