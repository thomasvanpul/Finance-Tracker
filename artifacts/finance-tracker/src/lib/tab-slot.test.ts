// lib/tab-slot.ts — the slot is an account-level preference with a
// localStorage read cache. These tests pin the contract that matters:
// the server is the source of truth on hydrate (including null), user
// actions write through, and subscribers are notified on every change.

import { describe, it, expect, vi, beforeEach } from "vitest";

const api = vi.hoisted(() => ({
  getSettingsTabSlot: vi.fn(),
  updateSettingsTabSlot: vi.fn(),
}));
vi.mock("@workspace/api-client-react", () => api);

// Node test environment: give the module a minimal window + localStorage.
const store = new Map<string, string>();
const listeners = new Set<() => void>();
beforeEach(() => {
  store.clear();
  listeners.clear();
  api.getSettingsTabSlot.mockReset();
  api.updateSettingsTabSlot.mockReset().mockResolvedValue(undefined);
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  (globalThis as any).window = {
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    dispatchEvent: () => { listeners.forEach((cb) => cb()); return true; },
  };
  (globalThis as any).Event = class { constructor(public type: string) {} };
});

async function mod() {
  return await import("./tab-slot");
}

describe("tab-slot · persona defaults", () => {
  it("market persona defaults to MARKETS, every other persona to SPENDING", async () => {
    const { slotIdForPersona } = await mod();
    expect(slotIdForPersona("market")).toBe("markets");
    for (const p of ["budget", "wealth", "social", "full"] as const) {
      expect(slotIdForPersona(p)).toBe("spending");
    }
  });

  it("tabOwnedUrls() is the union of fixed tabs, available slots and their aliases", async () => {
    const { tabOwnedUrls } = await mod();
    const urls = tabOwnedUrls();
    for (const u of ["/", "/worth", "/directory", "/spending", "/markets", "/upcoming", "/accounts", "/transactions", "/recurring"]) {
      expect(urls).toContain(u);
    }
    // Unavailable slots are not tab-owned yet — /owing is still a wrapped route.
    expect(urls).not.toContain("/owing");
    expect(urls).not.toContain("/watchlist");
  });
});

describe("tab-slot · user actions write through", () => {
  it("saveSlotId caches, notifies, and PUTs the id", async () => {
    const { saveSlotId, loadSlotId, LS_SLOT_KEY } = await mod();
    const seen = vi.fn();
    listeners.add(seen);
    saveSlotId("markets");
    expect(store.get(LS_SLOT_KEY)).toBe("markets");
    expect(loadSlotId()).toBe("markets");
    expect(seen).toHaveBeenCalledTimes(1);
    expect(api.updateSettingsTabSlot).toHaveBeenCalledWith({ tabSlot: "markets" });
  });

  it("clearSlotId drops the cache, notifies, and PUTs null", async () => {
    const { saveSlotId, clearSlotId, loadSlotId } = await mod();
    saveSlotId("upcoming");
    const seen = vi.fn();
    listeners.add(seen);
    clearSlotId();
    expect(loadSlotId()).toBeNull();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(api.updateSettingsTabSlot).toHaveBeenLastCalledWith({ tabSlot: null });
  });

  it("a cached id for an unavailable slot is ignored", async () => {
    const { loadSlotId, LS_SLOT_KEY } = await mod();
    store.set(LS_SLOT_KEY, "watchlist");
    expect(loadSlotId()).toBeNull();
  });
});

describe("tab-slot · hydrate: server wins", () => {
  it("adopts a server id that differs from the cache and notifies once", async () => {
    const { hydrateTabSlotFromServer, loadSlotId, LS_SLOT_KEY } = await mod();
    store.set(LS_SLOT_KEY, "spending");
    api.getSettingsTabSlot.mockResolvedValue({ tabSlot: "markets" });
    const seen = vi.fn();
    listeners.add(seen);
    await hydrateTabSlotFromServer();
    expect(loadSlotId()).toBe("markets");
    expect(seen).toHaveBeenCalledTimes(1);
    expect(api.updateSettingsTabSlot).not.toHaveBeenCalled();
  });

  it("a server null clears a local pin (cleared on another device)", async () => {
    const { hydrateTabSlotFromServer, loadSlotId, LS_SLOT_KEY } = await mod();
    store.set(LS_SLOT_KEY, "upcoming");
    api.getSettingsTabSlot.mockResolvedValue({ tabSlot: null });
    await hydrateTabSlotFromServer();
    expect(loadSlotId()).toBeNull();
  });

  it("does nothing when the cache already matches", async () => {
    const { hydrateTabSlotFromServer, LS_SLOT_KEY } = await mod();
    store.set(LS_SLOT_KEY, "markets");
    api.getSettingsTabSlot.mockResolvedValue({ tabSlot: "markets" });
    const seen = vi.fn();
    listeners.add(seen);
    await hydrateTabSlotFromServer();
    expect(seen).not.toHaveBeenCalled();
  });

  it("keeps the cache when the request fails (offline / 401)", async () => {
    const { hydrateTabSlotFromServer, loadSlotId, LS_SLOT_KEY } = await mod();
    store.set(LS_SLOT_KEY, "markets");
    api.getSettingsTabSlot.mockRejectedValue(new Error("offline"));
    await hydrateTabSlotFromServer();
    expect(loadSlotId()).toBe("markets");
  });
});
