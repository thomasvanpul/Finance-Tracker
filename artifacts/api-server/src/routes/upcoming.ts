import { Router, type IRouter } from "express";
import { eq, and, lte, gte } from "drizzle-orm";
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
import { toGbp } from "../lib/market";

const router: IRouter = Router();

async function enrichUpcoming(item: typeof upcomingTable.$inferSelect, accountMap: Map<number, string>) {
  const nativeAmount = parseFloat(item.nativeAmount);
  const gbpEquivalent = await toGbp(nativeAmount, item.currency);
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
  const items = await db.select().from(upcomingTable).orderBy(upcomingTable.dueDate);
  const accounts = await db.select({ id: accountsTable.id, name: accountsTable.name }).from(accountsTable);
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const enriched = await Promise.all(items.map((i) => enrichUpcoming(i, accountMap)));
  res.json(ListUpcomingResponse.parse(enriched));
});

router.get("/upcoming/summary", async (req, res): Promise<void> => {
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
        gte(upcomingTable.dueDate, todayStr),
        lte(upcomingTable.dueDate, in30Str),
        eq(upcomingTable.status, "pending")
      )
    );

  let committedOutgoings30d = 0;
  let expectedIncome30d = 0;

  for (const item of items) {
    const gbp = await toGbp(parseFloat(item.nativeAmount), item.currency);
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
    const dueDate = d.toISOString().slice(0, 10);
    rows.push({
      dueDate,
      description: `${description} (${i + 1}/${numberOfMonths})`,
      category,
      type: "expense" as const,
      frequency: "one-time" as const,
      status: "pending" as const,
      nativeAmount: String(Math.round(monthlyAmount * 100) / 100),
      currency,
      accountId: accountId ?? null,
    });
  }

  const inserted = await db.insert(upcomingTable).values(rows).returning();
  const accounts = await db.select({ id: accountsTable.id, name: accountsTable.name }).from(accountsTable);
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const enriched = await Promise.all(inserted.map((i) => enrichUpcoming(i, accountMap)));
  res.status(201).json(enriched);
});

router.post("/upcoming/:id/pay", async (req, res): Promise<void> => {
  const params = PayUpcomingItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [item] = await db.select().from(upcomingTable).where(eq(upcomingTable.id, params.data.id));
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  // Mark as paid
  const [updated] = await db
    .update(upcomingTable)
    .set({ status: "paid" })
    .where(eq(upcomingTable.id, params.data.id))
    .returning();

  // Auto-log to transactions
  await db.insert(transactionsTable).values({
    date: item.dueDate,
    description: item.description,
    type: item.type,
    category: item.category,
    accountId: item.accountId ?? 1,
    nativeAmount: item.nativeAmount,
    currency: item.currency,
    source: "manual",
  });

  const accounts = await db.select({ id: accountsTable.id, name: accountsTable.name }).from(accountsTable);
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const enriched = await enrichUpcoming(updated, accountMap);
  res.json(PayUpcomingItemResponse.parse(enriched));
});

router.patch("/upcoming/:id", async (req, res): Promise<void> => {
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
    .where(eq(upcomingTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  const accounts = await db.select({ id: accountsTable.id, name: accountsTable.name }).from(accountsTable);
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const enriched = await enrichUpcoming(item, accountMap);
  res.json(UpdateUpcomingItemResponse.parse(enriched));
});

router.delete("/upcoming/:id", async (req, res): Promise<void> => {
  const params = DeleteUpcomingItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [item] = await db
    .delete(upcomingTable)
    .where(eq(upcomingTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
