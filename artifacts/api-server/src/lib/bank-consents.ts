// Revoke bank consents before the rows that hold them are deleted.
//
// An Enable Banking connection's credential is a session id, and that
// session carries the user's consent at their bank. Deleting our row
// without closing the session leaves the consent live at the provider
// until it expires (up to 180 days) with nothing left on our side that
// could close it (BACKLOG M10). So the session is closed FIRST, and the
// deletion only proceeds once every consent is closed or already gone.
//
// A failure throws, and the caller deletes nothing: the rows survive, the
// user is told, and a retry can still reach the session. Deleting anyway
// would trade a visible, retryable error for a silent live consent.
//
// Pasted-token providers (Wise, Alpaca, Kraken) are not revoked here —
// their tokens are the user's to revoke at the provider, and the account
// deletion screen says so.

import { and, eq, type SQL } from "drizzle-orm";
import { db, connectionsTable } from "@workspace/db";
import { decryptCredential } from "./crypto";
import { enableBankingAdapter, revokeSession, sessionIdFromCredential } from "../adapters/enable-banking";
import { logger } from "./logger";

export interface RevokeSummary {
  revoked: number;
  alreadyGone: number;
  unreadable: number;
}

export class ConsentRevokeError extends Error {
  constructor(public connectionId: number, cause: unknown) {
    super(
      `Could not close the bank consent for connection ${connectionId}: ` +
        (cause instanceof Error ? cause.message : String(cause)),
    );
  }
}

// Every Enable Banking connection the user owns, or just one of them.
export async function revokeBankConsents(
  userId: string,
  connectionId?: number,
): Promise<RevokeSummary> {
  const filters: SQL[] = [
    eq(connectionsTable.userId, userId),
    eq(connectionsTable.provider, enableBankingAdapter.provider),
  ];
  if (connectionId !== undefined) filters.push(eq(connectionsTable.id, connectionId));
  const rows = await db
    .select({ id: connectionsTable.id, credentialCiphertext: connectionsTable.credentialCiphertext })
    .from(connectionsTable)
    .where(and(...filters));

  const summary: RevokeSummary = { revoked: 0, alreadyGone: 0, unreadable: 0 };
  for (const row of rows) {
    let sessionId: string | null;
    try {
      sessionId = sessionIdFromCredential(decryptCredential(row.credentialCiphertext));
    } catch {
      sessionId = null;
    }
    if (!sessionId) {
      // Nothing to send a revoke for, and nothing that could sync either.
      logger.warn({ connectionId: row.id }, "enable-banking credential unreadable; no session to revoke");
      summary.unreadable += 1;
      continue;
    }
    try {
      const outcome = await revokeSession(sessionId);
      if (outcome === "revoked") summary.revoked += 1;
      else summary.alreadyGone += 1;
    } catch (err) {
      throw new ConsentRevokeError(row.id, err);
    }
  }
  return summary;
}
