// Kraken adapter — per-user crypto exchange account access.
//
// Kraken's REST API uses two-part credentials (API key + base64
// private key) with HMAC-SHA512 signing per request. This is more
// crypto than Wise or Alpaca; the signing lives in this file rather
// than lib/crypto.ts because it's provider-specific request signing,
// not credential-at-rest encryption.
//
// Credential shape: JSON { "apiKey": "...", "privateKey": "..." }
// where privateKey is the base64 string Kraken shows in the API
// settings page. The private key is NOT the credential-encryption key
// — it's Kraken's per-user HMAC secret.
//
// The endpoints we hit are all under /0/private/*, which require:
//   - API-Key header    = the api key
//   - API-Sign header   = base64(HMAC-SHA512(uripath || sha256(nonce||postdata), privateKey))
//   - body includes     = nonce=<microsecond epoch>&<other params>
//
// Kraken rate-limits at ~1 request per second for standard users and
// counts them in a decaying tier. We do at most 2 calls per sync
// (Balance + Ledgers), well inside the free budget.

import { createHmac, createHash } from "node:crypto";
import type {
  ProviderAdapter,
  AdapterAccount,
  AdapterTransaction,
  ValidationResult,
} from "./types";
import { AdapterError } from "./types";

const KRAKEN_BASE_URL = "https://api.kraken.com";

interface KrakenCredential {
  apiKey: string;
  privateKey: string;
}

interface KrakenBalanceResponse {
  error: string[];
  result?: Record<string, string>;
}

interface KrakenLedgerEntry {
  refid: string;
  time: number;   // unix seconds
  type: string;
  aclass: string;
  asset: string;
  amount: string;
  fee: string;
  balance: string;
}

interface KrakenLedgersResponse {
  error: string[];
  result?: {
    ledger: Record<string, KrakenLedgerEntry>;
    count: number;
  };
}

function parseCredential(raw: string): KrakenCredential {
  try {
    const p = JSON.parse(raw);
    if (typeof p.apiKey !== "string" || typeof p.privateKey !== "string") {
      throw new AdapterError("invalid_response", "Kraken credential missing apiKey/privateKey");
    }
    return { apiKey: p.apiKey, privateKey: p.privateKey };
  } catch (err) {
    if (err instanceof AdapterError) throw err;
    throw new AdapterError("invalid_response", "Kraken credential is not valid JSON");
  }
}

// Kraken's request signature. Documented at:
// https://docs.kraken.com/rest/#section/Authentication
function sign(uriPath: string, nonce: string, postData: string, privateKeyB64: string): string {
  const message = uriPath + createHash("sha256").update(nonce + postData).digest("binary");
  const key = Buffer.from(privateKeyB64, "base64");
  return createHmac("sha512", key).update(message, "binary").digest("base64");
}

async function krakenPrivate<T>(
  cred: KrakenCredential,
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const nonce = String(Date.now() * 1000);
  const body = new URLSearchParams({ nonce, ...params });
  const bodyStr = body.toString();
  const signature = sign(path, nonce, bodyStr, cred.privateKey);

  let res: Response;
  try {
    res = await fetch(`${KRAKEN_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "API-Key": cred.apiKey,
        "API-Sign": signature,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: bodyStr,
    });
  } catch (err) {
    throw new AdapterError(
      "network",
      err instanceof Error ? err.message : "network failure calling Kraken",
    );
  }
  if (res.status === 429) {
    throw new AdapterError("rate_limit", "Kraken rate limit hit");
  }
  if (!res.ok) {
    throw new AdapterError(
      res.status >= 500 ? "provider" : "invalid_response",
      `Kraken API error ${res.status} on ${path}`,
    );
  }
  // Kraken returns 200 with an error array on auth failure. Translate.
  const json = (await res.json()) as { error: string[]; result?: T };
  if (json.error && json.error.length > 0) {
    const msg = json.error.join("; ");
    if (/EAPI:Invalid key|EAPI:Invalid signature|EGeneral:Permission/i.test(msg)) {
      throw new AdapterError("auth", `Kraken auth failed: ${msg}`);
    }
    if (/ERate:|EGeneral:Temporary/i.test(msg)) {
      throw new AdapterError("rate_limit", `Kraken throttled: ${msg}`);
    }
    throw new AdapterError("provider", `Kraken: ${msg}`);
  }
  return json.result as T;
}

// Kraken uses its own asset naming (XXBT, ZUSD, ZEUR, XETH…). Peel
// the leading X/Z off legacy names and prefer the display symbol.
function displayAsset(krakenAsset: string): string {
  if (/^[XZ][A-Z]{3,4}$/.test(krakenAsset)) return krakenAsset.slice(1);
  return krakenAsset;
}

export const krakenAdapter: ProviderAdapter = {
  provider: "kraken",

  async validateCredential(credential: string): Promise<ValidationResult> {
    let cred: KrakenCredential;
    try {
      cred = parseCredential(credential);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "invalid credential" };
    }
    try {
      const balances = await krakenPrivate<Record<string, string>>(cred, "/0/private/Balance");
      const nonZero = Object.entries(balances ?? {}).filter(([_, v]) => parseFloat(v) > 0);
      const label = `Kraken · ${nonZero.length} asset${nonZero.length === 1 ? "" : "s"}`;
      return { ok: true, label };
    } catch (err) {
      if (err instanceof AdapterError) return { ok: false, error: err.message };
      return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  },

  async listAccounts(credential: string): Promise<AdapterAccount[]> {
    const cred = parseCredential(credential);
    const balances = await krakenPrivate<Record<string, string>>(cred, "/0/private/Balance");
    // One AdapterAccount per non-zero asset. The externalId is the raw
    // Kraken asset name (kept so ledger entries match).
    return Object.entries(balances ?? {})
      .filter(([_, amount]) => parseFloat(amount) !== 0)
      .map(([asset, amount]) => {
        const currency = displayAsset(asset);
        return {
          externalId: asset,
          label: `Kraken (${currency})`,
          currency,
          balance: amount,
          providerMeta: {},
        };
      });
  },

  async fetchTransactionsSince(
    credential: string,
    account: AdapterAccount,
    since: Date,
  ): Promise<AdapterTransaction[]> {
    const cred = parseCredential(credential);
    // Kraken uses seconds since epoch for `start`. asset filter keeps
    // the response small — one asset per account.
    const ledgers = await krakenPrivate<KrakenLedgersResponse["result"]>(
      cred,
      "/0/private/Ledgers",
      {
        asset: account.externalId,
        start: String(Math.floor(since.getTime() / 1000)),
        type: "all",
      },
    );
    if (!ledgers?.ledger) return [];
    const currency = displayAsset(account.externalId);
    return Object.entries(ledgers.ledger).map(([id, e]) => ({
      externalId: id,
      // Convert Kraken's unix seconds (may be float with subsecond
      // precision) to ISO 8601 for the AdapterTransaction contract.
      date: new Date(e.time * 1000).toISOString(),
      description: `${e.type}${e.refid ? ` (${e.refid})` : ""}`,
      // Kraken amounts are signed; keep the sign.
      nativeAmount: e.amount,
      currency,
    }));
  },
};
