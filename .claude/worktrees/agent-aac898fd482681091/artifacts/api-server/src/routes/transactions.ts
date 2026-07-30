import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db, transactionsTable, accountsTable } from "@workspace/db";
import {
  CreateTransactionBody,
  UpdateTransactionParams,
  UpdateTransactionBody,
  DeleteTransactionParams,
  ListTransactionsQueryParams,
  ListTransactionsResponse,
  UpdateTransactionResponse,
  GetTransactionSummaryQueryParams,
  GetTransactionSummaryResponse,
} from "@workspace/api-zod";
import { toBase } from "../lib/market";
import { getBaseCurrency } from "../lib/app-settings-db";
import { adjustAccountBalance } from "../lib/balance";

const router: IRouter = Router();

async function enrichTransaction(tx: typeof transactionsTable.$inferSelect, accountMap: Map<number, string>) {
  const nativeAmount = parseFloat(tx.nativeAmount);
  const baseCurrency = await getBaseCurrency();
  const rawGbp = await toBase(Math.abs(nativeAmount), tx.currency, baseCurrency);
  const gbpValue = tx.type === "expense" ? -rawGbp : rawGbp;
  return {
    id: tx.id,
    date: tx.date,
    description: tx.description,
    type: tx.type,
    category: tx.category,
    accountId: tx.accountId,
    accountName: accountMap.get(tx.accountId) ?? "Unknown",
    nativeAmount,
    currency: tx.currency,
    gbpValue: Math.round(gbpValue * 100) / 100,
    source: tx.source,
    externalId: tx.externalId ?? null,
    createdAt: tx.createdAt.toISOString(),
  };
}

router.get("/transactions", async (req, res): Promise<void> => {
  const query = ListTransactionsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const { accountId, type, category, dateFrom, dateTo } = query.data;

  const conditions = [];
  if (accountId) conditions.push(eq(transactionsTable.accountId, accountId));
  if (type) conditions.push(eq(transactionsTable.type, type));
  if (category) conditions.push(eq(transactionsTable.category, category));
  if (dateFrom) conditions.push(gte(transactionsTable.date, dateFrom));
  if (dateTo) conditions.push(lte(transactionsTable.date, dateTo));

  const txs = await db
    .select()
    .from(transactionsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(transactionsTable.date);

  const accounts = await db.select({ id: accountsTable.id, name: accountsTable.name }).from(accountsTable);
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

  const enriched = await Promise.all(txs.map((tx) => enrichTransaction(tx, accountMap)));
  res.json(ListTransactionsResponse.parse(enriched));
});

router.post("/transactions", async (req, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [tx] = await db
    .insert(transactionsTable)
    .values({ ...parsed.data, nativeAmount: String(parsed.data.nativeAmount) })
    .returning();

  await adjustAccountBalance(parsed.data.accountId, parsed.data.nativeAmount, parsed.data.currency, parsed.data.type);

  const accounts = await db.select({ id: accountsTable.id, name: accountsTable.name }).from(accountsTable);
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const enriched = await enrichTransaction(tx, accountMap);
  res.status(201).json(UpdateTransactionResponse.parse(enriched));
});

router.get("/transactions/summary", async (req, res): Promise<void> => {
  const query = GetTransactionSummaryQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const month = query.data.month ?? new Date().toISOString().slice(0, 7);
  const dateFrom = `${month}-01`;
  const lastDay = new Date(parseInt(month.slice(0, 4)), parseInt(month.slice(5, 7)), 0).getDate();
  const dateTo = `${month}-${String(lastDay).padStart(2, "0")}`;

  const txs = await db
    .select()
    .from(transactionsTable)
    .where(and(gte(transactionsTable.date, dateFrom), lte(transactionsTable.date, dateTo)));

  const baseCurrency = await getBaseCurrency();
  let totalIncome = 0;
  let totalExpenses = 0;
  for (const tx of txs) {
    const native = parseFloat(tx.nativeAmount);
    const gbp = await toBase(Math.abs(native), tx.currency, baseCurrency);
    if (tx.type === "income") totalIncome += gbp;
    else if (tx.type === "expense") totalExpenses += gbp;
  }

  const netSavings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

  res.json(
    GetTransactionSummaryResponse.parse({
      month,
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      netSavings: Math.round(netSavings * 100) / 100,
      savingsRate: Math.round(savingsRate * 100) / 100,
    })
  );
});

router.patch("/transactions/:id", async (req, res): Promise<void> => {
  const params = UpdateTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.nativeAmount !== undefined) updateData.nativeAmount = String(parsed.data.nativeAmount);

  const [tx] = await db
    .update(transactionsTable)
    .set(updateData)
    .where(eq(transactionsTable.id, params.data.id))
    .returning();
  if (!tx) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  const accounts = await db.select({ id: accountsTable.id, name: accountsTable.name }).from(accountsTable);
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const enriched = await enrichTransaction(tx, accountMap);
  res.json(UpdateTransactionResponse.parse(enriched));
});

router.delete("/transactions/:id", async (req, res): Promise<void> => {
  const params = DeleteTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [tx] = await db
    .delete(transactionsTable)
    .where(eq(transactionsTable.id, params.data.id))
    .returning();
  if (!tx) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  // Reverse the balance adjustment
  await adjustAccountBalance(tx.accountId, parseFloat(tx.nativeAmount), tx.currency, tx.type, true);
  res.sendStatus(204);
});

export default router;
