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
  persistOptions,
  staleTimeFor,
  isSharedExpenseQuery,
  FRESH_MS_SHARED,
  FRESH_MS_USER_DATA,
  FRESH_MS_MARKET,
} from "./offline-cache";

// Structural stand-in for TanStack Query's Query. dehydrate touches
// queryKey, state.status and state.data; we mirror that shape so the
// lock doesn't depend on which query-core version pnpm resolved.
function mockQuery(
  url: string,
  status: "success" | "pending" | "error" = "success",
  data: unknown = { ok: true },
): {
  queryKey: readonly unknown[];
  state: { status: string; data?: unknown };
} {
  return { queryKey: [url], state: { status, data } };
}

describe("offline-cache · persist blacklist", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shouldDehydrate = (persistOptions as any).dehydrateOptions.shouldDehydrateQuery;

  it("persists user-owned data queries", () => {
    expect(shouldDehydrate(mockQuery("/api/dashboard"))).toBe(true);
    expect(shouldDehydrate(mockQuery("/api/transactions"))).toBe(true);
    expect(shouldDehydrate(mockQuery("/api/accounts"))).toBe(true);
    expect(shouldDehydrate(mockQuery("/api/budgets"))).toBe(true);
    expect(shouldDehydrate(mockQuery("/api/goals"))).toBe(true);
    expect(shouldDehydrate(mockQuery("/api/debts"))).toBe(true);
    expect(shouldDehydrate(mockQuery("/api/subscriptions"))).toBe(true);
    expect(shouldDehydrate(mockQuery("/api/upcoming"))).toBe(true);
    expect(shouldDehydrate(mockQuery("/api/investments"))).toBe(true);
    expect(shouldDehydrate(mockQuery("/api/shared-expenses"))).toBe(true);
  });

  it("refuses to persist market queries — they have their own stale-serve tier", () => {
    // Regression lock: adding /api/market/* here would produce
    // double-stale behaviour (this cache's timestamp + the market
    // chain's stale-serve timestamp diverging).
    expect(shouldDehydrate(mockQuery("/api/market/quotes"))).toBe(false);
    expect(shouldDehydrate(mockQuery("/api/market/prices"))).toBe(false);
    expect(shouldDehydrate(mockQuery("/api/market/history"))).toBe(false);
    expect(shouldDehydrate(mockQuery("/api/market/news"))).toBe(false);
    expect(shouldDehydrate(mockQuery("/api/market/fx-rates"))).toBe(false);
    expect(shouldDehydrate(mockQuery("/api/market/providers"))).toBe(false);
  });

  it("refuses to persist AI / auth queries", () => {
    // AI responses must never be replayed from cache — LLM output is
    // per-request, and a stale answer with a fresh-looking timestamp
    // is worse than no answer.
    expect(shouldDehydrate(mockQuery("/api/ai/coach"))).toBe(false);
    expect(shouldDehydrate(mockQuery("/api/auth-providers"))).toBe(false);
    expect(shouldDehydrate(mockQuery("/api/auth/session"))).toBe(false);
  });

  it("persists a query with data even if the last fetch errored", () => {
    // The load-bearing invariant for offline reload: hydrated
    // queries → invalidate on app-resume → refetch fails offline →
    // query moves to error state → next dehydrate must NOT drop the
    // still-valid data. Filtering on status:success (the initial
    // implementation) wiped the good snapshot to 85 bytes on every
    // offline reload. Verified live with the persister:set trace.
    expect(shouldDehydrate(mockQuery("/api/dashboard", "error", { netWorth: 229389 }))).toBe(true);
  });

  it("refuses to persist a query with no data (pending / initial error / undefined)", () => {
    // Undefined data means the query never resolved — nothing to
    // preserve. Persisting the empty envelope would just waste bytes.
    // Build directly rather than through mockQuery — mockQuery's
    // default value substitutes when data is explicitly undefined.
    const pending = { queryKey: ["/api/dashboard"], state: { status: "pending", data: undefined } };
    const errored = { queryKey: ["/api/dashboard"], state: { status: "error",   data: undefined } };
    expect(shouldDehydrate(pending)).toBe(false);
    expect(shouldDehydrate(errored)).toBe(false);
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
