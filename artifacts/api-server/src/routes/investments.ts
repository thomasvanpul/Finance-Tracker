import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, investmentsTable } from "@workspace/db";
import {
  CreateInvestmentBody,
  UpdateInvestmentParams,
  UpdateInvestmentBody,
  DeleteInvestmentParams,
  ListInvestmentsResponse,
  UpdateInvestmentResponse,
  GetInvestmentSummaryResponse,
} from "@workspace/api-zod";
import { getStockPrices, toGbp } from "../lib/market";

const router: IRouter = Router();

async function enrichInvestment(inv: typeof investmentsTable.$inferSelect) {
  const shares = parseFloat(inv.shares);
  const costPrice = parseFloat(inv.costPricePerShare);

  const prices = await getStockPrices([inv.ticker]);
  const priceData = prices[0];
  const livePrice = priceData?.price ?? 0;
  const currency = priceData?.currency ?? "USD";

  const currentValue = shares * livePrice;
  const costBasis = shares * costPrice;
  const plNative = currentValue - costBasis;
  const plPercent = costBasis > 0 ? (plNative / costBasis) * 100 : 0;

  const gbpValue = await toGbp(currentValue, currency);
  const costGbp = await toGbp(costBasis, currency);
  const plGbp = gbpValue - costGbp;

  return {
    id: inv.id,
    ticker: inv.ticker,
    name: inv.name,
    buyDate: inv.buyDate,
    shares,
    costPricePerShare: costPrice,
    currency,
    livePrice,
    currentValue: Math.round(currentValue * 100) / 100,
    plGbp: Math.round(plGbp * 100) / 100,
    plPercent: Math.round(plPercent * 100) / 100,
    gbpValue: Math.round(gbpValue * 100) / 100,
    createdAt: inv.createdAt.toISOString(),
  };
}

router.get("/investments", async (req, res): Promise<void> => {
  const investments = await db.select().from(investmentsTable).orderBy(investmentsTable.createdAt);
  const enriched = await Promise.all(investments.map(enrichInvestment));
  res.json(ListInvestmentsResponse.parse(enriched));
});

router.get("/investments/summary", async (req, res): Promise<void> => {
  const investments = await db.select().from(investmentsTable);
  const enriched = await Promise.all(investments.map(enrichInvestment));

  const totalValueGbp = enriched.reduce((s, i) => s + i.gbpValue, 0);
  const totalPlGbp = enriched.reduce((s, i) => s + i.plGbp, 0);
  const totalCostGbp = enriched.reduce((s, i) => {
    const cost = i.shares * i.costPricePerShare;
    return s + cost; // approximate — already converted via enrichInvestment
  }, 0);
  const totalPlPercent = totalValueGbp - totalPlGbp > 0
    ? (totalPlGbp / (totalValueGbp - totalPlGbp)) * 100
    : 0;

  res.json(
    GetInvestmentSummaryResponse.parse({
      totalValueGbp: Math.round(totalValueGbp * 100) / 100,
      totalPlGbp: Math.round(totalPlGbp * 100) / 100,
      totalPlPercent: Math.round(totalPlPercent * 100) / 100,
      positions: enriched.length,
    })
  );
});

router.post("/investments", async (req, res): Promise<void> => {
  const parsed = CreateInvestmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [inv] = await db
    .insert(investmentsTable)
    .values({
      ...parsed.data,
      shares: String(parsed.data.shares),
      costPricePerShare: String(parsed.data.costPricePerShare),
    })
    .returning();
  const enriched = await enrichInvestment(inv);
  res.status(201).json(UpdateInvestmentResponse.parse(enriched));
});

router.patch("/investments/:id", async (req, res): Promise<void> => {
  const params = UpdateInvestmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateInvestmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.shares !== undefined) updateData.shares = String(parsed.data.shares);
  if (parsed.data.costPricePerShare !== undefined) updateData.costPricePerShare = String(parsed.data.costPricePerShare);

  const [inv] = await db
    .update(investmentsTable)
    .set(updateData)
    .where(eq(investmentsTable.id, params.data.id))
    .returning();
  if (!inv) {
    res.status(404).json({ error: "Investment not found" });
    return;
  }
  const enriched = await enrichInvestment(inv);
  res.json(UpdateInvestmentResponse.parse(enriched));
});

router.delete("/investments/:id", async (req, res): Promise<void> => {
  const params = DeleteInvestmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [inv] = await db
    .delete(investmentsTable)
    .where(eq(investmentsTable.id, params.data.id))
    .returning();
  if (!inv) {
    res.status(404).json({ error: "Investment not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
