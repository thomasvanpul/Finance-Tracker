// Shared circuit breaker + health registry for market data providers.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// Today's Yahoo-only quote path fails silently: a 429 or a 500 lands in
// logger.warn, the ticker is omitted from the response, and the only signal
// that Yahoo has broadly stopped responding is "every quote is missing." The
// same failure mode was diagnosed once for OAuth by adding `callbackBase` to
// /api/auth-providers so a redirect_uri mismatch could be read directly. This
// module gives the same treatment to market data: every provider registers,
// every call flows through withProvider(), and /api/market/providers exposes
// which lane is open, which is cooling down, and why.
//
// ── Circuit breaker ─────────────────────────────────────────────────────────
// After 3 consecutive failures, the breaker opens for 60 seconds. During the
// open window the wrapper throws immediately without calling the underlying
// provider — that's the whole point, we stop burning latency on a lane we
// already know is dead. First call after cooldown is a "half-open" probe: if
// it succeeds, the breaker closes and the failure counter resets; if it
// fails, we cool down again.
//
// N=3 chosen over 5: at 60s cooldown, 3 failures ≈ 6-10s of wasted retries
// before the lane goes dormant. 5 would be 10-20s. For a per-request path on
// a warm endpoint, 6-10s is the ceiling we can absorb before the user notices
// the whole page has stalled.
//
// ── Credit budget ───────────────────────────────────────────────────────────
// Some providers (Twelve Data on free) enforce a daily credit ceiling. The
// budgeter here tracks consumption and refuses NEW calls once the daily cap
// minus a small buffer is hit — running out at 4pm every day is worse than a
// slower refresh from 9am. The buffer exists because two callers can race
// past the check simultaneously; we'd rather stop at 750/800 and know we're
// safe than land at 802/800 and eat a 24h ban.

import { logger } from "./logger";

export type BreakerState = "closed" | "open" | "half";

interface ProviderState {
  name: string;
  configured: boolean;
  breaker: BreakerState;
  consecutiveFailures: number;
  cooldownUntil: number | null;
  lastOk: string | null;
  lastError: { message: string; ts: string } | null;
  // Optional daily credit tracking. Null means the provider is not
  // credit-limited and requestsToday is informational only.
  creditsUsedToday: number;
  creditsBudget: number | null;
  // Epoch ms when the daily counter should reset. Recomputed on the
  // first call each new UTC day rather than a timer to avoid a
  // background job in a request-lifecycle process.
  creditsResetAt: number;
  // Rolling per-minute counter for hard rate limits (Polygon free = 5/min).
  // Not exposed on health endpoint — internal to withMinuteBudget.
  minuteWindowStart: number;
  minuteRequests: number;
}

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 60_000;

const providers = new Map<string, ProviderState>();

// UTC midnight timestamp used to schedule the credit reset. Recomputed on
// each check so a long-lived process rolls over correctly.
function nextUtcMidnight(from = Date.now()): number {
  const d = new Date(from);
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

export function registerProvider(opts: {
  name: string;
  configured: boolean;
  creditsBudget?: number | null;
}): void {
  const existing = providers.get(opts.name);
  if (existing) {
    // Re-registration updates the mutable "configured" and budget fields
    // without wiping runtime state. Adapters call this at module load.
    existing.configured = opts.configured;
    existing.creditsBudget = opts.creditsBudget ?? null;
    return;
  }
  providers.set(opts.name, {
    name: opts.name,
    configured: opts.configured,
    breaker: "closed",
    consecutiveFailures: 0,
    cooldownUntil: null,
    lastOk: null,
    lastError: null,
    creditsUsedToday: 0,
    creditsBudget: opts.creditsBudget ?? null,
    creditsResetAt: nextUtcMidnight(),
    minuteWindowStart: Date.now(),
    minuteRequests: 0,
  });
}

export class ProviderUnavailableError extends Error {
  constructor(public providerName: string, public reason: string) {
    super(`provider ${providerName} unavailable: ${reason}`);
    this.name = "ProviderUnavailableError";
  }
}

export class CreditBudgetExhaustedError extends Error {
  constructor(public providerName: string, public used: number, public budget: number) {
    super(`${providerName} daily credit budget exhausted: ${used}/${budget}`);
    this.name = "CreditBudgetExhaustedError";
  }
}

function maybeResetCredits(state: ProviderState, now: number): void {
  if (now >= state.creditsResetAt) {
    state.creditsUsedToday = 0;
    state.creditsResetAt = nextUtcMidnight(now);
  }
}

function maybeCloseBreaker(state: ProviderState, now: number): void {
  if (state.breaker === "open" && state.cooldownUntil !== null && now >= state.cooldownUntil) {
    // Transition to half-open: the next call is the probe. We don't
    // reset consecutiveFailures until the probe succeeds — a failing
    // probe should reopen the breaker immediately, not decrement.
    state.breaker = "half";
    logger.info({ provider: state.name }, "provider circuit half-open (cooldown elapsed, probing)");
  }
}

/**
 * Wrap a provider call. Enforces the circuit breaker and, if a credit budget
 * is set, deducts `credits` from the daily budget BEFORE the call so that a
 * request that fails on the wire still counts (the provider billed us). If
 * the failure was pre-flight (breaker open, budget exhausted, missing key),
 * it doesn't count.
 */
export async function withProvider<T>(
  providerName: string,
  fn: () => Promise<T>,
  opts: { credits?: number; requireConfigured?: boolean } = {},
): Promise<T> {
  const state = providers.get(providerName);
  if (!state) {
    throw new ProviderUnavailableError(providerName, "not registered");
  }
  const now = Date.now();
  maybeResetCredits(state, now);
  maybeCloseBreaker(state, now);

  if ((opts.requireConfigured ?? true) && !state.configured) {
    throw new ProviderUnavailableError(providerName, "not configured (missing env key)");
  }
  if (state.breaker === "open") {
    throw new ProviderUnavailableError(providerName, "circuit open");
  }
  const credits = opts.credits ?? 0;
  if (state.creditsBudget !== null && credits > 0) {
    // Buffer: stop at 95% of budget so races or the odd late-arriving
    // request cannot push us past the ceiling. The buffer is intentional
    // slack, not a mistake — see header note.
    const softCap = Math.floor(state.creditsBudget * 0.95);
    if (state.creditsUsedToday + credits > softCap) {
      throw new CreditBudgetExhaustedError(providerName, state.creditsUsedToday, state.creditsBudget);
    }
    state.creditsUsedToday += credits;
  }

  try {
    const result = await fn();
    // Success: half-open probes close the circuit; closed circuits reset
    // their failure counter. Both cases record lastOk.
    state.breaker = "closed";
    state.consecutiveFailures = 0;
    state.cooldownUntil = null;
    state.lastOk = new Date().toISOString();
    return result;
  } catch (err) {
    state.consecutiveFailures += 1;
    state.lastError = {
      message: err instanceof Error ? err.message : String(err),
      ts: new Date().toISOString(),
    };
    if (state.consecutiveFailures >= FAILURE_THRESHOLD) {
      state.breaker = "open";
      state.cooldownUntil = Date.now() + COOLDOWN_MS;
      logger.warn(
        { provider: providerName, failures: state.consecutiveFailures, cooldownMs: COOLDOWN_MS },
        "provider circuit opened",
      );
    }
    throw err;
  }
}

export interface ProviderHealthSnapshot {
  name: string;
  configured: boolean;
  breaker: BreakerState;
  consecutiveFailures: number;
  cooldownUntil: string | null;
  lastOk: string | null;
  lastError: { message: string; ts: string } | null;
  creditsUsedToday: number;
  creditsBudget: number | null;
  creditsResetAt: string;
}

export function getProviderHealth(): ProviderHealthSnapshot[] {
  const now = Date.now();
  const out: ProviderHealthSnapshot[] = [];
  for (const state of providers.values()) {
    // Reset before reporting so the health endpoint doesn't lie about a
    // still-open circuit whose cooldown has passed.
    maybeResetCredits(state, now);
    maybeCloseBreaker(state, now);
    out.push({
      name: state.name,
      configured: state.configured,
      breaker: state.breaker,
      consecutiveFailures: state.consecutiveFailures,
      cooldownUntil: state.cooldownUntil !== null ? new Date(state.cooldownUntil).toISOString() : null,
      lastOk: state.lastOk,
      lastError: state.lastError,
      creditsUsedToday: state.creditsUsedToday,
      creditsBudget: state.creditsBudget,
      creditsResetAt: new Date(state.creditsResetAt).toISOString(),
    });
  }
  // Deterministic order for the endpoint: alphabetical by name. Client
  // may sort differently but this makes the JSON diff-friendly.
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// Test helper: reset runtime state (breaker, credits, lastOk/lastError)
// per registered provider without unregistering. Unregistering would
// invalidate the module-load registrations in market.ts and every
// subsequent withProvider() call would throw "not registered". Never
// called by production code.
export function __resetProviderHealthForTesting(): void {
  const now = Date.now();
  for (const state of providers.values()) {
    state.breaker = "closed";
    state.consecutiveFailures = 0;
    state.cooldownUntil = null;
    state.lastOk = null;
    state.lastError = null;
    state.creditsUsedToday = 0;
    state.creditsResetAt = nextUtcMidnight(now);
    state.minuteWindowStart = now;
    state.minuteRequests = 0;
  }
}
