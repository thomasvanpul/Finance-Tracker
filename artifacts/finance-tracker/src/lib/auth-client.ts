import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

// In dev, route through the Vite proxy (/api → Railway) so cookies land on localhost correctly.
// In production, go directly to the Railway URL.
const authBase = import.meta.env.DEV
  ? `${window.location.origin}/api/auth`
  : import.meta.env.VITE_API_URL
    ? `${(import.meta.env.VITE_API_URL as string).replace(/\/+$/, "")}/api/auth`
    : `${window.location.origin}/api/auth`;

export const authClient = createAuthClient({
  baseURL: authBase,
  plugins: [twoFactorClient()],
});

export type Session = typeof authClient.$Infer.Session;
