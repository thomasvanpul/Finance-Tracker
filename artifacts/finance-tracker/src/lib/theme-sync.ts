// Theme sync between server and localStorage cache.
//
// Server column app_settings.theme is the source of truth. localStorage
// under ft-theme is a cache so the signed-in user's theme paints on
// first frame rather than after the server round-trip.
//
// Resolution order (owned by ThemeProvider; this module is the wire):
//   - Signed in: server value wins on hydrate; localStorage is a
//     performance cache to prevent a flash of the wrong theme.
//     setTheme writes through to the server.
//   - Signed out: fixed default (DEFAULT_THEME below), NOT localStorage.
//     The auth screen must look the same for every first-time visitor.
//   - On sign-out: the cache is cleared so the next person at that
//     browser also gets the default rather than the previous user's.

import { updateSettingsTheme, getSettingsTheme } from "@workspace/api-client-react";
import type { FintrackTheme } from "@/contexts/theme-context";

// The one place the signed-out default lives. See the ThemeProvider
// docstring for why 'void' — this is the first impression of the
// product and the argument is that the app introduces itself as a
// dark instrument, not a light budgeting app.
export const DEFAULT_THEME: FintrackTheme = "void";

export const THEME_CACHE_KEY = "ft-theme";

const VALID: readonly FintrackTheme[] = [
  "void", "phosphor", "arctic", "parchment", "slate", "linen",
  "amber", "midnight", "matrix", "synthwave", "deep-space",
  "mario", "gilded", "bloodline",
];

export function isValidTheme(x: unknown): x is FintrackTheme {
  return typeof x === "string" && (VALID as readonly string[]).includes(x);
}

export function readCachedTheme(): FintrackTheme | null {
  try {
    const v = localStorage.getItem(THEME_CACHE_KEY);
    return isValidTheme(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeCachedTheme(theme: FintrackTheme): void {
  try {
    localStorage.setItem(THEME_CACHE_KEY, theme);
  } catch {
    // ignore
  }
}

export function clearCachedTheme(): void {
  try {
    localStorage.removeItem(THEME_CACHE_KEY);
  } catch {
    // ignore
  }
}

// Best-effort write. Called from setTheme once the user picks a new
// theme. Swallows errors — the local state is already applied; a 401
// will be caught by the auth guard on next navigation, other failures
// leave the server stale but the user still sees their choice this
// session and it gets retried on the next change.
export async function saveThemeToServer(theme: FintrackTheme): Promise<void> {
  try {
    await updateSettingsTheme({ theme });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[theme-sync] failed to save theme to server:", err);
  }
}

// Read the server's stored theme. Returns null when the request fails
// (offline, 401 pre-auth) so the caller can fall back to cache or
// default without conflating "server said default" with "no answer".
export async function fetchThemeFromServer(): Promise<FintrackTheme | null> {
  try {
    const { theme } = await getSettingsTheme();
    return isValidTheme(theme) ? theme : null;
  } catch {
    return null;
  }
}
