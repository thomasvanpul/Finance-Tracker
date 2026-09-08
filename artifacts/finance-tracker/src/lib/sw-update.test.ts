import { describe, it, expect } from "vitest";
import { decideReload, isTyping, UPDATE_POLL_MS } from "./sw-update";

const el = (tagName: string, extra: Record<string, unknown> = {}): Element =>
  ({ tagName, ...extra }) as unknown as Element;

describe("decideReload", () => {
  const base = { wasControlled: true, alreadyReloading: false, typing: false };

  it("reloads when a new worker takes over a tab that already had one", () => {
    expect(decideReload(base)).toBe("reload");
  });

  it("ignores the first-ever worker claiming the page", () => {
    // Every user's first page view fires controllerchange. Reloading on it
    // would be a reload for nothing, on every first visit.
    expect(decideReload({ ...base, wasControlled: false })).toBe("ignore");
  });

  it("still reloads on the NEXT change after that first claim", () => {
    // The guard is per-change, not per-tab. Reading it once at boot made a
    // browser's first-ever visit immune to every later deploy, which the
    // end-to-end check caught: the tab sat on the old build for two minutes.
    expect(decideReload({ ...base, wasControlled: true })).toBe("reload");
  });

  it("never reloads twice", () => {
    expect(decideReload({ ...base, alreadyReloading: true })).toBe("ignore");
  });

  it("waits rather than throwing away what the user is typing", () => {
    expect(decideReload({ ...base, typing: true })).toBe("wait");
  });

  it("a second reload request while typing is still ignored, not queued", () => {
    expect(decideReload({ ...base, alreadyReloading: true, typing: true })).toBe("ignore");
  });
});

describe("isTyping", () => {
  it("is false when nothing has focus", () => {
    expect(isTyping(null)).toBe(false);
    expect(isTyping(undefined)).toBe(false);
    expect(isTyping(el("BODY"))).toBe(false);
  });

  it("is true for a field the user has written something into", () => {
    expect(isTyping(el("TEXTAREA", { value: "half a note" }))).toBe(true);
    expect(isTyping(el("INPUT", { type: "text", value: "Tesco" }))).toBe(true);
    expect(isTyping(el("INPUT", { type: "number", value: "42" }))).toBe(true);
    expect(isTyping(el("INPUT", { type: "search", value: "rent" }))).toBe(true);
    expect(isTyping(el("INPUT", { value: "x" }))).toBe(true);
    expect(isTyping(el("DIV", { isContentEditable: true, textContent: "draft" }))).toBe(true);
  });

  it("is false for a focused but EMPTY field", () => {
    // The sign-in screen autofocuses an empty email input. Testing focus
    // alone made the whole module a no-op on exactly the page a forgotten
    // tab sits on — found by the end-to-end check, not by reading the code.
    expect(isTyping(el("INPUT", { type: "email", value: "" }))).toBe(false);
    expect(isTyping(el("INPUT", { type: "text" }))).toBe(false);
    expect(isTyping(el("TEXTAREA", { value: "   " }))).toBe(false);
    expect(isTyping(el("DIV", { isContentEditable: true, textContent: "" }))).toBe(false);
  });

  it("is false for an input that cannot hold text at all", () => {
    for (const type of ["button", "submit", "reset", "checkbox", "radio", "file", "range", "image"]) {
      expect(isTyping(el("INPUT", { type, value: "on" })), type).toBe(false);
    }
  });

  it("does not care about tag case", () => {
    expect(isTyping(el("textarea", { value: "typed" }))).toBe(true);
  });
});

describe("poll interval", () => {
  it("is frequent enough that a deploy reaches an open tab within a minute", () => {
    // The bug being fixed is a tab that never asks at all. A minute is
    // short enough that a design change is visible while it is still being
    // discussed, and long enough to be free.
    expect(UPDATE_POLL_MS).toBeLessThanOrEqual(60_000);
    expect(UPDATE_POLL_MS).toBeGreaterThanOrEqual(15_000);
  });
});
