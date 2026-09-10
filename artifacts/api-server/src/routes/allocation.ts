import { Router, type IRouter } from "express";
import { and, eq, gte, inArray, lt, lte, or, gt } from "drizzle-orm";
import {
  db,
  accountsTable,
  goalsTable,
  transactionsTable,
  upcomingTable,
  accountBalanceSnapshotsTable,
} from "@workspace/db";
import { getBaseCurrency } from "../lib/app-settings-db";
import { localDateString } from "../lib/date-ranges";
import { toBase } from "../lib/market";
import { computeReconciliation } from "../lib/reconciliation";
import { computeAllocation, HORIZON_DAYS, addDays } from "../lib/allocation";
import { ensureGeneratedUpcoming } from "../lib/subscription-upcoming";
import { GetAllocationResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// GET /allocation — what can be spent today.
//
// ONE endpoint, server-side, deliberately. Both surfaces read it. Not a
// shared React hook: two implementations disagreeing about "how much can I
// spend today" is worse than not having the feature, and the arithmetic
// belongs where the FX rates, stored per-transaction rates and balance
// snapshots already live.
//
// It reads the TABLES, not the feeder routes. That is not laziness about
// reuse — /upcoming/summary computes its 30-day window in UTC
// (upcoming.ts:71-72) while /dashboard computes it in server-local time
// (dashboard.ts:398-402), so the two disagree by a day for eight hours of
// every day at UTC+8. Consuming either would import that disagreement into
// the one number that is supposed to settle it. This route uses
// localDateString, matching /dashboard and /accounts/reconciliation.
//
// The response carries the number AND its decomposition, so the phone can
// show one figure and the desktop can show the reasoning, from one
// computation.
router.get("/allocation", async (req, res): Promise<void> => {
  const userId = (req as unknown as { userId: string }).userId;

  // Same reason /dashboard and /upcoming do it: an active subscription that
  // has not yet emitted its next row is a commitment the window cannot see,
  // and committedOut would understate. Idempotent — the partial unique index
  // from migration 0021 absorbs the race with a concurrent /dashboard.
  await ensureGeneratedUpcoming(userId);

  const today = localDateString(new Date());
  const windowEnd = addDays(today, HORIZON_DAYS);

  const [baseCurrency, cashRows, upcomingRows, goalRows] = await Promise.all([
    getBaseCurrency(userId),
    db
      .select({ id: accountsTable.id, name: accountsTable.name, currency: accountsTable.currency, balance: accountsTable.balance })
      .from(accountsTable)
      .where(and(eq(accountsTable.userId, userId), eq(accountsTable.type, "cash")))
      .orderBy(accountsTable.createdAt),
    db
      .select({
        id: upcomingTable.id,
        dueDate: upcomingTable.dueDate,
        description: upcomingTable.description,
        type: upcomingTable.type,
        nativeAmount: upcomingTable.nativeAmount,
        currency: upcomingTable.currency,
      })
      .from(upcomingTable)
      .where(and(
        eq(upcomingTable.userId, userId),
        gte(upcomingTable.dueDate, today),
        lte(upcomingTable.dueDate, windowEnd),
        eq(upcomingTable.status, "pending"),
      )),
    db
      .select({
        id: goalsTable.id,
        name: goalsTable.name,
        target: goalsTable.target,
        current: goalsTable.current,
        deadline: goalsTable.deadline,
        monthlyContribution: goalsTable.monthlyContribution,
      })
      .from(goalsTable)
      .where(eq(goalsTable.userId, userId)),
  ]);

  // Input 4 — the reconciliation gap, computed exactly as
  // GET /accounts/reconciliation computes it (routes/accounts.ts:77-130),
  // by calling the same pure function on the same query shape. Two ways of
  // measuring drift would be the same defect as two ways of measuring
  // safe-to-spend.
  const ids = cashRows.map((a) => a.id);
  const snapshotRows = ids.length === 0 ? [] : await db
    .select({
      accountId: accountBalanceSnapshotsTable.accountId,
      date: accountBalanceSnapshotsTable.date,
      balance: accountBalanceSnapshotsTable.balance,
      capturedAt: accountBalanceSnapshotsTable.capturedAt,
    })
    .from(accountBalanceSnapshotsTable)
    .where(and(
      eq(accountBalanceSnapshotsTable.userId, userId),
      inArray(accountBalanceSnapshotsTable.accountId, ids),
      lt(accountBalanceSnapshotsTable.date, today),
    ));
  const earliestCapture = snapshotRows.reduce<Date | null>(
    (min, s) => (min == null || s.capturedAt < min ? s.capturedAt : min), null);
  const txRows = earliestCapture == null ? [] : await db
    .select({
      accountId: transactionsTable.accountId,
      type: transactionsTable.type,
      nativeAmount: transactionsTable.nativeAmount,
      currency: transactionsTable.currency,
      transferDirection: transactionsTable.transferDirection,
      createdAt: transactionsTable.createdAt,
      updatedAt: transactionsTable.updatedAt,
    })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.userId, userId),
      inArray(transactionsTable.accountId, ids),
      or(gt(transactionsTable.createdAt, earliestCapture), gt(transactionsTable.updatedAt, earliestCapture)),
    ));

  const cashAccounts = cashRows.map((a) => ({ ...a, balance: parseFloat(a.balance) }));
  const reconciliation = await computeReconciliation({
    cashAccounts,
    snapshots: snapshotRows.map((s) => ({ ...s, balance: parseFloat(s.balance) })),
    transactions: txRows.map((t) => ({ ...t, nativeAmount: parseFloat(t.nativeAmount) })),
    today,
    baseCurrency,
    convert: toBase,
  });

  const result = await computeAllocation({
    today,
    baseCurrency,
    cashAccounts,
    upcoming: upcomingRows.map((u) => ({ ...u, nativeAmount: parseFloat(u.nativeAmount) })),
    // goals carry no currency column (schema/goals.ts). Read as base.
    goals: goalRows.map((g) => ({
      id: g.id,
      name: g.name,
      target: parseFloat(g.target),
      current: parseFloat(g.current),
      deadline: g.deadline,
      monthlyContribution: g.monthlyContribution != null ? parseFloat(g.monthlyContribution) : null,
    })),
    drift: {
      status: reconciliation.status,
      gapBase: reconciliation.gapBase,
      days: reconciliation.days,
      periodFrom: reconciliation.periodFrom,
    },
    convert: toBase,
  });

  res.json(GetAllocationResponse.parse(result));
});

export default router;
