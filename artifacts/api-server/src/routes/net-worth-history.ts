import { Router, type IRouter } from "express";
import { GetNetWorthHistoryResponse } from "@workspace/api-zod";
import { getBaseCurrency } from "../lib/app-settings-db";
import { readNetWorthHistory } from "../lib/net-worth-snapshots";

const router: IRouter = Router();

const DEFAULT_DAYS = 365;
const MAX_DAYS = 3650;

// Daily net worth as the dashboard captured it (net_worth_snapshots). The
// series starts on the first captured day and has a gap on any day with no
// dashboard read: nothing is backfilled or interpolated, and a client draws
// gaps as gaps. Days captured in a previous base currency are counted, not
// converted.
router.get("/net-worth/history", async (req, res): Promise<void> => {
  const userId = (req as unknown as { userId: string }).userId;
  const raw = req.query.days;
  let days = DEFAULT_DAYS;
  if (raw !== undefined) {
    const n = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > MAX_DAYS) {
      res.status(400).json({ error: `days must be a whole number from 1 to ${MAX_DAYS}` });
      return;
    }
    days = n;
  }
  const baseCurrency = await getBaseCurrency(userId);
  res.json(GetNetWorthHistoryResponse.parse(await readNetWorthHistory(userId, baseCurrency, days)));
});

export default router;
