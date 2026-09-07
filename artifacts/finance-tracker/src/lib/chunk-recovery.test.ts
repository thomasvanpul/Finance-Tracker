// Every route in both shells is lazy(), so a failed dynamic import is a
// routine event, not an exotic one — a deploy landing mid-session is
// enough to cause it (see the service-worker note in chunk-recovery.ts).
// Before this module the only handler was RootErrorBoundary, which
// renders a raw TypeError and its stack.
//
// The two properties worth pinning: the failure is RECOGNISED across the
// wordings browsers actually use, and recovery reloads AT MOST ONCE so a
// genuinely missing chunk cannot loop.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isChunkLoadError,
  shouldAttemptReload,
  clearChunkReloadAttempt,
  RELOAD_WINDOW_MS,
} from "./chunk-recovery";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as any).sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
});
afterEach(() => { delete (globalThis as any).sessionStorage; });

describe("isChunkLoadError", () => {
  // The exact string from the production error Thomas reported.
  it("matches the Chrome wording that was actually observed", () => {
    expect(isChunkLoadError(new TypeError(
      "Failed to fetch dynamically imported module: https://financetracker.work/assets/decisions-sE6MJwop.js",
    ))).toBe(true);
  });

  it("matches the other browsers' wordings", () => {
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
  });

  it("matches a ChunkLoadError by name, without a message", () => {
    const e = new Error("");
    e.name = "ChunkLoadError";
    expect(isChunkLoadError(e)).toBe(true);
  });

  it("does not claim ordinary render bugs", () => {
    // The boundary rethrows anything it does not match, so a false
    // positive here would swallow a real bug into a reload loop.
    expect(isChunkLoadError(new TypeError("x.map is not a function"))).toBe(false);
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe("shouldAttemptReload", () => {
  it("allows the first attempt and refuses the second", () => {
    const t = 1_000_000;
    expect(shouldAttemptReload(t)).toBe(true);
    expect(shouldAttemptReload(t + 100)).toBe(false);
  });

  it("refuses every attempt inside the window", () => {
    const t = 1_000_000;
    shouldAttemptReload(t);
    for (let i = 1; i < 20; i++) {
      expect(shouldAttemptReload(t + i * 1_000)).toBe(false);
    }
  });

  it("allows a fresh attempt once the window has passed", () => {
    // Without this, one unlucky reload would disable recovery for the
    // rest of the tab's life — so a deploy an hour later would show the
    // error page instead of healing.
    const t = 1_000_000;
    shouldAttemptReload(t);
    expect(shouldAttemptReload(t + RELOAD_WINDOW_MS + 1)).toBe(true);
  });

  it("lets a manual retry through after clearing", () => {
    const t = 1_000_000;
    shouldAttemptReload(t);
    expect(shouldAttemptReload(t + 100)).toBe(false);
    clearChunkReloadAttempt();
    expect(shouldAttemptReload(t + 200)).toBe(true);
  });

  it("still recovers when sessionStorage throws", () => {
    // Private windows throw on access. A recovery path that itself
    // throws is not one; one reload per failure beats a raw TypeError,
    // and the browser's own loop protection is the backstop.
    (globalThis as any).sessionStorage = {
      getItem() { throw new Error("denied"); },
      setItem() { throw new Error("denied"); },
      removeItem() { throw new Error("denied"); },
    };
    expect(() => shouldAttemptReload()).not.toThrow();
    expect(shouldAttemptReload()).toBe(true);
    expect(() => clearChunkReloadAttempt()).not.toThrow();
  });

  it("ignores a corrupt stored value rather than refusing forever", () => {
    store.set("nr-chunk-reload-attempt", "not-a-number");
    expect(shouldAttemptReload(1_000_000)).toBe(true);
  });
});
