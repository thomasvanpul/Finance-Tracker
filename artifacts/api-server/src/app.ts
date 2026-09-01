import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import { existsSync } from "fs";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { toNodeHandler } from "better-auth/node";
import router from "./routes";
import healthRouter from "./routes/health";
import authProvidersRouter from "./routes/auth-providers";
import marketProvidersRouter from "./routes/market-providers";
import aiStatusRouter from "./routes/ai-status";
import { logger } from "./lib/logger";
import { auth } from "./lib/better-auth";
import { requestMetricsMiddleware } from "./lib/request-metrics";

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
  keyGenerator: (req: Request) => (req as unknown as { userId?: string }).userId ?? req.ip ?? "unknown",
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
const CREDENTIAL_PATHS = /^\/api\/auth\/(sign-in|sign-up|forget-password|reset-password|change-password)/;
export function isCredentialPath(path: string): boolean {
  return CREDENTIAL_PATHS.test(path);
}
app.all("/api/auth/{*path}", (req, res, next) => {
  if (isCredentialPath(req.path)) return authLimiter(req, res, next);
  return next();
}, toNodeHandler(auth));

app.use(express.json());
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
// chain (Groq, Cerebras, OpenRouter). Same "diagnosable without shell"
// surface as the two above — so the operator can `curl` production and
// see which providers are configured + verified + which env vars to
// set for retirements. No user data, no key value. See
// routes/ai-status.ts. Chat / receipt-split / categorize stay behind
// requireAuth (they take user prompts and cost money to serve).
app.use("/api", aiStatusRouter);

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
// then requireAuth (sets req.userId), THEN aiLimiter gated on /ai/*
// paths — that gate has to sit inside the same mount as requireAuth or
// aiLimiter would run before req.userId is populated. Then finally the
// router.
app.use(
  "/api",
  apiLimiter,
  requireAuth,
  (req, res, next) => {
    if (req.path.startsWith("/ai/")) return aiLimiter(req, res, next);
    return next();
  },
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
