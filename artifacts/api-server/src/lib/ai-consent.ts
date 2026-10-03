// AI is opt-in — BACKLOG § I7, decided by Thomas on 3 Oct 2026 (consent
// basis). No request on an AI-metered path (/ai/*, /receipt/*; see
// isAiMeteredPath in app.ts) reaches a handler, and so no provider is sent
// anything, until the signed-in user has turned AI on in Settings.
//
// The switch is the account-level preference `nr-ai-enabled`, stored in
// user_preferences like every other account-level key (the client mirrors
// it from localStorage; see artifacts/finance-tracker/src/lib/
// account-storage-keys.ts). This is the one preference the server reads
// rather than stores opaquely, because the server is where the call to the
// provider happens and the client cannot be trusted to hold it back.
//
// Fails closed. Absent, "false", or any value other than exactly "true" is
// off, and a preference that cannot be read refuses the request rather than
// guessing.

import type { Request, Response, NextFunction } from "express";
import { getPreference } from "./user-preferences-db";
import { logger } from "./logger";

export const AI_ENABLED_KEY = "nr-ai-enabled";
export const AI_ENABLED_VALUE = "true";

export const AI_OFF_MESSAGE = "AI is off for this account. Turn it on in Settings → AI Coach.";

export function isAiEnabledValue(value: string | null | undefined): boolean {
  return value === AI_ENABLED_VALUE;
}

export async function requireAiConsent(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = (req as unknown as { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  let value: string | null;
  try {
    value = await getPreference(userId, AI_ENABLED_KEY);
  } catch (err) {
    logger.error({ err }, "ai-consent: could not read nr-ai-enabled; refusing the AI request");
    res.status(503).json({ error: "Could not confirm that AI is turned on for this account.", code: "ai_consent_unreadable" });
    return;
  }
  if (!isAiEnabledValue(value)) {
    res.status(403).json({ error: AI_OFF_MESSAGE, code: "ai_off" });
    return;
  }
  next();
}
