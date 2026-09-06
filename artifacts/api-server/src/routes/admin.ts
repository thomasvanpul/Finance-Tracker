// ── The admin hub's one endpoint ────────────────────────────────────────────
//
// Numeris runs on nine free tiers and until now no surface in the product
// said anything about any of them. Yahoo had been dark for days and the app
// rendered dashes. Thirteen Vercel builds failed and the site kept serving
// the last good bundle. Both were invisible from inside the product.
//
// This endpoint is largely a READER: the diagnostic endpoints already exist
// (/api/healthz, /api/auth-providers, /api/market/providers, /api/ai/status)
// and the ceilings already exist in lib/service-facts.ts. What did not exist
// was one place that reads them together and says whether anything is wrong.
//
// ── Headroom, not usage ─────────────────────────────────────────────────────
// Every quota below is reported as distance to the ceiling, because that is
// the number that changes a decision. "11 credits used" is trivia; "749 left,
// and you spend ~640/day" is a plan.
//
// ── Gating ──────────────────────────────────────────────────────────────────
// Mounted on the authenticated router, then narrowed by decideAdmin() to an
// environment allowlist. See lib/admin-gate.ts for why it is an allowlist and
// why it fails closed. A signed-in non-admin gets 403 with a reason that does
// not name who IS an admin.

import { Router, type IRouter } from "express";
import { and, count, gte, sql } from "drizzle-orm";
import { db, requestMetricsTable, userTable } from "@workspace/db";
import { decideAdmin } from "../lib/admin-gate";
import { getProviderHealth } from "../lib/provider-health";
import { getAiHealth } from "../lib/ai-config";
import { getYahooRichQuoteStatus } from "../lib/market";
import { getDeployTruth } from "../lib/deploy-truth";
import {
  SERVICE_FACTS,
  totalMonthlyCostGbp,
  launchBlockers,
  oldestCheckDate,
} from "../lib/service-facts";

const router: IRouter = Router();

const DAY_MS = 24 * 60 * 60 * 1000;

/** Rows are retained 30 days, so no window here may claim more than that. */
const METRICS_WINDOW_DAYS = 7;

async function usersSummary() {
  const [{ total }] = await db.select({ total: count() }).from(userTable);

  // Signups per day. The user table is tiny (single digits today) so this is
  // a full scan by design — no index is warranted for a table this size and
  // adding one would be speculative.
  const signups = await db
    .select({
      day: sql<string>`to_char(${userTable.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
      n: count(),
    })
    .from(userTable)
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  // What each account actually holds. One aggregate per user-scoped table
  // rather than a join fan-out, which would multiply rows across tables and
  // report numbers that are simply wrong.
  const holdings = await db.execute(sql`
    select
      u.id,
      u.email,
      u.created_at,
      (select count(*) from accounts       a where a.user_id = u.id) as accounts,
      (select count(*) from transactions   t where t.user_id = u.id) as transactions,
      (select count(*) from investments    i where i.user_id = u.id) as investments,
      (select count(*) from goals          g where g.user_id = u.id) as goals,
      (select count(*) from budgets        b where b.user_id = u.id) as budgets,
      (select count(*) from debts          d where d.user_id = u.id) as debts,
      (select count(*) from subscriptions  s where s.user_id = u.id) as subscriptions,
      (select count(*) from connections    c where c.user_id = u.id) as connections
    from "user" u
    order by u.created_at asc
  `);

  return {
    total,
    signupsByDay: signups.map((s) => ({ day: s.day, count: Number(s.n) })),
    accounts: (holdings.rows as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      email: String(r.email),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      holdings: {
        accounts: Number(r.accounts),
        transactions: Number(r.transactions),
        investments: Number(r.investments),
        goals: Number(r.goals),
        budgets: Number(r.budgets),
        debts: Number(r.debts),
        subscriptions: Number(r.subscriptions),
        connections: Number(r.connections),
      },
    })),
  };
}

async function trafficSummary() {
  const since = new Date(Date.now() - METRICS_WINDOW_DAYS * DAY_MS);

  const [totals] = await db
    .select({
      requests: count(),
      errors: sql<number>`count(*) filter (where ${requestMetricsTable.statusCode} >= 500)`,
      clientErrors: sql<number>`count(*) filter (where ${requestMetricsTable.statusCode} between 400 and 499)`,
    })
    .from(requestMetricsTable)
    .where(gte(requestMetricsTable.ts, since));

  // Slowest routes by p95, not by mean — a mean hides the tail that users
  // actually feel. Floor of 20 samples so a route hit twice cannot top the
  // list on noise.
  const slowest = await db.execute(sql`
    select route,
           count(*)::int as n,
           percentile_cont(0.95) within group (order by duration_ms)::int as p95_ms,
           percentile_cont(0.50) within group (order by duration_ms)::int as p50_ms
    from request_metrics
    where ts > ${since}
    group by route
    having count(*) >= 20
    order by p95_ms desc
    limit 10
  `);

  // Error rate per route, so a route that is slow and a route that is broken
  // are not the same row.
  const failing = await db.execute(sql`
    select route,
           count(*)::int as n,
           count(*) filter (where status_code >= 500)::int as errors
    from request_metrics
    where ts > ${since}
    group by route
    having count(*) filter (where status_code >= 500) > 0
    order by errors desc
    limit 10
  `);

  // Phone vs desktop. The `client` column was added 2026-09-06; every row
  // before that is null and cannot be backfilled, so the unclassified share
  // is reported rather than dropped. Dividing over the classified rows alone
  // would describe the last few days as though it described the window.
  const byClient = await db
    .select({
      client: requestMetricsTable.client,
      n: count(),
    })
    .from(requestMetricsTable)
    .where(gte(requestMetricsTable.ts, since))
    .groupBy(requestMetricsTable.client);

  const clientCounts = { phone: 0, desktop: 0, unclassified: 0 };
  for (const row of byClient) {
    const n = Number(row.n);
    if (row.client === "phone") clientCounts.phone += n;
    else if (row.client === "desktop") clientCounts.desktop += n;
    else clientCounts.unclassified += n;
  }

  const requests = Number(totals?.requests ?? 0);
  const errors = Number(totals?.errors ?? 0);
  return {
    windowDays: METRICS_WINDOW_DAYS,
    requests,
    serverErrors: errors,
    clientErrors: Number(totals?.clientErrors ?? 0),
    // Null rather than 0 on an empty window — a 0% error rate over zero
    // requests is not a fact about reliability.
    errorRatePct: requests > 0 ? Math.round((errors / requests) * 10000) / 100 : null,
    slowestRoutes: (slowest.rows as Record<string, unknown>[]).map((r) => ({
      route: String(r.route),
      samples: Number(r.n),
      p95Ms: Number(r.p95_ms),
      p50Ms: Number(r.p50_ms),
    })),
    failingRoutes: (failing.rows as Record<string, unknown>[]).map((r) => ({
      route: String(r.route),
      samples: Number(r.n),
      errors: Number(r.errors),
    })),
    byClient: clientCounts,
    clientSplitNote:
      clientCounts.unclassified > 0
        ? "The client column was added 2026-09-06 and cannot be backfilled; unclassified rows predate it or came from a non-browser caller."
        : null,
  };
}

// GET /admin/whoami
//
// Exists so the sidebar can decide whether to render an Admin link without
// running the full overview query on every page load. It answers one boolean
// and touches no database.
//
// This is a convenience for the UI and NOT the security boundary — the
// boundary is decideAdmin() on /admin/overview, which runs regardless of what
// the client believes. Hiding the link is not access control; a client that
// calls the overview endpoint anyway still gets 403.
router.get("/admin/whoami", (req, res): void => {
  const user = (req as { user?: { email?: string } }).user;
  const userId = (req as { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({ admin: decideAdmin({ userId, email: user?.email ?? null }).allowed });
});

// GET /admin/overview?webCommit=<sha>
router.get("/admin/overview", async (req, res): Promise<void> => {
  const user = (req as { user?: { id?: string; email?: string } }).user;
  const userId = (req as { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const decision = decideAdmin({ userId, email: user?.email ?? null });
  if (!decision.allowed) {
    res.status(403).json({
      error: "Not an admin",
      // Names the deployment's own misconfiguration, never the allowlist.
      reason:
        decision.reason === "not-configured"
          ? "No admin allowlist is configured on this deployment (set ADMIN_USER_IDS)."
          : "This account is not on the admin allowlist.",
    });
    return;
  }

  const webCommit = typeof req.query.webCommit === "string" ? req.query.webCommit : null;

  const [users, traffic, deploy] = await Promise.all([
    usersSummary(),
    trafficSummary(),
    getDeployTruth(webCommit),
  ]);

  res.json({
    generatedAt: new Date().toISOString(),
    gate: { matchedOn: decision.matchedOn },
    services: {
      facts: SERVICE_FACTS,
      totalMonthlyCostGbp: totalMonthlyCostGbp(),
      launchBlockerIds: launchBlockers().map((s) => s.id),
      oldestCheckDate: oldestCheckDate(),
    },
    deploy,
    providers: getProviderHealth(),
    ai: getAiHealth(),
    yahooRichQuote: getYahooRichQuoteStatus(),
    users,
    traffic,
  });
});

export default router;
