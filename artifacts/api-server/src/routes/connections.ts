import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, connectionsTable, transactionsTable, type Connection } from "@workspace/db";
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
import { parseFileCredential } from "../adapters/file";
import { logger } from "../lib/logger";
import { runConnectionSync } from "../lib/connection-sync";
import { computeExternalId } from "../lib/file-dedup";

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

  // File-adapter metadata: institution + format columns land here so
  // the settings UI can distinguish "File: Monzo (CSV)" from
  // "File: HSBC (CSV)" without decrypting the credential blob.
  let institution: string | null = null;
  let format: string | null = null;
  if (provider === "file") {
    const parsed = parseFileCredential(credential);
    if (!("error" in parsed)) {
      institution = parsed.institution;
      format = parsed.format;
    }
  }

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
      institution,
      format,
    })
    .onConflictDoUpdate({
      target: [connectionsTable.userId, connectionsTable.provider],
      set: {
        label: displayLabel,
        status: "active",
        credentialCiphertext,
        lastError: null,
        institution,
        format,
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

// H5 · POST /connections/:id/import
//
// Push a parsed statement into a file-provider connection. The
// client has already resolved the CSV (or OFX) rows to a common
// shape — description, date, signed amount, currency, type,
// category — so the server-side dedup logic can be independent of
// the source format.
//
// Dedup contract:
//   1. externalId = computeExternalId({userId, accountId, date,
//      description, nativeAmount}) — the deterministic sha256
//      truncated to 32 base64url chars.
//   2. Insert with ON CONFLICT (userId, accountId, externalId) DO
//      NOTHING — the unique index on transactions handles the
//      collision.
//   3. Response reports attempted / inserted / duplicates so the
//      user knows exactly how many new rows landed.
//   4. Update connections.lastSyncedAt and clear lastError on
//      success; on any exception, set lastError and status=error.
//
// The dedup rule collapses two truly-identical purchases on the
// same day (rare but real: two coffees at the same shop for the
// same amount) into one row. This is the accepted trade-off; the
// alternative (ordinal-based hash) breaks re-import whenever a
// reissued statement adds a same-day row and shifts ordinals.
router.post("/connections/:id/import", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }

  const [connection] = await db
    .select()
    .from(connectionsTable)
    .where(and(eq(connectionsTable.id, id), eq(connectionsTable.userId, userId)));
  if (!connection) {
    res.status(404).json({ error: "connection not found" });
    return;
  }
  if (connection.provider !== "file") {
    res.status(400).json({ error: "import is only supported on file connections" });
    return;
  }

  // Body shape (kept inline — this route is the only caller):
  //   { accountId: number, rows: NormalizedRow[] }
  // where NormalizedRow = {
  //   date: string; description: string; nativeAmount: number;
  //   currency: string; type: "income" | "expense"; category: string;
  // }
  interface IncomingRow {
    date: string;
    description: string;
    nativeAmount: number;
    currency: string;
    type: "income" | "expense";
    category: string;
  }
  const body = req.body as { accountId?: unknown; rows?: unknown };
  const accountId = typeof body?.accountId === "number" ? body.accountId : NaN;
  const rowsIn = Array.isArray(body?.rows) ? (body.rows as IncomingRow[]) : null;
  if (!Number.isInteger(accountId) || !rowsIn) {
    res.status(400).json({ error: "expected { accountId: number, rows: NormalizedRow[] }" });
    return;
  }

  let inserted = 0;
  let duplicates = 0;
  try {
    for (const row of rowsIn) {
      if (
        typeof row?.date !== "string" ||
        typeof row?.description !== "string" ||
        typeof row?.nativeAmount !== "number" ||
        typeof row?.currency !== "string" ||
        (row.type !== "income" && row.type !== "expense") ||
        typeof row?.category !== "string"
      ) {
        // Skip malformed rows silently — the row-level validator
        // in the frontend should have caught them. A malformed row
        // that made it past that is not a reason to abort the
        // whole import.
        continue;
      }
      const externalId = computeExternalId({
        userId,
        accountId,
        date: row.date,
        description: row.description,
        // Sign matches how nativeAmount is stored — negative for
        // expenses on income/expense flip. Some parsers deliver
        // positive amounts with a separate type; normalise here.
        nativeAmount: row.type === "expense" ? -Math.abs(row.nativeAmount) : Math.abs(row.nativeAmount),
      });

      const result = await db
        .insert(transactionsTable)
        .values({
          userId,
          date: row.date,
          description: row.description,
          type: row.type,
          category: row.category,
          accountId,
          nativeAmount: String(Math.abs(row.nativeAmount)),
          currency: row.currency,
          source: "file",
          externalId,
        })
        .onConflictDoNothing({
          target: [transactionsTable.userId, transactionsTable.accountId, transactionsTable.externalId],
        })
        .returning({ id: transactionsTable.id });

      if (result.length > 0) inserted += 1;
      else duplicates += 1;
    }

    await db
      .update(connectionsTable)
      .set({ status: "active", lastSyncedAt: new Date(), lastError: null })
      .where(eq(connectionsTable.id, connection.id));

    res.json({
      connectionId: connection.id,
      attempted: rowsIn.length,
      inserted,
      duplicates,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(connectionsTable)
      .set({ status: "error", lastError: message })
      .where(eq(connectionsTable.id, connection.id));
    logger.error({ err: message, connectionId: connection.id }, "file import failed");
    res.status(500).json({ error: "import failed", detail: message });
  }
});

export default router;
