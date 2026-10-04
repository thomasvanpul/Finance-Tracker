import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor, bearer } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { db, userTable, sessionTable, accountTable, verificationTable, twoFactorTable, passkeyTable } from "@workspace/db";
import { logger } from "./logger";
import {
  resolveEmailTransport,
  RESET_TRANSPORT_OFF_MESSAGE,
} from "./email-transport";
import {
  REQUIRE_EMAIL_VERIFICATION,
  EMAIL_VERIFICATION_EXPIRES_IN_SECONDS,
} from "./auth-policy";
import { configuredEmailFrom } from "./email-sender";

// A blank env var is UNSET, not a value. Render and Vercel both make it easy
// to create a key with an empty string, and `??` alone would have handed that
// empty string to better-auth as a base URL and to WebAuthn as an rpID.
function env(name: string): string | undefined {
  const raw = process.env[name];
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
}

const allowedOrigins = env("ALLOWED_ORIGINS")
  ? env("ALLOWED_ORIGINS")!.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

// The one origin this server calls itself. It is what better-auth builds
// every OAuth `redirect_uri` from, so it is registered with Google and
// GitHub and cannot be changed on one side alone. Read from config, never
// hardcoded — a rename is an env change plus a provider change, not a diff.
// Measured 2026-09-19: production answers `callbackBase`
// "https://financetracker.work" on /api/auth-providers, i.e. API_BASE_URL
// is the SPA origin and NOT this service's own Render URL, despite what
// the comment in render.yaml says.
const API_ORIGIN = env("API_BASE_URL")
  ?? env("RENDER_EXTERNAL_URL")
  ?? (env("RAILWAY_PUBLIC_DOMAIN")
    ? `https://${env("RAILWAY_PUBLIC_DOMAIN")}`
    : "http://localhost:3000");

function hostnameOf(origin: string, fallback: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return fallback;
  }
}

// EMAIL_FROM is the real knob (see email-sender.ts) and Resend rejects an
// unverified sender only at send time, never at boot — so an unset
// EMAIL_FROM fails silently until the first password-reset or verification
// email is attempted. Logging it here at module load (i.e. server boot)
// makes the gap visible in deploy logs instead of only in a user's
// undelivered inbox.
if (!env("EMAIL_FROM")) {
  logger.warn(
    { fallback: configuredEmailFrom() },
    "EMAIL_FROM is not set; falling back to a derived sender address that Resend will reject unless that domain is verified there",
  );
}

// Exported so the cutover behaviour is lockable in a test. Both are read at
// import time from env, which is the point: a rename is a deploy-time change,
// not a code change.
export const WEBAUTHN_RP_ID = env("PASSKEY_RP_ID") ?? hostnameOf(API_ORIGIN, "localhost");
export const WEBAUTHN_ORIGINS: string | string[] =
  allowedOrigins.length ? allowedOrigins : "http://localhost:4321";

const DEV_PORTS = [3000, 4173, 4321, 5173, 5174, 5175, 5176, 8080, 8000, 9000];
const localhostOrigins = DEV_PORTS.flatMap(
  (port) => [`http://localhost:${port}`, `https://localhost:${port}`],
);

// One dispatcher for every transactional mail this server sends.
//
// Both callers (password reset, email verification) run as better-auth
// background tasks, so nothing thrown in here reaches the HTTP response.
// The refusals that DO reach the user live in app.ts; this function's job is
// delivery and an honest log line, in that order — the "dispatched" line is
// written only after Resend has accepted the send, never before.
// Exported for lib/delete-code.ts, which mails a code rather than a link:
// exactly one of `url` and `code` is set, and the dev log shows whichever.
export async function sendTransactionalEmail(mail: {
  label: string;
  to: string;
  url?: string;
  code?: string;
  subject: string;
  html: string;
}): Promise<void> {
  const transport = resolveEmailTransport();

  if (transport.kind === "none") {
    logger.warn(
      { email: mail.to },
      `[${mail.label}] BLOCKED: no transport configured; nothing dispatched`,
    );
    throw new Error(RESET_TRANSPORT_OFF_MESSAGE);
  }

  // Dev-only. The link goes to the server log and no mail is sent.
  // Whoever turned DEV_EMAIL_LOG on is at the terminal that receives it;
  // see email-transport.ts for the two-condition gate that keeps this off
  // everywhere else.
  if (transport.kind === "dev-log") {
    logger.warn(
      mail.code ? { email: mail.to, code: mail.code } : { email: mail.to, link: mail.url },
      `[${mail.label}] DEV-ONLY: no email sent. ${mail.code ? "Enter the code above" : "Open the link above"} to continue.`,
    );
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore – resend is an optional peer; install it to enable email delivery
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: configuredEmailFrom(),
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
    });
    // Resend returns { data, error } — an HTTP-level error surfaces as a
    // non-null `error`. Log AFTER we know the send succeeded.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = (result as any)?.error;
    if (err) {
      logger.error({ email: mail.to, err }, `[${mail.label}] Resend rejected the send`);
      throw new Error(`Failed to send ${mail.label.toLowerCase()} email.`);
    }
    logger.info({ email: mail.to }, `[${mail.label}] dispatched`);
  } catch (err) {
    logger.error({ email: mail.to, err: String(err) }, `[${mail.label}] delivery failed`);
    throw err;
  }
}

const OAUTH_TOKEN_FIELDS = ["accessToken", "refreshToken", "idToken"] as const;

// Nulls only the token fields the write actually carries, so an update
// that never touched them (a password change) is not widened.
function withoutOAuthTokens(account: Record<string, unknown>): Record<string, null> {
  return Object.fromEntries(
    OAUTH_TOKEN_FIELDS.filter((field) => field in account).map((field) => [field, null]),
  );
}

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
  baseURL: API_ORIGIN,
  trustedOrigins: allowedOrigins.length
    ? [...allowedOrigins, ...localhostOrigins]
    : localhostOrigins,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // See lib/auth-policy.ts for what turning this on changes — sign-up
    // stops returning a session, sign-in 403s until the link is clicked,
    // and a duplicate sign-up answers with a synthetic success instead of
    // USER_ALREADY_EXISTS. app.ts refuses sign-up outright when no mail
    // transport is live, because this flag without one banks accounts that
    // can never be signed into.
    requireEmailVerification: REQUIRE_EMAIL_VERIFICATION,
    // Password reset flow. Which transport is live is resolved in
    // lib/email-transport.ts — read the reasoning there, including why
    // the refusal that actually protects the user sits in app.ts and not
    // in this callback.
    //
    // Short version: better-auth 1.6.23 runs this function as a
    // background task, so a throw here NEVER reaches the HTTP
    // response. It is a last-ditch guard and a log line, not a gate.
    sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
      await sendTransactionalEmail({
        label: "Password Reset",
        to: user.email,
        url,
        subject: "Reset your Numeris password",
        html: `<p>Click <a href="${url}">here</a> to reset your Numeris password. This link expires in 1 hour.</p>`,
      });
    },
  },
  // Email verification. Same transport, same background-task caveat, same
  // reason the real gate is in app.ts: better-auth 1.6.23 dispatches
  // sendVerificationEmail through runInBackgroundOrAwait
  // (dist/api/routes/sign-up.mjs:241), so a throw here is a log line and
  // nothing more.
  emailVerification: {
    // Both are explicit rather than inherited from
    // requireEmailVerification. sendOnSignIn matters more than it looks:
    // without it, a user who loses the first mail has no way back in from
    // the sign-in form — better-auth 403s and sends nothing
    // (dist/api/routes/sign-in.mjs:232).
    sendOnSignUp: true,
    sendOnSignIn: true,
    // Clicking the link signs them in. The alternative is bouncing a
    // verified user to a sign-in form to retype a password they set ninety
    // seconds ago, for no security gained — the token in the link is
    // single-use and already proves control of the address.
    autoSignInAfterVerification: true,
    expiresIn: EMAIL_VERIFICATION_EXPIRES_IN_SECONDS,
    sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
      await sendTransactionalEmail({
        label: "Email Verification",
        to: user.email,
        url,
        subject: "Confirm your email for Numeris",
        html: `<p>Confirm this address to finish setting up Numeris: <a href="${url}">verify my email</a>.</p><p>The link is good for 24 hours. If you did not create a Numeris account, ignore this message — nothing happens until the link is opened.</p>`,
      });
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
    // TOTP two-factor. `issuer` is the string the authenticator app
    // (Authy, 1Password, Google Authenticator, etc.) permanently
    // records against the user's enrolled secret and shows in its
    // account list — "Fintrack: user@example.com" until the user
    // deletes and re-enrols. It is the one place a rename cannot be
    // retroactively applied to existing users, so the value has to
    // match the shipping product name.
    twoFactor({ issuer: "Numeris" }),
    // Bearer-token plugin — accepts `Authorization: Bearer <token>`
    // alongside session cookies. Ships an opaque token on the sign-in
    // response as `set-auth-token`. Needed for the Capacitor iOS
    // shell, which loads from `capacitor://localhost` and cannot use
    // cross-scheme cookies — Safari's ITP blocks them and better-
    // auth's session_token never rides the request. Web keeps the
    // cookie path; native switches to bearer via the client's
    // setAuthTokenGetter wired at boot (lib/native-auth.ts).
    // See docs/BACKLOG.md § G13 for the full decision.
    bearer(),
    // Passkey plugin — WebAuthn platform-authenticator sign-in.
    // rpName is the human-readable relying-party label the browser
    // shows in the passkey UI ("Sign in to Numeris"). rpID must be
    // the effective apex or subdomain the site runs at; on
    // localhost dev, better-auth infers it from the request Origin
    // so no override is needed here. origin is the fully-qualified
    // URL(s) allowed to complete WebAuthn — production frontend
    // plus the dev localhost origins already covered above.
    //
    // NB: WebAuthn is not usable from the Capacitor WebView
    // (`capacitor://localhost` cannot bind to Associated Domains).
    // The client hides the passkey button in native builds — this
    // registration still stands for web users. See G14.
    passkey({
      rpName: "Numeris",
      // rpID is the domain BAKED INTO every credential the authenticator
      // stores. WebAuthn has no migration for it: change it and every
      // already-enrolled passkey stops being offered, with no error
      // anywhere — the browser simply finds nothing to sign with. That is
      // the silent class of failure, so it is explicit here rather than
      // inferred from baseURL behind our backs.
      //
      // The default reproduces exactly what the plugin computed before
      // (`new URL(baseURL).hostname`), so nothing changes today. On the
      // day API_BASE_URL moves to numeris.page, rpID moves with it and
      // existing passkeys DIE — unavoidable, because rpID must be a
      // registrable suffix of the origin the ceremony runs on. Users
      // re-enrol from Settings → Sign-in Methods. PASSKEY_RP_ID exists so
      // that is a decision someone makes, not something that happens.
      rpID: WEBAUTHN_RP_ID,
      // ALL configured origins, not just the first. The plugin passes this
      // straight to @simplewebauthn's expectedOrigin, which accepts an
      // array, and taking [0] meant that during a domain cutover — when
      // ALLOWED_ORIGINS legitimately lists both the old and the new host —
      // every passkey ceremony from whichever host happened to be second
      // in the list failed verification. Empty config still falls back to
      // the dev origin, so this widens nothing when nothing is set.
      origin: WEBAUTHN_ORIGINS,
    }),
  ],
  account: {
    accountLinking: {
      enabled: true,
      // Google and Apple only surface verified addresses in their
      // OAuth flows — Google via id_token.email_verified, Apple via
      // the Apple-signed ID token. Trusting them for auto-linking is
      // sound; the OAuth provider's own verification is what backs
      // the "this email belongs to this account" claim.
      //
      // GitHub is DELIBERATELY NOT in this list. See the test in
      // lib/better-auth.test.ts for the full reasoning. Short version:
      // auto-linking GitHub to an existing user by email means anyone
      // controlling a GitHub account with the user's email address
      // gets straight into their financial data — account takeover
      // mediated by a third party's email policy. Blast radius here
      // is bank balances, not a forum profile. GitHub still works —
      // it falls through to the standard emailVerified gate, and
      // users who want it link it deliberately from the Sign-in
      // Methods panel in Settings.
      trustedProviders: ["google", "apple"],
      requireLocalEmailVerified: false,
    },
  },
  // OAuth tokens are dropped before every account write. Numeris uses a
  // provider only to prove who is signing in, then never calls it again —
  // nothing reads accessToken, refreshToken or idToken back. Stored, each
  // one is a live credential to the user's Google or GitHub account sitting
  // in a finance database for no purpose. better-auth 1.6.23 has no switch
  // to skip storing them (encryptOAuthTokens only encrypts), and every
  // account create/update runs through these hooks (internal-adapter.mjs).
  // A feature that needs to call a provider later must remove this and
  // turn on encryptOAuthTokens instead. Rows written before this landed
  // still hold tokens — clearing those is a separate, one-time job.
  databaseHooks: {
    account: {
      create: {
        before: async (account) => ({ data: { ...account, ...withoutOAuthTokens(account) } }),
      },
      update: {
        before: async (account) => ({ data: { ...account, ...withoutOAuthTokens(account) } }),
      },
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
