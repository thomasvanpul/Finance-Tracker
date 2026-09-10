// Dev-only endpoints. Nothing here is part of the product, and nothing
// here may run on a deployed instance.
//
// ── Why the surface exists ──────────────────────────────────────────────────
//
// app_settings.onboarded_at is stamped by the first PUT /api/settings/persona
// and is never cleared (see setPersona in lib/app-settings-db.ts — the stamp
// records when the user actually answered, so overwriting it would lose the
// only copy of that fact). Correct for a real account. On the seed account it
// makes the capture scripts one-shot: scripts/src/onboarding-shot.ts needs the
// questionnaire, the questionnaire renders only while onboarded_at is NULL,
// and one `screenshot.ts --persona` run ends that for good. The alternative
// considered and rejected was to leave a comment warning people off the API
// path — a documented landmine is worse than the bug it avoids, because the
// next person to step on it gets silently wrong captures and no signal.
//
// ── The guard ───────────────────────────────────────────────────────────────
//
// TWO conditions, both required, evaluated per request rather than at import
// so a test can flip either one without re-importing the module:
//
//   1. NODE_ENV must not be "production".
//   2. ENABLE_DEV_ROUTES must be exactly "1".
//
// Condition 2 is what makes this fail CLOSED, and it is not redundant with
// condition 1. This repo has already shipped the bug where a check keyed
// itself to `NODE_ENV !== "production"` on a platform that never set NODE_ENV
// at all — the check then reads "not production" everywhere, including
// production, and silently disables itself. `NODE_ENV` unset means these
// routes are OFF here, because the opt-in is the load-bearing half and the
// NODE_ENV test only ever adds a refusal, never removes one.
//
// Both routes also act on req.userId only — this router is mounted behind
// requireAuth in app.ts, so even with the guard open a caller can reset
// nothing but their own account.
//
// Not in lib/api-spec/openapi.yaml on purpose: the spec is the contract the
// generated client is built from, and a dev-only endpoint has no business in
// a shipped client. It is listed in KNOWN_SERVER_ONLY in
// spec-server-contract.lock.test.ts with that reason attached.

import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { clearOnboardedAt } from "../lib/app-settings-db";

export type DevRouteDecision =
  | { allowed: true }
  | { allowed: false; reason: "production" | "not-enabled" };

/** The whole guard, as a pure function of the environment, so it can be tested without a server. */
export function decideDevRoutes(): DevRouteDecision {
  if (process.env.NODE_ENV === "production") return { allowed: false, reason: "production" };
  if (process.env.ENABLE_DEV_ROUTES !== "1") return { allowed: false, reason: "not-enabled" };
  return { allowed: true };
}

const REFUSAL_DETAIL: Record<"production" | "not-enabled", string> = {
  production: "dev routes are permanently disabled when NODE_ENV=production",
  "not-enabled": "dev routes require ENABLE_DEV_ROUTES=1 and are off by default",
};

// 403, not 404. A 404 is indistinguishable from a typo in the path, and the
// script author needs to know the difference between "you spelled it wrong"
// and "this instance refuses".
function devOnly(_req: Request, res: Response, next: NextFunction): void {
  const decision = decideDevRoutes();
  if (decision.allowed) {
    next();
    return;
  }
  res.status(403).json({ error: REFUSAL_DETAIL[decision.reason], reason: decision.reason });
}

const router: IRouter = Router();

// Clears onboarded_at for the CALLING user, so the next page load shows the
// onboarding questionnaire again. Idempotent: an account that was already
// un-onboarded stays that way and still returns 200.
router.post("/dev/reset-onboarding", devOnly, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  await clearOnboardedAt(userId);
  res.json({ reset: true, userId });
});

export default router;
