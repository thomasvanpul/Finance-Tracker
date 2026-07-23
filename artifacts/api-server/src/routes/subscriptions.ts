import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, subscriptionsTable, dismissedSubscriptionsTable } from "@workspace/db";

const router: IRouter = Router();

function toSubResponse(r: typeof subscriptionsTable.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    amount: parseFloat(r.amount),
    currency: r.currency,
    frequency: r.frequency,
    category: r.category,
    nextDue: r.nextDue ?? undefined,
    startDate: r.startDate,
    active: r.active,
    notes: r.notes ?? undefined,
    manuallyAdded: r.manuallyAdded,
  };
}

router.get("/subscriptions", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const rows = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, userId));
  res.json(rows.map(toSubResponse));
});

router.post("/subscriptions", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const body = req.body as {
    name: string;
    amount: number;
    currency?: string;
    frequency?: string;
    category?: string;
    nextDue?: string;
    startDate?: string;
    active?: boolean;
    notes?: string;
    manuallyAdded?: boolean;
  };

  if (!body.name?.trim() || typeof body.amount !== "number" || body.amount <= 0) {
    res.status(400).json({ error: "name and amount (>0) required" });
    return;
  }

  const [created] = await db.insert(subscriptionsTable).values({
    userId,
    name: body.name.trim(),
    amount: String(body.amount),
    currency: body.currency ?? "GBP",
    frequency: body.frequency ?? "monthly",
    category: body.category ?? "Other",
    nextDue: body.nextDue ?? null,
    startDate: body.startDate ?? new Date().toISOString().slice(0, 10),
    active: body.active ?? true,
    notes: body.notes ?? null,
    manuallyAdded: body.manuallyAdded ?? true,
  }).returning();

  res.status(201).json(toSubResponse(created));
});

router.put("/subscriptions/:id", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = req.body as {
    name?: string;
    amount?: number;
    currency?: string;
    frequency?: string;
    category?: string;
    nextDue?: string | null;
    startDate?: string;
    active?: boolean;
    notes?: string | null;
    manuallyAdded?: boolean;
  };

  const updates: Partial<typeof subscriptionsTable.$inferInsert> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.amount !== undefined) updates.amount = String(body.amount);
  if (body.currency !== undefined) updates.currency = body.currency;
  if (body.frequency !== undefined) updates.frequency = body.frequency;
  if (body.category !== undefined) updates.category = body.category;
  if ("nextDue" in body) updates.nextDue = body.nextDue ?? null;
  if (body.startDate !== undefined) updates.startDate = body.startDate;
  if (body.active !== undefined) updates.active = body.active;
  if ("notes" in body) updates.notes = body.notes ?? null;
  if (body.manuallyAdded !== undefined) updates.manuallyAdded = body.manuallyAdded;

  const [updated] = await db
    .update(subscriptionsTable)
    .set(updates)
    .where(and(eq(subscriptionsTable.id, id), eq(subscriptionsTable.userId, userId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Subscription not found" }); return; }
  res.json(toSubResponse(updated));
});

router.delete("/subscriptions/:id", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const deleted = await db
    .delete(subscriptionsTable)
    .where(and(eq(subscriptionsTable.id, id), eq(subscriptionsTable.userId, userId)))
    .returning();

  if (deleted.length === 0) { res.status(404).json({ error: "Subscription not found" }); return; }
  res.json({ ok: true });
});

// ── Dismissed candidates ──────────────────────────────────────────────────────

router.get("/subscriptions/dismissed", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const rows = await db.select()
    .from(dismissedSubscriptionsTable)
    .where(eq(dismissedSubscriptionsTable.userId, userId));
  res.json(rows.map(r => r.description));
});

router.post("/subscriptions/dismissed", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const { description } = req.body as { description: string };
  if (!description?.trim()) {
    res.status(400).json({ error: "description required" });
    return;
  }
  await db.insert(dismissedSubscriptionsTable).values({ userId, description: description.trim() })
    .onConflictDoNothing();
  res.status(201).json({ ok: true });
});

router.delete("/subscriptions/dismissed/:description", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const description = decodeURIComponent(req.params.description);
  await db.delete(dismissedSubscriptionsTable)
    .where(and(
      eq(dismissedSubscriptionsTable.userId, userId),
      eq(dismissedSubscriptionsTable.description, description),
    ));
  res.json({ ok: true });
});

export default router;
