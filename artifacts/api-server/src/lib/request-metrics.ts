// Per-request timing capture — writes into public.request_metrics.
//
// Schema and reasoning: lib/db/src/schema/request-metrics.ts.
// Thresholds it feeds and how to read them: docs/OPERATIONS.md
// § "Upgrade signal".
//
// ── Where the middleware sits ────────────────────────────────────────────
// Registered globally in app.ts BEFORE the routers — but the actual
// insert fires on `res.on('finish')`, so it runs after the response
// has been sent regardless of which handler produced it. Latency of
// the insert never touches the response path.
//
// ── What is skipped ──────────────────────────────────────────────────────
// - /api/healthz. Hit every 60 s by cron-job.org and is fast by
//   construction; its p95 is tracked from the pinger's own history
//   instead. Including it here would drown the real-endpoint signal
//   in noise and cost ~43,200 rows/mo for no useful data.
// - Non-/api paths — the SPA static files served by express.static in
//   production. Those are HTTP-cache work, not application work.
//
// ── Failure discipline ───────────────────────────────────────────────────
// The insert is fire-and-forget with a caught .catch. Metrics
// capture MUST NOT be able to fail a request. If the DB is down or
// the write throws, we log a warn (once per minute — see the
// rate-limited warn below) and move on.

import type { Request, Response, NextFunction } from "express";
import { db, requestMetricsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

const SKIP_PATHS = new Set(["/api/healthz"]);

// Rate-limit warnings about failed inserts so a genuinely broken DB
// doesn't fill the log with the same line 100 times per second.
let lastWarnAt = 0;
const WARN_INTERVAL_MS = 60_000;
function warnOnce(err: unknown): void {
  const now = Date.now();
  if (now - lastWarnAt < WARN_INTERVAL_MS) return;
  lastWarnAt = now;
  logger.warn(
    { err: err instanceof Error ? err.message : String(err) },
    "request-metrics: insert failed (subsequent failures suppressed for 60s)",
  );
}

export function requestMetricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Fast skip — never touch res or set up a listener for endpoints
  // we don't record. Uses req.originalUrl split on ? because req.path
  // is not yet the matched route at this stage of middleware chain.
  const rawPath = req.originalUrl.split("?")[0] ?? req.originalUrl;
  if (SKIP_PATHS.has(rawPath)) return next();
  if (!rawPath.startsWith("/api")) return next();

  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Math.round(
      Number(process.hrtime.bigint() - start) / 1_000_000,
    );

    // req.route.path is set by Express AFTER routing when a matching
    // route handler ran. For unmatched paths (404) it stays
    // undefined, so we fall back to the raw path. The parameterised
    // template keeps cardinality bounded — /api/accounts/:id, not
    // /api/accounts/47.
    const routeTemplate =
      (req.route as { path?: string } | undefined)?.path ?? rawPath;

    const userId =
      typeof (req as unknown as { userId?: string }).userId === "string"
        ? (req as unknown as { userId: string }).userId
        : null;

    void db
      .insert(requestMetricsTable)
      .values({
        route: routeTemplate,
        method: req.method,
        statusCode: res.statusCode,
        durationMs,
        userId,
      })
      .catch(warnOnce);
  });

  next();
}

// Retention — deletes rows older than the retention window. Called at
// boot and on a 24-hour setInterval from index.ts. Amortised cost is
// tiny (DELETE by indexed range on ts).
//
// Retention window is deliberately conservative at 30 days: enough for
// weekly triage of the upgrade thresholds (7-day and 3-day windows)
// with headroom, well inside Neon free-tier storage budget at current
// traffic. See the schema file for the storage arithmetic.
export const REQUEST_METRICS_RETENTION_DAYS = 30;

export async function pruneRequestMetrics(): Promise<number> {
  const cutoffSql = sql`NOW() - (${sql.raw(String(REQUEST_METRICS_RETENTION_DAYS))} || ' days')::interval`;
  const result = await db
    .delete(requestMetricsTable)
    .where(sql`ts < ${cutoffSql}`);
  const rowCount = (result as { rowCount?: number | null }).rowCount ?? 0;
  return rowCount;
}
