// Account-level UI preferences — the server half of BACKLOG § G20/B.
//
// The client keeps preferences in localStorage exactly as before; the
// keys classified as account-level (artifacts/finance-tracker/src/lib/
// account-storage.ts) are mirrored here so they follow the user across
// devices. The server stores opaque strings and validates only shape
// and size: it does not know, and must not need to know, what any
// single preference means.

import { db, userPreferencesTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

// Lower-case, starts with a letter, then letters/digits and the
// separators the existing keys already use (ft-tx-notes,
// numeris:cashflow:multipliers, ix-companion-v1, nr-theme-effects-void).
export const PREFERENCE_KEY_PATTERN = /^[a-z][a-z0-9:_.-]{1,63}$/;
// Generous for a preference, small for a database: the largest real
// key today is a net-worth history array of a few kilobytes.
export const MAX_VALUE_CHARS = 262_144;
// One PATCH carries one debounce window of changes, or one chunk of a
// first-sign-in migration; the client chunks anything larger.
export const MAX_KEYS_PER_PATCH = 50;

export type PreferencePatch = Record<string, string | null>;

export type PatchValidation =
  | { ok: true; patch: PreferencePatch }
  | { ok: false; error: string };

// Pure. `null` means "remove this key"; anything that is not a string
// or null is rejected rather than coerced, so a client bug (writing an
// object) surfaces as a 400 instead of a stored "[object Object]".
export function validatePreferencePatch(body: unknown): PatchValidation {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be an object" };
  }
  const raw = (body as { preferences?: unknown }).preferences;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "preferences must be an object of key → string | null" };
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) return { ok: false, error: "preferences is empty" };
  if (entries.length > MAX_KEYS_PER_PATCH) {
    return { ok: false, error: `at most ${MAX_KEYS_PER_PATCH} keys per request` };
  }
  const patch: PreferencePatch = {};
  for (const [key, value] of entries) {
    if (!PREFERENCE_KEY_PATTERN.test(key)) {
      return { ok: false, error: `invalid preference key: ${JSON.stringify(key.slice(0, 80))}` };
    }
    if (value === null) {
      patch[key] = null;
      continue;
    }
    if (typeof value !== "string") {
      return { ok: false, error: `preference ${key} must be a string or null` };
    }
    if (value.length > MAX_VALUE_CHARS) {
      return { ok: false, error: `preference ${key} exceeds ${MAX_VALUE_CHARS} characters` };
    }
    patch[key] = value;
  }
  return { ok: true, patch };
}

export async function getPreferences(userId: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ key: userPreferencesTable.key, value: userPreferencesTable.value })
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId));
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

export interface PatchResult {
  updated: number;
  removed: number;
}

export async function patchPreferences(userId: string, patch: PreferencePatch): Promise<PatchResult> {
  const removals = Object.keys(patch).filter((k) => patch[k] === null);
  const upserts = Object.entries(patch).filter((e): e is [string, string] => typeof e[1] === "string");
  return db.transaction(async (tx) => {
    let removed = 0;
    if (removals.length > 0) {
      const res = await tx
        .delete(userPreferencesTable)
        .where(and(eq(userPreferencesTable.userId, userId), inArray(userPreferencesTable.key, removals)));
      removed = res.rowCount ?? 0;
    }
    if (upserts.length > 0) {
      await tx
        .insert(userPreferencesTable)
        .values(upserts.map(([key, value]) => ({ userId, key, value })))
        .onConflictDoUpdate({
          target: [userPreferencesTable.userId, userPreferencesTable.key],
          set: { value: sql`excluded.value`, updatedAt: new Date() },
        });
    }
    return { updated: upserts.length, removed };
  });
}
