// lib/account-storage.ts — the sync engine behind the stranded keys.
// Node environment: Storage, localStorage, window and apiFetch are
// stubbed. What is pinned: interception at the prototype, the
// classification gate, the three precedence rules on hydrate, the
// owner check, chunked flush with retry, and the two sign-out paths.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const net = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));
vi.mock("./api-fetch", () => ({ apiFetch: net.apiFetch }));

class FakeStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response;
}

let store: FakeStorage;
const listeners = new Map<string, Set<() => void>>();

beforeEach(() => {
  vi.useFakeTimers();
  store = new FakeStorage();
  listeners.clear();
  (globalThis as any).Storage = FakeStorage;
  (globalThis as any).localStorage = store;
  (globalThis as any).window = {
    addEventListener: (t: string, cb: () => void) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t)!.add(cb); },
    removeEventListener: (t: string, cb: () => void) => listeners.get(t)?.delete(cb),
    dispatchEvent: (e: { type: string }) => { listeners.get(e.type)?.forEach((cb) => cb()); return true; },
  };
  (globalThis as any).Event = class { constructor(public type: string) {} };
  net.apiFetch.mockReset();
});

afterEach(async () => {
  const m = await import("./account-storage");
  m.__resetAccountStorageForTests();
  vi.useRealTimers();
});

async function mod() {
  return await import("./account-storage");
}

function patchBodies(): Array<Record<string, string | null>> {
  return net.apiFetch.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")
    .map(([, init]) => JSON.parse((init as RequestInit).body as string).preferences);
}

describe("account-storage · interception", () => {
  it("queues account-level writes and removals, ignores every other class", async () => {
    const m = await mod();
    m.installAccountStorage();
    store.setItem("ft-tx-notes", "{}");
    store.setItem("ft-density", "compact");        // device
    store.setItem("ft-theme", "void");             // server-cache
    store.setItem("ft-briefing-cache", "x");       // local-cache
    store.setItem("nr-onboarding-complete", "1");  // onboarding
    store.removeItem("ft-nw-target");
    expect(m.__pendingKeysForTests().sort()).toEqual(["ft-nw-target", "ft-tx-notes"]);
    // Persisted so a reload does not forget an unsynced edit.
    expect(JSON.parse(store.getItem("nr-prefs-pending")!).sort()).toEqual(["ft-nw-target", "ft-tx-notes"]);
    // The write itself still landed.
    expect(store.getItem("ft-tx-notes")).toBe("{}");
  });

  it("does not flush before hydrate has established whose data this is", async () => {
    const m = await mod();
    m.installAccountStorage();
    store.setItem("ft-tx-notes", "{}");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(net.apiFetch).not.toHaveBeenCalled();
  });
});

describe("account-storage · hydrate", () => {
  it("server wins; local-only keys migrate up; the first hydrate shadows what it overwrote", async () => {
    const m = await mod();
    store.setItem("ft-tx-notes", "local-notes");     // server has a different value
    store.setItem("ft-nw-target", "50000");          // server lacks it → migrate
    store.setItem("ft-density", "compact");          // device: untouched
    net.apiFetch.mockResolvedValueOnce(jsonResponse({ preferences: { "ft-tx-notes": "server-notes", "ft-tickers": "[\"AAPL\"]" } }));
    net.apiFetch.mockResolvedValue(jsonResponse({ updated: 1, removed: 0 }));

    expect(await m.hydrateAccountStorage("user-a")).toBe("hydrated");
    expect(store.getItem("ft-tx-notes")).toBe("server-notes");
    expect(store.getItem("ft-tickers")).toBe("[\"AAPL\"]");
    expect(store.getItem("ft-density")).toBe("compact");
    expect(store.getItem("nr-prefs-owner")).toBe("user-a");
    expect(JSON.parse(store.getItem("nr-prefs-shadow-v1")!).entries).toEqual({ "ft-tx-notes": "local-notes" });
    // Writing server values must not echo back to the server.
    expect(m.__pendingKeysForTests()).toEqual(["ft-nw-target"]);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(patchBodies()).toEqual([{ "ft-nw-target": "50000" }]);
    expect(m.__pendingKeysForTests()).toEqual([]);
    expect(store.getItem("nr-prefs-pending")).toBeNull();
  });

  it("an unsynced local edit for the same user wins over the server and is pushed", async () => {
    const m = await mod();
    store.setItem("nr-prefs-owner", "user-a");
    store.setItem("nr-prefs-pending", JSON.stringify(["ft-tx-notes"]));
    store.setItem("ft-tx-notes", "edited-offline");
    net.apiFetch.mockResolvedValueOnce(jsonResponse({ preferences: { "ft-tx-notes": "stale-server" } }));
    net.apiFetch.mockResolvedValue(jsonResponse({ updated: 1, removed: 0 }));

    await m.hydrateAccountStorage("user-a");
    expect(store.getItem("ft-tx-notes")).toBe("edited-offline");
    expect(store.getItem("nr-prefs-shadow-v1")).toBeNull();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(patchBodies()).toEqual([{ "ft-tx-notes": "edited-offline" }]);
  });

  it("a different user signing in gets a clean slate and nothing of the previous user's is pushed", async () => {
    const m = await mod();
    store.setItem("nr-prefs-owner", "user-a");
    store.setItem("nr-prefs-pending", JSON.stringify(["ft-tx-notes"]));
    store.setItem("ft-tx-notes", "user-a-notes");
    store.setItem("ft-nw-target", "1");
    store.setItem("ft-density", "compact");
    net.apiFetch.mockResolvedValueOnce(jsonResponse({ preferences: { "ft-tickers": "[]" } }));
    net.apiFetch.mockResolvedValue(jsonResponse({ updated: 0, removed: 0 }));

    await m.hydrateAccountStorage("user-b");
    expect(store.getItem("ft-tx-notes")).toBeNull();
    expect(store.getItem("ft-nw-target")).toBeNull();
    expect(store.getItem("ft-tickers")).toBe("[]");
    expect(store.getItem("ft-density")).toBe("compact");
    expect(store.getItem("nr-prefs-owner")).toBe("user-b");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(patchBodies()).toEqual([]);
  });

  it("offline: local values stand, the outcome says so, and writes flush once online", async () => {
    const m = await mod();
    store.setItem("ft-tx-notes", "local");
    net.apiFetch.mockRejectedValueOnce(new Error("network"));
    expect(await m.hydrateAccountStorage("user-a")).toBe("offline");
    expect(store.getItem("ft-tx-notes")).toBe("local");

    store.setItem("ft-tx-notes", "local-2");
    net.apiFetch.mockRejectedValueOnce(new Error("network"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(m.__pendingKeysForTests()).toEqual(["ft-tx-notes"]);

    net.apiFetch.mockResolvedValue(jsonResponse({ updated: 1, removed: 0 }));
    (globalThis as any).window.dispatchEvent({ type: "online" });
    await vi.advanceTimersByTimeAsync(10);
    expect(m.__pendingKeysForTests()).toEqual([]);
  });
});

describe("account-storage · flush", () => {
  it("chunks at 50 keys per request and keeps a key pending if it changed mid-flight", async () => {
    const m = await mod();
    net.apiFetch.mockResolvedValueOnce(jsonResponse({ preferences: {} }));
    await m.hydrateAccountStorage("user-a");
    // 52 distinct account-level keys are not available; write the same
    // key list the classification exposes, padded with removals.
    const { ACCOUNT_LEVEL_KEYS } = await import("./account-storage-keys");
    const keys = ACCOUNT_LEVEL_KEYS.slice(0, 52);
    expect(keys.length).toBe(52);
    for (const k of keys) store.setItem(k, "v");
    let resolveFirst!: (r: Response) => void;
    net.apiFetch.mockImplementationOnce(() => new Promise<Response>((r) => { resolveFirst = r; }));
    net.apiFetch.mockResolvedValue(jsonResponse({ updated: 2, removed: 0 }));
    await vi.advanceTimersByTimeAsync(800);
    // First chunk is in flight; the user edits one of its keys.
    store.setItem(keys[0], "v2");
    resolveFirst(jsonResponse({ updated: 50, removed: 0 }));
    await vi.advanceTimersByTimeAsync(10);
    const bodies = patchBodies();
    expect(bodies.map((b) => Object.keys(b).length)).toEqual([50, 2]);
    // The mid-flight edit is still pending and goes out on the next debounce.
    expect(m.__pendingKeysForTests()).toEqual([keys[0]]);
    await vi.advanceTimersByTimeAsync(800);
    expect(patchBodies().at(-1)).toEqual({ [keys[0]]: "v2" });
  });

  it("a 4xx keeps the keys pending and retries later instead of dropping them", async () => {
    const m = await mod();
    net.apiFetch.mockResolvedValueOnce(jsonResponse({ preferences: {} }));
    await m.hydrateAccountStorage("user-a");
    store.setItem("ft-tx-notes", "x");
    net.apiFetch.mockResolvedValueOnce(jsonResponse({ error: "nope" }, false, 400));
    await vi.advanceTimersByTimeAsync(800);
    expect(m.__pendingKeysForTests()).toEqual(["ft-tx-notes"]);
    net.apiFetch.mockResolvedValue(jsonResponse({ updated: 1, removed: 0 }));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(m.__pendingKeysForTests()).toEqual([]);
  });
});

describe("account-storage · sign-out and deletion", () => {
  it("sign-out flushes with keepalive, then clears account keys and the owner, leaving device keys", async () => {
    const m = await mod();
    net.apiFetch.mockResolvedValueOnce(jsonResponse({ preferences: {} }));
    await m.hydrateAccountStorage("user-a");
    store.setItem("ft-tx-notes", "x");
    store.setItem("ft-density", "compact");
    net.apiFetch.mockResolvedValue(jsonResponse({ updated: 1, removed: 0 }));
    await m.clearAccountStorage();
    const last = net.apiFetch.mock.calls.at(-1)![1] as RequestInit;
    expect(last.method).toBe("PATCH");
    expect(last.keepalive).toBe(true);
    expect(store.getItem("ft-tx-notes")).toBeNull();
    expect(store.getItem("nr-prefs-owner")).toBeNull();
    expect(store.getItem("ft-density")).toBe("compact");
  });

  it("sign-out with a failed push keeps the data rather than losing the edit", async () => {
    const m = await mod();
    net.apiFetch.mockResolvedValueOnce(jsonResponse({ preferences: {} }));
    await m.hydrateAccountStorage("user-a");
    store.setItem("ft-tx-notes", "x");
    net.apiFetch.mockRejectedValue(new Error("offline"));
    await m.clearAccountStorage();
    expect(store.getItem("ft-tx-notes")).toBe("x");
    expect(store.getItem("nr-prefs-owner")).toBe("user-a");
  });

  it("deletion discards everything without a network call", async () => {
    const m = await mod();
    net.apiFetch.mockResolvedValueOnce(jsonResponse({ preferences: {} }));
    await m.hydrateAccountStorage("user-a");
    store.setItem("ft-tx-notes", "x");
    net.apiFetch.mockClear();
    m.discardAccountStorage();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(net.apiFetch).not.toHaveBeenCalled();
    expect(store.getItem("ft-tx-notes")).toBeNull();
    expect(store.getItem("nr-prefs-pending")).toBeNull();
    expect(store.getItem("nr-prefs-owner")).toBeNull();
  });
});
