import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

// Always same-origin. In dev the Vite proxy forwards /api to the local API; in
// production Vercel rewrites /api/* to the Render service (see vercel.json).
// This is not a convenience — a cross-domain API sets a third-party cookie,
// which Safari blocks outright, so sign-in succeeds and the session is
// discarded. Leave VITE_API_URL unset in production.
const authBase = import.meta.env.DEV
  ? `${window.location.origin}/api/auth`
  : import.meta.env.VITE_API_URL
    ? `${(import.meta.env.VITE_API_URL as string).replace(/\/+$/, "")}/api/auth`
    : `${window.location.origin}/api/auth`;

export const authClient = createAuthClient({
  baseURL: authBase,
  plugins: [twoFactorClient(), passkeyClient()],
});

export type Session = typeof authClient.$Infer.Session;
