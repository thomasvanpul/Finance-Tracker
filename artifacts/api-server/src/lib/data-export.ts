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

import { and, asc, eq, gt, inArray, or, getTableColumns, type SQL } from "drizzle-orm";
import { getTableConfig, type PgColumn, type PgTable } from "drizzle-orm/pg-core";
import * as schema from "@workspace/db";
import { pagedRows, writeJsonObject, type JsonField, type Write } from "./json-stream";

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
  // An integer primary key to read the section by, a page at a time,
  // instead of in one query. For sections that grow with use rather than
  // with the user's own data entry.
  pageBy?: PgColumn;
}

// Rows per query for a paged section.
export const EXPORT_PAGE_SIZE = 2000;

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
  {
    // The largest section by far, and the one that grows with use: 23,103
    // rows for the heaviest dev user on 1 Oct, inside the 30-day retention
    // window (lib/request-metrics.ts). Paged, so the export never holds it.
    key: "requestRecords", table: requestMetricsTable, where: (u) => eq(requestMetricsTable.userId, u),
    pageBy: requestMetricsTable.id,
  },
];

// Tables with no section at all, by SQL name.
export const EXCLUDED_TABLES: Readonly<Record<string, string>> = {
  verification:
    "short-lived one-time tokens (password reset, 2FA challenge, trusted device); every row is a credential and none is content",
  eod_prices:
    "public closing prices keyed by (ticker, session date) with no user_id — market reference data shared by every account, not this user's content. What the user holds is exported from `investments`; the price VUSA.L closed at on 15 Sep is not theirs to take away",
  provider_health:
    "durable mirror of the in-process circuit-breaker state (lib/provider-health.ts) keyed by provider name with no user_id — operational evidence about Yahoo/Alpaca/Polygon/etc being up or down, not this user's content",
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

// Writes the export as JSON through `write`, one section — and for a paged
// section one page — at a time, so memory holds a page rather than the file.
// Sections are read in turn rather than all at once for the same reason.
export async function writeUserExport(userId: string, write: Write): Promise<void> {
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

  function* fields(): Generator<[string, JsonField]> {
    yield ["exportedAt", { value: new Date().toISOString() }];
    yield ["version", { value: EXPORT_VERSION }];
    for (const section of EXPORT_SECTIONS) {
      yield [section.key, sectionField(section, section.where(userId, ctx))];
    }
    yield ["withheld", { value: withheldList() }];
  }
  await writeJsonObject(fields(), write);
}

// The profile is one row, and settings is at most one; they are exported
// as objects rather than one-element arrays.
const SINGLE_ROW_SECTIONS = new Set(["profile", "settings"]);

function sectionField(section: ExportSection, where: SQL | undefined): JsonField {
  const columns = sectionColumns(section);
  if (SINGLE_ROW_SECTIONS.has(section.key)) {
    return {
      value: (async () => {
        if (!where) return null;
        const [row] = await db.select(columns).from(section.table).where(where);
        return row ?? null;
      })(),
    };
  }
  if (!where) return { pages: (async function* () {})() };
  const key = section.pageBy;
  if (!key) {
    return { pages: (async function* () { yield await db.select(columns).from(section.table).where(where); })() };
  }
  const keyProp = keyProperty(section, key);
  return {
    pages: pagedRows(
      EXPORT_PAGE_SIZE,
      (after, limit) =>
        db.select(columns).from(section.table)
          .where(after == null ? where : and(where, gt(key, after)))
          .orderBy(asc(key)).limit(limit),
      (row) => (row as Record<string, unknown>)[keyProp] as number,
    ),
  };
}

// Drizzle property name of a column (rows are keyed by property, not SQL name).
function keyProperty(section: ExportSection, column: PgColumn): string {
  const hit = Object.entries(getTableColumns(section.table)).find(([, c]) => c === column);
  if (!hit) throw new Error(`pageBy column is not on ${section.key}`);
  return hit[0];
}

// The whole export as one object — for tests and anything that wants it in
// memory. It is the streamed text parsed back, so it is exactly what the
// route sends.
export async function buildUserExport(userId: string): Promise<Record<string, unknown>> {
  const chunks: string[] = [];
  await writeUserExport(userId, async (c) => { chunks.push(c); });
  return JSON.parse(chunks.join("")) as Record<string, unknown>;
}

// SQL table name for a section — used by the lock test.
export function sectionTableName(section: ExportSection): string {
  return getTableConfig(section.table).name;
}
