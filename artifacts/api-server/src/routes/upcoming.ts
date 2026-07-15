import { Router, type IRouter } from "express";
import { and, eq, lte, gte } from "drizzle-orm";
import { db, upcomingTable, accountsTable, transactionsTable } from "@workspace/db";
import {
  CreateUpcomingItemBody,
  UpdateUpcomingItemParams,
  UpdateUpcomingItemBody,
  DeleteUpcomingItemParams,
  PayUpcomingItemParams,
  ListUpcomingResponse,
  UpdateUpcomingItemResponse,
  PayUpcomingItemResponse,
  GetUpcomingSummaryResponse,
  GenerateInstallmentsBody,
} from "@workspace/api-zod";
import { toBase } from "../lib/market";
import { getBaseCurrency } from "../lib/app-settings-db";
import { adjustAccountBalance } from "../lib/balance";

const router: IRouter = Router();

async function enrichUpcoming(item: typeof upcomingTable.$inferSelect, accountMap: Map<number, string>, userId: string) {
  const nativeAmount = parseFloat(item.nativeAmount);
  const baseCurrency = await getBaseCurrency(userId);
  const gbpEquivalent = await toBase(nativeAmount, item.currency, baseCurrency);
  return {
    id: item.id,
    dueDate: item.dueDate,
    description: item.description,
    category: item.category,
    type: item.type,
    frequency: item.frequency,
    status: item.status,
    nativeAmount,
    currency: item.currency,
    gbpEquivalent: Math.round(gbpEquivalent * 100) / 100,
    accountId: item.accountId ?? null,
    accountName: item.accountId ? (accountMap.get(item.accountId) ?? null) : null,
    createdAt: item.createdAt.toISOString(),
  };
}

router.get("/upcoming", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const items = await db
    .select()
    .from(upcomingTable)
    .where(eq(upcomingTable.userId, userId))
    .orderBy(upcomingTable.dueDate);
  const accounts = await db
    .select({ id: accountsTable.id, name: accountsTable.name })
    .from(accountsTable)
    .where(eq(accountsTable.userId, userId));
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const enriched = await Promise.all(items.map((i) => enrichUpcoming(i, accountMap, userId)));
  res.json(ListUpcomingResponse.parse(enriched));
});

router.get("/upcoming/summary", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const today = new Date();
  const in30 = new Date(today);
  in30.setDate(today.getDate() + 30);
  const todayStr = today.toISOString().slice(0, 10);
  const in30Str = in30.toISOString().slice(0, 10);

  const items = await db
    .select()
    .from(upcomingTable)
    .where(
      and(
        eq(upcomingTable.userId, userId),
        gte(upcomingTable.dueDate, todayStr),
        lte(upcomingTable.dueDate, in30Str),
        eq(upcomingTable.status, "pending")
      )
    );

  const baseCurrency = await getBaseCurrency(userId);
  let committedOutgoings30d = 0;
  let expectedIncome30d = 0;
  for (const item of items) {
    const gbp = await toBase(parseFloat(item.nativeAmount), item.currency, baseCurrency);
    if (item.type === "expense") committedOutgoings30d += gbp;
    else if (item.type === "income") expectedIncome30d += gbp;
  }

  res.json(
    GetUpcomingSummaryResponse.parse({
      committedOutgoings30d: Math.round(committedOutgoings30d * 100) / 100,
      expectedIncome30d: Math.round(expectedIncome30d * 100) / 100,
    })
  );
});

router.post("/upcoming/installments", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const parsed = GenerateInstallmentsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { description, category, totalAmount, currency, numberOfMonths, startDate, accountId } = parsed.data;
  const monthlyAmount = totalAmount / numberOfMonths;

  const rows = [];
  for (let i = 0; i < numberOfMonths; i++) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + i);
    rows.push({
      dueDate: d.toISOString().slice(0, 10),
      description: `${description} (${i + 1}/${numberOfMonths})`,
      category,
      type: "expense" as const,
      frequency: "one-time" as const,
      status: "pending" as const,
      nativeAmount: String(Math.round(monthlyAmount * 100) / 100),
      currency,
      accountId: accountId ?? null,
      userId,
    });
  }

  const inserted = await db.insert(upcomingTable).values(rows).returning();
  const accounts = await db
    .select({ id: accountsTable.id, name: accountsTable.name })
    .from(accountsTable)
    .where(eq(accountsTable.userId, userId));
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const enriched = await Promise.all(inserted.map((i) => enrichUpcoming(i, accountMap, userId)));
  res.status(201).json(enriched);
});

router.post("/upcoming/:id/pay", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const params = PayUpcomingItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [item] = await db
    .select()
    .from(upcomingTable)
    .where(and(eq(upcomingTable.id, params.data.id), eq(upcomingTable.userId, userId)));
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const [updated] = await db
    .update(upcomingTable)
    .set({ status: "paid" })
    .where(and(eq(upcomingTable.id, params.data.id), eq(upcomingTable.userId, userId)))
    .returning();

  const accounts = await db
    .select({ id: accountsTable.id, name: accountsTable.name })
    .from(accountsTable)
    .where(eq(accountsTable.userId, userId));

  // Use the first account if none linked; if user has no accounts yet skip balance adjustment
  const targetAccountId = item.accountId ?? accounts[0]?.id;
  if (targetAccountId) {
    await db.insert(transactionsTable).values({
      date: item.dueDate,
      description: item.description,
      type: item.type,
      category: item.category,
      accountId: targetAccountId,
      nativeAmount: item.nativeAmount,
      currency: item.currency,
      source: "manual",
      userId,
    });
    await adjustAccountBalance(targetAccountId, parseFloat(item.nativeAmount), item.currency, item.type);
  }

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const enriched = await enrichUpcoming(updated, accountMap, userId);
  res.json(PayUpcomingItemResponse.parse(enriched));
});

router.patch("/upcoming/:id", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const params = UpdateUpcomingItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateUpcomingItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.nativeAmount !== undefined) updateData.nativeAmount = String(parsed.data.nativeAmount);

  const [item] = await db
    .update(upcomingTable)
    .set(updateData)
    .where(and(eq(upcomingTable.id, params.data.id), eq(upcomingTable.userId, userId)))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  const accounts = await db
    .select({ id: accountsTable.id, name: accountsTable.name })
    .from(accountsTable)
    .where(eq(accountsTable.userId, userId));
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const enriched = await enrichUpcoming(item, accountMap, userId);
  res.json(UpdateUpcomingItemResponse.parse(enriched));
});

router.delete("/upcoming/:id", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const params = DeleteUpcomingItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [item] = await db
    .delete(upcomingTable)
    .where(and(eq(upcomingTable.id, params.data.id), eq(upcomingTable.userId, userId)))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
