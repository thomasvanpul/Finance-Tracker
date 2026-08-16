// Alpaca adapter — per-user broker account access.
//
// This is the connection-model side of Alpaca. The market-data streaming
// path (lib/alpaca-stream.ts) still runs on the server-wide
// ALPACA_KEY_ID / ALPACA_SECRET_KEY env vars because it's a shared feed
// (IEX prices are free for any Alpaca account, and running N streams to
// serve N users is a different architectural problem). Per-user account
// data — cash, positions, orders — comes through this adapter.
//
// Credential shape: JSON { "keyId": "...", "secret": "..." }. Wise sends
// a bare token; from Alpaca onward we JSON-encode multi-part
// credentials into the single `credential` string that
// ProviderAdapter.validateCredential accepts. The interface stays
// string; only the meaning bends. See the report at commit time for
// why we chose this over widening the API surface.

import type {
  ProviderAdapter,
  AdapterAccount,
  AdapterTransaction,
  ValidationResult,
} from "./types";
import { AdapterError } from "./types";

const ALPACA_ENV = process.env.ALPACA_ENV ?? "live";
const TRADING_BASE_URL =
  ALPACA_ENV === "paper"
    ? "https://paper-api.alpaca.markets"
    : "https://api.alpaca.markets";

interface AlpacaCredential {
  keyId: string;
  secret: string;
}

interface AlpacaAccount {
  id: string;
  account_number: string;
  currency: string;
  cash: string;
  equity: string;
  status: string;
}

interface AlpacaActivity {
  id: string;
  activity_type: string; // FILL | DIV | ...
  transaction_time?: string;
  date?: string;
  symbol?: string;
  side?: "buy" | "sell";
  qty?: string;
  price?: string;
  net_amount?: string;
  description?: string;
}

function parseCredential(raw: string): AlpacaCredential {
  try {
    const p = JSON.parse(raw);
    if (typeof p.keyId !== "string" || typeof p.secret !== "string") {
      throw new AdapterError("invalid_response", "Alpaca credential missing keyId/secret");
    }
    return { keyId: p.keyId, secret: p.secret };
  } catch (err) {
    if (err instanceof AdapterError) throw err;
    throw new AdapterError("invalid_response", "Alpaca credential is not valid JSON");
  }
}

async function alpacaFetch<T>(
  cred: AlpacaCredential,
  path: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${TRADING_BASE_URL}${path}`, {
      headers: {
        "APCA-API-KEY-ID": cred.keyId,
        "APCA-API-SECRET-KEY": cred.secret,
        Accept: "application/json",
      },
    });
  } catch (err) {
    throw new AdapterError(
      "network",
      err instanceof Error ? err.message : "network failure calling Alpaca",
    );
  }
  if (res.status === 401 || res.status === 403) {
    // Never log the response body here — Alpaca sometimes echoes headers.
    throw new AdapterError("auth", "Alpaca rejected the key/secret");
  }
  if (res.status === 429) {
    throw new AdapterError("rate_limit", "Alpaca rate limit hit");
  }
  if (!res.ok) {
    throw new AdapterError(
      res.status >= 500 ? "provider" : "invalid_response",
      `Alpaca API error ${res.status} on ${path}`,
    );
  }
  return res.json() as Promise<T>;
}

export const alpacaAdapter: ProviderAdapter = {
  provider: "alpaca",

  async validateCredential(credential: string): Promise<ValidationResult> {
    let cred: AlpacaCredential;
    try {
      cred = parseCredential(credential);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "invalid credential" };
    }
    try {
      const acct = await alpacaFetch<AlpacaAccount>(cred, "/v2/account");
      const label = acct.account_number
        ? `Alpaca ${acct.account_number}`
        : `Alpaca (${acct.currency})`;
      return { ok: true, label };
    } catch (err) {
      if (err instanceof AdapterError) return { ok: false, error: err.message };
      return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  },

  async listAccounts(credential: string): Promise<AdapterAccount[]> {
    const cred = parseCredential(credential);
    const acct = await alpacaFetch<AlpacaAccount>(cred, "/v2/account");
    // Alpaca has one primary trading account per key. We surface it as a
    // single account whose balance is the cash figure. Equity vs cash is
    // an intentional choice: cash is the money-available-to-move number
    // most callers of an account balance actually want. Positions become
    // separate first-class rows when a positions adapter method exists;
    // today the account itself is the row.
    return [
      {
        externalId: acct.id,
        label: `Alpaca ${acct.account_number ?? ""}`.trim(),
        currency: acct.currency,
        balance: acct.cash,
        providerMeta: { equity: acct.equity, status: acct.status },
      },
    ];
  },

  async fetchTransactionsSince(
    credential: string,
    _account: AdapterAccount,
    since: Date,
  ): Promise<AdapterTransaction[]> {
    const cred = parseCredential(credential);
    // /v2/account/activities?after=<date>&activity_types=FILL,DIV
    // Alpaca's activities include fills, dividends, transfers, fees.
    // FILL alone gives trades; add DIV for dividend receipts.
    const params = new URLSearchParams({
      after: since.toISOString(),
      activity_types: "FILL,DIV",
      direction: "desc",
      page_size: "100",
    });
    const acts = await alpacaFetch<AlpacaActivity[]>(
      cred,
      `/v2/account/activities?${params}`,
    );
    return acts
      .filter((a) => a.net_amount != null && (a.transaction_time || a.date))
      .map((a) => {
        // FILL activities have net_amount that's already signed (buy = negative).
        // DIV activities are positive income.
        const date = a.transaction_time ?? `${a.date}T00:00:00Z`;
        const desc =
          a.activity_type === "FILL"
            ? `${a.side?.toUpperCase() ?? "TRADE"} ${a.qty ?? ""} ${a.symbol ?? ""}`.trim()
            : a.activity_type === "DIV"
              ? `Dividend ${a.symbol ?? ""}`.trim()
              : a.description ?? a.activity_type;
        return {
          externalId: a.id,
          date,
          description: desc,
          nativeAmount: String(a.net_amount!),
          currency: "USD",
        };
      });
  },
};
