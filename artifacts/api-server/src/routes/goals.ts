import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, goalsTable } from "@workspace/db";

const router: IRouter = Router();

function toGoalResponse(r: typeof goalsTable.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    target: parseFloat(r.target),
    current: parseFloat(r.current),
    deadline: r.deadline ?? undefined,
    emoji: r.emoji ?? undefined,
    color: r.color ?? undefined,
    image: r.image ?? undefined,
    monthlyContribution: r.monthlyContribution != null ? parseFloat(r.monthlyContribution) : undefined,
    history: (r.history as Array<{ date: string; amount: number }> | null) ?? [],
  };
}

router.get("/goals", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const rows = await db.select().from(goalsTable).where(eq(goalsTable.userId, userId));
  res.json(rows.map(toGoalResponse));
});

router.post("/goals", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const body = req.body as {
    name: string;
    target: number;
    current?: number;
    deadline?: string;
    emoji?: string;
    color?: string;
    image?: string;
    monthlyContribution?: number;
    history?: Array<{ date: string; amount: number }>;
  };

  if (!body.name?.trim() || typeof body.target !== "number" || body.target <= 0) {
    res.status(400).json({ error: "name and target (>0) required" });
    return;
  }

  const [created] = await db.insert(goalsTable).values({
    userId,
    name: body.name.trim(),
    target: String(body.target),
    current: String(body.current ?? 0),
    deadline: body.deadline ?? null,
    emoji: body.emoji ?? null,
    color: body.color ?? null,
    image: body.image ?? null,
    monthlyContribution: body.monthlyContribution != null ? String(body.monthlyContribution) : null,
    history: body.history ?? [],
  }).returning();

  res.status(201).json(toGoalResponse(created));
});

router.put("/goals/:id", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = req.body as {
    name?: string;
    target?: number;
    current?: number;
    deadline?: string | null;
    emoji?: string | null;
    color?: string | null;
    image?: string | null;
    monthlyContribution?: number | null;
    history?: Array<{ date: string; amount: number }>;
  };

  const updates: Partial<typeof goalsTable.$inferInsert> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.target !== undefined) updates.target = String(body.target);
  if (body.current !== undefined) updates.current = String(body.current);
  if ("deadline" in body) updates.deadline = body.deadline ?? null;
  if ("emoji" in body) updates.emoji = body.emoji ?? null;
  if ("color" in body) updates.color = body.color ?? null;
  if ("image" in body) updates.image = body.image ?? null;
  if ("monthlyContribution" in body) {
    updates.monthlyContribution = body.monthlyContribution != null ? String(body.monthlyContribution) : null;
  }
  if (body.history !== undefined) updates.history = body.history;

  const [updated] = await db
    .update(goalsTable)
    .set(updates)
    .where(and(eq(goalsTable.id, id), eq(goalsTable.userId, userId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Goal not found" }); return; }
  res.json(toGoalResponse(updated));
});

router.post("/goals/:id/add-funds", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { amount } = req.body as { amount: number };
  if (typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "amount (>0) required" });
    return;
  }

  const [existing] = await db.select().from(goalsTable)
    .where(and(eq(goalsTable.id, id), eq(goalsTable.userId, userId)));
  if (!existing) { res.status(404).json({ error: "Goal not found" }); return; }

  const newCurrent = parseFloat(existing.current) + amount;
  const today = new Date().toISOString().slice(0, 10);
  const history = [...((existing.history as Array<{ date: string; amount: number }> | null) ?? []),
    { date: today, amount: newCurrent }];

  const [updated] = await db
    .update(goalsTable)
    .set({ current: String(newCurrent), history })
    .where(eq(goalsTable.id, id))
    .returning();

  res.json(toGoalResponse(updated));
});

router.delete("/goals/:id", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const deleted = await db
    .delete(goalsTable)
    .where(and(eq(goalsTable.id, id), eq(goalsTable.userId, userId)))
    .returning();

  if (deleted.length === 0) { res.status(404).json({ error: "Goal not found" }); return; }
  res.json({ ok: true });
});

export default router;
