import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, debtsTable } from "@workspace/db";
import {
  CreateDebtBody,
  UpdateDebtParams,
  UpdateDebtBody,
  DeleteDebtParams,
  SettleDebtParams,
  ListDebtsResponse,
  GetDebtSummaryResponse,
} from "@workspace/api-zod";
import { toBase } from "../lib/market";
import { getBaseCurrency } from "../lib/app-settings-db";
import { adjustAccountBalance } from "../lib/balance";

const router: IRouter = Router();

async function enrichDebt(item: typeof debtsTable.$inferSelect, userId: string) {
  const nativeAmount = parseFloat(item.nativeAmount);
  const baseCurrency = await getBaseCurrency(userId);
  const gbpEquivalent = await toBase(nativeAmount, item.currency, baseCurrency);
  return {
    id: item.id,
    personName: item.personName,
    description: item.description,
    date: item.date,
    nativeAmount,
    currency: item.currency,
    direction: item.direction,
    status: item.status,
    notes: item.notes ?? null,
    accountId: item.accountId ?? null,
    gbpEquivalent: Math.round(gbpEquivalent * 100) / 100,
    createdAt: item.createdAt.toISOString(),
  };
}

router.get("/debts/summary", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const items = await db
    .select()
    .from(debtsTable)
    .where(and(eq(debtsTable.userId, userId), eq(debtsTable.status, "pending")));

  const baseCurrency = await getBaseCurrency(userId);
  let totalOwedToMe = 0;
  let totalIOwe = 0;

  for (const item of items) {
    const gbp = await toBase(parseFloat(item.nativeAmount), item.currency, baseCurrency);
    if (item.direction === "they_owe_me") totalOwedToMe += gbp;
    else totalIOwe += gbp;
  }

  res.json(
    GetDebtSummaryResponse.parse({
      totalOwedToMe: Math.round(totalOwedToMe * 100) / 100,
      totalIOwe: Math.round(totalIOwe * 100) / 100,
      netGbp: Math.round((totalOwedToMe - totalIOwe) * 100) / 100,
      pendingCount: items.length,
    })
  );
});

router.get("/debts", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const items = await db
    .select()
    .from(debtsTable)
    .where(eq(debtsTable.userId, userId))
    .orderBy(debtsTable.date);
  const enriched = await Promise.all(items.map((i) => enrichDebt(i, userId)));
  res.json(ListDebtsResponse.parse(enriched));
});

router.post("/debts", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const parsed = CreateDebtBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { nativeAmount, ...rest } = parsed.data;
  const [item] = await db
    .insert(debtsTable)
    .values({ ...rest, nativeAmount: String(nativeAmount), userId })
    .returning();
  const enriched = await enrichDebt(item, userId);
  res.status(201).json(enriched);
});

router.post("/debts/:id/settle", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const params = SettleDebtParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(debtsTable)
    .where(and(eq(debtsTable.id, params.data.id), eq(debtsTable.userId, userId)));
  if (!existing) {
    res.status(404).json({ error: "Debt not found" });
    return;
  }
  const [item] = await db
    .update(debtsTable)
    .set({ status: "settled" })
    .where(and(eq(debtsTable.id, params.data.id), eq(debtsTable.userId, userId)))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Debt not found" });
    return;
  }
  if (existing.accountId) {
    const nativeAmount = parseFloat(existing.nativeAmount);
    const txType = existing.direction === "i_owe_them" ? "expense" : "income";
    await adjustAccountBalance(existing.accountId, nativeAmount, existing.currency, txType);
  }
  const enriched = await enrichDebt(item, userId);
  res.json(enriched);
});

router.patch("/debts/:id", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const params = UpdateDebtParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateDebtBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.nativeAmount !== undefined) updateData.nativeAmount = String(parsed.data.nativeAmount);
  const [item] = await db
    .update(debtsTable)
    .set(updateData)
    .where(and(eq(debtsTable.id, params.data.id), eq(debtsTable.userId, userId)))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Debt not found" });
    return;
  }
  const enriched = await enrichDebt(item, userId);
  res.json(enriched);
});

router.delete("/debts/:id", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const params = UpdateDebtParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [item] = await db
    .delete(debtsTable)
    .where(and(eq(debtsTable.id, params.data.id), eq(debtsTable.userId, userId)))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Debt not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
