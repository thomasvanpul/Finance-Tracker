import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
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
import { getStockPrices, getFxRates } from "../lib/market";
import { enrichInvestment } from "../lib/enrich-investment";

const router: IRouter = Router();

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
  const userId = (req as any).userId as string;
  const investments = await db
    .select()
    .from(investmentsTable)
    .where(eq(investmentsTable.userId, userId))
    .orderBy(investmentsTable.createdAt);
  const { priceMap, fx } = await fetchPriceContext(investments);
  const enriched = investments.map((inv) => enrichInvestment(inv, priceMap, fx));
  res.json(ListInvestmentsResponse.parse(enriched));
});

router.get("/investments/summary", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const investments = await db
    .select()
    .from(investmentsTable)
    .where(eq(investmentsTable.userId, userId));
  const { priceMap, fx } = await fetchPriceContext(investments);
  const enriched = investments.map((inv) => enrichInvestment(inv, priceMap, fx));
  // Totals sum only priceAvailable positions — the API contract this
  // endpoint promises. unavailablePositions surfaces the gap so the UI
  // can name it rather than quietly under-report.
  const priced = enriched.filter((e) => e.priceAvailable);
  const totalValueGbp = priced.reduce((s, i) => s + (i.gbpValue ?? 0), 0);
  const totalPlGbp = priced.reduce((s, i) => s + (i.plGbp ?? 0), 0);
  const totalCostGbp = totalValueGbp - totalPlGbp;
  const totalPlPercent = totalCostGbp > 0 ? (totalPlGbp / totalCostGbp) * 100 : 0;
  res.json(
    GetInvestmentSummaryResponse.parse({
      totalValueGbp: Math.round(totalValueGbp * 100) / 100,
      totalPlGbp: Math.round(totalPlGbp * 100) / 100,
      totalPlPercent: Math.round(totalPlPercent * 100) / 100,
      positions: enriched.length,
      unavailablePositions: enriched.length - priced.length,
    })
  );
});

router.post("/investments", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
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
      userId,
    })
    .returning();
  const { priceMap, fx } = await fetchPriceContext([inv]);
  res.status(201).json(UpdateInvestmentResponse.parse(enrichInvestment(inv, priceMap, fx)));
});

router.patch("/investments/:id", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
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
    .where(and(eq(investmentsTable.id, params.data.id), eq(investmentsTable.userId, userId)))
    .returning();
  if (!inv) {
    res.status(404).json({ error: "Investment not found" });
    return;
  }
  const { priceMap, fx } = await fetchPriceContext([inv]);
  res.json(UpdateInvestmentResponse.parse(enrichInvestment(inv, priceMap, fx)));
});

router.delete("/investments/:id", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const params = DeleteInvestmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [inv] = await db
    .delete(investmentsTable)
    .where(and(eq(investmentsTable.id, params.data.id), eq(investmentsTable.userId, userId)))
    .returning();
  if (!inv) {
    res.status(404).json({ error: "Investment not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
