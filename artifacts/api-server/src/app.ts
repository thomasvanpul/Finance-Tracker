import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import healthRouter from "./routes/health";
import { logger } from "./lib/logger";
import { login, logout, check, requireAuth } from "./lib/auth";

const app: Express = express();

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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Auth endpoints and health check are the only unprotected routes.
app.post("/api/auth/login", login);
app.post("/api/auth/logout", logout);
app.get("/api/auth/check", check);
app.use("/api", healthRouter);

app.use("/api", requireAuth, router);

// In production, this single server also serves the built frontend, so the whole
// app (UI + API) is one Render service behind one password gate.
if (process.env.NODE_ENV === "production") {
  const staticDir = path.resolve(__dirname, "../../finance-tracker/dist/public");
  app.use(express.static(staticDir));
  app.get(/^(?!\/api).*/, requireAuth, (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

export default app;
