// Offline read-path cache configuration.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// Every screen used to require the network. Cold-reload on a plane showed
// skeletons then zeros — the summary read as "your net worth is £0" for a
// user who genuinely didn't want that message. The read path solves it by
// persisting each TanStack Query response to IndexedDB so a cold boot
// with no signal renders the last known data rather than an empty state.
//
// ── Why experimental_createQueryPersister and not PersistQueryClientProvider ─
// Previous cut used PersistQueryClientProvider which restores the whole
// cache in a useEffect after first render. That fought a race with per-
// page useQuery hooks: the observer synchronously created a fresh query
// (status: pending, no data) during first render before hydrate ran, then
// hydrate's setState never landed the data in a way the observer picked
// up. Dashboard worked because the layout mounted its query early enough;
// per-page hooks (accounts, transactions, goals) lost the race.
//
// experimental_createQueryPersister wraps the queryFn per-query. On
// fetch: if the query has no data AND storage has an entry, RETURN the
// stored data as if it were the queryFn's result. No separate hydration
// step, no race window. See:
//   node_modules/.pnpm/@tanstack+query-persist-client-core@5.101.4/
//   node_modules/@tanstack/query-persist-client-core/build/modern/
//   createPersister.js
//
// ── Timestamp discipline (load-bearing) ─────────────────────────────────────
// The persister restores state.dataUpdatedAt from storage. TanStack Query
// records that as the ORIGINAL fetch time — never re-stamped to render
// time. The UI must show that timestamp via <StaleAsOf>. Re-stamping it
// would produce a 12-min-old value labelled "just now" — the same defect
// the market chain guards against. See [[project_fintrack_design]].
//
// ── What is cached, what isn't ──────────────────────────────────────────────
// User-owned data is cacheable: transactions, accounts, budgets, goals,
// debts, subscriptions, upcoming, investment positions, shared expenses,
// dashboard summary, net-worth snapshots.
//
// Non-cacheable — must always miss when offline:
//   • Live market quotes and history (already null-honest via chain)
//   • News (per-request freshness matters)
//   • AI responses (LLM calls, deliberately fresh)
//   • Auth session / providers health (state changes trigger reauth)
//
// Enforced by the persister's `filters` callback below.
//
// ── Aggressive-stale carve-out ──────────────────────────────────────────────
// Shared expenses are cached but with a shorter fresh window (30s vs 5min).
// A settlement status is another person's action — showing "unsettled" when
// they paid two hours ago is the one cached value that causes a real-world
// problem. Timestamp always visible.

import { QueryClient } from "@tanstack/react-query";
import { experimental_createQueryPersister } from "@tanstack/query-persist-client-core";
import { get, set, del, entries } from "idb-keyval";

// Structural shape of a Query for our purposes — reading queryKey and
// state.status/data is all we need. Local structural type sidesteps
// nominal type mismatch on the `#private` field between query-core
// versions.
type CacheableQuery = {
  queryKey: readonly unknown[];
  state: { status: string; data?: unknown };
};

// Fresh windows. Beyond these, the query is refetched when a component
// mounts / window regains focus; offline just means the refetch fails
// and the cached value stays visible.
export const FRESH_MS_USER_DATA = 5 * 60 * 1000;      // 5 min for user's own rows
export const FRESH_MS_SHARED    = 30 * 1000;          // 30 s for shared expenses — someone else's actions
export const FRESH_MS_MARKET    = 60 * 1000;          // 1 min for market data (chain handles its own stale)

// gcTime: how long an idle query stays in memory (and thus is available
// for persister lookup after remount). 30 days keeps a returning user's
// data available after a fortnight abroad; longer risks schema-drift
// bugs where a field removed server-side lingers in cache.
export const GC_TIME_MS = 30 * 24 * 60 * 60 * 1000;

// Persister storage prefix + buster. Bumping either wipes stale entries
// on next boot; use on any breaking response-shape change.
const CACHE_VERSION = "v1";
const PERSISTER_PREFIX = `numeris-query-${CACHE_VERSION}`;

// Query-key URL prefixes we must NEVER persist. The market chain has
// its own stale-serve tier and its own timestamp discipline — cache
// duplication here would serve quotes from the wrong tier.
const BLACKLIST_PREFIXES = [
  "/api/market/quotes",
  "/api/market/prices",
  "/api/market/history",
  "/api/market/detail",
  "/api/market/options",
  "/api/market/news",
  "/api/market/providers",
  "/api/market/fx-rates",
  "/api/ai/",
  "/api/auth",
  "/api/auth-providers",
  "/api/healthz",
];

// Exported for the test lock. Not part of the runtime surface anyone
// else should call — the persister's `filters.predicate` is the only
// place this is applied at runtime.
export function isBlacklistedForTests(queryKey: readonly unknown[]): boolean {
  const first = queryKey[0];
  if (typeof first !== "string") return false;
  return BLACKLIST_PREFIXES.some((prefix) => first.startsWith(prefix));
}

function isBlacklisted(query: CacheableQuery): boolean {
  return isBlacklistedForTests(query.queryKey);
}

// Match shared-expenses queries for the shorter fresh window.
export function isSharedExpenseQuery(queryKey: readonly unknown[]): boolean {
  const first = queryKey[0];
  if (typeof first !== "string") return false;
  return first.startsWith("/api/shared-expenses") || first.startsWith("/api/owing");
}

// Fresh window for a given query.
export function staleTimeFor(queryKey: readonly unknown[]): number {
  if (isSharedExpenseQuery(queryKey)) return FRESH_MS_SHARED;
  const first = queryKey[0];
  if (typeof first === "string" && first.startsWith("/api/market")) return FRESH_MS_MARKET;
  return FRESH_MS_USER_DATA;
}

// idb-keyval-backed storage adapter matching the shape the persister
// expects. `entries` is optional but enables persisterGc (background
// cleanup of expired entries) — worth including.
//
// ── Null / empty guards ────────────────────────────────────────────────────
// Two related defects the raw persister carries out of the box:
//
//   1. Writes null. When customFetch's parseSuccessBody sees an empty
//      response body (e.g. a 200 with content-length: 0 during a proxy
//      hiccup or a bad deploy window) it returns `null`. TanStack Query
//      accepts `null` as a valid resolved value; the persister then writes
//      that null into IDB. Every subsequent cold-load restores null.
//
//   2. Returns null on restore. `retrieveQuery` in createPersister.js
//      does `if (restoredData !== void 0) return`; null passes that
//      check and gets returned. The QueryObserver treats it as a
//      successful fetch that resolved to null. Downstream code that
//      does `const rows = data ?? []` then reads "no data" and the
//      widget shows an empty state — silently, forever, until the
//      user manually invalidates.
//
// The fix has two halves and both belong at the storage boundary:
//
//   • isBanned() below rejects the shapes the codebase treats as "no
//     data": null, empty array, empty object with zero keys. Genuine
//     empty results (a user with 0 accounts on their first day) are
//     tolerated the same way an offline miss is — the queryFn re-runs
//     next time and produces the same empty result. Nothing is lost.
//
//   • setItem inspects the serialised payload and skips writes whose
//     `state.data` is banned. getItem inspects on the way out and
//     treats banned data as a cache miss (returns null → persister
//     falls through to queryFn).
//
// Diagnosed 2026-08-23 from the /transactions "Summary unavailable"
// and dashboard "No transactions yet" contradiction. Both surfaced
// because two consumers of the same underlying data mapped to
// distinct queryKeys (["/api/transactions"] vs ["/api/transactions",
// {}]) — one had cached null, the other had real data.
// Exported for the test lock — enumerates every shape the codebase
// treats as "no data" and therefore refuses to cache. If a new
// "empty-shaped" response type appears (rare), extend here AND add
// a test case rather than papering over it downstream.
export function isBannedCacheValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}
function isBanned(value: unknown): boolean {
  return isBannedCacheValue(value);
}
function persistedDataIsBanned(serialised: string): boolean {
  try {
    const parsed = JSON.parse(serialised) as { state?: { data?: unknown } };
    return isBanned(parsed?.state?.data);
  } catch {
    // Malformed JSON → treat as banned so a corrupt entry doesn't
    // persist. On restore we'd fail JSON.parse anyway and fall
    // through to the queryFn.
    return true;
  }
}

const idbStorage = {
  getItem: async (key: string): Promise<string | null> => {
    const v = await get<string>(key);
    if (v == null) return null;
    // Fail-forward: if the stored entry has banned data, treat as
    // a cache miss so the persister runs the queryFn instead of
    // resolving to null. Also drop the entry so it stops taking
    // up space.
    if (persistedDataIsBanned(v)) {
      await del(key);
      return null;
    }
    return v;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    // Never overwrite a good snapshot with a banned one. See header.
    if (persistedDataIsBanned(value)) return;
    await set(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    await del(key);
  },
  entries: async (): Promise<Array<[string, string]>> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all = (await entries()) as Array<[any, any]>;
    return all
      .filter(([k, v]) => typeof k === "string" && typeof v === "string")
      .map(([k, v]) => [k as string, v as string]);
  },
};

// The per-query persister. `persisterFn` is what plugs into
// QueryClient.defaultOptions.queries.persister — TanStack Query
// invokes it in place of the raw queryFn.
export const queryPersister = experimental_createQueryPersister({
  storage: idbStorage,
  prefix: PERSISTER_PREFIX,
  buster: CACHE_VERSION,
  maxAge: GC_TIME_MS,
  // refetchOnRestore: false means a restored query is treated as fresh.
  // We don't want the very act of restoring cached data to trigger a
  // background refetch that fails offline and could confuse
  // downstream error states. Explicit user pull-to-refresh drives
  // fresh data.
  refetchOnRestore: false,
  // filters: only queries the callback returns true for are persisted
  // AND restored. Blacklisted queries never touch IndexedDB.
  filters: {
    predicate: (query) => !isBlacklisted(query as CacheableQuery),
  },
});

export function createOfflineQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Plug the persister in as the query's fetch wrapper. This is
        // where the whole "hydrate on demand" behaviour comes from.
        persister: queryPersister.persisterFn,
        staleTime: FRESH_MS_USER_DATA,
        gcTime: GC_TIME_MS,
        // Don't refetch on window focus — jarring on desktop when
        // tabbing back, and would overwrite dataUpdatedAt so the "as
        // of" signal drifts.
        refetchOnWindowFocus: false,
        // Don't refetch on reconnect — coming back online shouldn't
        // wipe visible cached data before the fresh fetch completes.
        // Explicit user pull-to-refresh (see layout.tsx) handles this.
        refetchOnReconnect: false,
        // Retry once on transient failure. Offline = fetch throws
        // immediately, retry throws again, useQuery keeps whatever
        // data the persister restored.
        retry: 1,
      },
    },
  });
}
