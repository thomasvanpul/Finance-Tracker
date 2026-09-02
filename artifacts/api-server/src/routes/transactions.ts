import { Router, type IRouter } from "express";
import { and, eq, gte, lte, sql } from "drizzle-orm";
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
import { snapshotFxRate, txToBase } from "../lib/market";
import { getBaseCurrency } from "../lib/app-settings-db";
import { adjustAccountBalance } from "../lib/balance";

const router: IRouter = Router();

async function enrichTransaction(tx: typeof transactionsTable.$inferSelect, accountMap: Map<number, string>, userId: string) {
  const nativeAmount = parseFloat(tx.nativeAmount);
  const baseCurrency = await getBaseCurrency(userId);
  // txToBase uses the row's stored native_to_base_rate if present
  // (post-30-Aug write) and falls back to live toBase() otherwise.
  // A stored-rate row does not drift; a null-rate legacy row still
  // renders honestly until the backfill catches it.
  const rawBase = await txToBase(tx, baseCurrency);
  // Null passes through per the widened API contract; consumers
  // render the native amount alone.
  const baseEquivalent =
    rawBase == null
      ? null
      : Math.round((tx.type === "expense" ? -rawBase : rawBase) * 100) / 100;
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
    baseEquivalent,
    source: tx.source,
    externalId: tx.externalId ?? null,
    createdAt: tx.createdAt.toISOString(),
    transferGroupId: tx.transferGroupId ?? null,
    transferDirection: (tx.transferDirection as "out" | "in" | null) ?? null,
  };
}

router.get("/transactions", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const query = ListTransactionsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const { accountId, type, category, dateFrom, dateTo } = query.data;

  const conditions = [eq(transactionsTable.userId, userId)];
  if (accountId) conditions.push(eq(transactionsTable.accountId, accountId));
  if (type) conditions.push(eq(transactionsTable.type, type));
  if (category) conditions.push(eq(transactionsTable.category, category));
  if (dateFrom) conditions.push(gte(transactionsTable.date, dateFrom));
  if (dateTo) conditions.push(lte(transactionsTable.date, dateTo));

  const txs = await db
    .select()
    .from(transactionsTable)
    .where(and(...conditions))
    .orderBy(transactionsTable.date);

  const accounts = await db
    .select({ id: accountsTable.id, name: accountsTable.name })
    .from(accountsTable)
    .where(eq(accountsTable.userId, userId));
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

  const enriched = await Promise.all(txs.map((tx) => enrichTransaction(tx, accountMap, userId)));
  res.json(ListTransactionsResponse.parse(enriched));
});

router.post("/transactions", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Snapshot the FX rate at write time so the transaction's base
  // equivalent doesn't drift when the exchange rate moves later.
  // FX-unavailable on the write path stores null and lets the
  // backfill / read-path fallback handle it — refusing the write
  // when an FX API is down would fail the app at its one job.
  const baseCurrency = await getBaseCurrency(userId);
  const { toAccountId, toNativeAmount, toCurrency, ...coreData } = parsed.data;

  // Two-leg transfer: write debit and credit atomically, adjust both balances.
  if (coreData.type === "transfer" && toAccountId != null) {
    const outAmount = coreData.nativeAmount;
    const inAmount = toNativeAmount ?? outAmount;
    const inCurrency = toCurrency ?? coreData.currency;
    const transferGroupId = crypto.randomUUID();

    const { rate: outRate, asOf: outAsOf } = await snapshotFxRate(coreData.currency, baseCurrency);
    const { rate: inRate, asOf: inAsOf } = await snapshotFxRate(inCurrency, baseCurrency);

    const [debitLeg] = await db.transaction(async (dbTx) => {
      const rows = await dbTx
        .insert(transactionsTable)
        .values([
          {
            ...coreData,
            nativeAmount: String(outAmount),
            userId,
            nativeToBaseRate: outRate == null ? null : String(outRate),
            rateAsOf: outAsOf,
            transferGroupId,
            transferDirection: "out",
          },
          {
            ...coreData,
            accountId: toAccountId,
            nativeAmount: String(inAmount),
            currency: inCurrency,
            userId,
            nativeToBaseRate: inRate == null ? null : String(inRate),
            rateAsOf: inAsOf,
            transferGroupId,
            transferDirection: "in",
          },
        ])
        .returning();
      await adjustAccountBalance(coreData.accountId, outAmount, coreData.currency, "transfer", false, dbTx, "out");
      await adjustAccountBalance(toAccountId, inAmount, inCurrency, "transfer", false, dbTx, "in");
      return rows;
    });

    const accounts = await db
      .select({ id: accountsTable.id, name: accountsTable.name })
      .from(accountsTable)
      .where(eq(accountsTable.userId, userId));
    const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
    const enriched = await enrichTransaction(debitLeg, accountMap, userId);
    res.status(201).json(UpdateTransactionResponse.parse(enriched));
    return;
  }

  // Single-leg write (income, expense, or legacy one-sided transfer).
  const { rate, asOf } = await snapshotFxRate(coreData.currency, baseCurrency);
  const [tx] = await db.transaction(async (dbTx) => {
    const rows = await dbTx
      .insert(transactionsTable)
      .values({
        ...coreData,
        nativeAmount: String(coreData.nativeAmount),
        userId,
        nativeToBaseRate: rate == null ? null : String(rate),
        rateAsOf: asOf,
      })
      .returning();
    await adjustAccountBalance(coreData.accountId, coreData.nativeAmount, coreData.currency, coreData.type, false, dbTx);
    return rows;
  });

  const accounts = await db
    .select({ id: accountsTable.id, name: accountsTable.name })
    .from(accountsTable)
    .where(eq(accountsTable.userId, userId));
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const enriched = await enrichTransaction(tx, accountMap, userId);
  res.status(201).json(UpdateTransactionResponse.parse(enriched));
});

router.get("/transactions/summary", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
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
    .where(and(eq(transactionsTable.userId, userId), gte(transactionsTable.date, dateFrom), lte(transactionsTable.date, dateTo)));

  const baseCurrency = await getBaseCurrency(userId);
  let totalIncome = 0;
  let totalExpenses = 0;
  for (const tx of txs) {
    // txToBase uses the row's stored rate when present. The whole
    // point of stored rates is that this loop, run again next week,
    // returns the same total unless the transactions themselves
    // changed. Legacy null-rate rows still fall through to live
    // toBase() and their contribution can drift until the backfill
    // catches them.
    const base = await txToBase(tx, baseCurrency);
    if (base == null) continue;
    if (tx.type === "income") totalIncome += base;
    else if (tx.type === "expense") totalExpenses += base;
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
  const userId = (req as any).userId as string;
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

  // Rate is per-native-unit and depends only on currency. Amount
  // edits leave the stored rate alone; a currency edit invalidates
  // it (the old rate is for the wrong pair). Re-snapshot on
  // currency change so the row stays honest without touching the
  // original write's asOf semantics for the common amount-fix case.
  if (parsed.data.currency !== undefined) {
    const baseCurrency = await getBaseCurrency(userId);
    const { rate, asOf } = await snapshotFxRate(parsed.data.currency, baseCurrency);
    updateData.nativeToBaseRate = rate == null ? null : String(rate);
    updateData.rateAsOf = asOf;
  }

  const [tx] = await db
    .update(transactionsTable)
    .set(updateData)
    .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.userId, userId)))
    .returning();
  if (!tx) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  const accounts = await db
    .select({ id: accountsTable.id, name: accountsTable.name })
    .from(accountsTable)
    .where(eq(accountsTable.userId, userId));
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const enriched = await enrichTransaction(tx, accountMap, userId);
  res.json(UpdateTransactionResponse.parse(enriched));
});

router.delete("/transactions/:id", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const params = DeleteTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const txRow = await db.transaction(async (dbTx) => {
    const [row] = await dbTx
      .delete(transactionsTable)
      .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.userId, userId)))
      .returning();
    if (!row) return null;
    await adjustAccountBalance(
      row.accountId,
      parseFloat(row.nativeAmount),
      row.currency,
      row.type,
      true,
      dbTx,
      row.transferDirection ?? undefined,
    );
    // If this was a linked transfer leg, also delete the paired leg so
    // we don't leave an orphan that would under-count or over-count the balance.
    if (row.transferGroupId) {
      const [paired] = await dbTx
        .delete(transactionsTable)
        .where(and(
          eq(transactionsTable.transferGroupId, row.transferGroupId),
          eq(transactionsTable.userId, userId),
        ))
        .returning();
      if (paired) {
        await adjustAccountBalance(
          paired.accountId,
          parseFloat(paired.nativeAmount),
          paired.currency,
          paired.type,
          true,
          dbTx,
          paired.transferDirection ?? undefined,
        );
      }
    }
    return row;
  });
  if (!txRow) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
