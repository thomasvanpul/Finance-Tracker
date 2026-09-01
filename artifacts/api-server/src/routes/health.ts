import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Healthchecks.io dead-man's-switch. On every healthz hit we POST to the
// configured URL as a heartbeat; Healthchecks alerts Thomas if no
// heartbeat arrives inside the check's expected window (5 min + 5 min
// grace = 10 min). This is the layer that catches the whole class of
// "pinger silently stopped" — including cron-job.org's own outages, DNS
// break, healthz route breakage, and any 90-day-inactivity policy the
// primary pinger turns out to have. See docs/OPERATIONS.md § "Uptime
// pinger and dead-man's-switch".
//
// Fire-and-forget with a short timeout. Failure to reach Healthchecks
// MUST NOT delay or fail the healthz response — that response is what
// cron-job.org uses to decide the origin is alive. A slow Healthchecks
// would silently harm the very thing this endpoint exists to prove.
//
// HEALTHCHECKS_PING_URL is unset in dev and unset until Thomas signs
// up in prod — in either case the branch below is a no-op. Setting the
// env var in Render is the only step needed to activate the switch.
const HEALTHCHECKS_URL = process.env.HEALTHCHECKS_PING_URL;
const HEALTHCHECKS_TIMEOUT_MS = 2000;
let lastHcWarnAt = 0;
const HC_WARN_INTERVAL_MS = 60_000;

router.get("/healthz", (_req, res) => {
  if (HEALTHCHECKS_URL) {
    // Purposefully not awaited — the response below fires immediately.
    void pingHealthchecks(HEALTHCHECKS_URL);
  }
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

async function pingHealthchecks(url: string): Promise<void> {
  try {
    await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(HEALTHCHECKS_TIMEOUT_MS),
    });
  } catch (err) {
    const now = Date.now();
    if (now - lastHcWarnAt < HC_WARN_INTERVAL_MS) return;
    lastHcWarnAt = now;
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "healthchecks: heartbeat ping failed (subsequent failures suppressed for 60s)",
    );
  }
}

export default router;
