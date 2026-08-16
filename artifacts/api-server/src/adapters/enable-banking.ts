// Enable Banking adapter — pan-European open banking behind one interface.
//
// Enable Banking is the recommended path for EU/UK indie work after
// GoCardless closed to new signups (see docs/OPEN-BANKING.md). Their
// Restricted Production tier fits this project's shape exactly today:
// one user, own accounts, real data, no company, no cost.
//
// This adapter differs from Wise/Alpaca/Kraken in one important way:
// there is NO user-pasted credential. The user picks a bank (ASPSP)
// from Enable Banking's catalogue, is redirected to the bank's own
// login, and comes back with a session identifier. That session id IS
// the credential we encrypt at rest. The consent-start and
// consent-callback endpoints live in routes/enable-banking.ts; this
// file implements the ProviderAdapter methods that run after a
// session already exists.
//
// Credential shape: JSON { "sessionId": "...", "validUntil": "ISO8601" }
//
// Session lifecycle:
//   1. valid_until is set by us at consent start (up to 180 days for
//      most banks; Enable Banking caps this per-ASPSP via the
//      maximum_consent_validity field).
//   2. Enable Banking abstracts the banks' short-lived access tokens
//      internally, so we do NOT implement OAuth refresh.
//   3. When valid_until passes, sync starts returning auth errors;
//      the user re-runs the consent flow. See docs/H4-ENABLE-BANKING.md
//      for the operational story.
//
// App authentication to Enable Banking is a JWT bearer signed with
// the application's private key (RS256). Config comes from env:
//   ENABLE_BANKING_APP_ID        — application UUID (from the portal)
//   ENABLE_BANKING_PRIVATE_KEY   — RS256 private key PEM (from the portal)
//   ENABLE_BANKING_REDIRECT_URL  — callback URL registered in the portal
//
// Without an Enable Banking application, the adapter refuses to boot
// its methods — validateCredential returns { ok: false } with a
// message pointing at docs/H4-ENABLE-BANKING.md.

import { createSign, randomUUID } from "node:crypto";
import type {
  ProviderAdapter,
  AdapterAccount,
  AdapterTransaction,
  ValidationResult,
} from "./types";
import { AdapterError } from "./types";

const BASE_URL = process.env.ENABLE_BANKING_BASE_URL ?? "https://api.enablebanking.com";

interface StoredCredential {
  sessionId: string;
  validUntil?: string;
}

interface EBSession {
  session_id: string;
  aspsp?: { name: string; country: string };
  accounts?: EBAccount[];
  access?: { valid_until?: string };
}

interface EBAccount {
  uid: string;
  currency: string;
  name?: string;
  product?: string;
  cash_account_type?: string;
  usage?: string;
  identification?: { iban?: string };
}

interface EBBalance {
  balance_amount: { amount: string; currency: string };
  balance_type: string; // "AVAILABLE" | "INTERIM_AVAILABLE" | "CLOSING_BOOKED" | ...
}

interface EBBalancesResponse {
  balances: EBBalance[];
}

interface EBTransaction {
  entry_reference?: string;
  transaction_id?: string;
  booking_date?: string;
  value_date?: string;
  transaction_date?: string;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator: "CRDT" | "DBIT";
  remittance_information?: string[];
  creditor_name?: string;
  debtor_name?: string;
  additional_information?: string;
}

interface EBTransactionsResponse {
  transactions: EBTransaction[];
  continuation_key?: string;
}

function loadAppConfig(): { appId: string; privateKeyPem: string } {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const privateKeyPem = process.env.ENABLE_BANKING_PRIVATE_KEY;
  if (!appId || !privateKeyPem) {
    throw new AdapterError(
      "provider",
      "Enable Banking is not configured. Set ENABLE_BANKING_APP_ID and " +
        "ENABLE_BANKING_PRIVATE_KEY on the api-server. See " +
        "docs/H4-ENABLE-BANKING.md.",
    );
  }
  return { appId, privateKeyPem };
}

// Base64url without padding, as JWT requires.
function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// RS256 JWT for Enable Banking's application authentication.
// Header includes `kid` = app UUID (Enable Banking's convention).
// Payload includes `iss` = app UUID, `iat`, `exp` (short-lived), `jti`.
export function signEnableBankingJwt(): string {
  const { appId, privateKeyPem } = loadAppConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", kid: appId, typ: "JWT" };
  const payload = {
    iss: appId,
    jti: randomUUID(),
    iat: now,
    exp: now + 300, // 5 minutes; refresh on every call
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKeyPem);
  return `${signingInput}.${b64url(signature)}`;
}

async function ebFetch<T>(
  path: string,
  init: RequestInit & { skipAppAuth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined ?? {}),
  };
  if (!init.skipAppAuth) {
    headers["Authorization"] = `Bearer ${signEnableBankingJwt()}`;
  }
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  } catch (err) {
    throw new AdapterError(
      "network",
      err instanceof Error ? err.message : "network failure calling Enable Banking",
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new AdapterError("auth", "Enable Banking rejected the session or app credential");
  }
  if (res.status === 429) {
    throw new AdapterError("rate_limit", "Enable Banking rate limit hit");
  }
  if (!res.ok) {
    throw new AdapterError(
      res.status >= 500 ? "provider" : "invalid_response",
      `Enable Banking ${res.status} on ${path}`,
    );
  }
  return res.json() as Promise<T>;
}

function parseCredential(raw: string): StoredCredential {
  try {
    const p = JSON.parse(raw);
    if (typeof p.sessionId !== "string") {
      throw new AdapterError("invalid_response", "Enable Banking credential missing sessionId");
    }
    return { sessionId: p.sessionId, validUntil: typeof p.validUntil === "string" ? p.validUntil : undefined };
  } catch (err) {
    if (err instanceof AdapterError) throw err;
    throw new AdapterError("invalid_response", "Enable Banking credential is not valid JSON");
  }
}

// Exported for routes/enable-banking.ts. Wraps the session-lookup call
// so the consent-callback route can turn a fresh session_id into a
// stored credential (validUntil surfaces from the session's access.valid_until).
export async function getSession(sessionId: string): Promise<EBSession> {
  return ebFetch<EBSession>(`/sessions/${sessionId}`);
}

// Exported for the consent-start route. `redirectUrl` MUST match the URL
// registered in the Enable Banking portal for this app.
export async function startAuth(params: {
  aspsp: { name: string; country: string };
  redirectUrl: string;
  state: string;
  validUntil: string; // ISO date
  psuType?: "personal" | "business";
}): Promise<{ url: string; authorization_id?: string }> {
  return ebFetch<{ url: string; authorization_id?: string }>("/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access: { valid_until: params.validUntil, accounts: null },
      aspsp: params.aspsp,
      state: params.state,
      redirect_url: params.redirectUrl,
      psu_type: params.psuType ?? "personal",
    }),
  });
}

// Exported for the consent-callback route.
export async function exchangeCodeForSession(code: string): Promise<EBSession> {
  return ebFetch<EBSession>("/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

function dateOnlyISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Pick a single "current balance" figure from Enable Banking's set.
// AVAILABLE and INTERIM_AVAILABLE are the standing spot balance in
// EB's model; CLOSING_BOOKED is the previous-day close. We prefer the
// available balance so the number reads the same as the user's bank
// UI would show them.
function pickBalance(balances: EBBalance[]): { amount: string; currency: string } | null {
  const order = ["INTERIM_AVAILABLE", "AVAILABLE", "CLOSING_BOOKED", "EXPECTED", "OPENING_BOOKED"];
  for (const t of order) {
    const b = balances.find((x) => x.balance_type === t);
    if (b) return b.balance_amount;
  }
  return balances[0]?.balance_amount ?? null;
}

export const enableBankingAdapter: ProviderAdapter = {
  provider: "enable-banking",

  async validateCredential(credential: string): Promise<ValidationResult> {
    let cred: StoredCredential;
    try {
      cred = parseCredential(credential);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "invalid credential" };
    }
    try {
      const session = await getSession(cred.sessionId);
      const label = session.aspsp?.name
        ? `${session.aspsp.name}${session.aspsp.country ? ` (${session.aspsp.country})` : ""}`
        : `Enable Banking session ${cred.sessionId.slice(0, 8)}`;
      return { ok: true, label };
    } catch (err) {
      if (err instanceof AdapterError) return { ok: false, error: err.message };
      return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  },

  async listAccounts(credential: string): Promise<AdapterAccount[]> {
    const cred = parseCredential(credential);
    const session = await getSession(cred.sessionId);
    const accts = session.accounts ?? [];
    // Fetch a balance snapshot per account. Enable Banking returns
    // multiple balance types per account; we pick one (see pickBalance).
    const out: AdapterAccount[] = [];
    for (const a of accts) {
      const bals = await ebFetch<EBBalancesResponse>(`/accounts/${a.uid}/balances`);
      const picked = pickBalance(bals.balances ?? []);
      out.push({
        externalId: a.uid,
        label: a.name ?? a.identification?.iban ?? `${session.aspsp?.name ?? "Account"} ${a.currency}`,
        currency: picked?.currency ?? a.currency,
        balance: picked?.amount ?? "0",
        providerMeta: {
          iban: a.identification?.iban ?? "",
          product: a.product ?? "",
          usage: a.usage ?? "",
        },
      });
    }
    return out;
  },

  async fetchTransactionsSince(
    credential: string,
    account: AdapterAccount,
    since: Date,
  ): Promise<AdapterTransaction[]> {
    parseCredential(credential); // validate shape; session-scope check below
    const params = new URLSearchParams({
      date_from: dateOnlyISO(since),
      date_to: dateOnlyISO(new Date()),
    });
    // Enable Banking paginates via continuation_key. Loop until empty.
    const all: EBTransaction[] = [];
    let cont: string | undefined;
    do {
      const url = `/accounts/${account.externalId}/transactions?${params}${cont ? `&continuation_key=${encodeURIComponent(cont)}` : ""}`;
      const page = await ebFetch<EBTransactionsResponse>(url);
      all.push(...(page.transactions ?? []));
      cont = page.continuation_key;
    } while (cont);
    return all
      .filter((t) => t.transaction_amount?.amount != null)
      .map((t) => {
        const signedAmount =
          t.credit_debit_indicator === "DBIT"
            ? `-${t.transaction_amount.amount.replace(/^-/, "")}`
            : t.transaction_amount.amount;
        const desc =
          t.creditor_name ??
          t.debtor_name ??
          t.remittance_information?.join(" ") ??
          t.additional_information ??
          "Transaction";
        return {
          externalId: t.transaction_id ?? t.entry_reference ?? `${t.booking_date}-${desc}-${signedAmount}`,
          date: t.transaction_date ?? t.booking_date ?? t.value_date ?? dateOnlyISO(new Date()),
          description: desc,
          nativeAmount: signedAmount,
          currency: t.transaction_amount.currency,
        };
      });
  },
};
