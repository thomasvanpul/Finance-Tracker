// Nothing survives. Runs against a real Postgres (the Neon dev branch in
// local development) and is skipped unless NUMERIS_DB_TESTS=1, because the
// gate must not depend on the network. Run it by hand:
//
//   cd artifacts/api-server && set -a && . ../../lib/db/.env && set +a \
//     && NUMERIS_DB_TESTS=1 npx vitest run account-deletion.integration
//
// Seeds one row in EVERY user-owned table (the list is derived from the
// schema by userOwnedTables, so a new table is seeded or the test fails
// on an unseeded name), plus the two explicit tables and two rows in a
// second user's data that name the first user. Then deletes, then counts.

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const enabled = process.env.NUMERIS_DB_TESTS === "1" && !!process.env.DATABASE_URL;

// Neon round-trips from this machine are 200-400 ms each and the seed is
// ~30 sequential statements, so the default 10 s hook timeout is too tight.
const NEON_TIMEOUT_MS = 120_000;

describe.skipIf(!enabled)("account deletion · nothing survives (real database)", () => {
  // Dynamic imports so the module (and its pool) only loads when enabled.
  let mod: typeof import("./account-deletion");
  let schema: typeof import("@workspace/db");
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const victim = `del-test-victim-${stamp}`;
  const victimEmail = `del-test-${stamp}@numeris.invalid`;
  const other = `del-test-other-${stamp}`;
  let metricId = 0;
  let seeded: Record<string, number> = {};

  beforeAll(async () => {
    mod = await import("./account-deletion");
    schema = await import("@workspace/db");
    const { db, sql } = { db: schema.db, sql: (await import("drizzle-orm")).sql };
    const s = schema;

    await db.insert(s.userTable).values([
      { id: victim, name: "Victim", email: victimEmail },
      { id: other, name: "Other", email: `del-test-other-${stamp}@numeris.invalid` },
    ]);
    await db.insert(s.appSettingsTable).values({ userId: victim });
    await db.insert(s.sessionTable).values({ id: `sess-${stamp}`, token: `tok-${stamp}`, expiresAt: new Date(Date.now() + 60_000), userId: victim, ipAddress: "203.0.113.9", userAgent: "vitest" });
    await db.insert(s.accountTable).values({ id: `acc-${stamp}`, accountId: victim, providerId: "credential", userId: victim, password: "hash" });
    await db.insert(s.passkeyTable).values({ id: `pk-${stamp}`, publicKey: "pk", userId: victim, credentialID: `cred-${stamp}`, counter: 0, deviceType: "singleDevice", backedUp: false });
    await db.insert(s.totpTable).values({ id: `totp-${stamp}`, userId: victim, secret: "s" });
    await db.insert(s.twoFactorTable).values({ id: `2fa-${stamp}`, secret: "s", backupCodes: "c", userId: victim });
    const [acct] = await db.insert(s.accountsTable).values({ userId: victim, name: "Test current" }).returning({ id: s.accountsTable.id });
    await db.insert(s.transactionsTable).values({ userId: victim, date: "2026-09-05", description: "t", type: "expense", category: "Other", accountId: acct.id, nativeAmount: "1", currency: "GBP", rateAsOf: new Date() });
    await db.insert(s.upcomingTable).values({ userId: victim, dueDate: "2026-09-06", description: "u", category: "Other", type: "expense", nativeAmount: "1" });
    await db.insert(s.investmentsTable).values({ userId: victim, ticker: "T", name: "t", buyDate: "2026-09-05", shares: "1", costPricePerShare: "1" });
    await db.insert(s.debtsTable).values({ userId: victim, personName: "p", description: "d", date: "2026-09-05", nativeAmount: "1" });
    await db.insert(s.budgetsTable).values({ userId: victim, category: "Other", monthlyLimit: "1" });
    await db.insert(s.goalsTable).values({ userId: victim, name: "g", target: "1" });
    await db.insert(s.subscriptionsTable).values({ userId: victim, name: "s", amount: "1", startDate: "2026-09-05" });
    await db.insert(s.dismissedSubscriptionsTable).values({ userId: victim, description: "d" });
    await db.insert(s.connectionsTable).values({ userId: victim, provider: "wise", label: "w", credentialCiphertext: "ct" });
    await db.insert(s.nwSnapshotsTable).values({ userId: victim, month: "2026-09", cash: "1", investment: "0", pension: "0", property: "0", other: "0" });
    await db.insert(s.accountBalanceSnapshotsTable).values({ userId: victim, accountId: acct.id, date: "2026-09-05", balance: "1", currency: "GBP" });
    await db.insert(s.recurringPatternsTable).values({ userId: victim, normalizedKey: `k-${stamp}`, displayName: "r", intervalDays: 30, expectedAmount: "1", currency: "GBP", lastOccurrence: "2026-09-05" });
    const [exp] = await db.insert(s.sharedExpensesTable).values({ userId: victim, description: "e", date: "2026-09-05", totalAmount: "2", splitRule: "equal" }).returning({ id: s.sharedExpensesTable.id });
    const [part] = await db.insert(s.sharedExpenseParticipantsTable).values({ sharedExpenseId: exp.id, name: "Other", shareAmount: "1", linkedUserId: other }).returning({ id: s.sharedExpenseParticipantsTable.id });
    await db.insert(s.sharedExpenseSettlementsTable).values({ participantId: part.id, actorUserId: victim, kind: "request" });

    // The two explicit tables.
    await db.insert(s.verificationTable).values([
      { id: `ver-a-${stamp}`, identifier: victimEmail, value: "code", expiresAt: new Date(Date.now() + 60_000) },
      { id: `ver-b-${stamp}`, identifier: `reset-password:${stamp}`, value: victim, expiresAt: new Date(Date.now() + 60_000) },
    ]);
    const [metric] = await db.insert(s.requestMetricsTable).values({ route: "/api/del-test", method: "GET", statusCode: 200, durationMs: 1, userId: victim }).returning({ id: s.requestMetricsTable.id });
    metricId = metric.id;

    // The other user's rows that name the victim.
    await db.insert(s.debtsTable).values({ userId: other, personName: "Victim", description: "owed", date: "2026-09-05", nativeAmount: "5", linkedUserId: victim });
    const [oexp] = await db.insert(s.sharedExpensesTable).values({ userId: other, description: "dinner", date: "2026-09-05", totalAmount: "2", splitRule: "equal" }).returning({ id: s.sharedExpensesTable.id });
    await db.insert(s.sharedExpenseParticipantsTable).values({ sharedExpenseId: oexp.id, name: "Victim", linkedEmail: victimEmail, shareAmount: "1", linkedUserId: victim });

    for (const owned of mod.userOwnedTables()) {
      const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(owned.table).where((await import("drizzle-orm")).eq(owned.column, victim));
      seeded[owned.name] = (seeded[owned.name] ?? 0) + row.n;
    }
  }, NEON_TIMEOUT_MS);

  afterAll(async () => {
    const { eq } = await import("drizzle-orm");
    await schema.db.delete(schema.userTable).where(eq(schema.userTable.id, other));
    await schema.db.delete(schema.userTable).where(eq(schema.userTable.id, victim));
    if (metricId) await schema.db.delete(schema.requestMetricsTable).where(eq(schema.requestMetricsTable.id, metricId));
    await schema.pool.end();
  }, NEON_TIMEOUT_MS);

  it("seeded at least one row in every user-owned table before deleting", () => {
    const empty = Object.entries(seeded).filter(([, n]) => n === 0).map(([name]) => name);
    expect(empty).toEqual([]);
    expect(Object.keys(seeded).length).toBeGreaterThanOrEqual(20);
  });

  it("deletes the user and leaves zero rows for them in every table", async () => {
    const { eq, sql } = await import("drizzle-orm");
    const result = await mod.deleteUserAccount(victim);
    expect(result).not.toBeNull();
    // Everything counted before the delete is reported as deleted.
    for (const [name, n] of Object.entries(seeded)) expect(result!.tables[name], name).toBe(n);
    expect(result!.tables.verification).toBe(2);
    expect(result!.tables.request_metrics_anonymised).toBe(1);

    const survivors: string[] = [];
    for (const owned of mod.userOwnedTables()) {
      const [row] = await schema.db.select({ n: sql<number>`count(*)::int` }).from(owned.table).where(eq(owned.column, victim));
      if (row.n > 0) survivors.push(`${owned.name}=${row.n}`);
    }
    expect(survivors).toEqual([]);

    const verifications = await schema.db.select().from(schema.verificationTable).where(eq(schema.verificationTable.value, victim));
    expect(verifications).toEqual([]);
    const byEmail = await schema.db.select().from(schema.verificationTable).where(eq(schema.verificationTable.identifier, victimEmail));
    expect(byEmail).toEqual([]);

    const [metric] = await schema.db.select().from(schema.requestMetricsTable).where(eq(schema.requestMetricsTable.id, metricId));
    expect(metric).toBeDefined();
    expect(metric.userId).toBeNull();

    // The other user's records survive with the link removed.
    const otherDebts = await schema.db.select().from(schema.debtsTable).where(eq(schema.debtsTable.userId, other));
    expect(otherDebts).toHaveLength(1);
    expect(otherDebts[0].linkedUserId).toBeNull();
    const otherParts = await schema.db.select({ linkedUserId: schema.sharedExpenseParticipantsTable.linkedUserId, name: schema.sharedExpenseParticipantsTable.name })
      .from(schema.sharedExpenseParticipantsTable)
      .innerJoin(schema.sharedExpensesTable, eq(schema.sharedExpensesTable.id, schema.sharedExpenseParticipantsTable.sharedExpenseId))
      .where(eq(schema.sharedExpensesTable.userId, other));
    expect(otherParts).toEqual([{ linkedUserId: null, name: "Victim" }]);

    // A second call finds nothing.
    expect(await mod.deleteUserAccount(victim)).toBeNull();
  }, NEON_TIMEOUT_MS);
});
