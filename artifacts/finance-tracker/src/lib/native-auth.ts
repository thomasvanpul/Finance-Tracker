// Native-shell authentication bridge (G13 · option 3 · bearer).
//
// The Capacitor WebView loads from `capacitor://localhost` (iOS default;
// see @capacitor/cli declarations — iosScheme can't be `http` or `https`).
// Cookies set on the API domain never ride requests from that origin —
// different scheme, and `Secure` cookies won't leave a non-HTTPS origin
// anyway. So we replace cookies with a bearer token on native.
//
// Flow:
//   1. authClient wraps every auth-endpoint fetch with an onSuccess hook
//      that reads `set-auth-token` from the response headers
//      (captureAuthTokenFromResponse) and stashes it in
//      @capacitor/preferences via storeNativeAuthToken.
//   2. On every subsequent API call, custom-fetch.ts:354-358 asks the
//      registered token getter for a token. loadNativeAuthToken returns
//      the stored one, and custom-fetch adds `Authorization: Bearer <t>`.
//   3. clearNativeAuthToken runs on sign-out so a fresh sign-in doesn't
//      inherit the previous session.
//
// Web is untouched. isNativeShell returns false in a browser (no
// window.Capacitor.isNativePlatform), setAuthTokenGetter stays null, and
// the request path continues to use cookies as before. The cookie budget
// lock still bites on the web configuration where it always did.

import { setAuthTokenGetter } from "@workspace/api-client-react";
import { Preferences } from "@capacitor/preferences";

const TOKEN_KEY = "nr-native-auth-token";
// better-auth's bearer plugin emits the token as `set-auth-token` on the
// sign-in response. This is the header name to read on capture and to
// prepend as `Authorization: Bearer <value>` on outbound requests.
const RESPONSE_TOKEN_HEADER = "set-auth-token";

// In-memory cache — Preferences.get is async and the token getter is
// invoked synchronously-ish on every fetch. Warm the cache on init and
// keep it consistent with Preferences whenever storeNativeAuthToken or
// clearNativeAuthToken runs.
let cachedToken: string | null = null;
let cacheHydrated = false;

export function isNativeShell(): boolean {
  try {
    const cap = (globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return !!cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform();
  } catch {
    return false;
  }
}

async function hydrateCache(): Promise<void> {
  if (cacheHydrated) return;
  cacheHydrated = true;
  try {
    const { value } = await Preferences.get({ key: TOKEN_KEY });
    cachedToken = value ?? null;
  } catch {
    cachedToken = null;
  }
}

export async function loadNativeAuthToken(): Promise<string | null> {
  if (!isNativeShell()) return null;
  await hydrateCache();
  return cachedToken;
}

export async function storeNativeAuthToken(token: string): Promise<void> {
  if (!isNativeShell()) return;
  cachedToken = token;
  cacheHydrated = true;
  try {
    await Preferences.set({ key: TOKEN_KEY, value: token });
  } catch {
    // Preferences failure is non-fatal — we still have the in-memory
    // cache for this session. Next app launch would restart auth.
  }
}

export async function clearNativeAuthToken(): Promise<void> {
  cachedToken = null;
  cacheHydrated = true;
  if (!isNativeShell()) return;
  try {
    await Preferences.remove({ key: TOKEN_KEY });
  } catch {
    // See storeNativeAuthToken — swallow storage errors, in-memory
    // clear has already happened.
  }
}

// Called from the authClient's fetchOptions.onSuccess hook. Every
// successful auth-endpoint response is inspected; the bearer plugin
// sets the header on sign-in and sign-up, not on other endpoints, so
// this quietly no-ops for the rest.
export async function captureAuthTokenFromResponse(response: Response): Promise<void> {
  if (!isNativeShell()) return;
  const token = response.headers.get(RESPONSE_TOKEN_HEADER);
  if (token && token.length > 0) {
    await storeNativeAuthToken(token);
  }
}

// Wire the api-client's Authorization-header getter to Preferences.
// Called once at boot from main.tsx. Safe to call on web — sets a
// getter that always returns null so no header is added.
export function initNativeAuth(): void {
  if (!isNativeShell()) {
    setAuthTokenGetter(null);
    return;
  }
  setAuthTokenGetter(() => loadNativeAuthToken());
  // Fire-and-forget cache warm so the first fetch already has the
  // token in memory instead of an async round-trip to Preferences.
  void hydrateCache();
}
