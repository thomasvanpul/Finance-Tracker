// Account deletion — everything the user owns goes, in one transaction.
//
// Coverage is DERIVED from the schema, not listed by hand: every table
// exported from @workspace/db whose foreign key points at user.id with
// onDelete: cascade is a user-owned table, and Postgres removes its rows
// when the user row goes. Two tables reach the user without a cascade
// and are handled explicitly here:
//
//   verification    better-auth's token store. No FK — rows are keyed by
//                   `identifier` (the email for email flows; a random
//                   trust id for the 2FA "trust this device" flow) and
//                   `value` (the user id for password resets). Deleted by
//                   either match.
//   request_metrics user_id is deliberately not a foreign key (see the
//                   schema comment: the p95 series must not be rewritten
//                   when a user leaves). The timing rows stay; the link to
//                   a person is removed by nulling user_id.
//
// Rows in OTHER users' tables that name this user through a
// `linked_user_id` (a debt owed to them, a shared-expense participant)
// are the other user's record of their own money. They keep their text
// (name, linked email) and lose the user link (onDelete: set null).
//
// The lock test (account-deletion.lock.test.ts) asserts that the schema
// stays inside these three shapes, so a new table that references the
// user without a cascade fails the gate instead of surviving a deletion.

import { eq, or, like, sql } from "drizzle-orm";
import { getTableConfig, PgTable, type PgColumn } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import * as schema from "@workspace/db";
import { db, userTable, verificationTable, requestMetricsTable } from "@workspace/db";

// Columns that reference user.id from another user's row. set null, not
// cascade, and not counted as the deleted user's data.
export const OTHER_USERS_LINK_COLUMNS: ReadonlySet<string> = new Set(["linked_user_id"]);

// Tables that carry a user identifier with no foreign key, and how the
// deletion handles each. The lock test cross-checks this against the
// schema: a user_id-shaped column with no FK must appear here.
export const EXPLICITLY_HANDLED: Readonly<Record<string, "delete-by-identifier" | "anonymise">> = {
  verification: "delete-by-identifier",
  request_metrics: "anonymise",
};

export interface UserOwnedTable {
  name: string;
  table: PgTable;
  column: PgColumn;
}

// Every (table, column) pair that cascades from user.id, derived from the
// drizzle table configs. Includes the user table itself (its id column)
// so the count loop reports it too.
export function userOwnedTables(): UserOwnedTable[] {
  const userConfig = getTableConfig(userTable);
  const out: UserOwnedTable[] = [{ name: userConfig.name, table: userTable, column: userTable.id }];
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable) || value === userTable) continue;
    const config = getTableConfig(value);
    for (const fk of config.foreignKeys) {
      const ref = fk.reference();
      if (getTableConfig(ref.foreignTable).name !== userConfig.name) continue;
      if (fk.onDelete !== "cascade") continue;
      out.push({ name: config.name, table: value, column: ref.columns[0] });
    }
  }
  return out;
}

export interface DeletionResult {
  deletedRows: number;
  tables: Record<string, number>;
}

// Returns null when no such user exists (already deleted, or never was).
export async function deleteUserAccount(userId: string): Promise<DeletionResult | null> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: userTable.id, email: userTable.email })
      .from(userTable)
      .where(eq(userTable.id, userId));
    if (!user) return null;

    // Count first — after the user row goes the cascade has already run
    // and there is nothing left to count. The counts are what the
    // response reports and what the integration test asserts against.
    const tables: Record<string, number> = {};
    for (const owned of userOwnedTables()) {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(owned.table)
        .where(eq(owned.column, userId));
      tables[owned.name] = (tables[owned.name] ?? 0) + (row?.n ?? 0);
    }

    const anonymised = await tx
      .update(requestMetricsTable)
      .set({ userId: null })
      .where(eq(requestMetricsTable.userId, userId));
    tables.request_metrics_anonymised = rowCount(anonymised);

    const verifications = await tx
      .delete(verificationTable)
      .where(
        or(
          eq(verificationTable.identifier, user.email),
          like(verificationTable.identifier, `%${user.email}`),
          eq(verificationTable.value, userId),
          like(verificationTable.value, `${userId}!%`),
        ),
      );
    tables.verification = rowCount(verifications);

    await tx.delete(userTable).where(eq(userTable.id, userId));

    const deletedRows = Object.entries(tables)
      .filter(([name]) => name !== "request_metrics_anonymised")
      .reduce((sum, [, n]) => sum + n, 0);
    return { deletedRows, tables };
  });
}

function rowCount(result: unknown): number {
  return (result as { rowCount?: number | null }).rowCount ?? 0;
}
