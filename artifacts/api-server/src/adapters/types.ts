// Provider adapter shape. Designed against what Wise actually needs — if a
// future adapter (open banking, Alpaca, Coinbase) requires an opaque cursor
// or a webhook rather than a date-window pull, widen the interface then. Do
// not guess an abstraction ahead of a second concrete implementation.
//
// Every method takes the plaintext credential explicitly. The credential
// lives on the caller's stack for the duration of the call and is never
// stored on the adapter; the adapter is a pure function of (credential,
// arguments) so a stateless adapter is easier to reason about and easier
// to test.

export interface AdapterAccount {
  // Provider-native identifier — persisted alongside our own row so the
  // next sync can match. Format is adapter-specific (Wise uses the
  // balance id as a number, we string it here for the DB).
  externalId: string;
  // Human label the adapter suggests. Callers may override.
  label: string;
  currency: string;
  // Native-currency balance, formatted as a decimal string with as much
  // precision as the provider gives us. String rather than number so the
  // caller can store it in a numeric column without float loss.
  balance: string;
  // Provider-specific metadata the caller might need to keep hold of
  // for the next request (e.g. Wise's profile id per balance). Opaque
  // to anyone outside the adapter.
  providerMeta: Record<string, string>;
}

export interface AdapterTransaction {
  externalId: string;
  // ISO 8601, provider-supplied.
  date: string;
  description: string;
  // Signed decimal string — negative for outflows, positive for inflows.
  nativeAmount: string;
  currency: string;
}

export type ValidationResult =
  | { ok: true; label: string }
  | { ok: false; error: string };

// A typed failure surface. Throwing rather than returning so async control
// flow stays flat, and each error carries a `kind` so callers can decide
// whether to retry, mark the connection errored, or surface a message.
export type AdapterErrorKind =
  | "auth"           // credential is wrong / revoked
  | "rate_limit"     // provider asked us to back off
  | "network"        // TCP/DNS/timeout
  | "provider"       // 5xx or otherwise a provider-side failure
  | "invalid_response"; // provider returned something we cannot parse

export class AdapterError extends Error {
  constructor(public kind: AdapterErrorKind, message: string) {
    super(message);
    this.name = "AdapterError";
  }
}

export interface ProviderAdapter {
  provider: string;

  // Verifies the credential works against the live provider. Returns a
  // display label (e.g. the personal-profile full name) on success so
  // the connection row can be labelled without a second call.
  validateCredential(credential: string): Promise<ValidationResult>;

  // Lists every top-level account/balance the credential can see.
  listAccounts(credential: string): Promise<AdapterAccount[]>;

  // Returns transactions on `account` at or after `since`. Wise-style
  // date windows for now; if a future adapter uses opaque cursors this
  // signature widens.
  fetchTransactionsSince(
    credential: string,
    account: AdapterAccount,
    since: Date,
  ): Promise<AdapterTransaction[]>;
}
