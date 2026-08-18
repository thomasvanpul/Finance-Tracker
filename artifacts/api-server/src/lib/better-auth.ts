import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import { db, userTable, sessionTable, accountTable, verificationTable, twoFactorTable } from "@workspace/db";
import { logger } from "./logger";

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

const DEV_PORTS = [3000, 4173, 4321, 5173, 5174, 5175, 5176, 8080, 8000, 9000];
const localhostOrigins = DEV_PORTS.flatMap(
  (port) => [`http://localhost:${port}`, `https://localhost:${port}`],
);

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
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
    ?? (process.env.RENDER_EXTERNAL_URL
      ?? (process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : "http://localhost:3000")),
  trustedOrigins: allowedOrigins.length
    ? [...allowedOrigins, ...localhostOrigins]
    : localhostOrigins,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Password reset flow. Behaviour depends on whether the
    // outbound email transport is configured — RESEND_API_KEY on
    // the server. If it isn't, we THROW so better-auth returns an
    // error the client can render as "password reset is
    // unavailable in this environment". We never log "dispatching"
    // and then not send: that is the exact failure mode the F5/
    // auth-rebuild task named — reporting success for something
    // that didn't happen.
    //
    // The routes/auth-providers.ts endpoint reports the same fact
    // via `passwordResetEnabled: false` so the "Forgot password?"
    // link is HIDDEN in that case; this throw is the defence
    // against a stale UI or a direct API call reaching the reset
    // path anyway.
    sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
      if (!process.env.RESEND_API_KEY) {
        logger.warn(
          { email: user.email },
          "[Password Reset] BLOCKED: RESEND_API_KEY not configured; nothing dispatched",
        );
        throw new Error("Password reset email transport is not configured on this server.");
      }
      try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore – resend is an optional peer; install it to enable email delivery
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        const result = await resend.emails.send({
          from: process.env.EMAIL_FROM ?? "noreply@financetracker.work",
          to: user.email,
          subject: "Reset your Numeris password",
          html: `<p>Click <a href="${url}">here</a> to reset your password. This link expires in 1 hour.</p>`,
        });
        // Resend returns { data, error } — an HTTP-level error
        // surfaces as a non-null `error`. Log AFTER we know the
        // send succeeded, never before.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = (result as any)?.error;
        if (err) {
          logger.error({ email: user.email, err }, "[Password Reset] Resend rejected the send");
          throw new Error("Failed to send password reset email.");
        }
        logger.info({ email: user.email }, "[Password Reset] dispatched");
      } catch (err) {
        logger.error({ email: user.email, err: String(err) }, "[Password Reset] delivery failed");
        throw err;
      }
    },
  },
  // Social providers. Each is behind a runtime-env pair check
  // that MIRRORS routes/auth-providers.ts — a provider only
  // participates in signIn.social() when its credentials are
  // present here. The single source of truth for the UI
  // (auth-providers endpoint) checks the same envs, so a provider
  // is either usable end-to-end or invisible; never advertised
  // but broken.
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    ...(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
      ? {
          apple: {
            clientId: process.env.APPLE_CLIENT_ID,
            clientSecret: process.env.APPLE_CLIENT_SECRET,
            // Apple's OAuth response arrives as an application/
            // x-www-form-urlencoded POST — better-auth wants
            // appBundleIdentifier optional; leave defaulted here
            // unless a native app ships.
          },
        }
      : {}),
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
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
      // Apple and GitHub both return verified emails via OAuth
      // (Apple via ID token, GitHub via the user email API), so
      // they're safe to trust for auto-linking to an existing
      // email/password account. Kept here alongside google so
      // adding a fourth provider is a one-line list append.
      trustedProviders: ["google", "apple", "github"],
      requireLocalEmailVerified: false,
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
