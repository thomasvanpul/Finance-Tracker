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
import { getStockPrices, getFxRates, type StockPriceData, type FxRatesData } from "../lib/market";

const router: IRouter = Router();

function enrichInvestmentSync(
  inv: typeof investmentsTable.$inferSelect,
  priceMap: Map<string, StockPriceData>,
  fx: FxRatesData,
) {
  const shares = parseFloat(inv.shares);
  const costPrice = parseFloat(inv.costPricePerShare);

  const priceData = priceMap.get(inv.ticker);
  const livePrice = priceData?.price ?? 0;
  const currency = priceData?.currency ?? "USD";

  const currentValue = shares * livePrice;
  const costBasis = shares * costPrice;
  const plNative = currentValue - costBasis;
  const plPercent = costBasis > 0 ? (plNative / costBasis) * 100 : 0;

  const fxRate = currency === "GBP" ? 1 : (fx.rates[currency] ?? 1);
  const gbpValue = currentValue / fxRate;
  const costGbp = costBasis / fxRate;
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

async function fetchPriceContext(investments: (typeof investmentsTable.$inferSelect)[]) {
  const tickers = [...new Set(investments.map((i) => i.ticker))];
  const [prices, fx] = await Promise.all([
    tickers.length > 0 ? getStockPrices(tickers) : Promise.resolve([]),
    getFxRates(),
  ]);
  const priceMap = new Map(prices.map((p) => [p.ticker, p]));
  return { priceMap, fx };
}

router.get("/investments", async (req, res): Promise<void> => {
  const investments = await db.select().from(investmentsTable).orderBy(investmentsTable.createdAt);
  const { priceMap, fx } = await fetchPriceContext(investments);
  const enriched = investments.map((inv) => enrichInvestmentSync(inv, priceMap, fx));
  res.json(ListInvestmentsResponse.parse(enriched));
});

router.get("/investments/summary", async (req, res): Promise<void> => {
  const investments = await db.select().from(investmentsTable);
  const { priceMap, fx } = await fetchPriceContext(investments);
  const enriched = investments.map((inv) => enrichInvestmentSync(inv, priceMap, fx));

  const totalValueGbp = enriched.reduce((s, i) => s + i.gbpValue, 0);
  const totalPlGbp = enriched.reduce((s, i) => s + i.plGbp, 0);
  const totalCostGbp = totalValueGbp - totalPlGbp;
  const totalPlPercent = totalCostGbp > 0 ? (totalPlGbp / totalCostGbp) * 100 : 0;

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
  const { priceMap, fx } = await fetchPriceContext([inv]);
  res.status(201).json(UpdateInvestmentResponse.parse(enrichInvestmentSync(inv, priceMap, fx)));
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
  const { priceMap, fx } = await fetchPriceContext([inv]);
  res.json(UpdateInvestmentResponse.parse(enrichInvestmentSync(inv, priceMap, fx)));
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
