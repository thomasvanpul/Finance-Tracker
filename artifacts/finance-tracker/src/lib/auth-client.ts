import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

const baseURL = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export const authClient = createAuthClient({
  baseURL: baseURL ? `${baseURL}/api/auth` : "/api/auth",
  plugins: [twoFactorClient()],
});

export type Session = typeof authClient.$Infer.Session;
