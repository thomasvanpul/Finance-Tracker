import { Router, type IRouter } from "express";
import { getFxRates, getStockPrices, getStockQuotes } from "../lib/market";
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

export default router;
