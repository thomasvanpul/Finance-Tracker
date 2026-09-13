// Removes this device's copy of the user's financial data. Called on sign-out
// and after account deletion — different events, same requirement: on a
// shared or family device, the next person must not be able to read it.
//
// What it clears:
//   • the in-memory query cache (cancelled first, so nothing in flight
//     settles into it)
//   • the persisted query cache — idb-keyval's default IndexedDB store,
//     which holds every cached response (accounts, transactions, net
//     worth, debts, shared expenses …) for up to 30 days
//   • the offline write queue — the NumerisOutbox IndexedDB database,
//     whose rows are unsent transaction bodies. They carry no owner, so
//     left in place they would also replay under the NEXT person's session
//   • the regenerable localStorage caches (LOCAL_CACHE_KEYS and the
//     numeris-query- prefix), including the briefing cache
//   • the AI commentary caches in sessionStorage, which quote the user's
//     figures back to them
//
// What it leaves, deliberately:
//   • account-level preferences — account-storage.ts owns those
//     (clearAccountStorage on sign-out, discardAccountStorage on deletion)
//   • device settings (density, masking, sidebar), onboarding flags, and
//     the sign-in history list, which docs/PRIVACY.md section 10 says
//     stays on the device
//   • the service worker's caches: they hold the app shell and Google
//     Fonts only (vite.config.ts runtimeCaching), never an /api response
//
// Order at the call sites matters. Sign-out replays the outbox while the
// session is still valid (flushOutboxBeforeSignOut), THEN signs out, THEN
// wipes. Wiping before signing out would let a component refetch with a
// live session and persist the data again in between.

import type { QueryClient } from "@tanstack/react-query";
import { clearPersistedQueries } from "./offline-cache";
import { LOCAL_CACHE_KEYS, KEY_PREFIXES } from "./account-storage-keys";

// sessionStorage keys holding AI commentary on the user's own figures. The
// lock test checks each still appears in the source.
export const AI_SESSION_CACHE_KEYS: readonly string[] = [
  "ft-dashboard-ai-insights",
  "ft-budget-ai-insight",
  "ft-goals-ai-coach",
  "ft-investments-ai-commentary",
  "nr-ai-coach-msgs",
];

const LOCAL_CACHE_PREFIXES = KEY_PREFIXES.filter((p) => p.cls === "local-cache").map((p) => p.prefix);

export async function flushOutboxBeforeSignOut(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const { replayOutbox } = await import("./outbox-db");
  await replayOutbox(() => undefined, () => undefined).catch(() => undefined);
}

export async function wipeOfflineCopy(queryClient: QueryClient): Promise<void> {
  await queryClient.cancelQueries().catch(() => undefined);
  queryClient.clear();

  const { outboxDb } = await import("./outbox-db");
  await Promise.all([clearPersistedQueries(), outboxDb.outbox.clear()]);

  if (typeof localStorage !== "undefined") {
    for (const key of Object.keys(localStorage)) {
      if (LOCAL_CACHE_KEYS.includes(key) || LOCAL_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        localStorage.removeItem(key);
      }
    }
  }
  if (typeof sessionStorage !== "undefined") {
    for (const key of AI_SESSION_CACHE_KEYS) sessionStorage.removeItem(key);
  }
}
