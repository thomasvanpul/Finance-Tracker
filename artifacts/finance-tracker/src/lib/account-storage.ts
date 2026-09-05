// Account-level localStorage, mirrored to the server (BACKLOG § G20/B).
//
// The app has ~150 localStorage call sites across 60 files. Rather than
// rewrite each one, this module patches Storage.prototype.setItem /
// removeItem once, at install, and watches the keys classified as
// account-level in account-storage-keys.ts. Every page keeps reading
// and writing localStorage exactly as before; the difference is that an
// account-level write is also queued for PATCH /settings/preferences,
// and on sign-in the server's copy is written into localStorage before
// any page mounts (PreferencesGate), so laptop and phone agree.
//
// Rules, in order of who wins:
//   1. A local edit that has not reached the server yet (the key is in
//      nr-prefs-pending, persisted across reloads) wins over the server
//      and is pushed. This is the one-line offline queue G20/A asks for,
//      scoped to preferences.
//   2. Otherwise the server wins on hydrate. The first time a device
//      hydrates for a user, any local value the server overwrote is
//      kept in nr-prefs-shadow-v1 so the one-off migration cannot
//      silently destroy anything.
//   3. A local key the server does not have is pushed — that is the
//      device → account migration itself.
//
// Ownership: nr-prefs-owner records whose data this browser holds. If a
// different user signs in, every account-level key is cleared before
// hydrate and nothing local is pushed; one person's notes never land in
// another person's account.
//
// Nothing here touches money. Balances and transactions are API data.

import { apiFetch } from "./api-fetch";
import { isAccountLevelKey } from "./account-storage-keys";

export const OWNER_KEY = "nr-prefs-owner";
export const PENDING_KEY = "nr-prefs-pending";
export const SHADOW_KEY = "nr-prefs-shadow-v1";
export const HYDRATED_EVENT = "nr-preferences-hydrated";

const DEBOUNCE_MS = 800;
const RETRY_MS = 30_000;
const KEYS_PER_REQUEST = 50; // mirrors MAX_KEYS_PER_PATCH on the server
const HYDRATE_TIMEOUT_MS = 6_000;

type Raw = {
  setItem: (this: Storage, key: string, value: string) => void;
  removeItem: (this: Storage, key: string) => void;
};

interface State {
  raw: Raw | null;
  /** Keys with a local value the server has not confirmed. */
  pending: Set<string>;
  /** True while hydrate is writing server values — those must not re-queue. */
  suppressed: boolean;
  /** Flushing is allowed only once this browser is known to hold the signed-in user's data. */
  enabled: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  retry: ReturnType<typeof setTimeout> | null;
  inflight: Promise<void> | null;
}

const state: State = {
  raw: null,
  pending: new Set(),
  suppressed: false,
  enabled: false,
  timer: null,
  retry: null,
  inflight: null,
};

function ls(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function rawSet(key: string, value: string): void {
  const store = ls();
  if (!store || !state.raw) return;
  state.raw.setItem.call(store, key, value);
}

function rawRemove(key: string): void {
  const store = ls();
  if (!store || !state.raw) return;
  state.raw.removeItem.call(store, key);
}

function persistPending(): void {
  if (state.pending.size === 0) rawRemove(PENDING_KEY);
  else rawSet(PENDING_KEY, JSON.stringify([...state.pending]));
}

function loadPending(): void {
  try {
    const raw = ls()?.getItem(PENDING_KEY);
    if (!raw) return;
    const keys = JSON.parse(raw);
    if (Array.isArray(keys)) for (const k of keys) if (typeof k === "string") state.pending.add(k);
  } catch {
    // unreadable — start empty; the next hydrate reconciles
  }
}

// Every account-level key currently in localStorage, with its value.
export function localAccountEntries(): Record<string, string> {
  const store = ls();
  const out: Record<string, string> = {};
  if (!store) return out;
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key && isAccountLevelKey(key)) {
      const v = store.getItem(key);
      if (v !== null) out[key] = v;
    }
  }
  return out;
}

function schedule(): void {
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    state.timer = null;
    void flushAccountStorage();
  }, DEBOUNCE_MS);
}

function onAccountWrite(key: string): void {
  if (state.suppressed || !isAccountLevelKey(key)) return;
  state.pending.add(key);
  persistPending();
  schedule();
}

// ── install ──────────────────────────────────────────────────────────────

// Patch Storage.prototype once. Idempotent. Safe to call where Storage
// does not exist (SSR, tests without a DOM) — it does nothing.
export function installAccountStorage(): void {
  if (state.raw) return;
  if (typeof Storage === "undefined" || !Storage.prototype) return;
  const proto = Storage.prototype;
  const raw: Raw = { setItem: proto.setItem, removeItem: proto.removeItem };
  state.raw = raw;
  proto.setItem = function (this: Storage, key: string, value: string) {
    raw.setItem.call(this, key, value);
    if (this === ls()) onAccountWrite(key);
  };
  proto.removeItem = function (this: Storage, key: string) {
    raw.removeItem.call(this, key);
    if (this === ls()) onAccountWrite(key);
  };
  loadPending();
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => void flushAccountStorage());
    window.addEventListener("pagehide", () => void flushAccountStorage({ keepalive: true }));
  }
}

// ── server ───────────────────────────────────────────────────────────────

async function patch(entries: Record<string, string | null>, keepalive: boolean): Promise<boolean> {
  const res = await apiFetch("/api/settings/preferences", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ preferences: entries }),
    keepalive,
  });
  return res.ok;
}

// Push every pending key, in chunks. Resolves when the attempt is over;
// never throws. On failure the keys stay pending and a retry is
// scheduled (and the `online` event triggers one sooner).
export function flushAccountStorage(opts: { keepalive?: boolean } = {}): Promise<void> {
  if (state.inflight) return state.inflight;
  if (!state.enabled || state.pending.size === 0) return Promise.resolve();
  const store = ls();
  if (!store) return Promise.resolve();
  const run = async () => {
    const keys = [...state.pending];
    let failed = false;
    for (let i = 0; i < keys.length && !failed; i += KEYS_PER_REQUEST) {
      const chunk = keys.slice(i, i + KEYS_PER_REQUEST);
      const entries: Record<string, string | null> = {};
      const snapshot = new Map<string, string | null>();
      for (const k of chunk) {
        const v = store.getItem(k);
        entries[k] = v;
        snapshot.set(k, v);
      }
      let ok = false;
      try {
        ok = await patch(entries, opts.keepalive ?? false);
      } catch {
        ok = false;
      }
      if (!ok) {
        failed = true;
        break;
      }
      // Confirmed — unless the value moved again while the request was out.
      for (const k of chunk) if (store.getItem(k) === snapshot.get(k)) state.pending.delete(k);
    }
    persistPending();
    if (failed && !state.retry) {
      state.retry = setTimeout(() => {
        state.retry = null;
        void flushAccountStorage();
      }, RETRY_MS);
    }
  };
  state.inflight = run().finally(() => {
    state.inflight = null;
  });
  return state.inflight;
}

export type HydrateOutcome = "hydrated" | "offline" | "unavailable";

// Sign-in: reconcile localStorage with the server for `userId`, then
// allow flushing. Bounded by HYDRATE_TIMEOUT_MS so a slow network never
// holds the app blank; on timeout or error the local values stand and
// the outcome is "offline".
export async function hydrateAccountStorage(userId: string): Promise<HydrateOutcome> {
  installAccountStorage();
  const store = ls();
  if (!store || !state.raw) return "unavailable";

  const previousOwner = store.getItem(OWNER_KEY);
  const firstHydrateForUser = previousOwner !== userId;
  if (previousOwner !== null && previousOwner !== userId) {
    // Someone else's data. Clear it and forget any pending pushes.
    for (const key of Object.keys(localAccountEntries())) rawRemove(key);
    rawRemove(SHADOW_KEY);
  }
  if (firstHydrateForUser) {
    // Pending keys belong to whoever owned this browser before; with no
    // owner recorded that is unknown, so rule 1 applies only to a user
    // this browser already knows. Local values still migrate by rule 3.
    state.pending.clear();
    persistPending();
  }
  rawSet(OWNER_KEY, userId);

  let server: Record<string, string>;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HYDRATE_TIMEOUT_MS);
    const res = await apiFetch("/api/settings/preferences", { signal: controller.signal }).finally(() =>
      clearTimeout(timer),
    );
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { preferences?: Record<string, string> };
    server = body.preferences ?? {};
  } catch {
    state.enabled = true;
    schedule();
    return "offline";
  }

  const local = localAccountEntries();
  const shadow: Record<string, string> = {};
  state.suppressed = true;
  try {
    for (const [key, value] of Object.entries(server)) {
      if (state.pending.has(key)) continue; // rule 1: unsynced local edit wins
      if (local[key] === value) continue;
      if (firstHydrateForUser && local[key] !== undefined) shadow[key] = local[key];
      rawSet(key, value);
    }
    for (const key of Object.keys(local)) {
      if (!(key in server)) state.pending.add(key); // rule 3: migrate device → account
    }
  } finally {
    state.suppressed = false;
  }
  if (Object.keys(shadow).length > 0) {
    try {
      rawSet(SHADOW_KEY, JSON.stringify({ userId, at: new Date().toISOString(), entries: shadow }));
    } catch {
      // quota — the shadow is a courtesy, not a contract
    }
  }
  persistPending();
  state.enabled = true;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(HYDRATED_EVENT));
  if (state.pending.size > 0) schedule();
  return "hydrated";
}

// Sign-out: push what is still pending, then drop the account-level
// keys so the next person at this browser starts clean. Keys stay if
// the push failed — the owner check on the next hydrate protects a
// different user, and the same user gets their edits back.
export async function clearAccountStorage(): Promise<void> {
  await flushAccountStorage({ keepalive: true });
  if (state.pending.size > 0) return;
  state.suppressed = true;
  try {
    for (const key of Object.keys(localAccountEntries())) rawRemove(key);
  } finally {
    state.suppressed = false;
  }
  rawRemove(OWNER_KEY);
  rawRemove(SHADOW_KEY);
  state.enabled = false;
}

// Account deleted: there is no server to push to any more. Drop every
// account-level key and the engine's own bookkeeping without flushing.
export function discardAccountStorage(): void {
  installAccountStorage();
  state.enabled = false;
  if (state.timer) clearTimeout(state.timer);
  if (state.retry) clearTimeout(state.retry);
  state.timer = null;
  state.retry = null;
  state.pending.clear();
  state.suppressed = true;
  try {
    for (const key of Object.keys(localAccountEntries())) rawRemove(key);
  } finally {
    state.suppressed = false;
  }
  rawRemove(OWNER_KEY);
  rawRemove(PENDING_KEY);
  rawRemove(SHADOW_KEY);
}

// Test seam. Not for app code.
export function __resetAccountStorageForTests(): void {
  if (state.raw && typeof Storage !== "undefined") {
    Storage.prototype.setItem = state.raw.setItem;
    Storage.prototype.removeItem = state.raw.removeItem;
  }
  if (state.timer) clearTimeout(state.timer);
  if (state.retry) clearTimeout(state.retry);
  state.raw = null;
  state.pending.clear();
  state.suppressed = false;
  state.enabled = false;
  state.timer = null;
  state.retry = null;
  state.inflight = null;
}

export function __pendingKeysForTests(): string[] {
  return [...state.pending];
}
