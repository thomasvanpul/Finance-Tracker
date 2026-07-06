import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
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
import { toGbp } from "../lib/market";
import { adjustAccountBalance } from "../lib/balance";

const router: IRouter = Router();

async function enrichDebt(item: typeof debtsTable.$inferSelect) {
  const nativeAmount = parseFloat(item.nativeAmount);
  const gbpEquivalent = await toGbp(nativeAmount, item.currency);
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
  const items = await db
    .select()
    .from(debtsTable)
    .where(eq(debtsTable.status, "pending"));

  let totalOwedToMe = 0;
  let totalIOwe = 0;

  for (const item of items) {
    const gbp = await toGbp(parseFloat(item.nativeAmount), item.currency);
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
  const items = await db.select().from(debtsTable).orderBy(debtsTable.date);
  const enriched = await Promise.all(items.map(enrichDebt));
  res.json(ListDebtsResponse.parse(enriched));
});

router.post("/debts", async (req, res): Promise<void> => {
  const parsed = CreateDebtBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { nativeAmount, ...rest } = parsed.data;
  const [item] = await db
    .insert(debtsTable)
    .values({ ...rest, nativeAmount: String(nativeAmount) })
    .returning();
  const enriched = await enrichDebt(item);
  res.status(201).json(enriched);
});

router.post("/debts/:id/settle", async (req, res): Promise<void> => {
  const params = SettleDebtParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  // Fetch the debt before updating so we know accountId and direction
  const [existing] = await db.select().from(debtsTable).where(eq(debtsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Debt not found" });
    return;
  }
  const [item] = await db
    .update(debtsTable)
    .set({ status: "settled" })
    .where(eq(debtsTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Debt not found" });
    return;
  }
  // If the debt has a linked account, adjust its balance
  if (existing.accountId) {
    const nativeAmount = parseFloat(existing.nativeAmount);
    // i_owe_them: I paid → expense (balance goes down)
    // they_owe_me: I received → income (balance goes up)
    const txType = existing.direction === "i_owe_them" ? "expense" : "income";
    await adjustAccountBalance(existing.accountId, nativeAmount, existing.currency, txType);
  }
  const enriched = await enrichDebt(item);
  res.json(enriched);
});

router.patch("/debts/:id", async (req, res): Promise<void> => {
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
  if (parsed.data.nativeAmount !== undefined) {
    updateData.nativeAmount = String(parsed.data.nativeAmount);
  }
  const [item] = await db
    .update(debtsTable)
    .set(updateData)
    .where(eq(debtsTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Debt not found" });
    return;
  }
  const enriched = await enrichDebt(item);
  res.json(enriched);
});

router.delete("/debts/:id", async (req, res): Promise<void> => {
  const params = UpdateDebtParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [item] = await db
    .delete(debtsTable)
    .where(eq(debtsTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Debt not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
