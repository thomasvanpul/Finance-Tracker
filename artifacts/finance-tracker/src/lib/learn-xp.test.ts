// Locks the theme-unlock contract shared by desktop and mobile settings.
//
// Two things carry weight and both belong here:
//
//   1. `void` is the implicit default and MUST always be unlocked. Users
//      have no XP counter at first-launch and the picker still needs
//      a working choice.
//
//   2. Each paid theme is gated on its exact requiredXP. If someone
//      later renames the field, tweaks the ladder without meaning to,
//      or introduces an off-by-one on the >= check, this fails first.
//
// Preexisting bug the scan surfaced: neither settings picker actually
// gated clicks — the requiredXP label was decoration. Fix uses this
// exported predicate on both surfaces; the tests below prove the
// predicate itself agrees with the ladder, and separately the settings
// pickers now call it. Losing the call at either site would land users
// on a locked theme silently.

import { describe, it, expect } from "vitest";
import { isThemeUnlocked, THEME_REWARDS } from "./learn-xp";
import type { FintrackTheme } from "@/contexts/theme-context";

describe("isThemeUnlocked", () => {
  it("void is always unlocked regardless of XP — implicit default", () => {
    expect(isThemeUnlocked("void", 0)).toBe(true);
    expect(isThemeUnlocked("void", 999999)).toBe(true);
  });

  it("free themes (requiredXP: 0) are unlocked at 0 XP", () => {
    // The user's current free set, per the "4 free" agreement:
    //   void (implicit) + phosphor, arctic, parchment.
    expect(isThemeUnlocked("phosphor", 0)).toBe(true);
    expect(isThemeUnlocked("arctic", 0)).toBe(true);
    expect(isThemeUnlocked("parchment", 0)).toBe(true);
  });

  it("slate and linen are LOCKED at 0 XP — moved to paid in this rebalance", () => {
    // Regression lock: if either drifts back to requiredXP: 0 the
    // rebalance is silently undone. Both were free before; the ask
    // was "4 free, everything else paid".
    expect(isThemeUnlocked("slate", 0)).toBe(false);
    expect(isThemeUnlocked("linen", 0)).toBe(false);
  });

  it("slate unlocks at exactly its requiredXP threshold (300)", () => {
    expect(isThemeUnlocked("slate", 299)).toBe(false);
    expect(isThemeUnlocked("slate", 300)).toBe(true);
    expect(isThemeUnlocked("slate", 301)).toBe(true);
  });

  it("linen unlocks at exactly its requiredXP threshold (500)", () => {
    expect(isThemeUnlocked("linen", 499)).toBe(false);
    expect(isThemeUnlocked("linen", 500)).toBe(true);
  });

  it("amber and midnight thresholds unchanged (200, 400)", () => {
    // These were left where they were on purpose — the UNCOMMON tier
    // now stays populated. Lock so the ladder doesn't shift silently.
    expect(isThemeUnlocked("amber", 199)).toBe(false);
    expect(isThemeUnlocked("amber", 200)).toBe(true);
    expect(isThemeUnlocked("midnight", 399)).toBe(false);
    expect(isThemeUnlocked("midnight", 400)).toBe(true);
  });

  it("every THEME_REWARDS entry gates on its own requiredXP", () => {
    // Programmatic sweep so a new theme added to the list is covered
    // without editing this file — if the boundary check drifts, this
    // is what catches it.
    for (const reward of THEME_REWARDS) {
      const id = reward.id as FintrackTheme;
      if (reward.requiredXP > 0) {
        expect(isThemeUnlocked(id, reward.requiredXP - 1)).toBe(false);
      }
      expect(isThemeUnlocked(id, reward.requiredXP)).toBe(true);
    }
  });

  it("unknown theme ids default to unlocked — a bad state must not lock the user out", () => {
    // Documented behaviour in the helper's header. Widening the type
    // union without adding a THEME_REWARDS entry is a TypeScript
    // problem, not a runtime lockout.
    expect(isThemeUnlocked("this-theme-does-not-exist" as FintrackTheme, 0)).toBe(true);
  });
});

describe("THEME_REWARDS ladder shape (rebalance invariant)", () => {
  it("has exactly 3 free non-void themes: phosphor, arctic, parchment", () => {
    // "4 free" per the agreement counts void as the implicit fourth.
    // If someone re-promotes slate or linen to 0, or adds another
    // free entry, this fails and the ladder-doc comment gets
    // updated at the same time.
    const free = THEME_REWARDS.filter((r) => r.requiredXP === 0).map((r) => r.id).sort();
    expect(free).toEqual(["arctic", "parchment", "phosphor"]);
  });

  it("UNCOMMON tier populated with early alternating rewards", () => {
    // amber (200, dark) → slate (300, light) → midnight (400, dark)
    // → linen (500, light). If a well-meaning refactor merges the
    // tier or bumps everything up, this lock catches it — the
    // "reward every ~200 XP for the first four unlocks" cadence is
    // what makes the first hour of XP feel worth grinding.
    const uncommon = THEME_REWARDS
      .filter((r) => r.rarity === "UNCOMMON")
      .sort((a, b) => a.requiredXP - b.requiredXP);
    expect(uncommon.map((r) => [r.id, r.requiredXP])).toEqual([
      ["amber", 200],
      ["slate", 300],
      ["midnight", 400],
      ["linen", 500],
    ]);
  });
});
