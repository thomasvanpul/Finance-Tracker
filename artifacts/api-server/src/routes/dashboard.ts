import { Router, type IRouter } from "express";
import { and, gte, lte } from "drizzle-orm";
import { db, accountsTable, transactionsTable, investmentsTable, upcomingTable } from "@workspace/db";
import { GetDashboardResponse } from "@workspace/api-zod";
import { toGbp, getStockPrices } from "../lib/market";

const router: IRouter = Router();

router.get("/dashboard", async (req, res): Promise<void> => {
  // Accounts
  const accounts = await db.select().from(accountsTable);
  const accountBreakdown = await Promise.all(
    accounts.map(async (a) => {
      const balance = parseFloat(a.balance);
      const gbpEquivalent = await toGbp(balance, a.currency);
      return { id: a.id, name: a.name, currency: a.currency, balance, gbpEquivalent: Math.round(gbpEquivalent * 100) / 100 };
    })
  );
  const totalCash = accountBreakdown.reduce((s, a) => s + a.gbpEquivalent, 0);

  // Investments
  const investments = await db.select().from(investmentsTable);
  let portfolioValueGbp = 0;
  let portfolioCostGbp = 0;
  if (investments.length > 0) {
    const tickers = [...new Set(investments.map((i) => i.ticker))];
    const prices = await getStockPrices(tickers);
    const priceMap = new Map(prices.map((p) => [p.ticker, p]));

    for (const inv of investments) {
      const shares = parseFloat(inv.shares);
      const costPrice = parseFloat(inv.costPricePerShare);
      const priceData = priceMap.get(inv.ticker);
      const livePrice = priceData?.price ?? 0;
      const currency = priceData?.currency ?? "USD";
      const currentValue = shares * livePrice;
      const costBasis = shares * costPrice;
      portfolioValueGbp += await toGbp(currentValue, currency);
      portfolioCostGbp += await toGbp(costBasis, currency);
    }
  }
  const portfolioPlGbp = portfolioValueGbp - portfolioCostGbp;
  const portfolioPlPercent = portfolioCostGbp > 0 ? (portfolioPlGbp / portfolioCostGbp) * 100 : 0;

  // This month's transactions
  const now = new Date();
  const monthStr = now.toISOString().slice(0, 7);
  const dateFrom = `${monthStr}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dateTo = `${monthStr}-${String(lastDay).padStart(2, "0")}`;

  const txs = await db
    .select()
    .from(transactionsTable)
    .where(and(gte(transactionsTable.date, dateFrom), lte(transactionsTable.date, dateTo)));

  let monthIncome = 0;
  let monthExpenses = 0;
  for (const tx of txs) {
    const native = Math.abs(parseFloat(tx.nativeAmount));
    const gbp = await toGbp(native, tx.currency);
    if (tx.type === "income") monthIncome += gbp;
    else if (tx.type === "expense") monthExpenses += gbp;
  }
  const monthNet = monthIncome - monthExpenses;
  const savingsRate = monthIncome > 0 ? (monthNet / monthIncome) * 100 : 0;

  // Upcoming 30d for net liquidity
  const todayStr = now.toISOString().slice(0, 10);
  const in30 = new Date(now);
  in30.setDate(now.getDate() + 30);
  const in30Str = in30.toISOString().slice(0, 10);

  const upcoming = await db
    .select()
    .from(upcomingTable)
    .where(and(gte(upcomingTable.dueDate, todayStr), lte(upcomingTable.dueDate, in30Str)));

  let committedOut = 0;
  let expectedIn = 0;
  for (const item of upcoming) {
    if (item.status !== "pending") continue;
    const gbp = await toGbp(parseFloat(item.nativeAmount), item.currency);
    if (item.type === "expense") committedOut += gbp;
    else if (item.type === "income") expectedIn += gbp;
  }

  const netLiquidity = totalCash - committedOut + expectedIn;
  const netWorth = totalCash + portfolioValueGbp;

  res.json(
    GetDashboardResponse.parse({
      netLiquidity: Math.round(netLiquidity * 100) / 100,
      netWorth: Math.round(netWorth * 100) / 100,
      totalCash: Math.round(totalCash * 100) / 100,
      accountBreakdown,
      portfolio: {
        totalValueGbp: Math.round(portfolioValueGbp * 100) / 100,
        totalPlGbp: Math.round(portfolioPlGbp * 100) / 100,
        totalPlPercent: Math.round(portfolioPlPercent * 100) / 100,
      },
      thisMonth: {
        income: Math.round(monthIncome * 100) / 100,
        expenses: Math.round(monthExpenses * 100) / 100,
        netSavings: Math.round(monthNet * 100) / 100,
        savingsRate: Math.round(savingsRate * 100) / 100,
      },
    })
  );
});

export default router;
