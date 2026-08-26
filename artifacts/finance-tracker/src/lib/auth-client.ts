import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import { isNativeShell, captureAuthTokenFromResponse } from "./native-auth";

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
  // On every successful auth-endpoint response, inspect for the
  // `set-auth-token` header set by better-auth's bearer plugin
  // (server-side G13 · 1/5). captureAuthTokenFromResponse is a no-op
  // on web — it only writes to Preferences when isNativeShell() is
  // true. The bearer plugin sends the header on sign-in / sign-up
  // and no-ops elsewhere; this callback stays quiet on all other
  // endpoints because the header is absent.
  fetchOptions: {
    onSuccess: (ctx: { response: Response }) => {
      void captureAuthTokenFromResponse(ctx.response);
    },
  },
});

export type Session = typeof authClient.$Infer.Session;
