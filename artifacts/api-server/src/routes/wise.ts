// Wise endpoints, now backed by the per-user connection model.
//
// These two routes exist to keep the existing frontend working during
// the transition (`useGetWiseStatus`, `useSyncWiseTransactions` in
// settings.tsx and accounts.tsx). Behaviour and response shapes are
// preserved; the token no longer comes from WISE_API_TOKEN.
//
// The historical env-var fallback for Thomas's own token is gone: the
// whole point of the H series is to stop the app being a personal
// integration wearing product clothes. Keeping the fallback would
// perpetuate the exact anti-pattern H exists to remove and would
// require a second code path that reads the same field two different
// ways. Reconnect via POST /connections { provider: "wise",
// credential: "…" } and this route reads from there.

import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, connectionsTable, type Connection } from "@workspace/db";
import { GetWiseStatusResponse, SyncWiseTransactionsResponse } from "@workspace/api-zod";
import { runConnectionSync } from "../lib/connection-sync";
import { AdapterError } from "../adapters";
import { logger } from "../lib/logger";

const router: IRouter = Router();

async function getWiseConnection(userId: string): Promise<Connection | null> {
  const [row] = await db
    .select()
    .from(connectionsTable)
    .where(and(eq(connectionsTable.userId, userId), eq(connectionsTable.provider, "wise")));
  return row ?? null;
}

router.get("/wise/status", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const connection = await getWiseConnection(userId);
  if (!connection) {
    // Preserve the WiseStatus shape: `configured: false` now means
    // "no wise connection exists for this user" rather than "env var
    // not set on server".
    res.json(
      GetWiseStatusResponse.parse({
        configured: false,
        connected: false,
        profileName: null,
        error: null,
      }),
    );
    return;
  }
  res.json(
    GetWiseStatusResponse.parse({
      configured: true,
      connected: connection.status === "active",
      profileName: connection.label,
      error: connection.lastError,
    }),
  );
});

router.post("/wise/sync", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const connection = await getWiseConnection(userId);
  if (!connection) {
    res.status(400).json({
      error:
        "No Wise connection. Add one via POST /connections with " +
        '{ "provider": "wise", "credential": "<your-wise-token>" }.',
    });
    return;
  }

  try {
    const summary = await runConnectionSync(connection);
    res.json(
      SyncWiseTransactionsResponse.parse({
        synced: summary.transactionsAdded + summary.transactionsUpdated,
        added: summary.transactionsAdded,
        updated: summary.transactionsUpdated,
      }),
    );
  } catch (err) {
    if (err instanceof AdapterError) {
      await db
        .update(connectionsTable)
        .set({
          status: err.kind === "auth" ? "revoked" : "error",
          lastError: err.message,
        })
        .where(eq(connectionsTable.id, connection.id));
      res.status(400).json({ error: err.message });
      return;
    }
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "wise sync failed");
    res.status(500).json({ error: "Wise sync failed" });
  }
});

export default router;
