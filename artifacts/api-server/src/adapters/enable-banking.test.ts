// Enable Banking tests. Anything that hits the real API is left for
// integration once an app exists; here we cover what does not need a
// live account: JWT header/payload shape, credential parsing, missing
// env config surfaces a clear error, response mapping.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { enableBankingAdapter, signEnableBankingJwt } from "./enable-banking";
import { AdapterError } from "./types";

const originalFetch = globalThis.fetch;

function stubFetch(handler: (url: string, init?: RequestInit) => Response): void {
  globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url, init);
  }) as unknown as typeof fetch;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const APP_ID = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  process.env.ENABLE_BANKING_APP_ID = APP_ID;
  process.env.ENABLE_BANKING_PRIVATE_KEY = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("signEnableBankingJwt", () => {
  it("emits a three-part JWT with header + payload + RS256 signature", () => {
    const jwt = signEnableBankingJwt();
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);
    const header = JSON.parse(Buffer.from(parts[0]!, "base64").toString("utf8"));
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64").toString("utf8"));
    expect(header).toMatchObject({ alg: "RS256", typ: "JWT", kid: APP_ID });
    expect(payload).toMatchObject({ iss: APP_ID });
    expect(payload.iat).toBeTypeOf("number");
    expect(payload.exp).toBeGreaterThan(payload.iat);
    // Signature verifies with the corresponding public key.
    const { createVerify } = require("node:crypto");
    const v = createVerify("RSA-SHA256");
    v.update(`${parts[0]}.${parts[1]}`);
    v.end();
    // Add padding back for base64url signature.
    const sigB64 = parts[2]!.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((parts[2]!.length + 3) % 4);
    expect(v.verify(publicKey.export({ type: "spki", format: "pem" }), sigB64, "base64")).toBe(true);
  });

  it("throws a clear AdapterError when the app config is missing", () => {
    process.env.ENABLE_BANKING_APP_ID = "";
    process.env.ENABLE_BANKING_PRIVATE_KEY = "";
    expect(() => signEnableBankingJwt()).toThrow(AdapterError);
    try {
      signEnableBankingJwt();
    } catch (e) {
      if (e instanceof AdapterError) {
        expect(e.kind).toBe("provider");
        expect(e.message).toMatch(/ENABLE_BANKING_APP_ID/);
      } else {
        throw e;
      }
    }
  });
});

describe("enableBankingAdapter.validateCredential", () => {
  it("rejects credential JSON without a sessionId", async () => {
    const r = await enableBankingAdapter.validateCredential(JSON.stringify({ nope: 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/missing sessionId/);
  });

  it("labels the connection with the ASPSP name on success", async () => {
    stubFetch((url) => {
      expect(url).toMatch(/\/sessions\/sess-1$/);
      return jsonResponse(200, {
        session_id: "sess-1",
        aspsp: { name: "Test Bank", country: "GB" },
        accounts: [],
      });
    });
    const r = await enableBankingAdapter.validateCredential(JSON.stringify({ sessionId: "sess-1" }));
    expect(r).toEqual({ ok: true, label: "Test Bank (GB)" });
  });

  it("returns auth error when Enable Banking 401s", async () => {
    stubFetch(() => jsonResponse(401, { error: "internal EB text" }));
    const r = await enableBankingAdapter.validateCredential(JSON.stringify({ sessionId: "sess-x" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("Enable Banking rejected the session or app credential");
      expect(r.error).not.toContain("internal EB text");
    }
  });
});

describe("enableBankingAdapter.listAccounts", () => {
  it("hydrates each session account with a picked balance", async () => {
    const calls: string[] = [];
    stubFetch((url) => {
      calls.push(url);
      if (url.endsWith("/sessions/sess-1")) {
        return jsonResponse(200, {
          session_id: "sess-1",
          aspsp: { name: "Test Bank", country: "GB" },
          accounts: [
            { uid: "acc-A", currency: "GBP", name: "Current" },
            { uid: "acc-B", currency: "EUR", identification: { iban: "IE12BOFI9000..." } },
          ],
        });
      }
      if (url.endsWith("/accounts/acc-A/balances")) {
        return jsonResponse(200, {
          balances: [
            { balance_amount: { amount: "-42.50", currency: "GBP" }, balance_type: "CLOSING_BOOKED" },
            { balance_amount: { amount: "100.00", currency: "GBP" }, balance_type: "INTERIM_AVAILABLE" },
          ],
        });
      }
      if (url.endsWith("/accounts/acc-B/balances")) {
        return jsonResponse(200, {
          balances: [{ balance_amount: { amount: "250.00", currency: "EUR" }, balance_type: "AVAILABLE" }],
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    const accts = await enableBankingAdapter.listAccounts(JSON.stringify({ sessionId: "sess-1" }));
    expect(accts).toEqual([
      { externalId: "acc-A", label: "Current", currency: "GBP", balance: "100.00",
        providerMeta: { iban: "", product: "", usage: "" } },
      { externalId: "acc-B", label: "IE12BOFI9000...", currency: "EUR", balance: "250.00",
        providerMeta: { iban: "IE12BOFI9000...", product: "", usage: "" } },
    ]);
    expect(calls).toHaveLength(3);
  });
});

describe("enableBankingAdapter.fetchTransactionsSince", () => {
  it("maps EB transactions, signs debits negative, pages via continuation_key", async () => {
    let call = 0;
    stubFetch(() => {
      call += 1;
      if (call === 1) {
        return jsonResponse(200, {
          transactions: [
            { transaction_id: "T1", booking_date: "2026-08-05", transaction_date: "2026-08-05",
              transaction_amount: { amount: "42.50", currency: "GBP" },
              credit_debit_indicator: "DBIT", creditor_name: "Coffee Shop" },
          ],
          continuation_key: "PAGE2",
        });
      }
      return jsonResponse(200, {
        transactions: [
          { entry_reference: "T2", booking_date: "2026-08-06", transaction_amount: { amount: "1000.00", currency: "GBP" },
            credit_debit_indicator: "CRDT", remittance_information: ["Salary Aug"] },
        ],
      });
    });
    const txs = await enableBankingAdapter.fetchTransactionsSince(
      JSON.stringify({ sessionId: "sess-1" }),
      { externalId: "acc-A", label: "Current", currency: "GBP", balance: "0", providerMeta: {} },
      new Date("2026-08-01"),
    );
    expect(txs).toEqual([
      { externalId: "T1", date: "2026-08-05", description: "Coffee Shop", nativeAmount: "-42.50", currency: "GBP" },
      { externalId: "T2", date: "2026-08-06", description: "Salary Aug", nativeAmount: "1000.00", currency: "GBP" },
    ]);
    expect(call).toBe(2);
  });
});
