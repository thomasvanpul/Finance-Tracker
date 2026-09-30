import app from "./app";
import { logger } from "./lib/logger";
import { isMarketDataEnabled, MARKET_DATA_FLAG } from "./lib/market-flag";
import { alpacaStream } from "./lib/alpaca-stream";
import { verifyProvidersAtBoot } from "./lib/ai-config";
import { migrateAtBoot } from "./lib/migrate";
import { verifySchemaAtBoot } from "./lib/verify-schema";
import { pruneRequestMetrics, REQUEST_METRICS_RETENTION_DAYS } from "./lib/request-metrics";
import { hydrateProviderHealth } from "./lib/provider-health";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── Boot sequence ────────────────────────────────────────────────────────
// Both DB steps below MUST succeed before app.listen(). If either
// throws, we log at ERROR + exit 1 — Render sees the deploy fail and
// keeps the previous instance serving.
//
// Order matters:
//   1. migrateAtBoot — apply any pending SQL migrations from
//      dist/drizzle. Idempotent no-op if the schema is already
//      current.
//   2. verifySchemaAtBoot — introspect information_schema and
//      compare against what the code's drizzle schema expects. Catches
//      the "code references a column that no migration created" case
//      (someone forgot `drizzle-kit generate`) or the "journal wiped
//      but tables present" case (the past force-push defect).
//
// Reason both exist: (1) fixes normal drift; (2) refuses to start on
// abnormal drift that (1) couldn't catch. See src/lib/verify-schema.ts.
try {
  await migrateAtBoot();
} catch (err) {
  logger.error(
    { err: err instanceof Error ? err.message : String(err) },
    "database migration failed — refusing to start server. Previous instance will keep serving on Render.",
  );
  process.exit(1);
}
try {
  await verifySchemaAtBoot();
} catch (err) {
  logger.error(
    { err: err instanceof Error ? err.message : String(err) },
    "schema drift check failed — refusing to start server. See fix-me sentence above.",
  );
  process.exit(1);
}

// Restores circuit-breaker state (consecutiveFailures/lastOk/lastError) from
// its last known values before this restart. Deliberately NOT in a try/catch
// that exits — hydrateProviderHealth() already swallows its own failures,
// because losing last restart's evidence is not a reason to refuse this
// one's traffic. See lib/provider-health.ts.
await hydrateProviderHealth();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  // The Alpaca websocket is a market-data surface like any other, and the
  // one that runs without anybody asking. Not connecting is the difference
  // between "we do not serve quotes" and "we do not serve quotes but we do
  // hold an authenticated subscription to them". See lib/market-flag.ts.
  if (isMarketDataEnabled()) alpacaStream.connect();
  else logger.info({ [MARKET_DATA_FLAG]: process.env[MARKET_DATA_FLAG] ?? null },
    "Market data is off — Alpaca stream not connected");

  // Retention for request_metrics — prune at boot (catches long-idle
  // deploys where the previous prune ran days ago) and every 24 h on
  // an in-process interval (covers the always-warm case once the
  // pinger is wired). Fire-and-forget: pruning failure is a log line,
  // not a boot failure. See lib/request-metrics.ts.
  void pruneRequestMetrics()
    .then((deleted) =>
      logger.info({ deleted, retentionDays: REQUEST_METRICS_RETENTION_DAYS },
        "request-metrics: boot prune complete"),
    )
    .catch((err) => logger.warn({ err: err instanceof Error ? err.message : String(err) },
        "request-metrics: boot prune failed"));
  setInterval(
    () => {
      void pruneRequestMetrics()
        .then((deleted) =>
          logger.info({ deleted, retentionDays: REQUEST_METRICS_RETENTION_DAYS },
            "request-metrics: interval prune complete"),
        )
        .catch((err) => logger.warn({ err: err instanceof Error ? err.message : String(err) },
            "request-metrics: interval prune failed"));
    },
    24 * 60 * 60 * 1000,
  ).unref(); // .unref() so this interval doesn't keep the process alive on shutdown
  // Verify every AI provider's configured models against its live
  // models list — Groq and Cerebras in parallel. Non-blocking:
  // server is already accepting requests. If any provider's model is
  // dead, an error-level log fires with the provider-specific fix-me
  // sentence and /api/ai/status flips that provider to
  // modelsVerified=false. `available` at the top level stays true so
  // long as ONE provider remains verified. See lib/ai-config.ts.
  //
  // AI verify is non-blocking because the chain has fallbacks. DB
  // verify (above) IS blocking because the DB doesn't.
  void verifyProvidersAtBoot();
});
