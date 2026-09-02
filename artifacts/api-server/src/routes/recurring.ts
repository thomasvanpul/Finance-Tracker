import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, transactionsTable, recurringPatternsTable } from "@workspace/db";
import { detectRecurringPatterns } from "../lib/recurring-detector-server";
import { ListRecurringPatternsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/recurring-patterns", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  const transactions = await db
    .select({
      date: transactionsTable.date,
      description: transactionsTable.description,
      nativeAmount: transactionsTable.nativeAmount,
      currency: transactionsTable.currency,
      type: transactionsTable.type,
    })
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, userId));

  const detected = detectRecurringPatterns(transactions);

  for (const p of detected) {
    await db
      .insert(recurringPatternsTable)
      .values({
        userId,
        normalizedKey: p.normalizedKey,
        displayName: p.displayName,
        intervalDays: p.intervalDays,
        expectedAmount: String(p.expectedAmount),
        currency: p.currency,
        lastOccurrence: p.lastOccurrence,
        nextExpected: p.nextExpected,
        occurrenceCount: p.occurrenceCount,
        status: "active",
      })
      .onConflictDoUpdate({
        target: [recurringPatternsTable.userId, recurringPatternsTable.normalizedKey],
        set: {
          intervalDays: p.intervalDays,
          expectedAmount: String(p.expectedAmount),
          lastOccurrence: p.lastOccurrence,
          nextExpected: p.nextExpected,
          occurrenceCount: p.occurrenceCount,
          status: "active",
          updatedAt: new Date(),
        },
      });
  }

  const patterns = await db
    .select()
    .from(recurringPatternsTable)
    .where(eq(recurringPatternsTable.userId, userId));

  res.json(
    ListRecurringPatternsResponse.parse(
      patterns.map(p => ({
        id: p.id,
        normalizedKey: p.normalizedKey,
        displayName: p.displayName,
        intervalDays: p.intervalDays,
        expectedAmount: parseFloat(p.expectedAmount),
        currency: p.currency,
        lastOccurrence: p.lastOccurrence,
        nextExpected: p.nextExpected ?? undefined,
        occurrenceCount: p.occurrenceCount,
        status: p.status,
      })),
    ),
  );
});

export default router;
