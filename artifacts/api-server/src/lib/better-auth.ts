import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import { db, userTable, sessionTable, accountTable, verificationTable, twoFactorTable } from "@workspace/db";

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: userTable,
      session: sessionTable,
      account: accountTable,
      verification: verificationTable,
      twoFactor: twoFactorTable,
    },
  }),
  baseURL: process.env.API_BASE_URL
    ?? (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : "http://localhost:3000"),
  trustedOrigins: allowedOrigins.length ? allowedOrigins : ["http://localhost:5173"],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
  },
  plugins: [
    twoFactor({ issuer: "Fintrack" }),
  ],
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
      requireLocalEmailVerified: false,
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  advanced: {
    // Frontend (Vercel) and backend (Railway) are on different domains,
    // so cookies must be SameSite=None to survive the Google OAuth redirect.
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
    },
  },
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
