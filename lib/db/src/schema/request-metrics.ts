import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

// Per-request timing capture — the data source for the upgrade signal
// designed in .review/archive/2026-09-01T0909-*.report.md § "Upgrade
// signal" and confirmed by the 2026-09-01T09:12Z build task.
//
// The reason this exists in the DB rather than being read out of logs:
// Neon has SQL, Render's rolling log tail does not, and the threshold
// ("real-endpoint p95 > 1500 ms for 3 consecutive days" → time to
// consider Render Starter) is a query, not a search. Same lesson as
// account_balance_snapshots — a metric that can't be backfilled has
// to start capturing before anyone wants to look at it, or its
// history simply does not exist when the question is asked.
//
// ── What is captured ──────────────────────────────────────────────────────
// One row per non-healthz request that reaches the app. The middleware
// (see artifacts/api-server/src/middlewares/request-metrics.ts) hooks
// res.on('finish') so status_code and duration_ms are known post-hoc.
// route = req.route.path when Express matched (the parameterised
// template, so /api/accounts/:id NOT /api/accounts/47), otherwise the
// literal req.originalUrl minus the query string. Cardinality of the
// route column is bounded by the router surface; hundreds, not
// billions.
//
// user_id is nullable — populated when requireAuth has run and set
// req.userId, null on public routes (auth-providers, market-providers,
// ai-status, and the unauthenticated auth surface). NOT a foreign key
// to userTable: this table is a metric sink, not a domain entity, and
// a cascade-delete on user removal would silently rewrite the history.
// If a user goes away we want their p95 contribution to stay in the
// series.
//
// ── What is NOT captured ──────────────────────────────────────────────────
// - /api/healthz — hit every 60 s by cron-job.org; its p95 already
//   lives in the pinger's own history (§ "Upgrade signal", metric 1).
//   Including it here would drown the real-endpoint signal in noise
//   and waste roughly 43,200 rows/mo.
// - Request bodies, headers, IPs — this is timing, not access log.
// - The response payload itself — same reason.
//
// ── Neon storage arithmetic ───────────────────────────────────────────────
// Row width, worst case: 4 (id) + 8 (ts) + ~40 (route) + 4 (method) +
// 4 (status_code) + 4 (duration_ms) + ~30 (user_id) + row header ≈
// 120 bytes. With the two indexes below (ts DESC and route+ts),
// budget ~300 bytes/row all-in.
//
// Neon free tier is 500 MB storage. At the current traffic — one
// user, low usage — expect fewer than 10,000 rows/day, so ~3 MB/day
// including indexes; a 30-day retention window sits at ~100 MB. At
// 100,000 rows/day the same window is ~1 GB and would breach Neon
// free on its own; the retention job (see pruneRequestMetrics below
// and its 24-hour setInterval in artifacts/api-server/src/index.ts)
// is what stops the table from filling the database. If Numeris ever
// grows enough to matter, the same table can be swapped to a
// shorter window (say 7 days) as the first fix, and only then to
// external log shipping.
//
// ── Not backfillable — start now ─────────────────────────────────────────
// The point of shipping this early is that historical latency is what
// tells us we crossed a threshold. Waiting to add it until we care is
// too late; there will be no history to check.
export const requestMetricsTable = pgTable(
  "request_metrics",
  {
    id: serial("id").primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    // req.route.path if Express matched; the request path minus the
    // query string otherwise. Bounded cardinality — the app has ~80
    // routes; a runaway cardinality means the middleware started
    // recording raw URLs and something is wrong.
    route: text("route").notNull(),
    method: text("method").notNull(),
    statusCode: integer("status_code").notNull(),
    durationMs: integer("duration_ms").notNull(),
    // Nullable on purpose — public endpoints have no user. See header
    // for why this is not a foreign key.
    userId: text("user_id"),
  },
  (t) => [
    // Retention DELETE scans by ts and needs this. Also the natural
    // sort for "recent requests" queries.
    index("request_metrics_ts_idx").on(t.ts.desc()),
    // The p95-per-route query (WHERE route = $1 AND ts > NOW() - INTERVAL '7 days')
    // uses this composite. Leading with route lets Postgres jump to
    // the route slice; the trailing ts DESC keeps the scan cheap.
    index("request_metrics_route_ts_idx").on(t.route, t.ts.desc()),
  ],
);
