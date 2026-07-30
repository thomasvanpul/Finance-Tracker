import { eq, sql } from "drizzle-orm";
import { db, accountsTable } from "@workspace/db";
import { toGbp, gbpTo } from "./market";
import { logger } from "./logger";

/**
 * Adjust an account's native-currency balance after a transaction.
 * - income  → balance increases
 * - expense → balance decreases
 * - transfer → no change (handled elsewhere)
 * Pass reverse=true to undo a previous adjustment (e.g. on delete).
 */
export async function adjustAccountBalance(
  accountId: number,
  nativeAmount: number,
  currency: string,
  txType: string,
  reverse = false,
): Promise<void> {
  if (txType === "transfer") return;

  const [acct] = await db
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
    delta = await gbpTo(gbp, acct.currency);
  }

  if (txType === "expense") delta = -delta;
  if (reverse) delta = -delta;

  await db.execute(
    sql`UPDATE accounts SET balance = CAST(balance AS numeric) + ${delta} WHERE id = ${accountId}`,
  );
}
