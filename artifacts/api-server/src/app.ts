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
import { logger } from "./lib/logger";
import { auth } from "./lib/better-auth";

const app: Express = express();

app.set("trust proxy", 1);

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

const configuredOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

app.use(
  cors({
    origin: (origin, callback) => {
      // Server-to-server or same-origin requests have no Origin header
      if (!origin) return callback(null, true);
      // Always allow localhost in dev
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
      // Fail-secure: deny all cross-origin requests when ALLOWED_ORIGINS is not configured
      if (configuredOrigins.length === 0) {
        callback(new Error("ALLOWED_ORIGINS not configured — cross-origin request denied"));
        return;
      }
      if (configuredOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  }),
);

// ── Rate limiters ────────────────────────────────────────────────────────────

// Strict limiter for auth endpoints — prevent brute force and reset-email spam
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  skip: (req) => /^https?:\/\/localhost/.test(req.headers.origin ?? ""),
});

// Strict per-user limiter for the AI endpoint — prevent Gemini cost exhaustion
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "AI rate limit exceeded. Please wait before sending more messages." },
  skip: (req) => /^https?:\/\/localhost/.test(req.headers.origin ?? ""),
});

// General API limiter — guard all other financial endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
  skip: (req) => /^https?:\/\/localhost/.test(req.headers.origin ?? ""),
});

// Better Auth handles its own body parsing for /api/auth/* routes,
// so its handler must come BEFORE express.json().
app.all("/api/auth/{*path}", authLimiter, toNodeHandler(auth));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api", healthRouter);

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

app.use("/api/ai", aiLimiter);
app.use("/api", apiLimiter, requireAuth, router);

if (process.env.NODE_ENV === "production") {
  const staticDir = path.resolve(__dirname, "../../finance-tracker/dist/public");
  if (existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get(/^(?!\/api).*/, requireAuth, (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }
}

export default app;
