import { Router, type IRouter } from "express";
import { changePassword, get2faStatus, setup2fa, confirm2fa, disable2fa } from "../lib/auth";
import { getBaseCurrency, setBaseCurrency } from "../lib/app-settings-db";

const SUPPORTED_CURRENCIES = ["GBP", "USD", "EUR", "MYR", "CNY", "JPY", "AUD", "CAD", "SGD", "HKD", "THB", "INR"] as const;

const router: IRouter = Router();

router.post("/settings/password", changePassword);
router.get("/settings/2fa/status", get2faStatus);
router.post("/settings/2fa/setup", setup2fa);
router.post("/settings/2fa/confirm", confirm2fa);
router.post("/settings/2fa/disable", disable2fa);

router.get("/settings/currency", async (_req, res): Promise<void> => {
  const baseCurrency = await getBaseCurrency();
  res.json({ baseCurrency });
});

router.put("/settings/currency", async (req, res): Promise<void> => {
  const { baseCurrency } = req.body as { baseCurrency?: string };
  if (!baseCurrency || !SUPPORTED_CURRENCIES.includes(baseCurrency as (typeof SUPPORTED_CURRENCIES)[number])) {
    res.status(400).json({ error: `baseCurrency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}` });
    return;
  }
  await setBaseCurrency(baseCurrency);
  res.sendStatus(200);
});

export default router;
