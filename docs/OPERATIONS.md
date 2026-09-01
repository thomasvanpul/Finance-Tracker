# Operations — keep-alive, upgrade signal, retention

Living operational notes for the Render + Neon + Vercel deployment.
Written 2026-09-01 alongside the request_metrics table and
Healthchecks.io wire. Update this file when the arrangement changes;
someone in six months should be able to read only this to understand
the moving parts and why they were chosen.

## Uptime pinger and dead-man's-switch

### Primary pinger: cron-job.org (free, 1-minute)

Signup URL: <https://cron-job.org/en/signup/>. Email + password; no
credit card. Free tier permits commercial use per their ToS
(<https://cron-job.org/en/tos/>): "You may only create cronjobs for
websites which you own or for which you have the explicit permission
of its owner to use it with this service." Numeris is owned.

**Monitor configuration**:

- URL: `https://numeris-api.onrender.com/api/healthz`
  - **Direct to Render, NOT through Vercel** — a Vercel edge cache
    could serve a cached healthz response while the origin is
    genuinely asleep. Direct-to-Render is the only signal that
    proves the origin is up.
- Schedule: every 1 minute.
- Expected response: HTTP 200.
- Notification: email on failure.
- Retry: 1 retry after 30 s (cron-job.org default is fine).

### Why NOT UptimeRobot / HetrixTools / StatusCake / Pulsetic

All four are commonly recommended and would look fine at first glance.
Do not use them:

- **UptimeRobot free** since 2024-12-01 is personal-use only. App-Store-
  bound projects are prohibited; account suspension is the stated
  penalty. Verified via UptimeRobot Help Center article "Who Should
  Use UptimeRobot's Free Plan" and LowEndTalk discussion 199126.
- **HetrixTools free** requires login every 90 days or the account
  and its monitors silently deactivate. Verified at
  <https://docs.hetrixtools.com/free-accounts-inactivity/>.
- **StatusCake free** has the same 90-day-login-or-deactivate rule.
- **Pulsetic free** has the same 90-day-login-or-deactivate rule,
  verified at
  <https://help.pulsetic.com/article/217-set-up-your-account>.

The failure mode this whole arrangement fixes is a mitigation that
silently stops. Choosing a monitor whose free tier silently
deactivates every 90 days recreates the same defect one level down.

### Failure-visibility layer: Healthchecks.io dead-man's-switch

Signup URL: <https://healthchecks.io/signup/>. Free "Hobbyist" tier
gives 20 checks; commercial-use is permitted with the caveat that a
single legal entity should use one Hobbyist account, not multiples.
Numeris fits inside one.

**Check configuration**:

- Name: `numeris-api healthz heartbeat`.
- Schedule: "Simple" — expected period 5 minutes, grace time 5 minutes.
  Alerts fire if no ping arrives within 10 minutes. Render's idle
  threshold is 15 minutes, so the alert fires before the class of
  problem this catches (Render sleeps → no healthz hits) has any
  visible user impact.
- Notification: email on state change.

Once the check is created, Healthchecks shows a ping URL of the shape
`https://hc-ping.com/<uuid>`. Set that as the `HEALTHCHECKS_PING_URL`
environment variable on the Render service (Dashboard → numeris-api →
Environment). The api-server's `/api/healthz` handler already does the
POST; setting the env var is the only step to activate it.

Once wired, the switch catches ALL of:

- cron-job.org silently stopped firing (any reason).
- cron-job.org's own outage.
- Render service crashed hard or was suspended for TOS breach.
- The healthz route was renamed or removed.
- DNS or SSL breakage on the onrender.com hostname.
- The api-server started but is not answering (e.g. deadlocked).

If Healthchecks itself broke, the "no email" isn't distinguishable
from "everything's fine". Mitigation: subscribe to Healthchecks'
monthly usage report from account settings; the arrival of that email
each month is a soft heartbeat for the heartbeat.

### The `.github/workflows/keep-alive.yml` file

Now DEPRECATED. Its `on: schedule:` was removed 2026-09-01. The
workflow remains as a manually-triggerable escape hatch and as a
documentation artefact — its header comment records why GitHub cron
proved unreliable so the same mistake isn't remade. See that file
for the measurement.

## Upgrade signal — when to move Render to Starter ($7/mo)

**The two thresholds, decided in advance so the upgrade decision is
not "look at a graph and feel":**

1. **`/api/healthz` p95 above 800 ms for 7 consecutive days.**
2. **A DB-touching endpoint p95 above 1500 ms for 3 consecutive days.**

### Where each number comes from

- **Healthz p95**: cron-job.org records the response time of every
  ping and retains ~90 days of history on the free tier. Query via
  their REST API; a small python or shell script can extract the last
  7 days and compute the p95.
- **DB-endpoint p95**: the `request_metrics` table (this repo). One
  query:

  ```sql
  SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)
  FROM request_metrics
  WHERE route = '/settings/currency'
    AND ts > NOW() - INTERVAL '3 days';
  ```

  `/settings/currency` is the canonical DB-touching endpoint for
  this purpose — always called on app boot, single-row read, real
  user experience. If it moves or gets renamed, pick another
  single-row authenticated endpoint that appears on the app's boot
  path and update this file.

### Reasoning for the two thresholds

- **800 ms healthz**: current warm baseline is ~300–350 ms direct
  and ~350–600 ms via Vercel. 800 ms is >2× baseline (well above
  noise, well below the 3-second "app feels broken" perceptual
  threshold). Sustained for 7 days means "structurally slow", not
  "one bad afternoon".
- **1500 ms endpoint**: on a fast-enough network a single Postgres
  round-trip should be 200–400 ms. 1500 ms means Postgres itself is
  spending seconds on a single-row read — the classic Neon
  compute-throttling signal. Sustained for 3 days means "not a
  spike"; DB pressure escalates faster than CPU (a user with a
  growing dataset can go from fine to painful in a week), so the
  shorter window is honest.

### What triggering means

- Either threshold triggering ONCE → check the Neon dashboard's
  compute-hour usage and the Render dashboard's restart count.
- Either threshold triggering TWICE in a month → flip
  `render.yaml`'s `plan: free` to `plan: starter` ($7/mo,
  ~£66/yr). No cold-starts, dedicated CPU. One-line change.
- Both thresholds triggering in the same week → the DB is the more
  likely bottleneck; look at the Neon dashboard's compute-hours
  vs the 191.9 h/mo free-tier ceiling, and consider Neon Launch
  ($19/mo) as the second step.

### Where the numbers land in Thomas's eye

**The Morning Briefing extension** — the bento already runs at login.
Add a chip reading both p95s from the last 7 days with a green /
amber / red state. When Morning Briefing next has a code-change
session, wire it against these two queries. Until then, the
numbers are available on demand by curl'ing cron-job.org's API and
by running the SQL query in Neon.

## Free-tier ceilings that would push an upgrade

For each service, the specific limit that would bite first and the
symptom it produces — so a future degradation is recognisable
rather than mysterious. Numbers accurate at 2026-09-01; re-verify
on the provider's pricing page at decision time.

### Render (numeris-api)

- 512 MB RAM, 0.1 shared CPU, 750 instance-hours/mo, sleeps at
  15 min idle.
- First symptom under load: response times drift up (CPU
  throttling), then OOM restart (RAM pressure). Neither is loud.
  Watch: p95 thresholds above; Render dashboard's restart count.
- Upgrade decision: Starter ($7/mo, no sleep, dedicated CPU) is
  the first step. Standard ($25/mo, 2 GB, 1 CPU) is the answer if
  RAM is the constraint.

### Neon (numeris production database)

- 500 MB storage, 191.9 compute-hours/mo, single project.
- First symptom under load: query latency drift (compute-hour cap
  → smaller compute size assigned), then hard cap → storage-full
  write failures. Storage failure surfaces as INSERT errors in the
  api-server logs.
- Upgrade decision: Launch ($19/mo, 10 GB storage, 300
  compute-hours) is the first step. Watch: Neon dashboard's
  storage size and compute-hour usage.

### Vercel (numeris-web)

- 100 GB bandwidth/mo, 1s CPU per function invocation, 100
  GB-hours function runtime.
- First symptom: rate-limit errors on the serverless functions
  that proxy /api. Unlikely bottleneck at current traffic; noted
  for completeness.

## request_metrics — retention and Neon budget

Row width, worst case: 4 (id) + 8 (ts) + ~40 (route) + 4 (method)
+ 4 (status_code) + 4 (duration_ms) + ~30 (user_id) + row header
≈ 120 bytes. With the two indexes (ts DESC, route+ts DESC),
budget ~300 bytes/row all-in.

Retention window is **30 days**, enforced by `pruneRequestMetrics()`
in `artifacts/api-server/src/lib/request-metrics.ts`. Prune runs at
boot and on a 24-hour setInterval.

Storage math at 30-day retention:

- 10,000 rows/day (current traffic ballpark) = ~3 MB/day = ~90 MB in
  the window. Well inside Neon free's 500 MB.
- 100,000 rows/day = ~30 MB/day = ~900 MB. **Would breach Neon free
  on its own.** First fix: shorten `REQUEST_METRICS_RETENTION_DAYS`
  to 7 in the same file (still enough for both threshold windows).
  Second fix: pick Neon Launch tier for the DB, per §"Free-tier
  ceilings" above.

If the table grows suspiciously fast, first check for a cardinality
explosion — the `route` column MUST be the parameterised template
(e.g. `/accounts/:id`), not the raw URL. A middleware bug that
records raw URLs turns the table into a per-request-ID sink.

## What is captured for future use (not exposed anywhere yet)

Not built: an admin portal, an admin endpoint, an IRIS surface for
these numbers. Deliberately deferred — the presentation layer is
IRIS, not a Numeris page, and Thomas does not check dashboards
(same failure mode as the keep-alive nobody watched).

What IS captured now and can be queried directly against Neon:

- Signup timestamps (`userTable.createdAt`) — since day one.
- Session device breakdown (`sessionTable.userAgent`, `ipAddress`,
  `createdAt`) — since day one.
- Per-route timing (`request_metrics.duration_ms` grouped by
  `route`) — from 2026-09-01 (this task).
- Application errors — NOT captured durably. `logger.error` writes
  to pino which goes to Render's rolling logs (~7 days). Sentry
  integration is queued as a follow-up but not built.

## Sources

Free-tier terms as of 2026-09-01 from each provider's own pricing
or docs page. Re-verify at signup:

- cron-job.org ToS: <https://cron-job.org/en/tos/>
- cron-job.org FAQ: <https://cron-job.org/en/faq/>
- Healthchecks.io pricing: <https://healthchecks.io/pricing/>
- UptimeRobot commercial-use restriction:
  UptimeRobot Help Center + LowEndTalk 199126.
- HetrixTools 90-day inactivity:
  <https://docs.hetrixtools.com/free-accounts-inactivity/>
- Pulsetic 90-day inactivity:
  <https://help.pulsetic.com/article/217-set-up-your-account>
- Render pricing: <https://render.com/pricing>
- Neon pricing: <https://neon.tech/pricing>
