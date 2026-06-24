import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, accountsTable, transactionsTable } from "@workspace/db";
import {
  CreatePlaidLinkTokenResponse,
  ExchangePlaidTokenBody,
  ExchangePlaidTokenResponse,
  SyncPlaidTransactionsResponse,
} from "@workspace/api-zod";
import { createLinkToken, exchangePublicToken, plaidClient } from "../lib/plaid";
import { logger } from "../lib/logger";
import { toGbp } from "../lib/market";
import { CountryCode, RemovedTransaction, Transaction } from "plaid";

const router: IRouter = Router();

router.post("/plaid/link-token", async (req, res): Promise<void> => {
  try {
    const linkToken = await createLinkToken();
    res.json(CreatePlaidLinkTokenResponse.parse({ linkToken }));
  } catch (err: any) {
    const plaidError = err?.response?.data;
    const message = plaidError?.error_message ?? plaidError?.error_code ?? "Failed to create link token";
    req.log.error({ err, plaidError }, "Failed to create Plaid link token");
    res.status(500).json({ error: message, details: plaidError ?? null });
  }
});

router.post("/plaid/exchange-token", async (req, res): Promise<void> => {
  const parsed = ExchangePlaidTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const accessToken = await exchangePublicToken(parsed.data.publicToken);

    const accountsResp = await plaidClient.accountsGet({ access_token: accessToken });
    const plaidAccounts = accountsResp.data.accounts;
    const itemId = accountsResp.data.item.item_id;

    const created = [];
    for (const pa of plaidAccounts) {
      const balance = pa.balances.current ?? 0;
      const currency = (pa.balances.iso_currency_code ?? "GBP").toUpperCase();
      const gbpEquivalent = await toGbp(balance, currency);

      const [account] = await db
        .insert(accountsTable)
        .values({
          name: `${parsed.data.institutionName} - ${pa.name}`,
          currency,
          balance: String(balance),
          isPlaidLinked: true,
          plaidAccountId: pa.account_id,
          plaidItemId: itemId,
          plaidAccessToken: accessToken,
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: accountsTable.plaidAccountId,
          set: {
            balance: String(balance),
            lastSyncedAt: new Date(),
          },
        })
        .returning();

      created.push({
        id: account.id,
        name: account.name,
        currency: account.currency,
        balance,
        gbpEquivalent: Math.round(gbpEquivalent * 100) / 100,
        isPlaidLinked: true,
        plaidAccountId: account.plaidAccountId ?? null,
        plaidItemId: account.plaidItemId ?? null,
        lastSyncedAt: account.lastSyncedAt ? account.lastSyncedAt.toISOString() : null,
        createdAt: account.createdAt.toISOString(),
      });
    }

    res.json(ExchangePlaidTokenResponse.parse(created));
  } catch (err: any) {
    const plaidError = err?.response?.data;
    req.log.error({ err, plaidError }, "Failed to exchange Plaid token");
    res.status(500).json({ error: "Failed to link bank account", details: plaidError ?? null });
  }
});

// List all Plaid-linked accounts (for display / debugging)
router.get("/plaid/accounts", async (req, res): Promise<void> => {
  try {
    const linked = await db
      .select({
        id: accountsTable.id,
        name: accountsTable.name,
        currency: accountsTable.currency,
        balance: accountsTable.balance,
        plaidAccountId: accountsTable.plaidAccountId,
        plaidItemId: accountsTable.plaidItemId,
        lastSyncedAt: accountsTable.lastSyncedAt,
      })
      .from(accountsTable)
      .where(eq(accountsTable.isPlaidLinked, true));

    res.json(linked.map((a) => ({
      ...a,
      balance: parseFloat(String(a.balance)),
      lastSyncedAt: a.lastSyncedAt ? a.lastSyncedAt.toISOString() : null,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list Plaid accounts");
    res.status(500).json({ error: "Failed to list Plaid accounts" });
  }
});

router.post("/plaid/sync", async (req, res): Promise<void> => {
  try {
    const plaidAccounts = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.isPlaidLinked, true));

    if (plaidAccounts.length === 0) {
      res.json(SyncPlaidTransactionsResponse.parse({ synced: 0, added: 0, updated: 0 }));
      return;
    }

    const accessTokens = new Map<string, typeof accountsTable.$inferSelect[]>();
    for (const acc of plaidAccounts) {
      if (!acc.plaidAccessToken) continue;
      const existing = accessTokens.get(acc.plaidAccessToken) ?? [];
      existing.push(acc);
      accessTokens.set(acc.plaidAccessToken, existing);
    }

    let totalSynced = 0;
    let totalAdded = 0;
    let totalUpdated = 0;

    for (const [accessToken, accounts] of accessTokens) {
      let cursor: string | undefined;
      let added: Transaction[] = [];
      let removed: RemovedTransaction[] = [];
      let hasMore = true;

      while (hasMore) {
        const resp = await plaidClient.transactionsSync({
          access_token: accessToken,
          cursor,
        });
        added = added.concat(resp.data.added);
        removed = removed.concat(resp.data.removed);
        hasMore = resp.data.has_more;
        cursor = resp.data.next_cursor;
      }

      const plaidAccountMap = new Map(accounts.map((a) => [a.plaidAccountId, a]));

      for (const tx of added) {
        const account = plaidAccountMap.get(tx.account_id);
        if (!account) continue;

        const currency = (tx.iso_currency_code ?? account.currency).toUpperCase();
        const nativeAmount = tx.amount;
        const type = nativeAmount > 0 ? "expense" : "income";
        const category = tx.personal_finance_category?.primary ?? tx.category?.[0] ?? "Other";

        const existing = await db
          .select()
          .from(transactionsTable)
          .where(eq(transactionsTable.plaidTransactionId, tx.transaction_id));

        if (existing.length > 0) {
          await db
            .update(transactionsTable)
            .set({ nativeAmount: String(Math.abs(nativeAmount)), type, category })
            .where(eq(transactionsTable.plaidTransactionId, tx.transaction_id));
          totalUpdated++;
        } else {
          await db.insert(transactionsTable).values({
            date: tx.date,
            description: tx.merchant_name ?? tx.name,
            type,
            category,
            accountId: account.id,
            nativeAmount: String(Math.abs(nativeAmount)),
            currency,
            source: "plaid",
            plaidTransactionId: tx.transaction_id,
          });
          totalAdded++;
        }
        totalSynced++;
      }

      // Update balances
      const balancesResp = await plaidClient.accountsGet({ access_token: accessToken });
      for (const pa of balancesResp.data.accounts) {
        const account = plaidAccountMap.get(pa.account_id);
        if (!account) continue;
        await db
          .update(accountsTable)
          .set({ balance: String(pa.balances.current ?? 0), lastSyncedAt: new Date() })
          .where(eq(accountsTable.id, account.id));
      }
    }

    logger.info({ totalSynced, totalAdded, totalUpdated }, "Plaid sync complete");
    res.json(SyncPlaidTransactionsResponse.parse({ synced: totalSynced, added: totalAdded, updated: totalUpdated }));
  } catch (err: any) {
    const plaidError = err?.response?.data;
    req.log.error({ err, plaidError }, "Plaid sync failed");
    res.status(500).json({ error: "Sync failed", details: plaidError ?? null });
  }
});

export default router;
