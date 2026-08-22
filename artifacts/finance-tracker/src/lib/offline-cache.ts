// Offline read-path cache configuration.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// Every screen used to require the network. Cold-reload on a plane showed
// skeletons then zeros — the summary read as "your net worth is £0" for a
// user who genuinely didn't want that message. The read path solves it by
// persisting TanStack Query's cache to IndexedDB so a cold boot with no
// signal renders the last known data rather than an empty state.
//
// ── Timestamp discipline (load-bearing) ─────────────────────────────────────
// TanStack Query records `dataUpdatedAt` per query — the FETCH timestamp,
// never re-stamped to render time. The UI must show that timestamp when
// data is served stale. Re-stamping it to now would produce a 12-min-old
// value labelled "just now" — the same defect the market chain guards
// against. See [[project_fintrack_design]] and the stale-serve pattern in
// lib/market.ts. Every widget that opts in to offline cache MUST render
// its `dataUpdatedAt` via <StaleAsOf>.
//
// ── What is cached, what isn't ──────────────────────────────────────────────
// User-owned data is cacheable: transactions, accounts, budgets, goals,
// debts, subscriptions, upcoming, investment positions, shared expenses,
// dashboard summary, net-worth snapshots. Any request the user's own
// device is the source of truth for.
//
// Non-cacheable — must always miss when offline:
//   • Live market quotes and history (already null-honest via chain)
//   • News (per-request freshness matters)
//   • AI responses (LLM calls, deliberately fresh)
//   • Auth session / providers health (state changes trigger reauth)
//   • Provider health snapshot (diagnostic; must not stale-lie)
//
// The blacklist is by URL prefix on the queryKey. Every generated hook
// uses the URL as the first key element; we can filter on it.
//
// ── Aggressive-stale carve-out ──────────────────────────────────────────────
// Shared expenses are cached (per user request) but with a shorter fresh
// window than the user's own rows. A settlement status is another person's
// action — showing "unsettled" when they paid two hours ago is the one
// cached value that causes a real-world problem. Timestamp always visible.
//
// ── Storage sizing ──────────────────────────────────────────────────────────
// IndexedDB via idb-keyval, single key holds the whole dehydrated cache.
// Chrome/Safari IndexedDB quotas are ~1GB+ on desktop, less on mobile but
// still measured in tens of MB — way more than the dashboard + txns +
// accounts payload for a personal-scale account (< 1 MB gzipped).

import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get, set, del } from "idb-keyval";

// Structural shape of a Query for our purposes — reading queryKey and
// state.status is all we need. Importing `type Query` from @tanstack/
// react-query pulls a specific query-core version that pnpm may resolve
// differently from the persist-client's own query-core (nominal type
// mismatch on the `#private` field even when the runtime shape is
// identical). This local structural type sidesteps that entirely.
type CacheableQuery = {
  queryKey: readonly unknown[];
  state: { status: string };
};

// Fresh windows. Beyond these, the query is stale-refetched when a
// component mounts / window regains focus, BUT the cached value keeps
// rendering with its dataUpdatedAt visible until the refetch lands.
// These are per-query timings, not offline-vs-online — offline just
// means the refetch fails and the cached value stays visible.
export const FRESH_MS_USER_DATA = 5 * 60 * 1000;      // 5 min for user's own rows
export const FRESH_MS_SHARED    = 30 * 1000;          // 30 s for shared expenses — someone else's actions
export const FRESH_MS_MARKET    = 60 * 1000;          // 1 min for market data (chain handles its own stale)

// gcTime: how long an idle query stays in memory (and thus in the
// dehydrated cache). 30 days keeps a returning user's data available
// after a fortnight abroad; longer risks schema-drift bugs (a field
// removed server-side but still present in cache).
export const GC_TIME_MS = 30 * 24 * 60 * 60 * 1000;

// Persister storage key. Includes app version so a shipped schema
// change doesn't try to rehydrate against a stale shape. Bump on
// any breaking response-shape change.
const CACHE_VERSION = "v1";
const CACHE_KEY = `numeris-query-cache-${CACHE_VERSION}`;

// Query-key URL prefixes we must NEVER persist. The market chain has
// its own stale-serve tier and its own timestamp discipline — cache
// duplication here would end up serving quotes from the wrong tier.
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

// Match a query against the blacklist. TanStack Query keys generated by
// orval look like `["/api/dashboard", {...params}]`. First element is
// the URL; we prefix-match against it.
function isBlacklisted(query: CacheableQuery): boolean {
  const first = query.queryKey[0];
  if (typeof first !== "string") return false;
  return BLACKLIST_PREFIXES.some((prefix) => first.startsWith(prefix));
}

// Match shared-expenses queries for the shorter fresh window. Same
// prefix approach as blacklist. Adds URL surface here as new shared
// endpoints appear.
export function isSharedExpenseQuery(queryKey: readonly unknown[]): boolean {
  const first = queryKey[0];
  if (typeof first !== "string") return false;
  return first.startsWith("/api/shared-expenses") || first.startsWith("/api/owing");
}

// Fresh window for a given query, driving TanStack Query's staleTime.
// Non-shared user data + everything else on the app default.
export function staleTimeFor(queryKey: readonly unknown[]): number {
  if (isSharedExpenseQuery(queryKey)) return FRESH_MS_SHARED;
  const first = queryKey[0];
  if (typeof first === "string" && first.startsWith("/api/market")) return FRESH_MS_MARKET;
  return FRESH_MS_USER_DATA;
}

// The persister — reads/writes the entire dehydrated cache under
// CACHE_KEY in IndexedDB. throttleTime batches writes so a burst of
// queries in the first second doesn't triple-write the cache.
export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get<string>(key).then((v) => v ?? null),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: CACHE_KEY,
  throttleTime: 1000,
});

// The QueryClient. staleTime defaults are set per-query via the
// wrapper hook getPersistQueryOptions() below rather than a single
// global — a global staleTime would over-cache market data.
export function createOfflineQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: FRESH_MS_USER_DATA,
        gcTime: GC_TIME_MS,
        // Don't refetch on window focus for cached data — jarring on
        // desktop when tabbing back. Focus-refetch would ALSO overwrite
        // dataUpdatedAt every time the user switches windows, which
        // muddies the "as of" signal.
        refetchOnWindowFocus: false,
        // Retry once on transient failure. Offline = fetch throws
        // immediately, retry throws again, useQuery returns error →
        // the cached data (via persist) still renders. UI reads
        // dataUpdatedAt for the timestamp.
        retry: 1,
      },
    },
  });
}

// PersistQueryClientOptions consumed by the provider. dehydrateOptions
// carries the blacklist so we don't persist market/AI/auth queries at
// all — they'd waste IndexedDB space AND risk staleness-labelled UI
// showing on a query that was designed to be always-live.
export const persistOptions = {
  persister,
  maxAge: GC_TIME_MS,
  // Bumping this string wipes the cache on next boot — use if a
  // rehydration bug ships. Keep in sync with CACHE_VERSION above.
  buster: CACHE_VERSION,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: CacheableQuery) => {
      // Persist only queries that have data (skip pending / error) and
      // that aren't blacklisted. This is intersected with the default
      // TanStack behaviour of persisting only "success" queries.
      if (isBlacklisted(query)) return false;
      return query.state.status === "success";
    },
  },
};
