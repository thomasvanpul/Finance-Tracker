import { and, eq, sql, type ExtractTablesWithRelations } from "drizzle-orm";
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
 * True when `accountId` names an account owned by `userId`.
 *
 * The check every write path naming a user-supplied account id must do
 * before it stores that id or moves money with it. `routes/import.ts:54`
 * has done exactly this since it was written; nothing else did, which is
 * the hole this function exists to close in one shape rather than nine.
 *
 * Callers answer 404, never 403 — a 403 confirms that some other user's
 * account id exists, and every other not-owned row in this API already
 * answers 404 by scoping its SELECT to userId and treating "absent" and
 * "not yours" as the same thing.
 */
export async function isAccountOwnedBy(
  accountId: number,
  userId: string,
  dbOrTx: DbOrTx = db,
): Promise<boolean> {
  const [acct] = await dbOrTx
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(and(eq(accountsTable.id, accountId), eq(accountsTable.userId, userId)));
  return acct != null;
}

/**
 * Adjust an account's native-currency balance after a transaction.
 * - income   → balance increases
 * - expense  → balance decreases
 * - transfer, direction='out' → balance decreases (debit leg)
 * - transfer, direction='in'  → balance increases (credit leg)
 * - transfer, direction=null  → no change (legacy one-sided row, pre-migration)
 *
 * Pass reverse=true to undo a previous adjustment (e.g. on delete).
 * Pass a Drizzle transaction object as dbOrTx to run atomically.
 *
 * `userId` is REQUIRED and is not a courtesy argument. Until 10-Sep this
 * function looked the account up by id alone, and so did its UPDATE, in a
 * multi-tenant app — so any route that passed an id it had not checked
 * moved another user's balance. It is second in the parameter list and
 * typed `string` where a `number` used to sit, so `tsc` fails loudly on
 * any call site that does not supply it, including one added later. That
 * is the point: this is enforced by the compiler, not by remembering.
 *
 * Routes must still reject an unowned id themselves with 404
 * (`isAccountOwnedBy` above). The scoping here is the backstop, and it is
 * deliberately still a skip-and-warn rather than a throw: the delete path
 * runs against rows already committed, some of which carry a dangling
 * accountId written before this check existed (`split.tsx` wrote
 * `accountId: 0`), and turning those into a 500 on delete would be a new
 * defect rather than a fix. Skipping moves no money, which is the safe
 * answer for a row we cannot attribute.
 */
export async function adjustAccountBalance(
  accountId: number,
  userId: string,
  nativeAmount: number,
  currency: string,
  txType: string,
  reverse = false,
  dbOrTx: DbOrTx = db,
  transferDirection?: string | null,
): Promise<void> {
  if (txType === "transfer" && !transferDirection) return;

  const [acct] = await dbOrTx
    .select({ id: accountsTable.id, currency: accountsTable.currency })
    .from(accountsTable)
    .where(and(eq(accountsTable.id, accountId), eq(accountsTable.userId, userId)));

  if (!acct) {
    logger.warn({ accountId, userId }, "adjustAccountBalance: account not found or not owned, skipping");
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

  if (txType === "expense" || (txType === "transfer" && transferDirection === "out")) delta = -delta;
  if (reverse) delta = -delta;

  // user_id in the WHERE as well as in the SELECT above. The SELECT is
  // the gate; this is the write, and a gate that guards a different row
  // from the one it writes guards nothing.
  await dbOrTx.execute(
    sql`UPDATE accounts SET balance = CAST(balance AS numeric) + ${delta} WHERE id = ${accountId} AND user_id = ${userId}`,
  );
}
