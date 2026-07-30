import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, accountsTable, transactionsTable } from "@workspace/db";
import { GetWiseStatusResponse, SyncWiseTransactionsResponse } from "@workspace/api-zod";
import { checkConnection, listProfiles, listBalances, getStatement } from "../lib/wise";
import { logger } from "../lib/logger";
import { toBase } from "../lib/market";
import { getBaseCurrency } from "../lib/app-settings-db";

const router: IRouter = Router();

router.get("/wise/status", async (req, res): Promise<void> => {
  const configured = Boolean(process.env.WISE_API_TOKEN);
  if (!configured) {
    res.json(GetWiseStatusResponse.parse({ configured: false, connected: false, profileName: null, error: null }));
    return;
  }
  const result = await checkConnection();
  if (result.connected) {
    res.json(GetWiseStatusResponse.parse({ configured: true, connected: true, profileName: result.profileName, error: null }));
  } else {
    res.json(GetWiseStatusResponse.parse({ configured: true, connected: false, profileName: null, error: result.error }));
  }
});

// Fetches all balances across the user's Wise profile(s), creates/updates matching
// accounts, then pulls the last 90 days of transactions for each balance.
router.post("/wise/sync", async (req, res): Promise<void> => {
  if (!process.env.WISE_API_TOKEN) {
    res.status(400).json({ error: "WISE_API_TOKEN is not configured on the server." });
    return;
  }

  try {
    const profiles = await listProfiles();
    const personalProfile = profiles.find((p) => p.type === "personal") ?? profiles[0];
    if (!personalProfile) {
      res.status(400).json({ error: "No Wise profile found for this token." });
      return;
    }

    const balances = await listBalances(personalProfile.id);

    let totalSynced = 0;
    let totalAdded = 0;
    let totalUpdated = 0;

    const intervalEnd = new Date();
    const intervalStart = new Date();
    intervalStart.setDate(intervalStart.getDate() - 90);

    for (const balance of balances) {
      const baseCurrency = await getBaseCurrency();
      const gbpEquivalent = await toBase(balance.amount.value, balance.amount.currency, baseCurrency);

      const [account] = await db
        .insert(accountsTable)
        .values({
          name: `Wise (${balance.currency})`,
          currency: balance.amount.currency,
          balance: String(balance.amount.value),
          isWiseLinked: true,
          wiseProfileId: String(personalProfile.id),
          wiseBalanceId: String(balance.id),
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: accountsTable.wiseBalanceId,
          set: {
            balance: String(balance.amount.value),
            lastSyncedAt: new Date(),
          },
        })
        .returning();

      const transactions = await getStatement(
        personalProfile.id,
        balance.id,
        balance.currency,
        intervalStart,
        intervalEnd
      );

      for (const tx of transactions) {
        const nativeAmount = tx.amount.value;
        const type = nativeAmount > 0 ? "income" : "expense";
        const description = tx.details.merchant?.name ?? tx.details.description ?? tx.details.type;

        const existing = await db
          .select()
          .from(transactionsTable)
          .where(eq(transactionsTable.externalId, tx.referenceNumber));

        if (existing.length > 0) {
          await db
            .update(transactionsTable)
            .set({ nativeAmount: String(Math.abs(nativeAmount)), type })
            .where(eq(transactionsTable.externalId, tx.referenceNumber));
          totalUpdated++;
        } else {
          await db.insert(transactionsTable).values({
            date: tx.date.slice(0, 10),
            description,
            type,
            category: "Other",
            accountId: account.id,
            nativeAmount: String(Math.abs(nativeAmount)),
            currency: tx.amount.currency,
            source: "wise",
            externalId: tx.referenceNumber,
          });
          totalAdded++;
        }
        totalSynced++;
      }
    }

    logger.info({ totalSynced, totalAdded, totalUpdated }, "Wise sync complete");
    res.json(SyncWiseTransactionsResponse.parse({ synced: totalSynced, added: totalAdded, updated: totalUpdated }));
  } catch (err: any) {
    logger.error({ err: err?.message }, "Wise sync failed");
    res.status(500).json({ error: err?.message ?? "Wise sync failed" });
  }
});

export default router;
