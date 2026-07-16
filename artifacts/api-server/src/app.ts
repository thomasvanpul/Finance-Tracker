import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import { existsSync } from "fs";
import { toNodeHandler } from "better-auth/node";
import router from "./routes";
import healthRouter from "./routes/health";
import { logger } from "./lib/logger";
import { auth } from "./lib/better-auth";

const app: Express = express();

app.set("trust proxy", 1);

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

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  }),
);

// Better Auth handles its own body parsing for /api/auth/* routes,
// so its handler must come BEFORE express.json().
app.all("/api/auth/{*path}", toNodeHandler(auth));

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

app.use("/api", requireAuth, router);

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
