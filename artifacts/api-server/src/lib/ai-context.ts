// Server-side AI context assembly.
//
// The chat model used to receive one sentence — "The user is currently
// on: Dashboard." — assembled client-side and posted as the `context`
// field on /api/ai/chat. That was wrong on two counts:
//
//   1. The AI had no idea who it was talking to. Every reply was
//      generic-chatbot-in-a-finance-app.
//
//   2. Even if the client had assembled a rich payload, POSTing
//      someone's balances up on every message is a leak surface with
//      no reason to exist — the server already has the data.
//
// This module builds the context server-side from the user's own rows,
// keyed on the userId `requireAuth` puts on the request. The client
// only sends { messages, path }; the server assembles context and
// wraps it in the existing prompt-injection delimiter block that
// ai.ts's caller uses.
//
// ── Load-bearing invariants (LOCKED BY TESTS) ─────────────────────────────
//
//   L1. Never fabricate a figure. Every numeric field can be null, and
//       null renders as literal "unknown" (usually with a cause —
//       "unknown (FX unavailable)"). Zero appears only for real
//       zeroes. An AI confidently saying "your net worth is £0" is
//       the exact twin of the fabricated-zero UI bug the whole
//       product was inoculated against.
//
//   L2. Never leak identifiers. The assembled string is scanned in
//       tests for: merchant strings (transactions.description),
//       counterparty names (debts.personName, shared-expense payer
//       names), account labels (accounts.name), account/provider IDs
//       (externalId, wiseBalanceId, wiseProfileId), access tokens
//       (any pattern that looks like a key), IBANs, sort codes.
//       Aggregate-only reporting: "3 accounts", "2 people",
//       "largest £120" — never the underlying strings.
//
//   L3. Never log the assembled context. Test intercepts pino and
//       asserts no log line contains any part of the output. The
//       whole point of building this server-side is that the payload
//       stays on the server; letting it hit Render's log stream
//       recreates the exact leak the client-side ban was closing.
//
//   L4. Hard token budget. MAX_CONTEXT_CHARS (~2.5k tokens) caps the
//       output. Overflow drops low-priority sections in a fixed order
//       and names what was dropped in a suffix — a silently clipped
//       context is the same defect class as a silently clipped figure.
//
//   L5. Per-task profiles. Batch-categorize and receipt-scan get a
//       tiny scoped context (category list, currency) — not the full
//       balances payload. Sending finances to a categorisation call
//       wastes quota and widens leak surface for no benefit.

import { and, eq, gte, lte, ne } from "drizzle-orm";
import {
  db,
  accountsTable,
  transactionsTable,
  budgetsTable,
  upcomingTable,
  debtsTable,
  goalsTable,
  subscriptionsTable,
  investmentsTable,
  sharedExpensesTable,
  sharedExpenseParticipantsTable,
} from "@workspace/db";
import { getBaseCurrency } from "./app-settings-db";
import { toBase, getFxRates, getStockPrices } from "./market";
import { monthRange, localDateString } from "./date-ranges";

// Roughly 2.5k tokens at ~4 chars/token. Well under Groq's 131k window
// and small enough that per-message quota cost stays predictable as a
// user's data grows.
export const MAX_CONTEXT_CHARS = 10_000;

// Space reserved at the tail for the "(context truncated…)" suffix so
// the notice itself never gets clipped by its own guard.
const TRUNCATION_NOTICE_RESERVE = 200;

export interface AiContext {
  text: string;
  sectionsDropped: string[];
  generatedAt: string;
}

// ── Presentation primitives ──────────────────────────────────────────────
// Every currency figure in the assembled context goes through formatMoney
// so the null → "unknown" mapping (L1) can't be forgotten at a call site.

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "£", USD: "$", EUR: "€", JPY: "¥", CHF: "CHF ", MYR: "RM ",
  SGD: "S$", AUD: "A$", CAD: "C$", HKD: "HK$", NZD: "NZ$",
};

function symbolFor(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `;
}

function formatAmount(n: number): string {
  return n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Format a monetary figure with its currency. null → "unknown" with
// the caller-supplied cause appended.
export function formatMoney(amount: number | null, currency: string, unknownCause?: string): string {
  if (amount === null) return unknownCause ? `unknown (${unknownCause})` : "unknown";
  return `${symbolFor(currency)}${formatAmount(amount)}`;
}

// Percent with 0 dp, or "unknown" for null.
function formatPct(n: number | null): string {
  if (n === null) return "unknown";
  return `${Math.round(n)}%`;
}

// ── Section assembly + truncation guard (L4) ─────────────────────────────

interface Section {
  name: string;      // shown in truncation suffix
  priority: number;  // low = keep, high = drop first
  content: string;   // finished text (no leading newline)
}

function assemble(header: string, sections: Section[], generatedAt: string): AiContext {
  const sorted = [...sections].sort((a, b) => a.priority - b.priority);
  const dropped: string[] = [];
  let text = header;
  for (const s of sorted) {
    const addition = "\n\n" + s.content;
    if (text.length + addition.length > MAX_CONTEXT_CHARS - TRUNCATION_NOTICE_RESERVE) {
      dropped.push(s.name);
      continue;
    }
    text += addition;
  }
  if (dropped.length > 0) {
    text += `\n\n(context truncated to fit budget · sections omitted: ${dropped.join(", ")})`;
  }
  return { text, sectionsDropped: dropped, generatedAt };
}

// ── Data loaders ────────────────────────────────────────────────────────

async function loadCurrentMonthTxs(userId: string): Promise<Array<typeof transactionsTable.$inferSelect>> {
  const range = monthRange(new Date());
  return db.select().from(transactionsTable).where(and(
    eq(transactionsTable.userId, userId),
    gte(transactionsTable.date, range.from),
    lte(transactionsTable.date, range.to),
  ));
}

async function loadUpcoming30d(userId: string): Promise<Array<typeof upcomingTable.$inferSelect>> {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return db.select().from(upcomingTable).where(and(
    eq(upcomingTable.userId, userId),
    eq(upcomingTable.status, "pending"),
    gte(upcomingTable.dueDate, localDateString(now)),
    lte(upcomingTable.dueDate, localDateString(in30)),
  ));
}

// ── Per-currency balance + upcoming exposure ────────────────────────────
// This is the differentiator section (see docs/RETENTION.md — the FX
// angle that no single-country tracker can compete on). Every rate
// carries its timestamp so the model can caveat freshness; when rate
// history lands later, a `trend` field slots in without reshape.

interface CurrencyExposureRow {
  currency: string;
  nativeHeld: number;
  baseHeld: number | null;      // null when FX cache missed for this pair
  nativeUpcomingOut: number;    // absolute value of upcoming expenses
  baseUpcomingOut: number | null;
  isBase: boolean;
  rate: number | null;          // rate used to convert native → base; null when unavailable
  rateAsOf: string | null;      // ISO timestamp when the rate was cached
}

async function buildCurrencyExposure(
  accounts: Array<typeof accountsTable.$inferSelect>,
  upcoming: Array<typeof upcomingTable.$inferSelect>,
  baseCurrency: string,
): Promise<CurrencyExposureRow[]> {
  const fx = await getFxRates();
  const rateFor = (ccy: string): number | null => {
    if (ccy === baseCurrency) return 1;
    const from = ccy === "GBP" ? 1 : fx.rates[ccy];
    const to = baseCurrency === "GBP" ? 1 : fx.rates[baseCurrency];
    if (!from || !to) return null;
    return to / from;
  };

  const byCcy = new Map<string, { native: number; upcomingOut: number }>();
  for (const a of accounts) {
    const row = byCcy.get(a.currency) ?? { native: 0, upcomingOut: 0 };
    row.native += parseFloat(a.balance);
    byCcy.set(a.currency, row);
  }
  for (const u of upcoming) {
    if (u.type !== "expense") continue;
    const row = byCcy.get(u.currency) ?? { native: 0, upcomingOut: 0 };
    row.upcomingOut += Math.abs(parseFloat(u.nativeAmount));
    byCcy.set(u.currency, row);
  }

  const rows: CurrencyExposureRow[] = [];
  for (const [currency, sums] of byCcy) {
    const rate = rateFor(currency);
    const baseHeld = await toBase(sums.native, currency, baseCurrency);
    const baseUpcomingOut = sums.upcomingOut > 0
      ? await toBase(sums.upcomingOut, currency, baseCurrency)
      : 0;
    rows.push({
      currency,
      nativeHeld: sums.native,
      baseHeld,
      nativeUpcomingOut: sums.upcomingOut,
      baseUpcomingOut,
      isBase: currency === baseCurrency,
      rate,
      rateAsOf: rate != null ? fx.updatedAt : null,
    });
  }
  // Base currency first, then others by native-held magnitude.
  rows.sort((a, b) => {
    if (a.isBase !== b.isBase) return a.isBase ? -1 : 1;
    return Math.abs(b.nativeHeld) - Math.abs(a.nativeHeld);
  });
  return rows;
}

function renderCurrencyExposure(rows: CurrencyExposureRow[], baseCurrency: string): string {
  if (rows.length === 0) return "Currency exposure\n  none configured";
  const lines: string[] = ["Currency exposure"];
  for (const r of rows) {
    const nativeStr = formatMoney(r.nativeHeld, r.currency);
    if (r.isBase) {
      const upcoming = r.nativeUpcomingOut > 0
        ? ` · upcoming out ${formatMoney(r.nativeUpcomingOut, r.currency)}`
        : " · no upcoming";
      lines.push(`  ${r.currency}  hold ${nativeStr}${upcoming} · base currency`);
      continue;
    }
    const baseStr = r.baseHeld === null
      ? formatMoney(null, baseCurrency, "FX unavailable")
      : `≈ ${formatMoney(r.baseHeld, baseCurrency)}`;
    const rateStr = r.rate === null
      ? "rate unknown (not cached)"
      : `rate ${baseCurrency}/${r.currency} ${r.rate.toFixed(4)} as of ${r.rateAsOf}`;
    let upcoming: string;
    if (r.nativeUpcomingOut === 0) {
      upcoming = "no upcoming";
    } else {
      const baseUpc = r.baseUpcomingOut === null
        ? "unknown"
        : `≈ ${formatMoney(r.baseUpcomingOut, baseCurrency)}`;
      upcoming = `upcoming out ${formatMoney(r.nativeUpcomingOut, r.currency)} (${baseUpc})`;
    }
    lines.push(`  ${r.currency}  hold ${nativeStr} ${baseStr} · ${rateStr} · ${upcoming}`);
  }
  return lines.join("\n");
}

// ── Net position ────────────────────────────────────────────────────────

interface NetPosition {
  totalCashBase: number;
  portfolioValueBase: number | null;
  netWorthBase: number | null;
  unconvertibleAccounts: number;
  netWorthUnknownCause: string | null;
}

async function computeNetPosition(
  accounts: Array<typeof accountsTable.$inferSelect>,
  investments: Array<typeof investmentsTable.$inferSelect>,
  baseCurrency: string,
): Promise<NetPosition> {
  let totalCashBase = 0;
  let unconvertibleAccounts = 0;
  for (const a of accounts) {
    const gbp = await toBase(parseFloat(a.balance), a.currency, baseCurrency);
    if (gbp === null) unconvertibleAccounts += 1;
    else totalCashBase += gbp;
  }

  // Portfolio value — null-propagating like the dashboard: ANY position
  // with a missing quote or FX leg makes the total unknown, per L1.
  let portfolioValueBase: number | null = 0;
  let portfolioUnknownReason: string | null = null;
  if (investments.length > 0) {
    const tickers = [...new Set(investments.map((i) => i.ticker))];
    const prices = await getStockPrices(tickers);
    const priceMap = new Map(prices.map((p) => [p.ticker, p]));
    for (const inv of investments) {
      const p = priceMap.get(inv.ticker);
      if (!p || typeof p.price !== "number" || !Number.isFinite(p.price)) {
        portfolioValueBase = null;
        portfolioUnknownReason = "no live quote";
        break;
      }
      const value = parseFloat(inv.shares) * p.price;
      const leg = await toBase(value, p.currency ?? "USD", baseCurrency);
      if (leg === null) {
        portfolioValueBase = null;
        portfolioUnknownReason = "FX unavailable";
        break;
      }
      (portfolioValueBase as number) += leg;
    }
  }

  let netWorthBase: number | null;
  let netWorthUnknownCause: string | null = null;
  if (portfolioValueBase === null || unconvertibleAccounts > 0) {
    netWorthBase = null;
    if (portfolioValueBase === null && unconvertibleAccounts > 0) {
      netWorthUnknownCause = `${portfolioUnknownReason} + ${unconvertibleAccounts} account(s) unconvertible`;
    } else if (portfolioValueBase === null) {
      netWorthUnknownCause = portfolioUnknownReason;
    } else {
      netWorthUnknownCause = `${unconvertibleAccounts} account(s) unconvertible`;
    }
  } else {
    netWorthBase = totalCashBase + portfolioValueBase;
  }

  return { totalCashBase, portfolioValueBase, netWorthBase, unconvertibleAccounts, netWorthUnknownCause };
}

function renderNetPosition(np: NetPosition, baseCurrency: string): string {
  const lines: string[] = ["Net position"];
  lines.push(`  Net worth:  ${formatMoney(np.netWorthBase, baseCurrency, np.netWorthUnknownCause ?? undefined)}`);
  lines.push(`  Cash total: ${formatMoney(np.totalCashBase, baseCurrency)}${np.unconvertibleAccounts > 0 ? `  (${np.unconvertibleAccounts} account(s) not converted to ${baseCurrency})` : ""}`);
  lines.push(`  Portfolio:  ${formatMoney(np.portfolioValueBase, baseCurrency, np.portfolioValueBase === null ? "one or more holdings lack a live price" : undefined)}`);
  return lines.join("\n");
}

// ── This month ──────────────────────────────────────────────────────────

interface MonthTotals {
  income: number | null;
  expenses: number | null;
  fxFailures: number;   // count of txns that couldn't convert
  monthLabel: string;
}

async function computeMonthTotals(
  txs: Array<typeof transactionsTable.$inferSelect>,
  baseCurrency: string,
): Promise<MonthTotals> {
  let income = 0;
  let expenses = 0;
  let fxFailures = 0;
  let anyIncomeFailed = false;
  let anyExpenseFailed = false;
  for (const tx of txs) {
    const gbp = await toBase(Math.abs(parseFloat(tx.nativeAmount)), tx.currency, baseCurrency);
    if (gbp === null) {
      fxFailures += 1;
      if (tx.type === "income") anyIncomeFailed = true;
      if (tx.type === "expense") anyExpenseFailed = true;
      continue;
    }
    if (tx.type === "income") income += gbp;
    else if (tx.type === "expense") expenses += gbp;
  }
  const range = monthRange(new Date());
  return {
    // Poison the total when any leg failed — dashboard's monthly-fold rule
    // (dashboard.ts:317 foldMonthlyConverted): partial sum is neither
    // full nor honest zero.
    income: anyIncomeFailed ? null : income,
    expenses: anyExpenseFailed ? null : expenses,
    fxFailures,
    monthLabel: range.month,
  };
}

function renderMonth(m: MonthTotals, baseCurrency: string): string {
  const income = formatMoney(m.income, baseCurrency, m.income === null ? "one or more transactions unconvertible" : undefined);
  const expenses = formatMoney(m.expenses, baseCurrency, m.expenses === null ? "one or more transactions unconvertible" : undefined);
  let net: string;
  if (m.income === null || m.expenses === null) net = "unknown";
  else net = formatMoney(m.income - m.expenses, baseCurrency);
  let savingsRate: string;
  if (m.income === null || m.expenses === null || m.income === 0) savingsRate = "unknown";
  else savingsRate = formatPct(((m.income - m.expenses) / m.income) * 100);
  return [
    `This month (${m.monthLabel}, month-to-date)`,
    `  Income:       ${income}`,
    `  Expenses:     ${expenses}`,
    `  Net:          ${net}`,
    `  Savings rate: ${savingsRate}`,
  ].join("\n");
}

// ── Top spending categories (aggregate; no merchant strings) ────────────

interface CategoryRollupRow { category: string; totalBase: number; count: number }

async function computeCategoryRollup(
  txs: Array<typeof transactionsTable.$inferSelect>,
  baseCurrency: string,
): Promise<CategoryRollupRow[]> {
  const byCat = new Map<string, { totalBase: number; count: number }>();
  for (const tx of txs) {
    if (tx.type !== "expense") continue;
    const gbp = await toBase(Math.abs(parseFloat(tx.nativeAmount)), tx.currency, baseCurrency);
    if (gbp === null) continue;
    const row = byCat.get(tx.category) ?? { totalBase: 0, count: 0 };
    row.totalBase += gbp;
    row.count += 1;
    byCat.set(tx.category, row);
  }
  return Array.from(byCat.entries())
    .map(([category, r]) => ({ category, ...r }))
    .sort((a, b) => b.totalBase - a.totalBase);
}

function renderTopCategories(rows: CategoryRollupRow[], baseCurrency: string): string {
  if (rows.length === 0) return "Top spending this month\n  no expenses recorded";
  const lines: string[] = ["Top spending this month"];
  const top = rows.slice(0, 5);
  for (const r of top) {
    lines.push(`  ${r.category.padEnd(18)} ${formatMoney(r.totalBase, baseCurrency).padStart(12)}  (${r.count} txn${r.count === 1 ? "" : "s"})`);
  }
  if (rows.length > 5) {
    const rest = rows.slice(5).reduce((s, r) => s + r.totalBase, 0);
    lines.push(`  … ${rows.length - 5} other categor${rows.length - 5 === 1 ? "y" : "ies"} totalling ${formatMoney(rest, baseCurrency)}`);
  }
  return lines.join("\n");
}

// ── Budgets vs actual ───────────────────────────────────────────────────

interface BudgetProgressRow {
  category: string;
  limitBase: number;
  actualBase: number;
  pct: number;
  status: "under" | "near" | "over";
}

function computeBudgetProgress(
  budgets: Array<typeof budgetsTable.$inferSelect>,
  categoryRollup: CategoryRollupRow[],
): BudgetProgressRow[] {
  const actualByCat = new Map(categoryRollup.map((r) => [r.category, r.totalBase]));
  return budgets.map((b) => {
    const limitBase = parseFloat(b.monthlyLimit);
    const actualBase = actualByCat.get(b.category) ?? 0;
    const pct = limitBase > 0 ? (actualBase / limitBase) * 100 : 0;
    const status: BudgetProgressRow["status"] =
      pct > 100 ? "over" : pct >= 90 ? "near" : "under";
    return { category: b.category, limitBase, actualBase, pct, status };
  }).sort((a, b) => b.pct - a.pct);
}

function renderBudgets(rows: BudgetProgressRow[], baseCurrency: string): string {
  if (rows.length === 0) return "Budgets (this month)\n  none configured";
  const lines: string[] = ["Budgets (this month)"];
  for (const r of rows) {
    const actual = formatMoney(r.actualBase, baseCurrency);
    const limit = formatMoney(r.limitBase, baseCurrency);
    const flag = r.status === "over" ? "  (over)" : r.status === "near" ? "  (near limit)" : "";
    lines.push(`  ${r.category.padEnd(18)} ${actual} / ${limit}  — ${formatPct(r.pct)}${flag}`);
  }
  return lines.join("\n");
}

// ── Goals ───────────────────────────────────────────────────────────────

function renderGoals(goals: Array<typeof goalsTable.$inferSelect>, baseCurrency: string): string {
  if (goals.length === 0) return "Goals\n  none configured";
  const lines: string[] = ["Goals"];
  for (const g of goals) {
    const current = parseFloat(g.current);
    const target = parseFloat(g.target);
    const pct = target > 0 ? (current / target) * 100 : 0;
    const currentStr = formatMoney(current, baseCurrency);
    const targetStr = formatMoney(target, baseCurrency);
    const deadline = g.deadline ? `  deadline ${g.deadline}` : "";
    const pace = g.monthlyContribution
      ? `  · ${formatMoney(parseFloat(g.monthlyContribution), baseCurrency)}/mo pace`
      : "";
    lines.push(`  ${g.name.slice(0, 40)}: ${currentStr} / ${targetStr}  (${formatPct(pct)})${deadline}${pace}`);
  }
  return lines.join("\n");
}

// ── Debts + shared expenses — AGGREGATE ONLY (L2) ───────────────────────
// Never emit personName or shared-expense description. Aggregate to
// counts + total + largest single amount. The model can still say
// "your largest IOU is £120" without knowing who it's with.

interface DebtsSummary {
  owedToMeTotal: number;
  owedToMePeople: number;
  owedToMeLargest: number;
  iOweTotal: number;
  iOwePeople: number;
  iOweLargest: number;
  fxFailures: number;
}

async function computeDebtsSummary(userId: string, baseCurrency: string): Promise<DebtsSummary> {
  const [pendingDebts, myParticipations, myPayerExpenses] = await Promise.all([
    db.select().from(debtsTable).where(and(
      eq(debtsTable.userId, userId),
      eq(debtsTable.status, "pending"),
    )),
    db.select({
      participant: sharedExpenseParticipantsTable,
      expense: sharedExpensesTable,
    }).from(sharedExpenseParticipantsTable)
      .innerJoin(sharedExpensesTable, eq(sharedExpenseParticipantsTable.sharedExpenseId, sharedExpensesTable.id))
      .where(and(
        eq(sharedExpenseParticipantsTable.linkedUserId, userId),
        eq(sharedExpenseParticipantsTable.status, "outstanding"),
        ne(sharedExpensesTable.userId, userId),
      )),
    db.select().from(sharedExpensesTable).where(eq(sharedExpensesTable.userId, userId)),
  ]);

  // Direct debts split by direction.
  let owedToMeTotal = 0, iOweTotal = 0;
  let owedToMeLargest = 0, iOweLargest = 0;
  const owedToMePeople = new Set<string>();
  const iOwePeople = new Set<string>();
  let fxFailures = 0;
  for (const d of pendingDebts) {
    const gbp = await toBase(parseFloat(d.nativeAmount), d.currency, baseCurrency);
    if (gbp === null) { fxFailures += 1; continue; }
    // We use personName ONLY to count distinct people (never rendered).
    // Distinct-person count leaks nothing — only cardinality.
    if (d.direction === "they_owe_me") {
      owedToMeTotal += gbp;
      if (gbp > owedToMeLargest) owedToMeLargest = gbp;
      owedToMePeople.add(d.personName.toLowerCase().trim());
    } else {
      iOweTotal += gbp;
      if (gbp > iOweLargest) iOweLargest = gbp;
      iOwePeople.add(d.personName.toLowerCase().trim());
    }
  }
  // Shared expenses where I'm a participant → I owe the payer.
  for (const r of myParticipations) {
    const gbp = await toBase(parseFloat(r.participant.shareAmount), r.expense.currency, baseCurrency);
    if (gbp === null) { fxFailures += 1; continue; }
    iOweTotal += gbp;
    if (gbp > iOweLargest) iOweLargest = gbp;
    iOwePeople.add(`payer:${r.expense.userId}`);
  }
  // Shared expenses I paid → outstanding participants owe me.
  const payerExpenseIds = myPayerExpenses.map((e) => e.id);
  if (payerExpenseIds.length > 0) {
    const outstanding = await db.select().from(sharedExpenseParticipantsTable).where(and(
      eq(sharedExpenseParticipantsTable.status, "outstanding"),
      eq(sharedExpenseParticipantsTable.isPayer, "false"),
    ));
    const expenseById = new Map(myPayerExpenses.map((e) => [e.id, e]));
    for (const p of outstanding) {
      const e = expenseById.get(p.sharedExpenseId);
      if (!e) continue;
      const gbp = await toBase(parseFloat(p.shareAmount), e.currency, baseCurrency);
      if (gbp === null) { fxFailures += 1; continue; }
      owedToMeTotal += gbp;
      if (gbp > owedToMeLargest) owedToMeLargest = gbp;
      owedToMePeople.add(`participant:${p.id}`);
    }
  }

  return {
    owedToMeTotal,
    owedToMePeople: owedToMePeople.size,
    owedToMeLargest,
    iOweTotal,
    iOwePeople: iOwePeople.size,
    iOweLargest,
    fxFailures,
  };
}

function renderDebts(d: DebtsSummary, baseCurrency: string): string {
  if (d.owedToMePeople === 0 && d.iOwePeople === 0) {
    return "Debts / IOUs\n  none outstanding";
  }
  const lines: string[] = ["Debts / IOUs"];
  if (d.owedToMePeople > 0) {
    lines.push(
      `  Owed to me: ${formatMoney(d.owedToMeTotal, baseCurrency)} across ${d.owedToMePeople} person${d.owedToMePeople === 1 ? "" : "s"}` +
      ` (largest ${formatMoney(d.owedToMeLargest, baseCurrency)})`,
    );
  }
  if (d.iOwePeople > 0) {
    lines.push(
      `  I owe:      ${formatMoney(d.iOweTotal, baseCurrency)} across ${d.iOwePeople} person${d.iOwePeople === 1 ? "" : "s"}` +
      ` (largest ${formatMoney(d.iOweLargest, baseCurrency)})`,
    );
  }
  const net = d.owedToMeTotal - d.iOweTotal;
  lines.push(`  Net:        ${net >= 0 ? "+" : "−"}${formatMoney(Math.abs(net), baseCurrency)}`);
  if (d.fxFailures > 0) lines.push(`  (${d.fxFailures} debt(s) not counted — FX unavailable)`);
  return lines.join("\n");
}

// ── Upcoming summary ────────────────────────────────────────────────────

interface UpcomingSummary { committedOutBase: number; expectedInBase: number; itemCount: number; fxFailures: number }

async function computeUpcomingSummary(
  upcoming: Array<typeof upcomingTable.$inferSelect>,
  baseCurrency: string,
): Promise<UpcomingSummary> {
  let committedOutBase = 0, expectedInBase = 0, fxFailures = 0;
  for (const u of upcoming) {
    const gbp = await toBase(parseFloat(u.nativeAmount), u.currency, baseCurrency);
    if (gbp === null) { fxFailures += 1; continue; }
    if (u.type === "expense") committedOutBase += gbp;
    else if (u.type === "income") expectedInBase += gbp;
  }
  return { committedOutBase, expectedInBase, itemCount: upcoming.length, fxFailures };
}

function renderUpcoming(u: UpcomingSummary, baseCurrency: string): string {
  if (u.itemCount === 0) return "Upcoming (next 30 days)\n  none scheduled";
  return [
    "Upcoming (next 30 days)",
    `  Committed out: ${formatMoney(u.committedOutBase, baseCurrency)}`,
    `  Expected in:   ${formatMoney(u.expectedInBase, baseCurrency)}`,
    ...(u.fxFailures > 0 ? [`  (${u.fxFailures} item(s) not counted — FX unavailable)`] : []),
  ].join("\n");
}

// ── Subscriptions (aggregate only) ──────────────────────────────────────

async function renderSubscriptions(
  subs: Array<typeof subscriptionsTable.$inferSelect>,
  baseCurrency: string,
): Promise<string> {
  if (subs.length === 0) return "Active subscriptions\n  none";
  let monthlyBase = 0;
  let fxFailures = 0;
  for (const s of subs) {
    const monthlyNative = normaliseToMonthly(parseFloat(s.amount), s.frequency);
    const gbp = await toBase(monthlyNative, s.currency, baseCurrency);
    if (gbp === null) fxFailures += 1;
    else monthlyBase += gbp;
  }
  const tail = fxFailures > 0 ? `  (${fxFailures} not converted — FX unavailable)` : "";
  return `Active subscriptions\n  ${subs.length} total · ~${formatMoney(monthlyBase, baseCurrency)}/mo${tail}`;
}

// Convert a subscription's charge to a monthly equivalent for aggregate
// reporting. Weekly → *4.33, quarterly → /3, yearly → /12. Everything
// else falls to monthly (the schema default).
function normaliseToMonthly(amount: number, frequency: string): number {
  switch (frequency) {
    case "weekly": return amount * 4.33;
    case "quarterly": return amount / 3;
    case "yearly": return amount / 12;
    case "monthly":
    default:
      return amount;
  }
}

// ── Chat context — full picture ────────────────────────────────────────

const PAGE_LABELS: Record<string, string> = {
  "/":              "Dashboard",
  "/accounts":      "Accounts",
  "/transactions":  "Transactions",
  "/budget":        "Budget",
  "/goals":         "Goals",
  "/owing":         "Debts / IOUs",
  "/investments":   "Investments",
  "/net-worth":     "Net worth",
  "/subscriptions": "Subscriptions",
  "/calendar":      "Calendar",
  "/analytics":     "Analytics",
  "/health-score":  "Health score",
  "/tax":           "Tax",
  "/learn":         "Learn",
  "/settings":      "Settings",
};

// Loaded rows the pure assembler needs. Isolating the DB-touching wrapper
// from the assembly makes assembleChatContext directly testable with
// hand-built fixtures — no db mocks needed for the leak-scan and null
// invariants to run.
export interface ChatContextRaw {
  baseCurrency: string;
  accounts: Array<typeof accountsTable.$inferSelect>;
  investments: Array<typeof investmentsTable.$inferSelect>;
  budgets: Array<typeof budgetsTable.$inferSelect>;
  monthTxs: Array<typeof transactionsTable.$inferSelect>;
  upcoming: Array<typeof upcomingTable.$inferSelect>;
  goals: Array<typeof goalsTable.$inferSelect>;
  subscriptions: Array<typeof subscriptionsTable.$inferSelect>;
  // Pre-computed debts summary — computeDebtsSummary needs its own DB
  // queries and belongs in the loader, not the assembler.
  debts: DebtsSummary;
  path?: string;
}

export async function assembleChatContext(raw: ChatContextRaw): Promise<AiContext> {
  const generatedAt = new Date().toISOString();
  const [np, month, categoryRollup, currencyExposure, upcomingSummary, subsSection] = await Promise.all([
    computeNetPosition(raw.accounts, raw.investments, raw.baseCurrency),
    computeMonthTotals(raw.monthTxs, raw.baseCurrency),
    computeCategoryRollup(raw.monthTxs, raw.baseCurrency),
    buildCurrencyExposure(raw.accounts, raw.upcoming, raw.baseCurrency),
    computeUpcomingSummary(raw.upcoming, raw.baseCurrency),
    renderSubscriptions(raw.subscriptions, raw.baseCurrency),
  ]);
  const budgetProgress = computeBudgetProgress(raw.budgets, categoryRollup);

  const pageLabel = raw.path && PAGE_LABELS[raw.path] ? PAGE_LABELS[raw.path] : (raw.path ?? "(unknown)");
  const header = [
    `User portfolio summary (generated ${generatedAt}).`,
    `Base currency: ${raw.baseCurrency}. Currently viewing: ${pageLabel}.`,
    `Figures are computed from the user's own data at this moment. Values marked "unknown" could not be computed (usually FX or a live quote); do not guess them.`,
  ].join("\n");

  // Priority: lower = kept first. Order matches L4's fixed drop order.
  const sections: Section[] = [
    { name: "net-position",      priority: 10, content: renderNetPosition(np, raw.baseCurrency) },
    { name: "this-month",        priority: 20, content: renderMonth(month, raw.baseCurrency) },
    { name: "currency-exposure", priority: 30, content: renderCurrencyExposure(currencyExposure, raw.baseCurrency) },
    { name: "budgets",           priority: 40, content: renderBudgets(budgetProgress, raw.baseCurrency) },
    { name: "goals",             priority: 50, content: renderGoals(raw.goals, raw.baseCurrency) },
    { name: "debts",             priority: 60, content: renderDebts(raw.debts, raw.baseCurrency) },
    { name: "upcoming",          priority: 70, content: renderUpcoming(upcomingSummary, raw.baseCurrency) },
    { name: "top-categories",    priority: 80, content: renderTopCategories(categoryRollup, raw.baseCurrency) },
    { name: "subscriptions",     priority: 90, content: subsSection },
  ];

  return assemble(header, sections, generatedAt);
}

export async function buildChatContext(userId: string, path?: string): Promise<AiContext> {
  // Base currency first (needed by computeDebtsSummary + toBase calls in
  // the assembler). One extra await for one small query — negligible.
  const baseCurrency = await getBaseCurrency(userId);
  const [accounts, investments, budgets, monthTxs, upcoming, goals, subscriptions, debts] = await Promise.all([
    db.select().from(accountsTable).where(eq(accountsTable.userId, userId)),
    db.select().from(investmentsTable).where(eq(investmentsTable.userId, userId)),
    db.select().from(budgetsTable).where(eq(budgetsTable.userId, userId)),
    loadCurrentMonthTxs(userId),
    loadUpcoming30d(userId),
    db.select().from(goalsTable).where(eq(goalsTable.userId, userId)),
    db.select().from(subscriptionsTable).where(and(
      eq(subscriptionsTable.userId, userId),
      eq(subscriptionsTable.active, true),
    )),
    computeDebtsSummary(userId, baseCurrency),
  ]);
  return assembleChatContext({
    baseCurrency, accounts, investments, budgets, monthTxs, upcoming, goals, subscriptions, debts, path,
  });
}

// ── Categorize context — user's category list, nothing else ─────────────
// L5 in action: this call goes to the small/fast categorize model, gets
// invoked in batches of up to 200 transactions, and needs the user's
// category vocabulary — NOT their balances. Sending finances here
// would waste quota and widen the leak surface for no benefit.

export async function buildCategorizeContext(userId: string): Promise<AiContext> {
  const generatedAt = new Date().toISOString();
  // 90d window on categories the user has actually used, plus every
  // budget category (so brand-new categories the user set a budget for
  // but hasn't spent in yet still appear as a suggestion target).
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const [usedCategories, budgets] = await Promise.all([
    db.selectDistinct({ category: transactionsTable.category }).from(transactionsTable).where(and(
      eq(transactionsTable.userId, userId),
      gte(transactionsTable.date, localDateString(since)),
    )),
    db.select({ category: budgetsTable.category }).from(budgetsTable).where(eq(budgetsTable.userId, userId)),
  ]);
  const set = new Set<string>();
  for (const r of usedCategories) if (r.category) set.add(r.category);
  for (const r of budgets) if (r.category) set.add(r.category);
  const sorted = Array.from(set).sort();
  const header = `User category vocabulary (generated ${generatedAt}). Prefer categories from this list when categorising. Add new only if none fit.`;
  const list = sorted.length === 0
    ? "  (no categories yet — user is new)"
    : sorted.map((c) => `  · ${c}`).join("\n");
  const text = `${header}\n\nCategories:\n${list}`;
  return { text, sectionsDropped: [], generatedAt };
}

// ── Receipt-scan context — base currency + category list ───────────────
// The receipt-scan call takes one image and returns { merchant, amount,
// date, category, currency }. It benefits from knowing the user's
// preferred currency (so a receipt in a foreign currency is flagged
// rather than assumed) and their category vocabulary (so the returned
// category matches an existing one). Nothing else.

export async function buildReceiptScanContext(userId: string): Promise<AiContext> {
  const generatedAt = new Date().toISOString();
  const [baseCurrency, categoryCtx] = await Promise.all([
    getBaseCurrency(userId),
    buildCategorizeContext(userId),
  ]);
  const text = `${categoryCtx.text}\n\nUser's base currency: ${baseCurrency}. If the receipt is in a different currency, keep the original currency in the "currency" field — do not convert.`;
  return { text, sectionsDropped: [], generatedAt };
}
