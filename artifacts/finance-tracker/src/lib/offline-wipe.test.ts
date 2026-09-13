// The offline copy is gone after sign-out and account deletion, and stays
// gone.
//
// Runs the real QueryClient and the real TanStack persister against an
// in-memory stand-in for idb-keyval, so the two ways a just-emptied store
// gets refilled are exercised through TanStack's own scheduling rather than
// a model of it:
//   • a fetch in flight when the wipe runs, settling after it
//   • a fetch that settled just before the wipe, whose persist is still
//     queued on the notifyManager tick
// The browser-level check (IndexedDB inspected in Chromium after signing
// out and after deleting an account) is recorded in the task report.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { QueryObserver } from "@tanstack/react-query";

const idb = vi.hoisted(() => new Map<string, unknown>());
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.get(k),
  set: async (k: string, v: unknown) => void idb.set(k, v),
  del: async (k: string) => void idb.delete(k),
  clear: async () => idb.clear(),
  entries: async () => [...idb.entries()],
}));

const outbox = vi.hoisted(() => ({ rows: [] as unknown[], replayed: 0 }));
vi.mock("./outbox-db", () => ({
  outboxDb: { outbox: { clear: async () => { outbox.rows = []; } } },
  replayOutbox: async () => { outbox.replayed++; },
}));

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
    ...Object.create(null),
  } as Storage;
}

// Object.keys(localStorage) must list the stored keys, as it does in a
// browser, so the stand-in exposes them as own properties.
function browserLikeStorage(): Storage {
  const inner = memoryStorage();
  return new Proxy(inner, {
    ownKeys: () => Array.from({ length: inner.length }, (_, i) => inner.key(i)!),
    getOwnPropertyDescriptor: (_t, k) =>
      typeof k === "string" && inner.getItem(k) !== null
        ? { enumerable: true, configurable: true, value: inner.getItem(k) }
        : undefined,
  });
}

vi.stubGlobal("localStorage", browserLikeStorage());
vi.stubGlobal("sessionStorage", browserLikeStorage());
vi.stubGlobal("navigator", { onLine: true });

const { createOfflineQueryClient } = await import("./offline-cache");
const { wipeOfflineCopy, flushOutboxBeforeSignOut, AI_SESSION_CACHE_KEYS } = await import("./offline-wipe");

const tick = () => new Promise((r) => setTimeout(r, 5));

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  idb.clear();
  outbox.rows = [];
  outbox.replayed = 0;
  localStorage.clear();
  sessionStorage.clear();
});

describe("offline copy · wiped on sign-out and account deletion", () => {
  it("a settled query is persisted in the first place (the scaffold works)", async () => {
    const qc = createOfflineQueryClient();
    await qc.fetchQuery({ queryKey: ["/api/accounts"], queryFn: async () => [{ id: 1, balance: "11371.00" }] });
    await tick();
    expect(idb.size).toBe(1);
  });

  it("clears the persisted cache, the outbox, the in-memory cache and the regenerable caches", async () => {
    const qc = createOfflineQueryClient();
    await qc.fetchQuery({ queryKey: ["/api/transactions"], queryFn: async () => [{ id: 1, amount: "42.00" }] });
    await tick();
    outbox.rows = [{ url: "/api/transactions", body: "{\"amount\":\"9.99\"}" }];
    localStorage.setItem("ft-briefing-cache", "{\"netWorth\":11371}");
    localStorage.setItem("numeris-query-v1-legacy", "x");
    localStorage.setItem("ft-density", "compact");
    localStorage.setItem("ft-login-history", "[]");
    for (const k of AI_SESSION_CACHE_KEYS) sessionStorage.setItem(k, "your spending rose 12%");
    sessionStorage.setItem("ft-session-recorded", "1");

    await wipeOfflineCopy(qc);

    expect(idb.size).toBe(0);
    expect(outbox.rows).toEqual([]);
    expect(qc.getQueryCache().getAll()).toEqual([]);
    expect(localStorage.getItem("ft-briefing-cache")).toBeNull();
    expect(localStorage.getItem("numeris-query-v1-legacy")).toBeNull();
    for (const k of AI_SESSION_CACHE_KEYS) expect(sessionStorage.getItem(k), k).toBeNull();
    // Device settings and the sign-in history stay (PRIVACY.md section 10).
    expect(localStorage.getItem("ft-density")).toBe("compact");
    expect(localStorage.getItem("ft-login-history")).toBe("[]");
    expect(sessionStorage.getItem("ft-session-recorded")).toBe("1");
  });

  it("a background refetch in flight during the wipe does not write the data back when it settles", async () => {
    const qc = createOfflineQueryClient();
    // An observer holds the query, as a mounted screen does. Without one the
    // query is garbage-collected at once and a "refetch" never reaches the
    // network function, which made an earlier version of this test vacuous.
    const d = deferred<unknown>();
    let calls = 0;
    const queryFn = () => (++calls === 1 ? Promise.resolve({ netWorth: 11000 }) : d.promise);
    const observer = new QueryObserver(qc, { queryKey: ["/api/dashboard/summary"], queryFn, retry: false });
    const unsubscribe = observer.subscribe(() => undefined);
    await tick();
    expect(idb.size).toBe(1);
    const refetch = observer.refetch();
    await tick();
    expect(calls).toBe(2);
    await wipeOfflineCopy(qc);
    // The network call returns measurably after the wipe.
    await new Promise((r) => setTimeout(r, 10));
    d.resolve({ netWorth: 11371 });
    await refetch;
    await tick();
    unsubscribe();
    expect(idb.size).toBe(0);
  });

  it("a fetch that settled just before the wipe does not write back on its queued persist", async () => {
    const qc = createOfflineQueryClient();
    await qc.fetchQuery({ queryKey: ["/api/debts"], queryFn: async () => [{ id: 7, amount: "250.00" }] });
    // No tick: the persist is still queued on the notifyManager when the wipe runs.
    await wipeOfflineCopy(qc);
    await tick();
    expect(idb.size).toBe(0);
  });

  it("the next person's data is persisted normally after the wipe", async () => {
    const qc = createOfflineQueryClient();
    await wipeOfflineCopy(qc);
    await new Promise((r) => setTimeout(r, 2));
    await qc.fetchQuery({ queryKey: ["/api/accounts"], queryFn: async () => [{ id: 2 }] });
    await tick();
    expect(idb.size).toBe(1);
  });

  it("sign-out replays queued writes first when online, and skips it offline", async () => {
    await flushOutboxBeforeSignOut();
    expect(outbox.replayed).toBe(1);
    vi.stubGlobal("navigator", { onLine: false });
    await flushOutboxBeforeSignOut();
    expect(outbox.replayed).toBe(1);
    vi.stubGlobal("navigator", { onLine: true });
  });

  it("every AI sessionStorage cache key still exists in the source", () => {
    const src = path.resolve(__dirname, "..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !full.endsWith("offline-wipe.ts")) files.push(full);
      }
    };
    walk(src);
    const text = files.map((f) => readFileSync(f, "utf8")).join("\n");
    expect(AI_SESSION_CACHE_KEYS.filter((k) => !text.includes(`"${k}"`))).toEqual([]);
  });
});
