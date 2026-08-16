// Runs an adapter sync end-to-end and persists to accounts/transactions.
// Extracted from the wise route so H2 can retire the /wise/sync endpoint
// and every future adapter (H3-H5) can reuse the same persistence path.

import { and, eq } from "drizzle-orm";
import { db, accountsTable, transactionsTable, connectionsTable, type Connection } from "@workspace/db";
import { getAdapter } from "../adapters";
import { decryptCredential } from "./crypto";
import { logger } from "./logger";

// 90-day rolling window — matches what /wise/sync did before this
// refactor. Change deliberately, not accidentally.
const SYNC_WINDOW_DAYS = 90;

export interface SyncSummary {
  accountsUpserted: number;
  transactionsAdded: number;
  transactionsUpdated: number;
}

export async function runConnectionSync(connection: Connection): Promise<SyncSummary> {
  const adapter = getAdapter(connection.provider);
  if (!adapter) {
    throw new Error(`No adapter registered for provider "${connection.provider}"`);
  }

  // Decrypt at the last possible moment. Kept as a local const so it
  // leaves scope with this function; never passed to the DB layer.
  const credential = decryptCredential(connection.credentialCiphertext);

  const adapterAccounts = await adapter.listAccounts(credential);

  const since = new Date();
  since.setDate(since.getDate() - SYNC_WINDOW_DAYS);

  let accountsUpserted = 0;
  let transactionsAdded = 0;
  let transactionsUpdated = 0;

  for (const acct of adapterAccounts) {
    // Match a Wise-linked (or provider-linked) account by
    // wiseBalanceId. When we onboard non-Wise providers we'll need a
    // generic external-id column on accounts — flagged as follow-up.
    // For today, Wise is the only provider so this stays.
    const [row] = await db
      .insert(accountsTable)
      .values({
        userId: connection.userId,
        name: acct.label,
        currency: acct.currency,
        balance: acct.balance,
        isWiseLinked: connection.provider === "wise",
        wiseProfileId: acct.providerMeta.profileId ?? null,
        wiseBalanceId: connection.provider === "wise" ? acct.externalId : null,
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: accountsTable.wiseBalanceId,
        set: {
          balance: acct.balance,
          lastSyncedAt: new Date(),
        },
      })
      .returning();

    accountsUpserted += 1;

    const txns = await adapter.fetchTransactionsSince(credential, acct, since);
    for (const tx of txns) {
      const nativeAmountNumber = Number(tx.nativeAmount);
      const type = nativeAmountNumber > 0 ? "income" : "expense";
      const existing = await db
        .select({ id: transactionsTable.id })
        .from(transactionsTable)
        .where(
          and(
            eq(transactionsTable.externalId, tx.externalId),
            eq(transactionsTable.userId, connection.userId),
          ),
        );

      if (existing.length > 0) {
        await db
          .update(transactionsTable)
          .set({ nativeAmount: String(Math.abs(nativeAmountNumber)), type })
          .where(
            and(
              eq(transactionsTable.externalId, tx.externalId),
              eq(transactionsTable.userId, connection.userId),
            ),
          );
        transactionsUpdated += 1;
      } else {
        await db.insert(transactionsTable).values({
          userId: connection.userId,
          date: tx.date.slice(0, 10),
          description: tx.description,
          type,
          category: "Other",
          accountId: row.id,
          nativeAmount: String(Math.abs(nativeAmountNumber)),
          currency: tx.currency,
          source: connection.provider,
          externalId: tx.externalId,
        });
        transactionsAdded += 1;
      }
    }
  }

  await db
    .update(connectionsTable)
    .set({
      status: "active",
      lastSyncedAt: new Date(),
      lastError: null,
    })
    .where(eq(connectionsTable.id, connection.id));

  logger.info(
    {
      connectionId: connection.id,
      provider: connection.provider,
      accountsUpserted,
      transactionsAdded,
      transactionsUpdated,
    },
    "connection sync complete",
  );

  return { accountsUpserted, transactionsAdded, transactionsUpdated };
}
