import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, accountsTable } from "@workspace/db";
import {
  CreateAccountBody,
  UpdateAccountParams,
  UpdateAccountBody,
  DeleteAccountParams,
  ListAccountsResponse,
  UpdateAccountResponse,
} from "@workspace/api-zod";
import { getFxRates, toBase } from "../lib/market";
import { getBaseCurrency } from "../lib/app-settings-db";

const router: IRouter = Router();

async function enrichAccount(account: typeof accountsTable.$inferSelect, userId: string) {
  const balance = parseFloat(account.balance);
  const baseCurrency = await getBaseCurrency(userId);
  const gbpEquivalent = await toBase(balance, account.currency, baseCurrency);
  return {
    id: account.id,
    name: account.name,
    currency: account.currency,
    balance,
    gbpEquivalent: Math.round(gbpEquivalent * 100) / 100,
    isWiseLinked: account.isWiseLinked,
    wiseProfileId: account.wiseProfileId ?? null,
    wiseBalanceId: account.wiseBalanceId ?? null,
    lastSyncedAt: account.lastSyncedAt ? account.lastSyncedAt.toISOString() : null,
    createdAt: account.createdAt.toISOString(),
  };
}

router.get("/accounts", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const accounts = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.userId, userId))
    .orderBy(accountsTable.createdAt);
  const enriched = await Promise.all(accounts.map((a) => enrichAccount(a, userId)));
  res.json(ListAccountsResponse.parse(enriched));
});

router.post("/accounts", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const parsed = CreateAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [account] = await db
    .insert(accountsTable)
    .values({ ...parsed.data, balance: String(parsed.data.balance), userId })
    .returning();
  const enriched = await enrichAccount(account, userId);
  res.status(201).json(UpdateAccountResponse.parse(enriched));
});

router.patch("/accounts/:id", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const params = UpdateAccountParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.balance !== undefined) updateData.balance = String(parsed.data.balance);

  const [account] = await db
    .update(accountsTable)
    .set(updateData)
    .where(and(eq(accountsTable.id, params.data.id), eq(accountsTable.userId, userId)))
    .returning();
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  const enriched = await enrichAccount(account, userId);
  res.json(UpdateAccountResponse.parse(enriched));
});

router.delete("/accounts/:id", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const params = DeleteAccountParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [account] = await db
    .delete(accountsTable)
    .where(and(eq(accountsTable.id, params.data.id), eq(accountsTable.userId, userId)))
    .returning();
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
