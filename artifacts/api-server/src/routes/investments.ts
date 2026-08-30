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
import { getBaseCurrency } from "../lib/app-settings-db";

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
  const [{ priceMap, fx }, baseCurrency] = await Promise.all([
    fetchPriceContext(investments),
    getBaseCurrency(userId),
  ]);
  const enriched = investments.map((inv) => enrichInvestment(inv, priceMap, fx, baseCurrency));
  res.json(ListInvestmentsResponse.parse(enriched));
});

router.get("/investments/summary", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const investments = await db
    .select()
    .from(investmentsTable)
    .where(eq(investmentsTable.userId, userId));
  const [{ priceMap, fx }, baseCurrency] = await Promise.all([
    fetchPriceContext(investments),
    getBaseCurrency(userId),
  ]);
  const enriched = investments.map((inv) => enrichInvestment(inv, priceMap, fx, baseCurrency));
  // Totals sum only priceAvailable positions AND positions whose base
  // FX pivot succeeded. unavailablePositions surfaces the missing-price
  // gap; a priced position with no base-FX leg would previously have
  // summed as 0 via `?? 0` — the same hidden fabrication the G10 fix
  // closed for missing prices. Now filtered explicitly.
  const priced = enriched.filter((e) => e.priceAvailable && e.gbpValue != null && e.plGbp != null);
  const totalValueGbp = priced.reduce((s, i) => s + (i.gbpValue as number), 0);
  const totalPlGbp = priced.reduce((s, i) => s + (i.plGbp as number), 0);
  const totalCostGbp = totalValueGbp - totalPlGbp;
  // No cost basis → no return to compute. Null, not 0. See dashboard.ts
  // portfolioPlPercent for the same rule and reason.
  const totalPlPercent: number | null = totalCostGbp > 0 ? (totalPlGbp / totalCostGbp) * 100 : null;
  res.json(
    GetInvestmentSummaryResponse.parse({
      totalValueGbp: Math.round(totalValueGbp * 100) / 100,
      totalPlGbp: Math.round(totalPlGbp * 100) / 100,
      totalPlPercent: totalPlPercent == null ? null : Math.round(totalPlPercent * 100) / 100,
      positions: enriched.length,
      unavailablePositions: enriched.length - enriched.filter((e) => e.priceAvailable).length,
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
  const [{ priceMap, fx }, baseCurrency] = await Promise.all([
    fetchPriceContext([inv]),
    getBaseCurrency(userId),
  ]);
  res.status(201).json(UpdateInvestmentResponse.parse(enrichInvestment(inv, priceMap, fx, baseCurrency)));
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
  const [{ priceMap, fx }, baseCurrency] = await Promise.all([
    fetchPriceContext([inv]),
    getBaseCurrency(userId),
  ]);
  res.json(UpdateInvestmentResponse.parse(enrichInvestment(inv, priceMap, fx, baseCurrency)));
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
