import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import { existsSync } from "fs";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { toNodeHandler } from "better-auth/node";
import router from "./routes";
import healthRouter from "./routes/health";
import authProvidersRouter from "./routes/auth-providers";
import marketProvidersRouter from "./routes/market-providers";
import aiStatusRouter from "./routes/ai-status";
import { logger } from "./lib/logger";
import { auth } from "./lib/better-auth";
import {
  isEmailDeliverable,
  RESET_TRANSPORT_OFF_MESSAGE,
  VERIFICATION_TRANSPORT_OFF_MESSAGE,
} from "./lib/email-transport";
import { REQUIRE_EMAIL_VERIFICATION } from "./lib/auth-policy";
import { requestMetricsMiddleware } from "./lib/request-metrics";
import { requireAiConsent } from "./lib/ai-consent";

// True only when NODE_ENV is explicitly "development". Unset NODE_ENV → false → full production enforcement.
const IS_DEV = process.env.NODE_ENV === "development";

const app: Express = express();

// Two proxies sit in front of this app: Vercel rewrites /api/* to Render, and
// Render has its own edge. "1" only unwinds one hop, so req.ip resolved to
// Render's address, not the client's — better-auth logged "Rate limiting could
// not determine a client IP and is falling back to a single shared per-path
// bucket", meaning EVERY user in the world shared one bucket of 20.
app.set("trust proxy", 2);

// Security headers — must come before routes
app.use(
  helmet({
    // CSP is managed by the frontend CDN, not the API; disable here to avoid conflicts
    contentSecurityPolicy: false,
    // Allow same-origin iframe embedding of the SPA
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Per-request timing capture into request_metrics. See lib/request-metrics.ts
// for skipped paths, retention window, and failure discipline. Placed after
// pino-http (so pino's :req.id is available for correlated debugging) but
// before routers, CORS and every other middleware — the res.on('finish')
// listener fires after the response is sent regardless of which handler
// produced it, so latency of the insert never touches the response path.
app.use(requestMetricsMiddleware);

const configuredOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

class CorsError extends Error {}

app.use(
  cors({
    origin: (origin, callback) => {
      // Server-to-server or same-origin requests have no Origin header
      if (!origin) return callback(null, true);
      // Allow localhost only when explicitly in development
      if (IS_DEV && /^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
      // Fail-secure: deny all cross-origin requests when ALLOWED_ORIGINS is not configured
      if (configuredOrigins.length === 0) {
        callback(new CorsError("ALLOWED_ORIGINS not configured — cross-origin request denied"));
        return;
      }
      if (configuredOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new CorsError(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  }),
);

// Denied origins are a client error (403), not a server error (500)
app.use((err: Error, _req: Request, res: Response, next: NextFunction): void => {
  if (err instanceof CorsError) {
    res.status(403).json({ error: err.message });
    return;
  }
  next(err);
});

// ── Rate limiters ────────────────────────────────────────────────────────────

// Strict limiter for auth endpoints — prevent brute force and reset-email spam
// Brute-force protection belongs on the endpoints that accept credentials, not
// on the whole auth namespace. This limiter was applied to all /api/auth/*,
// including get-session, which the app polls on every page load — so ordinary
// use exhausted it and the sign-in page lost its provider buttons.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  skip: () => IS_DEV,
});

// Per-USER limiter for the AI endpoint (per-provider quota + inference
// spend is our cost). This is the one endpoint where a request costs
// real money and free-tier quota, so the budget belongs to the account,
// not the source IP.
//
// keyGenerator uses userId when available (the limiter is mounted after
// requireAuth so it usually is) and falls back to req.ip on the narrow
// window between requireAuth failure and this middleware — which
// shouldn't be reachable but the fallback keeps the limiter safe rather
// than crashing on undefined key.
//
// Per-IP was the previous shape and it got both cases backwards: users
// behind carrier NAT / office wifi shared one AI budget between them,
// while an abuser rotating IPs was never throttled at all.
// req.ip → shared-budget-for-honest-users AND unlimited-for-attackers.
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "AI rate limit exceeded. Please wait before sending more messages." },
  skip: () => IS_DEV,
  // express-rate-limit v8 rejects a bare req.ip here: a single IPv6 client is
  // handed a /64 and can present a different full address per request, so
  // keying on the address is no limit at all. ipKeyGenerator normalises to the
  // subnet. Without it the library throws ERR_ERL_KEY_GEN_IPV6 at module init.
  keyGenerator: (req: Request) =>
    (req as unknown as { userId?: string }).userId ?? ipKeyGenerator(req.ip ?? "unknown"),
});

// Separate, smaller budget for the vision endpoints. Measured 2026-10-03
// (.review/archive, finding 0db2198175d6): a chat turn on gpt-oss-120b costs
// ~$0.0006-0.0012 worst case (≤4k input @ $0.15/M, ≤1024 output @ $0.60/M).
// A receipt call on qwen3.8-27b costs more per request — not because the
// image inflates INPUT tokens much (Groq charges a flat 2048 input tokens
// per image, comparable to the chat route's own portfolio-context budget of
// ~2.5k tokens), but because the vision model's OUTPUT tokens are priced at
// $16/M vs chat's $0.60/M. /ai/receipt-split (itemised line extraction, up
// to 1024 output tokens) costs up to ~$0.0179/call — roughly 15x a chat
// turn at the ceiling; /receipt/parse and /ai/receipt-scan (smaller 256-512
// token outputs) cost roughly ~$0.0035-0.006/call, ~3-5x a chat turn.
// 10/min leaves room for a person photographing several receipts in a
// sitting while bounding worst-case spend from a retry loop or bug at
// roughly a third of what the shared 30/min budget would have allowed.
export const visionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "AI rate limit exceeded. Please wait before sending more messages." },
  skip: () => IS_DEV,
  keyGenerator: (req: Request) =>
    (req as unknown as { userId?: string }).userId ?? ipKeyGenerator(req.ip ?? "unknown"),
});

// General API limiter — guard all other financial endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
  skip: () => IS_DEV,
});

// Better Auth handles its own body parsing for /api/auth/* routes,
// so its handler must come BEFORE express.json().
// Strict limiter ONLY on credential-accepting paths. Everything else in the
// auth namespace (get-session, callbacks, the OAuth round trip) uses the
// general apiLimiter, which is generous enough for normal page loads.
//
// isCredentialPath is exported so the property test in
// app.rate-limit.test.ts can assert the predicate directly. The bug
// this locks against — strict limiter accidentally covering
// get-session — was invisible from the config object alone.
//
// `request-password-reset` is the name better-auth 1.6.23 actually serves
// (dist/api/routes/password.mjs). `forget-password` is the pre-1.x name and
// is kept only because better-auth's own limiter still lists both; on this
// version nothing is mounted there. Until 2026-09-19 the regex named ONLY
// the dead one, so the live reset-request endpoint — the one the comment
// above calls out as needing spam protection — had no limiter at all. The
// handler below terminates the request, so it never reaches apiLimiter
// either: it was unthrottled, not generously throttled.
const CREDENTIAL_PATHS = /^\/api\/auth\/(sign-in|sign-up|forget-password|request-password-reset|reset-password|change-password)/;
export function isCredentialPath(path: string): boolean {
  return CREDENTIAL_PATHS.test(path);
}

// Refuse a reset request this server cannot deliver, BEFORE better-auth
// handles it. This is the gate; the throw inside sendResetPassword is not,
// because better-auth 1.6.23 runs that callback as a background task and
// answers 200 "check your email" regardless. Without this the UI showed
// "Check your inbox" for a mail nobody sent.
//
// The message is the contract string the frontend classifier matches to
// render `reset_transport_off` — see lib/email-transport.ts.
// 503, not 4xx: the request is fine, the server is missing a capability.
// Nothing here depends on the email, so it reveals nothing about whether
// an account exists.
const RESET_REQUEST_PATH = /^\/api\/auth\/(request-password-reset|forget-password)/;

// Refuse a sign-up this server could never complete, for the same reason and
// in the same place. With REQUIRE_EMAIL_VERIFICATION on, a sign-up with no
// mail transport creates a user who is refused at every later sign-in and
// has no way to ask for another link — an account banked against an address
// nobody can prove they own. Better to say the server is not open.
//
// send-verification-email is the resend endpoint and is covered by the same
// answer; without it the "didn't get the mail?" button would report success
// for a mail nobody sent, which is the failure the reset path already taught
// us to close.
const SIGNUP_PATH = /^\/api\/auth\/(sign-up|send-verification-email)/;
export function isVerificationDependentPath(path: string): boolean {
  return SIGNUP_PATH.test(path);
}

app.all("/api/auth/{*path}", (req, res, next) => {
  if (RESET_REQUEST_PATH.test(req.path) && !isEmailDeliverable()) {
    res.status(503).json({ message: RESET_TRANSPORT_OFF_MESSAGE, code: "RESET_TRANSPORT_OFF" });
    return;
  }
  if (
    REQUIRE_EMAIL_VERIFICATION
    && isVerificationDependentPath(req.path)
    && !isEmailDeliverable()
  ) {
    res.status(503).json({
      message: VERIFICATION_TRANSPORT_OFF_MESSAGE,
      code: "VERIFICATION_TRANSPORT_OFF",
    });
    return;
  }
  if (isCredentialPath(req.path)) return authLimiter(req, res, next);
  return next();
}, toNodeHandler(auth));

// One path takes a larger JSON body: PATCH /api/settings/preferences
// receives a first-sign-in migration of every account-level localStorage
// key (see routes/preferences.ts; the server-side cap is 50 keys × 256 KiB
// per request). Everything else keeps the 100 KB default.
const jsonDefault = express.json();
const jsonPreferences = express.json({ limit: "4mb" });
app.use((req, res, next) =>
  (req.path === "/api/settings/preferences" ? jsonPreferences : jsonDefault)(req, res, next),
);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api", healthRouter);
// PUBLIC: auth-providers is the single source of truth for which
// login buttons the UI is allowed to render. Mounted BEFORE
// requireAuth because the page consuming it is the sign-in page
// itself. See routes/auth-providers.ts.
app.use("/api", authProvidersRouter);
// PUBLIC: market-provider health mirrors auth-providers' role for the
// quote chain. Mounted BEFORE requireAuth so an operator hitting
// /api/market/providers during an outage doesn't get 401 (which was
// the original diagnosis: 401-not-404 proved requireAuth had run and
// this route sat behind it). No userId is used inside the handler
// and no key value is returned — see routes/market-providers.ts.
app.use("/api", marketProvidersRouter);
// PUBLIC: /api/ai/status reports per-provider health for the whole
// chain (Groq, Cerebras). Same "diagnosable without shell"
// surface as the two above — so the operator can `curl` production and
// see which providers are configured + verified + which env vars to
// set for retirements. No user data, no key value. See
// routes/ai-status.ts. Chat / receipt-split / categorize stay behind
// requireAuth (they take user prompts and cost money to serve).
app.use("/api", aiStatusRouter);

// Paths (relative to /api) that spend AI provider budget and so sit under
// aiLimiter as well as apiLimiter. /receipt/* was outside it until
// 2026-09-13: the receipt router is mounted at /receipt, not under /ai,
// so the most expensive call in the app — a vision model on a photograph
// — had only the per-IP limit. Widened here rather than moving the route
// to /ai/receipt/parse, because installed phone builds carry the old path
// in their bundled web assets and would 404 until they updated.
const AI_METERED_PREFIXES = ["/ai", "/receipt"] as const;

export function isAiMeteredPath(path: string): boolean {
  return AI_METERED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

// The three routes that call chainVision (a photograph, not a prompt) —
// see the cost comment on visionLimiter above. Exact paths, not a prefix:
// /ai/chat and /ai/batch-categorize are on /ai too but are not vision calls
// and stay on the cheaper aiLimiter.
const VISION_METERED_PATHS = ["/receipt/parse", "/ai/receipt-scan", "/ai/receipt-split"] as const;

export function isVisionMeteredPath(path: string): boolean {
  return (VISION_METERED_PATHS as readonly string[]).includes(path);
}

// Every AI-metered request passes two checks after requireAuth, in this
// order: the user has turned AI on (lib/ai-consent.ts, BACKLOG § I7 —
// opt-in, so a refused request never counts against the AI budget), then
// the per-user limiter for its cost class — visionLimiter for the three
// chainVision routes, aiLimiter for everything else under /ai or /receipt.
export function aiMeteredGate(req: Request, res: Response, next: NextFunction): void {
  if (!isAiMeteredPath(req.path)) return next();
  const limiter = isVisionMeteredPath(req.path) ? visionLimiter : aiLimiter;
  void requireAiConsent(req, res, (err?: unknown) => {
    if (err) return next(err);
    return limiter(req, res, next);
  });
}

// Middleware that reads the Better Auth session and puts userId on the request.
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (!session?.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    (req as any).userId = session.user.id;
    (req as any).user = session.user;
    next();
  } catch {
    res.status(401).json({ error: "Not authenticated" });
  }
}

// Order matters. apiLimiter first (per-IP throttle across everything),
// then requireAuth (sets req.userId), THEN aiMeteredGate (AI consent, then
// aiLimiter) on /ai/* and /receipt/* paths — that gate has to sit inside
// the same mount as requireAuth or both checks would run before req.userId
// is populated. Then finally the router.
app.use(
  "/api",
  apiLimiter,
  requireAuth,
  aiMeteredGate,
  router,
);

if (!IS_DEV) {
  const staticDir = path.resolve(__dirname, "../../finance-tracker/dist/public");
  if (existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get(/^(?!\/api).*/, requireAuth, (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }
}

export default app;
