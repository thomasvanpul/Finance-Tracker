// Generation: active subscriptions -> upcoming rows.
//
// The recurrence arithmetic lives in ./subscription-recurrence (pure, no
// database). This module is the seam between that arithmetic and the two
// tables, kept behind a `RecurrenceStore` interface so the idempotency and
// advancement properties can be proved against an in-memory store that
// models the unique index, rather than against a chain of drizzle mocks
// that would only prove the mocks agree with themselves.

// The db seam for ./subscription-recurrence, which holds every line of
// this feature that does not need a database and is tested without one.
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db, subscriptionsTable, upcomingTable } from "@workspace/db";
import {
  generateUpcomingFromSubscriptions,
  type RecurrenceStore,
} from "./subscription-recurrence";
import { logger } from "./logger";

// ── The live store ───────────────────────────────────────────────────────

export const dbRecurrenceStore: RecurrenceStore = {
  async activeSubscriptions(userId) {
    return db
      .select({
        id: subscriptionsTable.id,
        name: subscriptionsTable.name,
        amount: subscriptionsTable.amount,
        currency: subscriptionsTable.currency,
        frequency: subscriptionsTable.frequency,
        category: subscriptionsTable.category,
        nextDue: subscriptionsTable.nextDue,
        startDate: subscriptionsTable.startDate,
      })
      .from(subscriptionsTable)
      .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.active, true)));
  },

  async occupiedOccurrences(userId) {
    const rows = await db
      .select({ subscriptionId: upcomingTable.subscriptionId, dueDate: upcomingTable.dueDate, status: upcomingTable.status })
      .from(upcomingTable)
      .where(and(eq(upcomingTable.userId, userId), isNotNull(upcomingTable.subscriptionId)));
    return rows.map((r) => ({ subscriptionId: r.subscriptionId as number, dueDate: r.dueDate, status: r.status }));
  },

  async handEnteredExpenses(userId) {
    return db
      .select({
        id: upcomingTable.id,
        dueDate: upcomingTable.dueDate,
        description: upcomingTable.description,
        nativeAmount: upcomingTable.nativeAmount,
        currency: upcomingTable.currency,
      })
      .from(upcomingTable)
      .where(and(
        eq(upcomingTable.userId, userId),
        isNull(upcomingTable.subscriptionId),
        eq(upcomingTable.type, "expense"),
        eq(upcomingTable.status, "pending"),
      ));
  },

  async insertGenerated(rows) {
    // onConflictDoNothing against upcoming_subscription_due_uniq. This is
    // the concurrency half of idempotency: two requests that both computed
    // the same occurrence before either inserted do not both write.
    const written = await db
      .insert(upcomingTable)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: upcomingTable.id });
    return written.length;
  },
};

/**
 * Called from the read paths that consume the upcoming window.
 *
 * Failure is logged, never thrown: a subscription that could not be
 * generated must not turn a dashboard load into a 500. The cost of that
 * choice is real and named here — committedOut is then quietly missing a
 * subscription, and the only evidence is this log line.
 */
export async function ensureGeneratedUpcoming(userId: string): Promise<void> {
  try {
    const result = await generateUpcomingFromSubscriptions(userId, dbRecurrenceStore);
    if (result.inserted > 0) {
      logger.info({ userId, inserted: result.inserted }, "subscription recurrence: generated upcoming rows");
    }
    if (result.duplicates.length > 0) {
      // The only report surface this has. Measured overlap on the seed
      // account on 2026-09-10 was zero pairs under a rule three times
      // looser than this one, so a screen for it would today be a screen
      // that renders nothing. When this line starts firing, it has earned
      // one — and its home is a section inside UPCOMING, not a new route.
      logger.warn(
        { userId, duplicates: result.duplicates },
        "subscription recurrence: hand-entered upcoming rows may duplicate a subscription; committedOut may count them twice. Not merged, not deleted.",
      );
    }
    if (result.unsupported.length > 0) {
      logger.warn(
        { userId, unsupported: result.unsupported },
        "subscription recurrence: frequency not modelled, no upcoming row generated",
      );
    }
  } catch (err) {
    logger.error(
      { userId, err },
      "subscription recurrence: generation failed; committedOut may understate subscriptions for this request",
    );
  }
}
