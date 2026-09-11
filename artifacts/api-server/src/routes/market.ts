import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, investmentsTable, accountsTable } from "@workspace/db";
import { getFxRates, readStockPrices, readStockQuotes, getStockHistory, getStockDetail, getOptionsChain, getStockNews, getFilteredNewsForUser } from "../lib/market";
import { IndexLevelRefusedError, indexRefusalBody } from "../lib/market-classifier";
import {
  GetFxRatesResponse,
  GetMarketPricesQueryParams,
  GetMarketPricesResponse,
  GetMarketQuotesQueryParams,
  GetMarketQuotesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Index symbols are answered 451 Unavailable For Legal Reasons: the index
// owner licenses the level and this app does not show it
// (lib/market-classifier.ts). The body's `error` is written to be shown as it
// stands. A request mixing indices with securities gets the securities' rows,
// the same way an orphaned ticker is simply absent; 451 is for a request that
// asked for nothing but indices.
function everyTickerRefused(tickers: string[], refused: string[]): boolean {
  return refused.length > 0 && refused.length === new Set(tickers).size;
}

function refusalOf(err: unknown): IndexLevelRefusedError | null {
  return err instanceof IndexLevelRefusedError ? err : null;
}

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
  const { rows, refused } = await readStockPrices(tickers);
  if (everyTickerRefused(tickers, refused)) { res.status(451).json(indexRefusalBody(refused)); return; }
  res.json(GetMarketPricesResponse.parse(rows));
});

router.get("/market/quotes", async (req, res): Promise<void> => {
  const query = GetMarketQuotesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const tickers = query.data.tickers.split(",").map((t) => t.trim()).filter(Boolean);
  if (tickers.length === 0) { res.json([]); return; }
  const { rows, refused } = await readStockQuotes(tickers);
  if (everyTickerRefused(tickers, refused)) { res.status(451).json(indexRefusalBody(refused)); return; }
  res.json(GetMarketQuotesResponse.parse(rows));
});

router.get("/market/history", async (req, res): Promise<void> => {
  const ticker = typeof req.query.ticker === "string" ? req.query.ticker.trim().toUpperCase() : "";
  const period = typeof req.query.period === "string" ? req.query.period.trim() : "1y";
  if (!ticker) { res.status(400).json({ error: "ticker required" }); return; }
  try {
    res.json(await getStockHistory(ticker, period));
  } catch (err) {
    const refusal = refusalOf(err);
    if (!refusal) throw err;
    res.status(451).json(indexRefusalBody([refusal.ticker]));
  }
});

router.get("/market/detail", async (req, res): Promise<void> => {
  const ticker = typeof req.query.ticker === "string" ? req.query.ticker.trim().toUpperCase() : "";
  if (!ticker) { res.status(400).json({ error: "ticker required" }); return; }
  try {
    res.json(await getStockDetail(ticker));
  } catch (err) {
    const refusal = refusalOf(err);
    if (!refusal) throw err;
    res.status(451).json(indexRefusalBody([refusal.ticker]));
  }
});

router.get("/market/options", async (req, res): Promise<void> => {
  const ticker = typeof req.query.ticker === "string" ? req.query.ticker.trim().toUpperCase() : "";
  const expiry = typeof req.query.expiry === "string" ? req.query.expiry.trim() : undefined;
  if (!ticker) { res.status(400).json({ error: "ticker required" }); return; }
  try {
    res.json(await getOptionsChain(ticker, expiry));
  } catch (err) {
    const refusal = refusalOf(err);
    if (!refusal) throw err;
    res.status(451).json(indexRefusalBody([refusal.ticker]));
  }
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
