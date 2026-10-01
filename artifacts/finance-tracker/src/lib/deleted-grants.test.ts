// After account deletion, any Google/GitHub sign-in grant the server could
// not revoke is carried across sign-out to the sign-in screen, which is
// where the user lands. sessionStorage is stubbed with a Map.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { rememberRemainingGrants, readRemainingGrants, clearRemainingGrants, GRANT_HELP } from "./deleted-grants";

beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  });
});

describe("deleted-grants", () => {
  it("carries the remaining providers until cleared", () => {
    rememberRemainingGrants(["google", "github"]);
    expect(readRemainingGrants()).toEqual(["google", "github"]);
    clearRemainingGrants();
    expect(readRemainingGrants()).toEqual([]);
  });

  it("stores nothing when every grant was revoked", () => {
    rememberRemainingGrants([]);
    expect(readRemainingGrants()).toEqual([]);
  });

  it("drops anything that is not a known provider", () => {
    sessionStorage.setItem("nr-deleted-account-grants", JSON.stringify(["google", "apple", 4]));
    expect(readRemainingGrants()).toEqual(["google"]);
    sessionStorage.setItem("nr-deleted-account-grants", "not json");
    expect(readRemainingGrants()).toEqual([]);
  });

  it("has a removal page for every provider", () => {
    expect(GRANT_HELP.google.url).toBe("https://myaccount.google.com/connections");
    expect(GRANT_HELP.github.url).toBe("https://github.com/settings/applications");
  });
});
