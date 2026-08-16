import { Router, type IRouter } from "express";
import { and, eq, gte, lte } from "drizzle-orm";
import { db, accountsTable, transactionsTable, investmentsTable, upcomingTable, debtsTable } from "@workspace/db";
import { GetDashboardResponse } from "@workspace/api-zod";
import { toBase, getStockPrices } from "../lib/market";
import { getBaseCurrency } from "../lib/app-settings-db";
import { monthRange, trailingMonthRanges, localDateString } from "../lib/date-ranges";

const router: IRouter = Router();

router.get("/dashboard", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const baseCurrency = await getBaseCurrency(userId);

  // Accounts. gbpEquivalent is nullable now — toBase returns null when
  // the FX rate is unavailable. Aggregations skip nulls; we surface the
  // gap through unconvertibleCount so the UI can name it rather than
  // quietly under-report the total.
  const accounts = await db.select().from(accountsTable).where(eq(accountsTable.userId, userId));
  // The internal null-return from toBase is honest; the API surface
  // still declares gbpEquivalent as `number`, so we coerce null → 0 at
  // the boundary and surface the gap via unconvertibleAccounts. Follow-
  // up commit will mark gbpEquivalent nullable in OpenAPI and update the
  // ~40 frontend consumers to render "—" instead of the 0 they show now.
  let unconvertibleAccounts = 0;
  const accountBreakdown = await Promise.all(
    accounts.map(async (a) => {
      const balance = parseFloat(a.balance);
      const gbpEquivalent = await toBase(balance, a.currency, baseCurrency);
      if (gbpEquivalent == null) unconvertibleAccounts += 1;
      return {
        id: a.id,
        name: a.name,
        currency: a.currency,
        balance,
        gbpEquivalent: gbpEquivalent == null ? 0 : Math.round(gbpEquivalent * 100) / 100,
        type: a.type,
      };
    })
  );
  // Sum only the accounts that actually converted. The zero above is a
  // response-shape coercion, not a real balance, so we recompute the
  // total from the original toBase results by re-checking convertibility
  // via the currency map. Simpler to redo the toBase pass — cache hits
  // make this cheap on the second lap.
  const convertibleTotalPairs = await Promise.all(
    accounts.map(async (a) => await toBase(parseFloat(a.balance), a.currency, baseCurrency)),
  );
  const totalCash = convertibleTotalPairs.reduce<number>((s, v) => s + (v ?? 0), 0);

  // Investments — priced positions only (G10). Positions whose live price
  // the market API cannot supply are excluded from the portfolio total
  // rather than substituting zero (which read as −100% loss). Same for
  // positions whose FX-to-base leg is unavailable.
  const investments = await db.select().from(investmentsTable).where(eq(investmentsTable.userId, userId));
  let portfolioValueGbp = 0;
  let portfolioCostGbp = 0;
  if (investments.length > 0) {
    const tickers = [...new Set(investments.map((i) => i.ticker))];
    const prices = await getStockPrices(tickers);
    const priceMap = new Map(prices.map((p) => [p.ticker, p]));

    for (const inv of investments) {
      const priceData = priceMap.get(inv.ticker);
      if (!priceData || typeof priceData.price !== "number" || !Number.isFinite(priceData.price)) continue;
      const shares = parseFloat(inv.shares);
      const costPrice = parseFloat(inv.costPricePerShare);
      const currency = priceData.currency ?? "USD";
      const currentValue = shares * priceData.price;
      const costBasis = shares * costPrice;
      const valueGbp = await toBase(currentValue, currency, baseCurrency);
      const costGbp = await toBase(costBasis, currency, baseCurrency);
      if (valueGbp == null || costGbp == null) continue;
      portfolioValueGbp += valueGbp;
      portfolioCostGbp += costGbp;
    }
  }
  const portfolioPlGbp = portfolioValueGbp - portfolioCostGbp;
  const portfolioPlPercent = portfolioCostGbp > 0 ? (portfolioPlGbp / portfolioCostGbp) * 100 : 0;

  // This month's transactions. Transactions whose FX leg is unavailable
  // are dropped from the month totals — a fabricated conversion would
  // pull the savings-rate figure onto a lie.
  const now = new Date();
  const thisMonth = monthRange(now);

  const txs = await db
    .select()
    .from(transactionsTable)
    .where(and(eq(transactionsTable.userId, userId), gte(transactionsTable.date, thisMonth.from), lte(transactionsTable.date, thisMonth.to)));

  let monthIncome = 0;
  let monthExpenses = 0;
  for (const tx of txs) {
    const native = Math.abs(parseFloat(tx.nativeAmount));
    const gbp = await toBase(native, tx.currency, baseCurrency);
    if (gbp == null) continue;
    if (tx.type === "income") monthIncome += gbp;
    else if (tx.type === "expense") monthExpenses += gbp;
  }
  const monthNet = monthIncome - monthExpenses;
  const savingsRate = monthIncome > 0 ? (monthNet / monthIncome) * 100 : 0;

  // Upcoming 30d for net liquidity
  const todayStr = localDateString(now);
  const in30 = new Date(now);
  in30.setDate(now.getDate() + 30);
  const in30Str = localDateString(in30);

  const upcoming = await db
    .select()
    .from(upcomingTable)
    .where(and(eq(upcomingTable.userId, userId), gte(upcomingTable.dueDate, todayStr), lte(upcomingTable.dueDate, in30Str)));

  let committedOut = 0;
  let expectedIn = 0;
  for (const item of upcoming) {
    if (item.status !== "pending") continue;
    const gbp = await toBase(parseFloat(item.nativeAmount), item.currency, baseCurrency);
    if (gbp == null) continue;
    if (item.type === "expense") committedOut += gbp;
    else if (item.type === "income") expectedIn += gbp;
  }

  const netLiquidity = totalCash - committedOut + expectedIn;
  const netWorth = totalCash + portfolioValueGbp;

  // Monthly history — last 6 months
  const monthlyHistory: { month: string; income: number; expenses: number; netSavings: number }[] = [];
  for (const range of trailingMonthRanges(now, 6)) {
    const mTxs = await db.select().from(transactionsTable)
      .where(and(eq(transactionsTable.userId, userId), gte(transactionsTable.date, range.from), lte(transactionsTable.date, range.to)));
    let mInc = 0, mExp = 0;
    for (const tx of mTxs) {
      const native = Math.abs(parseFloat(tx.nativeAmount));
      const gbp = await toBase(native, tx.currency, baseCurrency);
      if (gbp == null) continue;
      if (tx.type === "income") mInc += gbp;
      else if (tx.type === "expense") mExp += gbp;
    }
    monthlyHistory.push({ month: range.month, income: Math.round(mInc * 100) / 100, expenses: Math.round(mExp * 100) / 100, netSavings: Math.round((mInc - mExp) * 100) / 100 });
  }

  // Owing — pending debts only. FX-unavailable debts drop out of the
  // roll-up rather than substituting a fabricated conversion.
  const pendingDebts = await db.select().from(debtsTable).where(and(eq(debtsTable.userId, userId), eq(debtsTable.status, "pending")));
  let totalOwedToMe = 0;
  let totalIOwe = 0;
  for (const d of pendingDebts) {
    const gbp = await toBase(parseFloat(d.nativeAmount), d.currency, baseCurrency);
    if (gbp == null) continue;
    if (d.direction === "they_owe_me") totalOwedToMe += gbp;
    else totalIOwe += gbp;
  }

  res.json(
    GetDashboardResponse.parse({
      baseCurrency,
      netLiquidity: Math.round(netLiquidity * 100) / 100,
      netWorth: Math.round(netWorth * 100) / 100,
      totalCash: Math.round(totalCash * 100) / 100,
      unconvertibleAccounts,
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
