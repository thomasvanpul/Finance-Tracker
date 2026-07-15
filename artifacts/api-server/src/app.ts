import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import { existsSync } from "fs";
import router from "./routes";
import healthRouter from "./routes/health";
import { logger } from "./lib/logger";
import { login, logout, check, requireAuth } from "./lib/auth";

const app: Express = express();

// Render (and most PaaS hosts) sit behind a reverse proxy — without this,
// req.ip would always resolve to the proxy's address, making IP-based rate
// limiting on the login endpoint meaningless.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// ALLOWED_ORIGINS is a comma-separated list of trusted frontend origins.
// Set it on Railway to the Vercel URL (e.g. https://fintrack.vercel.app).
// When unset (local dev), all origins are allowed.
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Auth endpoints and health check are the only unprotected routes.
app.post("/api/auth/login", login);
app.post("/api/auth/logout", logout);
app.get("/api/auth/check", check);
app.use("/api", healthRouter);

app.use("/api", requireAuth, router);

// Serve the built frontend when the static dir exists (single-service Render
// setup). When the frontend is on Vercel, the dir won't be present and this
// block is skipped — the API runs as a standalone service.
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
