// Offline-cache invariant locks.
//
// Two things carry the weight of the read-path work; test them both:
//
//   1. The blacklist actually excludes market/AI/auth queries. A future
//      "let's just persist everything, gcTime handles it" edit would
//      quietly serve stale market quotes as if they were fresh — the
//      same defect the market stale-serve tier already guards against,
//      landing in a different place.
//
//   2. Shared expenses get the shorter fresh window. A settlement
//      status is another person's action, and the current cadence is
//      the load-bearing design choice.

import { describe, it, expect } from "vitest";
import {
  queryPersister,
  isBlacklistedForTests,
  isBannedCacheValue,
  staleTimeFor,
  isSharedExpenseQuery,
  FRESH_MS_SHARED,
  FRESH_MS_USER_DATA,
  FRESH_MS_MARKET,
} from "./offline-cache";

// The persister's `filters.predicate` runs on Query-shaped inputs. We
// only reach for queryKey, so a minimal stand-in works and stays
// insulated from query-core version drift.
function mockQuery(url: string): {
  queryKey: readonly unknown[];
  state: { status: string; data?: unknown };
} {
  return { queryKey: [url], state: { status: "success", data: { ok: true } } };
}

describe("offline-cache · persister shape", () => {
  it("uses experimental_createQueryPersister and exposes persisterFn", () => {
    // Sanity: prove the persister is the experimental_createQueryPersister
    // shape rather than a stub. If this changes, downstream expectations
    // (per-query hydrate, filters.predicate gating) need re-checking.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = queryPersister as any;
    expect(typeof p.persisterFn).toBe("function");
    expect(typeof p.persistQuery).toBe("function");
    expect(typeof p.retrieveQuery).toBe("function");
  });
});

describe("offline-cache · banned cache values", () => {
  // The load-bearing invariant behind the storage-adapter's setItem
  // and getItem guards. Diagnosis path: /transactions "Summary
  // unavailable" alert firing while the server returns 200 with real
  // data. Root cause: customFetch resolves an empty body to `null`;
  // TanStack Query accepts null as a valid resolved value; persister
  // writes null; every subsequent cold-load restores null and every
  // `data ?? []` downstream reads "no data".

  it("null is banned — canonical case, produced by customFetch on empty body", () => {
    expect(isBannedCacheValue(null)).toBe(true);
  });

  it("undefined is banned — TanStack Query treats this as no-data anyway", () => {
    expect(isBannedCacheValue(undefined)).toBe(true);
  });

  it("empty array is banned — a widget that reads `data ?? []` cannot tell it apart from cache-miss", () => {
    expect(isBannedCacheValue([])).toBe(true);
  });

  it("empty object is banned — same reasoning", () => {
    expect(isBannedCacheValue({})).toBe(true);
  });

  it("populated array is NOT banned", () => {
    expect(isBannedCacheValue([1])).toBe(false);
    expect(isBannedCacheValue([{ id: 1 }])).toBe(false);
  });

  it("populated object is NOT banned even if fields are zero or null", () => {
    // The summary endpoint's real response for a month with no
    // income and £88.15 expenses. Zero-valued fields are not empty.
    expect(isBannedCacheValue({ month: "2026-08", totalIncome: 0, totalExpenses: 88.15 })).toBe(false);
    // All-zeros is still a real response — the user genuinely had
    // no activity that month. This must not be rejected.
    expect(isBannedCacheValue({ month: "2026-01", totalIncome: 0, totalExpenses: 0 })).toBe(false);
    // A dashboard with a field explicitly set to null (FX-miss) is
    // still a real response.
    expect(isBannedCacheValue({ netWorth: null, totalCash: 100 })).toBe(false);
  });

  it("scalars are NOT banned", () => {
    // e.g. a raw number or string response. Rare but possible.
    expect(isBannedCacheValue(0)).toBe(false);
    expect(isBannedCacheValue("")).toBe(false);
    expect(isBannedCacheValue(false)).toBe(false);
  });
});

describe("offline-cache · blacklist", () => {
  it("persists user-owned data queries", () => {
    expect(isBlacklistedForTests(["/api/dashboard"])).toBe(false);
    expect(isBlacklistedForTests(["/api/transactions"])).toBe(false);
    expect(isBlacklistedForTests(["/api/accounts"])).toBe(false);
    expect(isBlacklistedForTests(["/api/budgets"])).toBe(false);
    expect(isBlacklistedForTests(["/api/goals"])).toBe(false);
    expect(isBlacklistedForTests(["/api/debts"])).toBe(false);
    expect(isBlacklistedForTests(["/api/subscriptions"])).toBe(false);
    expect(isBlacklistedForTests(["/api/upcoming"])).toBe(false);
    expect(isBlacklistedForTests(["/api/investments"])).toBe(false);
    expect(isBlacklistedForTests(["/api/shared-expenses"])).toBe(false);
  });

  it("refuses to persist market queries — they have their own stale-serve tier", () => {
    expect(isBlacklistedForTests(["/api/market/quotes"])).toBe(true);
    expect(isBlacklistedForTests(["/api/market/prices"])).toBe(true);
    expect(isBlacklistedForTests(["/api/market/history"])).toBe(true);
    expect(isBlacklistedForTests(["/api/market/news"])).toBe(true);
    expect(isBlacklistedForTests(["/api/market/fx-rates"])).toBe(true);
    expect(isBlacklistedForTests(["/api/market/providers"])).toBe(true);
  });

  it("refuses to persist AI / auth queries", () => {
    // AI responses must never be replayed from cache — LLM output is
    // per-request, and a stale answer with a fresh-looking timestamp
    // is worse than no answer.
    expect(isBlacklistedForTests(["/api/ai/coach"])).toBe(true);
    expect(isBlacklistedForTests(["/api/auth-providers"])).toBe(true);
    expect(isBlacklistedForTests(["/api/auth/session"])).toBe(true);
  });
});

describe("offline-cache · staleTimeFor", () => {
  it("shared expenses get the shorter 30-second window (another user's actions)", () => {
    expect(staleTimeFor(["/api/shared-expenses"])).toBe(FRESH_MS_SHARED);
    expect(staleTimeFor(["/api/owing"])).toBe(FRESH_MS_SHARED);
    expect(isSharedExpenseQuery(["/api/shared-expenses/42"])).toBe(true);
  });

  it("user's own data gets the 5-minute window", () => {
    expect(staleTimeFor(["/api/dashboard"])).toBe(FRESH_MS_USER_DATA);
    expect(staleTimeFor(["/api/transactions"])).toBe(FRESH_MS_USER_DATA);
    expect(staleTimeFor(["/api/accounts"])).toBe(FRESH_MS_USER_DATA);
  });

  it("market queries get the 1-minute window (chain layers its own stale-serve on top)", () => {
    expect(staleTimeFor(["/api/market/quotes"])).toBe(FRESH_MS_MARKET);
  });

  it("shared window is strictly shorter than user-data window", () => {
    // Load-bearing invariant: if these ever equalise, the whole
    // "settlement status is another person's action, treat it more
    // aggressively stale" rationale collapses. Lock so a well-meaning
    // "let's unify the timings" refactor fails here first.
    expect(FRESH_MS_SHARED).toBeLessThan(FRESH_MS_USER_DATA);
  });

  it("mockQuery keeps a URL string as the first key element", () => {
    // Sanity for the helper's shape — the blacklist depends on this.
    expect(mockQuery("/api/dashboard").queryKey[0]).toBe("/api/dashboard");
  });
});

describe("offline-cache · staleTimeFor", () => {
  it("shared expenses get the shorter 30-second window (another user's actions)", () => {
    expect(staleTimeFor(["/api/shared-expenses"])).toBe(FRESH_MS_SHARED);
    expect(staleTimeFor(["/api/owing"])).toBe(FRESH_MS_SHARED);
    expect(isSharedExpenseQuery(["/api/shared-expenses/42"])).toBe(true);
  });

  it("user's own data gets the 5-minute window", () => {
    expect(staleTimeFor(["/api/dashboard"])).toBe(FRESH_MS_USER_DATA);
    expect(staleTimeFor(["/api/transactions"])).toBe(FRESH_MS_USER_DATA);
    expect(staleTimeFor(["/api/accounts"])).toBe(FRESH_MS_USER_DATA);
  });

  it("market queries get the 1-minute window (chain layers its own stale-serve on top)", () => {
    expect(staleTimeFor(["/api/market/quotes"])).toBe(FRESH_MS_MARKET);
  });

  it("shared window is strictly shorter than user-data window", () => {
    // Load-bearing invariant: if these ever equalise, the whole
    // "settlement status is another person's action, treat it more
    // aggressively stale" rationale collapses. Lock so a well-meaning
    // "let's unify the timings" refactor fails here first.
    expect(FRESH_MS_SHARED).toBeLessThan(FRESH_MS_USER_DATA);
  });
});
