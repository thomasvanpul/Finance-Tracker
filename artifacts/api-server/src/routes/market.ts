import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, investmentsTable, accountsTable } from "@workspace/db";
import { getFxRates, getStockPrices, getStockQuotes, getStockHistory, getStockDetail, getOptionsChain, getStockNews, getFilteredNewsForUser } from "../lib/market";
import {
  GetFxRatesResponse,
  GetMarketPricesQueryParams,
  GetMarketPricesResponse,
  GetMarketQuotesQueryParams,
  GetMarketQuotesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/market/fx-rates", async (req, res): Promise<void> => {
  const rates = await getFxRates();
  res.json(GetFxRatesResponse.parse(rates));
});

router.get("/market/prices", async (req, res): Promise<void> => {
  const query = GetMarketPricesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const tickers = query.data.tickers.split(",").map((t) => t.trim()).filter(Boolean);
  if (tickers.length === 0) { res.json([]); return; }
  const prices = await getStockPrices(tickers);
  res.json(GetMarketPricesResponse.parse(prices));
});

router.get("/market/quotes", async (req, res): Promise<void> => {
  const query = GetMarketQuotesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const tickers = query.data.tickers.split(",").map((t) => t.trim()).filter(Boolean);
  if (tickers.length === 0) { res.json([]); return; }
  const quotes = await getStockQuotes(tickers);
  res.json(GetMarketQuotesResponse.parse(quotes));
});

router.get("/market/history", async (req, res): Promise<void> => {
  const ticker = typeof req.query.ticker === "string" ? req.query.ticker.trim().toUpperCase() : "";
  const period = typeof req.query.period === "string" ? req.query.period.trim() : "1y";
  if (!ticker) { res.status(400).json({ error: "ticker required" }); return; }
  const data = await getStockHistory(ticker, period);
  res.json(data);
});

router.get("/market/detail", async (req, res): Promise<void> => {
  const ticker = typeof req.query.ticker === "string" ? req.query.ticker.trim().toUpperCase() : "";
  if (!ticker) { res.status(400).json({ error: "ticker required" }); return; }
  const data = await getStockDetail(ticker);
  res.json(data);
});

router.get("/market/options", async (req, res): Promise<void> => {
  const ticker = typeof req.query.ticker === "string" ? req.query.ticker.trim().toUpperCase() : "";
  const expiry = typeof req.query.expiry === "string" ? req.query.expiry.trim() : undefined;
  if (!ticker) { res.status(400).json({ error: "ticker required" }); return; }
  const data = await getOptionsChain(ticker, expiry);
  res.json(data);
});

router.get("/market/news", async (req, res): Promise<void> => {
  const ticker = typeof req.query.ticker === "string" ? req.query.ticker.trim().toUpperCase() : "";
  if (!ticker) { res.status(400).json({ error: "ticker required" }); return; }
  const data = await getStockNews(ticker);
  res.json(data);
});

// F3 · aggregated news across the current user's holdings. Ticker
// news is pulled per-ticker (inherent anchor); currency news is
// deferred until a generic-feed source is wired. If the user
// holds neither, returns [] — the pane must not render.
router.get("/market/news/for-user", async (req, res): Promise<void> => {
  const userId = (req as unknown as { userId: string }).userId;
  const investments = await db
    .select({ ticker: investmentsTable.ticker })
    .from(investmentsTable)
    .where(eq(investmentsTable.userId, userId));
  const accounts = await db
    .select({ currency: accountsTable.currency })
    .from(accountsTable)
    .where(eq(accountsTable.userId, userId));

  const tickers = [...new Set(investments.map((i) => i.ticker.toUpperCase()))];
  const currencies = [...new Set(accounts.map((a) => a.currency.toUpperCase()))];
  const items = await getFilteredNewsForUser({ tickers, currencies });
  res.json({
    tickers,
    currencies,
    items,
  });
  // Silence unused: the `and` import is reserved for a future
  // filter (date range) that would pair with an eq predicate.
  void and;
});

export default router;
