import { Router, type IRouter } from "express";
import { and, eq, gte, lte, inArray, ne } from "drizzle-orm";
import { db, accountsTable, transactionsTable, investmentsTable, upcomingTable, debtsTable, nwSnapshotsTable, sharedExpensesTable, sharedExpenseParticipantsTable, userTable } from "@workspace/db";
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
  // Null passes through per the widened API contract; consumers render
  // the native amount alone. Aggregations skip nulls; unconvertibleAccounts
  // surfaces the gap so totals can be caveated in the UI.
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
        gbpEquivalent: gbpEquivalent == null ? null : Math.round(gbpEquivalent * 100) / 100,
        type: a.type,
      };
    })
  );
  const totalCash = accountBreakdown.reduce<number>((s, a) => s + (a.gbpEquivalent ?? 0), 0);

  // Investments — priced positions only (G10). Positions whose live price
  // the market API cannot supply are excluded from the portfolio total
  // rather than substituting zero (which read as −100% loss). Same for
  // positions whose FX-to-base leg is unavailable.
  const investments = await db.select().from(investmentsTable).where(eq(investmentsTable.userId, userId));
  let portfolioValueGbp = 0;
  let portfolioCostGbp = 0;
  // Intraday day-change (P1b). Sum of shares * (price - previousClose)
  // converted to base, over positions that contribute to the value
  // total. If ANY contributing position lacks previousClose or its
  // FX leg fails, the whole delta becomes null — a half-computed
  // delta would be a lie on the headline that decides whether the
  // market persona has a reason to open the app tomorrow. G10:
  // render "—" not a fabricated zero.
  let dayChangeGbp: number | null = 0;
  let dayChangePrevValueGbp: number | null = 0;
  const invalidateDayChange = () => { dayChangeGbp = null; dayChangePrevValueGbp = null; };
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

      // Day-change contribution for this position. If any leg is
      // missing (no previousClose, non-finite, or FX conversion
      // fails), invalidate the whole delta and stop accumulating.
      if (dayChangeGbp !== null) {
        const prev = priceData.previousClose;
        if (prev == null || !Number.isFinite(prev)) {
          invalidateDayChange();
        } else {
          const deltaNative = shares * (priceData.price - prev);
          const prevValueNative = shares * prev;
          const deltaGbp = await toBase(deltaNative, currency, baseCurrency);
          const prevValueGbp = await toBase(prevValueNative, currency, baseCurrency);
          if (deltaGbp == null || prevValueGbp == null) {
            invalidateDayChange();
          } else {
            dayChangeGbp += deltaGbp;
            (dayChangePrevValueGbp as number) += prevValueGbp;
          }
        }
      }
    }
  }
  const portfolioPlGbp = portfolioValueGbp - portfolioCostGbp;
  const portfolioPlPercent = portfolioCostGbp > 0 ? (portfolioPlGbp / portfolioCostGbp) * 100 : 0;
  // Day-change percent = deltaGbp / previousValueGbp. Null when the
  // delta itself is null OR previousValueGbp is 0 (nothing to
  // compare against). "0 previous" happens when the user holds only
  // positions whose previous close was 0, which does not occur for
  // real equities but is guarded for defensiveness.
  const dayChangePercent: number | null =
    dayChangeGbp == null || dayChangePrevValueGbp == null || dayChangePrevValueGbp === 0
      ? null
      : (dayChangeGbp / dayChangePrevValueGbp) * 100;

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

  // Monthly history — last 12 months. Extended from 6 for C2-1 so
  // BANDS gets a full year of composition to render. Each entry carries
  // income/expenses/netSavings AND a composition snapshot (or null if
  // no snapshot exists for that month — see nw_snapshots below).
  const ranges = trailingMonthRanges(now, 12);

  // Snapshots for the range window. Fetched in one query keyed by
  // (userId, month IN (…)). The current-month row is upserted below
  // AFTER we have the live buckets; that upsert row is included in
  // the map because it lands before this select — actually no, we
  // do the read first, then upsert. Simpler: read now, then for the
  // current month, substitute live buckets in place if no snapshot
  // yet OR update in place with live buckets so the response and the
  // upsert always agree.
  const rangeMonths = ranges.map((r) => r.month);
  const snapshots = await db
    .select()
    .from(nwSnapshotsTable)
    .where(and(eq(nwSnapshotsTable.userId, userId), inArray(nwSnapshotsTable.month, rangeMonths)));
  const snapshotMap = new Map<string, typeof snapshots[number]>();
  for (const s of snapshots) snapshotMap.set(s.month, s);

  // Live composition for the current month, computed from
  // accountBreakdown + portfolio. Mirrors computeHoldings() on the
  // frontend (MobileHome.tsx) — kept in step because the frontend
  // uses this same shape to render RING.
  //
  // Investment bucket = investment-typed accounts + total portfolio
  // value. The other buckets sum FX-convertible accounts of matching
  // type; unconvertible accounts fall out with no ghost bucket.
  const liveComposition = { cash: 0, investment: 0, pension: 0, property: 0, other: 0 };
  for (const a of accountBreakdown) {
    if (a.gbpEquivalent == null) continue;
    liveComposition[a.type as "cash" | "investment" | "pension" | "property" | "other"] += a.gbpEquivalent;
  }
  liveComposition.investment += portfolioValueGbp;
  const round4 = (n: number) => Math.round(n * 100) / 100;
  const liveCompositionRounded = {
    cash: round4(liveComposition.cash),
    investment: round4(liveComposition.investment),
    pension: round4(liveComposition.pension),
    property: round4(liveComposition.property),
    other: round4(liveComposition.other),
  };

  // Current-month snapshot: upsert on (userId, month). The last write
  // of a month wins — subsequent dashboard reads overwrite the
  // in-progress snapshot with the newer live totals. Once the month
  // rolls over, no further writes happen for that band (the read-only
  // guard is the range membership check, not a fresh write path).
  const thisMonthKey = ranges[ranges.length - 1]!.month;
  await db
    .insert(nwSnapshotsTable)
    .values({
      userId,
      month: thisMonthKey,
      cash: String(liveCompositionRounded.cash),
      investment: String(liveCompositionRounded.investment),
      pension: String(liveCompositionRounded.pension),
      property: String(liveCompositionRounded.property),
      other: String(liveCompositionRounded.other),
    })
    .onConflictDoUpdate({
      target: [nwSnapshotsTable.userId, nwSnapshotsTable.month],
      set: {
        cash: String(liveCompositionRounded.cash),
        investment: String(liveCompositionRounded.investment),
        pension: String(liveCompositionRounded.pension),
        property: String(liveCompositionRounded.property),
        other: String(liveCompositionRounded.other),
      },
    });
  // Make the just-upserted current-month values visible to the loop
  // below without a second SELECT.
  snapshotMap.set(thisMonthKey, {
    id: -1,
    userId,
    month: thisMonthKey,
    cash: String(liveCompositionRounded.cash),
    investment: String(liveCompositionRounded.investment),
    pension: String(liveCompositionRounded.pension),
    property: String(liveCompositionRounded.property),
    other: String(liveCompositionRounded.other),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const monthlyHistory: {
    month: string;
    income: number;
    expenses: number;
    netSavings: number;
    composition: {
      cash: number;
      investment: number;
      pension: number;
      property: number;
      other: number;
    } | null;
  }[] = [];
  for (const range of ranges) {
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
    const snap = snapshotMap.get(range.month);
    // Composition: null when no snapshot exists for that month. UI
    // renders an empty band, NOT a fabricated zero — snapshots start
    // building the first time the dashboard route runs for a user
    // (see the upsert above), so months before that show as null.
    const composition = snap
      ? {
          cash: parseFloat(snap.cash),
          investment: parseFloat(snap.investment),
          pension: parseFloat(snap.pension),
          property: parseFloat(snap.property),
          other: parseFloat(snap.other),
        }
      : null;
    monthlyHistory.push({
      month: range.month,
      income: Math.round(mInc * 100) / 100,
      expenses: Math.round(mExp * 100) / 100,
      netSavings: Math.round((mInc - mExp) * 100) / 100,
      composition,
    });
  }

  // Owing — pending debts only. FX-unavailable debts drop out of the
  // roll-up rather than substituting a fabricated conversion.
  const pendingDebts = await db.select().from(debtsTable).where(and(eq(debtsTable.userId, userId), eq(debtsTable.status, "pending")));
  let totalOwedToMe = 0;
  let totalIOwe = 0;
  // C2-4: per-counterparty detail so the mobile home CLAIMED line
  // can name the top few debts instead of only showing a count.
  // Sources: legacy debts (personName) + F4 shared_expense_participants
  // where this user is a linked participant AND still outstanding.
  // Both funnel into the same shape.
  interface OwingRow { name: string; amountGbp: number; direction: "they_owe_me" | "i_owe_them" }
  const owingRows: OwingRow[] = [];
  for (const d of pendingDebts) {
    const gbp = await toBase(parseFloat(d.nativeAmount), d.currency, baseCurrency);
    if (gbp == null) continue;
    if (d.direction === "they_owe_me") totalOwedToMe += gbp;
    else totalIOwe += gbp;
    owingRows.push({ name: d.personName, amountGbp: gbp, direction: d.direction as OwingRow["direction"] });
  }
  // F4 shared expenses: as PARTICIPANT (I owe on someone else's bill),
  // outstanding shares are money I owe. Only outstanding — requested
  // and acknowledged are already in flight or done.
  const myParticipations = await db
    .select({
      participant: sharedExpenseParticipantsTable,
      expense: sharedExpensesTable,
    })
    .from(sharedExpenseParticipantsTable)
    .innerJoin(sharedExpensesTable, eq(sharedExpenseParticipantsTable.sharedExpenseId, sharedExpensesTable.id))
    .where(and(
      eq(sharedExpenseParticipantsTable.linkedUserId, userId),
      eq(sharedExpenseParticipantsTable.status, "outstanding"),
      ne(sharedExpensesTable.userId, userId),
    ));
  for (const row of myParticipations) {
    const gbp = await toBase(parseFloat(row.participant.shareAmount), row.expense.currency, baseCurrency);
    if (gbp == null) continue;
    totalIOwe += gbp;
    // Look up the payer's name via the user table for a legible label.
    const [payer] = await db.select({ name: userTable.name }).from(userTable).where(eq(userTable.id, row.expense.userId));
    owingRows.push({
      name: `${payer?.name ?? "Payer"} · ${row.expense.description}`,
      amountGbp: gbp,
      direction: "i_owe_them",
    });
  }
  // Also as PAYER: outstanding participants who owe me.
  const myPayerExpenses = await db.select().from(sharedExpensesTable).where(eq(sharedExpensesTable.userId, userId));
  if (myPayerExpenses.length > 0) {
    const expenseIds = myPayerExpenses.map((e) => e.id);
    const outstandingOwed = await db
      .select()
      .from(sharedExpenseParticipantsTable)
      .where(and(
        inArray(sharedExpenseParticipantsTable.sharedExpenseId, expenseIds),
        eq(sharedExpenseParticipantsTable.status, "outstanding"),
        eq(sharedExpenseParticipantsTable.isPayer, "false"),
      ));
    for (const p of outstandingOwed) {
      const expense = myPayerExpenses.find((e) => e.id === p.sharedExpenseId);
      if (!expense) continue;
      const gbp = await toBase(parseFloat(p.shareAmount), expense.currency, baseCurrency);
      if (gbp == null) continue;
      totalOwedToMe += gbp;
      owingRows.push({
        name: `${p.name} · ${expense.description}`,
        amountGbp: gbp,
        direction: "they_owe_me",
      });
    }
  }

  // Top 3 by absolute amount — enough for a home-screen strip without
  // spilling. Client can request the full list from /shared-expenses
  // or /debts.
  const topPending = owingRows
    .sort((a, b) => b.amountGbp - a.amountGbp)
    .slice(0, 3)
    .map((r) => ({ name: r.name, amountGbp: Math.round(r.amountGbp * 100) / 100, direction: r.direction }));

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
        dayChangeGbp: dayChangeGbp == null ? null : Math.round(dayChangeGbp * 100) / 100,
        dayChangePercent: dayChangePercent == null ? null : Math.round(dayChangePercent * 100) / 100,
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
        pendingCount: owingRows.length,
        topPending,
      },
      monthlyHistory,
    })
  );
});

export default router;
