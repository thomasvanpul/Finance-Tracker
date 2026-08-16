import { eq, sql, type ExtractTablesWithRelations } from "drizzle-orm";
import { type PgTransaction } from "drizzle-orm/pg-core";
import { type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { db, accountsTable } from "@workspace/db";
import { toGbp, gbpTo } from "./market";
import { logger } from "./logger";

// Covers both `db` (NodePgDatabase) and the transaction object inside db.transaction()
type DbOrTx =
  | typeof db
  | PgTransaction<NodePgQueryResultHKT, Record<string, unknown>, ExtractTablesWithRelations<Record<string, unknown>>>;

/**
 * Adjust an account's native-currency balance after a transaction.
 * - income  → balance increases
 * - expense → balance decreases
 * - transfer → no change (handled elsewhere)
 * Pass reverse=true to undo a previous adjustment (e.g. on delete).
 *
 * Pass a Drizzle transaction object as dbOrTx to run atomically with the
 * surrounding insert/delete — this prevents a crash between the two
 * operations from leaving balance and transaction table out of sync.
 */
export async function adjustAccountBalance(
  accountId: number,
  nativeAmount: number,
  currency: string,
  txType: string,
  reverse = false,
  dbOrTx: DbOrTx = db,
): Promise<void> {
  if (txType === "transfer") return;

  const [acct] = await dbOrTx
    .select({ id: accountsTable.id, currency: accountsTable.currency })
    .from(accountsTable)
    .where(eq(accountsTable.id, accountId));

  if (!acct) {
    logger.warn({ accountId }, "adjustAccountBalance: account not found, skipping");
    return;
  }

  let delta: number;
  if (currency === acct.currency) {
    delta = nativeAmount;
  } else {
    const gbp = await toGbp(nativeAmount, currency);
    const converted = gbp == null ? null : await gbpTo(gbp, acct.currency);
    if (converted == null) {
      // Either leg of the FX conversion is unavailable. Refuse to apply
      // a fabricated delta — this used to silently substitute (via the
      // deleted rate fallbacks) and then quietly move the account's
      // balance by a wrong amount. Better to leave the balance untouched
      // and log; the transaction row itself still records the native
      // amount honestly.
      logger.warn(
        { accountId, currency, targetCurrency: acct.currency },
        "adjustAccountBalance: FX rate unavailable, skipping balance update",
      );
      return;
    }
    delta = converted;
  }

  if (txType === "expense") delta = -delta;
  if (reverse) delta = -delta;

  await dbOrTx.execute(
    sql`UPDATE accounts SET balance = CAST(balance AS numeric) + ${delta} WHERE id = ${accountId}`,
  );
}
