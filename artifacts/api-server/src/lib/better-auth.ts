import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import { db, userTable, sessionTable, accountTable, verificationTable, twoFactorTable } from "@workspace/db";

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

const DEV_PORTS = [3000, 4173, 4321, 5173, 5174, 5175, 5176, 8080, 8000, 9000];
const localhostOrigins = DEV_PORTS.flatMap(
  (port) => [`http://localhost:${port}`, `https://localhost:${port}`],
);

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
  trustedOrigins: allowedOrigins.length
    ? [...allowedOrigins, ...localhostOrigins]
    : localhostOrigins,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
      // Log to console in dev; in production configure Resend or SMTP
      console.log(`[Password Reset] Send to ${user.email}: ${url}`);
      // If RESEND_API_KEY is set, attempt to use Resend (must be installed separately)
      if (process.env.RESEND_API_KEY) {
        try {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore – resend is an optional peer; install it to enable email delivery
          const { Resend } = await import("resend");
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: process.env.EMAIL_FROM ?? "noreply@financetracker.work",
            to: user.email,
            subject: "Reset your Fintrack password",
            html: `<p>Click <a href="${url}">here</a> to reset your password. This link expires in 1 hour.</p>`,
          });
        } catch (err) {
          console.error("[Password Reset] Resend delivery failed:", err);
        }
      }
    },
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
