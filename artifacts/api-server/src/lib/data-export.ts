// The data export — GET /api/export/backup.
//
// Coverage is DECLARED per table and CHECKED against the schema by
// data-export.lock.test.ts: every table exported from @workspace/db is
// either in EXPORT_SECTIONS or in EXCLUDED_TABLES with a reason, and every
// column of an exported table is either exported or named in that
// section's `withheld` with a reason. A new table or a new column that
// nobody classified fails the gate rather than silently going missing
// from a user's copy of their data (the export covered 8 of 26 tables
// until 2026-09-13).
//
// The one rule for leaving something out: holding it would let someone
// act as the user or read something encrypted. Session tokens, OAuth
// tokens, the password hash, 2FA secrets and backup codes, connection
// credentials and live verification tokens are credentials, not content,
// and a file the user downloads to a laptop, emails to themselves or
// uploads to another service must not carry them. The FACT of each (a
// session, a sign-in method, a connection, 2FA being set up) is exported;
// the secret is not. The file says what it withheld, in `withheld`.
//
// Rows in OTHER users' data that name this user (a debt someone else
// recorded against a linked email, a participant row on someone else's
// shared expense) are the other user's record and are not in this
// export. Section 9 of docs/PRIVACY.md is where that is handled.

import { eq, inArray, or, getTableColumns, type SQL } from "drizzle-orm";
import { getTableConfig, type PgColumn, type PgTable } from "drizzle-orm/pg-core";
import * as schema from "@workspace/db";

const {
  db,
  userTable, sessionTable, accountTable, passkeyTable, totpTable, twoFactorTable,
  accountsTable, transactionsTable, upcomingTable, investmentsTable, debtsTable,
  sharedExpensesTable, sharedExpenseParticipantsTable, sharedExpenseSettlementsTable,
  nwSnapshotsTable, accountBalanceSnapshotsTable, appSettingsTable, budgetsTable,
  goalsTable, subscriptionsTable, dismissedSubscriptionsTable, connectionsTable,
  requestMetricsTable, recurringPatternsTable, userPreferencesTable,
} = schema;

export const EXPORT_VERSION = 2;

const CREDENTIAL = "a credential, not content: holding it lets someone act as you";

export interface ExportSection {
  // Key in the exported JSON.
  key: string;
  table: PgTable;
  // Rows belonging to the user. Receives the user's own shared-expense ids
  // for the two tables that reach the user only through them.
  where: (userId: string, ctx: { sharedExpenseIds: number[]; participantIds: number[] }) => SQL | undefined;
  // Columns (drizzle property names) left out, with the reason. Everything
  // else on the table is exported.
  withheld?: Record<string, string>;
}

export const EXPORT_SECTIONS: readonly ExportSection[] = [
  { key: "profile", table: userTable, where: (u) => eq(userTable.id, u) },
  {
    key: "sessions", table: sessionTable, where: (u) => eq(sessionTable.userId, u),
    withheld: { token: CREDENTIAL },
  },
  {
    key: "signInMethods", table: accountTable, where: (u) => eq(accountTable.userId, u),
    withheld: {
      accessToken: CREDENTIAL,
      refreshToken: CREDENTIAL,
      idToken: CREDENTIAL,
      password: "the password hash: it can be attacked offline to recover the password",
    },
  },
  { key: "passkeys", table: passkeyTable, where: (u) => eq(passkeyTable.userId, u) },
  {
    key: "authenticatorApps", table: totpTable, where: (u) => eq(totpTable.userId, u),
    withheld: { secret: CREDENTIAL },
  },
  {
    key: "twoFactor", table: twoFactorTable, where: (u) => eq(twoFactorTable.userId, u),
    withheld: { secret: CREDENTIAL, backupCodes: CREDENTIAL },
  },
  { key: "settings", table: appSettingsTable, where: (u) => eq(appSettingsTable.userId, u) },
  { key: "preferences", table: userPreferencesTable, where: (u) => eq(userPreferencesTable.userId, u) },
  { key: "accounts", table: accountsTable, where: (u) => eq(accountsTable.userId, u) },
  { key: "transactions", table: transactionsTable, where: (u) => eq(transactionsTable.userId, u) },
  { key: "investments", table: investmentsTable, where: (u) => eq(investmentsTable.userId, u) },
  { key: "upcoming", table: upcomingTable, where: (u) => eq(upcomingTable.userId, u) },
  { key: "debts", table: debtsTable, where: (u) => eq(debtsTable.userId, u) },
  { key: "budgets", table: budgetsTable, where: (u) => eq(budgetsTable.userId, u) },
  { key: "goals", table: goalsTable, where: (u) => eq(goalsTable.userId, u) },
  { key: "subscriptions", table: subscriptionsTable, where: (u) => eq(subscriptionsTable.userId, u) },
  { key: "dismissedSubscriptions", table: dismissedSubscriptionsTable, where: (u) => eq(dismissedSubscriptionsTable.userId, u) },
  { key: "recurringPatterns", table: recurringPatternsTable, where: (u) => eq(recurringPatternsTable.userId, u) },
  {
    key: "connections", table: connectionsTable, where: (u) => eq(connectionsTable.userId, u),
    withheld: { credentialCiphertext: "the provider token, encrypted: a credential once the key is known" },
  },
  { key: "netWorthSnapshots", table: nwSnapshotsTable, where: (u) => eq(nwSnapshotsTable.userId, u) },
  { key: "accountBalanceSnapshots", table: accountBalanceSnapshotsTable, where: (u) => eq(accountBalanceSnapshotsTable.userId, u) },
  { key: "sharedExpenses", table: sharedExpensesTable, where: (u) => eq(sharedExpensesTable.userId, u) },
  {
    key: "sharedExpenseParticipants", table: sharedExpenseParticipantsTable,
    where: (_u, { sharedExpenseIds }) =>
      sharedExpenseIds.length ? inArray(sharedExpenseParticipantsTable.sharedExpenseId, sharedExpenseIds) : undefined,
  },
  {
    // Settlements on the user's own shared expenses, and every settlement
    // action the user took on someone else's.
    key: "sharedExpenseSettlements", table: sharedExpenseSettlementsTable,
    where: (u, { participantIds }) =>
      participantIds.length
        ? or(inArray(sharedExpenseSettlementsTable.participantId, participantIds), eq(sharedExpenseSettlementsTable.actorUserId, u))
        : eq(sharedExpenseSettlementsTable.actorUserId, u),
  },
  { key: "requestRecords", table: requestMetricsTable, where: (u) => eq(requestMetricsTable.userId, u) },
];

// Tables with no section at all, by SQL name.
export const EXCLUDED_TABLES: Readonly<Record<string, string>> = {
  verification:
    "short-lived one-time tokens (password reset, 2FA challenge, trusted device); every row is a credential and none is content",
};

function sectionColumns(section: ExportSection): Record<string, PgColumn> {
  const all = getTableColumns(section.table) as Record<string, PgColumn>;
  const withheld = section.withheld ?? {};
  return Object.fromEntries(Object.entries(all).filter(([name]) => !(name in withheld)));
}

export interface WithheldEntry {
  section: string;
  field: string;
  reason: string;
}

export function withheldList(): WithheldEntry[] {
  const fields = EXPORT_SECTIONS.flatMap((s) =>
    Object.entries(s.withheld ?? {}).map(([field, reason]) => ({ section: s.key, field, reason })),
  );
  const tables = Object.entries(EXCLUDED_TABLES).map(([name, reason]) => ({ section: name, field: "*", reason }));
  return [...fields, ...tables];
}

export async function buildUserExport(userId: string): Promise<Record<string, unknown>> {
  const sharedExpenseIds = (
    await db.select({ id: sharedExpensesTable.id }).from(sharedExpensesTable).where(eq(sharedExpensesTable.userId, userId))
  ).map((r) => r.id);
  const participantIds = sharedExpenseIds.length
    ? (
        await db
          .select({ id: sharedExpenseParticipantsTable.id })
          .from(sharedExpenseParticipantsTable)
          .where(inArray(sharedExpenseParticipantsTable.sharedExpenseId, sharedExpenseIds))
      ).map((r) => r.id)
    : [];
  const ctx = { sharedExpenseIds, participantIds };

  const results = await Promise.all(
    EXPORT_SECTIONS.map(async (section) => {
      const where = section.where(userId, ctx);
      if (!where) return [section.key, []] as const;
      const rows = await db.select(sectionColumns(section)).from(section.table).where(where);
      return [section.key, rows] as const;
    }),
  );
  const sections = Object.fromEntries(results);

  // The profile is one row, and settings is at most one; export them as
  // objects rather than one-element arrays.
  const [profile] = sections.profile as unknown[];
  const [settings] = sections.settings as unknown[];

  return {
    exportedAt: new Date().toISOString(),
    version: EXPORT_VERSION,
    ...sections,
    profile: profile ?? null,
    settings: settings ?? null,
    withheld: withheldList(),
  };
}

// SQL table name for a section — used by the lock test.
export function sectionTableName(section: ExportSection): string {
  return getTableConfig(section.table).name;
}
