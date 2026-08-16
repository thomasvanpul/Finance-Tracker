// Enable Banking consent-redirect routes.
//
// The token-paste providers (Wise, Alpaca, Kraken) use POST
// /connections with an inline credential. Enable Banking cannot use
// that shape: the credential (session id) is issued by the bank after
// the user authenticates with them, so there are two API endpoints
// instead of one.
//
//   POST /connections/enable-banking/start
//     Body: { aspspName, aspspCountry, validUntilDays? }
//     Response: { url, state }
//     Client behaviour: send the user to `url`. When they come back
//     to the registered redirect URL, the callback below fires.
//
//   GET /connections/enable-banking/callback?state=<opaque>&code=<from-eb>
//     Enable Banking redirects the user's browser here. We look up
//     the pending consent by `state`, exchange the code for a
//     session, encrypt session_id as the credential, and upsert a
//     connection row. Then we redirect the browser back to the
//     settings page.
//
// State store: in-memory Map for now, keyed by opaque state string.
// Entries expire after 30 minutes (a consent flow either completes
// quickly or is abandoned). If we ever run > 1 api-server instance
// this needs to move to Redis / the database — flagged in
// docs/H4-ENABLE-BANKING.md.

import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, connectionsTable } from "@workspace/db";
import { encryptCredential } from "../lib/crypto";
import {
  startAuth,
  exchangeCodeForSession,
  enableBankingAdapter,
} from "../adapters/enable-banking";
import { AdapterError } from "../adapters";
import { logger } from "../lib/logger";

const router: IRouter = Router();

interface PendingConsent {
  userId: string;
  aspspName: string;
  aspspCountry: string;
  validUntil: string;
  redirectAfter: string;
  createdAt: number;
}

const PENDING = new Map<string, PendingConsent>();
const STATE_TTL_MS = 30 * 60 * 1000;

function sweepExpiredStates(): void {
  const cutoff = Date.now() - STATE_TTL_MS;
  for (const [k, v] of PENDING) {
    if (v.createdAt < cutoff) PENDING.delete(k);
  }
}

router.post("/connections/enable-banking/start", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const aspspName = typeof req.body?.aspspName === "string" ? req.body.aspspName : null;
  const aspspCountry = typeof req.body?.aspspCountry === "string" ? req.body.aspspCountry : null;
  const validUntilDays = Number.isFinite(req.body?.validUntilDays)
    ? Math.min(180, Math.max(1, Number(req.body.validUntilDays)))
    : 180;
  if (!aspspName || !aspspCountry) {
    res.status(400).json({ error: "aspspName and aspspCountry are required" });
    return;
  }

  const validUntil = new Date(Date.now() + validUntilDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const redirectUrl = process.env.ENABLE_BANKING_REDIRECT_URL;
  if (!redirectUrl) {
    res.status(500).json({
      error:
        "ENABLE_BANKING_REDIRECT_URL is not set. Register a callback URL in the " +
        "Enable Banking portal and mirror it here.",
    });
    return;
  }

  const state = randomUUID();
  sweepExpiredStates();
  PENDING.set(state, {
    userId,
    aspspName,
    aspspCountry,
    validUntil,
    redirectAfter: typeof req.body?.redirectAfter === "string"
      ? req.body.redirectAfter
      : "/settings?panel=connections",
    createdAt: Date.now(),
  });

  try {
    const { url } = await startAuth({
      aspsp: { name: aspspName, country: aspspCountry },
      redirectUrl,
      state,
      validUntil,
    });
    res.json({ url, state });
  } catch (err) {
    PENDING.delete(state);
    if (err instanceof AdapterError) {
      res.status(400).json({ error: err.message, kind: err.kind });
      return;
    }
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "enable-banking start failed");
    res.status(500).json({ error: "Failed to start Enable Banking consent" });
  }
});

router.get("/connections/enable-banking/callback", async (req, res): Promise<void> => {
  const state = typeof req.query.state === "string" ? req.query.state : null;
  const code = typeof req.query.code === "string" ? req.query.code : null;
  if (!state || !code) {
    res.status(400).send("Missing state or code");
    return;
  }
  const pending = PENDING.get(state);
  PENDING.delete(state);
  if (!pending) {
    // Two legit causes: expired (>30min) or replay. Same message either way.
    res.status(400).send("Consent state is expired or unknown. Start the flow again.");
    return;
  }

  try {
    const session = await exchangeCodeForSession(code);
    const credential = JSON.stringify({
      sessionId: session.session_id,
      validUntil: session.access?.valid_until ?? pending.validUntil,
    });
    const label =
      session.aspsp?.name
        ? `${session.aspsp.name}${session.aspsp.country ? ` (${session.aspsp.country})` : ""}`
        : `${pending.aspspName} (${pending.aspspCountry})`;

    const [row] = await db
      .insert(connectionsTable)
      .values({
        userId: pending.userId,
        provider: enableBankingAdapter.provider,
        label,
        status: "active",
        credentialCiphertext: encryptCredential(credential),
        lastError: null,
      })
      .onConflictDoUpdate({
        target: [connectionsTable.userId, connectionsTable.provider],
        set: {
          label,
          status: "active",
          credentialCiphertext: encryptCredential(credential),
          lastError: null,
        },
      })
      .returning();

    logger.info(
      { userId: pending.userId, connectionId: row.id, provider: enableBankingAdapter.provider },
      "enable-banking connection created via consent callback",
    );

    // Redirect back to the app. The client sees ?created=<id> so the
    // settings page can toast + refetch the connections list.
    const sep = pending.redirectAfter.includes("?") ? "&" : "?";
    res.redirect(`${pending.redirectAfter}${sep}created=${row.id}`);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "enable-banking callback failed",
    );
    res.status(400).send(
      err instanceof AdapterError
        ? `Enable Banking rejected the code: ${err.message}`
        : "Failed to exchange the Enable Banking code for a session",
    );
  }
});

export default router;

// Test-only: expose the pending-state map so tests can seed/inspect it
// without hitting the live Enable Banking service. Not exported through
// any production import path.
export const __PENDING_FOR_TESTING = PENDING;
