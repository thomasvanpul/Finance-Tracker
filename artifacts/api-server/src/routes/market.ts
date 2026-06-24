import { Router, type IRouter } from "express";
import { getFxRates, getStockPrices } from "../lib/market";
import {
  GetFxRatesResponse,
  GetMarketPricesQueryParams,
  GetMarketPricesResponse,
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
  if (tickers.length === 0) {
    res.json([]);
    return;
  }
  const prices = await getStockPrices(tickers);
  res.json(GetMarketPricesResponse.parse(prices));
});

export default router;
