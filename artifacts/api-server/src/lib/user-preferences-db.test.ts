// Shape and size limits on the preferences PATCH body. Pure — the
// validator never touches the database.

import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test:test@localhost/test";
});
vi.mock("@workspace/db", () => ({ db: {}, userPreferencesTable: {} }));

import {
  validatePreferencePatch,
  MAX_KEYS_PER_PATCH,
  MAX_VALUE_CHARS,
  PREFERENCE_KEY_PATTERN,
} from "./user-preferences-db";

describe("validatePreferencePatch", () => {
  it("accepts strings and nulls under the keys the client already uses", () => {
    const r = validatePreferencePatch({
      preferences: {
        "ft-tx-notes": "{}",
        "numeris:cashflow:multipliers": "[1,2]",
        "ix-companion-v1": "x",
        "nr-theme-effects-void": "false",
        "ft-nw-target": null,
      },
    });
    expect(r).toEqual({
      ok: true,
      patch: {
        "ft-tx-notes": "{}",
        "numeris:cashflow:multipliers": "[1,2]",
        "ix-companion-v1": "x",
        "nr-theme-effects-void": "false",
        "ft-nw-target": null,
      },
    });
  });

  it("rejects a non-object body, a missing map, an empty map, and arrays", () => {
    expect(validatePreferencePatch(null).ok).toBe(false);
    expect(validatePreferencePatch("x").ok).toBe(false);
    expect(validatePreferencePatch({}).ok).toBe(false);
    expect(validatePreferencePatch({ preferences: [] }).ok).toBe(false);
    expect(validatePreferencePatch({ preferences: {} }).ok).toBe(false);
  });

  it("rejects keys outside the pattern: upper case, leading digit, spaces, slashes, too long", () => {
    for (const bad of ["FT-notes", "1abc", "ft notes", "ft/notes", "a", "x".repeat(65), "__proto__"]) {
      const r = validatePreferencePatch({ preferences: { [bad]: "v" } });
      expect(r.ok, bad).toBe(false);
      expect(PREFERENCE_KEY_PATTERN.test(bad), bad).toBe(false);
    }
  });

  it("rejects non-string values instead of coercing them", () => {
    for (const bad of [1, true, {}, [], undefined]) {
      expect(validatePreferencePatch({ preferences: { "ft-x": bad } }).ok).toBe(false);
    }
  });

  it("caps value size and keys per request", () => {
    expect(validatePreferencePatch({ preferences: { "ft-x": "a".repeat(MAX_VALUE_CHARS) } }).ok).toBe(true);
    expect(validatePreferencePatch({ preferences: { "ft-x": "a".repeat(MAX_VALUE_CHARS + 1) } }).ok).toBe(false);
    const many: Record<string, string> = {};
    for (let i = 0; i < MAX_KEYS_PER_PATCH + 1; i++) many[`ft-k${i}`] = "v";
    expect(validatePreferencePatch({ preferences: many }).ok).toBe(false);
    delete many[`ft-k${MAX_KEYS_PER_PATCH}`];
    expect(validatePreferencePatch({ preferences: many }).ok).toBe(true);
  });
});
