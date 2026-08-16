import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, connectionsTable, type Connection } from "@workspace/db";
import {
  CreateConnectionBody,
  DeleteConnectionParams,
  SyncConnectionParams,
  ListConnectionsResponseItem,
  ListConnectionsResponse,
  SyncConnectionResponse,
} from "@workspace/api-zod";
import { encryptCredential } from "../lib/crypto";
import { getAdapter, AdapterError } from "../adapters";
import { logger } from "../lib/logger";
import { runConnectionSync } from "../lib/connection-sync";

const router: IRouter = Router();

// Redacts the credential-carrying columns down to what the client is
// allowed to see. Not defence-in-depth: it is THE defence. Every
// endpoint on this router runs its output through this before responding
// and every test in connections.test.ts asserts the serialised response
// body never contains the plaintext or the ciphertext.
function toPublic(c: Connection) {
  return ListConnectionsResponseItem.parse({
    id: c.id,
    provider: c.provider,
    label: c.label,
    status: c.status,
    lastSyncedAt: c.lastSyncedAt,
    lastError: c.lastError,
    createdAt: c.createdAt,
  });
}

router.get("/connections", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const rows = await db
    .select()
    .from(connectionsTable)
    .where(eq(connectionsTable.userId, userId));
  res.json(ListConnectionsResponse.parse(rows.map(toPublic)));
});

router.post("/connections", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const parsed = CreateConnectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { provider, credential, label } = parsed.data;

  const adapter = getAdapter(provider);
  if (!adapter) {
    res.status(400).json({ error: `Unknown provider "${provider}"` });
    return;
  }

  // Validate against the live provider BEFORE encrypting and persisting.
  // A bad token must fail here with a clear message, not fail later at
  // sync time when the user is not watching.
  const result = await adapter.validateCredential(credential);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }

  const displayLabel = label?.trim() || result.label;

  // Encrypt in-memory; the plaintext leaves scope with the request.
  const credentialCiphertext = encryptCredential(credential);

  // One connection per user per provider. If the user is re-adding, we
  // want to overwrite the ciphertext (they just proved they can) rather
  // than force them to delete first.
  const [row] = await db
    .insert(connectionsTable)
    .values({
      userId,
      provider,
      label: displayLabel,
      status: "active",
      credentialCiphertext,
      lastError: null,
    })
    .onConflictDoUpdate({
      target: [connectionsTable.userId, connectionsTable.provider],
      set: {
        label: displayLabel,
        status: "active",
        credentialCiphertext,
        lastError: null,
      },
    })
    .returning();

  logger.info({ userId, provider, connectionId: row.id }, "connection created");
  res.status(201).json(toPublic(row));
});

router.delete("/connections/:id", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const parsed = DeleteConnectionParams.safeParse({ id: req.params.id });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { id } = parsed.data;

  // Row is deleted outright — the credential ciphertext goes with it.
  // No soft-delete, no audit copy, no separate credential table.
  const deleted = await db
    .delete(connectionsTable)
    .where(and(eq(connectionsTable.id, id), eq(connectionsTable.userId, userId)))
    .returning({ id: connectionsTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }
  logger.info({ userId, connectionId: id }, "connection deleted");
  res.status(204).send();
});

router.post("/connections/:id/sync", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const parsed = SyncConnectionParams.safeParse({ id: req.params.id });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { id } = parsed.data;

  const [connection] = await db
    .select()
    .from(connectionsTable)
    .where(and(eq(connectionsTable.id, id), eq(connectionsTable.userId, userId)));

  if (!connection) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }

  try {
    const summary = await runConnectionSync(connection);
    res.json(
      SyncConnectionResponse.parse({
        connectionId: connection.id,
        ...summary,
      }),
    );
  } catch (err) {
    if (err instanceof AdapterError) {
      // Update status; expose the kind so the UI can decide.
      await db
        .update(connectionsTable)
        .set({ status: err.kind === "auth" ? "revoked" : "error", lastError: err.message })
        .where(eq(connectionsTable.id, connection.id));
      res.status(400).json({ error: err.message, kind: err.kind });
      return;
    }
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "connection sync failed");
    res.status(500).json({ error: "Connection sync failed" });
  }
});

export default router;
