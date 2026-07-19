import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

// Always point directly at Railway when VITE_API_URL is set (both dev and prod).
// Bypassing the Vite proxy avoids cookie-forwarding issues and mirrors the production flow exactly.
const authBase = import.meta.env.VITE_API_URL
  ? `${(import.meta.env.VITE_API_URL as string).replace(/\/+$/, "")}/api/auth`
  : `${window.location.origin}/api/auth`;

export const authClient = createAuthClient({
  baseURL: authBase,
  plugins: [twoFactorClient()],
});

export type Session = typeof authClient.$Infer.Session;
