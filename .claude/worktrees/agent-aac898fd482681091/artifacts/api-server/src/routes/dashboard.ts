import { Router, type IRouter } from "express";
import { and, eq, gte, lte } from "drizzle-orm";
import { db, accountsTable, transactionsTable, investmentsTable, upcomingTable, debtsTable } from "@workspace/db";
import { GetDashboardResponse } from "@workspace/api-zod";
import { toBase, getStockPrices } from "../lib/market";
import { getBaseCurrency } from "../lib/app-settings-db";

const router: IRouter = Router();

router.get("/dashboard", async (req, res): Promise<void> => {
  const baseCurrency = await getBaseCurrency();

  // Accounts
  const accounts = await db.select().from(accountsTable);
  const accountBreakdown = await Promise.all(
    accounts.map(async (a) => {
      const balance = parseFloat(a.balance);
      const gbpEquivalent = await toBase(balance, a.currency, baseCurrency);
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
      portfolioValueGbp += await toBase(currentValue, currency, baseCurrency);
      portfolioCostGbp += await toBase(costBasis, currency, baseCurrency);
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
    const gbp = await toBase(native, tx.currency, baseCurrency);
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
    const gbp = await toBase(parseFloat(item.nativeAmount), item.currency, baseCurrency);
    if (item.type === "expense") committedOut += gbp;
    else if (item.type === "income") expectedIn += gbp;
  }

  const netLiquidity = totalCash - committedOut + expectedIn;
  const netWorth = totalCash + portfolioValueGbp;

  // Monthly history — last 6 months
  const monthlyHistory: { month: string; income: number; expenses: number; netSavings: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = d.toISOString().slice(0, 7);
    const mFrom = `${m}-01`;
    const mLastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const mTo = `${m}-${String(mLastDay).padStart(2, "0")}`;
    const mTxs = await db.select().from(transactionsTable)
      .where(and(gte(transactionsTable.date, mFrom), lte(transactionsTable.date, mTo)));
    let mInc = 0, mExp = 0;
    for (const tx of mTxs) {
      const native = Math.abs(parseFloat(tx.nativeAmount));
      const gbp = await toBase(native, tx.currency, baseCurrency);
      if (tx.type === "income") mInc += gbp;
      else if (tx.type === "expense") mExp += gbp;
    }
    monthlyHistory.push({ month: m, income: Math.round(mInc * 100) / 100, expenses: Math.round(mExp * 100) / 100, netSavings: Math.round((mInc - mExp) * 100) / 100 });
  }

  // Owing — pending debts only
  const pendingDebts = await db.select().from(debtsTable).where(eq(debtsTable.status, "pending"));
  let totalOwedToMe = 0;
  let totalIOwe = 0;
  for (const d of pendingDebts) {
    const gbp = await toBase(parseFloat(d.nativeAmount), d.currency, baseCurrency);
    if (d.direction === "they_owe_me") totalOwedToMe += gbp;
    else totalIOwe += gbp;
  }

  res.json(
    GetDashboardResponse.parse({
      baseCurrency,
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
      owing: {
        totalOwedToMe: Math.round(totalOwedToMe * 100) / 100,
        totalIOwe: Math.round(totalIOwe * 100) / 100,
        netGbp: Math.round((totalOwedToMe - totalIOwe) * 100) / 100,
        pendingCount: pendingDebts.length,
      },
      monthlyHistory,
    })
  );
});

export default router;
