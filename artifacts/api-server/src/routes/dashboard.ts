import { Router, type IRouter } from "express";
import { and, eq, gte, lte, inArray, ne, sql } from "drizzle-orm";
import { db, accountsTable, transactionsTable, investmentsTable, upcomingTable, debtsTable, nwSnapshotsTable, sharedExpensesTable, sharedExpenseParticipantsTable, userTable } from "@workspace/db";
import { GetDashboardResponse } from "@workspace/api-zod";
import { toBase, txToBase, getStockPrices } from "../lib/market";
import { getBaseCurrency } from "../lib/app-settings-db";
import { trailingMonthRanges, localDateString } from "../lib/date-ranges";

const router: IRouter = Router();

// ── /dashboard — dependency graph, before you edit ──────────────────────────
//
// Documented as a comment because the shape is load-bearing: the handler
// has 11 top-level awaits, most of which have NO data dependency on the
// ones before them, and rewriting without the graph in front of you is
// how correctness regresses. The last rewrite pass took this endpoint
// from 4.85s warm (12 sequential-ish awaits + 12-month re-query loop)
// to <1s by fanning out at every level the graph allows.
//
// Level 0 — nine independent queries (userId + `now` are the only inputs):
//   A getBaseCurrency
//   B SELECT accounts
//   D SELECT investments
//   G SELECT this-month txs
//   I SELECT upcoming (30d window)
//   K SELECT nw_snapshots (12-month range)
//   N SELECT pending debts
//   P SELECT my participations (JOIN expenses)
//   R SELECT expenses I paid
//   + one aggregated SUM query for 12-month trailing history (replaces
//     the old 12-iteration loop; toBase uses current FX so SUM before
//     conversion is mathematically equivalent to per-tx conversion).
//
// Level 1 — fan out after Level 0. Each waits only on its parent + A:
//   C accounts → per-row toBase (already Promise.all in old code)
//   E getStockPrices(tickers-from-D)
//   H this-month txs → per-tx toBase
//   J upcoming → per-item toBase
//   O pending debts → per-debt toBase
//   Q my participations → per-row toBase (+ ONE payer-name lookup, not N+1)
//   S if R has any: SELECT participants IN expenseIds
//
// Level 2 — F depends on E, T depends on S. Both independent of each other.
//   F per-investment toBase × up-to-4 with null-preserving day-change reduce
//   T my-payer-participants → per-row toBase
//
// Level 3 — L UPSERT nw_snapshots current month. Depends on C + F.
//
// Level 4 — combine SQL-aggregated monthly totals with snapshot composition
//   (K + L result) to build monthlyHistory. Pure in-memory work.
//
// Correctness invariants (do NOT relax):
//   1. toBase returns null on FX cache miss. Consumers of null MUST skip
//      rather than substitute 0 (G10, no fabricated numbers).
//   2. Day-change: whole-portfolio dayChangeBase is null if ANY contributing
//      position has a null leg (previousClose missing OR FX unavailable).
//      Order-independent — the reduce below preserves this.
//   3. L (upsert) must land before the monthly-history composition
//      lookup for the current month; the code below reads and writes
//      composition explicitly rather than relying on read-after-write.

// ── Per-domain processors ────────────────────────────────────────────────────
// Each takes a Level-0 query result + baseCurrency and returns the fields
// the handler needs. Isolating the reductions keeps the top-level handler
// composed of Promise.all calls and simple field extraction.

type Account = typeof accountsTable.$inferSelect;
type Investment = typeof investmentsTable.$inferSelect;
type Transaction = typeof transactionsTable.$inferSelect;
type Upcoming = typeof upcomingTable.$inferSelect;
type Debt = typeof debtsTable.$inferSelect;

interface OwingRow { name: string; amountBase: number; direction: "they_owe_me" | "i_owe_them" }

async function processAccounts(accounts: Account[], baseCurrency: string) {
  let unconvertibleAccounts = 0;
  const accountBreakdown = await Promise.all(
    accounts.map(async (a) => {
      const balance = parseFloat(a.balance);
      const baseEquivalent = await toBase(balance, a.currency, baseCurrency);
      if (baseEquivalent == null) unconvertibleAccounts += 1;
      return {
        id: a.id,
        name: a.name,
        currency: a.currency,
        balance,
        baseEquivalent: baseEquivalent == null ? null : Math.round(baseEquivalent * 100) / 100,
        type: a.type,
      };
    }),
  );
  const totalCash = accountBreakdown.reduce<number>((s, a) => s + (a.baseEquivalent ?? 0), 0);
  return { accountBreakdown, totalCash, unconvertibleAccounts };
}

async function processInvestments(investments: Investment[], baseCurrency: string) {
  if (investments.length === 0) {
    return { portfolioValueBase: 0, portfolioCostBase: 0, dayChangeBase: 0 as number | null, dayChangePrevValueBase: 0 as number | null };
  }
  const tickers = [...new Set(investments.map((i) => i.ticker))];
  const prices = await getStockPrices(tickers);
  const priceMap = new Map(prices.map((p) => [p.ticker, p]));

  // Per position: resolve value/cost/day-change contributions in parallel.
  // Each returns { valueBase, costBase, dayBase, dayPrevBase } with null for
  // any leg that couldn't convert. The reduce below preserves the G10
  // invariant: whole-portfolio day-change goes null if ANY contribution
  // has a null day leg. Order-independent, safe to parallelise.
  interface Contribution { valueBase: number | null; costBase: number | null; dayBase: number | null; dayPrevBase: number | null; }
  const contributions: Contribution[] = await Promise.all(
    investments.map(async (inv): Promise<Contribution> => {
      const priceData = priceMap.get(inv.ticker);
      if (!priceData || typeof priceData.price !== "number" || !Number.isFinite(priceData.price)) {
        return { valueBase: null, costBase: null, dayBase: null, dayPrevBase: null };
      }
      const shares = parseFloat(inv.shares);
      const costPrice = parseFloat(inv.costPricePerShare);
      const currency = priceData.currency ?? "USD";
      const currentValue = shares * priceData.price;
      const costBasis = shares * costPrice;
      // Four FX legs for this position, fired in parallel — same
      // baseCurrency, same currency; toBase's in-memory FX cache serves
      // them all from one lookup.
      const prev = priceData.previousClose;
      const legs = await Promise.all([
        toBase(currentValue, currency, baseCurrency),
        toBase(costBasis, currency, baseCurrency),
        prev != null && Number.isFinite(prev)
          ? toBase(shares * (priceData.price - prev), currency, baseCurrency)
          : Promise.resolve(null),
        prev != null && Number.isFinite(prev)
          ? toBase(shares * prev, currency, baseCurrency)
          : Promise.resolve(null),
      ]);
      const [valueBase, costBase, dayBase, dayPrevBase] = legs;
      // If value or cost failed, this position contributes nothing (it
      // wouldn't have been in the totals under the old sequential code
      // either — the `continue` on line 73 of the old handler).
      if (valueBase == null || costBase == null) {
        return { valueBase: null, costBase: null, dayBase: null, dayPrevBase: null };
      }
      return { valueBase, costBase, dayBase, dayPrevBase };
    }),
  );

  let portfolioValueBase = 0;
  let portfolioCostBase = 0;
  let dayChangeBase: number | null = 0;
  let dayChangePrevValueBase: number | null = 0;
  for (const c of contributions) {
    if (c.valueBase == null || c.costBase == null) continue;
    portfolioValueBase += c.valueBase;
    portfolioCostBase += c.costBase;
    // Day-change: null if the position that contributes to value has a
    // null day leg. Matches the old invalidateDayChange() semantics.
    if (dayChangeBase !== null) {
      if (c.dayBase == null || c.dayPrevBase == null) {
        dayChangeBase = null;
        dayChangePrevValueBase = null;
      } else {
        dayChangeBase += c.dayBase;
        (dayChangePrevValueBase as number) += c.dayPrevBase;
      }
    }
  }
  return { portfolioValueBase, portfolioCostBase, dayChangeBase, dayChangePrevValueBase };
}

async function processMonthTxs(txs: Transaction[], baseCurrency: string) {
  const converted = await Promise.all(
    txs.map(async (tx) => {
      // txToBase uses the row's stored rate when present so the
      // monthly total doesn't drift between reads.
      const gbp = await txToBase(tx, baseCurrency);
      return { gbp, type: tx.type };
    }),
  );
  let monthIncome = 0;
  let monthExpenses = 0;
  for (const c of converted) {
    if (c.gbp == null) continue;
    if (c.type === "income") monthIncome += c.gbp;
    else if (c.type === "expense") monthExpenses += c.gbp;
  }
  return { monthIncome, monthExpenses };
}

async function processUpcoming(upcoming: Upcoming[], baseCurrency: string) {
  const converted = await Promise.all(
    upcoming.map(async (item) => {
      if (item.status !== "pending") return { gbp: null as number | null, type: item.type };
      const gbp = await toBase(parseFloat(item.nativeAmount), item.currency, baseCurrency);
      return { gbp, type: item.type };
    }),
  );
  let committedOut = 0;
  let expectedIn = 0;
  for (const c of converted) {
    if (c.gbp == null) continue;
    if (c.type === "expense") committedOut += c.gbp;
    else if (c.type === "income") expectedIn += c.gbp;
  }
  return { committedOut, expectedIn };
}

async function processPendingDebts(pendingDebts: Debt[], baseCurrency: string) {
  const converted = await Promise.all(
    pendingDebts.map(async (d) => {
      const gbp = await toBase(parseFloat(d.nativeAmount), d.currency, baseCurrency);
      return { gbp, direction: d.direction, name: d.personName };
    }),
  );
  let totalOwedToMe = 0;
  let totalIOwe = 0;
  const rows: OwingRow[] = [];
  for (const c of converted) {
    if (c.gbp == null) continue;
    if (c.direction === "they_owe_me") totalOwedToMe += c.gbp;
    else totalIOwe += c.gbp;
    rows.push({ name: c.name, amountBase: c.gbp, direction: c.direction as OwingRow["direction"] });
  }
  return { totalOwedToMe, totalIOwe, rows };
}

// N+1 collapse: the old code did one `SELECT userTable WHERE id = expense.userId`
// per participation row. We fire ONE lookup over the union of payer ids
// used by any participation, then use the map in the FX loop.
async function processMyParticipations(
  myParticipations: { participant: typeof sharedExpenseParticipantsTable.$inferSelect; expense: typeof sharedExpensesTable.$inferSelect }[],
  baseCurrency: string,
) {
  if (myParticipations.length === 0) return { totalIOwe: 0, rows: [] as OwingRow[] };
  const payerIds = [...new Set(myParticipations.map((r) => r.expense.userId))];
  const [converted, payers] = await Promise.all([
    Promise.all(
      myParticipations.map(async (row) => {
        const gbp = await toBase(parseFloat(row.participant.shareAmount), row.expense.currency, baseCurrency);
        return { gbp, expense: row.expense };
      }),
    ),
    db.select({ id: userTable.id, name: userTable.name }).from(userTable).where(inArray(userTable.id, payerIds)),
  ]);
  const nameById = new Map(payers.map((p) => [p.id, p.name]));
  let totalIOwe = 0;
  const rows: OwingRow[] = [];
  for (const c of converted) {
    if (c.gbp == null) continue;
    totalIOwe += c.gbp;
    const payerName = nameById.get(c.expense.userId) ?? "Payer";
    rows.push({
      name: `${payerName} · ${c.expense.description}`,
      amountBase: c.gbp,
      direction: "i_owe_them",
    });
  }
  return { totalIOwe, rows };
}

async function processMyPayerExpenses(
  myPayerExpenses: (typeof sharedExpensesTable.$inferSelect)[],
  baseCurrency: string,
) {
  if (myPayerExpenses.length === 0) return { totalOwedToMe: 0, rows: [] as OwingRow[] };
  const expenseIds = myPayerExpenses.map((e) => e.id);
  const outstandingOwed = await db
    .select()
    .from(sharedExpenseParticipantsTable)
    .where(and(
      inArray(sharedExpenseParticipantsTable.sharedExpenseId, expenseIds),
      eq(sharedExpenseParticipantsTable.status, "outstanding"),
      eq(sharedExpenseParticipantsTable.isPayer, "false"),
    ));
  const expenseById = new Map(myPayerExpenses.map((e) => [e.id, e]));
  const converted = await Promise.all(
    outstandingOwed.map(async (p) => {
      const expense = expenseById.get(p.sharedExpenseId);
      if (!expense) return { gbp: null as number | null, p, expense: null };
      const gbp = await toBase(parseFloat(p.shareAmount), expense.currency, baseCurrency);
      return { gbp, p, expense };
    }),
  );
  let totalOwedToMe = 0;
  const rows: OwingRow[] = [];
  for (const c of converted) {
    if (c.gbp == null || !c.expense) continue;
    totalOwedToMe += c.gbp;
    rows.push({
      name: `${c.p.name} · ${c.expense.description}`,
      amountBase: c.gbp,
      direction: "they_owe_me",
    });
  }
  return { totalOwedToMe, rows };
}

// ── Aggregate 12-month history in one SQL query ─────────────────────────────
// Replaces the previous 12-iteration loop of `SELECT * WHERE date BETWEEN ...`
// + per-row toBase. SUM before FX conversion is exact because toBase applies
// a scalar (the current FX rate) — sum(a) * rate == sum(a * rate). Grouping
// by (month, currency, type) reduces N transactions to at most 12 * |CCY| * 2
// aggregate rows, each converted once.

// Pure reduction from converted buckets → per-month totals. Exported for
// direct unit testing (dashboard.monthly-fold.test.ts) — the FX-miss
// null propagation is load-bearing and must be verifiable without a live
// DB or Yahoo Finance.
//
// Rules encoded here (do not relax without updating the test):
//   1. Month with no buckets in `converted` at all → NOT emitted (caller
//      renders 0 as the honest "no transactions" number).
//   2. Month with buckets that ALL converted → { income, expenses } summed.
//   3. Month with ANY null bucket → emitted as null. Consumer must render
//      "unknown / dotted / —", NEVER a fabricated 0. The pnum invariant
//      applied to a monthly total, per CLAUDE.md — "a number the API did
//      not supply" is the exact defect this null is preventing.
export interface MonthlyConvertedBucket { month: string; type: string; gbp: number | null }
export type MonthlyFolded = Map<string, { income: number; expenses: number } | null>;
export function foldMonthlyConverted(converted: readonly MonthlyConvertedBucket[]): MonthlyFolded {
  const byMonth: MonthlyFolded = new Map();
  for (const c of converted) {
    // If we've already marked this month null (any prior bucket in the
    // month had a null gbp), keep it null — one FX miss poisons the
    // whole month. All-or-nothing per month is the right shape here:
    // a month with two convertible USD txs + one unconvertible MYR tx
    // has income neither fully summed nor honestly zero, so the whole
    // total is unknown.
    if (byMonth.get(c.month) === null) continue;
    if (c.gbp == null) {
      byMonth.set(c.month, null);
      continue;
    }
    let entry = byMonth.get(c.month);
    if (!entry) { entry = { income: 0, expenses: 0 }; byMonth.set(c.month, entry); }
    if (c.type === "income") entry.income += c.gbp;
    else if (c.type === "expense") entry.expenses += c.gbp;
  }
  return byMonth;
}

async function loadMonthlyAggregates(userId: string, earliestFrom: string, latestTo: string, baseCurrency: string): Promise<MonthlyFolded> {
  interface AggregateRow { month: string; currency: string; type: string; total: string }
  const rows = (await db
    .select({
      month: sql<string>`to_char(${transactionsTable.date}, 'YYYY-MM')`,
      currency: transactionsTable.currency,
      type: transactionsTable.type,
      total: sql<string>`SUM(ABS(${transactionsTable.nativeAmount}::numeric))`,
    })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.userId, userId),
      gte(transactionsTable.date, earliestFrom),
      lte(transactionsTable.date, latestTo),
    ))
    .groupBy(sql`to_char(${transactionsTable.date}, 'YYYY-MM')`, transactionsTable.currency, transactionsTable.type)) as AggregateRow[];

  // Convert each aggregated bucket to base once. Parallel because each
  // toBase is independent; the fxCache serves them all from one lookup.
  const converted: MonthlyConvertedBucket[] = await Promise.all(
    rows.map(async (r) => ({
      month: r.month,
      type: r.type,
      gbp: await toBase(parseFloat(r.total), r.currency, baseCurrency),
    })),
  );

  return foldMonthlyConverted(converted);
}

// ── Handler ──────────────────────────────────────────────────────────────────

router.get("/dashboard", async (req, res): Promise<void> => {
  const userId = (req as unknown as { userId: string }).userId;
  const now = new Date();
  const ranges = trailingMonthRanges(now, 12);
  const rangeMonths = ranges.map((r) => r.month);
  const earliestFrom = ranges[0]!.from;
  const latestTo = ranges[ranges.length - 1]!.to;

  const todayStr = localDateString(now);
  const in30 = new Date(now);
  in30.setDate(now.getDate() + 30);
  const in30Str = localDateString(in30);

  // Level 0 — nine independent queries + one aggregated 12-month SUM.
  // Fired in parallel because none of them depend on any of the others.
  // baseCurrency is a special case: A produces it and everything downstream
  // needs it, but the QUERIES below don't need it — only the FX conversions
  // that consume them do. So we can fire A in the same Promise.all.
  const [
    baseCurrency,
    accounts,
    investments,
    txsThisMonth,
    upcoming,
    snapshots,
    pendingDebts,
    myParticipations,
    myPayerExpenses,
  ] = await Promise.all([
    getBaseCurrency(userId),
    db.select().from(accountsTable).where(eq(accountsTable.userId, userId)),
    db.select().from(investmentsTable).where(eq(investmentsTable.userId, userId)),
    db.select().from(transactionsTable).where(and(
      eq(transactionsTable.userId, userId),
      gte(transactionsTable.date, ranges[ranges.length - 1]!.from),
      lte(transactionsTable.date, ranges[ranges.length - 1]!.to),
    )),
    db.select().from(upcomingTable).where(and(
      eq(upcomingTable.userId, userId),
      gte(upcomingTable.dueDate, todayStr),
      lte(upcomingTable.dueDate, in30Str),
    )),
    db.select().from(nwSnapshotsTable).where(and(
      eq(nwSnapshotsTable.userId, userId),
      inArray(nwSnapshotsTable.month, rangeMonths),
    )),
    db.select().from(debtsTable).where(and(eq(debtsTable.userId, userId), eq(debtsTable.status, "pending"))),
    db
      .select({ participant: sharedExpenseParticipantsTable, expense: sharedExpensesTable })
      .from(sharedExpenseParticipantsTable)
      .innerJoin(sharedExpensesTable, eq(sharedExpenseParticipantsTable.sharedExpenseId, sharedExpensesTable.id))
      .where(and(
        eq(sharedExpenseParticipantsTable.linkedUserId, userId),
        eq(sharedExpenseParticipantsTable.status, "outstanding"),
        ne(sharedExpensesTable.userId, userId),
      )),
    db.select().from(sharedExpensesTable).where(eq(sharedExpensesTable.userId, userId)),
  ]);

  // Level 1 — fan out per-domain processing. Each waits only on its parent
  // Level-0 result + baseCurrency (which resolved with them). Independent
  // of each other, so Promise.all across domains.
  const [
    { accountBreakdown, totalCash, unconvertibleAccounts },
    { portfolioValueBase, portfolioCostBase, dayChangeBase, dayChangePrevValueBase },
    { monthIncome, monthExpenses },
    { committedOut, expectedIn },
    debtsResult,
    participationsResult,
    payerExpensesResult,
    monthlyAggregates,
  ] = await Promise.all([
    processAccounts(accounts, baseCurrency),
    processInvestments(investments, baseCurrency),
    processMonthTxs(txsThisMonth, baseCurrency),
    processUpcoming(upcoming, baseCurrency),
    processPendingDebts(pendingDebts, baseCurrency),
    processMyParticipations(myParticipations, baseCurrency),
    processMyPayerExpenses(myPayerExpenses, baseCurrency),
    loadMonthlyAggregates(userId, earliestFrom, latestTo, baseCurrency),
  ]);

  // Level 3 — UPSERT current-month snapshot. Depends on accountBreakdown
  // + portfolioValueBase. This is a write, then read-through into the
  // snapshotMap so the monthly-history loop below sees the fresh values.
  const snapshotMap = new Map<string, typeof snapshots[number]>();
  for (const s of snapshots) snapshotMap.set(s.month, s);

  const liveComposition = { cash: 0, investment: 0, pension: 0, property: 0, other: 0 };
  for (const a of accountBreakdown) {
    if (a.baseEquivalent == null) continue;
    liveComposition[a.type as "cash" | "investment" | "pension" | "property" | "other"] += a.baseEquivalent;
  }
  liveComposition.investment += portfolioValueBase;
  const round4 = (n: number) => Math.round(n * 100) / 100;
  const liveCompositionRounded = {
    cash: round4(liveComposition.cash),
    investment: round4(liveComposition.investment),
    pension: round4(liveComposition.pension),
    property: round4(liveComposition.property),
    other: round4(liveComposition.other),
  };

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
  // Patch the map so the composition lookup below sees the just-written
  // value without a second SELECT.
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

  // Level 4 — assemble monthlyHistory from aggregated totals + snapshots.
  // Pure in-memory work now; the old 12-SELECT loop is gone.
  //
  // Three cases per month:
  //   (a) map has an object → sum: emit as numbers.
  //   (b) map has `null` (explicit): at least one FX conversion failed
  //       inside this month. Emit income/expenses/netSavings as null so
  //       the UI renders "unknown / dotted", NOT a fabricated £0. See
  //       foldMonthlyConverted above.
  //   (c) map missing the month entirely: no transactions in that month.
  //       Emit zeros — the honest "nothing happened" number.
  const monthlyHistory = ranges.map((range) => {
    const snap = snapshotMap.get(range.month);
    const composition = snap
      ? {
          cash: parseFloat(snap.cash),
          investment: parseFloat(snap.investment),
          pension: parseFloat(snap.pension),
          property: parseFloat(snap.property),
          other: parseFloat(snap.other),
        }
      : null;
    const hasEntry = monthlyAggregates.has(range.month);
    const agg = monthlyAggregates.get(range.month);
    if (hasEntry && agg === null) {
      // Case (b): FX miss somewhere in this month.
      return {
        month: range.month,
        income: null,
        expenses: null,
        netSavings: null,
        composition,
      };
    }
    // Case (a) with buckets, or (c) with no transactions — both emit
    // numbers. agg is either the summed object or missing (0/0 fallback).
    const sum = agg ?? { income: 0, expenses: 0 };
    return {
      month: range.month,
      income: Math.round(sum.income * 100) / 100,
      expenses: Math.round(sum.expenses * 100) / 100,
      netSavings: Math.round((sum.income - sum.expenses) * 100) / 100,
      composition,
    };
  });

  // Owing totals combine the three sources.
  const totalOwedToMe = debtsResult.totalOwedToMe + payerExpensesResult.totalOwedToMe;
  const totalIOwe = debtsResult.totalIOwe + participationsResult.totalIOwe;
  const owingRows = [...debtsResult.rows, ...participationsResult.rows, ...payerExpensesResult.rows];
  const topPending = owingRows
    .sort((a, b) => b.amountBase - a.amountBase)
    .slice(0, 3)
    .map((r) => ({ name: r.name, amountBase: Math.round(r.amountBase * 100) / 100, direction: r.direction }));

  const monthNet = monthIncome - monthExpenses;
  const savingsRate = monthIncome > 0 ? (monthNet / monthIncome) * 100 : 0;
  const netLiquidity = totalCash - committedOut + expectedIn;
  const netWorth = totalCash + portfolioValueBase;
  const portfolioPlBase = portfolioValueBase - portfolioCostBase;
  // No cost basis (empty portfolio) → no return to compute. Null, not 0
  // — a "+0.00%" render for a user who holds nothing is a fabricated
  // return the data does not support. Client renders "—" when null.
  const portfolioPlPercent: number | null = portfolioCostBase > 0 ? (portfolioPlBase / portfolioCostBase) * 100 : null;
  const dayChangePercent: number | null =
    dayChangeBase == null || dayChangePrevValueBase == null || dayChangePrevValueBase === 0
      ? null
      : (dayChangeBase / dayChangePrevValueBase) * 100;

  res.json(
    GetDashboardResponse.parse({
      baseCurrency,
      netLiquidity: Math.round(netLiquidity * 100) / 100,
      netWorth: Math.round(netWorth * 100) / 100,
      totalCash: Math.round(totalCash * 100) / 100,
      unconvertibleAccounts,
      accountBreakdown,
      portfolio: {
        totalValueBase: Math.round(portfolioValueBase * 100) / 100,
        totalPlBase: Math.round(portfolioPlBase * 100) / 100,
        totalPlPercent: portfolioPlPercent == null ? null : Math.round(portfolioPlPercent * 100) / 100,
        dayChangeBase: dayChangeBase == null ? null : Math.round(dayChangeBase * 100) / 100,
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
        netBase: Math.round((totalOwedToMe - totalIOwe) * 100) / 100,
        pendingCount: owingRows.length,
        topPending,
      },
      monthlyHistory,
    }),
  );
});

export default router;
