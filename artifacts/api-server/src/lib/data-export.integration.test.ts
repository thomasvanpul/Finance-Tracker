// Every section has the user's rows, no credential leaves, no other user's
// rows arrive. Runs against a real Postgres (the Neon dev branch in local
// development) and is skipped unless NUMERIS_DB_TESTS=1, like
// account-deletion.integration.test.ts:
//
//   cd artifacts/api-server && DATABASE_URL=… NUMERIS_DB_TESTS=1 \
//     npx vitest run data-export.integration
//
// Secrets are seeded as sentinel strings; the whole exported JSON is then
// searched for each, so a withheld column that leaks by any route (a join,
// a spread, a renamed key) is caught, not only the column by name.

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const enabled = process.env.NUMERIS_DB_TESTS === "1" && !!process.env.DATABASE_URL;
const NEON_TIMEOUT_MS = 120_000;

describe.skipIf(!enabled)("data export · complete, and carries no credential (real database)", () => {
  let mod: typeof import("./data-export");
  let schema: typeof import("@workspace/db");
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const me = `exp-test-me-${stamp}`;
  const other = `exp-test-other-${stamp}`;
  const secret = (what: string) => `SENTINEL-${what}-${stamp}`;
  const SECRETS = ["session", "access", "refresh", "idtoken", "password", "totp", "2fa", "backup", "cipher", "verification"].map(secret);
  let metricIds: number[] = [];
  let exported: Record<string, unknown> = {};

  beforeAll(async () => {
    mod = await import("./data-export");
    schema = await import("@workspace/db");
    const s = schema;
    const db = s.db;
    const soon = () => new Date(Date.now() + 60_000);

    await db.insert(s.userTable).values([
      { id: me, name: "Me", email: `exp-test-${stamp}@numeris.invalid` },
      { id: other, name: "Other", email: `exp-test-other-${stamp}@numeris.invalid` },
    ]);
    await db.insert(s.appSettingsTable).values({ userId: me });
    await db.insert(s.userPreferencesTable).values({ userId: me, key: "ft-tx-notes", value: "{\"1\":\"note\"}" });
    await db.insert(s.sessionTable).values([
      { id: `sess-${stamp}`, token: secret("session"), expiresAt: soon(), userId: me, ipAddress: "203.0.113.9", userAgent: "vitest" },
      { id: `sess-o-${stamp}`, token: `other-tok-${stamp}`, expiresAt: soon(), userId: other },
    ]);
    await db.insert(s.accountTable).values({ id: `acc-${stamp}`, accountId: me, providerId: "credential", userId: me, password: secret("password"), accessToken: secret("access"), refreshToken: secret("refresh"), idToken: secret("idtoken") });
    await db.insert(s.passkeyTable).values({ id: `pk-${stamp}`, name: "Laptop", publicKey: "pk", userId: me, credentialID: `cred-${stamp}`, counter: 0, deviceType: "singleDevice", backedUp: false });
    await db.insert(s.totpTable).values({ id: `totp-${stamp}`, userId: me, secret: secret("totp") });
    await db.insert(s.twoFactorTable).values({ id: `2fa-${stamp}`, secret: secret("2fa"), backupCodes: secret("backup"), userId: me });
    await db.insert(s.verificationTable).values({ id: `ver-${stamp}`, identifier: `reset-password:${stamp}`, value: me, expiresAt: soon() });
    const [acct] = await db.insert(s.accountsTable).values({ userId: me, name: "Test current" }).returning({ id: s.accountsTable.id });
    await db.insert(s.transactionsTable).values({ userId: me, date: "2026-09-13", description: "t", type: "expense", category: "Other", accountId: acct.id, nativeAmount: "1", currency: "GBP", rateAsOf: new Date() });
    await db.insert(s.upcomingTable).values({ userId: me, dueDate: "2026-09-14", description: "u", category: "Other", type: "expense", nativeAmount: "1" });
    await db.insert(s.investmentsTable).values({ userId: me, ticker: "T", name: "t", buyDate: "2026-09-13", shares: "1", costPricePerShare: "1" });
    await db.insert(s.debtsTable).values({ userId: me, personName: "p", description: "d", date: "2026-09-13", nativeAmount: "1" });
    await db.insert(s.budgetsTable).values({ userId: me, category: "Other", monthlyLimit: "1" });
    await db.insert(s.goalsTable).values({ userId: me, name: "g", target: "1" });
    await db.insert(s.subscriptionsTable).values({ userId: me, name: "s", amount: "1", startDate: "2026-09-13" });
    await db.insert(s.dismissedSubscriptionsTable).values({ userId: me, description: "d" });
    await db.insert(s.connectionsTable).values({ userId: me, provider: "wise", label: "w", credentialCiphertext: secret("cipher") });
    await db.insert(s.nwSnapshotsTable).values({ userId: me, month: "2026-09", cash: "1", investment: "0", pension: "0", property: "0", other: "0" });
    await db.insert(s.accountBalanceSnapshotsTable).values({ userId: me, accountId: acct.id, date: "2026-09-13", balance: "1", currency: "GBP" });
    await db.insert(s.recurringPatternsTable).values({ userId: me, normalizedKey: `k-${stamp}`, displayName: "r", intervalDays: 30, expectedAmount: "1", currency: "GBP", lastOccurrence: "2026-09-13" });
    const [exp] = await db.insert(s.sharedExpensesTable).values({ userId: me, description: "mine", date: "2026-09-13", totalAmount: "2", splitRule: "equal" }).returning({ id: s.sharedExpensesTable.id });
    const [part] = await db.insert(s.sharedExpenseParticipantsTable).values({ sharedExpenseId: exp.id, name: "Friend", shareAmount: "1" }).returning({ id: s.sharedExpenseParticipantsTable.id });
    await db.insert(s.sharedExpenseSettlementsTable).values({ participantId: part.id, actorUserId: me, kind: "request", note: "on mine" });
    // Someone else's shared expense: my settlement action on it is mine;
    // their expense and its participant rows are theirs.
    const [oexp] = await db.insert(s.sharedExpensesTable).values({ userId: other, description: `theirs-${stamp}`, date: "2026-09-13", totalAmount: "2", splitRule: "equal" }).returning({ id: s.sharedExpensesTable.id });
    const [opart] = await db.insert(s.sharedExpenseParticipantsTable).values({ sharedExpenseId: oexp.id, name: `their-participant-${stamp}`, shareAmount: "1", linkedUserId: me }).returning({ id: s.sharedExpenseParticipantsTable.id });
    await db.insert(s.sharedExpenseSettlementsTable).values({ participantId: opart.id, actorUserId: me, kind: "request", note: "on theirs" });
    const metrics = await db.insert(s.requestMetricsTable).values([
      { route: "/api/exp-test", method: "GET", statusCode: 200, durationMs: 1, userId: me },
      { route: "/api/exp-test-other", method: "GET", statusCode: 200, durationMs: 1, userId: other },
    ]).returning({ id: s.requestMetricsTable.id });
    metricIds = metrics.map((m) => m.id);

    exported = await mod.buildUserExport(me);
  }, NEON_TIMEOUT_MS);

  afterAll(async () => {
    const { eq, inArray } = await import("drizzle-orm");
    await schema.db.delete(schema.userTable).where(inArray(schema.userTable.id, [me, other]));
    await schema.db.delete(schema.verificationTable).where(eq(schema.verificationTable.id, `ver-${stamp}`));
    if (metricIds.length) await schema.db.delete(schema.requestMetricsTable).where(inArray(schema.requestMetricsTable.id, metricIds));
    await schema.pool.end();
  }, NEON_TIMEOUT_MS);

  it("every section carries the user's rows", () => {
    const empty = mod.EXPORT_SECTIONS.map((s) => s.key).filter((key) => {
      const v = exported[key];
      return Array.isArray(v) ? v.length === 0 : v == null;
    });
    expect(empty).toEqual([]);
    expect((exported.profile as { id: string }).id).toBe(me);
    expect(exported.version).toBe(2);
  });

  it("no seeded secret appears anywhere in the file", () => {
    const text = JSON.stringify(exported);
    expect(SECRETS.filter((s) => text.includes(s))).toEqual([]);
  });

  it("the facts behind the secrets are still there", () => {
    expect((exported.sessions as Array<{ ipAddress: string }>)[0].ipAddress).toBe("203.0.113.9");
    expect((exported.signInMethods as Array<{ providerId: string }>)[0].providerId).toBe("credential");
    expect((exported.connections as Array<{ provider: string }>)[0].provider).toBe("wise");
    expect(exported.withheld).toEqual(expect.arrayContaining([expect.objectContaining({ section: "sessions", field: "token" })]));
  });

  it("carries none of the other user's rows, and only my own actions on their expense", () => {
    const text = JSON.stringify(exported);
    expect(text).not.toContain(`other-tok-${stamp}`);
    expect(text).not.toContain(`theirs-${stamp}`);
    expect(text).not.toContain(`their-participant-${stamp}`);
    expect(text).not.toContain("/api/exp-test-other");
    expect(exported.sessions).toHaveLength(1);
    expect(exported.requestRecords).toHaveLength(1);
    const notes = (exported.sharedExpenseSettlements as Array<{ note: string }>).map((r) => r.note).sort();
    expect(notes).toEqual(["on mine", "on theirs"]);
  });
});
