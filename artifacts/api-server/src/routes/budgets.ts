import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, budgetsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/budgets", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const rows = await db.select().from(budgetsTable).where(eq(budgetsTable.userId, userId));
  res.json(rows.map(r => ({
    id: r.id,
    category: r.category,
    monthlyLimit: parseFloat(r.monthlyLimit),
  })));
});

router.post("/budgets", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const { category, monthlyLimit } = req.body as { category: string; monthlyLimit: number };
  if (!category || typeof monthlyLimit !== "number" || monthlyLimit <= 0) {
    res.status(400).json({ error: "category and monthlyLimit (>0) required" });
    return;
  }
  const [created] = await db.insert(budgetsTable).values({
    userId,
    category: category.trim(),
    monthlyLimit: String(monthlyLimit),
  }).returning();
  res.status(201).json({ id: created.id, category: created.category, monthlyLimit: parseFloat(created.monthlyLimit) });
});

router.put("/budgets/:id", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(req.params.id, 10);
  const { monthlyLimit } = req.body as { monthlyLimit: number };
  if (!Number.isInteger(id) || typeof monthlyLimit !== "number" || monthlyLimit <= 0) {
    res.status(400).json({ error: "monthlyLimit (>0) required" });
    return;
  }
  const [updated] = await db
    .update(budgetsTable)
    .set({ monthlyLimit: String(monthlyLimit) })
    .where(and(eq(budgetsTable.id, id), eq(budgetsTable.userId, userId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Budget not found" }); return; }
  res.json({ id: updated.id, category: updated.category, monthlyLimit: parseFloat(updated.monthlyLimit) });
});

router.delete("/budgets/:id", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const deleted = await db
    .delete(budgetsTable)
    .where(and(eq(budgetsTable.id, id), eq(budgetsTable.userId, userId)))
    .returning();
  if (deleted.length === 0) { res.status(404).json({ error: "Budget not found" }); return; }
  res.json({ ok: true });
});

export default router;
