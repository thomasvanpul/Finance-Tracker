// Drop-in `fetch` wrapper for relative /api paths (G13 · 3/5).
//
// Two things it fixes at once, both same-shape as `fetch` so call sites
// change one identifier only:
//
//   1. Native shell (Capacitor iOS) origin is `capacitor://localhost`.
//      A raw `fetch("/api/foo")` resolves inside the local bundle and
//      never leaves the device. This wrapper prepends VITE_NATIVE_API_URL
//      when running under Capacitor, so the request actually reaches
//      the API server. On web nothing is prepended — Vercel's rewrite
//      at /api/* handles routing.
//
//   2. Native has no session cookie (see native-auth.ts for the why).
//      Every request needs `Authorization: Bearer <token>` from the
//      stored bearer. This wrapper reads the token from Preferences
//      (via loadNativeAuthToken) and attaches the header. On web it
//      does not add the header, because cookies are still active and
//      an unnecessary Authorization would just make the request larger.
//
// Use this for endpoints that need raw Response access — SSE streams,
// file downloads (blob), health checks that want to inspect Response
// directly. `customFetch` in @workspace/api-client-react is the JSON-
// parsing path; it handles the same base-URL and bearer concerns for
// its own call sites through setBaseUrl + setAuthTokenGetter.

import { loadNativeAuthToken, isNativeShell } from "./native-auth";

const NATIVE_API_URL = import.meta.env.VITE_NATIVE_API_URL as string | undefined;

// Absolute URL for a relative /api path when native; return the input
// unchanged otherwise. Exported for callers that need to construct a
// URL but not immediately call `fetch` (e.g. `<a href={apiUrl(...)}>`
// for a native download link).
export function apiUrl(path: string): string {
  if (isNativeShell() && NATIVE_API_URL && path.startsWith("/")) {
    return `${NATIVE_API_URL.replace(/\/+$/, "")}${path}`;
  }
  return path;
}

// Drop-in `fetch` for /api paths. Preserves `credentials`, `signal`,
// `method`, `body`, `headers`, and returns Response — nothing about
// the response is transformed here, unlike customFetch which parses.
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = apiUrl(input);
  const headers = new Headers(init.headers);
  if (isNativeShell()) {
    const token = await loadNativeAuthToken();
    if (token && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${token}`);
    }
  }
  // credentials: "include" is idempotent-safe on native (cookies get
  // dropped anyway by the WebView origin mismatch) and keeps the web
  // path working exactly as before.
  return fetch(url, { credentials: "include", ...init, headers });
}
