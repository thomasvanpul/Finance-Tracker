import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { db, userTable, sessionTable, accountTable, verificationTable, twoFactorTable, passkeyTable } from "@workspace/db";
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
    // Disabled deliberately. cookieCache serialises the whole session AND user
    // object into a session_data cookie to save a DB read — already 987 bytes
    // on a nearly-empty account, and it grows with the user record. Combined
    // with stale OAuth state cookies that pushed the request header past the
    // edge proxy limit, every page started returning 494
    // REQUEST_HEADER_TOO_LARGE once signed in.
    //
    // The DB read it avoids is a single indexed lookup against Neon. That is
    // not worth putting user data in a cookie on every request, where it also
    // has to be re-sent to the server on every asset fetch.
    cookieCache: { enabled: false },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: userTable,
      session: sessionTable,
      account: accountTable,
      verification: verificationTable,
      twoFactor: twoFactorTable,
      passkey: passkeyTable,
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
    // Passkey plugin — WebAuthn platform-authenticator sign-in.
    // rpName is the human-readable relying-party label the browser
    // shows in the passkey UI ("Sign in to Numeris"). rpID must be
    // the effective apex or subdomain the site runs at; on
    // localhost dev, better-auth infers it from the request Origin
    // so no override is needed here. origin is the fully-qualified
    // URL(s) allowed to complete WebAuthn — production frontend
    // plus the dev localhost origins already covered above.
    passkey({
      rpName: "Numeris",
      origin: allowedOrigins.length ? allowedOrigins[0] : "http://localhost:4321",
    }),
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
    // SameSite=Lax, NOT None. This was "none" when the frontend was on Vercel
    // and the API on Railway — different registrable domains, so cookies had to
    // be cross-site to survive the OAuth redirect. That is no longer true:
    // Vercel rewrites /api/* to the API, so every request is same-origin.
    //
    // Keeping "none" was actively harmful. Cross-site cookies are exempt from
    // the normal clean-up a Lax cookie gets, so every abandoned OAuth attempt
    // left its state cookie behind. They accumulated until the Cookie header
    // exceeded the proxy limit and every /api/* call returned 494 (Request
    // Header Or Cookie Too Large) — the sign-in page lost its provider buttons
    // because it could no longer reach its own API.
    //
    // Lax is also the correct setting on merit: it still survives a top-level
    // GET redirect back from Google or GitHub, which is the only cross-site
    // navigation in the flow.
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: true,
    },
  },
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
