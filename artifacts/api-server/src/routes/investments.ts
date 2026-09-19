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
import { getFxRates } from "../lib/market";
import { getValuationPrices } from "../lib/market-eod";
import { enrichInvestment, summarizeInvestments } from "../lib/enrich-investment";
import { getBaseCurrency } from "../lib/app-settings-db";

const router: IRouter = Router();

// Prices for VALUING a position, not for displaying a market. Securities come
// from their last completed session close; crypto and forex stay live. Same
// helper the dashboard aggregate uses, so a row here and the total on the
// dashboard cannot be computed from different prices - which they were until
// 16 Sep 2026, when both were live but fetched at different moments.
async function fetchPriceContext(investments: (typeof investmentsTable.$inferSelect)[]) {
  const tickers = [...new Set(investments.map((i) => i.ticker))];
  const [valuation, fx] = await Promise.all([
    tickers.length > 0
      ? getValuationPrices(tickers)
      : Promise.resolve({ prices: new Map(), asOfSession: null, staleTickers: [] }),
    getFxRates(),
  ]);
  return { priceMap: valuation.prices, fx, asOfSession: valuation.asOfSession };
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
  const [{ priceMap, fx, asOfSession }, baseCurrency] = await Promise.all([
    fetchPriceContext(investments),
    getBaseCurrency(userId),
  ]);
  const enriched = investments.map((inv) => enrichInvestment(inv, priceMap, fx, baseCurrency));
  // summarizeInvestments folds live-priced positions at their market value
  // and unpriced positions at cost basis (enrichInvestment.costBasisValueBase)
  // — never silently dropped. unavailablePositions is now the genuinely
  // unaccounted case: neither a live price nor a convertible cost basis.
  // positionsAtCost says how many of the total are cost-valued, not live,
  // so the screen can label the figure as partial.
  const totals = summarizeInvestments(enriched);
  res.json(
    GetInvestmentSummaryResponse.parse({
      ...totals,
      // The oldest session in the total. Null when nothing here is
      // EOD-valued. The screen dates the figure by it.
      valuationAsOfSession: asOfSession,
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
