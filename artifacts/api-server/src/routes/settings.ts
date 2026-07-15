import { Router, type IRouter } from "express";
import { getBaseCurrency, setBaseCurrency } from "../lib/app-settings-db";

const SUPPORTED_CURRENCIES = ["GBP", "USD", "EUR", "MYR", "CNY", "JPY", "AUD", "CAD", "SGD", "HKD", "THB", "INR"] as const;

const router: IRouter = Router();

router.get("/settings/currency", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const baseCurrency = await getBaseCurrency(userId);
  res.json({ baseCurrency });
});

router.put("/settings/currency", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const { baseCurrency } = req.body as { baseCurrency?: string };
  if (!baseCurrency || !SUPPORTED_CURRENCIES.includes(baseCurrency as (typeof SUPPORTED_CURRENCIES)[number])) {
    res.status(400).json({ error: `baseCurrency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}` });
    return;
  }
  await setBaseCurrency(userId, baseCurrency);
  res.sendStatus(200);
});

export default router;
