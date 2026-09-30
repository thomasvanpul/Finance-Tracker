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
// A half-open breaker admits exactly ONE call. It previously admitted every
// caller that arrived while the state was "half", which for a fan-out batch
// meant the whole batch: chainFetchPrices calls withProvider once per ticker
// and Promise.allSettles them, so a 15-ticker batch put 15 calls through a
// "probe" and recorded 15 failures. That is how Yahoo reached 77 consecutive
// failures within minutes on 2026-09-06 — the counter was measuring batch
// width, not elapsed outages, and each probe sent the provider a burst rather
// than the single request a probe is supposed to be.
//
// N=3 chosen over 5: at 60s cooldown, 3 failures ≈ 6-10s of wasted retries
// before the lane goes dormant. 5 would be 10-20s. For a per-request path on
// a warm endpoint, 6-10s is the ceiling we can absorb before the user notices
// the whole page has stalled.
//
// ── Why the cooldown escalates ───────────────────────────────────────────
// The cooldown was a flat 60s. Against a provider that is DOWN for seconds
// that is right — probe often, recover fast. Against a provider that is
// RATE-LIMITING US it is actively harmful: the half-open probe reopens into
// the same throttle, fails, and re-arms another flat 60s, forever. Measured
// on 2026-09-06, Yahoo's crumb bootstrap had been failing that way for days
// (`lastOk: null`), which means the flat cooldown was presenting Render's
// shared egress IP to Yahoo ~1,440 times a day and feeding the very throttle
// it was waiting out.
//
// So the cooldown doubles per consecutive re-open — 60s, 120s, 240s … capped
// at COOLDOWN_MAX_MS. A lane that is briefly down still recovers in a minute;
// a lane that is being throttled backs off to a 30-minute probe and stops
// being part of the problem. The escalation resets on the first success,
// because consecutiveFailures resets there.
//
// ── Credit budget ───────────────────────────────────────────────────────────
// Some providers (Twelve Data on free) enforce a daily credit ceiling. The
// budgeter here tracks consumption and refuses NEW calls once the daily cap
// minus a small buffer is hit — running out at 4pm every day is worse than a
// slower refresh from 9am. The buffer exists because two callers can race
// past the check simultaneously; we'd rather stop at 750/800 and know we're
// safe than land at 802/800 and eat a 24h ban.

import { logger } from "./logger";

// ── Durable mirror ───────────────────────────────────────────────────────
// Schema and full reasoning: lib/db/src/schema/provider-health.ts. Only the
// breaker-relevant fields are persisted (see that file for what is
// deliberately left out).
//
// Loaded via dynamic import, guarded on DATABASE_URL, rather than a static
// top-level `import { db } from "@workspace/db"`. This module is imported
// by plain unit tests (provider-health.test.ts, market-providers.test.ts,
// frankfurter-forex.test.ts, ai-providers/chain.test.ts, …) that run in the
// gate without a database, and @workspace/db throws at MODULE LOAD if
// DATABASE_URL is unset — a static import would take every one of those
// suites down with it. Mirrors the pattern in
// account-deletion.integration.test.ts, which dynamic-imports the same
// package for the same reason.
let dbModulePromise: Promise<typeof import("@workspace/db")> | null = null;
function getDbModule(): Promise<typeof import("@workspace/db")> | null {
  if (!process.env.DATABASE_URL) return null;
  dbModulePromise ??= import("@workspace/db");
  return dbModulePromise;
}

// Rate-limited so a genuinely broken DB doesn't fill the log with the same
// line on every provider call. Same discipline as request-metrics.ts.
let lastPersistWarnAt = 0;
const PERSIST_WARN_INTERVAL_MS = 60_000;
function warnPersistFailure(err: unknown): void {
  const now = Date.now();
  if (now - lastPersistWarnAt < PERSIST_WARN_INTERVAL_MS) return;
  lastPersistWarnAt = now;
  logger.warn(
    { err: err instanceof Error ? err.message : String(err) },
    "provider-health: persistence failed (subsequent failures suppressed for 60s)",
  );
}

interface PersistValues {
  name: string;
  breaker: BreakerState;
  consecutiveFailures: number;
  cooldownUntil: Date | null;
  lastOk: Date | null;
  lastErrorMessage: string | null;
  lastErrorAt: Date | null;
}

// Serializes writes per provider, one promise chain each, so concurrent
// breaker transitions on the SAME provider land in Postgres in the order
// they happened rather than whatever order their individual network
// round-trips finish in. This is not a hypothetical: a fan-out batch
// calling withProvider once per ticker (see the half-open note above)
// fires several failures on the same provider within the same tick, each
// queuing its own write. Without serializing, an EARLIER write (say,
// consecutiveFailures=1) that happens to take longer on the wire than a
// LATER one (consecutiveFailures=3) can complete last and silently
// overwrite the more current, more severe state with a stale one — which
// is exactly the evidence this table exists to keep. Measured hitting
// this directly: three failures fired in a tight loop against the real
// Neon dev branch, unserialized, persisted `breaker: "closed"` — the
// FIRST failure's snapshot — instead of "open".
const persistChains = new Map<string, Promise<void>>();

// Fire-and-forget from the caller's point of view. Persistence capture
// MUST NOT be able to fail or delay a provider call — same rule
// request-metrics.ts states for its insert. The snapshot itself,
// though, is taken SYNCHRONOUSLY, right here, before any await — not
// re-read later inside the async write, where a microtask-queue
// reordering could pick up a DIFFERENT mutation of the same shared,
// mutable state object than the one that triggered this call.
function persistState(name: string): void {
  const state = providers.get(name);
  if (!state) return;
  const values: PersistValues = {
    name,
    breaker: state.breaker,
    consecutiveFailures: state.consecutiveFailures,
    cooldownUntil: state.cooldownUntil !== null ? new Date(state.cooldownUntil) : null,
    lastOk: state.lastOk !== null ? new Date(state.lastOk) : null,
    lastErrorMessage: state.lastError?.message ?? null,
    lastErrorAt: state.lastError !== null ? new Date(state.lastError.ts) : null,
  };
  const prior = persistChains.get(name) ?? Promise.resolve();
  // .catch here, not on the outer chain: it must settle to fulfilled
  // (never stay rejected) so ONE failed write does not permanently wedge
  // every later write for this provider behind a rejected `prior`.
  const next = prior.then(() => persistValues(values)).catch(warnPersistFailure);
  persistChains.set(name, next);
}

async function persistValues(values: PersistValues): Promise<void> {
  const modPromise = getDbModule();
  if (!modPromise) return;
  const { db, providerHealthTable } = await modPromise;
  await db
    .insert(providerHealthTable)
    .values(values)
    .onConflictDoUpdate({
      target: providerHealthTable.name,
      set: { ...values, updatedAt: new Date() },
    });
}

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
  // True while a half-open probe is running. A half-open breaker must admit
  // exactly ONE call; see the note on half-open above.
  probeInFlight: boolean;
}

const FAILURE_THRESHOLD = 3;
const COOLDOWN_BASE_MS = 60_000;
const COOLDOWN_MAX_MS = 30 * 60_000;

// Cooldown for the Nth consecutive failure past the threshold. failures=3 is
// the first open (base), 4 doubles, 5 doubles again, and so on to the cap.
// Exported so the health endpoint and its tests read the same arithmetic
// rather than restating it.
export function cooldownForFailures(consecutiveFailures: number): number {
  const steps = Math.max(0, consecutiveFailures - FAILURE_THRESHOLD);
  // 2 ** steps overflows to Infinity long after the cap bites; clamp the
  // exponent first so the arithmetic stays finite for a lane that has been
  // dark for days.
  const capped = Math.min(steps, 20);
  return Math.min(COOLDOWN_BASE_MS * 2 ** capped, COOLDOWN_MAX_MS);
}

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
    probeInFlight: false,
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
  // Half-open admits one probe. Everyone else is refused for free — they
  // would otherwise turn a single probe into a whole batch against a lane we
  // already believe is dead.
  let isProbe = false;
  if (state.breaker === "half") {
    if (state.probeInFlight) {
      throw new ProviderUnavailableError(providerName, "circuit half-open (probe in flight)");
    }
    state.probeInFlight = true;
    isProbe = true;
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
    state.probeInFlight = false;
    state.lastOk = new Date().toISOString();
    persistState(providerName);
    return result;
  } catch (err) {
    if (isProbe) state.probeInFlight = false;
    state.consecutiveFailures += 1;
    state.lastError = {
      message: err instanceof Error ? err.message : String(err),
      ts: new Date().toISOString(),
    };
    if (state.consecutiveFailures >= FAILURE_THRESHOLD) {
      const cooldownMs = cooldownForFailures(state.consecutiveFailures);
      state.breaker = "open";
      state.cooldownUntil = Date.now() + cooldownMs;
      logger.warn(
        { provider: providerName, failures: state.consecutiveFailures, cooldownMs },
        "provider circuit opened",
      );
    }
    persistState(providerName);
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

// Called once at boot (index.ts), AFTER every registerProvider() call has
// already run — those happen as a module-load side effect in market.ts and
// ai-config.ts, which are imported (and therefore fully evaluated) before
// index.ts's top-level await reaches this call. Only overlays state onto
// providers that are ALREADY registered; a persisted row for a provider
// this build no longer registers is left alone rather than resurrected.
//
// Deliberately non-fatal: a failure here must not stop the server from
// booting and serving quotes, it just means evidence of the PREVIOUS
// outage (if any) starts over at this restart, same as before this
// table existed. index.ts should log and continue, not process.exit(1).
export async function hydrateProviderHealth(): Promise<void> {
  const modPromise = getDbModule();
  if (!modPromise) return;
  try {
    const { db, providerHealthTable } = await modPromise;
    const rows = await db.select().from(providerHealthTable);
    for (const row of rows) {
      const state = providers.get(row.name);
      if (!state) continue;
      state.breaker = row.breaker as BreakerState;
      state.consecutiveFailures = row.consecutiveFailures;
      state.cooldownUntil = row.cooldownUntil !== null ? row.cooldownUntil.getTime() : null;
      state.lastOk = row.lastOk !== null ? row.lastOk.toISOString() : null;
      state.lastError =
        row.lastErrorMessage !== null && row.lastErrorAt !== null
          ? { message: row.lastErrorMessage, ts: row.lastErrorAt.toISOString() }
          : null;
    }
    // A restored "open" breaker may have had its cooldown elapse while the
    // process was down. Route it through the same check every read already
    // goes through rather than duplicating the half-open transition here.
    const now = Date.now();
    for (const state of providers.values()) {
      maybeCloseBreaker(state, now);
    }
    logger.info({ restored: rows.length }, "provider health: restored from last known state");
  } catch (err) {
    warnPersistFailure(err);
  }
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
    state.probeInFlight = false;
  }
}
