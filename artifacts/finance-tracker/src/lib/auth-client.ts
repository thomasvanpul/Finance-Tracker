import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import {
  isNativeShell,
  captureAuthTokenFromResponse,
  getBearerTokenForAuthClient,
} from "./native-auth";

// Web: same-origin. In dev the Vite proxy forwards /api to the local API; in
// production Vercel rewrites /api/* to the Render service (see vercel.json).
// This is not a convenience — a cross-domain API sets a third-party cookie,
// which Safari blocks outright, so sign-in succeeds and the session is
// discarded. Leave VITE_API_URL unset in production web.
//
// Native (Capacitor iOS): the WebView origin is `capacitor://localhost`,
// so relative /api paths resolve to the local bundle and never leave the
// device. VITE_NATIVE_API_URL is baked into the native bundle at build
// time and points at the API domain directly (e.g. Render URL). The
// bearer plugin server-side (G13 · 1/5) then handles auth without
// cookies — see lib/native-auth.ts.
const NATIVE_API_URL = import.meta.env.VITE_NATIVE_API_URL as string | undefined;

function computeAuthBase(): string {
  if (import.meta.env.DEV) return `${window.location.origin}/api/auth`;
  if (isNativeShell() && NATIVE_API_URL) {
    return `${NATIVE_API_URL.replace(/\/+$/, "")}/api/auth`;
  }
  if (import.meta.env.VITE_API_URL) {
    return `${(import.meta.env.VITE_API_URL as string).replace(/\/+$/, "")}/api/auth`;
  }
  return `${window.location.origin}/api/auth`;
}

export const authClient = createAuthClient({
  baseURL: computeAuthBase(),
  plugins: [twoFactorClient(), passkeyClient()],
  // Two hooks — both essential, and previously only one was wired.
  //
  //   auth.token → the request-side hook. @better-fetch calls this
  //   before every request and, IF the promise resolves to a truthy
  //   string, attaches `Authorization: Bearer <t>`. On web it resolves
  //   to `undefined` (isNativeShell false → loadNativeAuthToken null →
  //   getBearerTokenForAuthClient bridges to undefined) — @better-fetch's
  //   `if (!token) return headers` short-circuit at dist/index.js:131-136
  //   fires and no header is added. On native it resolves to the stored
  //   bearer token from @capacitor/preferences.
  //
  //   The 28-Aug device failure was this hook missing entirely —
  //   captureAuthTokenFromResponse (below) stored the token from
  //   sign-up's response, but nothing on the request side ever sent
  //   it back. authClient's own $fetch pipeline runs completely
  //   separately from api-client-react's customFetch, so the token
  //   getter registered via setAuthTokenGetter did NOT cover the
  //   get-session and other authClient calls. Three parallel wires;
  //   this hook was the third and was missing.
  //
  //   onSuccess → the response-side hook. Inspects every successful
  //   auth-endpoint response for the `set-auth-token` header emitted
  //   by better-auth's bearer plugin, and stashes it in Preferences.
  //   captureAuthTokenFromResponse is a no-op on web — it only writes
  //   when isNativeShell() is true. The bearer plugin sets the header
  //   only on sign-in / sign-up; this hook stays quiet on every other
  //   endpoint because the header is absent.
  fetchOptions: {
    auth: {
      type: "Bearer",
      token: getBearerTokenForAuthClient,
    },
    onSuccess: (ctx: { response: Response }) => {
      void captureAuthTokenFromResponse(ctx.response);
    },
  },
});

export type Session = typeof authClient.$Infer.Session;
