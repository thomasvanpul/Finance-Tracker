import { eq, type ExtractTablesWithRelations } from "drizzle-orm";
import { type PgTransaction } from "drizzle-orm/pg-core";
import { type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { db, accountsTable, accountBalanceSnapshotsTable } from "@workspace/db";
import { snapshotFxRate } from "./market";
import { getBaseCurrency } from "./app-settings-db";
import { localDateString } from "./date-ranges";
import { logger } from "./logger";

// Covers both `db` (NodePgDatabase) and the transaction object inside db.transaction().
// Mirrors the shape used by balance.ts::adjustAccountBalance so the same DbOrTx
// can be threaded through both write paths inside a shared transaction if needed.
type DbOrTx =
  | typeof db
  | PgTransaction<NodePgQueryResultHKT, Record<string, unknown>, ExtractTablesWithRelations<Record<string, unknown>>>;

// Lazy write-once fan-out. Called from any heavy user path that touches
// balances (currently: dashboard read; accounts PATCH). Snapshots every
// account the user owns for today's local date, but only when today's
// row for that account does not already exist — onConflictDoNothing
// enforces the write-once-per-(accountId, date) invariant that Design
// decision #2 in the report is built on.
//
// Native + rate + rateAsOf per Design decision #4. Consumers derive the
// base equivalent via `balance * nativeToBaseRate` and fall through to
// live toBase() when the stored rate is null (same pattern as txToBase).
export async function captureAccountSnapshots(
  userId: string,
  dbOrTx: DbOrTx = db,
): Promise<void> {
  const accounts = await dbOrTx
    .select({
      id: accountsTable.id,
      balance: accountsTable.balance,
      currency: accountsTable.currency,
    })
    .from(accountsTable)
    .where(eq(accountsTable.userId, userId));

  if (accounts.length === 0) return;

  const baseCurrency = await getBaseCurrency(userId);
  const today = localDateString(new Date());

  // Fan out the FX snapshot calls; getFxRates caches so N accounts × one
  // process-wide FX read is still one HTTP round-trip.
  const rows = await Promise.all(
    accounts.map(async (a) => {
      const { rate, asOf } = await snapshotFxRate(a.currency, baseCurrency);
      return {
        userId,
        accountId: a.id,
        date: today,
        balance: a.balance,
        currency: a.currency,
        nativeToBaseRate: rate == null ? null : String(rate),
        rateAsOf: asOf,
      };
    }),
  );

  try {
    await dbOrTx
      .insert(accountBalanceSnapshotsTable)
      .values(rows)
      .onConflictDoNothing({
        target: [accountBalanceSnapshotsTable.accountId, accountBalanceSnapshotsTable.date],
      });
  } catch (err) {
    // Snapshot writes are lazy side-effects on the read path. A failure
    // here must never break the dashboard response — the snapshot table
    // is downstream of the read, and today's row can be captured on the
    // next read instead. Log and swallow (same posture as
    // adjustAccountBalance's FX-unavailable branch — pre-existing pattern
    // in this codebase for observability-only writes).
    logger.warn({ err, userId, accountCount: accounts.length }, "captureAccountSnapshots: insert failed");
  }
}
