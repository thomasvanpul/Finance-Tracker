// Kraken adapter tests. Verifies the JSON credential shape, the HMAC
// signature is present on the request, the Kraken error-array is
// translated into the typed AdapterError kinds, and asset naming
// normalises the legacy X/Z prefix.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { krakenAdapter } from "./kraken";
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

// A syntactically-valid base64 32-byte private key. Not a real Kraken
// key — used only to prove the HMAC pipeline runs.
const validCred = JSON.stringify({
  apiKey: "kraken-api-key-123",
  privateKey: Buffer.from(new Uint8Array(32).fill(1)).toString("base64"),
});

describe("krakenAdapter — credential shape", () => {
  it("rejects a non-JSON credential", async () => {
    const r = await krakenAdapter.validateCredential("plain-string");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not valid JSON/);
  });

  it("rejects a JSON credential missing apiKey/privateKey", async () => {
    const r = await krakenAdapter.validateCredential(JSON.stringify({ apiKey: "x" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/missing apiKey\/privateKey/);
  });
});

describe("krakenAdapter.validateCredential", () => {
  it("sends API-Key and API-Sign headers on the private call", async () => {
    let sawHeaders: Record<string, string> = {};
    stubFetch((_url, init) => {
      sawHeaders = init?.headers as Record<string, string>;
      return jsonResponse(200, { error: [], result: { ZUSD: "1000.00", XXBT: "0.05" } });
    });
    const r = await krakenAdapter.validateCredential(validCred);
    expect(r).toEqual({ ok: true, label: "Kraken · 2 assets" });
    expect(sawHeaders["API-Key"]).toBe("kraken-api-key-123");
    expect(sawHeaders["API-Sign"]).toBeTypeOf("string");
    // The signature is base64, non-empty, and different every call
    // (nonces differ). Not asserting length exactly to stay resilient
    // to Node version differences in base64 encoding.
    expect((sawHeaders["API-Sign"] ?? "").length).toBeGreaterThan(40);
  });

  it("translates EAPI:Invalid key into AdapterError('auth')", async () => {
    stubFetch(() => jsonResponse(200, { error: ["EAPI:Invalid key"] }));
    const r = await krakenAdapter.validateCredential(validCred);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/auth failed/i);
  });
});

describe("krakenAdapter.listAccounts", () => {
  it("skips zero-balance assets and strips the legacy X/Z prefix in the display currency", async () => {
    stubFetch(() => jsonResponse(200, {
      error: [],
      result: {
        ZUSD: "1234.50",
        XXBT: "0.05",
        ZEUR: "0.00",   // skipped
        SOL:  "10.5",    // modern asset, no prefix
      },
    }));
    const accts = await krakenAdapter.listAccounts(validCred);
    expect(accts).toEqual([
      { externalId: "ZUSD", label: "Kraken (USD)", currency: "USD", balance: "1234.50", providerMeta: {} },
      { externalId: "XXBT", label: "Kraken (XBT)", currency: "XBT", balance: "0.05",   providerMeta: {} },
      { externalId: "SOL",  label: "Kraken (SOL)", currency: "SOL", balance: "10.5",   providerMeta: {} },
    ]);
  });
});

describe("krakenAdapter.fetchTransactionsSince", () => {
  it("maps Kraken ledger entries and keeps the sign", async () => {
    stubFetch(() => jsonResponse(200, {
      error: [],
      result: {
        ledger: {
          "L1-ABC": { refid: "R1", time: 1_754_400_000, type: "deposit", aclass: "currency", asset: "ZUSD", amount: "500.00", fee: "0", balance: "500.00" },
          "L2-DEF": { refid: "R2", time: 1_754_486_400, type: "trade",   aclass: "currency", asset: "ZUSD", amount: "-100.50", fee: "0.25", balance: "399.25" },
        },
        count: 2,
      },
    }));
    const txs = await krakenAdapter.fetchTransactionsSince(
      validCred,
      { externalId: "ZUSD", label: "Kraken (USD)", currency: "USD", balance: "0", providerMeta: {} },
      new Date("2026-07-01"),
    );
    expect(txs).toHaveLength(2);
    const byId = Object.fromEntries(txs.map((t) => [t.externalId, t]));
    expect(byId["L1-ABC"]).toMatchObject({ description: "deposit (R1)", nativeAmount: "500.00", currency: "USD" });
    expect(byId["L2-DEF"]).toMatchObject({ description: "trade (R2)", nativeAmount: "-100.50", currency: "USD" });
  });

  it("throws AdapterError on Kraken's rate-limit error string", async () => {
    stubFetch(() => jsonResponse(200, { error: ["EGeneral:Temporary lockout"], result: null }));
    await expect(
      krakenAdapter.fetchTransactionsSince(
        validCred,
        { externalId: "ZUSD", label: "Kraken (USD)", currency: "USD", balance: "0", providerMeta: {} },
        new Date(),
      ),
    ).rejects.toMatchObject({ kind: "rate_limit" });
  });
});
